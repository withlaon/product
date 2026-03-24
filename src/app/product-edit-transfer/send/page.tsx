'use client'

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  Send, Search, Package, Truck, Download, FileDown,
  CheckSquare, Square, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  loadShippedOrders,
} from '@/lib/orders'
import type { ShippedOrder } from '@/lib/orders'
import { loadAllDayData } from '@/app/order-registration/page'

/* ─── 쇼핑몰별 다운로드 설정 ────────────────────────────── */
const DOWNLOAD_MALLS = [
  { id: 'marketplus',   label: '마켓플러스', color: '#e11d48', bg: '#fff1f2' },
  { id: 'tossshopping', label: '토스쇼핑',   color: '#4f46e5', bg: '#eef2ff' },
  { id: 'gsshop',       label: '지에스샵',   color: '#059669', bg: '#ecfdf5' },
  { id: 'always',       label: '올웨이즈',   color: '#d97706', bg: '#fffbeb' },
] as const

type DownloadMallId = typeof DOWNLOAD_MALLS[number]['id']

/* ─── 날짜 유틸 ─────────────────────────────────────────── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtDateKo(d: string) {
  const [y, mo, day] = d.split('-')
  const dow = ['일','월','화','수','목','금','토'][new Date(`${d}T00:00:00`).getDay()]
  return `${y}년 ${parseInt(mo)}월 ${parseInt(day)}일 (${dow})`
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/* ─── Excel 다운로드 헬퍼 ────────────────────────────────── */
function triggerExcelDownload(rows: Record<string, unknown>[], filename: string) {
  const ws  = XLSX.utils.json_to_sheet(rows)
  const wb  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '송장')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([out], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── 마켓플러스 송장 CSV 생성 ───────────────────────────── */
function downloadMarketPlusInvoice(orders: ShippedOrder[]) {
  const mpOrders = orders.filter(o =>
    o.status === 'shipped' && o.tracking_number &&
    (o.extra_data?.['import_source'] === 'marketplus' || o.channel === '마켓플러스')
  )
  if (mpOrders.length === 0) {
    alert('마켓플러스 배송처리된 주문이 없습니다.')
    return
  }
  const lines: string[] = ['주문번호,품목별 주문번호,운송장번호,수량']
  mpOrders.forEach(o => {
    const item   = o.items[0]
    const ed     = o.extra_data ?? {}
    const 주문번호 = String(ed['주문번호'] ?? o.order_number)
    const 품목별   = String(ed['품목별_주문번호'] ?? ed['품목별 주문번호'] ?? o.order_number)
    const 운송장   = o.tracking_number ?? ''
    const qty    = item?.quantity ?? 1
    const cols = [`"${주문번호}"`, `"${품목별}"`, `"${운송장}"`]
    if (qty > 1) cols.push(`"${qty}"`)
    lines.push(cols.join(','))
  })
  const csv  = '\uFEFF' + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `마켓플러스_송장_${todayStr()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

/* ─── 지에스샵 송장 파일 생성 (출하지시번호 + 송장번호 2열) ── */
function downloadGSShopInvoice(orders: ShippedOrder[]) {
  const gsOrders = orders.filter(o =>
    o.status === 'shipped' && o.tracking_number &&
    (o.extra_data?.['import_source'] === '지에스샵' || o.channel === '지에스샵')
  )
  if (gsOrders.length === 0) {
    alert('지에스샵 배송처리된 주문이 없습니다.')
    return
  }
  const rows = gsOrders.map(o => ({
    '출하지시번호': String(o.extra_data?.['출하지시번호'] ?? o.order_number),
    '송장번호':     o.tracking_number ?? '',
  }))
  triggerExcelDownload(rows, `지에스샵_송장_${todayStr()}.xlsx`)
}

/* ─── 일반 쇼핑몰 송장 파일 생성 ────────────────────────── */
function downloadMallInvoice(mallId: DownloadMallId, mallLabel: string, orders: ShippedOrder[]) {
  const mallOrders = orders.filter(o =>
    o.status === 'shipped' && o.tracking_number &&
    o.extra_data?.['import_source'] === mallLabel
  )
  if (mallOrders.length === 0) {
    alert(`${mallLabel} 배송처리된 주문이 없습니다.`)
    return
  }
  const allDayData = loadAllDayData(mallId)
  const trackingMap: Record<string, { carrier: string; tracking: string }> = {}
  mallOrders.forEach(o => {
    trackingMap[o.order_number] = { carrier: o.carrier ?? '', tracking: o.tracking_number ?? '' }
  })
  const rows: Record<string, unknown>[] = []
  let usedRaw = false
  for (const dayData of allDayData) {
    for (const raw of dayData.raw_rows ?? []) {
      const orderNum = String(raw['주문번호'] ?? raw['주문아이디'] ?? raw['order_number'] ?? raw['OrderNumber'] ?? '')
      const tInfo = trackingMap[orderNum]
      if (tInfo) {
        if (mallId === 'tossshopping') {
          rows.push({ ...raw, '송장번호': tInfo.tracking })
        } else if (mallId === 'always') {
          rows.push({ ...raw, '운송장번호': tInfo.tracking })
        } else {
          rows.push({ ...raw, '택배사': tInfo.carrier, '송장번호': tInfo.tracking })
        }
        usedRaw = true
      }
    }
  }
  if (!usedRaw || rows.length === 0) {
    mallOrders.forEach(o => {
      const item = o.items[0]
      rows.push({
        '주문번호': o.order_number, '주문일': o.order_date, '쇼핑몰': o.channel,
        '상품명': item?.product_name ?? '', '옵션': item?.option ?? '',
        '수량': item?.quantity ?? 1, '판매가': item?.unit_price ?? 0,
        '수취인': o.customer_name, '연락처': o.customer_phone ?? '',
        '배송주소': o.shipping_address, '메모': o.memo ?? '',
        '택배사': o.carrier ?? '', '송장번호': o.tracking_number ?? '',
      })
    })
  }
  triggerExcelDownload(rows, `${mallLabel}_송장_${todayStr()}.xlsx`)
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function InvoiceSendPage() {
  const today = getToday()
  const [allShipped, setAllShipped] = useState<ShippedOrder[]>([])
  const [search, setSearch]         = useState('')
  const [checked, setChecked]       = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState(today)
  const [showAllDates, setShowAllDates] = useState(false)

  useEffect(() => {
    // pm_shipped_orders_v1에서 status='shipped'인 것만 표시
    setAllShipped(loadShippedOrders().filter(o => o.status === 'shipped'))
  }, [])

  const filtered = useMemo(() => {
    let list = allShipped
    if (!showAllDates && dateFilter) {
      list = list.filter(o => (o.shipped_at ?? o.order_date).slice(0, 10) === dateFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      (o.tracking_number ?? '').toLowerCase().includes(q)
    )
  }, [allShipped, search, dateFilter, showAllDates])

  const toggleOne = (id: string) => setChecked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allChecked = filtered.length > 0 && filtered.every(o => checked.has(o.id))
  const toggleAll  = () => {
    if (allChecked) setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.delete(o.id)); return n })
    else            setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.add(o.id)); return n })
  }

  const mallCounts = useMemo(() => {
    const c: Record<string, number> = {}
    allShipped.forEach(o => {
      const src = String(o.extra_data?.['import_source'] ?? o.channel)
      c[src] = (c[src] ?? 0) + 1
    })
    return c
  }, [allShipped])

  const handleDownload = (mallId: DownloadMallId, mallLabel: string) => {
    setDownloading(mallId)
    try {
      if (mallId === 'marketplus') {
        downloadMarketPlusInvoice(allShipped)
      } else if (mallId === 'gsshop') {
        downloadGSShopInvoice(allShipped)
      } else {
        downloadMallInvoice(mallId, mallLabel, allShipped)
      }
    } finally {
      setTimeout(() => setDownloading(null), 800)
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전송 대기 주문', value: allShipped.length,   color: '#7c3aed', bg: '#f5f3ff' },
          { label: '현재 필터 건수', value: filtered.length,     color: '#2563eb', bg: '#eff6ff' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Send size={18} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11.5, color: k.color, fontWeight: 800, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 쇼핑몰별 파일 다운로드 */}
      <div className="pm-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FileDown size={15} style={{ color: '#475569' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>쇼핑몰별 송장 파일 다운로드</span>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>· 배송처리된 주문 기준</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {DOWNLOAD_MALLS.map(mall => {
            const count = mallCounts[mall.id === 'marketplus' ? 'marketplus' : mall.label] ?? 0
            const isLoading = downloading === mall.id
            return (
              <button key={mall.id} onClick={() => handleDownload(mall.id, mall.label)} disabled={isLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 12, border: `1.5px solid ${mall.color}30`, background: isLoading ? `${mall.color}08` : mall.bg, cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'all 150ms ease', opacity: isLoading ? 0.7 : 1 }}
                onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = `${mall.color}15` }}
                onMouseLeave={e => { if (!isLoading) e.currentTarget.style.background = mall.bg }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${mall.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Download size={14} style={{ color: mall.color }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: mall.color, margin: 0 }}>{mall.label}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{count > 0 ? `${count}건 대기` : '주문 없음'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 검색 + 날짜 네비 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="주문번호 · 수취인 · 운송장번호 검색..."
          style={{ flex: 1, height: 34, fontSize: 13, border: 'none', outline: 'none', background: 'transparent', minWidth: 140 }}
        />

        {/* 날짜 네비게이션 */}
        {!showAllDates && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setDateFilter(d => shiftDate(d, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} />
            </button>
            <div style={{ padding: '4px 12px', borderRadius: 8, background: dateFilter === today ? '#eff6ff' : '#f8fafc', border: `1px solid ${dateFilter === today ? '#bfdbfe' : '#e2e8f0'}`, minWidth: 170, textAlign: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{fmtDateKo(dateFilter)}</span>
              {dateFilter === today && <span style={{ fontSize: 10, fontWeight: 900, color: '#2563eb', background: '#dbeafe', padding: '1px 6px', borderRadius: 20, marginLeft: 6 }}>TODAY</span>}
            </div>
            <button onClick={() => setDateFilter(d => shiftDate(d, 1))}
              disabled={dateFilter >= today}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: dateFilter >= today ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dateFilter >= today ? 0.4 : 1 }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <button onClick={() => setShowAllDates(v => !v)}
          style={{ padding: '4px 10px', borderRadius: 7, background: showAllDates ? '#1e293b' : '#f1f5f9', color: showAllDates ? '#fff' : '#64748b', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          {showAllDates ? '날짜별' : '전체'}
        </button>

        {checked.size > 0 && (
          <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '5px 10px', borderRadius: 8 }}>
            {checked.size}건 선택
          </span>
        )}
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={15} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>송장 등록 완료 주문</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({filtered.length}건)</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {allShipped.length === 0 ? '송장이 등록된 주문이 없습니다' : '검색 결과가 없습니다'}
            </p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 140px 72px 90px 1fr 160px 90px', gap: 10, padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              <span onClick={toggleAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                {allChecked ? <CheckSquare size={14} style={{ color: '#2563eb' }} /> : <Square size={14} style={{ color: '#cbd5e1' }} />}
              </span>
              {['주문번호', '날짜', '채널', '상품명', '운송장번호', '수취인'].map(h => (
                <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {filtered.map(order => {
              const isChk = checked.has(order.id)
              const importSrc = String(order.extra_data?.['import_source'] ?? order.channel)
              const mallDef   = DOWNLOAD_MALLS.find(m => m.id === importSrc || m.label === importSrc)
              return (
                <div key={order.id}
                  style={{ display: 'grid', gridTemplateColumns: '32px 140px 72px 90px 1fr 160px 90px', gap: 10, padding: '11px 20px', borderBottom: '1px solid #f8fafc', alignItems: 'center', background: isChk ? '#eff6ff' : 'transparent', transition: 'background 100ms', cursor: 'pointer' }}
                  onClick={() => toggleOne(order.id)}
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    {isChk ? <CheckSquare size={14} style={{ color: '#2563eb' }} /> : <Square size={14} style={{ color: '#cbd5e1' }} />}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.order_number}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{(order.shipped_at ?? order.order_date).slice(0, 10)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: mallDef?.color ?? '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mallDef?.label ?? order.channel}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.items[0]?.product_name}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155', fontWeight: 700 }}>{order.tracking_number}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
