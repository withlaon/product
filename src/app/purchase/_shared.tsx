/* 발주/입고관리 공통 타입·유틸·컴포넌트 */
import { ChevronLeft, ChevronRight } from 'lucide-react'

/* ── 발주 금액 계산 상수 ── */
export const DEFAULT_EXCHANGE_RATE = 210
/** 원가 → 발주금액 환산: 외화기준 단가 × 환율 × 관부가세(1.18) × 마진(1.25) */
export const PRICE_FACTOR = 1.18 * 1.25  // = 1.475
/** 단가 → 발주금액 단가
 *  - 원화(원/KRW): 그대로 (관부가세·마진 미적용)
 *  - 외화(CNY 등): 환율 환산 후 PRICE_FACTOR 적용
 */
export function unitToOrderKrw(costPrice: number, currency: string, exchangeRate: number): number {
  const isKrw = currency === '원' || currency === 'KRW'
  if (isKrw) return costPrice
  return costPrice * exchangeRate * PRICE_FACTOR
}

/* ── 타입 ── */
export type PurchaseStatus = 'ordered' | 'partial' | 'completed' | 'cancelled'
export type DateMode = 'month' | 'day'

export interface PurchaseItem {
  product_code: string
  option_name:  string
  barcode:      string
  ordered:      number
  received:     number
}
export interface Purchase {
  id:          string
  order_date:  string
  supplier:    string
  status:      PurchaseStatus
  ordered_at:  string
  received_at: string | null
  items:       PurchaseItem[]
}

/* ── pm_purchases API 유틸 (SERVICE_ROLE_KEY 사용 → RLS/스키마 캐시 문제 우회) ── */
const PO_API = '/api/pm-purchases'

export async function apiFetchPurchases(): Promise<Purchase[]> {
  try {
    const res = await fetch(PO_API)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

export async function apiInsertPurchase(payload: Omit<Purchase, 'id'> & { id?: string }): Promise<{ data: Purchase | null; error: string | null }> {
  try {
    const res = await fetch(PO_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json.error ?? `${res.status}` }
    return { data: json as Purchase, error: null }
  } catch (e) { return { data: null, error: String(e) } }
}

export async function apiUpdatePurchase(id: string, fields: Partial<Purchase>): Promise<{ error: string | null }> {
  try {
    const res = await fetch(PO_API, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...fields }) })
    if (!res.ok) { const j = await res.json(); return { error: j.error ?? `${res.status}` } }
    return { error: null }
  } catch (e) { return { error: String(e) } }
}

export async function apiDeletePurchase(id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(PO_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!res.ok) { const j = await res.json(); return { error: j.error ?? `${res.status}` } }
    return { error: null }
  } catch (e) { return { error: String(e) } }
}
export interface PmOption {
  name: string; barcode: string; chinese_name?: string; korean_name?: string; size?: string
  image?: string
  ordered?: number; received?: number; sold?: number; current_stock?: number; defective?: number
}
export interface PmProduct {
  id: string; code: string; name: string; abbr?: string; status?: string; options: PmOption[]
}

/* ── 상태 표시 ── */
export const ST: Record<PurchaseStatus, { label: string; bg: string; color: string }> = {
  ordered:   { label: '발주완료', bg: '#eff6ff', color: '#2563eb' },
  partial:   { label: '부분입고', bg: '#fffbeb', color: '#d97706' },
  completed: { label: '입고완료', bg: '#f0fdf4', color: '#15803d' },
  cancelled: { label: '취소',    bg: '#f8fafc', color: '#64748b' },
}

export function isUnresolved(p: Purchase) {
  return p.status !== 'completed' && p.status !== 'cancelled' &&
    p.items.some(i => i.received < i.ordered)
}

/* ── 날짜 헬퍼 ── */
export function getToday()     { return new Date().toISOString().slice(0,10) }
export function getThisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
}
export function shiftDay(d: string, delta: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + delta); return dt.toISOString().slice(0,10)
}
export function fmtMonthLabel(ym: string) {
  return `${ym.slice(0,4)}년 ${ym.slice(5)}월`
}
export function fmtDayLabel(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getFullYear()}년 ${dt.getMonth()+1}월 ${dt.getDate()}일(${['일','월','화','수','목','금','토'][dt.getDay()]})`
}
export function fmtDateShort(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth()+1}/${dt.getDate()}(${['일','월','화','수','목','금','토'][dt.getDay()]})`
}

/* ── 상품 수량 동기화 ──
   /api/pm-sync-qty 에서 서버사이드로 전체 처리 (SERVICE_ROLE_KEY, RLS 우회)
── */
export async function syncProductQty(
  _products: PmProduct[],   // (미사용, 호환성 유지용)
  rows: { prodId: string; optName: string; barcode?: string; orderedDelta: number; receivedDelta: number }[]
) {
  const validRows = rows.filter(r => r.prodId)
  if (validRows.length === 0) return

  const res = await fetch('/api/pm-sync-qty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: validRows }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(json?.error ?? `수량 동기화 실패 HTTP ${res.status}`)
  }
  if (!json?.ok) {
    throw new Error(json?.error ?? '수량 동기화 실패 (알 수 없는 오류)')
  }
}

/* ── 날짜 네비게이터 컴포넌트 ── */
export function DateNav({
  mode, setMode, month, setMonth, day, setDay,
}: {
  mode: DateMode; setMode: (m: DateMode) => void
  month: string; setMonth: (m: string) => void
  day: string;   setDay:   (d: string) => void
}) {
  const today     = getToday()
  const thisMonth = getThisMonth()
  const isMonth   = mode === 'month'
  const isFuture  = isMonth ? month >= thisMonth : day >= today

  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ display:'flex', borderRadius:7, overflow:'hidden', border:'1.5px solid #e2e8f0' }}>
        {(['month','day'] as DateMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ padding:'4px 10px', fontSize:11, fontWeight:700, border:'none', cursor:'pointer',
              background: mode===m ? '#2563eb' : 'white', color: mode===m ? 'white' : '#64748b' }}>
            {m==='month' ? '월별' : '일별'}
          </button>
        ))}
      </div>
      <button onClick={() => isMonth ? setMonth(shiftMonth(month,-1)) : setDay(shiftDay(day,-1))}
        style={{ width:26,height:26,borderRadius:6,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <ChevronLeft size={12} />
      </button>
      <span style={{ fontSize:12,fontWeight:800,color:'#0f172a',minWidth:isMonth?80:130,textAlign:'center',whiteSpace:'nowrap' }}>
        {isMonth ? fmtMonthLabel(month) : fmtDayLabel(day)}
      </span>
      <button onClick={() => isMonth ? setMonth(shiftMonth(month,1)) : setDay(shiftDay(day,1))}
        disabled={isFuture}
        style={{ width:26,height:26,borderRadius:6,border:'1.5px solid #e2e8f0',background:'white',cursor:isFuture?'not-allowed':'pointer',opacity:isFuture?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <ChevronRight size={12} />
      </button>
      <button onClick={() => isMonth ? setMonth(thisMonth) : setDay(today)}
        style={{ fontSize:10.5,fontWeight:700,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:6,padding:'4px 9px',cursor:'pointer' }}>
        {isMonth ? '이번달' : '오늘'}
      </button>
    </div>
  )
}
