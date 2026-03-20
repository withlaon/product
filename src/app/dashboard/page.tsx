'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Package, ShoppingCart, AlertTriangle, TrendingUp,
  Truck, MessageSquare, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { loadOrders, loadShippedOrders } from '@/lib/orders'
import type { Order, ShippedOrder } from '@/lib/orders'

/* ── 헬퍼 ─────────────────────────────────────────────────── */
interface CachedOption { name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
interface CachedProduct { id: string; name?: string; options: CachedOption[] }
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

/* ── 미니 바 차트 (SVG) ───────────────────────────────────── */
function BarChart({ data }: {
  data: { day: number; count: number; amount: number }[]
}) {
  const maxCount  = Math.max(...data.map(d => d.count), 1)
  const maxAmount = Math.max(...data.map(d => d.amount), 1)
  const w = 560; const h = 120; const pad = 20
  const cols = data.length
  const barW = Math.max(4, Math.floor((w - pad * 2) / (cols * 2.2)))
  const gap  = Math.floor((w - pad * 2) / cols)

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 28}`} style={{ overflow: 'visible' }}>
      {/* 기준선 */}
      {[0.25, 0.5, 0.75, 1].map(r => (
        <line key={r} x1={pad} y1={h - h * r} x2={w - pad} y2={h - h * r}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const x = pad + i * gap + gap / 2
        const cH = Math.round((d.count / maxCount) * h * 0.85)
        const aH = Math.round((d.amount / maxAmount) * h * 0.85)
        return (
          <g key={i}>
            {/* 금액 바 (뒤) */}
            {d.amount > 0 && (
              <rect x={x - barW + 1} y={h - aH} width={barW} height={aH} rx={2}
                fill="#818cf8" opacity={0.55} />
            )}
            {/* 주문수 바 (앞) */}
            {d.count > 0 && (
              <rect x={x} y={h - cH} width={barW} height={cH} rx={2}
                fill="#2563eb" opacity={0.8} />
            )}
            {/* X축 레이블 (5일 간격) */}
            {(d.day === 1 || d.day % 5 === 0) && (
              <text x={x} y={h + 16} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={700}>
                {d.day}
              </text>
            )}
          </g>
        )
      })}
      {/* 범례 */}
      <rect x={w - 110} y={4} width={10} height={10} rx={2} fill="#2563eb" opacity={0.8} />
      <text x={w - 96} y={13} fontSize={9} fill="#64748b" fontWeight={700}>주문수</text>
      <rect x={w - 54} y={4} width={10} height={10} rx={2} fill="#818cf8" opacity={0.55} />
      <text x={w - 40} y={13} fontSize={9} fill="#64748b" fontWeight={700}>매출액</text>
    </svg>
  )
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
  const lowStock = useMemo(() => products.flatMap(p =>
    p.options.filter(o => {
      const s = o.current_stock ?? Math.max(0,(o.received??0)-(o.sold??0))
      return s <= 3
    }).map(o => ({ pName: p.name??'', oName: o.name??'', stock: o.current_stock ?? Math.max(0,(o.received??0)-(o.sold??0)) }))
  ).slice(0,4), [products])

  /* ── 배송 현황 ── */
  const needInvoice    = useMemo(() => orders.filter(o => !o.tracking_number && o.status !== 'cancelled' && o.status !== 'delivered').length, [orders])
  const shippingCount  = useMemo(() => orders.filter(o => o.status === 'shipped').length, [orders])
  const deliveredToday = useMemo(() => shipped.filter(o => (o.shipped_at??'').slice(0,10) === today).length, [shipped, today])
  const totalShipped   = useMemo(() => shipped.length, [shipped])

  /* ── 월별 일자별 집계 ── */
  const chartData = useMemo(() => {
    const days = daysInMonth(selMonth)
    const monthOrders = orders.filter(o => o.order_date?.slice(0,7) === selMonth && o.status !== 'cancelled')
    return Array.from({ length: days }, (_, i) => {
      const day  = i + 1
      const date = `${selMonth}-${String(day).padStart(2,'0')}`
      const dayOrders = monthOrders.filter(o => o.order_date === date)
      return {
        day,
        count:  dayOrders.length,
        amount: dayOrders.reduce((s,o) => s + (o.total_amount ?? 0), 0),
      }
    })
  }, [orders, selMonth])

  const monthTotal   = useMemo(() => chartData.reduce((s,d) => s + d.count, 0), [chartData])
  const monthRevSel  = useMemo(() => chartData.reduce((s,d) => s + d.amount, 0), [chartData])

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
    <div className="pm-page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
      <RefreshCw size={22} style={{ animation:'spin 1s linear infinite', color:'#94a3b8' }} />
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, height:'100%', overflow:'hidden' }}>

      {/* ── KPI 4칸 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, flexShrink:0 }}>
        {[
          { title:'전체 상품',  value: products.length ? `${products.length}개` : '0', sub:`재고부족 ${lowStock.length}건`, icon:Package,       bg:'#eff6ff', ic:'#2563eb', href:'/products' },
          { title:'오늘 주문',  value: todayOrders.length ? `${todayOrders.length}건` : '0', sub: todayOrders.length ? `미처리 ${todayOrders.filter(o=>o.status==='pending'||o.status==='confirmed').length}건` : '주문없음', icon:ShoppingCart, bg:'#ecfdf5', ic:'#059669', href:'/product-transfer' },
          { title:'재고 부족',  value: lowStock.length ? `${lowStock.length}개` : '0', sub: lowStock.length ? '3개 이하 옵션' : '재고 정상', icon:AlertTriangle, bg:'#fffbeb', ic:'#d97706', href:'/inventory' },
          { title:'이번달 매출', value: monthRevenue > 0 ? `₩${(monthRevenue/10000).toFixed(0)}만` : '₩0', sub:`${curYM.replace('-','년 ')}월`, icon:TrendingUp, bg:'#f5f3ff', ic:'#7c3aed', href:'/product-transfer' },
        ].map(s => (
          <Link key={s.title} href={s.href} style={{ textDecoration:'none' }}>
            <div className="pm-card" style={{ padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <s.icon size={18} color={s.ic} strokeWidth={2} />
              </div>
              <div>
                <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.title}</p>
                <p style={{ fontSize:22, fontWeight:900, color:'#0f172a', lineHeight:1.1 }}>{s.value}</p>
                <p style={{ fontSize:10.5, color:'#94a3b8', fontWeight:600 }}>{s.sub}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── 중단: 차트 + 우측 패널 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:12, flex:1, minHeight:0 }}>

        {/* 월별 주문 차트 */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          {/* 헤더 */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
            <div style={{ width:26, height:26, borderRadius:8, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ShoppingCart size={13} color="#2563eb" />
            </div>
            <span style={{ fontSize:13.5, fontWeight:800, color:'#0f172a' }}>월별 주문 현황</span>
            <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
              <button onClick={() => setSelMonth(m => shiftMonth(m, -1))}
                style={{ width:26, height:26, borderRadius:7, border:'1.5px solid #e2e8f0', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontSize:13, fontWeight:800, color:'#0f172a', minWidth:80, textAlign:'center' }}>
                {selMonth.replace('-','년 ')}월
              </span>
              <button onClick={() => setSelMonth(m => shiftMonth(m, 1))}
                disabled={selMonth >= curYM}
                style={{ width:26, height:26, borderRadius:7, border:'1.5px solid #e2e8f0', background:'#fff', cursor: selMonth >= curYM ? 'not-allowed' : 'pointer', opacity: selMonth >= curYM ? 0.4 : 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ChevronRight size={13} />
              </button>
            </div>
            {/* 월 합계 */}
            <div style={{ display:'flex', gap:16, marginLeft:12 }}>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:10, color:'#94a3b8', fontWeight:700 }}>주문수</p>
                <p style={{ fontSize:15, fontWeight:900, color:'#2563eb', lineHeight:1.2 }}>{monthTotal}건</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:10, color:'#94a3b8', fontWeight:700 }}>매출</p>
                <p style={{ fontSize:15, fontWeight:900, color:'#7c3aed', lineHeight:1.2 }}>
                  {monthRevSel > 0 ? `₩${(monthRevSel/10000).toFixed(0)}만` : '₩0'}
                </p>
              </div>
            </div>
          </div>
          {/* 차트 */}
          <div style={{ flex:1, padding:'12px 16px 8px', overflow:'hidden' }}>
            {monthTotal === 0 ? (
              <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#cbd5e1' }}>
                <div style={{ textAlign:'center' }}>
                  <ShoppingCart size={28} style={{ opacity:0.15, margin:'0 auto 8px' }} />
                  <p style={{ fontSize:12.5, fontWeight:700 }}>{selMonth.replace('-','년 ')}월 주문 없음</p>
                </div>
              </div>
            ) : (
              <BarChart data={chartData} />
            )}
          </div>
        </div>

        {/* 우측: 재고부족 + CS + 배송 */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, minHeight:0, overflow:'hidden' }}>
          {/* 재고 부족 */}
          <div className="pm-card" style={{ flex:'0 0 auto', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <AlertTriangle size={13} color="#d97706" />
                <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>재고 부족</span>
                <span style={{ background: lowStock.length > 0 ? '#fef3c7' : '#f1f5f9', color: lowStock.length > 0 ? '#d97706' : '#94a3b8', fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:99 }}>
                  {lowStock.length}
                </span>
              </div>
              <Link href="/inventory" style={{ fontSize:11, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>보기→</Link>
            </div>
            {lowStock.length === 0 ? (
              <p style={{ padding:'10px 14px', fontSize:11.5, color:'#94a3b8', fontWeight:600 }}>재고 부족 없음</p>
            ) : lowStock.map((item, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 14px', borderBottom:'1px solid #f8fafc' }}>
                <div style={{ overflow:'hidden' }}>
                  <p style={{ fontSize:11.5, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.pName}</p>
                  <p style={{ fontSize:10.5, color:'#94a3b8' }}>{item.oName}</p>
                </div>
                <span style={{ fontSize:16, fontWeight:900, color: item.stock === 0 ? '#dc2626' : '#d97706', flexShrink:0, marginLeft:6 }}>{item.stock}</span>
              </div>
            ))}
          </div>

          {/* 미처리 CS */}
          <div className="pm-card" style={{ flex:'0 0 auto', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid #f1f5f9' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <MessageSquare size={13} color="#be123c" />
                <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>미처리 CS</span>
                <span style={{ background: openCs.length > 0 ? '#fee2e2' : '#f1f5f9', color: openCs.length > 0 ? '#dc2626' : '#94a3b8', fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:99 }}>
                  {openCs.length}
                </span>
              </div>
              <Link href="/cs-management" style={{ fontSize:11, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>보기→</Link>
            </div>
            {openCs.length === 0 ? (
              <p style={{ padding:'10px 14px', fontSize:11.5, color:'#94a3b8', fontWeight:600 }}>처리할 CS 없음</p>
            ) : openCs.slice(0,3).map((c, i) => (
              <div key={i} style={{ padding:'7px 14px', borderBottom:'1px solid #f8fafc' }}>
                <p style={{ fontSize:11.5, fontWeight:700, color:'#0f172a' }}>{String(c['customer_name'] ?? c['title'] ?? `CS #${i+1}`)}</p>
                <p style={{ fontSize:10.5, color:'#94a3b8' }}>{c.created_at?.slice(0,10) ?? ''}</p>
              </div>
            ))}
          </div>

          {/* 배송 현황 (세로) */}
          <div className="pm-card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
              <Truck size={13} color="#7c3aed" />
              <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>배송 현황</span>
              <Link href="/product-edit-transfer/print" style={{ fontSize:11, fontWeight:700, color:'#2563eb', textDecoration:'none', marginLeft:'auto' }}>송장관리→</Link>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:10, flex:1 }}>
              {shippingStats.map(s => (
                <div key={s.label} style={{ borderRadius:12, padding:'10px 12px', background:s.bg }}>
                  <p style={{ fontSize:10.5, fontWeight:700, color:'#475569' }}>{s.label}</p>
                  <p style={{ fontSize:22, fontWeight:900, color:s.color, lineHeight:1.2 }}>{s.value}</p>
                  <div style={{ width:'100%', height:3, background:'rgba(0,0,0,0.06)', borderRadius:99, marginTop:6 }}>
                    <div style={{ width:`${Math.round((s.value/maxShip)*100)}%`, height:'100%', background:s.bar, borderRadius:99, transition:'width 600ms ease' }} />
                  </div>
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
