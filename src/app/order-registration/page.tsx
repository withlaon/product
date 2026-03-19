'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, ChevronLeft, ChevronRight, Package,
  CheckCircle2, AlertCircle, Store, FileSpreadsheet,
} from 'lucide-react'
import { loadOrders, saveOrders, toOrderDate } from '@/lib/orders'
import type { Order } from '@/lib/orders'

/* ─── 쇼핑몰 정의 ────────────────────────────────────────── */
const MALLS = [
  { id: 'marketplus',   label: '마켓플러스', color: '#e11d48', bg: '#fff1f2', activeBg: '#ffe4e6' },
  { id: 'tossshopping', label: '토스쇼핑',   color: '#4f46e5', bg: '#eef2ff', activeBg: '#e0e7ff' },
  { id: 'gsshop',       label: '지에스샵',   color: '#059669', bg: '#ecfdf5', activeBg: '#d1fae5' },
  { id: 'always',       label: '올웨이즈',   color: '#d97706', bg: '#fffbeb', activeBg: '#fef3c7' },
  { id: 'zigzag',       label: '지그재그',   color: '#7c3aed', bg: '#f5f3ff', activeBg: '#ede9fe' },
] as const

type MallId = typeof MALLS[number]['id']

/* ─── 타입 ───────────────────────────────────────────────── */
interface RegOrderItem {
  product_name: string
  sku?: string
  quantity: number
  unit_price?: number
  option?: string
}

interface RegOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone?: string
  shipping_address: string
  items: RegOrderItem[]
  total_amount: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  memo?: string
}

interface DayData {
  mall: MallId
  date: string
  orders: RegOrder[]
  uploaded_at: string
}

/* ─── 상태 맵 ────────────────────────────────────────────── */
const STATUS_MAP = {
  pending:   { label: '결제완료', color: '#2563eb', bg: '#eff6ff' },
  confirmed: { label: '처리중',   color: '#d97706', bg: '#fffbeb' },
  shipped:   { label: '배송중',   color: '#7c3aed', bg: '#f5f3ff' },
  delivered: { label: '배송완료', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: '취소',     color: '#dc2626', bg: '#fef2f2' },
} as const

/* ─── 스토리지 헬퍼 ──────────────────────────────────────── */
function storageKey(mall: MallId, date: string) {
  return `order_reg_v1_${mall}_${date}`
}

function loadDayData(mall: MallId, date: string): DayData | null {
  try {
    const raw = localStorage.getItem(storageKey(mall, date))
    return raw ? (JSON.parse(raw) as DayData) : null
  } catch { return null }
}

function saveDayData(data: DayData) {
  try {
    localStorage.setItem(storageKey(data.mall, data.date), JSON.stringify(data))
  } catch {}
}

/* ─── 유틸리티 ───────────────────────────────────────────── */
function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateKo(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
}

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return days[new Date(dateStr + 'T00:00:00').getDay()] + '요일'
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}


/* ─── 페이지 컴포넌트 ─────────────────────────────────────── */
export default function OrderRegistrationPage() {
  const today = getToday()

  const [selectedMall, setSelectedMall] = useState<MallId | null>(null)
  const [currentDate, setCurrentDate]   = useState(today)
  const [dayData, setDayData]           = useState<DayData | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importMsg, setImportMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<RegOrder | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isToday   = currentDate === today
  const canGoNext = currentDate < today

  /* 쇼핑몰 또는 날짜 변경 시 데이터 로드 */
  useEffect(() => {
    if (!selectedMall) return
    setDayData(loadDayData(selectedMall, currentDate))
    setImportMsg(null)
  }, [selectedMall, currentDate])

  /* 쇼핑몰 선택 */
  const handleMallSelect = (mall: MallId) => {
    setSelectedMall(mall)
    setCurrentDate(today)
    setImportMsg(null)
    setSelectedOrder(null)
  }

  /* 파일 업로드 처리 */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedMall) return
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

        const orders: RegOrder[] = rows.map((row, idx) => {
          const orderNum = String(
            row['주문번호'] ?? row['order_number'] ?? row['OrderNumber'] ?? `AUTO-${Date.now()}-${idx}`
          )
          const rawDate  = row['주문일'] ?? row['주문일시'] ?? row['order_date'] ?? row['날짜'] ?? ''
          const orderDate = toOrderDate(rawDate, today)

          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
            order_date: orderDate,
            order_number: orderNum,
            customer_name:  String(row['수취인'] ?? row['고객명'] ?? row['받는분성명'] ?? row['customer_name'] ?? '-'),
            customer_phone: String(row['연락처'] ?? row['전화번호'] ?? row['받는분 연락처'] ?? row['phone'] ?? ''),
            shipping_address: String(row['배송주소'] ?? row['주소'] ?? row['받는분주소'] ?? row['address'] ?? ''),
            items: [{
              product_name: String(row['상품명'] ?? row['product_name'] ?? row['상품'] ?? '-'),
              sku:          String(row['SKU'] ?? row['상품코드'] ?? row['sku'] ?? ''),
              quantity:     Number(row['수량'] ?? row['quantity'] ?? row['qty'] ?? 1),
              unit_price:   Number(row['단가'] ?? row['판매가'] ?? row['price'] ?? 0),
              option:       String(row['옵션'] ?? row['option'] ?? ''),
            }],
            total_amount: Number(row['결제금액'] ?? row['총액'] ?? row['total'] ?? row['주문금액'] ?? 0),
            status: 'pending',
            memo: String(row['메모'] ?? row['비고'] ?? row['memo'] ?? ''),
          }
        })

        const uploadedAt = new Date().toISOString()
        const newData: DayData = {
          mall: selectedMall,
          date: today,
          orders,
          uploaded_at: uploadedAt,
        }
        saveDayData(newData)
        setDayData(newData)
        setCurrentDate(today)

        /* ── 주문관리(pm_orders_v1)에 실시간 동기화 ── */
        const mallLabel = MALLS.find(m => m.id === selectedMall)?.label ?? selectedMall
        const syncOrders: Order[] = orders.map(o => ({
          id: o.id,
          order_date: today,
          order_number: o.order_number,
          channel: mallLabel,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          shipping_address: o.shipping_address,
          items: o.items,
          total_amount: o.total_amount,
          status: o.status,
          tracking_number: undefined,
          carrier: undefined,
          memo: o.memo,
          uploaded_at: uploadedAt,
        }))
        const existingMain = loadOrders()
        // 같은 쇼핑몰+날짜 이전 업로드 제거 후 새 주문 추가
        const filtered = existingMain.filter(o => !(o.channel === mallLabel && o.order_date === today))
        saveOrders([...filtered, ...syncOrders])

        setImportMsg({ text: `${orders.length}건 등록 완료 (주문관리 동기화됨)`, ok: true })
      } catch (err) {
        setImportMsg({ text: '파일 파싱 오류: ' + String(err), ok: false })
      }
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const activeMall = MALLS.find(m => m.id === selectedMall)

  /* ─── 렌더 ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 108px)', minHeight: 500 }}>

      {/* ── 왼쪽: 쇼핑몰 선택 패널 ── */}
      <div
        className="pm-card"
        style={{
          width: 172, flexShrink: 0,
          padding: '16px 10px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, paddingLeft: 4 }}>
          <Store size={13} style={{ color: '#94a3b8' }} />
          <span style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            쇼핑몰 선택
          </span>
        </div>

        {MALLS.map(mall => {
          const isSel = selectedMall === mall.id
          return (
            <button
              key={mall.id}
              onClick={() => handleMallSelect(mall.id)}
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: 10,
                border: isSel ? `1.5px solid ${mall.color}50` : '1.5px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                fontSize: 13.5, fontWeight: isSel ? 800 : 600,
                color: isSel ? mall.color : '#64748b',
                background: isSel ? mall.activeBg : 'transparent',
                transition: 'all 150ms ease',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => {
                if (!isSel) {
                  e.currentTarget.style.background = '#f8fafc'
                  e.currentTarget.style.color = '#374151'
                }
              }}
              onMouseLeave={e => {
                if (!isSel) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#64748b'
                }
              }}
            >
              {isSel && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: mall.color, flexShrink: 0,
                }} />
              )}
              {mall.label}
            </button>
          )
        })}
      </div>

      {/* ── 오른쪽: 컨텐츠 영역 ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        {!selectedMall ? (
          /* 쇼핑몰 미선택 상태 */
          <div className="pm-card" style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 14,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Store size={32} style={{ color: '#cbd5e1' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>쇼핑몰을 선택해주세요</p>
              <p style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>왼쪽에서 주문서를 등록할 쇼핑몰을 선택하세요</p>
            </div>
          </div>
        ) : (
          <>
            {/* 날짜 네비게이션 + 업로드 바 */}
            <div className="pm-card" style={{
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              {/* 쇼핑몰 배지 */}
              <span style={{
                fontSize: 12, fontWeight: 800,
                color: activeMall?.color,
                background: activeMall?.bg,
                padding: '4px 12px', borderRadius: 20,
                border: `1px solid ${activeMall?.color}30`,
              }}>
                {activeMall?.label}
              </span>

              {/* 날짜 이동 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setCurrentDate(prev => addDays(prev, -1))}
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    border: '1px solid #e2e8f0', background: 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <ChevronLeft size={15} style={{ color: '#64748b' }} />
                </button>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 14px', borderRadius: 10,
                  background: isToday ? '#eff6ff' : '#f8fafc',
                  border: isToday ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  minWidth: 190,
                }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>
                    {formatDateKo(currentDate)}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    {getDayOfWeek(currentDate)}
                  </span>
                  {isToday && (
                    <span style={{
                      fontSize: 10, fontWeight: 900,
                      color: '#2563eb', background: '#dbeafe',
                      padding: '2px 7px', borderRadius: 20,
                    }}>
                      TODAY
                    </span>
                  )}
                </div>

                <button
                  onClick={() => { if (canGoNext) setCurrentDate(prev => addDays(prev, 1)) }}
                  disabled={!canGoNext}
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    border: '1px solid #e2e8f0', background: 'white',
                    cursor: canGoNext ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: canGoNext ? 1 : 0.3,
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (canGoNext) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <ChevronRight size={15} style={{ color: '#64748b' }} />
                </button>
              </div>

              {/* 업로드 버튼 (오늘만 활성) */}
              {isToday && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 18px',
                      background: activeMall?.color ?? '#2563eb',
                      color: 'white', borderRadius: 10,
                      fontSize: 13, fontWeight: 800, border: 'none',
                      cursor: importing ? 'not-allowed' : 'pointer',
                      opacity: importing ? 0.6 : 1,
                      transition: 'opacity 150ms',
                    }}
                  >
                    <Upload size={14} />
                    {importing ? '처리 중...' : '주문서 업로드'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={handleFile}
                  />
                </>
              )}

              {importMsg && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 8,
                  background: importMsg.ok ? '#ecfdf5' : '#fef2f2',
                }}>
                  {importMsg.ok
                    ? <CheckCircle2 size={13} style={{ color: '#059669' }} />
                    : <AlertCircle  size={13} style={{ color: '#dc2626' }} />}
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: importMsg.ok ? '#059669' : '#dc2626' }}>
                    {importMsg.text}
                  </span>
                </div>
              )}

              {dayData && dayData.orders.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#94a3b8', fontWeight: 700 }}>
                  총 {dayData.orders.length}건
                </span>
              )}
            </div>

            {/* 주문 목록 */}
            <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!dayData || dayData.orders.length === 0 ? (
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 12, padding: 48,
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 18,
                    background: '#f8fafc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FileSpreadsheet size={28} style={{ color: '#cbd5e1' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>
                      {isToday ? '주문서를 업로드해주세요' : '해당 날짜의 주문 내역이 없습니다'}
                    </p>
                    <p style={{ fontSize: 12.5, color: '#cbd5e1', fontWeight: 600 }}>
                      {isToday
                        ? `상단의 주문서 업로드 버튼으로 ${activeMall?.label} 주문서를 등록하세요`
                        : '이 날짜에 업로드된 주문서가 없습니다'}
                    </p>
                  </div>
                  {isToday && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={importing}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '10px 22px',
                        background: activeMall?.color ?? '#2563eb',
                        color: 'white', borderRadius: 12,
                        fontSize: 13.5, fontWeight: 800, border: 'none',
                        cursor: 'pointer', marginTop: 4,
                      }}
                    >
                      <Upload size={15} />
                      주문서 업로드
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {/* 테이블 헤더 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr 110px 70px 90px',
                    gap: 12, padding: '10px 20px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #f1f5f9',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>
                    {['주문번호', '상품명', '수취인', '수량', '상태'].map(h => (
                      <span key={h} style={{
                        fontSize: 11, fontWeight: 800,
                        color: '#94a3b8', textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  {/* 주문 행 */}
                  {dayData.orders.map((order, idx) => {
                    const st = STATUS_MAP[order.status] ?? STATUS_MAP.pending
                    const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)
                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 2fr 110px 70px 90px',
                          gap: 12, padding: '13px 20px',
                          borderBottom: idx < dayData.orders.length - 1 ? '1px solid #f8fafc' : 'none',
                          alignItems: 'center', cursor: 'pointer',
                          transition: 'background 100ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          fontSize: 11.5, fontWeight: 800,
                          color: activeMall?.color ?? '#2563eb',
                          fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {order.order_number}
                        </span>
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{
                            fontSize: 13, fontWeight: 700, color: '#0f172a',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {order.items[0]?.product_name}
                            {order.items.length > 1 && (
                              <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 4 }}>
                                외 {order.items.length - 1}건
                              </span>
                            )}
                          </p>
                          {order.items[0]?.option && (
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                              {order.items[0].option}
                            </p>
                          )}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                          {order.customer_name}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 800, color: '#475569',
                          textAlign: 'center',
                        }}>
                          {totalQty}
                        </span>
                        <span style={{
                          fontSize: 11.5, fontWeight: 800,
                          color: st.color, background: st.bg,
                          padding: '3px 8px', borderRadius: 6, textAlign: 'center',
                          display: 'block',
                        }}>
                          {st.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 주문 상세 모달 ── */}
      {selectedOrder && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(2,6,23,0.5)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{
              background: 'white', borderRadius: 20, padding: 28,
              maxWidth: 540, width: '100%',
              maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 20,
            }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 900, color: activeMall?.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {activeMall?.label}
                </p>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid #e2e8f0', background: 'white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Package size={14} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            {/* 주문 정보 그리드 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 14, marginBottom: 16,
            }}>
              {([
                ['주문번호', selectedOrder.order_number],
                ['수취인',   selectedOrder.customer_name],
                ['연락처',   selectedOrder.customer_phone || '-'],
                ['상태',     STATUS_MAP[selectedOrder.status]?.label ?? '-'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>

            {selectedOrder.shipping_address && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address}</p>
              </div>
            )}

            {/* 주문 상품 */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < selectedOrder.items.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku    && <p style={{ fontSize: 11,   color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? (
                      <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p>
                    ) : null}
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
