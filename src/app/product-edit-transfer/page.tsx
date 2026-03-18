'use client'

import { useState, useEffect, useMemo } from 'react'
import { Truck, CheckCircle2, Search, Save, Package } from 'lucide-react'
import { loadOrders, saveOrders, ORDERS_KEY } from '@/app/product-transfer/page'
import type { Order } from '@/app/product-transfer/page'

const CARRIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배', '쿠팡로켓', '직접입력']

export default function InvoicePage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [search, setSearch]     = useState('')
  const [saved, setSaved]       = useState<Record<string, boolean>>({})
  const [edits, setEdits]       = useState<Record<string, { carrier: string; tracking: string }>>({})

  useEffect(() => { setOrders(loadOrders()) }, [])

  /* 송장 미등록 주문만 (취소 제외) */
  const needInvoice = useMemo(() =>
    orders.filter(o =>
      o.status !== 'cancelled' &&
      o.status !== 'delivered' &&
      !o.tracking_number
    ),
  [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return needInvoice
    return needInvoice.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.items[0]?.product_name?.toLowerCase().includes(q)
    )
  }, [needInvoice, search])

  const getEdit = (id: string) =>
    edits[id] ?? { carrier: 'CJ대한통운', tracking: '' }

  const setEdit = (id: string, field: 'carrier' | 'tracking', value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...getEdit(id), [field]: value } }))

  const handleSave = (order: Order) => {
    const edit = getEdit(order.id)
    if (!edit.tracking.trim()) return

    const updated = orders.map(o =>
      o.id === order.id
        ? { ...o, tracking_number: edit.tracking.trim(), carrier: edit.carrier, status: 'shipped' as const }
        : o
    )
    saveOrders(updated)
    setOrders(updated)
    setSaved(prev => ({ ...prev, [order.id]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [order.id]: false })), 2000)
  }

  const shippedCount = orders.filter(o => o.status === 'shipped').length

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '송장 미등록', value: needInvoice.length, color: '#dc2626', bg: '#fef2f2' },
          { label: '배송중',      value: shippedCount,        color: '#7c3aed', bg: '#f5f3ff' },
          { label: '배송완료',    value: orders.filter(o => o.status === 'delivered').length, color: '#059669', bg: '#ecfdf5' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Truck size={18} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 검색 */}
      <div className="pm-card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="주문번호 · 수취인 · 상품명 검색..."
          className="pm-input"
          style={{ flex: 1, height: 34, fontSize: 13, border: 'none', outline: 'none', background: 'transparent' }}
        />
      </div>

      {/* 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>송장 미등록 주문</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({filtered.length}건)</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {needInvoice.length === 0 ? '등록할 주문이 없습니다 🎉' : '검색 결과가 없습니다'}
            </p>
            {needInvoice.length === 0 && (
              <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>모든 주문의 송장이 등록되었습니다</p>
            )}
          </div>
        ) : (
          <div>
            {/* 테이블 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '150px 80px 1fr 90px 160px 200px 80px',
              gap: 12, padding: '8px 20px',
              background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
            }}>
              {['주문번호', '날짜', '상품명', '수취인', '택배사', '운송장번호', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {filtered.map(order => {
              const edit   = getEdit(order.id)
              const isSaved = saved[order.id]
              return (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px 80px 1fr 90px 160px 200px 80px',
                    gap: 12, padding: '11px 20px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: isSaved ? '#f0fdf4' : 'transparent',
                    transition: 'background 300ms',
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{order.order_date}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.items[0]?.product_name}
                    {order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>

                  {/* 택배사 선택 */}
                  <select
                    value={edit.carrier}
                    onChange={e => setEdit(order.id, 'carrier', e.target.value)}
                    style={{
                      height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0',
                      fontSize: 12, fontWeight: 600, color: '#334155',
                      padding: '0 8px', background: 'white', width: '100%',
                    }}
                  >
                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* 운송장번호 입력 */}
                  <input
                    value={edit.tracking}
                    onChange={e => setEdit(order.id, 'tracking', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(order) }}
                    placeholder="운송장번호 입력"
                    style={{
                      height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0',
                      fontSize: 12, fontWeight: 600, color: '#334155',
                      padding: '0 10px', width: '100%',
                      outline: 'none',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  />

                  {/* 저장 버튼 */}
                  <button
                    onClick={() => handleSave(order)}
                    disabled={!edit.tracking.trim() || isSaved}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 12px', height: 32,
                      background: isSaved ? '#059669' : edit.tracking.trim() ? '#2563eb' : '#e2e8f0',
                      color: isSaved || edit.tracking.trim() ? 'white' : '#94a3b8',
                      borderRadius: 8, border: 'none', cursor: edit.tracking.trim() ? 'pointer' : 'default',
                      fontSize: 12, fontWeight: 800, transition: 'background 200ms',
                      width: '100%', justifyContent: 'center',
                    }}
                  >
                    {isSaved
                      ? <><CheckCircle2 size={12} /> 완료</>
                      : <><Save size={12} /> 등록</>
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
