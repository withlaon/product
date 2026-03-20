'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  PackagePlus, CheckCircle2,
  Truck, X, Edit2, Trash2,
  ChevronLeft, ChevronRight, Plus,
} from 'lucide-react'

/* ── 타입 ── */
type PurchaseStatus = 'ordered' | 'partial' | 'completed' | 'cancelled'
type SubTab = 'purchase' | 'receive'
type DateMode = 'month' | 'day'

interface PurchaseItem {
  product_code: string
  option_name:  string
  barcode:      string
  ordered:      number
  received:     number
}
interface Purchase {
  id:          string
  order_date:  string
  supplier:    string
  status:      PurchaseStatus
  ordered_at:  string
  received_at: string | null
  items:       PurchaseItem[]
}
interface PmOption {
  name: string; barcode: string; chinese_name?: string
  ordered?: number; received?: number; sold?: number; current_stock?: number
}
interface PmProduct { id: string; code: string; name: string; options: PmOption[] }

/* ── 상태 표시 ── */
const ST: Record<PurchaseStatus, { label: string; bg: string; color: string }> = {
  ordered:   { label: '발주완료', bg: '#eff6ff', color: '#2563eb' },
  partial:   { label: '부분입고', bg: '#fffbeb', color: '#d97706' },
  completed: { label: '입고완료', bg: '#f0fdf4', color: '#15803d' },
  cancelled: { label: '취소',    bg: '#f8fafc', color: '#64748b' },
}

function isUnresolved(p: Purchase) {
  return p.status !== 'completed' && p.status !== 'cancelled' &&
    p.items.some(i => i.received < i.ordered)
}

/* ── 날짜 헬퍼 ── */
function getToday()     { const d = new Date(); return d.toISOString().slice(0,10) }
function getThisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
}
function shiftDay(d: string, delta: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + delta); return dt.toISOString().slice(0,10)
}
function fmtMonthLabel(ym: string) {
  return `${ym.slice(0,4)}년 ${ym.slice(5)}월`
}
function fmtDayLabel(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getFullYear()}년 ${dt.getMonth()+1}월 ${dt.getDate()}일(${['일','월','화','수','목','금','토'][dt.getDay()]})`
}

/* ── 상품 수량 동기화 ── */
async function syncProductQty(
  products: PmProduct[],
  rows: { prodId: string; optName: string; orderedDelta: number; receivedDelta: number }[]
) {
  const grouped: Record<string, typeof rows> = {}
  for (const r of rows) {
    if (!r.prodId) continue
    if (!grouped[r.prodId]) grouped[r.prodId] = []
    grouped[r.prodId].push(r)
  }
  for (const [prodId, updates] of Object.entries(grouped)) {
    const prod = products.find(p => p.id === prodId)
    if (!prod) continue
    const updatedOpts = prod.options.map(opt => {
      const u = updates.find(u => u.optName === opt.name)
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
function DateNav({
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
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      {/* 월별 / 일별 토글 */}
      <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1.5px solid #e2e8f0' }}>
        {(['month','day'] as DateMode[]).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            style={{
              padding:'5px 12px', fontSize:11.5, fontWeight:700, border:'none', cursor:'pointer',
              background: mode === m ? '#2563eb' : 'white',
              color:      mode === m ? 'white'   : '#64748b',
            }}>{m === 'month' ? '월별' : '일별'}</button>
        ))}
      </div>
      {/* 이전 */}
      <button
        onClick={() => isMonth ? setMonth(shiftMonth(month,-1)) : setDay(shiftDay(day,-1))}
        style={{ width:28,height:28,borderRadius:7,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <ChevronLeft size={13} />
      </button>
      {/* 현재 기간 표시 */}
      <span style={{ fontSize:13,fontWeight:800,color:'#0f172a',minWidth:isMonth?90:140,textAlign:'center' }}>
        {isMonth ? fmtMonthLabel(month) : fmtDayLabel(day)}
      </span>
      {/* 다음 (미래 이동 제한) */}
      <button
        onClick={() => isMonth ? setMonth(shiftMonth(month,1)) : setDay(shiftDay(day,1))}
        disabled={isFuture}
        style={{ width:28,height:28,borderRadius:7,border:'1.5px solid #e2e8f0',background:'white',cursor:isFuture?'not-allowed':'pointer',opacity:isFuture?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <ChevronRight size={13} />
      </button>
      {/* 오늘/이번달 바로가기 */}
      <button
        onClick={() => isMonth ? setMonth(thisMonth) : setDay(today)}
        style={{ fontSize:11,fontWeight:700,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:7,padding:'5px 10px',cursor:'pointer' }}>
        {isMonth ? '이번달' : '오늘'}
      </button>
    </div>
  )
}

/* ── 메인 ── */
export default function PurchasePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)

  const [subTab,  setSubTab]  = useState<SubTab>('purchase')

  /* 발주관리 날짜 */
  const [poMode,  setPoMode]  = useState<DateMode>('month')
  const [poMonth, setPoMonth] = useState(getThisMonth())
  const [poDay,   setPoDay]   = useState(getToday())

  /* 입고관리 날짜 */
  const [rcMode,  setRcMode]  = useState<DateMode>('month')
  const [rcMonth, setRcMonth] = useState(getThisMonth())
  const [rcDay,   setRcDay]   = useState(getToday())

  /* 모달 */
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [editTarget,    setEditTarget]    = useState<Purchase | null>(null)
  const [editFormData,  setEditFormData]  = useState<Purchase | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Purchase | null>(null)

  /* 발주 등록 모달 */
  const [isAddPo, setIsAddPo] = useState(false)
  const [poForm,  setPoForm]  = useState({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', ordered:'' }] })

  /* 입고 등록 모달 */
  const [isAddRc, setIsAddRc] = useState(false)
  const [rcForm,  setRcForm]  = useState({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', qty:'' }] })

  /* 로드 */
  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending:false })
    if (data) setPurchases(data as Purchase[])
  }, [])
  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('pm_products').select('id,code,name,options')
    if (data) setProducts(data as PmProduct[])
  }, [])
  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  /* 발주관리 필터 */
  const poKey         = poMode === 'month' ? poMonth : poDay
  const poFiltered    = useMemo(() => purchases.filter(p => p.order_date.startsWith(poKey)), [purchases, poKey])
  // 미입고 과거 건은 항상 표시
  const poUnresolved  = useMemo(() =>
    purchases.filter(p => isUnresolved(p) && !p.order_date.startsWith(poKey))
  , [purchases, poKey])
  const poAll         = useMemo(() => {
    const ids = new Set(poFiltered.map(p => p.id))
    return [...poFiltered, ...poUnresolved.filter(p => !ids.has(p.id))]
      .sort((a,b) => b.order_date.localeCompare(a.order_date))
  }, [poFiltered, poUnresolved])

  /* 입고관리 필터 (received_at 우선, 없으면 order_date) */
  const rcKey      = rcMode === 'month' ? rcMonth : rcDay
  const rcFiltered = useMemo(() =>
    purchases.filter(p => {
      if (p.status === 'cancelled') return false
      const dateRef = (p.received_at ?? p.order_date).slice(0, rcKey.length)
      return dateRef === rcKey
    })
  , [purchases, rcKey])

  /* KPI */
  const poTotal      = poFiltered.length
  const poOrderedQty = useMemo(() => poFiltered.reduce((s,p) => s + p.items.reduce((ss,i) => ss+i.ordered,0), 0), [poFiltered])
  const poUnresolvedQty = useMemo(() => purchases.filter(isUnresolved).reduce((s,p) => s + p.items.reduce((ss,i) => ss+Math.max(0,i.ordered-i.received),0),0), [purchases])

  const rcTotal      = rcFiltered.filter(p => p.status !== 'ordered').length
  const rcReceivedQty = useMemo(() => rcFiltered.reduce((s,p) => s + p.items.reduce((ss,i) => ss+i.received,0), 0), [rcFiltered])

  /* ── 입고 처리 ── */
  const handleReceive = async (receivedItems: Record<number, number>) => {
    if (!receiveTarget) return
    setSaving(true)
    const items = receiveTarget.items.map((item, i) => ({
      ...item, received: Math.min(item.ordered, item.received + (receivedItems[i] || 0)),
    }))
    const allDone = items.every(i => i.received >= i.ordered)
    const anyDone = items.some(i => i.received > 0)
    const updated = {
      ...receiveTarget, items,
      status: (allDone ? 'completed' : anyDone ? 'partial' : receiveTarget.status) as PurchaseStatus,
      received_at: allDone ? new Date().toISOString() : receiveTarget.received_at,
    }
    await supabase.from('pm_purchases').update({
      items: updated.items, status: updated.status, received_at: updated.received_at,
    }).eq('id', receiveTarget.id)
    const deltas = receiveTarget.items.map((item, i) => {
      const prod = products.find(p => p.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta:0, receivedDelta: receivedItems[i]||0 }
    }).filter(d => d.prodId && d.receivedDelta > 0)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setReceiveTarget(null); setSaving(false)
  }

  /* ── 수정 ── */
  const openEdit = (p: Purchase) => { setEditTarget(p); setEditFormData(JSON.parse(JSON.stringify(p))) }
  const handleEditSave = async () => {
    if (!editTarget || !editFormData) return
    setSaving(true)
    const orderedDeltas = editFormData.items.map((newItem, i) => {
      const oldItem = editTarget.items[i] || { product_code:'', option_name:'', barcode:'', ordered:0, received:0 }
      const prod = products.find(p => p.code === newItem.product_code || p.code === oldItem.product_code)
      return { prodId: prod?.id ?? '', optName: newItem.option_name, orderedDelta: newItem.ordered - oldItem.ordered, receivedDelta: newItem.received - oldItem.received }
    }).filter(d => d.prodId && (d.orderedDelta !== 0 || d.receivedDelta !== 0))
    await supabase.from('pm_purchases').update({
      order_date: editFormData.order_date, supplier: editFormData.supplier,
      status: editFormData.status, items: editFormData.items,
    }).eq('id', editTarget.id)
    if (orderedDeltas.length) await syncProductQty(products, orderedDeltas)
    await loadPurchases(); await loadProducts()
    setEditTarget(null); setEditFormData(null); setSaving(false)
  }

  /* ── 삭제 ── */
  const handleDelete = async (p: Purchase) => {
    setSaving(true)
    const deltas = p.items.map(item => {
      const prod = products.find(pr => pr.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: -item.ordered, receivedDelta: -item.received }
    }).filter(d => d.prodId)
    if (deltas.length) await syncProductQty(products, deltas)
    await supabase.from('pm_purchases').delete().eq('id', p.id)
    await loadPurchases(); await loadProducts()
    setDeleteTarget(null); setSaving(false)
  }

  /* ── 발주 등록 ── */
  const handleAddPo = async () => {
    if (!poForm.order_date) return
    const items = poForm.items.filter(i => i.product_code).map(i => ({
      product_code: i.product_code, option_name: i.option_name,
      barcode: i.barcode, ordered: Number(i.ordered)||0, received: 0,
    }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = {
      id: String(Date.now()), order_date: poForm.order_date,
      supplier: poForm.supplier||'미지정', status:'ordered',
      ordered_at: new Date().toISOString(), received_at: null, items,
    }
    await supabase.from('pm_purchases').insert(p)
    for (const item of items) {
      const prod = products.find(pr => pr.code === item.product_code)
      if (!prod) continue
      const updatedOpts = prod.options.map(o => {
        const match = !item.option_name || o.name === item.option_name || o.barcode === item.barcode
        return match ? { ...o, ordered: (o.ordered||0) + item.ordered } : o
      })
      await supabase.from('pm_products').update({ options: updatedOpts }).eq('id', prod.id)
    }
    await loadPurchases(); await loadProducts()
    setIsAddPo(false)
    setPoForm({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', ordered:'' }] })
    setSaving(false)
  }

  /* ── 입고 직접 등록 ── */
  const handleAddRc = async () => {
    if (!rcForm.order_date) return
    const items = rcForm.items.filter(i => i.product_code).map(i => ({
      product_code: i.product_code, option_name: i.option_name,
      barcode: i.barcode, ordered: Number(i.qty)||0, received: Number(i.qty)||0,
    }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = {
      id: String(Date.now()), order_date: rcForm.order_date,
      supplier: rcForm.supplier||'직접입고', status:'completed',
      ordered_at: new Date().toISOString(), received_at: new Date().toISOString(), items,
    }
    await supabase.from('pm_purchases').insert(p)
    await syncProductQty(products, items.map(i => {
      const prod = products.find(pr => pr.code === i.product_code)
      return { prodId: prod?.id??'', optName: i.option_name, orderedDelta: i.ordered, receivedDelta: i.received }
    }).filter(d => d.prodId))
    await loadPurchases(); await loadProducts()
    setIsAddRc(false)
    setRcForm({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', qty:'' }] })
    setSaving(false)
  }

  /* ── 공통 테이블 컬럼 ── */
  const PurchaseTable = ({ list, showReceiveBtn }: { list: Purchase[]; showReceiveBtn?: boolean }) => (
    list.length === 0
      ? <div style={{ textAlign:'center', padding:'32px 0', color:'#94a3b8' }}>
          <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }} />
          <p style={{ fontSize:13, fontWeight:700 }}>내역이 없습니다</p>
        </div>
      : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {['발주일','구매처','품목수','발주','입고','미입고','상태','관리'].map(h => (
                <th key={h} style={{ padding:'7px 10px', fontWeight:800, color:'#64748b', fontSize:11, textAlign:h==='구매처'||h==='발주일'?'left':'center', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(p => {
              const tOrd = p.items.reduce((s,i) => s+i.ordered, 0)
              const tRcv = p.items.reduce((s,i) => s+i.received, 0)
              const tMis = tOrd - tRcv
              const st   = ST[p.status]
              const pastUnresolved = isUnresolved(p) && !p.order_date.startsWith(poKey)
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc', background: pastUnresolved ? '#fffbeb' : undefined }}>
                  <td style={{ padding:'8px 10px', fontWeight:700, color:'#334155' }}>
                    {p.order_date}
                    {pastUnresolved && <span style={{ marginLeft:6, fontSize:10, fontWeight:800, color:'#d97706', background:'#fef3c7', padding:'1px 6px', borderRadius:99 }}>미입고↑</span>}
                  </td>
                  <td style={{ padding:'8px 10px', color:'#475569' }}>{p.supplier||'-'}</td>
                  <td style={{ textAlign:'center', color:'#64748b' }}>{p.items.length}건</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                  <td style={{ textAlign:'center', fontWeight:900, color: tMis>0?'#d97706':'#94a3b8' }}>{tMis.toLocaleString()}</td>
                  <td style={{ textAlign:'center' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:99 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                      {showReceiveBtn && p.status !== 'completed' && p.status !== 'cancelled' && (
                        <button onClick={() => setReceiveTarget(p)}
                          style={{ fontSize:11, fontWeight:800, color:'#059669', background:'#ecfdf5', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                          <Truck size={10}/>입고
                        </button>
                      )}
                      <button onClick={() => openEdit(p)}
                        style={{ fontSize:11, fontWeight:800, color:'#7e22ce', background:'#fdf4ff', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                        <Edit2 size={10}/>수정
                      </button>
                      <button onClick={() => setDeleteTarget(p)}
                        style={{ fontSize:11, fontWeight:800, color:'#dc2626', background:'#fff1f2', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                        <Trash2 size={10}/>삭제
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
  )

  /* ── 입고관리 테이블 (입고 완료/부분 기준) ── */
  const ReceiveTable = ({ list }: { list: Purchase[] }) => {
    const rcList = list.filter(p => p.status !== 'ordered' && p.status !== 'cancelled')
    return rcList.length === 0
      ? <div style={{ textAlign:'center', padding:'32px 0', color:'#94a3b8' }}>
          <PackagePlus size={28} style={{ opacity:0.2, margin:'0 auto 8px' }} />
          <p style={{ fontSize:13, fontWeight:700 }}>입고 내역이 없습니다</p>
        </div>
      : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {['발주일','입고일','구매처','품목수','발주','입고','상태','관리'].map(h => (
                <th key={h} style={{ padding:'7px 10px', fontWeight:800, color:'#64748b', fontSize:11, textAlign:h==='구매처'||h==='발주일'||h==='입고일'?'left':'center', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rcList.map(p => {
              const tOrd = p.items.reduce((s,i) => s+i.ordered, 0)
              const tRcv = p.items.reduce((s,i) => s+i.received, 0)
              const st   = ST[p.status]
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                  <td style={{ padding:'8px 10px', color:'#64748b' }}>{p.order_date}</td>
                  <td style={{ padding:'8px 10px', fontWeight:700, color:'#334155' }}>{p.received_at ? p.received_at.slice(0,10) : '-'}</td>
                  <td style={{ padding:'8px 10px', color:'#475569' }}>{p.supplier||'-'}</td>
                  <td style={{ textAlign:'center', color:'#64748b' }}>{p.items.length}건</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                  <td style={{ textAlign:'center', fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                  <td style={{ textAlign:'center' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:99 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                      <button onClick={() => openEdit(p)}
                        style={{ fontSize:11, fontWeight:800, color:'#7e22ce', background:'#fdf4ff', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                        <Edit2 size={10}/>수정
                      </button>
                      <button onClick={() => setDeleteTarget(p)}
                        style={{ fontSize:11, fontWeight:800, color:'#dc2626', background:'#fff1f2', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                        <Trash2 size={10}/>삭제
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
  }

  /* ══════════ JSX ══════════ */
  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', gap:0, height:'100%' }}>

      {/* 하위 탭 */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid #f1f5f9', flexShrink:0 }}>
        {([['purchase','📦 발주관리'],['receive','✅ 입고관리']] as [SubTab,string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            style={{
              padding:'10px 22px', fontSize:13, fontWeight:800, border:'none', cursor:'pointer',
              background:'transparent',
              color: subTab === key ? '#2563eb' : '#94a3b8',
              borderBottom: subTab === key ? '2.5px solid #2563eb' : '2.5px solid transparent',
              marginBottom: -2,
            }}>{label}</button>
        ))}
      </div>

      {/* ── 발주관리 탭 ── */}
      {subTab === 'purchase' && (
        <div style={{ flex:1, overflow:'auto', padding:'16px' }}>
          {/* 헤더: 날짜 네비 + 등록 버튼 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <DateNav
              mode={poMode} setMode={setPoMode}
              month={poMonth} setMonth={setPoMonth}
              day={poDay} setDay={setPoDay} />
            <button onClick={() => setIsAddPo(true)}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:800, color:'white', background:'#2563eb', border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>
              <Plus size={13}/>발주 등록
            </button>
          </div>

          {/* KPI */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {[
              { label: poMode==='month'?'이번달 발주':'오늘 발주', value: poTotal,           color:'#2563eb', bg:'#eff6ff' },
              { label: '발주 수량',                                 value: poOrderedQty,       color:'#1e293b', bg:'#f8fafc' },
              { label: '미입고 수량 (누적)',                        value: poUnresolvedQty,    color: poUnresolvedQty>0?'#d97706':'#94a3b8', bg: poUnresolvedQty>0?'#fffbeb':'#f8fafc' },
              { label: '미입고 건수 (누적)',                        value: purchases.filter(isUnresolved).length, color: purchases.filter(isUnresolved).length>0?'#d97706':'#94a3b8', bg:'#f8fafc' },
            ].map(c => (
              <div key={c.label} className="pm-card" style={{ padding:'10px 14px', background:c.bg }}>
                <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:4 }}>{c.label}</p>
                <p style={{ fontSize:22, fontWeight:900, color:c.color, lineHeight:1 }}>{c.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* 발주 테이블 */}
          <div className="pm-card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>
                {poMode==='month' ? fmtMonthLabel(poMonth) : fmtDayLabel(poDay)} 발주 내역
              </span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>
                총 {poAll.length}건
                {poUnresolved.length > 0 && <span style={{ marginLeft:8, color:'#d97706', fontWeight:700 }}>⚠ 이전 미입고 {poUnresolved.length}건 포함</span>}
              </span>
            </div>
            <div style={{ padding:'0 0 8px' }}>
              <PurchaseTable list={poAll} showReceiveBtn />
            </div>
          </div>
        </div>
      )}

      {/* ── 입고관리 탭 ── */}
      {subTab === 'receive' && (
        <div style={{ flex:1, overflow:'auto', padding:'16px' }}>
          {/* 헤더: 날짜 네비 + 등록 버튼 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <DateNav
              mode={rcMode} setMode={setRcMode}
              month={rcMonth} setMonth={setRcMonth}
              day={rcDay} setDay={setRcDay} />
            <button onClick={() => setIsAddRc(true)}
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:800, color:'white', background:'#059669', border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>
              <Plus size={13}/>입고 등록
            </button>
          </div>

          {/* KPI */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
            {[
              { label: rcMode==='month'?'이번달 입고':'오늘 입고', value: rcTotal,       color:'#059669', bg:'#f0fdf4' },
              { label: '입고 수량',                                 value: rcReceivedQty, color:'#1e293b', bg:'#f8fafc' },
              { label: '전체 미입고 건수',                         value: purchases.filter(isUnresolved).length, color: purchases.filter(isUnresolved).length>0?'#d97706':'#94a3b8', bg: purchases.filter(isUnresolved).length>0?'#fffbeb':'#f8fafc' },
            ].map(c => (
              <div key={c.label} className="pm-card" style={{ padding:'10px 14px', background:c.bg }}>
                <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:4 }}>{c.label}</p>
                <p style={{ fontSize:22, fontWeight:900, color:c.color, lineHeight:1 }}>{c.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* 입고 테이블 */}
          <div className="pm-card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>
                {rcMode==='month' ? fmtMonthLabel(rcMonth) : fmtDayLabel(rcDay)} 입고 내역
              </span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>총 {rcFiltered.filter(p=>p.status!=='ordered'&&p.status!=='cancelled').length}건</span>
            </div>
            <div style={{ padding:'0 0 8px' }}>
              <ReceiveTable list={rcFiltered} />
            </div>
          </div>
        </div>
      )}

      {/* ── 발주 등록 모달 ── */}
      <Modal isOpen={isAddPo} onClose={() => setIsAddPo(false)} title="발주 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>발주일 *</label>
            <Input type="date" value={poForm.order_date} onChange={e => setPoForm(f => ({ ...f, order_date: e.target.value }))}/>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>구매처</label>
            <Input placeholder="동대문 A상회" value={poForm.supplier} onChange={e => setPoForm(f => ({ ...f, supplier: e.target.value }))}/>
          </div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>📦 발주 상품</p>
            {poForm.items.map((item, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <Input placeholder="상품코드" value={item.product_code} onChange={e => { const it=[...poForm.items]; it[i]={...it[i],product_code:e.target.value}; setPoForm(f=>({...f,items:it})) }}/>
                <Input placeholder="옵션명" value={item.option_name} onChange={e => { const it=[...poForm.items]; it[i]={...it[i],option_name:e.target.value}; setPoForm(f=>({...f,items:it})) }}/>
                <Input placeholder="바코드" value={item.barcode} onChange={e => { const it=[...poForm.items]; it[i]={...it[i],barcode:e.target.value}; setPoForm(f=>({...f,items:it})) }}/>
                <Input type="number" placeholder="수량" value={item.ordered} onChange={e => { const it=[...poForm.items]; it[i]={...it[i],ordered:e.target.value}; setPoForm(f=>({...f,items:it})) }}/>
                {poForm.items.length > 1 && (
                  <button onClick={() => setPoForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                    style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setPoForm(f=>({...f,items:[...f.items,{product_code:'',option_name:'',barcode:'',ordered:''}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsAddPo(false)}>취소</Button>
          <Button onClick={handleAddPo} disabled={saving}>발주 등록</Button>
        </div>
      </Modal>

      {/* ── 입고 등록 모달 ── */}
      <Modal isOpen={isAddRc} onClose={() => setIsAddRc(false)} title="입고 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>입고일 *</label>
            <Input type="date" value={rcForm.order_date} onChange={e => setRcForm(f => ({ ...f, order_date: e.target.value }))}/>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>구매처</label>
            <Input placeholder="구매처" value={rcForm.supplier} onChange={e => setRcForm(f => ({ ...f, supplier: e.target.value }))}/>
          </div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#059669', paddingBottom:6, borderBottom:'1px solid #f0fdf4', marginBottom:10 }}>✅ 입고 상품</p>
            {rcForm.items.map((item, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <Input placeholder="상품코드" value={item.product_code} onChange={e => { const it=[...rcForm.items]; it[i]={...it[i],product_code:e.target.value}; setRcForm(f=>({...f,items:it})) }}/>
                <Input placeholder="옵션명" value={item.option_name} onChange={e => { const it=[...rcForm.items]; it[i]={...it[i],option_name:e.target.value}; setRcForm(f=>({...f,items:it})) }}/>
                <Input placeholder="바코드" value={item.barcode} onChange={e => { const it=[...rcForm.items]; it[i]={...it[i],barcode:e.target.value}; setRcForm(f=>({...f,items:it})) }}/>
                <Input type="number" placeholder="입고수량" value={item.qty} onChange={e => { const it=[...rcForm.items]; it[i]={...it[i],qty:e.target.value}; setRcForm(f=>({...f,items:it})) }}/>
                {rcForm.items.length > 1 && (
                  <button onClick={() => setRcForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                    style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setRcForm(f=>({...f,items:[...f.items,{product_code:'',option_name:'',barcode:'',qty:''}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#059669',background:'#f0fdf4',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsAddRc(false)}>취소</Button>
          <Button onClick={handleAddRc} disabled={saving} style={{ background:'#059669',borderColor:'#059669' }}>입고 등록</Button>
        </div>
      </Modal>

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={() => setReceiveTarget(null)} onSave={handleReceive} />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={() => { setEditTarget(null); setEditFormData(null) }} title={`발주 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>발주일</label>
              <Input type="date" value={editFormData.order_date} onChange={e => setEditFormData(f => f ? { ...f, order_date: e.target.value } : f)}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>구매처</label>
              <Input value={editFormData.supplier} onChange={e => setEditFormData(f => f ? { ...f, supplier: e.target.value } : f)}/>
            </div>
          </div>
          {editFormData.items.map((item, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap:8, marginBottom:8, alignItems:'end' }}>
              {i === 0 && <><label style={{ fontSize:10.5, fontWeight:700, color:'#64748b', gridRow:'1' }}>상품코드</label><label style={{ fontSize:10.5, fontWeight:700, color:'#64748b' }}>옵션명</label><label style={{ fontSize:10.5, fontWeight:700, color:'#64748b' }}>바코드</label><label style={{ fontSize:10.5, fontWeight:700, color:'#64748b' }}>발주수량</label><label style={{ fontSize:10.5, fontWeight:700, color:'#64748b' }}>입고수량</label><span/></>}
              <Input value={item.product_code} onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],product_code:e.target.value}; return {...f,items:it} })}/>
              <Input value={item.option_name}  onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],option_name:e.target.value}; return {...f,items:it} })}/>
              <Input value={item.barcode}       onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],barcode:e.target.value}; return {...f,items:it} })}/>
              <Input type="number" value={item.ordered}  onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],ordered:Number(e.target.value)||0}; return {...f,items:it} })}/>
              <Input type="number" value={item.received} onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],received:Number(e.target.value)||0}; return {...f,items:it} })}/>
              <button onClick={() => setEditFormData(f => f ? { ...f, items: f.items.filter((_,j)=>j!==i) } : f)}
                style={{ width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:7,cursor:'pointer' }}>
                <X size={12}/>
              </button>
            </div>
          ))}
          <button onClick={() => setEditFormData(f => f ? { ...f, items:[...f.items,{product_code:'',option_name:'',barcode:'',ordered:0,received:0}] } : f)}
            style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4,marginBottom:16 }}>
            <Plus size={12}/>상품 추가
          </button>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditFormData(null) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장 및 상품 반영</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="발주 삭제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <Trash2 size={36} style={{ color:'#dc2626', margin:'0 auto 12px' }} />
            <p style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:8 }}>{deleteTarget.order_date} 발주를 삭제하시겠습니까?</p>
            <p style={{ fontSize:12, color:'#64748b' }}>삭제 시 발주/입고 수량이 상품관리에서 차감됩니다.</p>
          </div>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={saving}
              style={{ background:'#dc2626',borderColor:'#dc2626',opacity:saving?0.6:1 }}>
              <Trash2 size={13}/>{saving ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── 입고 처리 모달 ── */
function ReceiveModal({
  purchase, onClose, onSave,
}: { purchase: Purchase; onClose: () => void; onSave: (items: Record<number, number>) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(
    () => Object.fromEntries(purchase.items.map((item, i) => [i, String(item.ordered - item.received)]))
  )
  return (
    <Modal isOpen onClose={onClose} title={`입고 처리 — ${purchase.order_date}`} size="md">
      <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:14 }}>실제 입고된 수량을 입력하세요.</p>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {purchase.items.map((item, i) => {
          const remain = item.ordered - item.received
          return (
            <div key={i} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:800, color:'#1e293b', fontFamily:'monospace' }}>{item.product_code}</p>
                  {item.option_name && <p style={{ fontSize:11.5, color:'#94a3b8', marginTop:2 }}>{item.option_name}</p>}
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:11, color:'#94a3b8' }}>발주 {item.ordered} / 기입고 {item.received}</p>
                  <p style={{ fontSize:11.5, fontWeight:800, color:'#f59e0b' }}>미입고 {remain}</p>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#64748b', whiteSpace:'nowrap' }}>입고 수량</label>
                <Input type="number" value={qty[i]} min={0} max={remain}
                  onChange={e => setQty(prev => ({ ...prev, [i]: e.target.value }))}
                  style={{ fontWeight:800, fontSize:14 }}/>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(qty).map(([k,v])=>[Number(k),Number(v)||0])))}>
          <CheckCircle2 size={13}/>입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
