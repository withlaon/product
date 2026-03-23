'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package, ShoppingCart, AlertTriangle, TrendingUp,
  Truck, MessageSquare, RefreshCw, ChevronLeft, ChevronRight,
  ClipboardList,
} from 'lucide-react'
import { loadOrders, loadShippedOrders, loadInvoiceQueue } from '@/lib/orders'
import type { Order, ShippedOrder } from '@/lib/orders'
import { supabase } from '@/lib/supabase'

/* ── 헬퍼 ─────────────────────────────────────────────────── */
interface CachedOption { name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
interface CachedProduct { id: string; name?: string; status?: string; options: CachedOption[] }
interface CsItem { id: string; status?: string; created_at?: string; [k: string]: unknown }
interface PurchaseItem { ordered: number; received: number }
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
  if (v >= 10000000) return `${(v/10000000).toFixed(1)}천만`
  if (v >= 10000)    return `${Math.round(v/10000)}만`
  return `${v.toLocaleString()}`
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
          <p style={{ fontSize:9.5, color:'#94a3b8', fontWeight:700, marginBottom:3 }}>{selMonthLabel(tip.day)}</p>
          <p style={{ fontSize:11.5, color:'#93c5fd', fontWeight:800, marginBottom:1 }}>📦 {tip.count}건</p>
          <p style={{ fontSize:11.5, color:'#c4b5fd', fontWeight:800 }}>₩{tip.amount.toLocaleString()}</p>
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

  /* ── 전체 새로고침 (버튼용) ── */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    refreshLocal()
    refreshPurchases()
    setTimeout(() => setRefreshing(false), 600)
  }, [refreshLocal, refreshPurchases])

  /* ── 초기 로드 ── */
  useEffect(() => {
    refreshLocal()
    refreshPurchases()
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── SPA 내비게이션으로 대시보드 진입 시마다 갱신 ── */
  useEffect(() => {
    if (!loading) refreshLocal()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 실시간 감지: storage(다른 탭) / visibilitychange / focus ── */
  useEffect(() => {
    const WATCH_KEYS = new Set([
      'pm_orders_v1', 'pm_shipped_orders_v1', 'pm_invoice_queue_v1',
      'pm_products_cache_v1', 'pm_cs_v1',
    ])
    const onStorage = (e: StorageEvent) => {
      if (e.key && WATCH_KEYS.has(e.key)) refreshLocal()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLocal()
    }
    const onFocus = () => refreshLocal()

    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshLocal])

  /* ── 30초 자동 폴링 ── */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshLocal()
    }, 30_000)
    return () => clearInterval(id)
  }, [refreshLocal])

  /* ── KPI ── */
  const todayOrders  = useMemo(() => orders.filter(o => o.order_date === today), [orders, today])
  const monthRevenue = useMemo(() =>
    orders.filter(o => o.order_date?.slice(0,7) === curYM && o.status !== 'cancelled')
          .reduce((s, o) => s + (o.total_amount ?? 0), 0),
  [orders, curYM])

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

  /* ── 배송 현황 ── */
  const needInvoice    = useMemo(() => orders.filter(o => !o.tracking_number && o.status !== 'cancelled' && o.status !== 'delivered').length, [orders])
  const shippingCount  = useMemo(() => orders.filter(o => o.status === 'shipped').length, [orders])
  const deliveredToday = useMemo(() => shipped.filter(o => (o.shipped_at??'').slice(0,10) === today).length, [shipped, today])
  const totalShipped   = useMemo(() => shipped.length, [shipped])

  /* ── 월별 차트 데이터
       pm_orders_v1 + pm_invoice_queue_v1 + pm_shipped_orders_v1 를 합산
       (주문이 어느 단계에 있든 order_date 기준으로 집계) ── */
  const chartData = useMemo(() => {
    const days = daysInMonth(selMonth)
    // 세 저장소를 합쳐 ID 기준 중복 제거
    const seenIds = new Set<string>()
    const allOrders: (Order | ShippedOrder)[] = []
    for (const o of [...orders, ...invoiceQueue, ...shipped]) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id)
        allOrders.push(o)
      }
    }
    const mo = allOrders.filter(
      o => o.order_date?.slice(0,7) === selMonth && o.status !== 'cancelled'
    )
    return Array.from({ length: days }, (_, i) => {
      const day  = i + 1
      const date = `${selMonth}-${String(day).padStart(2,'0')}`
      const dayO = mo.filter(o => o.order_date === date)
      return { day, count: dayO.length, amount: dayO.reduce((s,o) => s+(o.total_amount??0), 0) }
    })
  }, [orders, invoiceQueue, shipped, selMonth])

  const monthTotal  = useMemo(() => chartData.reduce((s,d) => s+d.count, 0), [chartData])
  const monthRevSel = useMemo(() => chartData.reduce((s,d) => s+d.amount, 0), [chartData])

  /* ── CS ── */
  const openCs = useMemo(() => csItems.filter(c => c.status !== 'resolved' && c.status !== 'closed'), [csItems])

  const shippingStats = [
    { label:'송장 미등록', value: needInvoice,   bg:'#fff1f2', color:'#be123c', bar:'#f43f5e' },
    { label:'배송 중',    value: shippingCount,  bg:'#eff6ff', color:'#1d4ed8', bar:'#3b82f6' },
    { label:'오늘 출고',  value: deliveredToday, bg:'#faf5ff', color:'#7e22ce', bar:'#a855f7' },
    { label:'누적 출고',  value: totalShipped,   bg:'#f0fdf4', color:'#15803d', bar:'#22c55e' },
  ]
  const maxShip = Math.max(...shippingStats.map(s => s.value), 1)

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
          { title:'이번달 매출', value: monthRevenue>0?`₩${monthRevenue.toLocaleString()}`:'₩0', sub:`${curYM.replace('-','년 ')}월`,                                                                                      icon:TrendingUp,    bg:'#f5f3ff', ic:'#7c3aed', href:'/product-transfer',  fs:14 },
        ].map(s => (
          <Link key={s.title} href={s.href} style={{ textDecoration:'none' }}>
            <div className="pm-card" style={{ padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:34,height:34,borderRadius:10,background:s.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <s.icon size={16} color={s.ic} strokeWidth={2} />
              </div>
              <div style={{ minWidth:0 }}>
                <p style={{ fontSize:9.5,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.04em' }}>{s.title}</p>
                <p style={{ fontSize:s.fs,fontWeight:900,color:'#0f172a',lineHeight:1.2,wordBreak:'break-all' }}>{s.value}</p>
                <p style={{ fontSize:9.5,color:'#94a3b8',fontWeight:600 }}>{s.sub}</p>
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
              <p style={{ fontSize:9.5,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.04em' }}>발주 현황</p>
              <p style={{ fontSize:18,fontWeight:900,color:'#0f172a',lineHeight:1.1 }}>{purchaseStats.ordered}<span style={{ fontSize:11,fontWeight:700,marginLeft:1 }}>개</span></p>
              <div style={{ display:'flex', gap:6, alignItems:'center', marginTop:1 }}>
                <span style={{ fontSize:9,color:'#0369a1',fontWeight:700 }}>입고 {purchaseStats.received}</span>
                <span style={{ color:'#e2e8f0',fontSize:10 }}>|</span>
                <span style={{ fontSize:9,color:purchaseStats.unresolved>0?'#dc2626':'#94a3b8',fontWeight:700 }}>
                  미입고 {purchaseStats.unresolved}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* ── 중단: 차트(1.5배 가로) + 우측 패널 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:10, flex:'1 1 0', minHeight:0 }}>

        {/* 월별 선 그래프 */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          {/* 헤더 */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
            <div style={{ width:22,height:22,borderRadius:7,background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
              <ShoppingCart size={11} color="#2563eb" />
            </div>
            <span style={{ fontSize:12,fontWeight:800,color:'#0f172a',flexShrink:0 }}>월별 주문 현황</span>
            {/* 범례 */}
            <span style={{ display:'flex',alignItems:'center',gap:3,fontSize:9,color:'#2563eb',fontWeight:700,flexShrink:0 }}>
              <svg width="14" height="4" style={{ display:'inline-block',verticalAlign:'middle' }}>
                <line x1="0" y1="2" x2="14" y2="2" stroke="#2563eb" strokeWidth="1.5"/>
              </svg>주문수
            </span>
            <span style={{ display:'flex',alignItems:'center',gap:3,fontSize:9,color:'#818cf8',fontWeight:700,flexShrink:0 }}>
              <svg width="14" height="4" style={{ display:'inline-block',verticalAlign:'middle' }}>
                <line x1="0" y1="2" x2="14" y2="2" stroke="#818cf8" strokeWidth="1" strokeDasharray="4 2"/>
              </svg>매출
            </span>
            {/* 마지막 업데이트 시간 */}
            {lastUpdate && (
              <span style={{ fontSize:9, color:'#cbd5e1', fontWeight:600, flexShrink:0 }}>
                {lastUpdate.getHours().toString().padStart(2,'0')}:{lastUpdate.getMinutes().toString().padStart(2,'0')}:{lastUpdate.getSeconds().toString().padStart(2,'0')} 기준
              </span>
            )}
            {/* 오른쪽: 새로고침 + 월 네비 + 통계 가로 배치 */}
            <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
              {/* 수동 새로고침 버튼 */}
              <button
                onClick={handleRefresh}
                title="데이터 새로고침"
                style={{ width:22,height:22,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center', flexShrink:0 }}>
                <RefreshCw size={11} color="#64748b" style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }} />
              </button>
              {/* 월 네비 */}
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button onClick={() => setSelMonth(m => shiftMonth(m,-1))}
                  style={{ width:22,height:22,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <ChevronLeft size={11} />
                </button>
                <span style={{ fontSize:11,fontWeight:800,color:'#0f172a',minWidth:62,textAlign:'center' }}>
                  {selMonth.replace('-','년 ')}월
                </span>
                <button onClick={() => setSelMonth(m => shiftMonth(m,1))}
                  disabled={selMonth >= curYM}
                  style={{ width:22,height:22,borderRadius:5,border:'1px solid #e2e8f0',background:'#fff',cursor:selMonth>=curYM?'not-allowed':'pointer',opacity:selMonth>=curYM?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <ChevronRight size={11} />
                </button>
              </div>
              {/* 통계: 주문수 | 매출 가로 한 줄 */}
              <div style={{ display:'flex', alignItems:'center', gap:5, background:'#f8fafc', borderRadius:7, padding:'4px 10px', border:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:9, color:'#94a3b8', fontWeight:700 }}>주문수</span>
                <span style={{ fontSize:13, fontWeight:900, color:'#3b82f6' }}>{monthTotal}건</span>
                <span style={{ color:'#e2e8f0', fontSize:13, margin:'0 1px' }}>|</span>
                <span style={{ fontSize:9, color:'#94a3b8', fontWeight:700 }}>매출</span>
                <span style={{ fontSize:13, fontWeight:900, color:'#7c3aed' }}>₩{fmtMoney(monthRevSel)}</span>
              </div>
            </div>
          </div>
          {/* 차트 영역: flex:1 + height:100% 체인으로 LineChart가 컨테이너를 완전히 채움 */}
          <div style={{ flex:1, padding:'8px 12px 6px', overflow:'hidden', minHeight:0 }}>
            {monthTotal === 0 ? (
              <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#cbd5e1' }}>
                <ShoppingCart size={22} style={{ opacity:0.15, marginBottom:6 }} />
                <p style={{ fontSize:11,fontWeight:700 }}>{selMonth.replace('-','년 ')}월 주문 없음</p>
              </div>
            ) : (
              <LineChart data={chartData} />
            )}
          </div>
        </div>

        {/* 우측: 재고부족 + 품절 + CS (균등 배분) */}
        <div style={{ display:'flex', flexDirection:'column', gap:7, minHeight:0, overflow:'hidden' }}>

          {/* 재고 부족 */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <AlertTriangle size={14} color="#d97706" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>재고 부족</span>
                <span style={{ background:lowStock.length>0?'#fef3c7':'#f1f5f9', color:lowStock.length>0?'#d97706':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{lowStock.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {lowStock.length === 0
                ? <p style={{ padding:'8px 16px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>재고 부족 없음</p>
                : lowStock.slice(0,4).map((item,i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <div style={{ overflow:'hidden',minWidth:0 }}>
                      <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                      <p style={{ fontSize:11,color:'#94a3b8' }}>{item.oName}</p>
                    </div>
                    <span style={{ fontSize:20,fontWeight:900,color:item.stock<=1?'#dc2626':'#d97706',flexShrink:0,marginLeft:10 }}>{item.stock}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* 품절 */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Package size={14} color="#dc2626" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>품절</span>
                <span style={{ background:soldOut.length>0?'#fee2e2':'#f1f5f9', color:soldOut.length>0?'#dc2626':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{soldOut.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {soldOut.length === 0
                ? <p style={{ padding:'8px 16px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>품절 없음</p>
                : soldOut.slice(0,4).map((item,i) => (
                  <div key={i} style={{ padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                    <p style={{ fontSize:11,color:'#94a3b8' }}>{item.oName}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* 미처리 CS */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1, minHeight:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <MessageSquare size={14} color="#be123c" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>미처리 CS</span>
                <span style={{ background:openCs.length>0?'#fee2e2':'#f1f5f9', color:openCs.length>0?'#dc2626':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{openCs.length}</span>
              </div>
              <Link href="/cs-management" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            <div style={{ overflow:'hidden' }}>
              {openCs.length === 0
                ? <p style={{ padding:'8px 16px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>처리할 CS 없음</p>
                : openCs.slice(0,4).map((c,i) => (
                  <div key={i} style={{ padding:'7px 16px',borderBottom:'1px solid #f8fafc' }}>
                    <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a' }}>{String(c['customer_name']??c['title']??`CS #${i+1}`)}</p>
                    <p style={{ fontSize:10.5,color:'#94a3b8' }}>{c.created_at?.slice(0,10)??''}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단: 배송 현황 ── */}
      <div className="pm-card" style={{ flexShrink:0, padding:0, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f1f5f9' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Truck size={13} color="#7c3aed" />
            <span style={{ fontSize:13,fontWeight:800,color:'#0f172a' }}>배송 현황</span>
          </div>
          <Link href="/product-edit-transfer/print" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>송장등록관리→</Link>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:'10px 14px' }}>
          {shippingStats.map(s => (
            <div key={s.label} style={{ borderRadius:12,padding:'10px 14px',background:s.bg }}>
              <p style={{ fontSize:11,fontWeight:700,color:'#475569' }}>{s.label}</p>
              <p style={{ fontSize:26,fontWeight:900,color:s.color,lineHeight:1.2 }}>{s.value}</p>
              <div style={{ width:'100%',height:3,background:'rgba(0,0,0,0.06)',borderRadius:99,marginTop:6 }}>
                <div style={{ width:`${Math.round((s.value/maxShip)*100)}%`,height:'100%',background:s.bar,borderRadius:99,transition:'width 600ms ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
