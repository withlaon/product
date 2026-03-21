/* 발주/입고관리 공통 타입·유틸·컴포넌트 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
   Supabase에서 항상 최신 options를 가져와 업데이트 → 이미지 등 다른 필드 유실 방지
── */
export async function syncProductQty(
  _products: PmProduct[],   // fallback용 (fresh fetch 실패 시)
  rows: { prodId: string; optName: string; barcode?: string; orderedDelta: number; receivedDelta: number }[]
) {
  const grouped: Record<string, typeof rows> = {}
  for (const r of rows) {
    if (!r.prodId) continue
    if (!grouped[r.prodId]) grouped[r.prodId] = []
    grouped[r.prodId].push(r)
  }
  for (const [prodId, updates] of Object.entries(grouped)) {
    // 항상 DB에서 최신 options 조회 (이미지 포함 전체 필드 보존)
    const { data: fresh } = await supabase
      .from('pm_products')
      .select('id,options')
      .eq('id', prodId)
      .single()

    const baseOpts: PmOption[] = fresh?.options
      ?? _products.find(p => p.id === prodId)?.options
      ?? []

    const updatedOpts = baseOpts.map((opt: PmOption) => {
      // 바코드 우선 매칭, 바코드 불일치 시 옵션명으로 fallback
      const u = updates.find(u =>
        (u.barcode && u.barcode === opt.barcode) ||
        (u.optName && (u.optName === opt.name || u.optName === opt.korean_name))
      )
      if (!u) return opt
      const newOrdered  = Math.max(0, (opt.ordered || 0) + u.orderedDelta)
      const prevStock   = opt.current_stock !== undefined ? opt.current_stock : Math.max(0, (opt.received||0)-(opt.sold||0))
      const newReceived = Math.max(0, (opt.received||0) + u.receivedDelta)
      const newStock    = Math.max(0, prevStock + u.receivedDelta)
      return { ...opt, ordered: newOrdered, received: newReceived, current_stock: newStock }
    })
    await supabase.from('pm_products').update({ options: updatedOpts }).eq('id', prodId)
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
