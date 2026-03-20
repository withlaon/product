'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Package, Truck, CheckCircle2, RotateCcw, PackageCheck } from 'lucide-react'
import {
  loadShippedOrders, saveShippedOrders, loadOrders, saveOrders,
  loadMappings, lookupMapping,
} from '@/lib/orders'
import type { ShippedOrder } from '@/lib/orders'

/* 로컬 캐시에서 상품 목록 로드 (바코드 기준 재고차감용) */
type CachedOption = { barcode?: string; name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
type CachedProduct = { id: string; options: CachedOption[] }
function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch { return [] }
}
function saveCachedProducts(products: CachedProduct[]) {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    localStorage.setItem('pm_products_cache_v1', JSON.stringify({ ...parsed, data: products }))
  } catch {}
}

/* ─── 날짜 유틸 ─────────────────────────────────────────── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const wd = ['일','월','화','수','목','금','토'][dt.getDay()]
  return `${d.replace(/-/g, '년 ').replace(/-/, '월 ')}일 (${wd})`
}
function shiftDate(d: string, delta: number) {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

/* ─── 쇼핑몰 뱃지 색상 ──────────────────────────────────── */
const MALL_COLORS: Record<string, { color: string; bg: string }> = {
  '마켓플러스': { color: '#e11d48', bg: '#fff1f2' },
  '토스쇼핑':   { color: '#4f46e5', bg: '#eef2ff' },
  '지에스샵':   { color: '#059669', bg: '#ecfdf5' },
  '올웨이즈':   { color: '#d97706', bg: '#fffbeb' },
  '스마트스토어':{ color: '#059669', bg: '#ecfdf5' },
  '카페24':     { color: '#7c3aed', bg: '#f5f3ff' },
  '쿠팡':       { color: '#f97316', bg: '#fff7ed' },
  '옥션':       { color: '#0284c7', bg: '#f0f9ff' },
}
function mallStyle(channel: string) {
  return MALL_COLORS[channel] ?? { color: '#64748b', bg: '#f8fafc' }
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function ShippingHistoryPage() {
  const today  = getToday()
  const curYM  = getCurYM()

  const [shipped, setShipped]       = useState<ShippedOrder[]>([])
  const [viewMode, setViewMode]     = useState<'daily' | 'monthly'>('daily')
  const [selDate, setSelDate]       = useState(today)
  const [selMonth, setSelMonth]     = useState(curYM)
  const [checked, setChecked]       = useState<Set<string>>(new Set())

  useEffect(() => { setShipped(loadShippedOrders()) }, [])

  /* 날짜/월별 필터 */
  const displayOrders = useMemo(() => {
    if (viewMode === 'daily') {
      const d = selDate
      return shipped.filter(o => (o.shipped_at ?? o.order_date).slice(0, 10) === d)
    } else {
      const ym = selMonth
      return shipped.filter(o => (o.shipped_at ?? o.order_date).slice(0, 7) === ym)
    }
  }, [shipped, viewMode, selDate, selMonth])

  /* KPI */
  const todayShipped  = useMemo(() => shipped.filter(o => o.shipped_at?.slice(0,10) === today).length, [shipped, today])
  const monthShipped  = useMemo(() => shipped.filter(o => o.shipped_at?.slice(0,7) === curYM).length, [shipped, curYM])

  /* 체크박스 */
  const allChecked = displayOrders.length > 0 && displayOrders.every(o => checked.has(o.id))
  const toggleAll  = () => {
    if (allChecked) setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.delete(o.id)); return n })
    else            setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.add(o.id)); return n })
  }
  const toggleOne = (id: string) => setChecked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /* 출고취소: 선택 항목을 출고내역에서 제거하고 pm_orders_v1 상태를 shipped로 복원 */
  const handleCancelShipping = () => {
    if (checked.size === 0) return
    if (!confirm(`선택한 ${checked.size}건의 출고를 취소하시겠습니까?\n주문이 송장전송용 탭으로 돌아갑니다.`)) return

    const toCancel = shipped.filter(o => checked.has(o.id))
    const remaining = shipped.filter(o => !checked.has(o.id))
    saveShippedOrders(remaining)
    setShipped(remaining)

    // pm_orders_v1 복원
    const allOrders = loadOrders()
    const cancelIds = new Set(toCancel.map(o => o.id))
    const restored = allOrders.map(o => cancelIds.has(o.id) ? { ...o, status: 'shipped' as const } : o)
    saveOrders(restored)
    setChecked(new Set())
  }

  /* 출고확정: 바코드 기준 재고차감 + status → delivered */
  const [isConfirming, setIsConfirming] = useState(false)
  const handleConfirmShipping = async () => {
    if (checked.size === 0) return
    const toConfirm = displayOrders.filter(o => checked.has(o.id))
    if (!confirm(`선택한 ${toConfirm.length}건을 출고확정하시겠습니까?\n바코드 기준으로 상품 재고가 차감됩니다.`)) return
    setIsConfirming(true)
    try {
      const mappings = loadMappings()
      const products = loadCachedProducts()

      // 재고 차감 계산
      const stockChanges: Record<string, Record<number, number>> = {} // productId → { optionIdx → newStock }
      const notFound: string[] = []

      toConfirm.forEach(order => {
        const item = order.items[0]
        if (!item) return
        const mapping = lookupMapping(mappings, item.product_name ?? '', item.option)
        const barcode = mapping.barcode
        if (!barcode) { notFound.push(item.product_name ?? '?'); return }
        let found = false
        products.forEach(product => {
          product.options.forEach((opt, i) => {
            if (opt.barcode === barcode && !found) {
              found = true
              const cur = opt.current_stock !== undefined
                ? opt.current_stock
                : Math.max(0, (opt.received ?? 0) - (opt.sold ?? 0))
              const qty = item.quantity ?? 1
              if (!stockChanges[product.id]) stockChanges[product.id] = {}
              stockChanges[product.id][i] = (stockChanges[product.id][i] ?? cur) - qty
            }
          })
        })
        if (!found) notFound.push(item.product_name ?? '?')
      })

      // 캐시 업데이트
      const updatedProducts = products.map(p => {
        const changes = stockChanges[p.id]
        if (!changes) return p
        return {
          ...p,
          options: p.options.map((o, i) =>
            i in changes ? { ...o, current_stock: Math.max(0, changes[i]) } : o
          ),
        }
      })
      saveCachedProducts(updatedProducts)

      // Supabase 업데이트 (변경된 상품만)
      const changedIds = Object.keys(stockChanges)
      await Promise.all(changedIds.map(async productId => {
        const product = updatedProducts.find(p => p.id === productId)
        if (!product) return
        await fetch('/api/pm-products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: productId, options: product.options }),
        })
      }))

      // 출고내역 status → delivered
      const confirmedIds = new Set(toConfirm.map(o => o.id))
      const updatedShipped = shipped.map(o =>
        confirmedIds.has(o.id) ? { ...o, status: 'delivered' as const } : o
      )
      saveShippedOrders(updatedShipped)
      setShipped(updatedShipped)
      setChecked(new Set())

      const msg = notFound.length > 0
        ? `${toConfirm.length}건 출고확정 완료.\n재고 미차감 상품(바코드 없음): ${[...new Set(notFound)].join(', ')}`
        : `${toConfirm.length}건 출고확정 완료. 재고가 차감되었습니다.`
      alert(msg)
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '오늘 출고',   value: todayShipped,       color: '#2563eb', bg: '#eff6ff',  icon: <Truck size={18} style={{ color: '#2563eb' }} /> },
          { label: '이번달 출고', value: monthShipped,        color: '#7c3aed', bg: '#f5f3ff',  icon: <CheckCircle2 size={18} style={{ color: '#7c3aed' }} /> },
          { label: '전체 출고',   value: shipped.length,     color: '#059669', bg: '#ecfdf5',  icon: <Package size={18} style={{ color: '#059669' }} /> },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {k.icon}
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 뷰 토글 + 날짜 네비게이션 + 버튼 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 날짜별/월별 토글 */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e2e8f0', flexShrink: 0 }}>
          {(['daily', 'monthly'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer', background: viewMode === m ? '#0f172a' : 'transparent', color: viewMode === m ? '#fff' : '#64748b' }}>
              {m === 'daily' ? '날짜별' : '월별'}
            </button>
          ))}
        </div>

        {/* 날짜 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => viewMode === 'daily' ? setSelDate(shiftDate(selDate, -1)) : setSelMonth(shiftMonth(selMonth, -1))}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 200, textAlign: 'center' }}>
            {viewMode === 'daily'
              ? fmtDate(selDate)
              : `${selMonth.replace('-', '년 ')}월`}
          </span>
          <button onClick={() => viewMode === 'daily' ? setSelDate(shiftDate(selDate, 1)) : setSelMonth(shiftMonth(selMonth, 1))}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={14} />
          </button>
          {viewMode === 'daily' && selDate !== today && (
            <button onClick={() => setSelDate(today)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
              TODAY
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* 선택 액션 버튼 */}
        {checked.size > 0 && (
          <>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '5px 10px', borderRadius: 8 }}>
              {checked.size}건 선택
            </span>
            <button
              onClick={handleConfirmShipping}
              disabled={isConfirming}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: isConfirming ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: isConfirming ? 'not-allowed' : 'pointer' }}
            >
              <PackageCheck size={13} /> {isConfirming ? '처리중...' : '출고확정'}
            </button>
            <button
              onClick={handleCancelShipping}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
            >
              <RotateCcw size={13} /> 출고취소
            </button>
          </>
        )}
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ padding: '11px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={14} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
            {viewMode === 'daily'
              ? `${selDate} 출고내역`
              : `${selMonth.replace('-', '년 ')}월 출고내역`}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({displayOrders.length}건)</span>
        </div>

        {displayOrders.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {shipped.length === 0 ? '출고내역이 없습니다' : '해당 기간 출고내역이 없습니다'}
            </p>
            {shipped.length === 0 && (
              <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                송장입력 탭에서 운송장번호를 저장하면 자동으로 출고내역에 등록됩니다
              </p>
            )}
          </div>
        ) : (
          <div>
            {/* 컬럼 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 150px 80px 100px 120px 1fr 90px 120px',
              gap: 8, padding: '8px 20px',
              background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
            }}>
              <span onClick={toggleAll} style={{ cursor: 'pointer', fontSize: 13, color: allChecked ? '#2563eb' : '#cbd5e1' }}>
                {allChecked ? '☑' : '☐'}
              </span>
              {['주문번호', '출고일', '쇼핑몰', '상품코드', '상품명/옵션', '판매가', '운송장번호'].map(h => (
                <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>

            {/* 행 */}
            {displayOrders.map(o => {
              const isChk      = checked.has(o.id)
              const isDelivered = (o as ShippedOrder & { status?: string }).status === 'delivered'
              const item  = o.items[0]
              const ms    = mallStyle(o.channel)
              const sku   = item?.sku ?? ''
              const optLabel = item?.option ? `[${item.option}]` : ''

              return (
                <div
                  key={o.id}
                  onClick={() => toggleOne(o.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 150px 80px 100px 120px 1fr 90px 120px',
                    gap: 8, padding: '11px 20px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: isChk ? '#eff6ff' : isDelivered ? '#f0fdf4' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                >
                  <span style={{ fontSize: 14, color: isChk ? '#2563eb' : '#cbd5e1' }}>{isChk ? '☑' : '☐'}</span>

                  {/* 주문번호 */}
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.order_number}
                  </span>

                  {/* 출고일 */}
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {o.shipped_at ? o.shipped_at.slice(0, 10) : o.order_date}
                  </span>

                  {/* 쇼핑몰 */}
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: ms.color, background: ms.bg, padding: '2px 8px', borderRadius: 6 }}>
                      {o.channel}
                    </span>
                  </span>

                  {/* 상품코드 */}
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sku}
                  </span>

                  {/* 상품명/옵션 */}
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item?.product_name ?? '-'}
                    </p>
                    {optLabel && (
                      <p style={{ fontSize: 11, color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {optLabel}
                      </p>
                    )}
                  </div>

                  {/* 판매가 */}
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#334155', textAlign: 'right' }}>
                    {item?.unit_price ? item.unit_price.toLocaleString() : '-'}
                  </span>

                  {/* 운송장번호 + 확정뱃지 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: '#334155', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {o.tracking_number ?? '-'}
                    </span>
                    {isDelivered && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, width: 'fit-content' }}>
                        출고확정
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
