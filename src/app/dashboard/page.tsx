'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Package, ShoppingCart, AlertTriangle, TrendingUp,
  ArrowUpRight, Truck, MessageSquare, RefreshCw,
} from 'lucide-react'
import { loadOrders, loadShippedOrders } from '@/lib/orders'
import type { Order, ShippedOrder } from '@/lib/orders'

/* ── 로컬 캐시 로드 헬퍼 ────────────────────────────────── */
interface CachedOption {
  name?: string; barcode?: string
  current_stock?: number; received?: number; sold?: number
  [k: string]: unknown
}
interface CachedProduct {
  id: string; name?: string; code?: string; status?: string
  options: CachedOption[]
}
function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch { return [] }
}
interface CsItem { id: string; status?: string; created_at?: string; [k: string]: unknown }
function loadCsItems(): CsItem[] {
  try {
    const raw = localStorage.getItem('pm_cs_v1')
    if (!raw) return []
    return JSON.parse(raw) ?? []
  } catch { return [] }
}

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

const MALL_COLORS: Record<string, string> = {
  '마켓플러스': '#e11d48', '토스쇼핑': '#4f46e5', '지에스샵': '#059669',
  '올웨이즈': '#d97706', '스마트스토어': '#059669', '카페24': '#7c3aed',
  '쿠팡': '#f97316',
}
function mallColor(ch: string) { return MALL_COLORS[ch] ?? '#64748b' }

const STATUS_LABEL: Record<string, string> = {
  pending: '주문접수', preparing: '상품준비', shipped: '배송중', delivered: '배송완료', cancelled: '취소',
}

export default function DashboardPage() {
  const today = getToday()
  const curYM = getCurYM()

  const [orders,   setOrders]   = useState<Order[]>([])
  const [shipped,  setShipped]  = useState<ShippedOrder[]>([])
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [csItems,  setCsItems]  = useState<CsItem[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setOrders(loadOrders())
    setShipped(loadShippedOrders())
    setProducts(loadCachedProducts())
    setCsItems(loadCsItems())
    setLoading(false)
  }, [])

  /* ── KPI 계산 ── */
  const todayOrders   = useMemo(() => orders.filter(o => o.order_date === today), [orders, today])
  const monthRevenue  = useMemo(() =>
    orders.filter(o => o.order_date?.slice(0,7) === curYM && o.status !== 'cancelled')
          .reduce((s, o) => s + (o.total_amount ?? 0), 0),
  [orders, curYM])

  const lowStock = useMemo(() => {
    const LOW = 3
    return products.flatMap(p =>
      p.options
        .filter(o => {
          const stock = o.current_stock !== undefined ? o.current_stock : Math.max(0, (o.received ?? 0) - (o.sold ?? 0))
          return stock <= LOW
        })
        .map(o => ({ productName: p.name ?? '', optionName: o.name ?? '', stock: o.current_stock ?? Math.max(0, (o.received ?? 0) - (o.sold ?? 0)) }))
    ).slice(0, 5)
  }, [products])

  /* ── 배송 현황 ── */
  const needInvoice   = useMemo(() => orders.filter(o => !o.tracking_number && o.status !== 'cancelled' && o.status !== 'delivered').length, [orders])
  const shippingCount = useMemo(() => orders.filter(o => o.status === 'shipped').length, [orders])
  const deliveredToday = useMemo(() => shipped.filter(o => (o.shipped_at ?? '').slice(0,10) === today).length, [shipped, today])
  const totalShipped  = useMemo(() => shipped.length, [shipped])

  /* ── 최근 주문 (최근 8건) ── */
  const recentOrders = useMemo(() =>
    [...orders].sort((a,b) => b.order_date.localeCompare(a.order_date)).slice(0, 8),
  [orders])

  /* ── 미처리 CS ── */
  const openCs = useMemo(() => csItems.filter(c => c.status !== 'resolved' && c.status !== 'closed'), [csItems])

  const shippingStats = [
    { label: '송장 미등록', value: needInvoice,   bg: '#fff1f2', color: '#be123c', bar: '#f43f5e' },
    { label: '배송 중',    value: shippingCount,  bg: '#eff6ff', color: '#1d4ed8', bar: '#3b82f6' },
    { label: '오늘 출고',  value: deliveredToday, bg: '#faf5ff', color: '#7e22ce', bar: '#a855f7' },
    { label: '누적 출고',  value: totalShipped,   bg: '#f0fdf4', color: '#15803d', bar: '#22c55e' },
  ]
  const maxShip = Math.max(...shippingStats.map(s => s.value), 1)

  if (loading) return (
    <div className="pm-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div className="pm-page space-y-5">

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            title: '전체 상품',
            value: products.length > 0 ? `${products.length}개` : '0',
            sub: products.length > 0 ? `재고부족 ${lowStock.length}건` : '상품을 등록하세요',
            icon: Package, bg: '#eff6ff', ic: '#2563eb', href: '/products',
          },
          {
            title: '오늘 주문',
            value: todayOrders.length > 0 ? `${todayOrders.length}건` : '0',
            sub: todayOrders.length > 0
              ? `미처리 ${todayOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length}건`
              : '주문이 없습니다',
            icon: ShoppingCart, bg: '#ecfdf5', ic: '#059669', href: '/product-transfer',
          },
          {
            title: '재고 부족',
            value: lowStock.length > 0 ? `${lowStock.length}개` : '0',
            sub: lowStock.length > 0 ? `3개 이하 옵션` : '재고 현황 정상',
            icon: AlertTriangle, bg: '#fffbeb', ic: '#d97706', href: '/inventory',
          },
          {
            title: '이번달 매출',
            value: monthRevenue > 0 ? `₩${monthRevenue.toLocaleString()}` : '₩0',
            sub: `${curYM.replace('-', '년 ')}월`,
            icon: TrendingUp, bg: '#f5f3ff', ic: '#7c3aed', href: '/product-transfer',
          },
        ].map(s => (
          <Link key={s.title} href={s.href} style={{ textDecoration: 'none' }}>
            <div className="stat-card" style={{ cursor: 'pointer' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.title}</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 4, lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginTop: 6 }}>{s.sub}</p>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <s.icon size={20} color={s.ic} strokeWidth={2} />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 최근 주문 */}
        <div className="xl:col-span-2 pm-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <div style={{ width: 28, height: 28, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart size={14} color="#2563eb" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>최근 주문</span>
              <span style={{ background: '#e2e8f0', color: '#64748b', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>
                {recentOrders.length}
              </span>
            </div>
            <Link href="/product-transfer" className="flex items-center gap-0.5" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
              전체 보기 <ArrowUpRight size={12} />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              <ShoppingCart size={28} style={{ opacity: 0.18, margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, fontWeight: 700 }}>주문 내역이 없습니다</p>
            </div>
          ) : (
            <div>
              {recentOrders.map(o => {
                const item = o.items[0]
                const color = mallColor(o.channel)
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #f8fafc' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color, background: `${color}18`, padding: '2px 8px', borderRadius: 6, flexShrink: 0 }}>{o.channel}</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item?.product_name ?? '-'} {item?.option ? `[${item.option}]` : ''}
                      </p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{o.customer_name} · {o.order_date}</p>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', flexShrink: 0 }}>
                      {o.total_amount ? `₩${o.total_amount.toLocaleString()}` : '-'}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, flexShrink: 0,
                      background: o.status === 'shipped' ? '#ede9fe' : o.status === 'delivered' ? '#d1fae5' : o.status === 'cancelled' ? '#fee2e2' : '#f0f9ff',
                      color:      o.status === 'shipped' ? '#7c3aed' : o.status === 'delivered' ? '#059669' : o.status === 'cancelled' ? '#dc2626' : '#0369a1',
                    }}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 우측 패널 */}
        <div className="space-y-5">
          {/* 재고 부족 */}
          <div className="pm-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width: 28, height: 28, borderRadius: 9, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={14} color="#d97706" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>재고 부족</span>
                <span style={{ background: lowStock.length > 0 ? '#fef3c7' : '#e2e8f0', color: lowStock.length > 0 ? '#d97706' : '#64748b', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>
                  {lowStock.length}
                </span>
              </div>
              <Link href="/inventory" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>보기 →</Link>
            </div>
            {lowStock.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700 }}>재고 부족 없음</p>
              </div>
            ) : (
              <div>
                {lowStock.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 20px', borderBottom: '1px solid #f8fafc' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.productName}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{item.optionName}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: item.stock === 0 ? '#dc2626' : '#d97706', flexShrink: 0, marginLeft: 8 }}>
                      {item.stock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 미처리 CS */}
          <div className="pm-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width: 28, height: 28, borderRadius: 9, background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={14} color="#be123c" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>미처리 CS</span>
                <span style={{ background: openCs.length > 0 ? '#fee2e2' : '#e2e8f0', color: openCs.length > 0 ? '#dc2626' : '#64748b', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>
                  {openCs.length}
                </span>
              </div>
              <Link href="/cs-management" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>보기 →</Link>
            </div>
            {openCs.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700 }}>처리할 CS가 없습니다</p>
              </div>
            ) : (
              <div>
                {openCs.slice(0,4).map((c, i) => (
                  <div key={i} style={{ padding: '9px 20px', borderBottom: '1px solid #f8fafc' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{String(c['customer_name'] ?? c['title'] ?? `CS #${i+1}`)}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{c.created_at?.slice(0,10) ?? ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 배송 현황 */}
      <div className="pm-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 28, height: 28, borderRadius: 9, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={14} color="#7c3aed" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>배송 현황</span>
          </div>
          <Link href="/product-edit-transfer/print" style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
            송장등록관리 →
          </Link>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {shippingStats.map(s => (
            <div key={s.label} className="rounded-2xl p-4" style={{ background: s.bg }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>{s.label}</p>
              <p style={{ fontSize: 34, fontWeight: 900, color: s.color, marginTop: 4, lineHeight: 1 }}>{s.value}</p>
              <div style={{ width: '100%', height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 99, marginTop: 12 }}>
                <div style={{ width: `${Math.round((s.value / maxShip) * 100)}%`, height: '100%', background: s.bar, borderRadius: 99, transition: 'width 600ms ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </div>
  )
}
