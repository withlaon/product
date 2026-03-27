'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  Upload, ChevronLeft, ChevronRight, Package,
  CheckCircle2, AlertCircle, Store, FileSpreadsheet,
  CheckSquare, Square, Trash2, PackageCheck, PenLine,
} from 'lucide-react'
import {
  loadOrders, saveOrders, toOrderDate,
  loadMappings, saveMappings, makeMappingKey, mpToChannel, lookupMapping,
} from '@/lib/orders'
import type { Order } from '@/lib/orders'

/* ─── 쇼핑몰 정의 (지그재그 제외) ──────────────────────── */
const MALLS = [
  { id: 'marketplus',   label: '마켓플러스', color: '#e11d48', bg: '#fff1f2', activeBg: '#ffe4e6' },
  { id: 'tossshopping', label: '토스쇼핑',   color: '#4f46e5', bg: '#eef2ff', activeBg: '#e0e7ff' },
  { id: 'gsshop',       label: '지에스샵',   color: '#059669', bg: '#ecfdf5', activeBg: '#d1fae5' },
  { id: 'always',       label: '올웨이즈',   color: '#d97706', bg: '#fffbeb', activeBg: '#fef3c7' },
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
  extra_data?: Record<string, unknown>  // 쇼핑몰별 추가 원본 데이터
}

interface DayData {
  mall: string
  date: string
  orders: RegOrder[]
  raw_rows?: Record<string, unknown>[]  // 원본 Excel 행 (송장전송 파일 재생성용)
  uploaded_at: string
}

/* ─── 직접등록 폼 타입 ───────────────────────────────────── */
interface DirectForm {
  mall: string
  orderNumber: string
  productCode: string
  option: string
  productName: string
  abbreviation: string
  barcode: string
  quantity: number
  recipientName: string
  recipientAddress: string
  phone: string
  deliveryMessage: string
}

const emptyDirectForm = (): DirectForm => ({
  mall: '', orderNumber: '', productCode: '', option: '',
  productName: '', abbreviation: '', barcode: '',
  quantity: 1, recipientName: '', recipientAddress: '',
  phone: '', deliveryMessage: '',
})

/* ─── 상태 맵 ────────────────────────────────────────────── */
const STATUS_MAP = {
  pending:   { label: '결제완료', color: '#2563eb', bg: '#eff6ff' },
  confirmed: { label: '처리중',   color: '#d97706', bg: '#fffbeb' },
  shipped:   { label: '배송중',   color: '#7c3aed', bg: '#f5f3ff' },
  delivered: { label: '배송완료', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: '취소',     color: '#dc2626', bg: '#fef2f2' },
} as const

/* ─── 스토리지 헬퍼 ──────────────────────────────────────── */
function storageKey(mall: string, date: string) {
  return `order_reg_v1_${mall}_${date}`
}

function loadDayData(mall: string, date: string): DayData | null {
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

/* ─── 모든 날짜의 DayData 조회 (다운로드용) ─────────────── */
export function loadAllDayData(mall: string): DayData[] {
  const result: DayData[] = []
  try {
    const prefix = `order_reg_v1_${mall}_`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const raw = localStorage.getItem(key)
        if (raw) result.push(JSON.parse(raw) as DayData)
      }
    }
  } catch {}
  return result
}

/* ─── 유틸리티 ───────────────────────────────────────────── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/* ─── 마켓플러스 전용 파싱 ───────────────────────────────── */
function parseMarketPlusRow(row: Record<string, unknown>, idx: number, today: string): {
  order: RegOrder
  channel: string
  autoMappingKey?: string
  autoMappingAbbr?: string
} {
  const 매출경로    = String(row['매출경로'] ?? '')
  const channel   = mpToChannel(매출경로)
  const productName = String(row['상품명(한국어 쇼핑몰)'] ?? row['상품명'] ?? '-')
  const option      = String(row['상품옵션'] ?? row['옵션'] ?? '')
  const mgmtName    = String(row['상품명(관리용)'] ?? '')  // 상품약어
  const orderNum    = String(row['주문번호'] ?? `AUTO-MP-${Date.now()}-${idx}`)

  const order: RegOrder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['수령인'] ?? '-'),
    customer_phone:   String(row['수령인 전화번호'] ?? ''),
    shipping_address: String(row['수령인 주소(전체)'] ?? row['수령인 주소'] ?? ''),
    items: [{
      product_name: productName,
      sku: '',
      quantity: Number(row['수량'] ?? 1),
      unit_price: Number(row['총 실결제금액(최초정보) (KRW)'] ?? row['총 결제금액(KRW)'] ?? 0),
      option,
    }],
    total_amount: Number(row['총 결제금액(KRW)'] ?? 0),
    status: 'pending',
    memo: String(row['배송메시지'] ?? ''),
    extra_data: {
      import_source:        'marketplus',
      매출경로,
      주문번호:             orderNum,
      품목별_주문번호:      String(row['품목별 주문번호'] ?? ''),
      수령인_우편번호:      String(row['수령인 우편번호'] ?? ''),
      수령인_상세주소:      String(row['수령인 상세 주소'] ?? ''),
      배송메시지:           String(row['배송메시지'] ?? ''),
      총결제금액:           String(row['총 결제금액(KRW)'] ?? ''),
      총실결제금액:         String(row['총 실결제금액(최초정보) (KRW)'] ?? ''),
      배송비정보:           String(row['배송비 정보'] ?? ''),
      배송비추가결제:       String(row['배송비 추가결제'] ?? ''),
      주문자명:             String(row['주문자명'] ?? ''),
      상품명관리용:         mgmtName,
    },
  }

  return {
    order,
    channel,
    autoMappingKey:  mgmtName ? makeMappingKey(productName, option) : undefined,
    autoMappingAbbr: mgmtName || undefined,
  }
}

/* ─── 상품 캐시에서 채널 판매가 조회 ────────────────────── */
interface CachedProductPrice {
  name: string
  abbr: string
  channel_prices: Array<{ channel: string; price: number }>
}

function lookupChannelPrice(
  products: CachedProductPrice[],
  productName: string,
  channel: string,
): number {
  const lowerName = productName.toLowerCase()
  const p =
    products.find(p => p.name === productName) ??
    products.find(p => p.abbr && p.abbr === productName) ??
    products.find(p => p.name.toLowerCase().includes(lowerName) || lowerName.includes(p.name.toLowerCase()))
  if (!p) return 0
  return p.channel_prices.find(cp => cp.channel === channel)?.price ?? 0
}

function loadCachedProductsForPrice(): CachedProductPrice[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const parsed = JSON.parse(raw) as { ts: number; data: CachedProductPrice[] }
    if (Date.now() - parsed.ts < 10 * 60 * 1000 && Array.isArray(parsed.data)) return parsed.data
  } catch {}
  return []
}

/* ─── 토스쇼핑 전용 파싱 ─────────────────────────────────── */
function parseTossShoppingRow(row: Record<string, unknown>, idx: number): RegOrder {
  const orderNum = String(row['주문번호'] ?? `AUTO-TOSS-${Date.now()}-${idx}`)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['수령인명'] ?? row['구매자명'] ?? '-'),
    customer_phone:   String(row['수령인 연락처'] ?? row['구매자 연락처'] ?? ''),
    shipping_address: String(row['주소'] ?? ''),
    items: [{
      product_name: String(row['상품명'] ?? '-'),
      sku:          String(row['옵션코드'] ?? row['상품코드'] ?? ''),
      quantity:     Number(row['수량'] ?? 1),
      unit_price:   Number(row['거래금액'] ?? 0),
      option:       String(row['옵션'] ?? ''),
    }],
    total_amount: Number(row['거래금액'] ?? 0),
    status: 'pending',
    memo: String(row['요청사항'] ?? ''),
    extra_data: {
      import_source:   '토스쇼핑',
      주문번호:        orderNum,
      주문상품번호:    String(row['주문상품번호'] ?? ''),
      우편번호:        String(row['우편번호'] ?? ''),
      발송기한:        String(row['발송기한'] ?? ''),
      택배사코드:      String(row['택배사코드'] ?? ''),
    },
  }
}

/* ─── 지에스샵 전용 파싱 ─────────────────────────────────── */
function parseGSShopRow(row: Record<string, unknown>, idx: number): RegOrder {
  const orderNum = String(row['출하지시번호'] ?? `AUTO-GS-${Date.now()}-${idx}`)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['수취인'] ?? '-'),
    customer_phone:   String(row['수취인핸드폰'] ?? ''),
    shipping_address: String(row['수취인주소'] ?? ''),
    items: [{
      product_name: String(row['상품명(송장)'] ?? row['상품명(인터넷)'] ?? '-'),
      sku:          String(row['협력사상품코드'] ?? ''),
      quantity:     Number(row['수량'] ?? 1),
      unit_price:   Number(row['협력사지급금액'] ?? 0),
      option:       String(row['주문옵션'] ?? ''),
    }],
    total_amount: Number(row['협력사지급금액'] ?? 0),
    status: 'pending',
    memo: String(row['배송메세지'] ?? ''),
    extra_data: {
      import_source:   '지에스샵',
      출하지시번호:    orderNum,
      우편번호:        String(row['우편번호'] ?? ''),
      상품상세코드:    String(row['상품상세코드'] ?? ''),
      상품명_인터넷:   String(row['상품명(인터넷)'] ?? ''),
      협력사지급금액:  String(row['협력사지급금액'] ?? ''),
    },
  }
}

/* ─── 올웨이즈 전용 파싱 ─────────────────────────────────── */
function parseAlwaysRow(row: Record<string, unknown>, idx: number): RegOrder {
  const orderNum = String(row['주문아이디'] ?? `AUTO-ALWAYS-${Date.now()}-${idx}`)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['수령인'] ?? '-'),
    customer_phone:   String(row['수령인 연락처'] ?? ''),
    shipping_address: String(row['주소'] ?? ''),
    items: [{
      product_name: String(row['상품명'] ?? '-'),
      sku:          String(row['판매자 상품코드'] ?? row['상품아이디'] ?? ''),
      quantity:     Number(row['수량'] ?? 1),
      unit_price:   Number(row['상품가격'] ?? 0),
      option:       String(row['옵션'] ?? ''),
    }],
    total_amount: Number(row['상품가격'] ?? 0),
    status: 'pending',
    memo: String(row['공동현관 비밀번호'] ?? ''),
    extra_data: {
      import_source: '올웨이즈',
      주문아이디:   orderNum,
      합배송아이디: String(row['합배송아이디'] ?? ''),
      주문시점:     String(row['주문 시점'] ?? ''),
      우편번호:     String(row['우편번호'] ?? ''),
    },
  }
}

/* ─── 일반 쇼핑몰 파싱 ──────────────────────────────────── */
function parseGenericRow(row: Record<string, unknown>, idx: number, today: string, mallLabel: string): RegOrder {
  const orderNum  = String(row['주문번호'] ?? row['order_number'] ?? row['OrderNumber'] ?? `AUTO-${Date.now()}-${idx}`)
  const rawDate   = row['주문일'] ?? row['주문일시'] ?? row['order_date'] ?? row['날짜'] ?? ''
  void rawDate  // used below via toOrderDate

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['수취인'] ?? row['고객명'] ?? row['받는분성명'] ?? row['customer_name'] ?? '-'),
    customer_phone:   String(row['연락처'] ?? row['전화번호'] ?? row['받는분 연락처'] ?? row['phone'] ?? ''),
    shipping_address: String(row['배송주소'] ?? row['주소'] ?? row['받는분주소'] ?? row['address'] ?? ''),
    items: [{
      product_name: String(row['상품명'] ?? row['product_name'] ?? row['상품'] ?? '-'),
      sku:          String(row['SKU'] ?? row['상품코드'] ?? row['sku'] ?? ''),
      quantity:     Number(row['수량'] ?? row['quantity'] ?? row['qty'] ?? 1),
      unit_price:   Number(row['단가'] ?? row['판매가'] ?? row['price'] ?? 0),
      option:       String(row['옵션'] ?? row['option'] ?? row['상품옵션'] ?? ''),
    }],
    total_amount: Number(row['결제금액'] ?? row['총액'] ?? row['total'] ?? row['주문금액'] ?? 0),
    status: 'pending',
    memo: String(row['메모'] ?? row['비고'] ?? row['memo'] ?? ''),
    extra_data: {
      import_source: mallLabel,
    },
  }
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
  const [checkedIds, setCheckedIds]     = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  /* 직접등록 */
  const router = useRouter()
  const [directMode, setDirectMode]     = useState(false)
  const [directForm, setDirectForm]     = useState<DirectForm>(emptyDirectForm())
  const [directSaving, setDirectSaving] = useState(false)
  const [directMsg, setDirectMsg]       = useState<{ text: string; ok: boolean } | null>(null)

  const isToday   = currentDate === today
  const canGoNext = currentDate < today

  useEffect(() => {
    if (!selectedMall) return
    setDayData(loadDayData(selectedMall, currentDate))
    setImportMsg(null)
    setCheckedIds(new Set())
  }, [selectedMall, currentDate])

  const orders = dayData?.orders ?? []
  const allChecked = orders.length > 0 && orders.every(o => checkedIds.has(o.id))
  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(orders.map(o => o.id)))
    }
  }
  const toggleOne = (id: string) => setCheckedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /* 선택 항목 삭제 */
  const handleDeleteChecked = () => {
    if (checkedIds.size === 0 || !selectedMall || !dayData) return
    if (!confirm(`선택된 ${checkedIds.size}건을 삭제하시겠습니까?`)) return

    const remaining = dayData.orders.filter(o => !checkedIds.has(o.id))
    const newData: DayData = { ...dayData, orders: remaining }
    saveDayData(newData)
    setDayData(newData)
    setCheckedIds(new Set())

    // pm_orders_v1 에서도 제거
    const mainOrders = loadOrders()
    const deletedIds = new Set(
      dayData.orders.filter(o => checkedIds.has(o.id)).map(o => o.id)
    )
    saveOrders(mainOrders.filter(o => !deletedIds.has(o.id)))
  }

  /* 주문확인 - 주문서등록 목록에서만 제거 (주문관리에는 유지) */
  const handleOrderConfirm = () => {
    if (checkedIds.size === 0 || !selectedMall || !dayData) return
    if (!confirm(`선택된 ${checkedIds.size}건을 주문확인 처리하시겠습니까?\n주문서등록 목록에서 삭제되고 주문관리 탭에서 확인할 수 있습니다.`)) return

    const remaining = dayData.orders.filter(o => !checkedIds.has(o.id))
    const newData: DayData = { ...dayData, orders: remaining }
    saveDayData(newData)
    setDayData(newData)
    setCheckedIds(new Set())
    // pm_orders_v1은 그대로 유지 (주문관리 탭에 표시됨)
  }

  const handleMallSelect = (mall: MallId) => {
    setSelectedMall(mall)
    setDirectMode(false)
    setCurrentDate(today)
    setImportMsg(null)
    setSelectedOrder(null)
  }

  const handleDirectSelect = () => {
    setSelectedMall(null)
    setDirectMode(true)
    setImportMsg(null)
    setSelectedOrder(null)
  }

  /* ─── 직접등록: 상품명·약어·바코드 자동 조회 ───────────── */
  useEffect(() => {
    if (!directMode) return

    const code = directForm.productCode.trim()
    const name = directForm.productName.trim()
    const opt  = directForm.option.trim()

    // 1순위: 상품코드로 상품 캐시에서 조회 → 상품명·약어·바코드 자동입력
    if (code) {
      try {
        const raw = localStorage.getItem('pm_products_cache_v1')
        if (raw) {
          const { data } = JSON.parse(raw) as {
            ts: number
            data: Array<{
              code: string; name: string; abbr: string
              options?: Array<{ name: string; barcode: string }>
            }>
          }
          const prod = Array.isArray(data)
            ? data.find(p => p.code?.toLowerCase() === code.toLowerCase())
            : undefined
          if (prod) {
            let barcode = ''
            if (opt && prod.options?.length) {
              const ol = opt.toLowerCase()
              const matched = prod.options.find(o =>
                o.name.toLowerCase().includes(ol) || ol.includes(o.name.toLowerCase())
              )
              barcode = matched?.barcode || ''
            }
            setDirectForm(prev => ({
              ...prev,
              productName:  prod.name,
              abbreviation: prod.abbr || '',
              barcode,
            }))
            return
          }
        }
      } catch {}
    }

    // 2순위: 상품명으로 매핑 테이블에서 약어·바코드 조회
    if (!name) {
      setDirectForm(prev => ({ ...prev, abbreviation: '', barcode: '' }))
      return
    }
    const mappings = loadMappings()
    const mapping  = lookupMapping(mappings, name, opt || undefined)
    setDirectForm(prev => ({
      ...prev,
      abbreviation: mapping.abbreviation || '',
      barcode:      mapping.barcode      || '',
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directForm.productCode, directForm.productName, directForm.option, directMode])

  /* ─── 직접등록 저장 ───────────────────────────────────── */
  const handleDirectSave = () => {
    const filledCount = [directForm.productCode, directForm.option, directForm.productName]
      .filter(v => v.trim()).length
    if (filledCount < 2) {
      setDirectMsg({ text: '상품코드 · 옵션 · 상품명 중 최소 2개를 입력해주세요.', ok: false })
      return
    }
    if (!directForm.recipientName.trim()) {
      setDirectMsg({ text: '수령인을 입력해주세요.', ok: false })
      return
    }
    if (!directForm.recipientAddress.trim()) {
      setDirectMsg({ text: '수령인 주소를 입력해주세요.', ok: false })
      return
    }

    setDirectSaving(true)
    const id         = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const orderNum   = directForm.orderNumber.trim() || `DIRECT-${Date.now()}`
    const uploadedAt = new Date().toISOString()

    const newRegOrder: RegOrder = {
      id,
      order_number:     orderNum,
      customer_name:    directForm.recipientName.trim(),
      customer_phone:   directForm.phone.trim(),
      shipping_address: directForm.recipientAddress.trim(),
      items: [{
        product_name: directForm.productName.trim() || directForm.productCode.trim(),
        sku:          directForm.productCode.trim(),
        quantity:     directForm.quantity,
        option:       directForm.option.trim(),
      }],
      total_amount: 0,
      status:  'pending',
      memo:    directForm.deliveryMessage.trim(),
      extra_data: {
        import_source: '직접등록',
        쇼핑몰:  directForm.mall.trim(),
        상품약어: directForm.abbreviation,
        바코드:  directForm.barcode,
      },
    }

    // order_reg_v1_direct_{today} 에 누적 저장
    const existingDay = loadDayData('direct', today)
    const updatedDay: DayData = existingDay
      ? { ...existingDay, orders: [...existingDay.orders, newRegOrder] }
      : { mall: 'direct', date: today, orders: [newRegOrder], uploaded_at: uploadedAt }
    saveDayData(updatedDay)

    // pm_orders_v1 에 추가
    const syncOrder: Order = {
      id,
      order_date:       today,
      order_number:     orderNum,
      channel:          directForm.mall.trim() || '직접등록',
      customer_name:    directForm.recipientName.trim(),
      customer_phone:   directForm.phone.trim(),
      shipping_address: directForm.recipientAddress.trim(),
      items:            newRegOrder.items,
      total_amount:     0,
      status:           'pending',
      memo:             directForm.deliveryMessage.trim(),
      uploaded_at:      uploadedAt,
      extra_data:       newRegOrder.extra_data,
    }
    saveOrders([...loadOrders(), syncOrder])

    setDirectSaving(false)
    setDirectMsg({ text: '등록 완료! 주문관리로 이동합니다...', ok: true })
    setTimeout(() => router.push('/product-transfer'), 800)
  }

  /* ─── 파일 업로드 처리 ───────────────────────────────── */
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

        const mallLabel      = MALLS.find(m => m.id === selectedMall)!.label
        const isMarketPlus   = selectedMall === 'marketplus'
        const isTossShopping = selectedMall === 'tossshopping'
        const isAlways       = selectedMall === 'always'
        const isGSShop       = selectedMall === 'gsshop'
        const uploadedAt     = new Date().toISOString()

        // 마켓플러스: 자동 매핑 수집
        const autoMappingUpdates: Record<string, string> = {}

        const orders: RegOrder[] = rows.map((row, idx) => {
          if (isMarketPlus) {
            const { order, autoMappingKey, autoMappingAbbr } = parseMarketPlusRow(row, idx, today)
            if (autoMappingKey && autoMappingAbbr) {
              autoMappingUpdates[autoMappingKey] = autoMappingAbbr
            }
            return order
          }
          if (isTossShopping) return parseTossShoppingRow(row, idx)
          if (isAlways)       return parseAlwaysRow(row, idx)
          if (isGSShop)       return parseGSShopRow(row, idx)
          return parseGenericRow(row, idx, today, mallLabel)
        })

        // 판매가 = 0 인 항목: 상품관리 캐시에서 채널 판매가 보정
        const cachedProds = loadCachedProductsForPrice()
        if (cachedProds.length > 0) {
          orders.forEach(o => {
            o.items.forEach(item => {
              if (!item.unit_price) {
                const channel = isMarketPlus
                  ? mpToChannel(String(o.extra_data?.['매출경로'] ?? ''))
                  : mallLabel
                const price = lookupChannelPrice(cachedProds, item.product_name, channel)
                if (price > 0) item.unit_price = price
              }
            })
          })
        }

        // 마켓플러스: 매핑 자동 업데이트 (abbreviation만, loca는 유지)
        if (isMarketPlus && Object.keys(autoMappingUpdates).length > 0) {
          const currentMappings = loadMappings()
          const updated = { ...currentMappings }
          for (const [key, abbr] of Object.entries(autoMappingUpdates)) {
            updated[key] = {
              abbreviation: abbr,
              loca: currentMappings[key]?.loca ?? '',
            }
          }
          saveMappings(updated)
        }

        const newData: DayData = {
          mall: selectedMall,
          date: today,
          orders,
          raw_rows: rows,  // 원본 행 저장 (송장전송 파일 재생성용)
          uploaded_at: uploadedAt,
        }
        saveDayData(newData)
        setDayData(newData)
        setCurrentDate(today)

        /* ── pm_orders_v1 동기화 ── */
        const syncOrders: Order[] = orders.map(o => ({
          id: o.id,
          order_date: today,
          order_number: o.order_number,
          // 마켓플러스: 실제 채널(G마켓, 스마트스토어 등) / 기타: 쇼핑몰명
          channel: isMarketPlus
            ? mpToChannel(String(o.extra_data?.['매출경로'] ?? mallLabel))
            : mallLabel,
          customer_name:    o.customer_name,
          customer_phone:   o.customer_phone,
          shipping_address: o.shipping_address,
          items:            o.items,
          total_amount:     o.total_amount,
          status:           o.status,
          tracking_number:  undefined,
          carrier:          undefined,
          memo:             o.memo,
          uploaded_at:      uploadedAt,
          extra_data:       o.extra_data,
        }))

        const existingMain = loadOrders()
        // 같은 import_source+날짜 이전 업로드 제거
        const importSrc = isMarketPlus ? 'marketplus' : mallLabel  // tossshopping='토스쇼핑', always='올웨이즈', gsshop='지에스샵'
        const filtered = existingMain.filter(o =>
          !(o.extra_data?.['import_source'] === importSrc && o.order_date === today)
        )
        saveOrders([...filtered, ...syncOrders])

        setImportMsg({
          text: `${orders.length}건 등록 완료${isMarketPlus ? ` (매핑 ${Object.keys(autoMappingUpdates).length}건 자동 업데이트)` : ''} · 주문관리 동기화됨`,
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

  const activeMall = MALLS.find(m => m.id === selectedMall)

  /* ─── 렌더 ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 108px)', minHeight: 500 }}>

      {/* 왼쪽: 쇼핑몰 선택 */}
      <div className="pm-card" style={{ width: 172, flexShrink: 0, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, paddingLeft: 4 }}>
          <Store size={13} style={{ color: '#94a3b8' }} />
          <span style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: isSel ? `1.5px solid ${mall.color}50` : '1.5px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: isSel ? 800 : 600,
                color: isSel ? mall.color : '#64748b',
                background: isSel ? mall.activeBg : 'transparent',
                transition: 'all 150ms ease',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#374151' } }}
              onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' } }}
            >
              {isSel && <span style={{ width: 6, height: 6, borderRadius: '50%', background: mall.color, flexShrink: 0 }} />}
              {mall.label}
              {mall.id === 'marketplus' && (
                <span style={{ marginLeft: 'auto', fontSize: 'calc(9px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: mall.color, background: `${mall.color}15`, padding: '1px 5px', borderRadius: 4 }}>멀티</span>
              )}
            </button>
          )
        })}
        {/* 마켓플러스 안내 */}
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
          <p style={{ fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: '#c2410c', marginBottom: 2 }}>💡 마켓플러스</p>
          <p style={{ fontSize: 'calc(9.5px + var(--pm-list-fs-add, 0pt))', color: '#9a3412', lineHeight: 1.5 }}>
            여러 채널 주문 통합<br />
            상품명(관리용) 자동 매핑
          </p>
        </div>

        {/* 구분선 */}
        <div style={{ height: 1, background: '#f1f5f9', margin: '8px 2px' }} />

        {/* 직접등록 버튼 */}
        <button
          onClick={handleDirectSelect}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: directMode ? '1.5px solid #7c3aed50' : '1.5px solid transparent',
            cursor: 'pointer', textAlign: 'left',
            fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: directMode ? 800 : 600,
            color: directMode ? '#7c3aed' : '#64748b',
            background: directMode ? '#f5f3ff' : 'transparent',
            transition: 'all 150ms ease',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={e => { if (!directMode) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#374151' } }}
          onMouseLeave={e => { if (!directMode) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' } }}
        >
          {directMode && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', flexShrink: 0 }} />}
          <PenLine size={13} style={{ flexShrink: 0, color: directMode ? '#7c3aed' : '#94a3b8' }} />
          직접등록
        </button>
      </div>

      {/* 오른쪽: 컨텐츠 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {directMode ? (
          /* ─── 직접등록 폼 ─────────────────────────────────── */
          <div className="pm-card" style={{ flex: 1, overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <PenLine size={18} style={{ color: '#7c3aed' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 'calc(16px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#0f172a', margin: 0 }}>직접 주문 등록</h2>
                <p style={{ fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', color: '#94a3b8', fontWeight: 600, margin: '2px 0 0' }}>
                  상품코드 · 옵션 · 상품명 중 2개 이상 입력 필요 · 저장 후 주문관리로 이동
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
              {/* 쇼핑몰 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>쇼핑몰</p>
                <input value={directForm.mall} onChange={e => setDirectForm(p => ({ ...p, mall: e.target.value }))}
                  placeholder="예: 네이버스마트스토어"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 주문번호 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>주문번호</p>
                <input value={directForm.orderNumber} onChange={e => setDirectForm(p => ({ ...p, orderNumber: e.target.value }))}
                  placeholder="미입력 시 자동 생성"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품코드 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품코드 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', textTransform: 'none' }}>3개 중 2개</span>
                </p>
                <input value={directForm.productCode} onChange={e => setDirectForm(p => ({ ...p, productCode: e.target.value }))}
                  placeholder="상품 코드"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 옵션 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  옵션 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', textTransform: 'none' }}>3개 중 2개</span>
                </p>
                <input value={directForm.option} onChange={e => setDirectForm(p => ({ ...p, option: e.target.value }))}
                  placeholder="예: 블랙 / L"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품명 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품명 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', textTransform: 'none' }}>3개 중 2개 · 상품코드 입력 시 자동조회</span>
                </p>
                <input value={directForm.productName} onChange={e => setDirectForm(p => ({ ...p, productName: e.target.value }))}
                  placeholder="상품코드 입력 시 자동 조회되거나 직접 입력"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품약어 auto */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품약어 <span style={{ fontWeight: 600, fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', color: '#a78bfa' }}>자동생성</span>
                </p>
                <div style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #ede9fe', background: '#f5f3ff', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: directForm.abbreviation ? '#7c3aed' : '#c4b5fd', minHeight: 38, display: 'flex', alignItems: 'center' }}>
                  {directForm.abbreviation || '상품코드 입력 후 자동 조회'}
                </div>
              </div>

              {/* 바코드 auto */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  바코드 <span style={{ fontWeight: 600, fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', color: '#a78bfa' }}>자동생성</span>
                </p>
                <div style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #ede9fe', background: '#f5f3ff', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: directForm.barcode ? '#7c3aed' : '#c4b5fd', minHeight: 38, display: 'flex', alignItems: 'center' }}>
                  {directForm.barcode || '상품코드+옵션 입력 후 자동 조회'}
                </div>
              </div>

              {/* 수량 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수량 <span style={{ color: '#ef4444' }}>*</span></p>
                <input type="number" min={1} value={directForm.quantity}
                  onChange={e => setDirectForm(p => ({ ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 전화번호 */}
              <div>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>전화번호</p>
                <input value={directForm.phone} onChange={e => setDirectForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 수령인 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수령인 <span style={{ color: '#ef4444' }}>*</span></p>
                <input value={directForm.recipientName} onChange={e => setDirectForm(p => ({ ...p, recipientName: e.target.value }))}
                  placeholder="수령인 이름"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 수령인 주소 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수령인 주소 <span style={{ color: '#ef4444' }}>*</span></p>
                <input value={directForm.recipientAddress} onChange={e => setDirectForm(p => ({ ...p, recipientAddress: e.target.value }))}
                  placeholder="배송 주소 입력"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 배송메세지 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>배송메세지</p>
                <input value={directForm.deliveryMessage} onChange={e => setDirectForm(p => ({ ...p, deliveryMessage: e.target.value }))}
                  placeholder="배송 요청사항"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>
            </div>

            {directMsg && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9, background: directMsg.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${directMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
                {directMsg.ok
                  ? <CheckCircle2 size={14} style={{ color: '#059669', flexShrink: 0 }} />
                  : <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />}
                <span style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: directMsg.ok ? '#059669' : '#dc2626' }}>{directMsg.text}</span>
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleDirectSave} disabled={directSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#7c3aed', color: 'white', borderRadius: 10, fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, border: 'none', cursor: directSaving ? 'not-allowed' : 'pointer', opacity: directSaving ? 0.6 : 1 }}>
                <PackageCheck size={15} />
                {directSaving ? '저장 중...' : '저장 후 주문관리로 이동'}
              </button>
              <button onClick={() => { setDirectForm(emptyDirectForm()); setDirectMsg(null) }}
                style={{ padding: '10px 18px', background: '#f1f5f9', color: '#64748b', borderRadius: 10, fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                초기화
              </button>
            </div>
          </div>
        ) : !selectedMall ? (
          <div className="pm-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={32} style={{ color: '#cbd5e1' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 'calc(16px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>쇼핑몰을 선택해주세요</p>
              <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: '#cbd5e1', fontWeight: 600 }}>왼쪽에서 주문서를 등록할 쇼핑몰을 선택하세요</p>
            </div>
          </div>
        ) : (
          <>
            {/* 날짜 네비게이션 + 업로드 바 */}
            <div className="pm-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: activeMall?.color, background: activeMall?.bg, padding: '4px 12px', borderRadius: 20, border: `1px solid ${activeMall?.color}30` }}>
                {activeMall?.label}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setCurrentDate(prev => addDays(prev, -1))}
                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={15} style={{ color: '#64748b' }} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 10, background: isToday ? '#eff6ff' : '#f8fafc', border: isToday ? '1px solid #bfdbfe' : '1px solid #e2e8f0', minWidth: 190 }}>
                  <span style={{ fontSize: 'calc(14.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#0f172a' }}>{formatDateKo(currentDate)}</span>
                  <span style={{ fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', color: '#64748b', fontWeight: 600 }}>{getDayOfWeek(currentDate)}</span>
                  {isToday && <span style={{ fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#2563eb', background: '#dbeafe', padding: '2px 7px', borderRadius: 20 }}>TODAY</span>}
                </div>
                <button onClick={() => { if (canGoNext) setCurrentDate(prev => addDays(prev, 1)) }}
                  disabled={!canGoNext}
                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: canGoNext ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canGoNext ? 1 : 0.3 }}>
                  <ChevronRight size={15} style={{ color: '#64748b' }} />
                </button>
              </div>

              {isToday && (
                <>
                  <button onClick={() => fileRef.current?.click()} disabled={importing}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: activeMall?.color ?? '#2563eb', color: 'white', borderRadius: 10, fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, border: 'none', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    <Upload size={14} />
                    {importing ? '처리 중...' : '주문서 업로드'}
                  </button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
                  {checkedIds.size > 0 && (
                    <button onClick={handleOrderConfirm}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: '#059669', color: 'white', borderRadius: 10, fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                      <PackageCheck size={14} />주문확인 ({checkedIds.size})
                    </button>
                  )}
                </>
              )}

              {importMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: importMsg.ok ? '#ecfdf5' : '#fef2f2' }}>
                  {importMsg.ok ? <CheckCircle2 size={13} style={{ color: '#059669' }} /> : <AlertCircle size={13} style={{ color: '#dc2626' }} />}
                  <span style={{ fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: importMsg.ok ? '#059669' : '#dc2626' }}>{importMsg.text}</span>
                </div>
              )}
              {dayData && dayData.orders.length > 0 && (
                <>
                  <span style={{ fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>총 {dayData.orders.length}건</span>
                  {checkedIds.size > 0 && (
                    <button onClick={handleDeleteChecked}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, border: '1.5px solid #fecaca', cursor: 'pointer' }}>
                      <Trash2 size={12} />선택 삭제 ({checkedIds.size})
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 주문 목록 */}
            <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!dayData || dayData.orders.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 48 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={28} style={{ color: '#cbd5e1' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 'calc(15px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>
                      {isToday ? '주문서를 업로드해주세요' : '해당 날짜의 주문 내역이 없습니다'}
                    </p>
                    <p style={{ fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', color: '#cbd5e1', fontWeight: 600 }}>
                      {isToday ? `${activeMall?.label} 주문서 파일을 업로드하세요` : '이 날짜에 업로드된 주문서가 없습니다'}
                    </p>
                  </div>
                  {isToday && (
                    <button onClick={() => fileRef.current?.click()} disabled={importing}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: activeMall?.color ?? '#2563eb', color: 'white', borderRadius: 12, fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, border: 'none', cursor: 'pointer', marginTop: 4 }}>
                      <Upload size={15} />주문서 업로드
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {/* 테이블 헤더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 2fr 110px 70px 90px', gap: 10, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 1 }}>
                    <span onClick={toggleAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {allChecked
                        ? <CheckSquare size={20} style={{ color: '#2563eb' }} />
                        : <Square size={20} style={{ color: '#cbd5e1' }} />}
                    </span>
                    {['주문번호', '상품명', '수취인', '수량', '상태'].map(h => (
                      <span key={h} style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                    ))}
                  </div>
                  {/* 주문 행 */}
                  {dayData.orders.map((order, idx) => {
                    const st = STATUS_MAP[order.status] ?? STATUS_MAP.pending
                    const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)
                    const displayChannel = order.extra_data?.['매출경로'] ? String(order.extra_data['매출경로']) : ''
                    const isChk = checkedIds.has(order.id)
                    return (
                      <div key={order.id}
                        style={{ display: 'grid', gridTemplateColumns: '44px 1fr 2fr 110px 70px 90px', gap: 10, padding: '12px 20px', borderBottom: idx < dayData.orders.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', background: isChk ? '#eff6ff' : 'transparent', transition: 'background 100ms' }}
                        onMouseEnter={e => { if (!isChk) e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (!isChk) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span onClick={e => { e.stopPropagation(); toggleOne(order.id) }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          {isChk
                            ? <CheckSquare size={20} style={{ color: '#2563eb' }} />
                            : <Square size={20} style={{ color: '#cbd5e1' }} />}
                        </span>
                        <div onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', overflow: 'hidden' }}>
                          <span style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: activeMall?.color ?? '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {order.order_number}
                          </span>
                          {displayChannel && (
                            <span style={{ fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', color: '#94a3b8', fontWeight: 600 }}>{displayChannel}</span>
                          )}
                        </div>
                        <div onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', overflow: 'hidden' }}>
                          <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                            {order.items[0]?.product_name}
                            {order.items.length > 1 && <span style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#94a3b8', marginLeft: 4 }}>외 {order.items.length - 1}건</span>}
                          </p>
                          {order.items[0]?.option && <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', color: '#94a3b8', marginTop: 1, margin: '1px 0 0' }}>{order.items[0].option}</p>}
                        </div>
                        <span onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>
                        <span style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{totalQty}</span>
                        <span style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: st.color, background: st.bg, padding: '3px 8px', borderRadius: 6, textAlign: 'center', display: 'block' }}>{st.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 주문 상세 모달 */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedOrder(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 540, width: '100%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 'calc(10px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: activeMall?.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{activeMall?.label}</p>
                <h2 style={{ fontSize: 'calc(16px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={14} style={{ color: '#94a3b8' }} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              {([
                ['주문번호', selectedOrder.order_number],
                ['수취인',   selectedOrder.customer_name],
                ['연락처',   selectedOrder.customer_phone || '-'],
                ['상태',     STATUS_MAP[selectedOrder.status]?.label ?? '-'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>
            {selectedOrder.shipping_address && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
                <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address}</p>
              </div>
            )}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < selectedOrder.items.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku    && <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))',   color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p> : null}
                  </div>
                </div>
              ))}
            </div>
            {selectedOrder.memo && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                <p style={{ fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', color: '#64748b' }}>메모: {selectedOrder.memo}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
