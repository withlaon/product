'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, Calendar, Package, Map, Printer,
  Truck, X, Save, ChevronLeft, ChevronRight,
  BarChart2, ListFilter, CheckSquare, Square,
} from 'lucide-react'
import {
  loadOrders, saveOrders, loadMappings, saveMappings, extractColor,
  saveSelectedForInvoice, STATUS_MAP, makeMappingKey, lookupMapping, splitMappingKey,
} from '@/lib/orders'
import type { Order, MappingStore } from '@/lib/orders'

/* ─── 하위 호환 re-export (product-edit-transfer가 import 함) ── */
export { loadOrders, saveOrders } from '@/lib/orders'
export { ORDERS_KEY } from '@/lib/orders'
export type { Order } from '@/lib/orders'

/* ─── 유틸 ──────────────────────────────────────────────── */
function getToday() { return new Date().toISOString().slice(0, 10) }

function addDays(d: string, n: number) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00:00').getDay()]
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일 (${dow})`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

/* ─── 피킹리스트 출력 ─────────────────────────────────────── */
function printPickingList(orders: Order[], mappings: MappingStore) {
  interface PickRow {
    order_number: string
    customer_name: string
    shipping_address: string
    abbreviation: string
    color: string
    quantity: number
    loca: string
    sku: string
  }

  const rows: PickRow[] = []
  for (const order of orders) {
    for (const item of order.items) {
      const m = lookupMapping(mappings, item.product_name, item.option)
      rows.push({
        order_number: order.order_number,
        customer_name: order.customer_name,
        shipping_address: order.shipping_address,
        abbreviation: m.abbreviation || item.product_name,
        color: extractColor(item.option ?? ''),
        quantity: item.quantity,
        loca: m.loca ?? '',
        sku: item.sku ?? '',
      })
    }
  }

  // LOCA 내림차순
  rows.sort((a, b) => b.loca.localeCompare(a.loca, 'ko'))

  // 같은 수령인+주소 카운트
  const addrCount: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.customer_name}||${r.shipping_address}`
    addrCount[k] = (addrCount[k] ?? 0) + 1
  }

  const today = getToday()
  const trRows = rows.map((r, i) => {
    const k = `${r.customer_name}||${r.shipping_address}`
    const isDup = addrCount[k] > 1
    const isQty2 = r.quantity >= 2
    let bg = ''
    if (isDup && isQty2) bg = 'background:#bbf7d0'
    else if (isDup)      bg = 'background:#bfdbfe'
    else if (isQty2)     bg = 'background:#fef9c3'
    return `<tr style="${bg}">
      <td style="text-align:center">${i + 1}</td>
      <td><b>${r.customer_name}</b></td>
      <td>${r.abbreviation}</td>
      <td>${r.color}</td>
      <td style="text-align:center;font-weight:900;${isQty2 ? 'color:#b45309' : ''}">${r.quantity}</td>
      <td style="text-align:center;font-family:monospace">${r.loca}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>피킹리스트 ${today}</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;margin:20px}
  h2{margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #475569;padding:6px 10px}
  th{background:#1e293b;color:#fff;font-weight:800;text-align:left}
  .btn{padding:8px 18px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:14px}
  @media print{.btn{display:none}}
</style></head><body>
<h2>📋 피킹리스트 — ${today} (${rows.length}건)</h2>
<button class="btn" onclick="window.print()">🖨 인쇄</button>
<table>
  <thead><tr>
    <th style="width:36px">NO</th>
    <th>수령인</th>
    <th>상품약어</th>
    <th>색상</th>
    <th style="width:46px">수량</th>
    <th style="width:70px">LOCA</th>
  </tr></thead>
  <tbody>${trRows}</tbody>
</table>
<div style="margin-top:14px;font-size:11px;color:#64748b">
  ● 파란배경: 동일 수령인·주소 중복  ● 노란배경: 수량 2개 이상  ● 초록배경: 중복+2개이상
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=720')
  if (w) { w.document.write(html); w.document.close() }
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function OrdersPage() {
  const router = useRouter()
  const today  = getToday()
  const now    = new Date()
  const curYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [orders, setOrders]         = useState<Order[]>([])
  const [viewMode, setViewMode]     = useState<'monthly' | 'daily'>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(curYM)
  const [checked, setChecked]       = useState<Set<string>>(new Set())
  const [mappings, setMappings]     = useState<MappingStore>({})
  const [showMapping, setShowMapping] = useState(false)
  const [draftMappings, setDraftMappings] = useState<MappingStore>({})
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  useEffect(() => {
    setOrders(loadOrders())
    setMappings(loadMappings())
  }, [])

  /* 스토리지 변경 이벤트 수신 (같은 탭 내 주문서등록 동기화) */
  useEffect(() => {
    const onStorage = () => {
      setOrders(loadOrders())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* 날짜별 표시 주문 */
  const dailyOrders = useMemo(() =>
    orders
      .filter(o => o.order_date === selectedDate)
      .sort((a, b) => {
        const ch = a.channel.localeCompare(b.channel, 'ko')
        if (ch !== 0) return ch
        const skuA = a.items[0]?.sku ?? ''
        const skuB = b.items[0]?.sku ?? ''
        const sk = skuA.localeCompare(skuB)
        if (sk !== 0) return sk
        const optA = a.items[0]?.option ?? ''
        const optB = b.items[0]?.option ?? ''
        const op = optA.localeCompare(optB, 'ko')
        if (op !== 0) return op
        return (b.items[0]?.unit_price ?? 0) - (a.items[0]?.unit_price ?? 0)
      }),
  [orders, selectedDate])

  /* 월별 표시 주문 (날짜 그룹화) */
  const monthOrders = useMemo(() =>
    orders.filter(o => o.order_date.startsWith(selectedMonth))
      .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.channel.localeCompare(b.channel, 'ko')),
  [orders, selectedMonth])

  const monthGrouped = useMemo(() => {
    const g: Record<string, Order[]> = {}
    monthOrders.forEach(o => { (g[o.order_date] ??= []).push(o) })
    return g
  }, [monthOrders])

  const displayOrders = viewMode === 'daily' ? dailyOrders : monthOrders

  /* 전체 선택 */
  const allChecked = displayOrders.length > 0 && displayOrders.every(o => checked.has(o.id))
  const toggleAll = () => {
    if (allChecked) {
      setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.delete(o.id)); return n })
    } else {
      setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.add(o.id)); return n })
    }
  }
  const toggleOne = (id: string) => setChecked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /* 매핑 모달 열기 - 상품명+옵션 복합키 */
  const openMapping = () => {
    const keySet: Record<string, boolean> = {}
    orders.forEach(o => {
      o.items.forEach(i => {
        const key = makeMappingKey(i.product_name, i.option ?? '')
        keySet[key] = true
      })
    })
    const draft: MappingStore = {}
    Object.keys(keySet).forEach(key => {
      draft[key] = mappings[key] ?? { abbreviation: '', loca: '' }
    })
    setDraftMappings(draft)
    setShowMapping(true)
  }

  const saveMapping = () => {
    saveMappings(draftMappings)
    setMappings(draftMappings)
    setShowMapping(false)
  }

  /* 피킹리스트 출력 */
  const handlePickingList = () => {
    const targets = checked.size > 0
      ? orders.filter(o => checked.has(o.id))
      : displayOrders
    if (targets.length === 0) return alert('출력할 주문이 없습니다.')
    printPickingList(targets, mappings)
  }

  /* 송장등록으로 이동 */
  const goToInvoice = () => {
    const targets = checked.size > 0
      ? Array.from(checked)
      : displayOrders.map(o => o.id)
    if (targets.length === 0) return alert('이동할 주문을 선택하세요.')
    saveSelectedForInvoice(targets)
    router.push('/product-edit-transfer/print')
  }

  /* KPI */
  const todayCount   = orders.filter(o => o.order_date === today).length
  const monthCount   = orders.filter(o => o.order_date.startsWith(curYM)).length
  const shippedCount = orders.filter(o => o.status === 'shipped').length

  /* ─── 테이블 행 공통 렌더 ─────────────────────────────── */
  const renderRow = (order: Order) => {
    const st   = STATUS_MAP[order.status] ?? STATUS_MAP.pending
    const item = order.items[0]
    const isChk = checked.has(order.id)
    return (
      <div
        key={order.id}
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 140px 80px 100px 1fr 80px 90px 90px',
          gap: 8, padding: '11px 16px',
          borderBottom: '1px solid #f1f5f9',
          alignItems: 'center',
          background: isChk ? '#eff6ff' : 'transparent',
          transition: 'background 100ms',
          cursor: 'pointer',
        }}
        onClick={() => setSelectedOrder(order)}
      >
        <span
          onClick={e => { e.stopPropagation(); toggleOne(order.id) }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {isChk
            ? <CheckSquare size={15} style={{ color: '#2563eb' }} />
            : <Square size={15} style={{ color: '#cbd5e1' }} />}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.order_number}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.channel}
        </span>
        <span style={{ fontSize: 11.5, color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item?.sku || '-'}
        </span>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item?.product_name}
          </p>
          {item?.option && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.option}
            </p>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>
          {item?.unit_price ? item.unit_price.toLocaleString() : '-'}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
          {order.customer_name}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: st.color, background: st.bg,
          padding: '3px 7px', borderRadius: 6, textAlign: 'center', display: 'block',
        }}>
          {st.label}
        </span>
      </div>
    )
  }

  const TableHeader = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 140px 80px 100px 1fr 80px 90px 90px',
      gap: 8, padding: '9px 16px',
      background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      <span
        onClick={toggleAll}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        {allChecked
          ? <CheckSquare size={14} style={{ color: '#2563eb' }} />
          : <Square size={14} style={{ color: '#cbd5e1' }} />}
      </span>
      {['주문번호', '쇼핑몰', '상품코드', '상품명/옵션', '판매가', '수취인', '상태'].map(h => (
        <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {h}
        </span>
      ))}
    </div>
  )

  /* ─── 렌더 ────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: '오늘 주문',   value: todayCount,   color: '#2563eb' },
          { label: '이번달 전체', value: monthCount,   color: '#7c3aed' },
          { label: '배송중',      value: shippedCount, color: '#059669' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingCart size={17} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 툴바 */}
      <div className="pm-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {/* 뷰 모드 토글 */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {(['daily', 'monthly'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '7px 14px', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: viewMode === mode ? '#1e293b' : 'white',
                color: viewMode === mode ? 'white' : '#64748b',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {mode === 'daily' ? <><Calendar size={13} />날짜별</> : <><BarChart2 size={13} />월별</>}
            </button>
          ))}
        </div>

        {/* 날짜/월 이동 */}
        {viewMode === 'daily' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSelectedDate(d => addDays(d, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} style={{ color: '#64748b' }} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', minWidth: 180, textAlign: 'center' }}>
              {fmtDate(selectedDate)}
              {selectedDate === today && <span style={{ fontSize: 10, background: '#dbeafe', color: '#2563eb', fontWeight: 900, padding: '2px 6px', borderRadius: 20, marginLeft: 6 }}>TODAY</span>}
            </span>
            <button onClick={() => selectedDate < today && setSelectedDate(d => addDays(d, 1))}
              disabled={selectedDate >= today}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: selectedDate < today ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedDate < today ? 1 : 0.3 }}>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSelectedMonth(m => addMonths(m, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} style={{ color: '#64748b' }} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', minWidth: 120, textAlign: 'center' }}>
              {fmtMonth(selectedMonth)}
            </span>
            <button onClick={() => selectedMonth < curYM && setSelectedMonth(m => addMonths(m, 1))}
              disabled={selectedMonth >= curYM}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: selectedMonth < curYM ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedMonth < curYM ? 1 : 0.3 }}>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {checked.size > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckSquare size={13} />{checked.size}건 선택
            </span>
          )}

          {/* 매핑하기 */}
          <button onClick={openMapping} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f1f5f9', color: '#475569', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Map size={13} />매핑하기
          </button>

          {/* 피킹리스트 출력 */}
          <button onClick={handlePickingList} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#059669', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Printer size={13} />피킹리스트 출력
          </button>

          {/* 송장등록으로 이동 */}
          <button onClick={goToInvoice} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#7c3aed', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Truck size={13} />송장등록 이동
          </button>
        </div>
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden', flex: 1 }}>
        {viewMode === 'daily' ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListFilter size={14} style={{ color: '#64748b' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                {fmtDate(selectedDate)} 주문
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({dailyOrders.length}건)</span>
              <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 8 }}>
                정렬: 쇼핑몰 → 상품코드 → 옵션 → 판매가↓
              </span>
            </div>
            {dailyOrders.length === 0 ? (
              <EmptyState text="해당 날짜의 주문이 없습니다" sub="주문서등록 탭에서 주문서를 업로드하세요" />
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                <TableHeader />
                {dailyOrders.map(renderRow)}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={14} style={{ color: '#64748b' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{fmtMonth(selectedMonth)} 주문</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({monthOrders.length}건)</span>
            </div>
            {monthOrders.length === 0 ? (
              <EmptyState text="해당 월의 주문이 없습니다" sub="주문서등록 탭에서 주문서를 업로드하세요" />
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                {Object.entries(monthGrouped)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, dayOrders]) => (
                    <div key={date}>
                      <div style={{
                        padding: '8px 16px',
                        background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'center', gap: 8,
                        position: 'sticky', top: 0, zIndex: 2,
                      }}>
                        <Calendar size={13} style={{ color: '#64748b' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>
                          {date === today ? `${fmtDate(date)} ⭐ 오늘` : fmtDate(date)}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{dayOrders.length}건</span>
                      </div>
                      <TableHeader />
                      {dayOrders.map(renderRow)}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 매핑 모달 ── */}
      {showMapping && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowMapping(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 18, padding: 28, width: '100%', maxWidth: 680, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 2 }}>상품 매핑 설정</h2>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>상품약어와 LOCA 위치코드를 입력하세요</p>
              </div>
              <button onClick={() => setShowMapping(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            {/* 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 100px', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}>
              {['상품명', '옵션', '약어 (상품약어)', 'LOCA'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {Object.keys(draftMappings).length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
                  주문관리에 등록된 상품이 없습니다.
                </p>
              ) : (
                Object.entries(draftMappings).map(([key, m]) => {
                  const [productName, option] = splitMappingKey(key)
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 130px 100px', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={productName}>
                        {productName}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={option}>
                        {option || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </span>
                      <input
                        value={m.abbreviation}
                        onChange={e => setDraftMappings(prev => ({ ...prev, [key]: { ...prev[key], abbreviation: e.target.value } }))}
                        placeholder="약어"
                        style={{ height: 32, borderRadius: 7, border: '1.5px solid #e2e8f0', padding: '0 10px', fontSize: 12, fontWeight: 600, outline: 'none', width: '100%' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                      />
                      <input
                        value={m.loca}
                        onChange={e => setDraftMappings(prev => ({ ...prev, [key]: { ...prev[key], loca: e.target.value } }))}
                        placeholder="LOCA"
                        style={{ height: 32, borderRadius: 7, border: '1.5px solid #e2e8f0', padding: '0 10px', fontSize: 12, fontWeight: 600, outline: 'none', width: '100%', fontFamily: 'monospace' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                        onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowMapping(false)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={saveMapping} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: 'white', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                <Save size={13} />저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 주문 상세 모달 ── */}
      {selectedOrder && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 18, padding: 28, maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
              <button onClick={() => setSelectedOrder(null)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#94a3b8' }} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {([
                ['주문번호', selectedOrder.order_number],
                ['쇼핑몰',   selectedOrder.channel],
                ['주문일',   selectedOrder.order_date],
                ['상태',     STATUS_MAP[selectedOrder.status]?.label ?? '-'],
                ['수취인',   selectedOrder.customer_name],
                ['연락처',   selectedOrder.customer_phone || '-'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>
            {selectedOrder.shipping_address && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address}</p>
              </div>
            )}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.12, display: 'block' }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{text}</p>
      <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>{sub}</p>
    </div>
  )
}
