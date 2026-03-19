/* ─── 주문 타입 ─────────────────────────────────────────── */
export interface OrderItem {
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
  extra_data?: Record<string, unknown>  // 쇼핑몰별 추가 원본 데이터
}

/* ─── 주문 스토리지 ──────────────────────────────────────── */
export const ORDERS_KEY = 'pm_orders_v1'

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY)
    return raw ? (JSON.parse(raw) as Order[]) : []
  } catch { return [] }
}

export function saveOrders(orders: Order[]) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)) } catch {}
}

/* ─── 선택 주문 임시 스토리지 (주문관리 → 송장등록 이동용) ── */
export const SELECTED_INVOICE_KEY = 'pm_selected_for_invoice'

export function saveSelectedForInvoice(ids: string[]) {
  try { localStorage.setItem(SELECTED_INVOICE_KEY, JSON.stringify(ids)) } catch {}
}

export function loadSelectedForInvoice(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_INVOICE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

export function clearSelectedForInvoice() {
  try { localStorage.removeItem(SELECTED_INVOICE_KEY) } catch {}
}

/* ─── 매핑 타입 ──────────────────────────────────────────── */
export interface ProductMapping {
  abbreviation: string       // 상품약어 (내 상품의 abbr 또는 수동 입력)
  loca: string               // LOCA 위치코드 (내 상품의 loca 또는 수동 입력)
  product_id?: string        // 연결된 내 상품 ID
  product_code?: string      // 연결된 내 상품 코드
  my_product_name?: string   // 연결된 내 상품명
  my_option_name?: string    // 연결된 내 상품 옵션명
}

export type MappingStore = Record<string, ProductMapping>  // key: product_name

export const MAPPING_KEY = 'pm_product_mapping_v1'

export function loadMappings(): MappingStore {
  try {
    const raw = localStorage.getItem(MAPPING_KEY)
    return raw ? (JSON.parse(raw) as MappingStore) : {}
  } catch { return {} }
}

export function saveMappings(m: MappingStore) {
  try { localStorage.setItem(MAPPING_KEY, JSON.stringify(m)) } catch {}
}

/** 매핑 키: 상품명 + 옵션 복합키 (없으면 상품명만) */
export function makeMappingKey(product_name: string, option?: string): string {
  return option ? `${product_name}|||${option}` : product_name
}

/** 매핑 조회 (복합키 → 상품명만 순으로 폴백) */
export function lookupMapping(mappings: MappingStore, product_name: string, option?: string): ProductMapping {
  if (option) {
    const key = makeMappingKey(product_name, option)
    if (mappings[key]) return mappings[key]
  }
  if (mappings[product_name]) return mappings[product_name]
  return { abbreviation: '', loca: '' }
}

/** 매핑 키에서 [상품명, 옵션] 분리 */
export function splitMappingKey(key: string): [string, string] {
  const idx = key.indexOf('|||')
  if (idx === -1) return [key, '']
  return [key.slice(0, idx), key.slice(idx + 3)]
}

/* ─── 마켓플러스 채널 매핑 ─────────────────────────────── */
export const MP_CHANNEL_MAP: Record<string, string> = {
  '네이버 페이': '카페24',
  '네이버페이':  '카페24',
}

/** 마켓플러스 매출경로 → 시스템 channel */
export function mpToChannel(매출경로: string): string {
  return MP_CHANNEL_MAP[매출경로] ?? 매출경로
}

/** 시스템 channel → 마켓플러스 매출경로 */
export function channelToMp(channel: string): string {
  for (const [mp, ch] of Object.entries(MP_CHANNEL_MAP)) {
    if (ch === channel) return mp
  }
  return channel
}

/* ─── Excel 다운로드 헬퍼 ────────────────────────────────── */
export function downloadExcel(rows: Record<string, unknown>[], filename: string) {
  if (typeof window === 'undefined') return
  // 동적 import로 사용 (호출 측에서 import * as XLSX 사용)
  import('xlsx').then(XLSX => {
    const ws  = XLSX.utils.json_to_sheet(rows)
    const wb  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '송장')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  })
}

/* ─── 색상 추출 (옵션명에서 한글 색상 추출) ─────────────── */
export function extractColor(option: string): string {
  if (!option) return ''
  const colorMap: [string, string][] = [
    ['블랙', '블랙'], ['검정', '블랙'], ['검은', '블랙'],
    ['화이트', '화이트'], ['흰색', '화이트'], ['흰', '화이트'],
    ['레드', '레드'], ['빨강', '레드'], ['빨간', '레드'], ['적색', '레드'],
    ['블루', '블루'], ['파랑', '블루'], ['파란', '블루'], ['청색', '블루'],
    ['그린', '그린'], ['초록', '그린'], ['녹색', '그린'],
    ['옐로우', '옐로우'], ['노랑', '옐로우'], ['노란', '옐로우'], ['황색', '옐로우'],
    ['핑크', '핑크'], ['분홍', '핑크'],
    ['퍼플', '퍼플'], ['보라', '퍼플'],
    ['오렌지', '오렌지'], ['주황', '오렌지'],
    ['그레이', '그레이'], ['회색', '그레이'], ['그레이색', '그레이'],
    ['네이비', '네이비'], ['남색', '네이비'],
    ['베이지', '베이지'],
    ['아이보리', '아이보리'],
    ['브라운', '브라운'], ['갈색', '브라운'],
    ['카키', '카키'],
    ['민트', '민트'],
    ['라벤더', '라벤더'],
    ['골드', '골드'], ['금색', '골드'],
    ['실버', '실버'], ['은색', '실버'],
    ['샴페인', '샴페인'],
  ]
  for (const [keyword, color] of colorMap) {
    if (option.includes(keyword)) return color
  }
  return ''
}

/* ─── 상태 맵 ────────────────────────────────────────────── */
export const STATUS_MAP = {
  pending:   { label: '결제완료', color: '#2563eb', bg: '#eff6ff' },
  confirmed: { label: '처리중',   color: '#d97706', bg: '#fffbeb' },
  shipped:   { label: '배송중',   color: '#7c3aed', bg: '#f5f3ff' },
  delivered: { label: '배송완료', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: '취소',     color: '#dc2626', bg: '#fef2f2' },
} as const

/* ─── 날짜 유틸 ─────────────────────────────────────────── */
export function toOrderDate(val: unknown, fallback: string): string {
  if (!val) return fallback
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  try {
    const d = new Date(String(val))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  return fallback
}
