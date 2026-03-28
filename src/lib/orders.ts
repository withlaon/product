import { broadcastDashboardRefresh } from './dashboard-sync'

/* ─── 출고내역 타입 ─────────────────────────────────────── */
export interface ShippedOrder extends Omit<Order, 'status'> {
  status: 'shipped' | 'delivered'
  shipped_at: string        // 출고확정 시각 ISO string
  history_moved?: boolean   // 송장전송파일 탭에서 출고내역 탭으로 이동 완료 여부
  stock_applied?: boolean   // 출고확정 시 재고 차감 완료 여부
}

export const SHIPPED_ORDERS_KEY = 'pm_shipped_orders_v1'

export function loadShippedOrders(): ShippedOrder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SHIPPED_ORDERS_KEY)
    return raw ? (JSON.parse(raw) as ShippedOrder[]) : []
  } catch { return [] }
}

async function persistShippedUpsertsToServer(updates: ShippedOrder[]) {
  if (typeof window === 'undefined' || updates.length === 0) return
  try {
    await fetch('/api/pm-shipped-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upserts: updates }),
    })
  } catch { /* ignore */ }
}

async function persistShippedDeletesToServer(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  try {
    await fetch('/api/pm-shipped-orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  } catch { /* ignore */ }
}

/** 서버(pm_shipped_orders)와 로컬 캐시 병합. DB가 비어 있고 로컬만 있으면 1회 업로드 */
export async function hydrateShippedOrdersFromServer(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const res = await fetch('/api/pm-shipped-orders')
    if (!res.ok) return
    const json = (await res.json()) as { orders?: ShippedOrder[] }
    const remote = Array.isArray(json.orders) ? json.orders : []
    const local = loadShippedOrders()

    if (remote.length === 0 && local.length > 0) {
      await persistShippedUpsertsToServer(local)
      return
    }

    const byId = new Map<string, ShippedOrder>()
    for (const o of local) byId.set(o.id, o)
    for (const o of remote) byId.set(o.id, o)
    const merged = Array.from(byId.values())
    try {
      localStorage.setItem(SHIPPED_ORDERS_KEY, JSON.stringify(merged))
    } catch { /* ignore */ }
    broadcastDashboardRefresh()
  } catch { /* ignore */ }
}

/** 출고 저장소: id 기준 병합만 (전달하지 않은 id는 삭제하지 않음). 제거는 removeShippedOrdersByIds. */
export function upsertShippedOrders(updates: ShippedOrder[]) {
  if (updates.length === 0) return
  try {
    const prev = loadShippedOrders()
    const upd  = new Map(updates.map(o => [o.id, o]))
    const next: ShippedOrder[] = prev.map(o => upd.get(o.id) ?? o)
    for (const o of updates) {
      if (!prev.some(p => p.id === o.id)) next.push(o)
    }
    localStorage.setItem(SHIPPED_ORDERS_KEY, JSON.stringify(next))
  } catch {}
  broadcastDashboardRefresh()
  void persistShippedUpsertsToServer(updates)
}

/** 사용자가 명시적으로 삭제·출고취소한 출고 건만 제거 */
export function removeShippedOrdersByIds(ids: string[]) {
  if (ids.length === 0) return
  try {
    const idSet = new Set(ids)
    const prev = loadShippedOrders()
    localStorage.setItem(SHIPPED_ORDERS_KEY, JSON.stringify(prev.filter(o => !idSet.has(o.id))))
  } catch {}
  broadcastDashboardRefresh()
  void persistShippedDeletesToServer(ids)
}

/** @deprecated 호환용: 내용은 upsertShippedOrders 와 동일(부분 배열로 기존 데이터를 지우지 않음) */
export function saveShippedOrders(orders: ShippedOrder[]) {
  upsertShippedOrders(orders)
}

/** 출고내역 탭 표시 조건: 송장 탭에서 '이동'한 건 + 출고확정(delivered). stored JSON 에 status 대소문자/공백만 다른 경우 보정 */
export function isVisibleInShippingHistory(o: ShippedOrder): boolean {
  if (o.history_moved === true) return true
  const st = String((o as { status?: unknown }).status ?? '').trim().toLowerCase()
  return st === 'delivered'
}

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

/** 주문 저장소: id 기준 병합만. 삭제·큐 이동 등은 removeOrdersByIds. */
export function upsertOrders(updates: Order[]) {
  if (updates.length === 0) return
  try {
    const prev = loadOrders()
    const upd  = new Map(updates.map(o => [o.id, o]))
    const next: Order[] = prev.map(o => upd.get(o.id) ?? o)
    for (const o of updates) {
      if (!prev.some(p => p.id === o.id)) next.push(o)
    }
    localStorage.setItem(ORDERS_KEY, JSON.stringify(next))
  } catch {}
  broadcastDashboardRefresh()
}

/** 삭제 확인, 송장 큐 이동, 당일 재업로드 교체 등: 지정 id만 제거 */
export function removeOrdersByIds(ids: string[]) {
  if (ids.length === 0) return
  try {
    const idSet = new Set(ids)
    const prev = loadOrders()
    localStorage.setItem(ORDERS_KEY, JSON.stringify(prev.filter(o => !idSet.has(o.id))))
  } catch {}
  broadcastDashboardRefresh()
}

/** @deprecated 호환용: upsertOrders 와 동일 */
export function saveOrders(orders: Order[]) {
  upsertOrders(orders)
}

/* ─── 송장출력/등록 대기 큐 (주문관리 → 송장출력/등록 이동용) ── */
export const INVOICE_QUEUE_KEY = 'pm_invoice_queue_v1'

export function loadInvoiceQueue(): Order[] {
  try {
    const raw = localStorage.getItem(INVOICE_QUEUE_KEY)
    return raw ? (JSON.parse(raw) as Order[]) : []
  } catch { return [] }
}

/** 송장 큐: id 기준 병합만. 큐에서 빼기는 removeInvoiceQueueByIds. */
export function upsertInvoiceQueue(updates: Order[]) {
  if (updates.length === 0) return
  try {
    const prev = loadInvoiceQueue()
    const upd  = new Map(updates.map(o => [o.id, o]))
    const next: Order[] = prev.map(o => upd.get(o.id) ?? o)
    for (const o of updates) {
      if (!prev.some(p => p.id === o.id)) next.push(o)
    }
    localStorage.setItem(INVOICE_QUEUE_KEY, JSON.stringify(next))
  } catch {}
  broadcastDashboardRefresh()
}

export function removeInvoiceQueueByIds(ids: string[]) {
  if (ids.length === 0) return
  try {
    const idSet = new Set(ids)
    const prev = loadInvoiceQueue()
    localStorage.setItem(INVOICE_QUEUE_KEY, JSON.stringify(prev.filter(o => !idSet.has(o.id))))
  } catch {}
  broadcastDashboardRefresh()
}

/** @deprecated 호환용: upsertInvoiceQueue 와 동일 */
export function saveInvoiceQueue(orders: Order[]) {
  upsertInvoiceQueue(orders)
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
  barcode?: string           // 옵션 바코드 (내 상품 옵션 선택 시 자동 입력)
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
