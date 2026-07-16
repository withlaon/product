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
  loadOrders, upsertOrders, removeOrdersByIds, toOrderDate,
  loadMappings, saveMappings, makeMappingKey, mpToChannel, lookupMapping,
} from '@/lib/orders'
import type { Order } from '@/lib/orders'
import { broadcastDashboardRefresh } from '@/lib/dashboard-sync'

/* ─── 쇼핑몰 정의 (지그재그 제외) ──────────────────────── */
const MALLS = [
  { id: 'marketplus',   label: '마켓플러스', color: '#e11d48', bg: '#fff1f2', activeBg: '#ffe4e6' },
  { id: 'tossshopping', label: '토스쇼핑',   color: '#4f46e5', bg: '#eef2ff', activeBg: '#e0e7ff' },
  { id: 'gsshop',       label: '지에스샵',   color: '#059669', bg: '#ecfdf5', activeBg: '#d1fae5' },
  { id: 'always',       label: '올웨이즈',   color: '#d97706', bg: '#fffbeb', activeBg: '#fef3c7' },
  { id: 'jasondeal',    label: '제이슨딜',   color: '#0284c7', bg: '#f0f9ff', activeBg: '#e0f2fe' },
  { id: 'ohouse',       label: '오늘의집',   color: '#059669', bg: '#f0fdf4', activeBg: '#dcfce7' },
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
  /** 토스쇼핑 주문배송관리 양식: 시트 전체(헤더 1~4행 + 데이터) 보존 — 송장 다운로드 시 동일 양식 유지 */
  toss_raw_aoa?: unknown[][]
  toss_sheet_name?: string
  /** A1:AD1 병합 영역의 안내문 텍스트 — 다운로드 시 원본 병합 구조 재현용 */
  toss_row1_value?: string
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

/**
 * localStorage 용량 초과(QuotaExceededError) 등으로 쓰기가 실패하면
 * 이전 세션의 raw_rows/toss_raw_aoa 등 부피가 큰 오래된 order_reg_v1_* 항목부터
 * 정리한 뒤 재시도. 그래도 실패하면 false 반환 (호출부에서 사용자에게 알림 표시).
 * 기존처럼 실패를 조용히 삼키지 않는다 — 이게 "두번째 몰 데이터 소실"의 근본 원인이었음.
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    // 오늘 날짜를 제외한 order_reg_v1_* 키를 오래된 것부터 제거해 공간 확보 후 재시도
    try {
      const today = getToday()
      const candidates: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('order_reg_v1_') && !k.endsWith('_' + today)) candidates.push(k)
      }
      // 날짜 문자열이 키 끝에 있으므로 정렬하면 오래된 날짜가 먼저 옴
      candidates.sort()
      for (const k of candidates) {
        localStorage.removeItem(k)
        try {
          localStorage.setItem(key, value)
          return true
        } catch { /* 계속 정리 */ }
      }
    } catch { /* ignore */ }
    return false
  }
}

function saveDayData(data: DayData): boolean {
  const ok = safeSetItem(storageKey(data.mall, data.date), JSON.stringify(data))
  if (!ok) {
    alert(
      '저장 실패: 브라우저 저장공간(localStorage)이 가득 찼습니다.\n\n' +
      '오래된 주문 데이터를 정리했지만 여전히 공간이 부족합니다.\n' +
      '브라우저 설정에서 사이트 데이터를 정리하거나 관리자에게 문의해주세요.'
    )
  }
  return ok
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
    customer_phone:   String(row['수령인 휴대전화'] ?? row['수령인 전화번호'] ?? ''),
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

/* ─── 토스쇼핑 주문배송관리 양식 (동적 컬럼 감지)
   헤더행에서 '주문번호' 셀을 찾아 컬럼 인덱스를 자동으로 결정.
   파일 포맷이 변경되어도 헤더명 기준으로 정확히 매핑됨.
   데이터 시작 = 헤더행 + 2 (헤더행 + 수정안내행 스킵) ── */

interface TossColMap {
  주문번호: number; 주문상품번호: number; 주문상태: number; 주문건수: number
  상품명: number; 옵션명: number
  구매자명: number; 구매자연락처: number
  수령인명: number; 수령인연락처: number
  배송지: number; 주문요청사항: number; 주문금액: number
  택배사: number; 송장번호: number
}

/** 헤더 행 배열에서 컬럼명 기준으로 인덱스 맵 생성 */
function buildTossColMap(headerRow: unknown[]): TossColMap {
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headerRow.findIndex(h => String(h ?? '').trim() === n)
      if (i >= 0) return i
    }
    return -1
  }
  return {
    주문번호:       idx(['주문번호', '주문 번호']),
    주문상품번호:   idx(['주문상품번호', '주문 상품번호']),
    주문상태:       idx(['주문상태', '주문 상태', '상태']),
    주문건수:       idx(['주문건수']),
    상품명:         idx(['상품명']),
    옵션명:         idx(['옵션명']),
    구매자명:       idx(['구매자명']),
    구매자연락처:   idx(['구매자 연락처', '구매자연락처']),
    수령인명:       idx(['수령인명']),
    수령인연락처:   idx(['수령인 연락처', '수령인연락처']),
    배송지:         idx(['배송지']),
    주문요청사항:   idx(['주문요청사항']),
    주문금액:       idx(['주문금액']),
    택배사:         idx(['택배사']),
    송장번호:       idx(['송장번호']),
  }
}

/** 토스쇼핑 옵션명에서 FREE 제거: "블랙, free" → "블랙" */
function cleanTossOption(raw: unknown): string {
  return String(raw ?? '')
    .replace(/,?\s*FREE\s*/gi, '')
    .replace(/,\s*$/, '')
    .trim()
}

function parseTossShoppingAoaRow(row: unknown[], idx: number, col: TossColMap): RegOrder {
  const get = (i: number) => (i >= 0 ? row[i] : undefined)
  const orderNum = String(get(col.주문번호) ?? '').trim()
  const amountRaw = get(col.주문금액)
  const amount =
    typeof amountRaw === 'number'
      ? amountRaw
      : parseFloat(String(amountRaw ?? '0').replace(/,/g, '')) || 0
  const qty = Number(get(col.주문건수) ?? 1) || 1
  const unitPrice = qty > 0 ? amount / qty : amount

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:
      String(get(col.수령인명) ?? get(col.구매자명) ?? '-'),
    customer_phone: String(get(col.수령인연락처) ?? get(col.구매자연락처) ?? ''),
    shipping_address: String(get(col.배송지) ?? ''),
    items: [{
      product_name: String(get(col.상품명) ?? '-'),
      sku:          String(get(col.주문상품번호) ?? ''),
      quantity:     qty,
      unit_price:   unitPrice,
      option:       cleanTossOption(get(col.옵션명)),
    }],
    total_amount: amount,
    status: 'pending',
    memo: String(get(col.주문요청사항) ?? ''),
    extra_data: {
      import_source: '토스쇼핑',
      주문번호: orderNum,
      주문상품번호: String(get(col.주문상품번호) ?? ''),
      토스_상품명: String(get(col.상품명) ?? ''),
      토스_옵션명: cleanTossOption(get(col.옵션명)),
      토스_구매자명: String(get(col.구매자명) ?? ''),
      토스_구매자연락처: String(get(col.구매자연락처) ?? ''),
      토스_수령인명: String(get(col.수령인명) ?? ''),
      토스_배송지: String(get(col.배송지) ?? ''),
      토스_주문요청사항: String(get(col.주문요청사항) ?? ''),
      토스_주문금액: String(get(col.주문금액) ?? ''),
    },
  }
}

/* ─── 지에스샵 전용 파싱 ─────────────────────────────────── */
/* 구형(출하지시번호·수취인·협력사지급금액…) + 신형 파일접수상세내역(운송장번호·배달부·판매합계…) 동시 지원 */
function parseGSShopRow(row: Record<string, unknown>, idx: number): RegOrder {
  const cell = (key: string) => {
    const v = row[key]
    if (v === undefined || v === null) return ''
    return String(v).trim()
  }
  const num = (key: string) => {
    const v = row[key]
    if (v === undefined || v === null || v === '') return 0
    return typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')) || 0
  }

  // 주문번호: 구형 '출하지시번호' → 신형 '판매주문번호' → '운송장번호' → AUTO
  const orderNum =
    cell('출하지시번호') ||
    cell('판매주문번호') ||
    cell('운송장번호') ||
    `AUTO-GS-${Date.now()}-${idx}`

  // 수취인: 구형 '수취인' → 신형 '배달부'
  const customer_name = cell('수취인') || cell('배달부') || '-'

  // 전화번호: 구형 여러 컬럼 → 신형 '배달부연락처'
  const customer_phone =
    cell('받은분 전화번호') || cell('받은분전화번호') ||
    cell('수취인전화번호') || cell('수취인 전화번호') ||
    cell('수취인핸드폰') || cell('배달부연락처') || ''

  // 주소: 구형 '수취인주소' → 신형 '배달부주소'
  const shipping_address = cell('수취인주소') || cell('배달부주소') || ''

  // 우편번호
  const zipCode = cell('우편번호') || cell('배달부우편번호') || ''

  // 상품명: 구형 '상품명(송장)' / '상품명(인터넷)' → 신형 '상품명' / '접수항목'
  const product_name =
    cell('상품명(송장)') || cell('상품명(인터넷)') ||
    cell('상품명') || cell('접수항목') || '-'

  // 상품코드
  const sku = cell('협력사상품코드') || cell('상품상세코드') || cell('상품코드') || ''

  // 수량: '수량' 또는 '상품수량'
  const quantity = Math.max(1, Math.round(num('수량') || num('상품수량') || 1))

  // 금액: 구형 '협력사지급금액' → 신형 '판매합계' / '기본가격'
  const unit_price = num('협력사지급금액') || num('판매합계') || num('기본가격') || 0

  // 옵션
  const option = cell('주문옵션') || ''

  // 배송 메시지
  const memo = cell('배송메세지') || cell('배송메시지') || ''

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name,
    customer_phone,
    shipping_address,
    items: [{ product_name, sku, quantity, unit_price, option }],
    total_amount: unit_price * quantity,
    status: 'pending',
    memo,
    extra_data: {
      import_source:   '지에스샵',
      출하지시번호:    orderNum,
      우편번호:        zipCode,
      상품상세코드:    sku,
      상품명_인터넷:   cell('상품명(인터넷)') || cell('접수항목') || cell('상품명'),
      협력사지급금액:  String(unit_price),
    },
  }
}

/* ─── 제이슨딜 전용 파싱 (AD열=공급가) ───────────────────── */
function jasonDealSupplyPrice(row: Record<string, unknown>): number {
  const v = row['공급가']
  if (v !== undefined && v !== '') {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

function parseJasonDealRow(row: Record<string, unknown>, idx: number): RegOrder {
  const orderNum = String(row['주문번호'] ?? `AUTO-JASON-${Date.now()}-${idx}`)
  const supply = jasonDealSupplyPrice(row)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
    order_number: orderNum,
    customer_name:    String(row['주문자명'] ?? '-'),
    customer_phone:   String(row['주문자전화'] ?? row['주문인전화번호'] ?? ''),
    shipping_address: String(row['전체주소'] ?? ''),
    items: [{
      product_name: String(row['상품명(전시)'] ?? row['상품명'] ?? '-'),
      sku:          String(row['통합상품코드'] ?? ''),
      quantity:     Number(row['주문수량'] ?? 1),
      unit_price:   supply,
      option:       String(row['옵션명'] ?? ''),
    }],
    total_amount: supply,
    status: 'pending',
    memo: String(row['배송시요청사항'] ?? ''),
    extra_data: {
      import_source: '제이슨딜',
      주문번호: orderNum,
      우편번호: String(row['우편번호'] ?? ''),
    },
  }
}

/* ─── 올웨이즈 전용 파싱 ─────────────────────────────────── */
/** 엑셀 N열(14번째 열) 실매출/정산 금액 — 대시보드 실매출 집계용 */
function parseAlwaysRow(row: Record<string, unknown>, idx: number, nColumnCell?: unknown): RegOrder {
  const orderNum = String(row['주문아이디'] ?? `AUTO-ALWAYS-${Date.now()}-${idx}`)
  let n열정산: number | undefined
  if (nColumnCell !== undefined && nColumnCell !== '') {
    const n = typeof nColumnCell === 'number' ? nColumnCell : parseFloat(String(nColumnCell).replace(/,/g, ''))
    if (Number.isFinite(n)) n열정산 = n
  }
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
      ...(n열정산 !== undefined ? { 올웨이즈_N열정산: n열정산 } : {}),
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

/* ─── 오늘 등록된 모든 쇼핑몰 요약 읽기 ─────────────────── */
function loadTodaySummary(today: string): { mall: string; label: string; count: number }[] {
  const prefix = 'order_reg_v1_'
  const suffix = '_' + today
  const result: { mall: string; label: string; count: number }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = JSON.parse(raw) as { mall: string; orders: any[] }
      if (!Array.isArray(d.orders) || d.orders.length === 0) continue
      const mallId = d.mall ?? ''
      const label  = MALLS.find(m => m.id === mallId)?.label ?? mallId
      result.push({ mall: mallId, label, count: d.orders.length })
    }
  } catch { /* ignore */ }
  return result
}

/* ─── 오늘 데이터 전체 삭제 ─────────────────────────────── */
function clearTodayData(today: string) {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('order_reg_v1_') && key.endsWith('_' + today)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    // pm_orders_v1에서 오늘 주문 제거
    const raw = localStorage.getItem('pm_orders_v1')
    if (raw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = JSON.parse(raw)
      const filtered = all.filter((o: { order_date?: string }) => o.order_date !== today)
      localStorage.setItem('pm_orders_v1', JSON.stringify(filtered))
    }
  } catch { /* ignore */ }
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
  const [todaySummary, setTodaySummary] = useState<{ mall: string; label: string; count: number }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  /* 직접등록 */
  const router = useRouter()
  const [directMode, setDirectMode]     = useState(false)
  const [directForm, setDirectForm]     = useState<DirectForm>(emptyDirectForm())
  const [directSaving, setDirectSaving] = useState(false)
  const [directMsg, setDirectMsg]       = useState<{ text: string; ok: boolean } | null>(null)

  const isToday   = currentDate === today
  const canGoNext = currentDate < today

  /* 마운트 시 90일 이상 지난 order_reg_v1_* 항목 자동 정리
     (raw_rows/toss_raw_aoa 원본 백업까지 포함해 부피가 크므로, 누적되면
     localStorage 용량 초과로 "두번째 몰 업로드부터 조용히 실패"하는 문제를 예방) */
  useEffect(() => {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith('order_reg_v1_')) continue
        const datePart = key.slice(key.lastIndexOf('_') + 1)
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffStr) toRemove.push(key)
      }
      toRemove.forEach(k => localStorage.removeItem(k))
    } catch { /* ignore */ }
  }, [])

  /* 마운트 시 오늘 현황 로드 */
  useEffect(() => {
    setTodaySummary(loadTodaySummary(today))
  }, [today])

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
    removeOrdersByIds([...deletedIds])
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
    upsertOrders([syncOrder])

    setDirectSaving(false)
    setDirectMsg({ text: '등록 완료! 주문관리로 이동합니다...', ok: true })
    setTimeout(() => router.push('/product-transfer'), 800)
  }

  /* ─── 파일 업로드 처리 ───────────────────────────────── */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedMall) return
    // 파일 읽기 중 탭 전환으로 인한 stale closure 방지: 현재 쇼핑몰을 즉시 캡처
    const capturedMall = selectedMall
    setImporting(true)
    setImportMsg(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const mallLabel      = MALLS.find(m => m.id === capturedMall)!.label
        const isMarketPlus   = capturedMall === 'marketplus'
        const isTossShopping = capturedMall === 'tossshopping'
        const isAlways       = capturedMall === 'always'
        const isGSShop       = capturedMall === 'gsshop'
        const isJasonDeal    = capturedMall === 'jasondeal'
        const alwaysAoa = isAlways
          ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][])
          : null

        let rows: Record<string, unknown>[] = []
        let tossRawAoa: unknown[][] | undefined
        let tossSheetName: string | undefined
        let tossRow1Value: string | undefined

        if (isTossShopping) {
          tossSheetName = wb.SheetNames[0] || '주문내역'
          tossRawAoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
          // A1:AD1 병합셀의 안내문 텍스트 별도 보존
          tossRow1Value = String(ws['A1']?.v ?? '')
          if (tossRawAoa.length < 2) {
            setImportMsg({ text: '토스쇼핑 주문배송관리 양식: 헤더 행이 없습니다. 올바른 주문배송관리 엑셀 파일인지 확인해주세요.', ok: false })
            setImporting(false)
            if (fileRef.current) fileRef.current.value = ''
            return
          }
        } else {
          rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          if (rows.length === 0) {
            setImportMsg({ text: '엑셀에 데이터가 없습니다.', ok: false })
            setImporting(false)
            if (fileRef.current) fileRef.current.value = ''
            return
          }
        }

        const uploadedAt     = new Date().toISOString()

        // 마켓플러스: 자동 매핑 수집
        const autoMappingUpdates: Record<string, string> = {}

        let orders: RegOrder[] = []
        let tossSyntheticRaw: Record<string, unknown>[] = []
        let tossFallbackNote = ''

        if (isTossShopping && tossRawAoa) {
          /* 헤더행 자동 감지: '주문번호' 계열 셀이 포함된 행을 열 위치 무관하게 탐색.
             정확히 일치하는 행이 없으면 "포함" 검사로 재시도 (양식 변형 대비). */
          const HEADER_CANDIDATES = ['주문번호', '주문 번호']
          let tossColHdrIdx = tossRawAoa.findIndex(r =>
            (r as unknown[]).some(cell => HEADER_CANDIDATES.includes(String(cell ?? '').trim()))
          )
          if (tossColHdrIdx < 0) {
            // 완전 일치 실패 시: '주문번호'를 포함하는 셀로 재탐색 (예: '주문번호(필수)')
            tossColHdrIdx = tossRawAoa.findIndex(r =>
              (r as unknown[]).some(cell => String(cell ?? '').trim().includes('주문번호'))
            )
          }
          if (tossColHdrIdx < 0) {
            setImportMsg({ text: '토스쇼핑: 주문번호 헤더를 찾을 수 없습니다. 올바른 주문배송관리 파일인지 확인해주세요.', ok: false })
            alert('토스쇼핑 업로드 실패\n\n"주문번호" 헤더를 파일에서 찾을 수 없습니다.\n올바른 토스쇼핑 주문배송관리 엑셀 파일인지 확인 후 다시 시도해주세요.')
            setImporting(false)
            if (fileRef.current) fileRef.current.value = ''
            return
          }
          const tossColMap = buildTossColMap(tossRawAoa[tossColHdrIdx] as unknown[])
          const tossDataStart = tossColHdrIdx + 2
          const statusSeen = new Set<string>()
          const strictRows: { line: unknown[]; i: number }[] = []
          const anyValidRows: { line: unknown[]; i: number }[] = []
          for (let i = tossDataStart; i < tossRawAoa.length; i++) {
            const line = tossRawAoa[i] as unknown[]
            if (!line?.length) continue
            const orderNum = String(tossColMap.주문번호 >= 0 ? line[tossColMap.주문번호] : '').trim()
            // 주문번호: 숫자 4자리 이상인 행만 데이터로 인식 (헤더·안내 행 제외)
            if (!orderNum || !/^\d{4,}/.test(orderNum)) continue
            anyValidRows.push({ line, i })
            if (tossColMap.주문상태 >= 0) {
              const status = String(line[tossColMap.주문상태] ?? '').trim()
              if (status) statusSeen.add(status)
              if (!status || status === '상품준비중') strictRows.push({ line, i })
            } else {
              strictRows.push({ line, i })
            }
          }
          // 1차: '상품준비중' 상태만. 하나도 없으면 상태 필터 없이 전체 유효 행으로 폴백
          // (상태 텍스트 표기가 다른 양식이어도 데이터 누락 없이 업로드되도록 보장)
          const rowsToUse = strictRows.length > 0 ? strictRows : anyValidRows
          const usedFallback = strictRows.length === 0 && anyValidRows.length > 0
          for (const { line, i } of rowsToUse) {
            orders.push(parseTossShoppingAoaRow(line, i, tossColMap))
            tossSyntheticRaw.push({
              주문번호: tossColMap.주문번호 >= 0 ? line[tossColMap.주문번호] : '',
              주문상품번호: tossColMap.주문상품번호 >= 0 ? line[tossColMap.주문상품번호] : '',
              상품명: tossColMap.상품명 >= 0 ? line[tossColMap.상품명] : '',
              옵션명: tossColMap.옵션명 >= 0 ? line[tossColMap.옵션명] : '',
              구매자명: tossColMap.구매자명 >= 0 ? line[tossColMap.구매자명] : '',
              '구매자 연락처': tossColMap.구매자연락처 >= 0 ? line[tossColMap.구매자연락처] : '',
              수령인명: tossColMap.수령인명 >= 0 ? line[tossColMap.수령인명] : '',
              배송지: tossColMap.배송지 >= 0 ? line[tossColMap.배송지] : '',
              주문요청사항: tossColMap.주문요청사항 >= 0 ? line[tossColMap.주문요청사항] : '',
              주문금액: tossColMap.주문금액 >= 0 ? line[tossColMap.주문금액] : '',
            })
          }
          if (orders.length === 0) {
            const statusInfo = statusSeen.size > 0 ? ` (발견된 상태값: ${[...statusSeen].join(', ')})` : ''
            const msg = `토스쇼핑: 유효한 주문 행을 찾을 수 없습니다.${statusInfo} 파일 형식을 확인해주세요.`
            setImportMsg({ text: msg, ok: false })
            alert('토스쇼핑 업로드 실패\n\n' + msg)
            setImporting(false)
            if (fileRef.current) fileRef.current.value = ''
            return
          }
          if (usedFallback) {
            tossFallbackNote = ` ⚠️ "상품준비중" 상태 행이 없어 전체 유효 주문을 업로드함 (발견된 상태값: ${[...statusSeen].join(', ') || '없음'})`
          }
        } else {
          orders = rows.map((row, idx) => {
            if (isMarketPlus) {
              const { order, autoMappingKey, autoMappingAbbr } = parseMarketPlusRow(row, idx, today)
              if (autoMappingKey && autoMappingAbbr) {
                autoMappingUpdates[autoMappingKey] = autoMappingAbbr
              }
              return order
            }
            if (isAlways) {
              const nCell = alwaysAoa?.[idx + 1]?.[13]
              return parseAlwaysRow(row, idx, nCell)
            }
            if (isGSShop)       return parseGSShopRow(row, idx)
            if (isJasonDeal)    return parseJasonDealRow(row, idx)
            return parseGenericRow(row, idx, today, mallLabel)
          })
        }

        // 모든 주문에 캡처된 쇼핑몰 ID를 명시적으로 태깅 (import_source 라벨 불일치로 인한
        // 동기화 오류를 원천 차단 — 이 값만으로 안전하게 "같은 쇼핑몰의 이전 업로드"를 식별)
        orders.forEach(o => {
          o.extra_data = { ...(o.extra_data ?? {}), __mall_id: capturedMall }
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
          mall: capturedMall,
          date: today,
          orders,
          raw_rows: isTossShopping ? tossSyntheticRaw : rows,
          toss_raw_aoa: tossRawAoa,
          toss_sheet_name: tossSheetName,
          toss_row1_value: tossRow1Value,
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

        /* ── pm_orders_v1 원자적 동기화 ──
           removeOrdersByIds + upsertOrders 를 단일 localStorage 쓰기로 합쳐
           중간 상태(이벤트로 인한 잘못된 읽기)를 원천 차단.
           __mall_id(캡처된 영문 쇼핑몰 ID)로만 판별 — 라벨 문자열 불일치 가능성 제거 */
        const existingAll  = loadOrders()
        // 같은 쇼핑몰(__mall_id)+오늘 날짜의 이전 업로드만 제거 (당일 재업로드 허용).
        // __mall_id가 없는 구버전 데이터는 import_source 라벨로 하위호환 판별.
        const legacyImportSrc = isMarketPlus ? 'marketplus' : mallLabel
        const filtered = existingAll.filter(o => {
          if (o.order_date !== today) return true
          const mallId = o.extra_data?.['__mall_id']
          const isSameMall = mallId
            ? mallId === capturedMall
            : o.extra_data?.['import_source'] === legacyImportSrc
          return !isSameMall
        })
        // 다른 쇼핑몰 데이터는 그대로 유지하고 새 주문만 추가
        const finalOrders = [...filtered, ...syncOrders]
        const pmWriteOk = safeSetItem('pm_orders_v1', JSON.stringify(finalOrders))
        if (!pmWriteOk) {
          alert(
            `주문관리 동기화 실패!\n\n${mallLabel} 주문이 브라우저 저장공간 부족으로 주문관리 탭에 반영되지 못했습니다.\n` +
            '오래된 데이터를 정리했지만 여전히 공간이 부족합니다.\n브라우저 설정 → 사이트 데이터 삭제 후 다시 시도해주세요.'
          )
        }

        // 주문관리 탭 즉시 갱신 (같은 창 + 다른 탭)
        broadcastDashboardRefresh()
        try { window.dispatchEvent(new CustomEvent('pm_orders_updated')) } catch { /* ignore */ }

        // 오늘 등록 현황 갱신
        setTodaySummary(loadTodaySummary(today))

        const totalInStore = finalOrders.length
        setImportMsg({
          text: `${syncOrders.length}건 등록 완료${isMarketPlus ? ` (매핑 ${Object.keys(autoMappingUpdates).length}건 자동 업데이트)` : ''} · 주문관리 전체 ${totalInStore}건${tossFallbackNote}`,
          ok: true,
        })
        if (tossFallbackNote) {
          alert(`토스쇼핑 업로드 완료 (주의)\n\n${syncOrders.length}건 등록됨.${tossFallbackNote}`)
        }
      } catch (err) {
        const msg = '파일 파싱 오류: ' + String(err)
        setImportMsg({ text: msg, ok: false })
        alert('업로드 실패\n\n' + msg)
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
          <span style={{ fontSize: '10.5px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
                fontSize: '13.5px', fontWeight: isSel ? 800 : 600,
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
                <span style={{ marginLeft: 'auto', fontSize: '9px', fontWeight: 900, color: mall.color, background: `${mall.color}15`, padding: '1px 5px', borderRadius: 4 }}>멀티</span>
              )}
            </button>
          )
        })}
        {/* 마켓플러스 안내 */}
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#c2410c', marginBottom: 2 }}>💡 마켓플러스</p>
          <p style={{ fontSize: '9.5px', color: '#9a3412', lineHeight: 1.5 }}>
            여러 채널 주문 통합<br />
            상품명(관리용) 자동 매핑
          </p>
        </div>

        {/* 구분선 */}
        <div style={{ height: 1, background: '#f1f5f9', margin: '8px 2px' }} />

        {/* 오늘 등록 현황 */}
        {todaySummary.length > 0 && (
          <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <p style={{ fontSize: '9.5px', fontWeight: 900, color: '#15803d', marginBottom: 4 }}>📋 오늘 등록 현황</p>
            {todaySummary.map(s => (
              <div key={s.mall} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#166534', fontWeight: 700, marginBottom: 2 }}>
                <span>{s.label}</span>
                <span style={{ background: '#dcfce7', padding: '0 5px', borderRadius: 4 }}>{s.count}건</span>
              </div>
            ))}
          </div>
        )}

        {/* 오늘 데이터 초기화 버튼 */}
        {isToday && (
          <button
            onClick={() => {
              if (!confirm('오늘 등록한 모든 주문 데이터를 삭제할까요?')) return
              clearTodayData(today)
              setDayData(null)
              setTodaySummary([])
              setImportMsg(null)
              try { window.dispatchEvent(new CustomEvent('pm_orders_updated')) } catch { /* ignore */ }
            }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: '10px', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
          >
            🗑 오늘 데이터 초기화
          </button>
        )}

        {/* 구분선 */}
        <div style={{ height: 1, background: '#f1f5f9', margin: '4px 2px' }} />

        {/* 직접등록 버튼 */}
        <button
          onClick={handleDirectSelect}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: directMode ? '1.5px solid #7c3aed50' : '1.5px solid transparent',
            cursor: 'pointer', textAlign: 'left',
            fontSize: '13.5px', fontWeight: directMode ? 800 : 600,
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
                <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', margin: 0 }}>직접 주문 등록</h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, margin: '2px 0 0' }}>
                  상품코드 · 옵션 · 상품명 중 2개 이상 입력 필요 · 저장 후 주문관리로 이동
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
              {/* 쇼핑몰 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>쇼핑몰</p>
                <input value={directForm.mall} onChange={e => setDirectForm(p => ({ ...p, mall: e.target.value }))}
                  placeholder="예: 네이버스마트스토어"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 주문번호 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>주문번호</p>
                <input value={directForm.orderNumber} onChange={e => setDirectForm(p => ({ ...p, orderNumber: e.target.value }))}
                  placeholder="미입력 시 자동 생성"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품코드 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품코드 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '10px', textTransform: 'none' }}>3개 중 2개</span>
                </p>
                <input value={directForm.productCode} onChange={e => setDirectForm(p => ({ ...p, productCode: e.target.value }))}
                  placeholder="상품 코드"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 옵션 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  옵션 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '10px', textTransform: 'none' }}>3개 중 2개</span>
                </p>
                <input value={directForm.option} onChange={e => setDirectForm(p => ({ ...p, option: e.target.value }))}
                  placeholder="예: 블랙 / L"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품명 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품명 <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '10px', textTransform: 'none' }}>3개 중 2개 · 상품코드 입력 시 자동조회</span>
                </p>
                <input value={directForm.productName} onChange={e => setDirectForm(p => ({ ...p, productName: e.target.value }))}
                  placeholder="상품코드 입력 시 자동 조회되거나 직접 입력"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 상품약어 auto */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  상품약어 <span style={{ fontWeight: 600, fontSize: '10px', color: '#a78bfa' }}>자동생성</span>
                </p>
                <div style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #ede9fe', background: '#f5f3ff', fontSize: '13px', fontWeight: 700, color: directForm.abbreviation ? '#7c3aed' : '#c4b5fd', minHeight: 38, display: 'flex', alignItems: 'center' }}>
                  {directForm.abbreviation || '상품코드 입력 후 자동 조회'}
                </div>
              </div>

              {/* 바코드 auto */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                  바코드 <span style={{ fontWeight: 600, fontSize: '10px', color: '#a78bfa' }}>자동생성</span>
                </p>
                <div data-pm-barcode="1" style={{ padding: '9px 12px', borderRadius: 9, border: '1.5px solid #ede9fe', background: '#f5f3ff', fontSize: '13px', fontWeight: 700, color: directForm.barcode ? undefined : '#c4b5fd', minHeight: 38, display: 'flex', alignItems: 'center' }}>
                  {directForm.barcode || '상품코드+옵션 입력 후 자동 조회'}
                </div>
              </div>

              {/* 수량 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수량 <span style={{ color: '#ef4444' }}>*</span></p>
                <input type="number" min={1} value={directForm.quantity}
                  onChange={e => setDirectForm(p => ({ ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 전화번호 */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>전화번호</p>
                <input value={directForm.phone} onChange={e => setDirectForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 수령인 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수령인 <span style={{ color: '#ef4444' }}>*</span></p>
                <input value={directForm.recipientName} onChange={e => setDirectForm(p => ({ ...p, recipientName: e.target.value }))}
                  placeholder="수령인 이름"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 수령인 주소 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>수령인 주소 <span style={{ color: '#ef4444' }}>*</span></p>
                <input value={directForm.recipientAddress} onChange={e => setDirectForm(p => ({ ...p, recipientAddress: e.target.value }))}
                  placeholder="배송 주소 입력"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>

              {/* 배송메세지 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>배송메세지</p>
                <input value={directForm.deliveryMessage} onChange={e => setDirectForm(p => ({ ...p, deliveryMessage: e.target.value }))}
                  placeholder="배송 요청사항"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box' }} />
              </div>
            </div>

            {directMsg && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9, background: directMsg.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${directMsg.ok ? '#bbf7d0' : '#fecaca'}` }}>
                {directMsg.ok
                  ? <CheckCircle2 size={14} style={{ color: '#059669', flexShrink: 0 }} />
                  : <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />}
                <span style={{ fontSize: '13px', fontWeight: 700, color: directMsg.ok ? '#059669' : '#dc2626' }}>{directMsg.text}</span>
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleDirectSave} disabled={directSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#7c3aed', color: 'white', borderRadius: 10, fontSize: '13.5px', fontWeight: 800, border: 'none', cursor: directSaving ? 'not-allowed' : 'pointer', opacity: directSaving ? 0.6 : 1 }}>
                <PackageCheck size={15} />
                {directSaving ? '저장 중...' : '저장 후 주문관리로 이동'}
              </button>
              <button onClick={() => { setDirectForm(emptyDirectForm()); setDirectMsg(null) }}
                style={{ padding: '10px 18px', background: '#f1f5f9', color: '#64748b', borderRadius: 10, fontSize: '13px', fontWeight: 700, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
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
              <p style={{ fontSize: '16px', fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>쇼핑몰을 선택해주세요</p>
              <p style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 600 }}>왼쪽에서 주문서를 등록할 쇼핑몰을 선택하세요</p>
            </div>
          </div>
        ) : (
          <>
            {/* 날짜 네비게이션 + 업로드 바 */}
            <div className="pm-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: activeMall?.color, background: activeMall?.bg, padding: '4px 12px', borderRadius: 20, border: `1px solid ${activeMall?.color}30` }}>
                {activeMall?.label}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setCurrentDate(prev => addDays(prev, -1))}
                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={15} style={{ color: '#64748b' }} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 10, background: isToday ? '#eff6ff' : '#f8fafc', border: isToday ? '1px solid #bfdbfe' : '1px solid #e2e8f0', minWidth: 190 }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{formatDateKo(currentDate)}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{getDayOfWeek(currentDate)}</span>
                  {isToday && <span style={{ fontSize: '10px', fontWeight: 900, color: '#2563eb', background: '#dbeafe', padding: '2px 7px', borderRadius: 20 }}>TODAY</span>}
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
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: activeMall?.color ?? '#2563eb', color: 'white', borderRadius: 10, fontSize: '13px', fontWeight: 800, border: 'none', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    <Upload size={14} />
                    {importing ? '처리 중...' : '주문서 업로드'}
                  </button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
                  {checkedIds.size > 0 && (
                    <button onClick={handleOrderConfirm}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', background: '#059669', color: 'white', borderRadius: 10, fontSize: '13px', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                      <PackageCheck size={14} />주문확인 ({checkedIds.size})
                    </button>
                  )}
                </>
              )}

              {importMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: importMsg.ok ? '#ecfdf5' : '#fef2f2' }}>
                  {importMsg.ok ? <CheckCircle2 size={13} style={{ color: '#059669' }} /> : <AlertCircle size={13} style={{ color: '#dc2626' }} />}
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: importMsg.ok ? '#059669' : '#dc2626' }}>{importMsg.text}</span>
                </div>
              )}
              {dayData && dayData.orders.length > 0 && (
                <>
                  <span style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>총 {dayData.orders.length}건</span>
                  {checkedIds.size > 0 && (
                    <button onClick={handleDeleteChecked}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: '12px', fontWeight: 800, border: '1.5px solid #fecaca', cursor: 'pointer' }}>
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
                    <p style={{ fontSize: '15px', fontWeight: 800, color: '#94a3b8', marginBottom: 6 }}>
                      {isToday ? '주문서를 업로드해주세요' : '해당 날짜의 주문 내역이 없습니다'}
                    </p>
                    <p style={{ fontSize: '12.5px', color: '#cbd5e1', fontWeight: 600 }}>
                      {isToday ? `${activeMall?.label} 주문서 파일을 업로드하세요` : '이 날짜에 업로드된 주문서가 없습니다'}
                    </p>
                  </div>
                  {isToday && (
                    <button onClick={() => fileRef.current?.click()} disabled={importing}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: activeMall?.color ?? '#2563eb', color: 'white', borderRadius: 12, fontSize: '13.5px', fontWeight: 800, border: 'none', cursor: 'pointer', marginTop: 4 }}>
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
                      <span key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
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
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: activeMall?.color ?? '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {order.order_number}
                          </span>
                          {displayChannel && (
                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{displayChannel}</span>
                          )}
                        </div>
                        <div onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', overflow: 'hidden' }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                            {order.items[0]?.product_name}
                            {order.items.length > 1 && <span style={{ fontSize: '11.5px', color: '#94a3b8', marginLeft: 4 }}>외 {order.items.length - 1}건</span>}
                          </p>
                          {order.items[0]?.option && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: 1, margin: '1px 0 0' }}>{order.items[0].option}</p>}
                        </div>
                        <span onClick={() => setSelectedOrder(order)} style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>{order.customer_name}</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569', textAlign: 'center' }}>{totalQty}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: st.color, background: st.bg, padding: '3px 8px', borderRadius: 6, textAlign: 'center', display: 'block' }}>{st.label}</span>
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
                <p style={{ fontSize: '10px', fontWeight: 900, color: activeMall?.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{activeMall?.label}</p>
                <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
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
                  <p style={{ fontSize: '10.5px', fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>
            {selectedOrder.shipping_address && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '10.5px', fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address}</p>
              </div>
            )}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 14 }}>
              <p style={{ fontSize: '10.5px', fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < selectedOrder.items.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                  <div>
                    <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku    && <p style={{ fontSize: '11px',   color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p> : null}
                  </div>
                </div>
              ))}
            </div>
            {selectedOrder.memo && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
                <p style={{ fontSize: '12px', color: '#64748b' }}>메모: {selectedOrder.memo}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
