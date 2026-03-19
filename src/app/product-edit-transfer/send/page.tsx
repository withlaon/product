'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Send, CheckCircle2, Search, Package, Truck, Clock, RefreshCw,
} from 'lucide-react'
import { loadOrders, saveOrders, STATUS_MAP } from '@/lib/orders'
import type { Order } from '@/lib/orders'

const SEND_KEY = 'pm_invoice_sent_v1'

function loadSentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(SEND_KEY) ?? '[]') } catch { return [] }
}
function markSent(ids: string[]) {
  try {
    const prev = loadSentIds()
    localStorage.setItem(SEND_KEY, JSON.stringify([...new Set([...prev, ...ids])]))
  } catch {}
}

export default function InvoiceSendPage() {
  const [orders, setOrders]     = useState<Order[]>([])
  const [search, setSearch]     = useState('')
  const [sentIds, setSentIds]   = useState<string[]>([])
  const [sending, setSending]   = useState<Record<string, boolean>>({})
  const [checked, setChecked]   = useState<Set<string>>(new Set())

  useEffect(() => {
    setOrders(loadOrders())
    setSentIds(loadSentIds())
  }, [])

  /* 송장 등록 완료된 주문 (배송중 상태) */
  const shippedOrders = useMemo(() =>
    orders.filter(o => o.status === 'shipped' && o.tracking_number),
  [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shippedOrders
    return shippedOrders.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      (o.tracking_number ?? '').toLowerCase().includes(q)
    )
  }, [shippedOrders, search])

  const toggleOne = (id: string) => setChecked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allChecked = filtered.length > 0 && filtered.every(o => checked.has(o.id))
  const toggleAll = () => {
    if (allChecked) setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.delete(o.id)); return n })
    else setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.add(o.id)); return n })
  }

  /* 전송 처리 (실제 API 연동 전 로컬 처리) */
  const handleSend = async (ids: string[]) => {
    if (ids.length === 0) return alert('전송할 주문을 선택하세요.')
    ids.forEach(id => setSending(prev => ({ ...prev, [id]: true })))

    // 실제 API 호출 위치 (현재는 1초 딜레이로 시뮬레이션)
    await new Promise(r => setTimeout(r, 900))

    const updated = orders.map(o =>
      ids.includes(o.id) ? { ...o, status: 'shipped' as const } : o
    )
    saveOrders(updated)
    setOrders(updated)
    markSent(ids)
    setSentIds(loadSentIds())
    setChecked(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    ids.forEach(id => setSending(prev => { const n = { ...prev }; delete n[id]; return n }))
  }

  const pendingCount  = filtered.filter(o => !sentIds.includes(o.id)).length
  const sentCount     = shippedOrders.filter(o => sentIds.includes(o.id)).length

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전송 대기',   value: pendingCount,                  color: '#d97706', bg: '#fffbeb' },
          { label: '전송 완료',   value: sentCount,                     color: '#059669', bg: '#ecfdf5' },
          { label: '송장 등록 완료', value: shippedOrders.length,        color: '#7c3aed', bg: '#f5f3ff' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Send size={18} style={{ color: k.color }} />
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
          placeholder="주문번호 · 수취인 · 운송장번호 검색..."
          style={{ flex: 1, height: 34, fontSize: 13, border: 'none', outline: 'none', background: 'transparent', minWidth: 200 }}
        />
        {checked.size > 0 && (
          <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '5px 10px', borderRadius: 8 }}>
            {checked.size}건 선택
          </span>
        )}
        <button
          onClick={() => handleSend(checked.size > 0 ? Array.from(checked) : filtered.filter(o => !sentIds.includes(o.id)).map(o => o.id))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#4f46e5', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}
        >
          <Send size={13} />
          {checked.size > 0 ? `선택 ${checked.size}건 전송` : '미전송 전체 전송'}
        </button>
      </div>

      {/* 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>송장 전송 목록</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({filtered.length}건)</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {shippedOrders.length === 0 ? '송장이 등록된 주문이 없습니다' : '검색 결과가 없습니다'}
            </p>
            {shippedOrders.length === 0 && (
              <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>송장출력용 탭에서 먼저 운송장번호를 등록해주세요</p>
            )}
          </div>
        ) : (
          <div>
            {/* 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 140px 72px 90px 1fr 160px 90px 100px',
              gap: 10, padding: '8px 20px',
              background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
            }}>
              <span
                onClick={toggleAll}
                style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 900, color: '#94a3b8' }}
              >
                □
              </span>
              {['주문번호', '날짜', '채널', '상품명', '운송장번호', '수취인', '전송상태'].map(h => (
                <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {filtered.map(order => {
              const isSent    = sentIds.includes(order.id)
              const isSending = sending[order.id]
              const isChk     = checked.has(order.id)
              return (
                <div
                  key={order.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 140px 72px 90px 1fr 160px 90px 100px',
                    gap: 10, padding: '11px 20px',
                    borderBottom: '1px solid #f8fafc',
                    alignItems: 'center',
                    background: isSent ? '#f0fdf4' : isChk ? '#eff6ff' : 'transparent',
                    transition: 'background 200ms',
                    cursor: isSent ? 'default' : 'pointer',
                  }}
                  onClick={() => !isSent && toggleOne(order.id)}
                >
                  <span style={{ fontSize: 14, color: isChk ? '#2563eb' : '#cbd5e1' }}>
                    {isChk ? '☑' : '☐'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{order.order_date}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.channel}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.items[0]?.product_name}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155', fontWeight: 700 }}>
                    {order.tracking_number}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>
                  <span>
                    {isSending ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#d97706' }}>
                        <RefreshCw size={12} />전송 중...
                      </span>
                    ) : isSent ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#059669', background: '#dcfce7', padding: '3px 8px', borderRadius: 6 }}>
                        <CheckCircle2 size={12} />전송완료
                      </span>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); handleSend([order.id]) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: '#4f46e5', color: 'white', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
                      >
                        <Send size={12} />전송
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
