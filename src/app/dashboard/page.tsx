'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Package, ShoppingCart, AlertTriangle, TrendingUp,
  Truck, MessageSquare, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { loadOrders, loadShippedOrders } from '@/lib/orders'
import type { Order, ShippedOrder } from '@/lib/orders'

/* ── 헬퍼 ─────────────────────────────────────────────────── */
interface CachedOption { name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
interface CachedProduct { id: string; name?: string; status?: string; options: CachedOption[] }
interface CsItem { id: string; status?: string; created_at?: string; [k: string]: unknown }

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
  const [tipIdx, setTipIdx] = useState<number | null>(null)
  const divRef = useRef<HTMLDivElement>(null)

  const W = 540; const H = 140
  const padL = 38; const padR = 52; const padT = 14; const padB = 22
  const cW = W - padL - padR
  const cH = H - padT - padB

  const maxCnt = Math.max(...data.map(d => d.count), 1)
  const maxAmt = Math.max(...data.map(d => d.amount), 1)
  const cols   = data.length

  const xPos = (i: number) => cols <= 1 ? padL + cW / 2 : padL + (i / (cols - 1)) * cW
  const yCnt = (v: number) => padT + cH - (v / maxCnt) * cH
  const yAmt = (v: number) => padT + cH - (v / maxAmt) * cH

  const cntPath = data.map((d, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yCnt(d.count).toFixed(1)}`).join(' ')
  const amtPath = data.map((d, i) => `${i===0?'M':'L'}${xPos(i).toFixed(1)},${yAmt(d.amount).toFixed(1)}`).join(' ')

  // 채우기 path (선 + 하단 닫기)
  const cntFill = cntPath + ` L${xPos(cols-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`
  const amtFill = amtPath + ` L${xPos(cols-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    let nearest = 0; let minDist = Infinity
    data.forEach((_, i) => { const d = Math.abs(xPos(i) - mx); if (d < minDist) { minDist = d; nearest = i } })
    setTipIdx(nearest)
  }

  const tip = tipIdx !== null ? data[tipIdx] : null
  const tipX = tipIdx !== null ? xPos(tipIdx) : 0
  const tipXPct = tipX / W * 100

  return (
    <div ref={divRef} style={{ position:'relative', width:'100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width:'100%', overflow:'visible', cursor:'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTipIdx(null)}
      >
        {/* 배경 그리드 */}
        {[0, 0.25, 0.5, 0.75, 1].map(r => (
          <line key={r} x1={padL} y1={padT + cH - cH*r} x2={W-padR} y2={padT + cH - cH*r}
            stroke={r===0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth={r===0 ? 1.5 : 1} />
        ))}

        {/* 매출액 영역 (뒤) */}
        <defs>
          <linearGradient id="amtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="cntGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <path d={amtFill} fill="url(#amtGrad)" />
        <path d={cntFill} fill="url(#cntGrad)" />

        {/* 선 */}
        <path d={amtPath} fill="none" stroke="#818cf8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={cntPath} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* 포인트 */}
        {data.map((d, i) => d.count > 0 && (
          <circle key={`c${i}`} cx={xPos(i)} cy={yCnt(d.count)} r={tipIdx===i?5:2.5} fill="#2563eb" stroke="#fff" strokeWidth={tipIdx===i?2:1} />
        ))}
        {data.map((d, i) => d.amount > 0 && (
          <circle key={`a${i}`} cx={xPos(i)} cy={yAmt(d.amount)} r={tipIdx===i?4:2} fill="#818cf8" stroke="#fff" strokeWidth={tipIdx===i?2:1} />
        ))}

        {/* 호버 수직선 */}
        {tipIdx !== null && (
          <line x1={tipX} y1={padT} x2={tipX} y2={padT+cH} stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}

        {/* X축 레이블 */}
        {data.map((d, i) => (d.day === 1 || d.day % 5 === 0) && (
          <text key={i} x={xPos(i)} y={H-4} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={700}>{d.day}</text>
        ))}

        {/* 왼쪽 Y축 (주문수, 파랑) */}
        <text x={padL-6} y={padT+4}      textAnchor="end" fontSize={9} fill="#2563eb" fontWeight={700}>{maxCnt}</text>
        <text x={padL-6} y={padT+cH/2+4} textAnchor="end" fontSize={9} fill="#2563eb" fontWeight={600}>{Math.round(maxCnt/2)}</text>
        <text x={padL-6} y={padT+cH+4}   textAnchor="end" fontSize={9} fill="#2563eb" fontWeight={600}>0</text>
        <text x={padL-6} y={padT-4}      textAnchor="end" fontSize={8} fill="#2563eb" fontWeight={800}>건</text>

        {/* 오른쪽 Y축 (매출, 보라) */}
        <text x={W-padR+6} y={padT+4}      textAnchor="start" fontSize={9} fill="#818cf8" fontWeight={700}>{fmtMoney(maxAmt)}</text>
        <text x={W-padR+6} y={padT+cH/2+4} textAnchor="start" fontSize={9} fill="#818cf8" fontWeight={600}>{fmtMoney(Math.round(maxAmt/2))}</text>
        <text x={W-padR+6} y={padT+cH+4}   textAnchor="start" fontSize={9} fill="#818cf8" fontWeight={600}>0</text>
        <text x={W-padR+6} y={padT-4}      textAnchor="start" fontSize={8} fill="#818cf8" fontWeight={800}>원</text>
      </svg>

      {/* 툴팁 */}
      {tip && tipIdx !== null && (
        <div style={{
          position:'absolute', top:0, pointerEvents:'none', zIndex:20,
          left: `${tipXPct > 70 ? tipXPct - 16 : tipXPct + 1}%`,
          transform: tipXPct > 70 ? 'translateX(-100%)' : 'none',
          background:'#0f172a', borderRadius:8, padding:'7px 11px',
          boxShadow:'0 4px 12px rgba(0,0,0,0.25)',
        }}>
          <p style={{ fontSize:10, color:'#94a3b8', fontWeight:700, marginBottom:3 }}>{selMonthLabel(tip.day)}</p>
          <p style={{ fontSize:12, color:'#60a5fa', fontWeight:800 }}>📦 {tip.count}건</p>
          <p style={{ fontSize:12, color:'#a5b4fc', fontWeight:800 }}>💰 ₩{tip.amount.toLocaleString()}</p>
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
  const today = getToday()
  const curYM = getCurYM()

  const [orders,   setOrders]   = useState<Order[]>([])
  const [shipped,  setShipped]  = useState<ShippedOrder[]>([])
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [csItems,  setCsItems]  = useState<CsItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selMonth, setSelMonth] = useState(curYM)

  _selMonthForChart = selMonth

  useEffect(() => {
    setOrders(loadOrders())
    setShipped(loadShippedOrders())
    setProducts(loadCachedProducts())
    setCsItems(loadCsItems())
    setLoading(false)
  }, [])

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

  /* ── 배송 현황 ── */
  const needInvoice    = useMemo(() => orders.filter(o => !o.tracking_number && o.status !== 'cancelled' && o.status !== 'delivered').length, [orders])
  const shippingCount  = useMemo(() => orders.filter(o => o.status === 'shipped').length, [orders])
  const deliveredToday = useMemo(() => shipped.filter(o => (o.shipped_at??'').slice(0,10) === today).length, [shipped, today])
  const totalShipped   = useMemo(() => shipped.length, [shipped])

  /* ── 월별 차트 데이터 ── */
  const chartData = useMemo(() => {
    const days = daysInMonth(selMonth)
    const mo = orders.filter(o => o.order_date?.slice(0,7) === selMonth && o.status !== 'cancelled')
    return Array.from({ length: days }, (_, i) => {
      const day = i + 1
      const date = `${selMonth}-${String(day).padStart(2,'0')}`
      const dayO = mo.filter(o => o.order_date === date)
      return { day, count: dayO.length, amount: dayO.reduce((s,o) => s+(o.total_amount??0), 0) }
    })
  }, [orders, selMonth])

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

      {/* ── KPI ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, flexShrink:0 }}>
        {[
          { title:'전체 상품',  value: products.length?`${products.length}개`:'0', sub:`재고부족 ${lowStock.length} · 품절 ${soldOut.length}`, icon:Package,       bg:'#eff6ff', ic:'#2563eb', href:'/products' },
          { title:'오늘 주문',  value: todayOrders.length?`${todayOrders.length}건`:'0', sub: todayOrders.length?`미처리 ${todayOrders.filter(o=>o.status==='pending'||o.status==='confirmed').length}건`:'주문없음', icon:ShoppingCart, bg:'#ecfdf5', ic:'#059669', href:'/product-transfer' },
          { title:'재고 부족',  value: lowStock.length?`${lowStock.length}개`:'0', sub: lowStock.length?'3개 이하 옵션':'재고 정상', icon:AlertTriangle, bg:'#fffbeb', ic:'#d97706', href:'/inventory' },
          { title:'이번달 매출', value: monthRevenue>0?`₩${fmtMoney(monthRevenue)}`:'₩0', sub:`${curYM.replace('-','년 ')}월`, icon:TrendingUp, bg:'#f5f3ff', ic:'#7c3aed', href:'/product-transfer' },
        ].map(s => (
          <Link key={s.title} href={s.href} style={{ textDecoration:'none' }}>
            <div className="pm-card" style={{ padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36,height:36,borderRadius:11,background:s.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <s.icon size={17} color={s.ic} strokeWidth={2} />
              </div>
              <div>
                <p style={{ fontSize:10,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em' }}>{s.title}</p>
                <p style={{ fontSize:20,fontWeight:900,color:'#0f172a',lineHeight:1.1 }}>{s.value}</p>
                <p style={{ fontSize:10,color:'#94a3b8',fontWeight:600 }}>{s.sub}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── 중단: 차트 + 우측 패널 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:10, flex:1, minHeight:0 }}>

        {/* 월별 선 그래프 */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
            <div style={{ width:24,height:24,borderRadius:8,background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <ShoppingCart size={12} color="#2563eb" />
            </div>
            <span style={{ fontSize:13,fontWeight:800,color:'#0f172a' }}>월별 주문 현황</span>
            {/* 범례 */}
            <div style={{ display:'flex', gap:12, marginLeft:4 }}>
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#2563eb', fontWeight:700 }}>
                <span style={{ width:16,height:2.5,background:'#2563eb',borderRadius:99,display:'inline-block' }}/> 주문수
              </span>
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#818cf8', fontWeight:700 }}>
                <span style={{ width:16,height:2.5,background:'#818cf8',borderRadius:99,display:'inline-block' }}/> 매출
              </span>
            </div>
            {/* 월 네비 */}
            <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
              <button onClick={() => setSelMonth(m => shiftMonth(m,-1))}
                style={{ width:24,height:24,borderRadius:6,border:'1.5px solid #e2e8f0',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <ChevronLeft size={12} />
              </button>
              <span style={{ fontSize:12,fontWeight:800,color:'#0f172a',minWidth:72,textAlign:'center' }}>
                {selMonth.replace('-','년 ')}월
              </span>
              <button onClick={() => setSelMonth(m => shiftMonth(m,1))}
                disabled={selMonth >= curYM}
                style={{ width:24,height:24,borderRadius:6,border:'1.5px solid #e2e8f0',background:'#fff',cursor:selMonth>=curYM?'not-allowed':'pointer',opacity:selMonth>=curYM?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
                <ChevronRight size={12} />
              </button>
            </div>
            <div style={{ display:'flex', gap:14, marginLeft:8 }}>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:9,color:'#94a3b8',fontWeight:700 }}>주문수</p>
                <p style={{ fontSize:14,fontWeight:900,color:'#2563eb',lineHeight:1.2 }}>{monthTotal}건</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:9,color:'#94a3b8',fontWeight:700 }}>매출</p>
                <p style={{ fontSize:14,fontWeight:900,color:'#7c3aed',lineHeight:1.2 }}>₩{fmtMoney(monthRevSel)}</p>
              </div>
            </div>
          </div>
          <div style={{ flex:1, padding:'10px 14px 4px', overflow:'hidden', display:'flex', alignItems:'center' }}>
            {monthTotal === 0 ? (
              <div style={{ width:'100%',textAlign:'center',color:'#cbd5e1' }}>
                <ShoppingCart size={24} style={{ opacity:0.15, margin:'0 auto 6px' }} />
                <p style={{ fontSize:12,fontWeight:700 }}>{selMonth.replace('-','년 ')}월 주문 없음</p>
              </div>
            ) : (
              <LineChart data={chartData} />
            )}
          </div>
        </div>

        {/* 우측: 재고부족 + 품절 + CS */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, minHeight:0, overflow:'hidden' }}>

          {/* 재고 부족 */}
          <div className="pm-card" style={{ overflow:'hidden', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <AlertTriangle size={14} color="#d97706" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>재고 부족</span>
                <span style={{ background:lowStock.length>0?'#fef3c7':'#f1f5f9', color:lowStock.length>0?'#d97706':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{lowStock.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            {lowStock.length === 0
              ? <p style={{ padding:'8px 14px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>재고 부족 없음</p>
              : lowStock.slice(0,3).map((item,i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:'1px solid #f8fafc' }}>
                  <div style={{ overflow:'hidden' }}>
                    <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                    <p style={{ fontSize:11,color:'#94a3b8' }}>{item.oName}</p>
                  </div>
                  <span style={{ fontSize:18,fontWeight:900,color:item.stock<=1?'#dc2626':'#d97706',flexShrink:0,marginLeft:6 }}>{item.stock}</span>
                </div>
              ))}
          </div>

          {/* 품절 */}
          <div className="pm-card" style={{ overflow:'hidden', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Package size={14} color="#dc2626" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>품절</span>
                <span style={{ background:soldOut.length>0?'#fee2e2':'#f1f5f9', color:soldOut.length>0?'#dc2626':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{soldOut.length}</span>
              </div>
              <Link href="/inventory" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            {soldOut.length === 0
              ? <p style={{ padding:'8px 14px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>품절 없음</p>
              : soldOut.slice(0,3).map((item,i) => (
                <div key={i} style={{ padding:'7px 14px',borderBottom:'1px solid #f8fafc' }}>
                  <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{item.pName}</p>
                  <p style={{ fontSize:11,color:'#94a3b8' }}>{item.oName}</p>
                </div>
              ))}
          </div>

          {/* 미처리 CS */}
          <div className="pm-card" style={{ overflow:'hidden', flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <MessageSquare size={14} color="#be123c" />
                <span style={{ fontSize:13.5,fontWeight:900,color:'#0f172a' }}>미처리 CS</span>
                <span style={{ background:openCs.length>0?'#fee2e2':'#f1f5f9', color:openCs.length>0?'#dc2626':'#94a3b8', fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:99 }}>{openCs.length}</span>
              </div>
              <Link href="/cs-management" style={{ fontSize:11,fontWeight:700,color:'#2563eb',textDecoration:'none' }}>보기→</Link>
            </div>
            {openCs.length === 0
              ? <p style={{ padding:'8px 14px',fontSize:12,color:'#94a3b8',fontWeight:600 }}>처리할 CS 없음</p>
              : openCs.slice(0,3).map((c,i) => (
                <div key={i} style={{ padding:'7px 14px',borderBottom:'1px solid #f8fafc' }}>
                  <p style={{ fontSize:12.5,fontWeight:700,color:'#0f172a' }}>{String(c['customer_name']??c['title']??`CS #${i+1}`)}</p>
                  <p style={{ fontSize:10.5,color:'#94a3b8' }}>{c.created_at?.slice(0,10)??''}</p>
                </div>
              ))}
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
