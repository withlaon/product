'use client'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/lib/utils'
import { ChevronDown, ChevronUp, ShoppingCart, Calendar } from 'lucide-react'

const ORDERS_STORAGE_KEY = 'pm_orders_v1'

type OrderItem = { name: string; sku: string; quantity: number; price: number; option_name?: string }
type Order = {
  id: string; order_number: string; channel: string; channel_order_id: string
  customer_name: string; customer_phone: string; shipping_address: string
  status: string; mapped_status?: string; total_amount: number; shipping_fee: number
  tracking_number: string | null; carrier: string | null
  created_at: string; items: OrderItem[]; is_claim?: boolean
}

type DayGroup = {
  dateStr: string   // yyyy-MM-dd
  label: string     // 표시용 (오늘, 어제, MM월 DD일 등)
  orders: Order[]
  total_amount: number
  total_qty: number
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  pending:    { label: '신규주문',   bg: '#fef9c3', color: '#854d0e' },
  processing: { label: '배송준비',   bg: '#dbeafe', color: '#1d4ed8' },
  shipped:    { label: '배송중',     bg: '#f3e8ff', color: '#7e22ce' },
  delivered:  { label: '완료',       bg: '#dcfce7', color: '#15803d' },
  cancelled:  { label: '취소',       bg: '#fee2e2', color: '#b91c1c' },
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10)
}

function dateLabel(dateStr: string): string {
  const today = toDateStr(new Date().toISOString())
  const yesterday = toDateStr(new Date(Date.now() - 86400000).toISOString())
  if (dateStr === today) return '오늘'
  if (dateStr === yesterday) return '어제'
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}월 ${parseInt(d)}일`
}

function loadOrders(): Order[] {
  try { const r = localStorage.getItem(ORDERS_STORAGE_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}

export default function OrderHistoryPage() {
  const [mounted, setMounted] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = useState('전체')
  const [monthFilter, setMonthFilter] = useState('전체')

  useEffect(() => {
    setMounted(true)
    setOrders(loadOrders())
  }, [])

  if (!mounted) return null

  const channels = Array.from(new Set(orders.map(o => o.channel)))
  const months   = Array.from(new Set(orders.map(o => o.created_at.slice(0, 7)))).sort().reverse()

  const filtered = orders.filter(o => {
    if (channelFilter !== '전체' && o.channel !== channelFilter) return false
    if (monthFilter !== '전체' && !o.created_at.startsWith(monthFilter)) return false
    return true
  })

  /* Group by date */
  const groupMap = new Map<string, Order[]>()
  filtered.forEach(o => {
    const d = toDateStr(o.created_at)
    if (!groupMap.has(d)) groupMap.set(d, [])
    groupMap.get(d)!.push(o)
  })
  const dayGroups: DayGroup[] = Array.from(groupMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateStr, dayOrders]) => ({
      dateStr,
      label: dateLabel(dateStr),
      orders: dayOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      total_amount: dayOrders.reduce((s, o) => s + o.total_amount, 0),
      total_qty: dayOrders.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0),
    }))

  const toggle = (d: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n
  })

  const totalOrders = filtered.length
  const totalAmount = filtered.reduce((s, o) => s + o.total_amount, 0)

  return (
    <div className="pm-page space-y-5">
      {/* 헤더 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '전체 주문', value: totalOrders + '건', bg: '#eff6ff', color: '#1d4ed8' },
          { label: '총 매출', value: '₩' + totalAmount.toLocaleString(), bg: '#f0fdf4', color: '#15803d' },
          { label: '신규주문', value: filtered.filter(o => o.status === 'pending').length + '건', bg: '#fef9c3', color: '#854d0e' },
          { label: '배송완료', value: filtered.filter(o => o.status === 'delivered').length + '건', bg: '#f3e8ff', color: '#7e22ce' },
        ].map(c => (
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: c.color, marginTop: 4, lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="pm-card p-4">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap:6 }}>
            <Calendar size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>월별:</span>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12.5, fontWeight: 700, color: '#374151', background: 'white', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체</option>
              {months.map(m => {
                const [y, mo] = m.split('-')
                return <option key={m} value={m}>{y}년 {parseInt(mo)}월</option>
              })}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShoppingCart size={14} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>쇼핑몰:</span>
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12.5, fontWeight: 700, color: '#374151', background: 'white', outline: 'none', cursor: 'pointer' }}>
              <option value="전체">전체</option>
              {channels.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setExpanded(new Set(dayGroups.map(g => g.dateStr)))}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#374151' }}>
            전체 펼치기
          </button>
          <button onClick={() => setExpanded(new Set())}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#374151' }}>
            전체 접기
          </button>
        </div>
      </div>

      {/* 일자별 그룹 */}
      {dayGroups.length === 0 ? (
        <div className="pm-card p-10" style={{ textAlign: 'center', color: '#94a3b8' }}>
          <ShoppingCart size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
          <p style={{ fontSize: 14, fontWeight: 700 }}>주문 내역이 없습니다</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>주문수집 탭에서 주문을 수집해주세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayGroups.map(group => {
            const isOpen = expanded.has(group.dateStr)
            return (
              <div key={group.dateStr} className="pm-card overflow-hidden">
                {/* 날짜 헤더 */}
                <button
                  onClick={() => toggle(group.dateStr)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 20px', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', border: 'none', textAlign: 'left', gap: 12, transition: 'background 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>
                      {group.label}
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>{group.dateStr}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', background: '#dbeafe', padding: '2px 10px', borderRadius: 8 }}>
                      {group.orders.length}건
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b' }}>
                      수량 {group.total_qty}개 · 매출 ₩{group.total_amount.toLocaleString()}
                    </span>
                    {/* 채널별 요약 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {Array.from(new Set(group.orders.map(o => o.channel))).map(ch => (
                        <span key={ch} style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '1px 7px', borderRadius: 5 }}>
                          {ch} {group.orders.filter(o => o.channel === ch).length}건
                        </span>
                      ))}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                </button>

                {/* 상세 주문 목록 */}
                {isOpen && (
                  <div className="pm-table-wrap">
                    <table className="pm-table">
                      <thead>
                        <tr>
                          <th>주문번호</th>
                          <th>주문일시</th>
                          <th>쇼핑몰</th>
                          <th>상품명</th>
                          <th>옵션</th>
                          <th>수량</th>
                          <th style={{ textAlign: 'right' }}>금액</th>
                          <th>주문자</th>
                          <th>상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map(o => {
                          const st = STATUS_LABEL[o.status] ?? STATUS_LABEL['pending']
                          return (
                            <tr key={o.id}>
                              <td>
                                <p style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563eb', fontSize: 12 }}>{o.order_number}</p>
                                <p style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>{o.channel_order_id}</p>
                              </td>
                              <td style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>{formatDateTime(o.created_at)}</td>
                              <td>
                                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#f8fafc', color: '#475569' }}>{o.channel}</span>
                              </td>
                              <td>
                                <p style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {o.items[0]?.name}
                                </p>
                                {o.items.length > 1 && <p style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>외 {o.items.length - 1}건</p>}
                              </td>
                              <td style={{ fontSize: 12, color: '#475569' }}>{o.items[0]?.option_name || o.items[0]?.sku || '-'}</td>
                              <td style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>
                                {o.items.reduce((s, i) => s + i.quantity, 0)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e293b', fontSize: 13 }}>
                                ₩{o.total_amount.toLocaleString()}
                              </td>
                              <td>
                                <p style={{ fontWeight: 800, color: '#1e293b', fontSize: 12.5 }}>{o.customer_name}</p>
                              </td>
                              <td>
                                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: st.bg, color: st.color }}>
                                  {st.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
