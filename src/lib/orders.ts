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
  abbreviation: string  // 상품약어
  loca: string          // LOCA 위치코드
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
