'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package, ShoppingCart, AlertTriangle, TrendingUp,
  MessageSquare, RefreshCw, ChevronLeft, ChevronRight,
  ClipboardList,
} from 'lucide-react'
import {
  loadOrders, loadShippedOrders, loadInvoiceQueue,
  dashboardAmountForMergedRow,
} from '@/lib/orders'
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboard-sync'
import type { Order, ShippedOrder } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import { DEFAULT_EXCHANGE_RATE, unitToOrderKrw } from '@/app/purchase/_shared'

/* ── 헬퍼 ─────────────────────────────────────────────────── */
interface CachedOption { name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
interface CachedProduct { id: string; code?: string; name?: string; status?: string; options: CachedOption[]; cost_price?: number; cost_currency?: string }
interface CsItem { id: string; status?: string; created_at?: string; [k: string]: unknown }
interface PurchaseItem { product_code?: string; ordered: number; received: number }
interface Purchase { id: string; order_date: string; status: string; items: PurchaseItem[] }

function loadCachedProducts(): CachedProduct[] {
  try { const { data } = JSON.parse(localStorage.getItem('pm_products_cache_v1') ?? '{}'); return Array.isArray(data) ? data : [] } catch { return [] }
}
function loadCsItems(): CsItem[] {
  try { return JSON.parse(localStorage.getItem('pm_cs_v1') ?? '[]') ?? [] } catch { return [] }
}
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
}
function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function fmtMoney(v: number) {
  if (v >= 10000000) return `${Math.round(v/10000000)}천만`
  if (v >= 10000)    return `${Math.round(v/10000)}만`
  return `${Math.round(v).toLocaleString()}`
}

/* ── 선 그래프 ────────────────────────────────────────────── */
interface ChartPoint { day: number; count: number; amount: number }

function LineChart({ data }: { data: ChartPoint[] }) {
  const [tipIdx, setTipIdx]   = useState<number | null>(null)
  const [size,   setSize]     = useState({ w: 460, h: 140 })
  const containerRef          = useRef<HTMLDivElement>(null)

  // 컨테이너 크기 측정 → SVG viewBox를 실제 픽셀에 맞춤 (화면 크기 무관하게 고정 비율)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 10 && height > 10) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const W = size.w; const H = size.h
  // 폰트 크기는 실제 px 기준 (viewBox = 실제 크기이므로 그대로 적용)
  const fs    = Math.min(11, Math.max(8, H * 0.09))
  const padL  = Math.round(fs * 4.5)
  const padR  = Math.round(fs * 4.8)
  const padT  = 12; const padB = Math.round(fs * 1.9)
  const cW    = W - padL - padR
  const cH    = H - padT - padB

  const maxCnt = Math.max(...data.map(d => d.count), 1)
  const maxAmt = Math.max(...data.map(d => d.amount), 1)
  const cols   = data.length

  const xPos = (i: number) => cols <= 1 ? padL + cW / 2 : padL + (i / (cols - 1)) * cW
  const yCnt = (v: number) => padT + cH - (v / maxCnt) * cH
  const yAmt = (v: number) => padT + cH - (v / maxAmt) * cH

  const cntPath = data.map((d, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yCnt(d.count).toFixed(1)}`).join(' ')
  const amtPath = data.map((d, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yAmt(d.amount).toFixed(1)}`).join(' ')
  const cntFill = cntPath + ` L${xPos(cols-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`
  const amtFill = amtPath + ` L${xPos(cols-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    let nearest = 0; let minDist = Infinity
    data.forEach((_, i) => { const d = Math.abs(xPos(i) - mx); if (d < minDist) { minDist = d; nearest = i } })
    setTipIdx(nearest)
  }

  const tip      = tipIdx !== null ? data[tipIdx] : null
  const tipX     = tipIdx !== null ? xPos(tipIdx) : 0
  const tipXPct  = tipX / W * 100
  const dotR     = Math.max(1.5, H * 0.013)
  const dotRHov  = dotR + 1.5
  const sw       = Math.max(0.8, H * 0.008)   // 주문수 선 두께 - 얇게
  const swAmt    = Math.max(0.6, H * 0.006)   // 매출 선 두께 - 얇게

  return (
    <div ref={containerRef} style={{ position:'relative', width:'100%', height:'100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height="100%"
        style={{ display:'block', overflow:'visible', cursor:'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTipIdx(null)}
      >
        <defs>
          <linearGradient id="amtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cntGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* 그리드 (0%, 25%, 50%, 75%, 100%) */}
        {[0, 0.25, 0.5, 0.75, 1].map(r => (
          <line key={r}
            x1={padL} y1={padT + cH*(1-r)} x2={W-padR} y2={padT + cH*(1-r)}
            stroke={r===0 ? '#cbd5e1' : '#f1f5f9'}
            strokeWidth={r===0 ? 1 : 0.7}
          />
        ))}

        {/* 면적 */}
        <path d={amtFill} fill="url(#amtGrad)" />
        <path d={cntFill} fill="url(#cntGrad)" />

        {/* 매출: 보라 점선 */}
        <path d={amtPath} fill="none" stroke="#a78bfa" strokeWidth={swAmt}
          strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${sw*3} ${sw*2}`} />
        {/* 주문수: 파란 실선 */}
        <path d={cntPath} fill="none" stroke="#3b82f6" strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* 데이터 포인트 */}
        {data.map((d, i) => d.count > 0 && (
          <circle key={`c${i}`} cx={xPos(i)} cy={yCnt(d.count)}
            r={tipIdx===i ? dotRHov : dotR}
            fill="#3b82f6" stroke="#fff" strokeWidth={tipIdx===i ? 1.5 : 0.8} />
        ))}
        {data.map((d, i) => d.amount > 0 && (
          <circle key={`a${i}`} cx={xPos(i)} cy={yAmt(d.amount)}
            r={tipIdx===i ? dotRHov-1 : dotR-0.5}
            fill="#a78bfa" stroke="#fff" strokeWidth={tipIdx===i ? 1.5 : 0.8} />
        ))}

        {/* 호버 수직선 */}
        {tipIdx !== null && (
          <line x1={tipX} y1={padT} x2={tipX} y2={padT+cH}
            stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 2" opacity={0.6} />
        )}

        {/* X축 날짜 레이블 */}
        {data.map((d, i) => (d.day === 1 || d.day % 5 === 0) && (
          <text key={i} x={xPos(i)} y={H - padB*0.15} textAnchor="middle"
            fontSize={fs * 0.82} fill="#94a3b8" fontWeight={500}>{d.day}</text>
        ))}

        {/* 왼쪽 Y축 (주문수) */}
        <text x={padL-3} y={padT+fs*0.9}    textAnchor="end" fontSize={fs} fill="#3b82f6" fontWeight={700}>{maxCnt}</text>
        <text x={padL-3} y={padT+cH*0.5+fs*0.4} textAnchor="end" fontSize={fs*0.82} fill="#3b82f6" opacity={0.55}>{Math.round(maxCnt/2)}</text>
        <text x={padL-3} y={padT+cH+fs*0.4} textAnchor="end" fontSize={fs*0.82} fill="#3b82f6" opacity={0.4}>0</text>
        <text x={padL-3} y={padT-2}          textAnchor="end" fontSize={fs*0.78} fill="#3b82f6" fontWeight={800}>건</text>

        {/* 오른쪽 Y축 (매출) */}
        <text x={W-padR+3} y={padT+fs*0.9}    textAnchor="start" fontSize={fs} fill="#a78bfa" fontWeight={700}>{fmtMoney(maxAmt)}</text>
        <text x={W-padR+3} y={padT+cH*0.5+fs*0.4} textAnchor="start" fontSize={fs*0.82} fill="#a78bfa" opacity={0.55}>{fmtMoney(Math.round(maxAmt/2))}</text>
        <text x={W-padR+3} y={padT+cH+fs*0.4} textAnchor="start" fontSize={fs*0.82} fill="#a78bfa" opacity={0.4}>0</text>
        <text x={W-padR+3} y={padT-2}          textAnchor="start" fontSize={fs*0.78} fill="#a78bfa" fontWeight={800}>원</text>
      </svg>

      {/* 툴팁 */}
      {tip && tipIdx !== null && (
        <div style={{
          position:'absolute', top:'8%', pointerEvents:'none', zIndex:20,
          left: `${tipXPct > 65 ? tipXPct - 16 : tipXPct + 1}%`,
          transform: tipXPct > 65 ? 'translateX(-100%)' : 'none',
          background:'rgba(15,23,42,0.92)', borderRadius:8, padding:'6px 11px',
          boxShadow:'0 4px 16px rgba(0,0,0,0.28)', backdropFilter:'blur(4px)',
        }}>
          <p style={{ fontSize: '9.5px', color:'#94a3b8', fontWeight:700, marginBottom:3 }}>{selMonthLabel(tip.day)}</p>
          <p style={{ fontSize: '11.5px', color:'#93c5fd', fontWeight:800, marginBottom:1 }}>📦 {tip.count}건</p>
          <p style={{ fontSize: '11.5px', color:'#c4b5fd', fontWeight:800 }}>₩{Math.round(tip.amount).toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}

// chart 내부에서 쓰기 위한 전역 ref (월 표시용)
let _selMonthForChart = ''
function selMonthLabel(day: number) {
  const [y, m] = _selMonthForChart.split('-')
  return `${y}.${m}.${String(day).padStart(2,'0')}`
}

/* ── 단일 선 그래프 (가는 선, hover 툴팁) ────────────────── */
interface SimplePoint { day: number; value: number }
function SingleLineChart({ data, color, gradId, formatTip }: {
  data: SimplePoint[]
  color: string
  gradId: string
  formatTip: (v: number) => string
}) {
  const [tipIdx, setTipIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 400, h: 56 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 10 && height > 10) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const W = size.w; const H = size.h
  const padL = 4; const padR = 4; const padT = 3; const padB = 13
  const cW = W - padL - padR; const cH = H - padT - padB
  const maxV = Math.max(...data.map(d => d.value), 1)
  const cols = data.length
  const xPos = (i: number) => cols <= 1 ? padL + cW / 2 : padL + (i / (cols - 1)) * cW
  const yVal = (v: number) => padT + cH - (v / maxV) * cH
  const linePath = data.map((d, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yVal(d.value).toFixed(1)}`).join(' ')
  const fillPath = cols > 0
    ? linePath + ` L${xPos(cols-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`
    : ''
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    let nearest = 0; let minDist = Infinity
    data.forEach((_, i) => { const dx = Math.abs(xPos(i) - mx); if (dx < minDist) { minDist = dx; nearest = i } })
    setTipIdx(nearest)
  }
  const tip = tipIdx !== null ? data[tipIdx] : null
  const tipX = tipIdx !== null ? xPos(tipIdx) : 0
  const tipXPct = W > 0 ? (tipX / W) * 100 : 0
  return (
    <div ref={containerRef} style={{ position:'relative', width:'100%', height:'100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
        style={{ display:'block', overflow:'visible', cursor:'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTipIdx(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <line x1={padL} y1={padT+cH} x2={W-padR} y2={padT+cH} stroke="#f1f5f9" strokeWidth={0.8}/>
        {fillPath && <path d={fillPath} fill={`url(#${gradId})`}/>}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round"/>}
        {tipIdx !== null && (data[tipIdx]?.value ?? 0) > 0 && (
          <circle cx={xPos(tipIdx)} cy={yVal(data[tipIdx].value)} r={2.8} fill={color} stroke="#fff" strokeWidth={1.5}/>
        )}
        {tipIdx !== null && (
          <line x1={tipX} y1={padT} x2={tipX} y2={padT+cH} stroke="#94a3b8" strokeWidth={0.7} strokeDasharray="3 2" opacity={0.5}/>
        )}
        {data.map((d, i) => (d.day === 1 || d.day % 5 === 0) && (
          <text key={i} x={xPos(i)} y={H-1} textAnchor="middle" fontSize={7.5} fill="#cbd5e1">{d.day}</text>
        ))}
      </svg>
      {tip && tipIdx !== null && (
        <div style={{
          position:'absolute', top:'5%', pointerEvents:'none', zIndex:20,
          left:`${tipXPct > 70 ? tipXPct - 14 : tipXPct + 1}%`,
          transform: tipXPct > 70 ? 'translateX(-100%)' : 'none',
          background:'rgba(15,23,42,0.92)', borderRadius:7, padding:'5px 9px',
          boxShadow:'0 2px 12px rgba(0,0,0,0.22)',
        }}>
          <p style={{ fontSize: '9px', color:'#94a3b8', fontWeight:700, marginBottom:2 }}>{selMonthLabel(tip.day)}</p>
          <p style={{ fontSize: '12px', color:'#fff', fontWeight:800 }}>{formatTip(tip.value)}</p>
        </div>
      )}
    </div>
  )
}

/** 최근 3년(36개월) 월별 판매금액 — X축 월, 호버 시 금액 */
interface MonthlyAmtPoint { ym: string; amount: number }

function MonthlySales3YChart({ data }: { data: MonthlyAmtPoint[] }) {
  const [tipIdx, setTipIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 560, h: 120 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 10 && height > 10) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const W = size.w
  const H = size.h
  const padL = 36
  const padR = 10
  const padT = 10
  const padB = 20
  const cW = W - padL - padR
  const cH = H - padT - padB
  const maxV = Math.max(...data.map(d => d.amount), 1)
  const cols = data.length
  const xPos = (i: number) => (cols <= 1 ? padL + cW / 2 : padL + (i / Math.max(cols - 1, 1)) * cW)
  const yVal = (v: number) => padT + cH - (v / maxV) * cH
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yVal(d.amount).toFixed(1)}`).join(' ')
  const fillPath =
    cols > 0
      ? `${linePath} L${xPos(cols - 1).toFixed(1)},${(padT + cH).toFixed(1)} L${padL},${(padT + cH).toFixed(1)} Z`
      : ''

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    let nearest = 0
    let minD = Infinity
    data.forEach((_, i) => {
      const d = Math.abs(xPos(i) - mx)
      if (d < minD) {
        minD = d
        nearest = i
      }
    })
    setTipIdx(nearest)
  }

  const tip = tipIdx !== null ? data[tipIdx] : null
  const tipX = tipIdx !== null ? xPos(tipIdx) : 0
  const tipXPct = W > 0 ? (tipX / W) * 100 : 0
  const color = '#7c3aed'

  const ymTitle = (ym: string) => {
    const [y, m] = ym.split('-')
    return `${y}년 ${Number(m)}월`
  }

  const xTickLabel = (ym: string) => {
    const [, m] = ym.split('-')
    return `${Number(m)}월`
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 96 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setTipIdx(null)}
      >
        <defs>
          <linearGradient id="dash-3y-amt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={padL} y1={padT + cH} x2={W - padR} y2={padT + cH} stroke="#e2e8f0" strokeWidth={0.9} />
        {fillPath ? <path d={fillPath} fill="url(#dash-3y-amt)" /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {tipIdx !== null && data[tipIdx] ? (
          <>
            <line
              x1={xPos(tipIdx)}
              y1={padT}
              x2={xPos(tipIdx)}
              y2={padT + cH}
              stroke="#94a3b8"
              strokeWidth={0.8}
              strokeDasharray="3 2"
              opacity={0.65}
            />
            <circle
              cx={xPos(tipIdx)}
              cy={yVal(data[tipIdx].amount)}
              r={3.2}
              fill={color}
              stroke="#fff"
              strokeWidth={1.6}
            />
          </>
        ) : null}
        {/* 1월만 연도 표시, 그 외는 격월 숫자만 (겹침 완화) */}
        {data.map((d, i) => {
          const m = Number(d.ym.split('-')[1])
          const show = m === 1 || i === 0 || i === data.length - 1 || i % 3 === 0
          if (!show) return null
          return (
            <text
              key={d.ym}
              x={xPos(i)}
              y={H - 4}
              textAnchor="middle"
              fontSize={7.2}
              fill="#94a3b8"
              fontWeight={600}
            >
              {m === 1 ? `${d.ym.slice(2, 4)}년` : xTickLabel(d.ym)}
            </text>
          )
        })}
        <text x={padL - 4} y={padT + 5} textAnchor="end" fontSize={8} fill={color} fontWeight={700}>
          {fmtMoney(maxV)}
        </text>
        <text x={padL - 4} y={padT + cH} textAnchor="end" fontSize={7.5} fill="#cbd5e1" fontWeight={600}>
          0
        </text>
      </svg>
      {tip && tipIdx !== null && (
        <div
          style={{
            position: 'absolute',
            top: '6%',
            pointerEvents: 'none',
            zIndex: 20,
            left: `${tipXPct > 72 ? tipXPct - 18 : tipXPct + 1}%`,
            transform: tipXPct > 72 ? 'translateX(-100%)' : 'none',
            background: 'rgba(15,23,42,0.92)',
            borderRadius: 8,
            padding: '7px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
          }}
        >
          <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{ymTitle(tip.ym)}</p>
          <p style={{ fontSize: '13px', color: '#c4b5fd', fontWeight: 800 }}>₩{Math.round(tip.amount).toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}

/* ── 대시보드 ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const today    = getToday()
  const curYM    = getCurYM()
  const pathname = usePathname()

  const [orders,        setOrders]        = useState<Order[]>([])
  const [shipped,       setShipped]       = useState<ShippedOrder[]>([])
  const [invoiceQueue,  setInvoiceQueue]  = useState<Order[]>([])
  const [products,      setProducts]      = useState<CachedProduct[]>([])
  const [csItems,       setCsItems]       = useState<CsItem[]>([])
  const [purchases,     setPurchases]     = useState<Purchase[]>([])
  const [loading,       setLoading]       = useState(true)
  const [selMonth,      setSelMonth]      = useState(curYM)
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null)
  const [refreshing,    setRefreshing]    = useState(false)

  _selMonthForChart = selMonth

  /* ── localStorage 데이터 즉시 갱신 ── */
  const refreshLocal = useCallback(() => {
    setOrders(loadOrders())
    setShipped(loadShippedOrders())
    setInvoiceQueue(loadInvoiceQueue())
    setProducts(loadCachedProducts())
    setCsItems(loadCsItems())
    setLastUpdate(new Date())
  }, [])

  /* ── 발주 Supabase 로드 ── */
  const refreshPurchases = useCallback(() => {
    supabase.from('pm_purchases').select('id,order_date,status,items')
      .then(({ data }) => { if (data) setPurchases(data as Purchase[]) })
  }, [])

  /* ── 로컬 + 발주 전부 (실시간 대시보드 기준) ── */
  const fullRefresh = useCallback(() => {
    refreshLocal()
    refreshPurchases()
  }, [refreshLocal, refreshPurchases])

  /* ── 전체 새로고침 (버튼용) ── */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    fullRefresh()
    setTimeout(() => setRefreshing(false), 600)
  }, [fullRefresh])

  /* ── 초기 로드 ── */
  useEffect(() => {
    fullRefresh()
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── SPA 내비게이션으로 대시보드 진입 시마다 갱신 ── */
  useEffect(() => {
    if (!loading) fullRefresh()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 실시간: storage(다른 탭) · 커스텀 이벤트(같은 탭) · visibility · focus ── */
  useEffect(() => {
    const WATCH_KEYS = new Set([
      'pm_orders_v1', 'pm_shipped_orders_v1', 'pm_invoice_queue_v1',
      'pm_products_cache_v1', 'pm_cs_v1',
      'pm_dashboard_refresh_ts', 'pm_products_cache_sync', 'pm_products_mapping_signal',
    ])
    const onStorage = (e: StorageEvent) => {
      if (e.key && WATCH_KEYS.has(e.key)) fullRefresh()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') fullRefresh()
    }
    const onFocus = () => fullRefresh()
    const onCustomRefresh = () => fullRefresh()

    window.addEventListener('storage', onStorage)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onCustomRefresh)
    window.addEventListener('pm_products_cache_sync', onCustomRefresh)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onCustomRefresh)
      window.removeEventListener('pm_products_cache_sync', onCustomRefresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [fullRefresh])

  /* ── 15초 폴링 (탭이 보일 때, 발주 포함 전체) ── */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fullRefresh()
    }, 15_000)
    return () => clearInterval(id)
  }, [fullRefresh])

  /* ── 세 저장소 중복 제거 합산 (KPI·차트 공통 기준) ── */
  const allOrdersMerged = useMemo(() => {
    const seen = new Set<string>()
    const result: (Order | ShippedOrder)[] = []
    for (const o of [...orders, ...invoiceQueue, ...shipped]) {
      if (!seen.has(o.id)) { seen.add(o.id); result.push(o) }
    }
    return result
  }, [orders, invoiceQueue, shipped])

  const shippedById = useMemo(() => new Map(shipped.map(o => [o.id, o])), [shipped])

  /* ── KPI ── */
  const todayOrders  = useMemo(() => orders.filter(o => o.order_date === today), [orders, today])
  const monthRevenue = useMemo(() =>
    allOrdersMerged
      .filter(o => o.order_date?.slice(0,7) === curYM && o.status !== 'cancelled')
      .reduce((s, o) => s + dashboardAmountForMergedRow(o, shippedById), 0),
  [allOrdersMerged, shippedById, curYM])

  const lowStock = useMemo(() => products
    .filter(p => p.status !== 'pending_delete')
    .flatMap(p => p.options.filter(o => {
      const s = o.current_stock ?? Math.max(0,(o.received??0)-(o.sold??0))
      return s > 0 && s <= 3
    }).map(o => ({ pName: p.name??'', oName: o.name??'', stock: o.current_stock ?? Math.max(0,(o.received??0)-(o.sold??0)) })))
  , [products])

  const soldOut = useMemo(() => products
    .filter(p => p.status !== 'pending_delete')
    .flatMap(p => p.options.filter(o => {
      const s = o.current_stock ?? Math.max(0,(o.received??0)-(o.sold??0))
      return s === 0
    }).map(o => ({ pName: p.name??'', oName: o.name??'' })))
    .slice(0, 5)
  , [products])

  /* ── 발주/입고/미입고 ── */
  const purchaseStats = useMemo(() => {
    // 이번달 발주 수량 합계
    const monthOrdered = purchases
      .filter(p => p.order_date?.slice(0,7) === curYM)
      .reduce((s, p) => s + p.items.reduce((ss, i) => ss + (i.ordered || 0), 0), 0)
    // 이번달 입고 수량 합계 (이번달 발주 중 received)
    const monthReceived = purchases
      .filter(p => p.order_date?.slice(0,7) === curYM)
      .reduce((s, p) => s + p.items.reduce((ss, i) => ss + (i.received || 0), 0), 0)
    // 미입고: 전체 미완료 발주의 미입고 수량 (월 무관 누적)
    const unresolved = purchases
      .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
      .reduce((s, p) => s + p.items.reduce((ss, i) => ss + Math.max(0, (i.ordered||0) - (i.received||0)), 0), 0)
    return { ordered: monthOrdered, received: monthReceived, unresolved }
  }, [purchases, curYM])

  /* ── 월별 차트 데이터
       pm_orders_v1 + pm_invoice_queue_v1 + pm_shipped_orders_v1 를 합산
       (주문이 어느 단계에 있든 order_date 기준으로 집계) ── */
  const chartData = useMemo(() => {
    const days = daysInMonth(selMonth)
    const mo = allOrdersMerged.filter(
      o => o.order_date?.slice(0,7) === selMonth && o.status !== 'cancelled'
    )
    return Array.from({ length: days }, (_, i) => {
      const day  = i + 1
      const date = `${selMonth}-${String(day).padStart(2,'0')}`
      const dayO = mo.filter(o => o.order_date === date)
      return { day, count: dayO.length, amount: dayO.reduce((s, o) => s + dashboardAmountForMergedRow(o, shippedById), 0) }
    })
  }, [allOrdersMerged, shippedById, selMonth])

  const monthTotal  = useMemo(() => chartData.reduce((s,d) => s+d.count, 0), [chartData])
  const monthRevSel = useMemo(() => chartData.reduce((s,d) => s+d.amount, 0), [chartData])

  /** 최근 36개월(3년) 월별 판매금액 — 당월(curYM)까지 */
  const monthlySales3y = useMemo((): MonthlyAmtPoint[] => {
    const keys: string[] = []
    for (let i = 35; i >= 0; i--) keys.push(shiftMonth(curYM, -i))
    const byMonth: Record<string, number> = {}
    for (const o of allOrdersMerged) {
      if (o.status === 'cancelled') continue
      const ym = o.order_date?.slice(0, 7)
      if (!ym) continue
      byMonth[ym] = (byMonth[ym] ?? 0) + dashboardAmountForMergedRow(o, shippedById)
    }
    return keys.map(ym => ({ ym, amount: byMonth[ym] ?? 0 }))
  }, [allOrdersMerged, shippedById, curYM])

  /* ── 선택 월 매입액: 발주관리 탭과 동일 — 발주 확정분(취소 제외) 상품 금액 합, unitToOrderKrw·pm_exchange_rate ── */
  const monthPurchaseCost = useMemo(() => {
    let exchangeRate = DEFAULT_EXCHANGE_RATE
    try {
      exchangeRate = Number(localStorage.getItem('pm_exchange_rate') || String(DEFAULT_EXCHANGE_RATE)) || DEFAULT_EXCHANGE_RATE
    } catch { /* ignore */ }
    return purchases
      .filter(p => p.order_date?.slice(0, 7) === selMonth && p.status !== 'cancelled')
      .reduce((sum, p) => sum + p.items.reduce((is, item) => {
        if (!item.product_code) return is
        const prod = products.find(pp => pp.code === item.product_code)
        if (prod?.cost_price == null) return is
        const unitKrw = unitToOrderKrw(prod.cost_price, prod.cost_currency || '원', exchangeRate)
        return is + unitKrw * item.ordered
      }, 0), 0)
  }, [purchases, products, selMonth, lastUpdate])

  /* ── 당월 택배비 (고유 운송장번호 × 2800원) ── */
  const monthShippingFee = useMemo(() => {
    const uniq = new Set(
      shipped
        .filter(o => (o.shipped_at ?? o.order_date)?.slice(0,7) === selMonth && o.tracking_number)
        .map(o => o.tracking_number!)
    )
    return uniq.size * 2800
  }, [shipped, selMonth])

  /* ── 당월 순이익 ── */
  const monthProfit = useMemo(
    () => monthRevSel - monthPurchaseCost - monthShippingFee,
    [monthRevSel, monthPurchaseCost, monthShippingFee]
  )

  /* ── 쇼핑몰별 판매건수 ── */
  const mallSales = useMemo(() => {
    const map: Record<string, number> = {}
    allOrdersMerged
      .filter(o => o.order_date?.slice(0,7) === selMonth && o.status !== 'cancelled')
      .forEach(o => {
        const ch = (o as unknown as { channel?: string; import_source?: string }).channel
               || (o as unknown as { import_source?: string }).import_source
               || '기타'
        map[ch] = (map[ch] || 0) + 1
      })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [allOrdersMerged, selMonth])

  /* ── CS ── */
  const openCs = useMemo(() => csItems.filter(c => c.status !== 'resolved' && c.status !== 'closed'), [csItems])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <RefreshCw size={22} style={{ animation:'spin 1s linear infinite', color:'#94a3b8' }} />
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%', overflow:'hidden' }}>

      {/* ── KPI (5열) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, flexShrink:0 }}>
        {[
          { title:'전체 상품',   value: products.length?`${products.length}개`:'0',       sub:`재고부족 ${lowStock.length} · 품절 ${soldOut.length}`,                                                                      icon:Package,       bg:'#eff6ff', ic:'#2563eb', href:'/products',          fs:18 },
          { title:'오늘 주문',   value: todayOrders.length?`${todayOrders.length}건`:'0',  sub: todayOrders.length?`미처리 ${todayOrders.filter(o=>o.status==='pending'||o.status==='confirmed').length}건`:'주문없음',    icon:ShoppingCart,  bg:'#ecfdf5', ic:'#059669', href:'/product-transfer',  fs:18 },
          { title:'재고 부족',   value: lowStock.length?`${lowStock.length}개`:'0',         sub: lowStock.length?'3개 이하 옵션':'재고 정상',                                                                                icon:AlertTriangle, bg:'#fffbeb', ic:'#d97706', href:'/inventory',         fs:18 },
          { title:'이번달 매출', value: monthRevenue>0?`₩${Math.round(monthRevenue).toLocaleString()}`:'₩0', sub:`${curYM.replace('-','년 ')}월`,                                                                                      icon:TrendingUp,    bg:'#f5f3ff', ic:'#7c3aed', href:'/product-transfer',  fs:21 },
        ].map(s => (
          <Link key={s.title} href={s.href} style={{ textDecoration:'none' }}>
            <div className="pm-card" style={{ padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:34,height:34,borderRadius:10,background:s.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <s.icon size={16} color={s.ic} strokeWidth={2} />
              </div>
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize: '9.5px',fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.04em' }}>{s.title}</p>
                <p style={{ fontSize:s.fs,fontWeight:900,color:'#0f172a',lineHeight:1.2,wordBreak:'break-all' }}>{s.value}</p>
                <p style={{ fontSize: '9.5px',color:'#94a3b8',fontWeight:600 }}>{s.sub}</p>
              </div>
            </div>
          </Link>
        ))}
        {/* 발주 현황 카드 */}
        <Link href="/purchase" style={{ textDecoration:'none' }}>
          <div className="pm-card" style={{ padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:9 }}>
            <div style={{ width:34,height:34,borderRadius:10,background:'#f0f9ff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
              <ClipboardList size={16} color="#0369a1" strokeWidth={2} />
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize: '9.5px',fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.04em' }}>발주 현황</p>
              <p style={{ fontSize: '18px',fontWeight:900,color:'#0f172a',lineHeight:1.1 }}>{purchaseStats.ordered}<span style={{ fontSize: '11px',fontWeight:700,marginLeft:1 }}>개</span></p>
              <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:1 }}>
                <span style={{ fontSize: '9px',color:'#0369a1',fontWeight:700 }}>입고 {purchaseStats.received}</span>
                <span style={{ color:'#e2e8f0',fontSize: '10px' }}>|</span>
                <span style={{ fontSize: '9px',color:purchaseStats.unresolved>0?'#dc2626':'#94a3b8',fontWeight:700 }}>
                  미입고 {purchaseStats.unresolved}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── 중단: 차트(넓게) + 우측 패널 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'5fr 2fr', gap:10, flex:'1 1 0', minHeight:0 }}>

        {/* 월별 주문 현황 (4줄) */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          {/* 헤더 */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
            <div style={{ width:20,height:20,borderRadius:7,background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
              <ShoppingCart size={10} color="#2563eb" />
            </div>
            <span style={{ fontSize: '12px',fontWeight:800,color:'#0f172a',flexShrink:0 }}>월별 주문 현황</span>
            {lastUpdate && (
              <span style={{ fontSize: '9px', color:'#cbd5e1', fontWeight:600, flexShrink:0 }}>
                {lastUpdate.getHours().toString().padStart(2,'0')}:{lastUpdate.getMinutes().toString().padStart(2,'0')} 기준
              </span>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:'auto' }}>
              <button onClick={handleRefresh} title="새로고침"
                style={{ width:20,height:20,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <RefreshCw size={10} color="#64748b" style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }} />
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button onClick={() => setSelMonth(m => shiftMonth(m,-1))}
                  style={{ width:20,height:20,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <ChevronLeft size={10} />
                </button>
                <span style={{ fontSize: '11px',fontWeight:800,color:'#0f172a',minWidth:56,textAlign:'center' }}>
                  {selMonth.replace('-','년 ')}월
                </span>
                <button onClick={() => setSelMonth(m => shiftMonth(m,1))} disabled={selMonth >= curYM}
                  style={{ width:20,height:20,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:selMonth>=curYM?'not-allowed':'pointer',opacity:selMonth>=curYM?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <ChevronRight size={10} />
                </button>
              </div>
            </div>
          </div>

          {/* 최근 3년 월별 판매금액 (선 그래프) — 선택 월 일별 그래프 위 */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid #f8fafc', padding: '8px 14px 10px' }}>
            <p style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.02em', marginBottom: 6 }}>
              최근 3년간 월별 판매금액
            </p>
            <div style={{ height: 132, width: '100%' }}>
              <MonthlySales3YChart data={monthlySales3y} />
            </div>
          </div>

          {/* ─ 1줄: 판매금액 선그래프 ─ */}
          <div style={{ flex:'1 1 0', minHeight:0, borderBottom:'1px solid #f8fafc', padding:'4px 14px 2px', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <span style={{ fontSize: '12px', fontWeight:800, color:'#7c3aed' }}>● 판매금액</span>
              <span style={{ fontSize: '11px', color:'#94a3b8' }}>
                {selMonth.replace('-','년 ')}월 합계 ₩{Math.round(monthRevSel).toLocaleString()}
              </span>
            </div>
            <div style={{ flex:1, minHeight:0 }}>
              {monthTotal === 0
                ? <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize: '10px', color:'#e2e8f0', fontWeight:600 }}>데이터 없음</span>
                  </div>
                : <SingleLineChart
                    data={chartData.map(d => ({ day:d.day, value:d.amount }))}
                    color="#7c3aed" gradId="dash-amt"
                    formatTip={v => `₩${Math.round(v).toLocaleString()}`}
                  />
              }
            </div>
          </div>

          {/* ─ 2줄: 판매수량 선그래프 ─ */}
          <div style={{ flex:'1 1 0', minHeight:0, borderBottom:'1px solid #f8fafc', padding:'4px 14px 2px', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <span style={{ fontSize: '12px', fontWeight:800, color:'#2563eb' }}>● 판매수량</span>
              <span style={{ fontSize: '11px', color:'#94a3b8' }}>
                {selMonth.replace('-','년 ')}월 합계 {monthTotal}건
              </span>
            </div>
            <div style={{ flex:1, minHeight:0 }}>
              {monthTotal === 0
                ? <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize: '10px', color:'#e2e8f0', fontWeight:600 }}>데이터 없음</span>
                  </div>
                : <SingleLineChart
                    data={chartData.map(d => ({ day:d.day, value:d.count }))}
                    color="#2563eb" gradId="dash-cnt"
                    formatTip={v => `${v}건`}
                  />
              }
            </div>
          </div>

          {/* ─ 3줄: 당월 재무 요약 ─ */}
          <div style={{ flexShrink:0, borderBottom:'1px solid #f8fafc', padding:'6px 14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
              {[
                { label:'매출액',   value:monthRevSel,       color:'#7c3aed', bg:'#f5f3ff', prefix:'₩' },
                { label:'매입액',   value:monthPurchaseCost, color:'#2563eb', bg:'#eff6ff', prefix:'₩' },
                { label:'택배비',   value:monthShippingFee,  color:'#059669', bg:'#f0fdf4', prefix:'₩' },
                { label:'순이익',   value:monthProfit,       color: monthProfit >= 0 ? '#059669' : '#dc2626', bg: monthProfit >= 0 ? '#f0fdf4' : '#fff1f2', prefix:'₩' },
              ].map(b => (
                <div key={b.label} style={{ background:b.bg, borderRadius:8, padding:'8px 11px' }}>
                  <p style={{ fontSize: '13.5px', fontWeight:800, color:'#94a3b8', marginBottom:1 }}>{b.label}</p>
                  <p style={{ fontSize: '18px', fontWeight:900, color:b.color, lineHeight:1, wordBreak:'break-all' }}>
                    {b.prefix}{Math.round(b.value).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ─ 4줄: 쇼핑몰별 판매수량 ─ */}
          <div style={{ flexShrink:0, padding:'5px 14px 6px' }}>
            <p style={{ fontSize: '9.5px', fontWeight:800, color:'#94a3b8', marginBottom:5 }}>쇼핑몰별 판매수량</p>
            {mallSales.length === 0
              ? <span style={{ fontSize: '10px', color:'#e2e8f0' }}>-</span>
              : <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {mallSales.map(([ch, cnt], i) => (
                    <div key={ch} style={{ display:'flex', alignItems:'center', gap:3, borderRadius:6, padding:'3px 8px',
                      background: i === 0 ? '#fef9c3' : i === 1 ? '#f1f5f9' : '#f8fafc',
                      border: `1px solid ${i===0?'#fde047':i===1?'#e2e8f0':'#f1f5f9'}` }}>
                      <span style={{ fontSize: '8.5px' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':''}</span>
                      <span style={{ fontSize: '10px', fontWeight:700, color:'#475569' }}>{ch}</span>
                      <span style={{ fontSize: '11px', fontWeight:900, color: i<3?'#0f172a':'#64748b' }}>{cnt}건</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* 우측: 재고부족 + 품절 + CS (균등 배분) */}
        <div style={{ display:'flex', flexDirection:'column', gap:7, minHeight:0, overflow:'hidden' }}>

          {/* 재고 부족 */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <AlertTriangle size={14} color="#d97706" />
                <span style={{ fontSize: '13.5px',fontWeight:900,color:'#0f172a' }}>재고 부족</span>
                <span style={{ background:lowStock.length>0?'#fef3c7':'#f1f5f9', color:lowStock.length>0?'#d97706':'#94a3b8', fontSize: '11px',fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{lowStock.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize: '11px',fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {lowStock.length === 0
                ? <p style={{ padding:'8px 16px',fontSize: '12px',color:'#94a3b8',fontWeight:600 }}>재고 부족 없음</p>
                : lowStock.slice(0,4).map((item,i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <div style={{ overflow:'hidden',minWidth:0 }}>
                      <p style={{ fontSize: '12.5px',fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                      <p style={{ fontSize: '11px',color:'#94a3b8' }}>{item.oName}</p>
                    </div>
                    <span style={{ fontSize: '20px',fontWeight:900,color:item.stock<=1?'#dc2626':'#d97706',flexShrink:0,marginLeft:10 }}>{item.stock}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* 품절 */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Package size={14} color="#dc2626" />
                <span style={{ fontSize: '13.5px',fontWeight:900,color:'#0f172a' }}>품절</span>
                <span style={{ background:soldOut.length>0?'#fee2e2':'#f1f5f9', color:soldOut.length>0?'#dc2626':'#94a3b8', fontSize: '11px',fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{soldOut.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize: '11px',fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {soldOut.length === 0
                ? <p style={{ padding:'8px 16px',fontSize: '12px',color:'#94a3b8',fontWeight:600 }}>품절 없음</p>
                : soldOut.slice(0,4).map((item,i) => (
                  <div key={i} style={{ padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <p style={{ fontSize: '12.5px',fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                    <p style={{ fontSize: '11px',color:'#94a3b8' }}>{item.oName}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* 미처리 CS */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <MessageSquare size={14} color="#be123c" />
                <span style={{ fontSize: '13.5px',fontWeight:900,color:'#0f172a' }}>미처리 CS</span>
                <span style={{ background:openCs.length>0?'#fee2e2':'#f1f5f9', color:openCs.length>0?'#dc2626':'#94a3b8', fontSize: '11px',fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{openCs.length}</span>
              </div>
              <Link href="/cs-management" style={{ fontSize: '11px',fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {openCs.length === 0
                ? <p style={{ padding:'8px 16px',fontSize: '12px',color:'#94a3b8',fontWeight:600 }}>처리할 CS 없음</p>
                : openCs.slice(0,4).map((c,i) => (
                  <div key={i} style={{ padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <p style={{ fontSize: '12.5px',fontWeight:700,color:'#0f172a' }}>{String(c['customer_name']??c['title']??`CS #${i+1}`)}</p>
                    <p style={{ fontSize: '10.5px',color:'#94a3b8' }}>{c.created_at?.slice(0,10)??''}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
