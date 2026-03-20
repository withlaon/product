'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
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
import { Edit2, Trash2, X, Plus, PackagePlus, CheckCircle2, Upload } from 'lucide-react'

export default function ReceiveManagePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)

  const [mode,  setMode]  = useState<DateMode>('month')
  const [month, setMonth] = useState(getThisMonth())
  const [day,   setDay]   = useState(getToday())

  const [editTarget,   setEditTarget]   = useState<Purchase | null>(null)
  const [editFormData, setEditFormData] = useState<Purchase | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null)

  /* 입고 등록 모달 */
  const [isAdd, setIsAdd] = useState(false)
  const [form, setForm]   = useState({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', qty:'' }] })
  const fileInputRef      = useRef<HTMLInputElement>(null)

  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending:false })
    if (data) setPurchases(data as Purchase[])
  }, [])
  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('pm_products').select('id,code,name,options')
    if (data) setProducts(data as PmProduct[])
  }, [])
  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  const key    = mode === 'month' ? month : day
  const rcList = useMemo(() =>
    purchases
      .filter(p => p.status !== 'ordered' && p.status !== 'cancelled')
      .filter(p => {
        const ref = (p.received_at ?? p.order_date).slice(0, key.length)
        return ref === key
      })
      .sort((a,b) => {
        const aD = (a.received_at??a.order_date).slice(0,10)
        const bD = (b.received_at??b.order_date).slice(0,10)
        return bD.localeCompare(aD)
      })
  , [purchases, key])

  const kpiCount    = rcList.length
  const kpiQty      = useMemo(() => rcList.reduce((s,p)=>s+p.items.reduce((ss,i)=>ss+i.received,0),0), [rcList])
  const kpiUnresolved = purchases.filter(isUnresolved).length

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

  /* ── 입고 파일 업로드 파싱 ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'binary' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (!rows.length) return

        // 헤더 자동 감지 — 컬럼명 후보 매핑
        const COL = {
          product_code: ['상품코드','product_code','상품 코드','코드'],
          option_name:  ['옵션명','option_name','옵션','옵션 명','옵션이름'],
          barcode:      ['바코드','barcode','바 코드','BARCODE'],
          qty:          ['입고수량','수량','입고 수량','qty','QTY','Qty','입고량'],
          order_date:   ['입고일','입고일자','날짜','date','입고 일자'],
          supplier:     ['구매처','공급처','supplier','거래처'],
        }
        const headers = Object.keys(rows[0])
        const findCol = (keys: string[]) => headers.find(h => keys.map(k=>k.toLowerCase()).includes(h.toLowerCase())) ?? ''

        const cCode = findCol(COL.product_code)
        const cOpt  = findCol(COL.option_name)
        const cBar  = findCol(COL.barcode)
        const cQty  = findCol(COL.qty)
        const cDate = findCol(COL.order_date)
        const cSup  = findCol(COL.supplier)

        const items = rows
          .map(row => ({
            product_code: String(row[cCode] ?? '').trim(),
            option_name:  String(row[cOpt]  ?? '').trim(),
            barcode:      String(row[cBar]  ?? '').trim(),
            qty:          String(row[cQty]  ?? '').trim(),
          }))
          .filter(i => i.product_code || i.barcode)

        if (!items.length) {
          alert('파싱 가능한 행이 없습니다. 상품코드 또는 바코드 컬럼이 있는지 확인하세요.')
          return
        }

        const dateVal    = cDate ? String(rows[0][cDate] ?? '').slice(0,10) : ''
        const supplierVal = cSup ? String(rows[0][cSup] ?? '').trim() : ''

        setForm(f => ({
          order_date: dateVal || f.order_date,
          supplier:   supplierVal || f.supplier,
          items,
        }))
      } catch (err) {
        console.error(err)
        alert('파일 파싱 오류가 발생했습니다.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  /* ── 입고 직접 등록 ── */
  const handleAdd = async () => {
    if (!form.order_date) return
    const items: PurchaseItem[] = form.items.filter(i=>i.product_code).map(i=>({
      product_code:i.product_code, option_name:i.option_name, barcode:i.barcode,
      ordered:Number(i.qty)||0, received:Number(i.qty)||0,
    }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = { id:String(Date.now()), order_date:form.order_date, supplier:form.supplier||'직접입고', status:'completed', ordered_at:new Date().toISOString(), received_at:new Date().toISOString(), items }
    await supabase.from('pm_purchases').insert(p)
    await syncProductQty(products, items.map(i=>{
      const prod = products.find(pr=>pr.code===i.product_code)
      return { prodId:prod?.id??'', optName:i.option_name, orderedDelta:i.ordered, receivedDelta:i.received }
    }).filter(d=>d.prodId))
    await loadPurchases(); await loadProducts()
    setIsAdd(false)
    setForm({ order_date:'', supplier:'', items:[{ product_code:'', option_name:'', barcode:'', qty:'' }] })
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
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:800, color:'white', background:'#059669', border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>
          <Plus size={13}/>입고 등록
        </button>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, flexShrink:0 }}>
        {[
          { label:`${mode==='month'?'이번달':'오늘'} 입고`, value:kpiCount,     color:'#059669', bg:'#f0fdf4' },
          { label:'입고 수량',                              value:kpiQty,       color:'#1e293b', bg:'#f8fafc' },
          { label:'전체 미입고 건수',                       value:kpiUnresolved, color:kpiUnresolved>0?'#d97706':'#94a3b8', bg:kpiUnresolved>0?'#fffbeb':'#f8fafc' },
        ].map(c=>(
          <div key={c.label} className="pm-card" style={{ padding:'10px 14px', background:c.bg }}>
            <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:3 }}>{c.label}</p>
            <p style={{ fontSize:22, fontWeight:900, color:c.color, lineHeight:1 }}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* 입고 목록 */}
      <div className="pm-card" style={{ flex:1, overflow:'auto', padding:0 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>
            {mode==='month' ? fmtMonthLabel(month) : fmtDayLabel(day)} 입고 내역
          </span>
          <span style={{ fontSize:11, color:'#94a3b8' }}>{kpiCount}건</span>
        </div>

        {rcList.length === 0
          ? <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
              <PackagePlus size={32} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
              <p style={{ fontSize:13, fontWeight:700 }}>입고 내역이 없습니다</p>
              <p style={{ fontSize:11, color:'#cbd5e1', marginTop:4 }}>입고 등록 버튼을 눌러 새 입고를 추가하세요</p>
            </div>
          : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['발주일','입고일','구매처','품목수','발주','입고','상태','관리'].map(h=>(
                    <th key={h} style={{ padding:'7px 10px', fontWeight:800, color:'#64748b', fontSize:11, textAlign:h==='구매처'||h==='발주일'||h==='입고일'?'left':'center', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rcList.map(p=>{
                  const tOrd = p.items.reduce((s,i)=>s+i.ordered,0)
                  const tRcv = p.items.reduce((s,i)=>s+i.received,0)
                  const st   = ST[p.status]
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                      <td style={{ padding:'8px 10px', color:'#94a3b8', fontSize:11.5 }}>{p.order_date}</td>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:'#334155' }}>{p.received_at?p.received_at.slice(0,10):'-'}</td>
                      <td style={{ padding:'8px 10px', color:'#475569' }}>{p.supplier||'-'}</td>
                      <td style={{ textAlign:'center', color:'#64748b' }}>{p.items.length}건</td>
                      <td style={{ textAlign:'center', fontWeight:800, color:'#1e293b' }}>{tOrd.toLocaleString()}</td>
                      <td style={{ textAlign:'center', fontWeight:800, color:'#0ea5e9' }}>{tRcv.toLocaleString()}</td>
                      <td style={{ textAlign:'center' }}>
                        <span style={{ display:'inline-flex', fontSize:10.5, fontWeight:800, background:st.bg, color:st.color, padding:'3px 8px', borderRadius:99 }}>{st.label}</span>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                          <button onClick={()=>{setEditTarget(p);setEditFormData(JSON.parse(JSON.stringify(p)))}}
                            style={{ fontSize:11,fontWeight:800,color:'#7e22ce',background:'#fdf4ff',border:'none',borderRadius:6,padding:'3px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:2 }}>
                            <Edit2 size={10}/>수정
                          </button>
                          <button onClick={()=>setDeleteTarget(p)}
                            style={{ fontSize:11,fontWeight:800,color:'#dc2626',background:'#fff1f2',border:'none',borderRadius:6,padding:'3px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:2 }}>
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

      {/* ── 입고 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={()=>setIsAdd(false)} title="입고 등록" size="xl">
        {/* 파일 업로드 영역 */}
        <div style={{ marginBottom:14, padding:'10px 14px', background:'#f8fafc', borderRadius:8, border:'1px dashed #cbd5e1', display:'flex', alignItems:'center', gap:10 }}>
          <Upload size={15} style={{ color:'#64748b', flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#334155', marginBottom:2 }}>입고 파일 업로드 (선택)</p>
            <p style={{ fontSize:10.5, color:'#94a3b8' }}>상품코드·바코드·옵션명·입고수량 컬럼이 포함된 엑셀 파일을 업로드하면 자동으로 채워집니다</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={handleFileUpload} />
          <button onClick={()=>fileInputRef.current?.click()}
            style={{ fontSize:12, fontWeight:800, color:'#0ea5e9', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:7, padding:'6px 14px', cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
            <Upload size={12}/>파일 선택
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><L>입고일 *</L><Input type="date" value={form.order_date} onChange={e=>setForm(f=>({...f,order_date:e.target.value}))}/></div>
          <div><L>구매처</L><Input placeholder="구매처" value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))}/></div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12,fontWeight:800,color:'#059669',paddingBottom:6,borderBottom:'1px solid #f0fdf4',marginBottom:10 }}>✅ 입고 상품</p>
            {form.items.map((item,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <Input placeholder="상품코드" value={item.product_code} onChange={e=>{const it=[...form.items];it[i]={...it[i],product_code:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input placeholder="옵션명" value={item.option_name} onChange={e=>{const it=[...form.items];it[i]={...it[i],option_name:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input placeholder="바코드" value={item.barcode} onChange={e=>{const it=[...form.items];it[i]={...it[i],barcode:e.target.value};setForm(f=>({...f,items:it}))}}/>
                <Input type="number" placeholder="입고수량" value={item.qty} onChange={e=>{const it=[...form.items];it[i]={...it[i],qty:e.target.value};setForm(f=>({...f,items:it}))}}/>
                {form.items.length>1 && (
                  <button onClick={()=>setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                    style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={()=>setForm(f=>({...f,items:[...f.items,{product_code:'',option_name:'',barcode:'',qty:''}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#059669',background:'#f0fdf4',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:20 }}>
          <Button variant="outline" onClick={()=>setIsAdd(false)}>취소</Button>
          <Button onClick={handleAdd} disabled={saving} style={{ background:'#059669',borderColor:'#059669' }}>
            <CheckCircle2 size={13}/>입고 등록
          </Button>
        </div>
      </Modal>

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={()=>{setEditTarget(null);setEditFormData(null)}} title={`입고 수정 — ${editTarget.order_date}`} size="xl">
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
            style={{ fontSize:12,fontWeight:800,color:'#059669',background:'#f0fdf4',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4,marginBottom:16 }}>
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
        <Modal isOpen onClose={()=>setDeleteTarget(null)} title="입고 삭제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <Trash2 size={36} style={{ color:'#dc2626', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:14,fontWeight:800,color:'#1e293b',marginBottom:8 }}>{deleteTarget.order_date} 입고를 삭제하시겠습니까?</p>
            <p style={{ fontSize:12,color:'#64748b' }}>삭제 시 입고 수량이 상품관리에서 차감됩니다.</p>
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
