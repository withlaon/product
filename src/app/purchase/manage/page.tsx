'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  Purchase, PurchaseItem, PmProduct, PurchaseStatus, DateMode,
  ST, isUnresolved,
  getToday, getThisMonth,
  fmtMonthLabel, fmtDayLabel,
  syncProductQty, DateNav,
} from '../_shared'
import { Truck, Edit2, Trash2, X, Plus, CheckCircle2, PackagePlus } from 'lucide-react'

export default function PurchaseManagePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)

  const [mode,  setMode]  = useState<DateMode>('month')
  const [month, setMonth] = useState(getThisMonth())
  const [day,   setDay]   = useState(getToday())

  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [editTarget,    setEditTarget]    = useState<Purchase | null>(null)
  const [editFormData,  setEditFormData]  = useState<Purchase | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Purchase | null>(null)

  /* 발주 등록 모달 */
  const [isAdd, setIsAdd] = useState(false)
  const [form, setForm]   = useState({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', ordered:'' }] })

  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending:false })
    if (data) setPurchases(data as Purchase[])
  }, [])
  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('pm_products').select('id,code,name,options')
    if (data) setProducts(data as PmProduct[])
  }, [])
  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  const key     = mode === 'month' ? month : day
  const filtered = useMemo(() => purchases.filter(p => p.order_date.startsWith(key))
    .sort((a,b) => b.order_date.localeCompare(a.order_date))
  , [purchases, key])
  const unresolvedOld = useMemo(() => purchases.filter(p => isUnresolved(p) && !p.order_date.startsWith(key)), [purchases, key])
  const allList = useMemo(() => {
    const ids = new Set(filtered.map(p=>p.id))
    return [...filtered, ...unresolvedOld.filter(p=>!ids.has(p.id))]
  }, [filtered, unresolvedOld])

  const kpiOrdered    = filtered.length
  const kpiOrderedQty = useMemo(() => filtered.reduce((s,p)=>s+p.items.reduce((ss,i)=>ss+i.ordered,0),0), [filtered])
  const kpiUnresolved = purchases.filter(isUnresolved).length
  const kpiUnresolvedQty = useMemo(() => purchases.filter(isUnresolved).reduce((s,p)=>s+p.items.reduce((ss,i)=>ss+Math.max(0,i.ordered-i.received),0),0), [purchases])

  /* ── 입고 처리 ── */
  const handleReceive = async (receivedItems: Record<number, number>) => {
    if (!receiveTarget) return
    setSaving(true)
    const items = receiveTarget.items.map((item,i) => ({
      ...item, received: Math.min(item.ordered, item.received + (receivedItems[i]||0)),
    }))
    const allDone = items.every(i => i.received >= i.ordered)
    const anyDone = items.some(i => i.received > 0)
    const updated = {
      ...receiveTarget, items,
      status: (allDone?'completed':anyDone?'partial':receiveTarget.status) as PurchaseStatus,
      received_at: allDone ? new Date().toISOString() : receiveTarget.received_at,
    }
    await supabase.from('pm_purchases').update({ items:updated.items, status:updated.status, received_at:updated.received_at }).eq('id', receiveTarget.id)
    const deltas = receiveTarget.items.map((item,i) => {
      const prod = products.find(p=>p.code===item.product_code)
      return { prodId:prod?.id??'', optName:item.option_name, orderedDelta:0, receivedDelta:receivedItems[i]||0 }
    }).filter(d=>d.prodId&&d.receivedDelta>0)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setReceiveTarget(null); setSaving(false)
  }

  /* ── 수정 ── */
  const handleEditSave = async () => {
    if (!editTarget||!editFormData) return
    setSaving(true)
    const deltas = editFormData.items.map((newItem,i) => {
      const oldItem = editTarget.items[i]||{product_code:'',option_name:'',barcode:'',ordered:0,received:0}
      const prod = products.find(p=>p.code===newItem.product_code||p.code===oldItem.product_code)
      return { prodId:prod?.id??'', optName:newItem.option_name, orderedDelta:newItem.ordered-oldItem.ordered, receivedDelta:newItem.received-oldItem.received }
    }).filter(d=>d.prodId&&(d.orderedDelta!==0||d.receivedDelta!==0))
    await supabase.from('pm_purchases').update({ order_date:editFormData.order_date, supplier:editFormData.supplier, status:editFormData.status, items:editFormData.items }).eq('id', editTarget.id)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setEditTarget(null); setEditFormData(null); setSaving(false)
  }

  /* ── 삭제 ── */
  const handleDelete = async (p: Purchase) => {
    setSaving(true)
    const deltas = p.items.map(item => {
      const prod = products.find(pr=>pr.code===item.product_code)
      return { prodId:prod?.id??'', optName:item.option_name, orderedDelta:-item.ordered, receivedDelta:-item.received }
    }).filter(d=>d.prodId)
    if (deltas.length) await syncProductQty(products, deltas)
    await supabase.from('pm_purchases').delete().eq('id', p.id)
    await loadPurchases(); await loadProducts()
    setDeleteTarget(null); setSaving(false)
  }

  /* ── 발주 등록 ── */
  const handleAdd = async () => {
    if (!form.order_date) return
    const items = form.items.filter(i=>i.product_code).map(i=>({
      product_code:i.product_code, option_name:i.option_name, barcode:i.barcode, ordered:Number(i.ordered)||0, received:0,
    }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = { id:String(Date.now()), order_date:form.order_date, supplier:form.supplier||'미지정', status:'ordered', ordered_at:new Date().toISOString(), received_at:null, items }
    await supabase.from('pm_purchases').insert(p)
    for (const item of items) {
      const prod = products.find(pr=>pr.code===item.product_code)
      if (!prod) continue
      const updatedOpts = prod.options.map(o => {
        const match = !item.option_name||o.name===item.option_name||o.barcode===item.barcode
        return match ? { ...o, ordered:(o.ordered||0)+item.ordered } : o
      })
      await supabase.from('pm_products').update({ options:updatedOpts }).eq('id', prod.id)
    }
    await loadPurchases(); await loadProducts()
    setIsAdd(false)
    setForm({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', ordered:'' }] })
    setSaving(false)
  }

  const L = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
  )

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:12 }}>

      {/* 날짜 네비 + 등록 버튼 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <DateNav mode={mode} setMode={setMode} month={month} setMonth={setMonth} day={day} setDay={setDay} />
        <button onClick={() => setIsAdd(true)}
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:800, color:'white', background:'#2563eb', border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>
          <Plus size={13}/>발주 등록
        </button>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, flexShrink:0 }}>
        {[
          { label: `${mode==='month'?'이번달':'오늘'} 발주`, value:kpiOrdered,      color:'#2563eb', bg:'#eff6ff' },
          { label: '발주 수량',                               value:kpiOrderedQty,   color:'#1e293b', bg:'#f8fafc' },
          { label: '미입고 건수(누적)',                       value:kpiUnresolved,   color:kpiUnresolved>0?'#d97706':'#94a3b8', bg:kpiUnresolved>0?'#fffbeb':'#f8fafc' },
          { label: '미입고 수량(누적)',                       value:kpiUnresolvedQty, color:kpiUnresolvedQty>0?'#d97706':'#94a3b8', bg:kpiUnresolvedQty>0?'#fffbeb':'#f8fafc' },
        ].map(c => (
          <div key={c.label} className="pm-card" style={{ padding:'10px 14px', background:c.bg }}>
            <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:3 }}>{c.label}</p>
            <p style={{ fontSize:22, fontWeight:900, color:c.color, lineHeight:1 }}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* 발주 목록 */}
      <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>
            {mode==='month' ? fmtMonthLabel(month) : fmtDayLabel(day)} 발주 내역
          </span>
          <span style={{ fontSize:11, color:'#94a3b8' }}>
            {allList.length}건
            {unresolvedOld.length>0 && <span style={{ marginLeft:8, color:'#d97706', fontWeight:700 }}>⚠ 이전 미입고 {unresolvedOld.length}건 포함</span>}
          </span>
        </div>

        {allList.length === 0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
              <PackagePlus size={32} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
              <p style={{ fontSize:13, fontWeight:700 }}>발주 내역이 없습니다</p>
              <p style={{ fontSize:11, color:'#cbd5e1', marginTop:4 }}>발주 등록 버튼을 눌러 새 발주를 추가하세요</p>
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
                {allList.map(p => {
                  const tOrd = p.items.reduce((s,i)=>s+i.ordered,0)
                  const tRcv = p.items.reduce((s,i)=>s+i.received,0)
                  const tMis = tOrd-tRcv
                  const st   = ST[p.status]
                  const old  = isUnresolved(p)&&!p.order_date.startsWith(key)
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc', background:old?'#fffbeb':undefined }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:'#334155' }}>
                        {p.order_date}
                        {old && <span style={{ marginLeft:5, fontSize:9.5, fontWeight:800, color:'#d97706', background:'#fef3c7', padding:'1px 5px', borderRadius:99 }}>이전↑</span>}
                      </td>
                      <td style={{ padding:'8px 10px', color:'#475569' }}>{p.supplier||'-'}</td>
                      <td style={{ textAlign:'center', color:'#64748b' }}>{p.items.length}건</td>
                      <td style={{ textAlign:'center', fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                      <td style={{ textAlign:'center', fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                      <td style={{ textAlign:'center', fontWeight:900, color:tMis>0?'#d97706':'#94a3b8' }}>{tMis.toLocaleString()}</td>
                      <td style={{ textAlign:'center' }}>
                        <span style={{ display:'inline-flex', fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:99 }}>{st.label}</span>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                          {p.status!=='completed'&&p.status!=='cancelled' && (
                            <button onClick={() => setReceiveTarget(p)}
                              style={{ fontSize:11, fontWeight:800, color:'#059669', background:'#ecfdf5', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:2 }}>
                              <Truck size={10}/>입고
                            </button>
                          )}
                          <button onClick={() => { setEditTarget(p); setEditFormData(JSON.parse(JSON.stringify(p))) }}
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
      </div>

      {/* ── 발주 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={() => setIsAdd(false)} title="발주 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><L>발주일 *</L><Input type="date" value={form.order_date} onChange={e=>setForm(f=>({...f,order_date:e.target.value}))}/></div>
          <div><L>구매처</L><Input placeholder="동대문 A상회" value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))}/></div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>📦 발주 상품</p>
            {form.items.map((item,i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <Input placeholder="상품코드" value={item.product_code} onChange={e=>{const it=[...form.items];it[i]={...it[i],product_code:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input placeholder="옵션명" value={item.option_name} onChange={e=>{const it=[...form.items];it[i]={...it[i],option_name:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input placeholder="바코드" value={item.barcode} onChange={e=>{const it=[...form.items];it[i]={...it[i],barcode:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input type="number" placeholder="수량" value={item.ordered} onChange={e=>{const it=[...form.items];it[i]={...it[i],ordered:e.target.value};setForm(f=>({...f,items:it}))}}/>
                {form.items.length>1 && (
                  <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                    style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={()=>setForm(f=>({...f,items:[...f.items,{product_code:'',option_name:'',barcode:'',ordered:''}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
          <Button variant="outline" onClick={()=>setIsAdd(false)}>취소</Button>
          <Button onClick={handleAdd} disabled={saving}>발주 등록</Button>
        </div>
      </Modal>

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={()=>setReceiveTarget(null)} onSave={handleReceive}/>
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={()=>{setEditTarget(null);setEditFormData(null)}} title={`발주 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div><L>발주일</L><Input type="date" value={editFormData.order_date} onChange={e=>setEditFormData(f=>f?{...f,order_date:e.target.value}:f)}/></div>
            <div><L>구매처</L><Input value={editFormData.supplier} onChange={e=>setEditFormData(f=>f?{...f,supplier:e.target.value}:f)}/></div>
          </div>
          {editFormData.items.map((item,i)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
              <Input value={item.product_code} onChange={e=>setEditFormData(f=>{if(!f)return f;const it=[...f.items];it[i]={...it[i],product_code:e.target.value};return{...f,items:it}})}/>
              <Input value={item.option_name}  onChange={e=>setEditFormData(f=>{if(!f)return f;const it=[...f.items];it[i]={...it[i],option_name:e.target.value};return{...f,items:it}})}/>
              <Input value={item.barcode}       onChange={e=>setEditFormData(f=>{if(!f)return f;const it=[...f.items];it[i]={...it[i],barcode:e.target.value};return{...f,items:it}})}/>
              <Input type="number" value={item.ordered}  onChange={e=>setEditFormData(f=>{if(!f)return f;const it=[...f.items];it[i]={...it[i],ordered:Number(e.target.value)||0};return{...f,items:it}})}/>
              <Input type="number" value={item.received} onChange={e=>setEditFormData(f=>{if(!f)return f;const it=[...f.items];it[i]={...it[i],received:Number(e.target.value)||0};return{...f,items:it}})}/>
              <button onClick={()=>setEditFormData(f=>f?{...f,items:f.items.filter((_,j)=>j!==i)}:f)}
                style={{ width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:7,cursor:'pointer' }}>
                <X size={12}/>
              </button>
            </div>
          ))}
          <button onClick={()=>setEditFormData(f=>f?{...f,items:[...f.items,{product_code:'',option_name:'',barcode:'',ordered:0,received:0}]}:f)}
            style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4,marginBottom:16 }}>
            <Plus size={12}/>상품 추가
          </button>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
            <Button variant="outline" onClick={()=>{setEditTarget(null);setEditFormData(null)}}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={()=>setDeleteTarget(null)} title="발주 삭제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <Trash2 size={36} style={{ color:'#dc2626', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:8 }}>{deleteTarget.order_date} 발주를 삭제하시겠습니까?</p>
            <p style={{ fontSize:12, color:'#64748b' }}>삭제 시 발주/입고 수량이 상품관리에서 차감됩니다.</p>
          </div>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
            <Button variant="outline" onClick={()=>setDeleteTarget(null)}>취소</Button>
            <Button onClick={()=>handleDelete(deleteTarget)} disabled={saving}
              style={{ background:'#dc2626',borderColor:'#dc2626',opacity:saving?0.6:1 }}>
              <Trash2 size={13}/>{saving?'삭제 중...':'삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── 입고 처리 모달 ── */
function ReceiveModal({ purchase, onClose, onSave }: { purchase:Purchase; onClose:()=>void; onSave:(items:Record<number,number>)=>void }) {
  const [qty, setQty] = useState<Record<number,string>>(
    ()=>Object.fromEntries(purchase.items.map((item,i)=>[i,String(item.ordered-item.received)]))
  )
  return (
    <Modal isOpen onClose={onClose} title={`입고 처리 — ${purchase.order_date}`} size="md">
      <p style={{ fontSize:12,fontWeight:700,color:'#64748b',marginBottom:14 }}>실제 입고된 수량을 입력하세요.</p>
      <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
        {purchase.items.map((item,i)=>{
          const remain=item.ordered-item.received
          return (
            <div key={i} style={{ background:'#f8fafc',borderRadius:12,padding:'12px 14px' }}>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:13,fontWeight:800,color:'#1e293b',fontFamily:'monospace' }}>{item.product_code}</p>
                  {item.option_name && <p style={{ fontSize:11.5,color:'#94a3b8',marginTop:2 }}>{item.option_name}</p>}
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:11,color:'#94a3b8' }}>발주 {item.ordered} / 기입고 {item.received}</p>
                  <p style={{ fontSize:11.5,fontWeight:800,color:'#f59e0b' }}>미입고 {remain}</p>
                </div>
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <label style={{ fontSize:12,fontWeight:700,color:'#64748b',whiteSpace:'nowrap' }}>입고 수량</label>
                <Input type="number" value={qty[i]} min={0} max={remain}
                  onChange={e=>setQty(prev=>({...prev,[i]:e.target.value}))}
                  style={{ fontWeight:800,fontSize:14 }}/>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={()=>onSave(Object.fromEntries(Object.entries(qty).map(([k,v])=>[Number(k),Number(v)||0])))}>
          <CheckCircle2 size={13}/>입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
