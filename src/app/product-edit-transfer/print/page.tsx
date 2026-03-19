'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Truck, CheckCircle2, Search, Save, Package, X, Printer,
} from 'lucide-react'
import {
  loadOrders, saveOrders, loadSelectedForInvoice, clearSelectedForInvoice, STATUS_MAP,
} from '@/lib/orders'
import type { Order } from '@/lib/orders'

const CARRIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배', '쿠팡로켓', '직접입력']

export default function InvoicePrintPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [search, setSearch]     = useState('')
  const [saved, setSaved]       = useState<Record<string, boolean>>({})
  const [edits, setEdits]       = useState<Record<string, { carrier: string; tracking: string }>>({})
  const [filterSelected, setFilterSelected] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    setOrders(loadOrders())
    const ids = loadSelectedForInvoice()
    if (ids.length > 0) {
      setSelectedIds(ids)
      setFilterSelected(true)
      clearSelectedForInvoice()
    }
  }, [])

  /* 송장 미등록 주문만 (취소·배송완료 제외) */
  const needInvoice = useMemo(() =>
    orders.filter(o =>
      o.status !== 'cancelled' &&
      o.status !== 'delivered' &&
      !o.tracking_number
    ),
  [orders])

  /* 선택 주문 필터 적용 */
  const baseList = useMemo(() =>
    filterSelected && selectedIds.length > 0
      ? needInvoice.filter(o => selectedIds.includes(o.id))
      : needInvoice,
  [needInvoice, filterSelected, selectedIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return baseList
    return baseList.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.items[0]?.product_name?.toLowerCase().includes(q)
    )
  }, [baseList, search])

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

  const handleSaveAll = () => {
    let updated = [...orders]
    let count = 0
    const newSaved: Record<string, boolean> = {}
    filtered.forEach(order => {
      const edit = getEdit(order.id)
      if (!edit.tracking.trim()) return
      updated = updated.map(o =>
        o.id === order.id
          ? { ...o, tracking_number: edit.tracking.trim(), carrier: edit.carrier, status: 'shipped' as const }
          : o
      )
      newSaved[order.id] = true
      count++
    })
    if (count === 0) return alert('입력된 운송장번호가 없습니다.')
    saveOrders(updated)
    setOrders(updated)
    setSaved(prev => ({ ...prev, ...newSaved }))
    setTimeout(() => setSaved(prev => {
      const n = { ...prev }
      Object.keys(newSaved).forEach(k => delete n[k])
      return n
    }), 2500)
  }

  /* 송장 출력 (새 창) */
  const printInvoices = () => {
    const printItems = filtered.filter(o => getEdit(o.id).tracking.trim() || saved[o.id])
    if (printItems.length === 0) {
      alert('출력할 운송장이 없습니다. 운송장번호를 먼저 입력하세요.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const rows = printItems.map(o => {
      const edit = getEdit(o.id)
      const tracking = edit.tracking.trim() || o.tracking_number || ''
      const carrier  = edit.carrier || o.carrier || ''
      return `<tr>
        <td>${o.order_number}</td>
        <td><b>${o.customer_name}</b></td>
        <td>${o.customer_phone || ''}</td>
        <td>${o.shipping_address}</td>
        <td>${o.items[0]?.product_name ?? ''}</td>
        <td style="font-family:monospace;font-weight:800">${tracking}</td>
        <td>${carrier}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>송장 목록 ${today}</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;margin:20px}
  h2{margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #475569;padding:6px 8px}
  th{background:#1e293b;color:#fff;font-weight:800;text-align:left}
  .btn{padding:8px 18px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:14px}
  @media print{.btn{display:none}}
</style></head><body>
<h2>📦 송장 목록 — ${today} (${printItems.length}건)</h2>
<button class="btn" onclick="window.print()">🖨 인쇄</button>
<table>
  <thead><tr>
    <th>주문번호</th><th>수취인</th><th>연락처</th><th>배송주소</th><th>상품명</th><th>운송장번호</th><th>택배사</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table></body></html>`
    const w = window.open('', '_blank', 'width=1100,height=700')
    if (w) { w.document.write(html); w.document.close() }
  }

  const shippedCount  = orders.filter(o => o.status === 'shipped').length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '송장 미등록', value: needInvoice.length, color: '#dc2626', bg: '#fef2f2' },
          { label: '배송중',      value: shippedCount,       color: '#7c3aed', bg: '#f5f3ff' },
          { label: '배송완료',    value: deliveredCount,     color: '#059669', bg: '#ecfdf5' },
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

      {/* 검색 + 액션 바 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="주문번호 · 수취인 · 상품명 검색..."
          style={{ flex: 1, height: 34, fontSize: 13, border: 'none', outline: 'none', background: 'transparent', minWidth: 200 }}
        />

        {selectedIds.length > 0 && (
          <button
            onClick={() => setFilterSelected(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 800,
              background: filterSelected ? '#2563eb' : '#f1f5f9',
              color: filterSelected ? 'white' : '#64748b',
            }}
          >
            {filterSelected ? <CheckCircle2 size={13} /> : <Package size={13} />}
            {filterSelected ? `주문관리 선택 ${selectedIds.length}건` : '전체 보기'}
          </button>
        )}

        <button
          onClick={handleSaveAll}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#059669', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}
        >
          <Save size={13} />일괄 등록
        </button>
        <button
          onClick={printInvoices}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#7c3aed', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}
        >
          <Printer size={13} />송장 출력
        </button>
      </div>

      {/* 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
            {filterSelected ? '선택된 주문 · 송장입력' : '송장 미등록 주문'}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({filtered.length}건)</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {needInvoice.length === 0 ? '모든 주문의 송장이 등록되었습니다 🎉' : '검색 결과가 없습니다'}
            </p>
          </div>
        ) : (
          <div>
            {/* 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '140px 72px 1fr 90px 150px 190px 76px',
              gap: 10, padding: '8px 20px',
              background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
            }}>
              {['주문번호', '날짜', '상품명', '수취인', '택배사', '운송장번호', ''].map(h => (
                <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {filtered.map(order => {
              const edit    = getEdit(order.id)
              const isSaved = saved[order.id]
              return (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 72px 1fr 90px 150px 190px 76px',
                    gap: 10, padding: '11px 20px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: isSaved ? '#f0fdf4' : 'transparent',
                    transition: 'background 300ms',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{order.order_date}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.items[0]?.product_name}{order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>

                  <select
                    value={edit.carrier}
                    onChange={e => setEdit(order.id, 'carrier', e.target.value)}
                    style={{ height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#334155', padding: '0 6px', background: 'white', width: '100%' }}
                  >
                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <input
                    value={edit.tracking}
                    onChange={e => setEdit(order.id, 'tracking', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(order) }}
                    placeholder="운송장번호 입력"
                    style={{ height: 32, borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#334155', padding: '0 10px', width: '100%', outline: 'none' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  />

                  <button
                    onClick={() => handleSave(order)}
                    disabled={!edit.tracking.trim() || isSaved}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 10px', height: 32,
                      background: isSaved ? '#059669' : edit.tracking.trim() ? '#2563eb' : '#e2e8f0',
                      color: isSaved || edit.tracking.trim() ? 'white' : '#94a3b8',
                      borderRadius: 8, border: 'none', cursor: edit.tracking.trim() ? 'pointer' : 'default',
                      fontSize: 12, fontWeight: 800, transition: 'background 200ms',
                      width: '100%', justifyContent: 'center',
                    }}
                  >
                    {isSaved ? <><CheckCircle2 size={12} />완료</> : <><Save size={12} />등록</>}
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
