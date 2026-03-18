'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, ShoppingCart, Calendar, X, ChevronRight,
  Package, AlertCircle, CheckCircle2,
} from 'lucide-react'

/* ─── 타입 ─────────────────────────────────────────────── */
interface OrderItem {
  product_name: string
  sku?: string
  quantity: number
  unit_price?: number
  option?: string
}

export interface Order {
  id: string
  order_date: string        // YYYY-MM-DD
  order_number: string
  channel: string
  customer_name: string
  customer_phone?: string
  shipping_address: string
  items: OrderItem[]
  total_amount: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  tracking_number?: string
  carrier?: string
  memo?: string
  uploaded_at: string
}

/* ─── localStorage 헬퍼 ────────────────────────────────── */
export const ORDERS_KEY = 'pm_orders_v1'

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveOrders(orders: Order[]) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)) } catch {}
}

/* ─── 상태 정보 ────────────────────────────────────────── */
const STATUS_MAP = {
  pending:   { label: '결제완료', color: '#2563eb', bg: '#eff6ff' },
  confirmed: { label: '처리중',   color: '#d97706', bg: '#fffbeb' },
  shipped:   { label: '배송중',   color: '#7c3aed', bg: '#f5f3ff' },
  delivered: { label: '배송완료', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: '취소',     color: '#dc2626', bg: '#fef2f2' },
} as const

function toDate(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'number') {
    // Excel serial number
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  try {
    const d = new Date(String(val))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  return ''
}

/* ─── 페이지 컴포넌트 ──────────────────────────────────── */
export default function OrdersPage() {
  const [orders, setOrders]             = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importMsg, setImportMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const now   = useMemo(() => new Date(), [])
  const yr    = now.getFullYear()
  const mo    = now.getMonth()

  useEffect(() => { setOrders(loadOrders()) }, [])

  /* 이번 달 주문 → 최신 날짜순 */
  const monthOrders = useMemo(() =>
    orders
      .filter(o => {
        const d = new Date(o.order_date)
        return d.getFullYear() === yr && d.getMonth() === mo
      })
      .sort((a, b) =>
        b.order_date.localeCompare(a.order_date) ||
        b.uploaded_at.localeCompare(a.uploaded_at)
      ),
  [orders, yr, mo])

  /* 날짜별 그룹 */
  const grouped = useMemo(() => {
    const g: Record<string, Order[]> = {}
    monthOrders.forEach(o => {
      if (!g[o.order_date]) g[o.order_date] = []
      g[o.order_date].push(o)
    })
    return g
  }, [monthOrders])

  const todayCount    = orders.filter(o => o.order_date === today).length
  const shippedCount  = monthOrders.filter(o => o.status === 'shipped').length

  /* ─── 엑셀 업로드 처리 ─────────────────────────────── */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (rows.length === 0) {
          setImportMsg({ text: '엑셀에 데이터가 없습니다.', ok: false })
          setImporting(false)
          return
        }

        const existing   = loadOrders()
        const newOrders: Order[] = []
        let duplicates = 0

        rows.forEach((row, idx) => {
          const orderNum = String(
            row['주문번호'] ?? row['order_number'] ?? row['OrderNumber'] ?? `AUTO-${Date.now()}-${idx}`
          )

          if (existing.find(o => o.order_number === orderNum)) {
            duplicates++
            return
          }

          const rawDate   = row['주문일'] ?? row['주문일시'] ?? row['order_date'] ?? row['날짜'] ?? ''
          const orderDate = toDate(rawDate) || today

          newOrders.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
            order_date: orderDate,
            order_number: orderNum,
            channel: String(row['채널'] ?? row['쇼핑몰'] ?? row['channel'] ?? row['Mall'] ?? '-'),
            customer_name: String(row['수취인'] ?? row['고객명'] ?? row['받는분성명'] ?? row['customer_name'] ?? '-'),
            customer_phone: String(row['연락처'] ?? row['전화번호'] ?? row['받는분 연락처'] ?? row['phone'] ?? ''),
            shipping_address: String(row['배송주소'] ?? row['주소'] ?? row['받는분주소'] ?? row['address'] ?? ''),
            items: [{
              product_name: String(row['상품명'] ?? row['product_name'] ?? row['상품'] ?? '-'),
              sku: String(row['SKU'] ?? row['상품코드'] ?? row['sku'] ?? ''),
              quantity: Number(row['수량'] ?? row['quantity'] ?? row['qty'] ?? 1),
              unit_price: Number(row['단가'] ?? row['판매가'] ?? row['price'] ?? 0),
              option: String(row['옵션'] ?? row['option'] ?? ''),
            }],
            total_amount: Number(row['결제금액'] ?? row['총액'] ?? row['total'] ?? row['주문금액'] ?? 0),
            status: 'pending',
            tracking_number: String(row['운송장번호'] ?? row['송장번호'] ?? row['tracking'] ?? ''),
            carrier: String(row['택배사'] ?? row['carrier'] ?? ''),
            memo: String(row['메모'] ?? row['비고'] ?? row['memo'] ?? ''),
            uploaded_at: new Date().toISOString(),
          })
        })

        const all = [...existing, ...newOrders]
        saveOrders(all)
        setOrders(all)
        setImportMsg({
          text: `${newOrders.length}건 등록 완료${duplicates > 0 ? ` (중복 ${duplicates}건 제외)` : ''}`,
          ok: true,
        })
      } catch (err) {
        setImportMsg({ text: '파일 파싱 오류: ' + String(err), ok: false })
      }
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  /* ─── 렌더 ─────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '오늘 주문',    value: todayCount,           color: '#2563eb' },
          { label: '이번달 전체',  value: monthOrders.length,   color: '#7c3aed' },
          { label: '배송중',       value: shippedCount,         color: '#059669' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingCart size={18} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 업로드 바 */}
      <div className="pm-card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: '#2563eb', color: 'white',
            borderRadius: 10, fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer',
            opacity: importing ? 0.6 : 1,
          }}
        >
          <Upload size={14} />
          {importing ? '처리 중...' : '오늘 주문 엑셀 업로드'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />

        {importMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: importMsg.ok ? '#ecfdf5' : '#fef2f2' }}>
            {importMsg.ok
              ? <CheckCircle2 size={13} style={{ color: '#059669' }} />
              : <AlertCircle  size={13} style={{ color: '#dc2626' }} />}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: importMsg.ok ? '#059669' : '#dc2626' }}>
              {importMsg.text}
            </span>
          </div>
        )}

        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
          주문번호 · 주문일 · 채널 · 수취인 · 상품명 · 수량 · 배송주소 컬럼 포함 파일
        </span>
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
            {yr}년 {mo + 1}월 주문 목록
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({monthOrders.length}건)</span>
        </div>

        {monthOrders.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>이번달 주문내역이 없습니다</p>
            <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>상단의 엑셀 업로드 버튼으로 주문을 등록하세요</p>
          </div>
        ) : (
          <div>
            {/* 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '160px 90px 1fr 100px 90px 32px',
              gap: 12, padding: '8px 20px',
              background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
            }}>
              {['주문번호', '채널', '상품명', '수취인', '상태', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, dayOrders]) => (
                <div key={date}>
                  {/* 날짜 구분선 */}
                  <div style={{
                    padding: '7px 20px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #f1f5f9',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#475569' }}>
                      {date === today ? `📅 오늘 (${date})` : `📅 ${date}`}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{dayOrders.length}건</span>
                  </div>

                  {dayOrders.map(order => {
                    const st = STATUS_MAP[order.status] ?? STATUS_MAP.pending
                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '160px 90px 1fr 100px 90px 32px',
                          gap: 12, padding: '12px 20px',
                          borderBottom: '1px solid #f8fafc',
                          alignItems: 'center', cursor: 'pointer',
                          transition: 'background 120ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace' }}>
                          {order.order_number}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{order.channel}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.items[0]?.product_name}
                          {order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{order.customer_name}</span>
                        <span style={{
                          fontSize: 11.5, fontWeight: 800,
                          color: st.color, background: st.bg,
                          padding: '3px 8px', borderRadius: 6, textAlign: 'center',
                        }}>
                          {st.label}
                        </span>
                        <ChevronRight size={13} style={{ color: '#cbd5e1' }} />
                      </div>
                    )
                  })}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selectedOrder && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 560, width: '100%', maxHeight: '82vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
              <button onClick={() => setSelectedOrder(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {([
                ['주문번호', selectedOrder.order_number],
                ['주문일',   selectedOrder.order_date],
                ['채널',     selectedOrder.channel],
                ['상태',     STATUS_MAP[selectedOrder.status]?.label ?? '-'],
                ['수취인',   selectedOrder.customer_name],
                ['연락처',   selectedOrder.customer_phone || '-'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address || '-'}</p>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku   && <p style={{ fontSize: 11,   color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p> : null}
                  </div>
                </div>
              ))}
              {selectedOrder.total_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                    총 {selectedOrder.total_amount.toLocaleString()}원
                  </span>
                </div>
              )}
            </div>

            {selectedOrder.tracking_number && (
              <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                  {selectedOrder.carrier && `[${selectedOrder.carrier}] `}운송장: {selectedOrder.tracking_number}
                </p>
              </div>
            )}

            {selectedOrder.memo && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: '#64748b' }}>메모: {selectedOrder.memo}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
