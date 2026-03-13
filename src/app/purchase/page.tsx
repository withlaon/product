'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { formatDateTime } from '@/lib/utils'
import {
  Plus, Search, PackagePlus, CheckCircle2, Clock, AlertCircle,
  Truck, X, Package, Upload, Download, Layers,
} from 'lucide-react'

type PurchaseStatus = 'ordered' | 'partial' | 'completed' | 'cancelled'

interface PurchaseItem {
  product_code: string
  option_name: string
  barcode: string
  ordered: number
  received: number
}
interface Purchase {
  id: string
  order_date: string
  supplier: string
  status: PurchaseStatus
  ordered_at: string
  received_at: string | null
  items: PurchaseItem[]
}

const ST: Record<PurchaseStatus, { label:string; bg:string; color:string; dot:string; icon: React.ReactNode }> = {
  ordered:   { label:'발주완료', bg:'#eff6ff', color:'#2563eb', dot:'#3b82f6', icon:<Clock size={11}/> },
  partial:   { label:'부분입고', bg:'#fffbeb', color:'#d97706', dot:'#f59e0b', icon:<Truck size={11}/> },
  completed: { label:'입고완료', bg:'#f0fdf4', color:'#15803d', dot:'#22c55e', icon:<CheckCircle2 size={11}/> },
  cancelled: { label:'취소',    bg:'#f8fafc', color:'#64748b', dot:'#94a3b8', icon:<AlertCircle size={11}/> },
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
}

const genBarcode = (code: string, opt: string) =>
  code && opt ? `${code.trim()} ${opt.trim().toUpperCase()}FFF` : ''

const INIT_ITEM    = { product_code:'', option_name:'', barcode:'', ordered:'' }
const INIT_FORM    = { order_date:'', supplier:'', items:[{ ...INIT_ITEM }] }
const INIT_IN_ITEM = { product_code:'', option_name:'', barcode:'', qty:'' }
const INIT_IN_FORM: { received_date:string; items:typeof INIT_IN_ITEM[] } = {
  received_date:'', items:[{ ...INIT_IN_ITEM }],
}

type BulkRow = { product_code:string; option_name:string; barcode:string; qty:string }
const INIT_BULK_ROW: BulkRow = { product_code:'', option_name:'', barcode:'', qty:'' }

/* ── 엑셀 양식 다운로드 헬퍼 ── */
function downloadExcelTemplate(type: 'in' | 'po') {
  const headers = type === 'in'
    ? [['상품코드','옵션명','입고수량'],['WA5AC001','BE','10']]
    : [['상품코드','옵션명','발주수량'],['WA5AC001','BE','10']]
  const ws = XLSX.utils.aoa_to_sheet(headers)
  ws['!cols'] = [{wch:18},{wch:14},{wch:12}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, type==='in' ? '일괄입고' : '일괄발주')
  XLSX.writeFile(wb, type==='in' ? '일괄입고_양식.xlsx' : '일괄발주_양식.xlsx')
}

/* ── 엑셀 파싱 헬퍼 ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseExcelToBulkRows(file: File, onDone:(rows:BulkRow[])=>void) {
  const reader = new FileReader()
  reader.onload = ev => {
    const data = ev.target?.result
    const wb = XLSX.read(data, { type:'binary' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any[] = XLSX.utils.sheet_to_json(ws)
    const rows: BulkRow[] = json.map(r => {
      const code = String(r['상품코드'] ?? r['product_code'] ?? '')
      const opt  = String(r['옵션명'] ?? r['option_name'] ?? '')
      const qty  = String(r['입고수량'] ?? r['발주수량'] ?? r['수량'] ?? r['qty'] ?? '')
      const bc   = code && opt ? `${code.trim()} ${opt.trim().toUpperCase()}FFF` : ''
      return { product_code:code, option_name:opt, barcode:bc, qty }
    }).filter(r => r.product_code)
    onDone(rows)
  }
  reader.readAsBinaryString(file)
}

export default function PurchasePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [search, setSearch]       = useState('')
  const [sf, setSf]               = useState('전체')
  const [isAdd, setIsAdd]         = useState(false)
  const [isInAdd, setIsInAdd]     = useState(false)
  const [isBulkIn, setIsBulkIn]   = useState(false)   // 일괄 입고 등록
  const [isBulkPo, setIsBulkPo]   = useState(false)   // 일괄 발주 등록
  const [detail, setDetail]       = useState<Purchase | null>(null)
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [form, setForm]           = useState(INIT_FORM)
  const [inForm, setInForm]       = useState(INIT_IN_FORM)
  // 일괄 입고 폼
  const [bulkInDate, setBulkInDate]         = useState('')
  const [bulkInSupplier, setBulkInSupplier] = useState('')
  const [bulkInRows, setBulkInRows]         = useState<BulkRow[]>([{ ...INIT_BULK_ROW }])
  // 일괄 발주 폼
  const [bulkPoDate, setBulkPoDate]         = useState('')
  const [bulkPoSupplier, setBulkPoSupplier] = useState('')
  const [bulkPoRows, setBulkPoRows]         = useState<BulkRow[]>([{ ...INIT_BULK_ROW }])

  const filtered = purchases.filter(p =>
    (sf === '전체' || p.status === sf) &&
    (!search || p.order_date.includes(search) || p.supplier.includes(search) ||
      p.items.some(i => i.product_code.includes(search)))
  )

  /* ── 일괄 입고 등록 ── */
  const handleBulkInSubmit = () => {
    if (!bulkInSupplier) return
    const today = bulkInDate || new Date().toISOString().slice(0,10)
    const items = bulkInRows.filter(r => r.product_code).map(r => ({
      product_code: r.product_code,
      option_name: r.option_name,
      barcode: r.barcode || genBarcode(r.product_code, r.option_name),
      ordered: Number(r.qty) || 0,
      received: Number(r.qty) || 0,
    }))
    if (!items.length) return
    const p: Purchase = {
      id: String(Date.now()),
      order_date: today,
      supplier: bulkInSupplier,
      status: 'completed',
      ordered_at: new Date().toISOString(),
      received_at: new Date(`${today}T00:00:00`).toISOString(),
      items,
    }
    setPurchases(prev => [...prev, p])
    setIsBulkIn(false)
    setBulkInDate(''); setBulkInSupplier(''); setBulkInRows([{ ...INIT_BULK_ROW }])
  }

  /* ── 일괄 발주 등록 ── */
  const handleBulkPoSubmit = () => {
    if (!bulkPoDate || !bulkPoSupplier) return
    const items = bulkPoRows.filter(r => r.product_code).map(r => ({
      product_code: r.product_code,
      option_name: r.option_name,
      barcode: r.barcode || genBarcode(r.product_code, r.option_name),
      ordered: Number(r.qty) || 0,
      received: 0,
    }))
    if (!items.length) return
    const p: Purchase = {
      id: String(Date.now()),
      order_date: bulkPoDate,
      supplier: bulkPoSupplier,
      status: 'ordered',
      ordered_at: new Date().toISOString(),
      received_at: null,
      items,
    }
    setPurchases(prev => [...prev, p])
    setIsBulkPo(false)
    setBulkPoDate(''); setBulkPoSupplier(''); setBulkPoRows([{ ...INIT_BULK_ROW }])
  }

  /* ── 개별 발주 등록 ── */
  const handleAdd = () => {
    if (!form.order_date || !form.supplier) return
    const p: Purchase = {
      id: String(Date.now()),
      order_date: form.order_date,
      supplier: form.supplier,
      status: 'ordered',
      ordered_at: new Date().toISOString(),
      received_at: null,
      items: form.items.filter(i => i.product_code).map(i => ({
        product_code: i.product_code,
        option_name: i.option_name,
        barcode: i.barcode || genBarcode(i.product_code, i.option_name),
        ordered: Number(i.ordered) || 0,
        received: 0,
      })),
    }
    setPurchases(prev => [...prev, p])
    setIsAdd(false)
    setForm(INIT_FORM)
  }

  // 입고 처리
  const handleReceive = (receivedItems: Record<number, number>) => {
    if (!receiveTarget) return
    setPurchases(prev => prev.map(p => {
      if (p.id !== receiveTarget.id) return p
      const items = p.items.map((item, i) => ({
        ...item,
        received: Math.min(item.ordered, item.received + (receivedItems[i] || 0)),
      }))
      const allDone = items.every(i => i.received >= i.ordered)
      const anyDone = items.some(i => i.received > 0)
      return {
        ...p, items,
        status: allDone ? 'completed' : anyDone ? 'partial' : p.status,
        received_at: allDone ? new Date().toISOString() : p.received_at,
      }
    }))
    setReceiveTarget(null)
  }

  // 직접 입고 등록 (발주 없이)
  const handleInAdd = () => {
    if (!inForm.items.some(i => i.product_code)) return
    const today = inForm.received_date || new Date().toISOString().slice(0,10)
    const items = inForm.items.filter(i => i.product_code).map(i => ({
      product_code: i.product_code,
      option_name:  i.option_name,
      barcode:      i.barcode || genBarcode(i.product_code, i.option_name),
      ordered:      Number(i.qty) || 0,
      received:     Number(i.qty) || 0,
    }))
    const p: Purchase = {
      id:          String(Date.now()),
      order_date:  today,
      supplier:    '직접입고',
      status:      'completed',
      ordered_at:  new Date().toISOString(),
      received_at: new Date(`${today}T00:00:00`).toISOString(),
      items,
    }
    setPurchases(prev => [...prev, p])
    setIsInAdd(false)
    setInForm(INIT_IN_FORM)
  }

  const kpis = [
    { label:'전체 발주',  value: purchases.length,                                         bg:'#eff6ff', color:'#2563eb' },
    { label:'발주완료',   value: purchases.filter(p=>p.status==='ordered').length,          bg:'#eef2ff', color:'#4338ca' },
    { label:'부분입고',   value: purchases.filter(p=>p.status==='partial').length,          bg:'#fffbeb', color:'#d97706' },
    { label:'입고완료',   value: purchases.filter(p=>p.status==='completed').length,        bg:'#f0fdf4', color:'#15803d' },
  ]

  return (
    <div className="pm-page space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(c => (
          <div key={c.label} className="pm-card p-4">
            <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
            <p style={{ fontSize:28, fontWeight:900, color: c.color, lineHeight:1, marginTop:6 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div className="pm-card p-4">
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <div className="relative" style={{ flex:'1 1 240px' }}>
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color:'#94a3b8' }} />
            <Input placeholder="발주번호, 구매처, 상품명..." value={search} onChange={e=>setSearch(e.target.value)} className="pm-input-icon" />
          </div>
          <Select value={sf} onChange={e=>setSf(e.target.value)} style={{ width:140 }}>
            <option value="전체">전체 상태</option>
            {Object.entries(ST).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <div style={{ display:'flex', gap:6, marginLeft:'auto', flexWrap:'wrap' }}>
            <Button size="sm" onClick={() => setIsInAdd(true)}
              style={{ background:'#059669', borderColor:'#059669' }}>
              <CheckCircle2 size={13}/>입고 등록
            </Button>
            <Button size="sm" onClick={() => setIsBulkIn(true)}
              style={{ background:'#0d9488', borderColor:'#0d9488' }}>
              <Layers size={13}/>일괄 입고 등록
            </Button>
            <Button size="sm" onClick={() => setIsAdd(true)}>
              <Plus size={13}/>발주 등록
            </Button>
            <Button size="sm" onClick={() => setIsBulkPo(true)}
              style={{ background:'#2563eb', borderColor:'#2563eb' }}>
              <Layers size={13}/>일괄 발주 등록
            </Button>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="pm-card overflow-hidden">
        <div className="pm-table-wrap">
          <table className="pm-table" style={{ minWidth:900 }}>
            <thead>
              <tr>
                <th>발주일</th>
                <th>구매처</th>
                <th style={{ textAlign:'center' }}>상품 수</th>
                <th style={{ textAlign:'right' }}>발주 수량</th>
                <th style={{ textAlign:'right' }}>입고 수량</th>
                <th style={{ textAlign:'right' }}>미입고</th>
                <th>등록일</th>
                <th style={{ textAlign:'center' }}>상태</th>
                <th style={{ textAlign:'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign:'center', padding:'3.5rem 1rem', color:'#94a3b8' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <PackagePlus size={36} style={{ opacity:0.22 }} />
                      <p style={{ fontSize:13.5, fontWeight:700 }}>등록된 발주가 없습니다</p>
                      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1' }}>[발주 등록] 버튼을 눌러 발주를 등록하세요</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(p => {
                const st = ST[p.status]
                const totalOrdered  = p.items.reduce((s, i) => s + i.ordered, 0)
                const totalReceived = p.items.reduce((s, i) => s + i.received, 0)
                const undelivered   = totalOrdered - totalReceived
                return (
                  <tr key={p.id}>
                    <td>
                      <button onClick={() => setDetail(p)}
                        style={{ fontFamily:'monospace', fontWeight:800, color:'#2563eb', fontSize:12.5, background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        {p.order_date}
                      </button>
                    </td>
                    <td style={{ fontSize:12.5, fontWeight:700, color:'#334155' }}>{p.supplier}</td>
                    <td style={{ textAlign:'center', fontSize:13, fontWeight:800, color:'#64748b' }}>{p.items.length}건</td>
                    <td style={{ textAlign:'right', fontSize:13, fontWeight:800, color:'#1e293b' }}>{totalOrdered.toLocaleString()}</td>
                    <td style={{ textAlign:'right', fontSize:13, fontWeight:800, color:'#0ea5e9' }}>{totalReceived.toLocaleString()}</td>
                    <td style={{ textAlign:'right', fontSize:13, fontWeight:900, color: undelivered > 0 ? '#f59e0b' : '#94a3b8' }}>
                      {undelivered.toLocaleString()}
                    </td>
                    <td style={{ fontSize:11.5, color:'#94a3b8' }}>{p.ordered_at ? new Date(p.ordered_at).toLocaleDateString('ko-KR') : '-'}</td>
                    <td style={{ textAlign:'center' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, background:st.bg, color:st.color, padding:'4px 10px', borderRadius:99 }}>
                        {st.icon}{st.label}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        {p.status !== 'completed' && p.status !== 'cancelled' && (
                          <button onClick={() => setReceiveTarget(p)}
                            style={{ fontSize:11.5, fontWeight:800, color:'#059669', background:'#ecfdf5', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer' }}>
                            <span style={{ display:'flex', alignItems:'center', gap:3 }}><Truck size={11}/>입고처리</span>
                          </button>
                        )}
                        <button onClick={() => setDetail(p)}
                          style={{ fontSize:11.5, fontWeight:800, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer' }}>
                          상세
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="pm-table-footer">
          <span>총 {filtered.length}건</span>
        </div>
      </div>

      {/* ── 발주 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={() => setIsAdd(false)} title="발주 등록" size="xl">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><Label>발주일 *</Label><Input type="date" value={form.order_date} onChange={e=>setForm(f=>({...f,order_date:e.target.value}))}/></div>
          <div><Label>구매처 *</Label><Input placeholder="동대문 A상회" value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))}/></div>

          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', paddingBottom:6, borderBottom:'1px solid #eff6ff', marginBottom:10 }}>📦 발주 상품</p>
            {form.items.map((item, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <div><Label>상품코드</Label><Input placeholder="WA5AC001" value={item.product_code}
                  onChange={e=>{const it=[...form.items];it[i]={...it[i],product_code:e.target.value,barcode:genBarcode(e.target.value,it[i].option_name)};setForm(f=>({...f,items:it}))}}/></div>
                <div><Label>옵션명</Label><Input placeholder="BE" value={item.option_name}
                  onChange={e=>{const it=[...form.items];it[i]={...it[i],option_name:e.target.value,barcode:genBarcode(it[i].product_code,e.target.value)};setForm(f=>({...f,items:it}))}}/></div>
                <div><Label>바코드 (자동)</Label><Input readOnly value={item.barcode}
                  style={{ background:'#f8fafc', color:'#334155', fontFamily:'monospace' }}/></div>
                <div><Label>발주 수량</Label><Input type="number" placeholder="0" value={item.ordered}
                  onChange={e=>{const it=[...form.items];it[i]={...it[i],ordered:e.target.value};setForm(f=>({...f,items:it}))}}/></div>
                <div style={{ paddingTop:21 }}>
                  {form.items.length > 1 && (
                    <button onClick={() => setForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                      style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                      <X size={13}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => setForm(f=>({...f,items:[...f.items,{...INIT_ITEM}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsAdd(false)}>취소</Button>
          <Button onClick={handleAdd}>발주 등록</Button>
        </div>
      </Modal>

      {/* ── 직접 입고 등록 모달 ── */}
      <Modal isOpen={isInAdd} onClose={() => setIsInAdd(false)} title="입고 등록" size="xl">
        <div style={{ background:'#eff6ff', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#2563eb' }}>
          💡 발주 없이 직접 입고된 상품을 등록합니다. 등록 후 <strong>입고완료</strong> 상태로 처리됩니다.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <Label>입고일</Label>
            <Input type="date" value={inForm.received_date}
              onChange={e => setInForm(f => ({...f, received_date:e.target.value}))}/>
          </div>

          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#059669', paddingBottom:6, borderBottom:'1px solid #ecfdf5', marginBottom:10 }}>📦 입고 상품</p>
            {inForm.items.map((item, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 0.8fr auto', gap:8, marginBottom:8 }}>
                <div><Label>상품코드</Label>
                  <Input placeholder="WA5AC001" value={item.product_code}
                    onChange={e=>{const it=[...inForm.items];it[i]={...it[i],product_code:e.target.value,barcode:genBarcode(e.target.value,it[i].option_name)};setInForm(f=>({...f,items:it}))}}/>
                </div>
                <div><Label>옵션명</Label>
                  <Input placeholder="BE" value={item.option_name}
                    onChange={e=>{const it=[...inForm.items];it[i]={...it[i],option_name:e.target.value,barcode:genBarcode(it[i].product_code,e.target.value)};setInForm(f=>({...f,items:it}))}}/>
                </div>
                <div><Label>바코드 (자동)</Label>
                  <Input readOnly value={item.barcode}
                    style={{ background:'#f8fafc', color:'#334155', fontFamily:'monospace' }}/>
                </div>
                <div><Label>입고 수량</Label>
                  <Input type="number" placeholder="0" value={item.qty}
                    onChange={e=>{const it=[...inForm.items];it[i]={...it[i],qty:e.target.value};setInForm(f=>({...f,items:it}))}}/>
                </div>
                <div style={{ paddingTop:21 }}>
                  {inForm.items.length > 1 && (
                    <button onClick={() => setInForm(f=>({...f,items:f.items.filter((_,j)=>j!==i)}))}
                      style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',background:'#fff1f2',color:'#dc2626',border:'none',borderRadius:8,cursor:'pointer' }}>
                      <X size={13}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => setInForm(f=>({...f,items:[...f.items,{...INIT_IN_ITEM}]}))}
              style={{ fontSize:12,fontWeight:800,color:'#059669',background:'#ecfdf5',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsInAdd(false)}>취소</Button>
          <Button onClick={handleInAdd} style={{ background:'#059669' }}>
            <CheckCircle2 size={13}/>입고 등록 완료
          </Button>
        </div>
      </Modal>

      {/* ── 일괄 입고 등록 모달 ── */}
      <Modal isOpen={isBulkIn} onClose={() => setIsBulkIn(false)} title="일괄 입고 등록" size="xl">
        <div style={{ background:'#f0fdf4', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#059669' }}>
          💡 여러 상품을 한번에 입고 등록합니다. 엑셀로 대량 업로드도 가능합니다.
        </div>

        {/* 헤더 정보 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div><Label>입고일 *</Label>
            <Input type="date" value={bulkInDate} onChange={e => setBulkInDate(e.target.value)}/>
          </div>
          <div><Label>구매처 *</Label>
            <Input placeholder="동대문 A상회" value={bulkInSupplier} onChange={e => setBulkInSupplier(e.target.value)}/>
          </div>
        </div>

        {/* 툴바 */}
        <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'#059669', flex:1 }}>📦 입고 상품 목록</p>
          <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Upload size={12}/>엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
              onChange={e => { const f=e.target.files?.[0]; if(f) parseExcelToBulkRows(f, rows => setBulkInRows(prev => [...prev.filter(r=>r.product_code), ...rows])); e.target.value='' }}/>
          </label>
          <button onClick={() => downloadExcelTemplate('in')}
            style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#64748b', background:'#f1f5f9', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Download size={12}/>양식 다운로드
          </button>
        </div>

        {/* 테이블 */}
        <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', marginBottom:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['#','상품코드','옵션명','바코드 (자동)','수량',''].map((h,i)=>(
                  <th key={i} style={{ padding:'8px 10px', fontSize:11, fontWeight:800, color:'#64748b', textAlign: i>=4?'center':'left', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bulkInRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: i<bulkInRows.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding:'6px 10px', fontSize:11, color:'#94a3b8', fontWeight:700, width:28 }}>{i+1}</td>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={row.product_code} placeholder="WA5AC001"
                      onChange={e => { const r=[...bulkInRows]; r[i]={...r[i],product_code:e.target.value,barcode:genBarcode(e.target.value,r[i].option_name)}; setBulkInRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'monospace', fontWeight:700, outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={row.option_name} placeholder="BE"
                      onChange={e => { const r=[...bulkInRows]; r[i]={...r[i],option_name:e.target.value,barcode:genBarcode(r[i].product_code,e.target.value)}; setBulkInRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input readOnly value={row.barcode}
                      style={{ width:'100%', border:'1px solid #f1f5f9', borderRadius:6, padding:'5px 8px', fontSize:11, fontFamily:'monospace', background:'#f8fafc', color:'#475569' }}/>
                  </td>
                  <td style={{ padding:'4px 6px', width:80 }}>
                    <input type="number" value={row.qty} placeholder="0"
                      onChange={e => { const r=[...bulkInRows]; r[i]={...r[i],qty:e.target.value}; setBulkInRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, textAlign:'right', outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px', textAlign:'center', width:32 }}>
                    {bulkInRows.length > 1 && (
                      <button onClick={() => setBulkInRows(prev => prev.filter((_,j)=>j!==i))}
                        style={{ width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:5, cursor:'pointer' }}>
                        <X size={11}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={() => setBulkInRows(prev => [...prev, { ...INIT_BULK_ROW }])}
            style={{ fontSize:12,fontWeight:800,color:'#059669',background:'#ecfdf5',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
            <Plus size={12}/>행 추가
          </button>
          <span style={{ fontSize:12, color:'#94a3b8' }}>총 {bulkInRows.filter(r=>r.product_code).length}건</span>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsBulkIn(false)}>취소</Button>
          <Button onClick={handleBulkInSubmit} style={{ background:'#059669' }}>
            <CheckCircle2 size={13}/>일괄 입고 등록
          </Button>
        </div>
      </Modal>

      {/* ── 일괄 발주 등록 모달 ── */}
      <Modal isOpen={isBulkPo} onClose={() => setIsBulkPo(false)} title="일괄 발주 등록" size="xl">
        <div style={{ background:'#eff6ff', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#2563eb' }}>
          💡 여러 상품을 한번에 발주 등록합니다. 엑셀로 대량 업로드도 가능합니다.
        </div>

        {/* 헤더 정보 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div><Label>발주일 *</Label>
            <Input type="date" value={bulkPoDate} onChange={e => setBulkPoDate(e.target.value)}/>
          </div>
          <div><Label>구매처 *</Label>
            <Input placeholder="동대문 A상회" value={bulkPoSupplier} onChange={e => setBulkPoSupplier(e.target.value)}/>
          </div>
        </div>

        {/* 툴바 */}
        <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
          <p style={{ fontSize:12, fontWeight:800, color:'#2563eb', flex:1 }}>📦 발주 상품 목록</p>
          <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Upload size={12}/>엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }}
              onChange={e => { const f=e.target.files?.[0]; if(f) parseExcelToBulkRows(f, rows => setBulkPoRows(prev => [...prev.filter(r=>r.product_code), ...rows])); e.target.value='' }}/>
          </label>
          <button onClick={() => downloadExcelTemplate('po')}
            style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#64748b', background:'#f1f5f9', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Download size={12}/>양식 다운로드
          </button>
        </div>

        {/* 테이블 */}
        <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', marginBottom:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['#','상품코드','옵션명','바코드 (자동)','발주수량',''].map((h,i)=>(
                  <th key={i} style={{ padding:'8px 10px', fontSize:11, fontWeight:800, color:'#64748b', textAlign: i>=4?'center':'left', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bulkPoRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: i<bulkPoRows.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding:'6px 10px', fontSize:11, color:'#94a3b8', fontWeight:700, width:28 }}>{i+1}</td>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={row.product_code} placeholder="WA5AC001"
                      onChange={e => { const r=[...bulkPoRows]; r[i]={...r[i],product_code:e.target.value,barcode:genBarcode(e.target.value,r[i].option_name)}; setBulkPoRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'monospace', fontWeight:700, outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={row.option_name} placeholder="BE"
                      onChange={e => { const r=[...bulkPoRows]; r[i]={...r[i],option_name:e.target.value,barcode:genBarcode(r[i].product_code,e.target.value)}; setBulkPoRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input readOnly value={row.barcode}
                      style={{ width:'100%', border:'1px solid #f1f5f9', borderRadius:6, padding:'5px 8px', fontSize:11, fontFamily:'monospace', background:'#f8fafc', color:'#475569' }}/>
                  </td>
                  <td style={{ padding:'4px 6px', width:80 }}>
                    <input type="number" value={row.qty} placeholder="0"
                      onChange={e => { const r=[...bulkPoRows]; r[i]={...r[i],qty:e.target.value}; setBulkPoRows(r) }}
                      style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 8px', fontSize:12, textAlign:'right', outline:'none' }}/>
                  </td>
                  <td style={{ padding:'4px 6px', textAlign:'center', width:32 }}>
                    {bulkPoRows.length > 1 && (
                      <button onClick={() => setBulkPoRows(prev => prev.filter((_,j)=>j!==i))}
                        style={{ width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:5, cursor:'pointer' }}>
                        <X size={11}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={() => setBulkPoRows(prev => [...prev, { ...INIT_BULK_ROW }])}
            style={{ fontSize:12,fontWeight:800,color:'#2563eb',background:'#eff6ff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:4 }}>
            <Plus size={12}/>행 추가
          </button>
          <span style={{ fontSize:12, color:'#94a3b8' }}>총 {bulkPoRows.filter(r=>r.product_code).length}건</span>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <Button variant="outline" onClick={() => setIsBulkPo(false)}>취소</Button>
          <Button onClick={handleBulkPoSubmit}>
            <Layers size={13}/>일괄 발주 등록
          </Button>
        </div>
      </Modal>

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={() => setReceiveTarget(null)} onSave={handleReceive} />
      )}

      {/* ── 발주 상세 모달 ── */}
      {detail && (
        <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={`발주 상세 — ${detail.order_date}`} size="lg">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[['발주일',detail.order_date],['구매처',detail.supplier],['등록일',detail.ordered_at ? new Date(detail.ordered_at).toLocaleDateString('ko-KR') : '-'],['입고일',detail.received_at ? new Date(detail.received_at).toLocaleDateString('ko-KR') : '-']].map(([k,v])=>(
              <div key={k} style={{ background:'#f8fafc', borderRadius:10, padding:'10px 14px' }}>
                <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', textTransform:'uppercase' }}>{k}</p>
                <p style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginTop:3 }}>{v}</p>
              </div>
            ))}
          </div>
          <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid rgba(15,23,42,0.07)' }}>
            <table className="pm-table">
              <thead><tr>{['상품코드','옵션','바코드','발주','입고','미입고'].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {detail.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:800, color:'#1e293b', fontFamily:'monospace' }}>{item.product_code}</td>
                    <td style={{ fontSize:12, color:'#64748b' }}>{item.option_name||'-'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:11.5, color:'#475569' }}>{item.barcode||'-'}</td>
                    <td style={{ textAlign:'right', fontWeight:800, color:'#1e293b' }}>{item.ordered}</td>
                    <td style={{ textAlign:'right', fontWeight:800, color:'#0ea5e9' }}>{item.received}</td>
                    <td style={{ textAlign:'right', fontWeight:900, color: item.ordered-item.received > 0 ? '#f59e0b' : '#94a3b8' }}>
                      {item.ordered - item.received}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <Button variant="outline" onClick={() => setDetail(null)}>닫기</Button>
            {detail.status !== 'completed' && detail.status !== 'cancelled' && (
              <Button onClick={() => { setReceiveTarget(detail); setDetail(null) }}>
                <Truck size={13}/>입고 처리
              </Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── 입고 처리 모달 컴포넌트 ── */
function ReceiveModal({
  purchase, onClose, onSave,
}: { purchase: Purchase; onClose: () => void; onSave: (items: Record<number, number>) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(
    () => Object.fromEntries(purchase.items.map((item, i) => [i, String(item.ordered - item.received)]))
  )
  return (
    <Modal isOpen onClose={onClose} title={`입고 처리 — ${purchase.order_date}`} size="md">
      <p style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:14 }}>
        실제 입고된 수량을 입력하세요.
      </p>
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
                  onChange={e => setQty(prev => ({...prev, [i]: e.target.value}))}
                  style={{ fontWeight:800, fontSize:14 }}/>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(qty).map(([k,v]) => [Number(k), Number(v)||0])))}>
          <CheckCircle2 size={13}/>입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
