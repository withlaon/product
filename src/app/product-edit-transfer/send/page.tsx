'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  Send, CheckCircle2, Search, Package, Truck, Download, FileDown,
} from 'lucide-react'
import {
  loadOrders, saveOrders, loadMappings, lookupMapping, channelToMp,
  loadShippedOrders, saveShippedOrders,
} from '@/lib/orders'
import type { Order, ShippedOrder } from '@/lib/orders'
import { loadAllDayData } from '@/app/order-registration/page'

/* ─── 쇼핑몰별 다운로드 설정 ────────────────────────────── */
const DOWNLOAD_MALLS = [
  { id: 'marketplus',   label: '마켓플러스', color: '#e11d48', bg: '#fff1f2' },
  { id: 'tossshopping', label: '토스쇼핑',   color: '#4f46e5', bg: '#eef2ff' },
  { id: 'gsshop',       label: '지에스샵',   color: '#059669', bg: '#ecfdf5' },
  { id: 'always',       label: '올웨이즈',   color: '#d97706', bg: '#fffbeb' },
] as const

type DownloadMallId = typeof DOWNLOAD_MALLS[number]['id']

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

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/* ─── 마켓플러스 송장 파일 생성 ─────────────────────────── */
function downloadMarketPlusInvoice(allOrders: Order[]) {
  const mappings = loadMappings()
  // import_source = 'marketplus' 인 배송중 주문
  const mpOrders = allOrders.filter(o =>
    o.status === 'shipped' && o.tracking_number &&
    o.extra_data?.['import_source'] === 'marketplus'
  )

  if (mpOrders.length === 0) {
    alert('마켓플러스 배송처리된 주문이 없습니다.')
    return
  }

  const rows = mpOrders.map(o => {
    const item   = o.items[0]
    const option = item?.option ?? ''
    const pname  = item?.product_name ?? ''
    const m      = lookupMapping(mappings, pname, option)
    const ed     = o.extra_data ?? {}

    return {
      '매출경로':                          ed['매출경로'] ?? channelToMp(o.channel),
      '주문번호':                          ed['주문번호'] ?? o.order_number,
      '품목별 주문번호':                   ed['품목별_주문번호'] ?? o.order_number,
      '상품명(관리용)':                    m.abbreviation || String(ed['상품명관리용'] ?? ''),
      '상품명(한국어 쇼핑몰)':             pname,
      '상품옵션':                          option,
      '수량':                              item?.quantity ?? 1,
      '주문자명':                          String(ed['주문자명'] ?? o.customer_name),
      '수령인':                            o.customer_name,
      '수령인 전화번호':                   o.customer_phone ?? '',
      '수령인 우편번호':                   String(ed['수령인_우편번호'] ?? ''),
      '수령인 주소':                       o.shipping_address,
      '수령인 상세 주소':                  String(ed['수령인_상세주소'] ?? ''),
      '배송메시지':                        String(ed['배송메시지'] ?? o.memo ?? ''),
      '총 결제금액(KRW)':                  String(ed['총결제금액'] ?? o.total_amount ?? ''),
      '총 실결제금액(최초정보) (KRW)':     String(ed['총실결제금액'] ?? ''),
      '배송비 정보':                       String(ed['배송비정보'] ?? ''),
      '배송비 추가결제':                   String(ed['배송비추가결제'] ?? ''),
      '택배사':                            o.carrier ?? '',
      '송장번호':                          o.tracking_number ?? '',
    }
  })

  triggerExcelDownload(rows, `마켓플러스_송장_${todayStr()}.xlsx`)
}

/* ─── 일반 쇼핑몰 송장 파일 생성 ────────────────────────── */
function downloadMallInvoice(mallId: DownloadMallId, mallLabel: string, allOrders: Order[]) {
  // 해당 쇼핑몰의 배송중 주문
  const mallOrders = allOrders.filter(o =>
    o.status === 'shipped' && o.tracking_number &&
    o.extra_data?.['import_source'] === mallLabel
  )

  if (mallOrders.length === 0) {
    alert(`${mallLabel} 배송처리된 주문이 없습니다.`)
    return
  }

  // DayData에서 raw_rows 가져오기
  const allDayData = loadAllDayData(mallId)
  const trackingMap: Record<string, { carrier: string; tracking: string }> = {}
  mallOrders.forEach(o => {
    trackingMap[o.order_number] = {
      carrier:  o.carrier  ?? '',
      tracking: o.tracking_number ?? '',
    }
  })

  // raw_rows가 있으면 원본 형식 + 택배사/송장번호 추가
  const rows: Record<string, unknown>[] = []
  let usedRaw = false

  for (const dayData of allDayData) {
    for (const raw of dayData.raw_rows ?? []) {
      const orderNum = String(
        raw['주문번호'] ?? raw['order_number'] ?? raw['OrderNumber'] ?? ''
      )
      const tInfo = trackingMap[orderNum]
      if (tInfo) {
        // 토스쇼핑: 원본 파일의 택배사코드·송장번호 컬럼에 직접 채움
        if (mallId === 'tossshopping') {
          rows.push({ ...raw, '택배사코드': tInfo.carrier, '송장번호': tInfo.tracking })
        } else {
          rows.push({ ...raw, '택배사': tInfo.carrier, '송장번호': tInfo.tracking })
        }
        usedRaw = true
      }
    }
  }

  // raw_rows 없으면 기본 형식으로 생성
  if (!usedRaw || rows.length === 0) {
    mallOrders.forEach(o => {
      const item = o.items[0]
      rows.push({
        '주문번호':   o.order_number,
        '주문일':     o.order_date,
        '쇼핑몰':     o.channel,
        '상품명':     item?.product_name ?? '',
        '상품코드':   item?.sku ?? '',
        '옵션':       item?.option ?? '',
        '수량':       item?.quantity ?? 1,
        '판매가':     item?.unit_price ?? 0,
        '수취인':     o.customer_name,
        '연락처':     o.customer_phone ?? '',
        '배송주소':   o.shipping_address,
        '메모':       o.memo ?? '',
        '택배사':     o.carrier ?? '',
        '송장번호':   o.tracking_number ?? '',
      })
    })
  }

  triggerExcelDownload(rows, `${mallLabel}_송장_${todayStr()}.xlsx`)
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function InvoiceSendPage() {
  const router = useRouter()
  const [orders, setOrders]   = useState<Order[]>([])
  const [search, setSearch]   = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    setOrders(loadOrders())
  }, [])

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
  const toggleAll  = () => {
    if (allChecked) setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.delete(o.id)); return n })
    else            setChecked(prev => { const n = new Set(prev); filtered.forEach(o => n.add(o.id)); return n })
  }

  /* ── 출고확정: 선택된 주문을 출고내역으로 이동 ── */
  const handleConfirmShipping = () => {
    if (checked.size === 0) return
    const now = new Date().toISOString()
    const toConfirm = orders.filter(o => checked.has(o.id) && o.status === 'shipped' && o.tracking_number)
    if (toConfirm.length === 0) return

    // 출고내역에 추가
    const existing = loadShippedOrders()
    const existingIds = new Set(existing.map(o => o.id))
    const newShipped: ShippedOrder[] = toConfirm
      .filter(o => !existingIds.has(o.id))
      .map(o => ({ ...o, status: 'shipped' as const, shipped_at: now }))
    saveShippedOrders([...existing, ...newShipped])

    // pm_orders_v1에서 상태를 'delivered'로 변경
    const updatedOrders = orders.map(o =>
      checked.has(o.id) ? { ...o, status: 'delivered' as const } : o
    )
    setOrders(updatedOrders)
    saveOrders(updatedOrders)
    setChecked(new Set())
    alert(`${toConfirm.length}건이 출고내역으로 이동되었습니다.`)
  }

  const handleDownload = (mallId: DownloadMallId, mallLabel: string) => {
    setDownloading(mallId)
    try {
      if (mallId === 'marketplus') {
        downloadMarketPlusInvoice(orders)
      } else {
        downloadMallInvoice(mallId, mallLabel, orders)
      }
    } finally {
      setTimeout(() => setDownloading(null), 800)
    }
  }

  const pendingCount = shippedOrders.length
  const mallCounts   = useMemo(() => {
    const c: Record<string, number> = {}
    shippedOrders.forEach(o => {
      const src = String(o.extra_data?.['import_source'] ?? o.channel)
      c[src] = (c[src] ?? 0) + 1
    })
    return c
  }, [shippedOrders])

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* 내부 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { label: '송장입력',  path: '/product-edit-transfer/print' },
          { label: '송장전송용', path: '/product-edit-transfer/send'  },
        ].map(t => (
          <button key={t.path}
            onClick={() => router.push(t.path)}
            style={{
              padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 800,
              background: t.path.includes('send') ? '#1e293b' : 'transparent',
              color:      t.path.includes('send') ? 'white'   : '#64748b',
              transition: 'all 150ms',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '송장 등록 완료',  value: shippedOrders.length,                             color: '#7c3aed', bg: '#f5f3ff' },
          { label: '배송완료',        value: orders.filter(o => o.status === 'delivered').length, color: '#059669', bg: '#ecfdf5' },
          { label: '전체 주문',       value: orders.length,                                    color: '#2563eb', bg: '#eff6ff' },
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

      {/* 쇼핑몰별 파일 다운로드 */}
      <div className="pm-card" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FileDown size={15} style={{ color: '#475569' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>쇼핑몰별 송장 파일 다운로드</span>
          <span style={{ fontSize: 11.5, color: '#94a3b8' }}>· 배송처리된 주문 기준 · 파일명: 마켓명_송장_{todayStr()}.xlsx</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {DOWNLOAD_MALLS.map(mall => {
            const count = mallCounts[mall.id === 'marketplus' ? 'marketplus' : mall.label] ?? 0
            const isLoading = downloading === mall.id
            return (
              <button
                key={mall.id}
                onClick={() => handleDownload(mall.id, mall.label)}
                disabled={isLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', borderRadius: 12,
                  border: `1.5px solid ${mall.color}30`,
                  background: isLoading ? `${mall.color}08` : mall.bg,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 150ms ease',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = `${mall.color}15` }}
                onMouseLeave={e => { if (!isLoading) e.currentTarget.style.background = mall.bg }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${mall.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isLoading
                    ? <Download size={14} style={{ color: mall.color, animation: 'spin 1s linear infinite' }} />
                    : <Download size={14} style={{ color: mall.color }} />
                  }
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: mall.color, margin: 0 }}>{mall.label}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {count > 0 ? `${count}건 대기` : '주문 없음'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 검색 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="주문번호 · 수취인 · 운송장번호 검색..."
          style={{ flex: 1, height: 34, fontSize: 13, border: 'none', outline: 'none', background: 'transparent' }}
        />
        {checked.size > 0 && (
          <>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '5px 10px', borderRadius: 8 }}>
              {checked.size}건 선택
            </span>
            <button
              onClick={handleConfirmShipping}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
            >
              <Truck size={13} /> 출고확정
            </button>
          </>
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
              {shippedOrders.length === 0 ? '송장이 등록된 주문이 없습니다' : '검색 결과가 없습니다'}
            </p>
            {shippedOrders.length === 0 && (
              <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>송장출력용 탭에서 먼저 운송장번호를 등록해주세요</p>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 140px 72px 90px 1fr 160px 90px', gap: 10, padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              <span onClick={toggleAll} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 900, color: allChecked ? '#2563eb' : '#94a3b8' }}>
                {allChecked ? '☑' : '☐'}
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
                  <span style={{ fontSize: 14, color: isChk ? '#2563eb' : '#cbd5e1' }}>{isChk ? '☑' : '☐'}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.order_number}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{order.order_date}</span>
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
