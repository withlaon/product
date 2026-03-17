'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { supabase } from '@/lib/supabase'
import {
  ArrowDownCircle, ArrowUpCircle, Search, AlertTriangle,
  Plus, Package, RefreshCw, ShieldAlert, ClipboardList,
  Edit2, ChevronDown, ChevronRight, Download, Upload, X, CalendarDays,
} from 'lucide-react'

/* ─── 타입 ──────────────────────────────────────────────────── */
type TxType = 'in' | 'out' | 'defective' | 'adjust'
interface TxRecord {
  id: string; date: string; type: TxType
  product_code: string; product_name: string
  option_name: string; barcode: string
  qty: number; note: string
}
const TX_STYLE: Record<TxType, { label:string; bg:string; color:string; dot:string; icon:string }> = {
  in       : { label:'입고',     bg:'#f0fdf4', color:'#15803d', dot:'#22c55e', icon:'⬇️' },
  out      : { label:'출고',     bg:'#fff1f2', color:'#be123c', dot:'#ef4444', icon:'⬆️' },
  defective: { label:'불량',     bg:'#fff7ed', color:'#c2410c', dot:'#f97316', icon:'⚠️' },
  adjust   : { label:'재고수정', bg:'#eff6ff', color:'#1d4ed8', dot:'#3b82f6', icon:'✏️' },
}
const TX_KEY = 'pm_inv_tx_v1'

interface PmOption {
  name: string; chinese_name: string; barcode: string; image: string
  ordered: number; received: number; sold: number
  current_stock?: number; defective?: number
}
interface PmProduct { id: string; code: string; name: string; category: string; options: PmOption[] }

/* ── 모달 내 선택 아이템 ── */
interface TxItem {
  prodId   : string
  prodName : string
  prodCode : string
  optName  : string
  barcode  : string
  curStock : number
  defQty   : number
  received : number
  qty      : string   // 입고/출고/불량 수량
  adjStock : string   // 재고수정 시 직접 입력값
  note     : string
}

function mkItem(prod: PmProduct, opt: PmOption): TxItem {
  return {
    prodId: prod.id, prodName: prod.name, prodCode: prod.code,
    optName: opt.name, barcode: opt.barcode,
    curStock: getStock(opt), defQty: opt.defective || 0, received: opt.received || 0,
    qty: '', adjStock: '', note: '',
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:12, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
}

function getStock(o: PmOption) {
  return o.current_stock !== undefined ? o.current_stock : Math.max(0, o.received - (o.sold || 0))
}

/* ─── 거래 내역 localStorage ─────────────────────────────────── */
function loadTx(): TxRecord[] {
  try { const r = localStorage.getItem(TX_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveTx(tx: TxRecord[]) {
  try { localStorage.setItem(TX_KEY, JSON.stringify(tx)) } catch {}
}

/* ─── 엑셀 양식 다운로드 ────────────────────────────────────── */
function downloadTemplate(filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['바코드', '수량', '비고'],
    ['예시: 1234567890123', 10, '메모'],
  ])
  ws['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '양식')
  XLSX.writeFile(wb, filename)
}

/* ─── 메인 ──────────────────────────────────────────────────── */
export default function InventoryPage() {
  const [products, setProducts]   = useState<PmProduct[]>([])
  const [txList,   setTxList]     = useState<TxRecord[]>([])
  const [loading,  setLoading]    = useState(false)

  /* ── 입출고내역 필터 ── */
  const [monthFilter, setMonthFilter] = useState<string>('') // 'YYYY-MM' 형식
  const [typeFilter,  setTypeFilter]  = useState<TxType|'all'>('all')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  /* ── KPI 클릭 필터 ── */
  type KpiKey = 'all' | 'low' | 'zero' | 'defective' | 'month_in'
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null)
  const [kpiSearch, setKpiSearch] = useState('')

  /* ── 모달 상태 ── */
  const [outModal,    setOutModal]    = useState(false)
  const [defectModal, setDefectModal] = useState(false)
  const [adjustModal, setAdjustModal] = useState(false)
  const [saving,      setSaving]      = useState(false)

  /* ── 날짜 수정 모달 ── */
  const [editDateModal,  setEditDateModal]  = useState(false)
  const [editDateKey,    setEditDateKey]    = useState('')
  const [editDateRows,   setEditDateRows]   = useState<TxRecord[]>([])
  const [editDateSaving, setEditDateSaving] = useState(false)

  /* ── 공통 모달 폼 상태 ── */
  const [itemSearch,  setItemSearch]  = useState('')
  const [searchRes,   setSearchRes]   = useState<{ prod:PmProduct; opt:PmOption }[]>([])
  const [txItems,     setTxItems]     = useState<TxItem[]>([])
  const xlsxRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTxList(loadTx()) }, [])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('pm_products')
      .select('id,code,name,category,options').order('code', { ascending: true })
    if (data) setProducts(data as PmProduct[])
    setLoading(false)
  }, [])
  useEffect(() => { loadProducts() }, [loadProducts])

  /* ── 상품 검색 ── */
  useEffect(() => {
    const q = itemSearch.trim()
    if (!q) { setSearchRes([]); return }
    const res: { prod:PmProduct; opt:PmOption }[] = []
    for (const prod of products) {
      for (const opt of prod.options) {
        if (
          prod.name.includes(q) || prod.code.includes(q) ||
          opt.name.includes(q)  || opt.barcode.includes(q) ||
          (opt.chinese_name && opt.chinese_name.includes(q))
        ) {
          res.push({ prod, opt })
          if (res.length >= 20) break
        }
      }
      if (res.length >= 20) break
    }
    setSearchRes(res)
  }, [itemSearch, products])

  /* ── 아이템 추가 ── */
  const addItem = (prod: PmProduct, opt: PmOption) => {
    // 중복 방지
    if (txItems.some(i => i.prodId === prod.id && i.optName === opt.name)) return
    setTxItems(prev => [...prev, mkItem(prod, opt)])
    setItemSearch('')
    setSearchRes([])
  }

  /* ── 아이템 제거 ── */
  const removeItem = (idx: number) => setTxItems(prev => prev.filter((_, i) => i !== idx))

  /* ── 아이템 필드 수정 ── */
  const updateItem = (idx: number, field: 'qty'|'adjStock'|'note', val: string) =>
    setTxItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))

  /* ── 폼 초기화 ── */
  const resetForm = () => { setTxItems([]); setItemSearch(''); setSearchRes([]) }

  /* ── Supabase 옵션 업데이트 헬퍼 ── */
  /* ── 상품별로 옵션 변경 묶어서 병렬 업데이트 ── */
  const batchUpdateOptions = useCallback(async (
    updates: { prodId: string; optName: string; updater: (o: PmOption) => PmOption }[]
  ) => {
    // prodId 기준으로 그룹핑
    const grouped: Record<string, typeof updates> = {}
    for (const u of updates) {
      if (!grouped[u.prodId]) grouped[u.prodId] = []
      grouped[u.prodId].push(u)
    }
    // 각 상품별로 옵션 전체를 한 번에 업데이트 → 모든 상품 병렬 실행
    await Promise.all(Object.entries(grouped).map(async ([prodId, items]) => {
      const prod = products.find(p => p.id === prodId)
      if (!prod) return
      let opts = [...prod.options]
      for (const { optName, updater } of items) {
        opts = opts.map(o => o.name === optName ? updater(o) : o)
      }
      await supabase.from('pm_products').update({ options: opts }).eq('id', prodId)
      setProducts(prev => prev.map(p => p.id === prodId ? { ...p, options: opts } : p))
    }))
  }, [products])

  /* ── 거래 기록 추가 ── */
  const addTxBatch = (records: TxRecord[]) => {
    const updated = [...records, ...txList]
    setTxList(updated); saveTx(updated)
  }

  /* ── 출고 처리 ── */
  const handleOut = async () => {
    const valid = txItems.filter(i => i.qty && Number(i.qty) > 0)
    if (valid.length === 0) return
    setSaving(true)
    const records: TxRecord[] = []
    const updates = valid.map(item => {
      const n = Number(item.qty)
      records.push({
        id: `${Date.now()}_${item.barcode}_${Math.random()}`, date: new Date().toISOString(), type: 'out',
        product_code: item.prodCode, product_name: item.prodName,
        option_name: item.optName, barcode: item.barcode, qty: -n, note: item.note,
      })
      return { prodId: item.prodId, optName: item.optName, updater: (o: PmOption) => ({ ...o, current_stock: Math.max(0, getStock(o) - n) }) }
    })
    await batchUpdateOptions(updates)
    addTxBatch(records)
    setSaving(false); setOutModal(false); resetForm()
  }

  /* ── 불량 처리 ── */
  const handleDefect = async () => {
    const valid = txItems.filter(i => i.qty && Number(i.qty) > 0)
    if (valid.length === 0) return
    setSaving(true)
    const records: TxRecord[] = []
    const updates = valid.map(item => {
      const n = Number(item.qty)
      records.push({
        id: `${Date.now()}_${item.barcode}_${Math.random()}`, date: new Date().toISOString(), type: 'defective',
        product_code: item.prodCode, product_name: item.prodName,
        option_name: item.optName, barcode: item.barcode, qty: -n, note: item.note || '불량 처리',
      })
      return { prodId: item.prodId, optName: item.optName, updater: (o: PmOption) => ({ ...o, current_stock: Math.max(0, getStock(o) - n), defective: (o.defective || 0) + n }) }
    })
    await batchUpdateOptions(updates)
    addTxBatch(records)
    setSaving(false); setDefectModal(false); resetForm()
  }

  /* ── 재고수정 처리 ── */
  const handleAdjust = async () => {
    const valid = txItems.filter(i => i.adjStock !== '' && Number(i.adjStock) >= 0)
    if (valid.length === 0) return
    setSaving(true)
    const records: TxRecord[] = []
    const updates = valid.map(item => {
      const newStock = Number(item.adjStock)
      const prev = item.curStock
      const delta = newStock - prev
      records.push({
        id: `${Date.now()}_${item.barcode}_${Math.random()}`, date: new Date().toISOString(), type: 'adjust',
        product_code: item.prodCode, product_name: item.prodName,
        option_name: item.optName, barcode: item.barcode,
        qty: delta, note: item.note || `재고 수정 (${prev}→${newStock})`,
      })
      return { prodId: item.prodId, optName: item.optName, updater: (o: PmOption) => ({ ...o, current_stock: newStock }) }
    })
    await batchUpdateOptions(updates)
    addTxBatch(records)
    setSaving(false); setAdjustModal(false); resetForm()
  }

  /* ── 엑셀 파일 등록 처리 (바코드 Map 인덱스로 O(n) 처리) ── */
  const handleXlsxImport = (e: React.ChangeEvent<HTMLInputElement>, type: TxType) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 바코드 → {prod, opt} 인덱스 빌드 (O(products×options) 한 번만)
    const barcodeIndex = new Map<string, { prod: PmProduct; opt: PmOption }>()
    for (const prod of products) {
      for (const opt of prod.options) {
        const bc = (opt.barcode || '').trim()
        if (bc) barcodeIndex.set(bc, { prod, opt })
      }
    }

    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<{ 바코드: string; 수량: number; 비고?: string }>(ws)
      const newItems: TxItem[] = []
      const existingKeys = new Set(txItems.map(i => `${i.prodId}__${i.optName}`))

      for (const row of rows) {
        const bc = String(row['바코드'] ?? '').trim()
        if (!bc) continue
        const found = barcodeIndex.get(bc)
        if (!found) continue
        const { prod, opt } = found
        const key = `${prod.id}__${opt.name}`
        if (existingKeys.has(key)) continue
        existingKeys.add(key)
        const item = mkItem(prod, opt)
        if (type === 'adjust') {
          item.adjStock = String(row['수량'] ?? '')
        } else {
          item.qty = String(row['수량'] ?? '')
        }
        item.note = row['비고'] ?? ''
        newItems.push(item)
      }
      setTxItems(prev => [...prev, ...newItems])
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 내역 필터 ── */
  const filteredTx = useMemo(() => {
    return txList.filter(tx => {
      const month = tx.date.slice(0, 7)
      const mMonth = !monthFilter || month === monthFilter
      const mType  = typeFilter === 'all' || tx.type === typeFilter
      return mMonth && mType
    })
  }, [txList, monthFilter, typeFilter])

  /* ── 월별 그룹 ── */
  const txByMonth = useMemo(() => {
    const acc: Record<string, TxRecord[]> = {}
    for (const tx of filteredTx) {
      const key = tx.date.slice(0, 7)
      if (!acc[key]) acc[key] = []
      acc[key].push(tx)
    }
    return acc
  }, [filteredTx])

  const sortedMonths = Object.keys(txByMonth).sort((a, b) => b.localeCompare(a))

  /* ── 날짜별 그룹 (월 내부) ── */
  const txByDate = useMemo(() => {
    const acc: Record<string, TxRecord[]> = {}
    for (const tx of filteredTx) {
      const key = tx.date.slice(0, 10)
      if (!acc[key]) acc[key] = []
      acc[key].push(tx)
    }
    return acc
  }, [filteredTx])

  /* ── 월별 사용 가능한 달 목록 ── */
  const availableMonths = useMemo(() => {
    const months = new Set(txList.map(tx => tx.date.slice(0, 7)))
    return Array.from(months).sort((a, b) => b.localeCompare(a))
  }, [txList])

  const toggleMonth = (key: string) =>
    setExpandedMonths(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleDate  = (key: string) =>
    setExpandedDates(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const openDateEdit = (dateKey: string) => {
    setEditDateKey(dateKey)
    setEditDateRows((txByDate[dateKey] ?? []).map(r => ({ ...r })))
    setEditDateModal(true)
  }

  const handleDateEditSave = async () => {
    setEditDateSaving(true)
    const origRows = txByDate[editDateKey] || []
    const updates: { prodId: string; optName: string; updater: (o: PmOption) => PmOption }[] = []
    for (const newRow of editDateRows) {
      const orig = origRows.find(r => r.id === newRow.id)
      if (!orig || (orig.qty === newRow.qty && orig.note === newRow.note && orig.type === newRow.type)) continue
      const delta = newRow.qty - orig.qty
      if (delta !== 0) {
        const prod = products.find(p => p.code === newRow.product_code)
        if (prod) {
          updates.push({ prodId: prod.id, optName: newRow.option_name, updater: (o: PmOption) => ({ ...o, current_stock: Math.max(0, getStock(o) + delta) }) })
        }
      }
    }
    if (updates.length) await batchUpdateOptions(updates)
    const newList = txList.map(tx => editDateRows.find(r => r.id === tx.id) ?? tx)
    setTxList(newList); saveTx(newList)
    setEditDateSaving(false); setEditDateModal(false)
  }

  /* ── KPI ── */
  const allOpts    = products.flatMap(p => p.options.map(o => ({ ...o, pName: p.name })))
  const totalStock = allOpts.reduce((s, o) => s + getStock(o), 0)
  const lowItems   = allOpts.filter(o => getStock(o) > 0 && getStock(o) <= 2).length
  const zeroItems  = allOpts.filter(o => getStock(o) === 0).length
  const totalDef   = allOpts.reduce((s, o) => s + (o.defective || 0), 0)

  /* ── 이번달 통계 ── */
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthTx = txList.filter(tx => tx.date.startsWith(thisMonth))
  const thisMonthIn  = thisMonthTx.filter(t => t.type === 'in').reduce((s, t) => s + t.qty, 0)
  const thisMonthOut = thisMonthTx.filter(t => t.type === 'out').reduce((s, t) => s + Math.abs(t.qty), 0)

  /* ── 공통 모달 폼 렌더 ── */
  const renderModalForm = (type: TxType) => {
    const adjMode = type === 'adjust'
    const xlsxLocalRef = useRef<HTMLInputElement>(null)
    return (
      <div>
        {/* 상품 검색 */}
        <div style={{ marginBottom:12 }}>
          <Label>상품 검색</Label>
          <div style={{ position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
            <input
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="상품명, 상품코드, 옵션명, 바코드로 검색..."
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'8px 10px 8px 30px', fontSize:13, outline:'none', boxSizing:'border-box' }}
            />
          </div>
          {/* 검색 결과 드롭다운 */}
          {searchRes.length > 0 && (
            <div style={{ border:'1.5px solid #e2e8f0', borderRadius:8, marginTop:4, maxHeight:200, overflowY:'auto', background:'white', boxShadow:'0 4px 16px rgba(0,0,0,0.10)' }}>
              {searchRes.map(({ prod, opt }) => (
                <button key={`${prod.id}_${opt.name}`}
                  onClick={() => addItem(prod, opt)}
                  style={{ width:'100%', textAlign:'left', padding:'8px 12px', border:'none', borderBottom:'1px solid #f1f5f9', background:'none', cursor:'pointer', fontSize:12 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontWeight:800, color:'#1e293b' }}>{prod.name}</span>
                  <span style={{ color:'#64748b', marginLeft:6 }}>— {opt.name}</span>
                  {opt.barcode && <span style={{ fontFamily:'monospace', fontSize:11, color:'#94a3b8', marginLeft:6 }}>{opt.barcode}</span>}
                  <span style={{ float:'right', fontSize:11, color:'#059669', fontWeight:700 }}>현재고 {getStock(opt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 엑셀 버튼 */}
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button onClick={() => {
            const names: Record<TxType,string> = { in:'입고등록양식.xlsx', out:'출고등록양식.xlsx', defective:'불량등록양식.xlsx', adjust:'재고수정양식.xlsx' }
            downloadTemplate(names[type])
          }}
            style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#15803d', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Download size={12}/>엑셀 양식 다운
          </button>
          <button onClick={() => xlsxLocalRef.current?.click()}
            style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'#1d4ed8', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            <Upload size={12}/>엑셀 파일 등록
          </button>
          <input ref={xlsxLocalRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e => handleXlsxImport(e, type)}/>
        </div>

        {/* 선택된 상품 목록 */}
        {txItems.length === 0 ? (
          <div style={{ border:'2px dashed #e2e8f0', borderRadius:10, padding:'20px', textAlign:'center', color:'#94a3b8', fontSize:12.5 }}>
            상품을 검색하여 선택하거나 엑셀 파일을 등록하세요
          </div>
        ) : (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <p style={{ fontSize:12, fontWeight:800, color:'#475569' }}>선택된 상품 <span style={{ color:'#2563eb' }}>{txItems.length}개</span></p>
              <button onClick={() => setTxItems([])}
                style={{ fontSize:11, fontWeight:700, color:'#94a3b8', background:'none', border:'none', cursor:'pointer' }}>
                전체 초기화
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:280, overflowY:'auto' }}>
              {txItems.map((item, idx) => (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 90px 90px 32px', gap:6, alignItems:'center', background:'#f8fafc', borderRadius:8, padding:'8px 10px', border:'1px solid #f1f5f9' }}>
                  <div>
                    <p style={{ fontSize:12.5, fontWeight:800, color:'#1e293b', marginBottom:1 }}>
                      {item.prodName}
                      <span style={{ fontSize:11, color:'#94a3b8', fontWeight:500, marginLeft:4 }}>{item.optName}</span>
                    </p>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      {item.barcode && <span style={{ fontFamily:'monospace', fontSize:10.5, color:'#94a3b8' }}>{item.barcode}</span>}
                      <span style={{ fontSize:10.5, fontWeight:700, color:'#059669' }}>현재고 {item.curStock}</span>
                    </div>
                  </div>
                  <div>
                    {adjMode ? (
                      <div>
                        <input type="number" min="0" placeholder="수정재고"
                          value={item.adjStock}
                          onChange={e => updateItem(idx, 'adjStock', e.target.value)}
                          style={{ width:'100%', border:'1.5px solid #c7d2fe', borderRadius:6, padding:'5px 6px', fontSize:12, fontWeight:800, textAlign:'center', outline:'none', color:'#1d4ed8' }}/>
                        {item.adjStock !== '' && (
                          <p style={{ fontSize:9.5, color: Number(item.adjStock) >= item.curStock ? '#059669' : '#dc2626', textAlign:'center', marginTop:1 }}>
                            {Number(item.adjStock) >= item.curStock ? '+' : ''}{Number(item.adjStock) - item.curStock}
                          </p>
                        )}
                      </div>
                    ) : (
                      <input type="number" min="1" placeholder="수량"
                        value={item.qty}
                        onChange={e => updateItem(idx, 'qty', e.target.value)}
                        style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:6, padding:'5px 6px', fontSize:12, fontWeight:800, textAlign:'center', outline:'none' }}/>
                    )}
                  </div>
                  <input placeholder="비고" value={item.note}
                    onChange={e => updateItem(idx, 'note', e.target.value)}
                    style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:6, padding:'5px 6px', fontSize:11.5, outline:'none' }}/>
                  <button onClick={() => removeItem(idx)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:6, cursor:'pointer' }}>
                    <X size={12}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pm-page space-y-5">

      {/* KPI */}
      {(() => {
        const kpiItems: { key: KpiKey; label: string; v: string; sub: string; bg: string; color: string }[] = [
          { key:'all',      label:'전체 품목',  v:`${products.length}`,            sub:'개 상품',  bg:'#eff6ff', color:'#1d4ed8' },
          { key:'low',      label:'재고 부족',  v:`${lowItems}`,                   sub:'개 옵션',  bg:'#fffbeb', color:'#d97706' },
          { key:'zero',     label:'품절',       v:`${zeroItems}`,                  sub:'개 옵션',  bg:'#fff1f2', color:'#be123c' },
          { key:'defective',label:'불량 누계',  v:`${totalDef.toLocaleString()}`,  sub:'개',       bg:'#fff7ed', color:'#c2410c' },
          { key:'month_in', label:`${thisMonth.slice(5)}월 입고`, v:`${thisMonthIn.toLocaleString()}`, sub:'개', bg:'#f0fdf4', color:'#15803d' },
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {kpiItems.map(c => {
              const isActive = activeKpi === c.key
              return (
                <button key={c.key}
                  onClick={() => { setActiveKpi(isActive ? null : c.key); setKpiSearch('') }}
                  className="pm-card p-4 text-left"
                  style={{ background: isActive ? c.color : c.bg, border: isActive ? `2px solid ${c.color}` : '1.5px solid rgba(15,23,42,0.07)', cursor:'pointer', transition:'all 150ms' }}>
                  <p style={{ fontSize:10.5, fontWeight:800, color: isActive ? 'rgba(255,255,255,0.75)' : '#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
                  <p style={{ fontSize:22, fontWeight:900, color: isActive ? 'white' : c.color, marginTop:2, lineHeight:1 }}>
                    {c.v}<span style={{ fontSize:12, fontWeight:600, marginLeft:2 }}>{c.sub}</span>
                  </p>
                  {isActive && <p style={{ fontSize:10, color:'rgba(255,255,255,0.8)', marginTop:3 }}>클릭하여 닫기</p>}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* KPI 클릭 시 상품 목록 패널 */}
      {activeKpi && (() => {
        const allOpts2 = products.flatMap(p =>
          p.options.map(o => ({ prod: p, opt: o, stock: getStock(o) }))
        )
        let filtered2 = allOpts2
        if (activeKpi === 'low')      filtered2 = allOpts2.filter(r => r.stock > 0 && r.stock <= 2)
        if (activeKpi === 'zero')     filtered2 = allOpts2.filter(r => r.stock === 0)
        if (activeKpi === 'defective') filtered2 = allOpts2.filter(r => (r.opt.defective ?? 0) > 0)
        if (activeKpi === 'month_in')  filtered2 = allOpts2.filter(r => (r.opt.received ?? 0) > 0)
        // 검색
        const q = kpiSearch.trim().toLowerCase()
        if (q) filtered2 = filtered2.filter(r =>
          r.prod.name.toLowerCase().includes(q) || r.prod.code.toLowerCase().includes(q) ||
          r.opt.name.toLowerCase().includes(q) || (r.opt.barcode ?? '').includes(q)
        )
        const label = { all:'전체 품목', low:'재고 부족', zero:'품절', defective:'불량 누계', month_in:`${thisMonth.slice(5)}월 입고` }[activeKpi]
        return (
          <div className="pm-card overflow-hidden">
            <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(15,23,42,0.07)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <p style={{ fontSize:13.5, fontWeight:900, color:'#1e293b' }}>{label} 상품 목록</p>
              <div style={{ position:'relative', flex:'1 1 200px' }}>
                <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }}/>
                <input value={kpiSearch} onChange={e => setKpiSearch(e.target.value)}
                  placeholder="상품명, 코드, 옵션, 바코드 검색..."
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'6px 10px 6px 28px', fontSize:12.5, outline:'none', boxSizing:'border-box' }}/>
              </div>
              <span style={{ fontSize:12, color:'#94a3b8' }}>{filtered2.length}건</span>
              <button onClick={() => setActiveKpi(null)}
                style={{ marginLeft:'auto', fontSize:11.5, fontWeight:700, color:'#64748b', background:'#f1f5f9', border:'none', borderRadius:7, padding:'4px 10px', cursor:'pointer' }}>닫기</button>
            </div>
            <div style={{ maxHeight:340, overflowY:'auto' }}>
              {filtered2.length === 0 ? (
                <div style={{ padding:'2rem', textAlign:'center', color:'#94a3b8', fontSize:13 }}>해당 항목이 없습니다</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc', position:'sticky', top:0 }}>
                      {['상품명','코드','옵션','바코드','현재고','불량','발주','입고'].map(h => (
                        <th key={h} style={{ padding:'7px 10px', fontWeight:800, color:'#64748b', fontSize:11, textAlign: h==='현재고'||h==='불량'||h==='발주'||h==='입고' ? 'center' : 'left', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered2.map(({ prod, opt, stock }, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f8fafc' }}>
                        <td style={{ padding:'7px 10px', fontWeight:700, color:'#1e293b', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.name}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11.5, color:'#475569' }}>{prod.code}</td>
                        <td style={{ padding:'7px 10px', color:'#64748b' }}>{opt.name}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11, color:'#94a3b8' }}>{opt.barcode || '-'}</td>
                        <td style={{ padding:'7px 10px', textAlign:'center', fontWeight:900, color: stock === 0 ? '#dc2626' : stock <= 2 ? '#d97706' : '#15803d' }}>{stock}</td>
                        <td style={{ padding:'7px 10px', textAlign:'center', color:'#c2410c', fontWeight:800 }}>{opt.defective ?? 0}</td>
                        <td style={{ padding:'7px 10px', textAlign:'center', color:'#2563eb', fontWeight:700 }}>{opt.ordered ?? 0}</td>
                        <td style={{ padding:'7px 10px', textAlign:'center', color:'#0ea5e9', fontWeight:700 }}>{opt.received ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {/* 액션 버튼 */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <Button style={{ background:'#dc2626', borderColor:'#dc2626' }} size="sm"
          onClick={() => { resetForm(); setOutModal(true) }}>
          <ArrowUpCircle size={14}/>출고 등록
        </Button>
        <Button style={{ background:'#ea580c', borderColor:'#ea580c' }} size="sm"
          onClick={() => { resetForm(); setDefectModal(true) }}>
          <ShieldAlert size={14}/>불량 등록
        </Button>
        <Button style={{ background:'#2563eb', borderColor:'#2563eb' }} size="sm"
          onClick={() => { resetForm(); setAdjustModal(true) }}>
          <ClipboardList size={14}/>재고 수정
        </Button>
        <Button variant="outline" size="sm" onClick={loadProducts} style={{ marginLeft:'auto' }}>
          <RefreshCw size={13}/>새로고침
        </Button>
      </div>

      {/* ── 입출고 내역 ── */}
      <div className="pm-card overflow-hidden">
        {/* 헤더 + 필터 */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(15,23,42,0.07)', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
          <p style={{ fontSize:14, fontWeight:900, color:'#1e293b', display:'flex', alignItems:'center', gap:6 }}>
            <CalendarDays size={15} style={{ color:'#2563eb' }}/>입출고 내역
          </p>

          {/* 월별 선택 */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              style={{ border:'1.5px solid #e2e8f0', borderRadius:8, padding:'5px 10px', fontSize:12.5, fontWeight:700, outline:'none', color:'#334155' }}>
              <option value="">전체 월</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {m.slice(0,4)}년 {m.slice(5)}월
                </option>
              ))}
            </select>
          </div>

          {/* 유형 필터 */}
          <div style={{ display:'flex', gap:4 }}>
            {([['all','전체','#64748b','#f1f5f9'],['in','입고','#15803d','#f0fdf4'],['out','출고','#be123c','#fff1f2'],['defective','불량','#c2410c','#fff7ed'],['adjust','재고수정','#1d4ed8','#eff6ff']] as const).map(([v, l, c, bg]) => (
              <button key={v} onClick={() => setTypeFilter(v as TxType|'all')}
                style={{ fontSize:11.5, fontWeight:800, padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  background: typeFilter === v ? c : bg,
                  color: typeFilter === v ? 'white' : c }}>
                {l}
              </button>
            ))}
          </div>

          <p style={{ marginLeft:'auto', fontSize:11.5, color:'#94a3b8', fontWeight:700 }}>
            총 {filteredTx.length}건
          </p>
        </div>

        {/* 내역 목록 */}
        <div style={{ padding:'8px 0' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:'3rem', color:'#94a3b8' }}>불러오는 중...</div>
          )}
          {!loading && filteredTx.length === 0 && (
            <div style={{ textAlign:'center', padding:'3rem 1rem', color:'#94a3b8' }}>
              <Package size={36} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
              <p style={{ fontSize:13.5, fontWeight:700 }}>입출고 내역이 없습니다</p>
              <p style={{ fontSize:12, color:'#cbd5e1' }}>상단의 입고/출고/불량/재고수정 버튼으로 내역을 추가하세요</p>
            </div>
          )}

          {sortedMonths.map(monthKey => {
            const monthTx   = txByMonth[monthKey]
            const monthExpanded = expandedMonths.has(monthKey)
            const [y, m]    = monthKey.split('-')
            // 월 내 날짜들
            const datesInMonth = Object.keys(txByDate)
              .filter(d => d.startsWith(monthKey))
              .sort((a, b) => b.localeCompare(a))
            // 월 통계
            const mIn  = monthTx.filter(t => t.type === 'in').reduce((s, t) => s + t.qty, 0)
            const mOut = monthTx.filter(t => t.type === 'out').reduce((s, t) => s + Math.abs(t.qty), 0)
            const mDef = monthTx.filter(t => t.type === 'defective').length
            const mAdj = monthTx.filter(t => t.type === 'adjust').length

            return (
              <div key={monthKey} style={{ borderBottom:'2px solid #e2e8f0' }}>
                {/* 월 헤더 */}
                <div
                  onClick={() => toggleMonth(monthKey)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:'linear-gradient(135deg,#f8fafc,#f1f5f9)', cursor:'pointer' }}>
                  {monthExpanded ? <ChevronDown size={15} color="#64748b"/> : <ChevronRight size={15} color="#64748b"/>}
                  <span style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>
                    {y}년 {m}월
                  </span>
                  <span style={{ fontSize:11.5, color:'#94a3b8', fontWeight:700 }}>{monthTx.length}건</span>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {mIn  > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#f0fdf4', color:'#15803d', padding:'2px 8px', borderRadius:5 }}>⬇️ 입고 +{mIn}</span>}
                    {mOut > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#fff1f2', color:'#be123c', padding:'2px 8px', borderRadius:5 }}>⬆️ 출고 -{mOut}</span>}
                    {mDef > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#fff7ed', color:'#c2410c', padding:'2px 8px', borderRadius:5 }}>⚠️ 불량 {mDef}건</span>}
                    {mAdj > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#eff6ff', color:'#1d4ed8', padding:'2px 8px', borderRadius:5 }}>✏️ 재고수정 {mAdj}건</span>}
                  </div>
                </div>

                {/* 날짜별 목록 */}
                {monthExpanded && datesInMonth.map(dateKey => {
                  const dayTx    = txByDate[dateKey]
                  const expanded = expandedDates.has(dateKey)
                  const inCount  = dayTx.filter(t => t.type === 'in').length
                  const outCount = dayTx.filter(t => t.type === 'out').length
                  const defCount = dayTx.filter(t => t.type === 'defective').length
                  const adjCount = dayTx.filter(t => t.type === 'adjust').length
                  const [, , dd] = dateKey.split('-')

                  return (
                    <div key={dateKey} style={{ borderTop:'1px solid #f1f5f9' }}>
                      {/* 날짜 행 */}
                      <div
                        onClick={() => toggleDate(dateKey)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px 9px 32px', background:'#fafafa', cursor:'pointer' }}>
                        {expanded ? <ChevronDown size={13} color="#94a3b8"/> : <ChevronRight size={13} color="#94a3b8"/>}
                        <span style={{ fontSize:12.5, fontWeight:900, color:'#334155' }}>{y}.{m}.{dd}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8' }}>총 {dayTx.length}건</span>
                        <div style={{ display:'flex', gap:4 }}>
                          {inCount  > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#f0fdf4', color:'#15803d', padding:'2px 6px', borderRadius:5 }}>입고 {inCount}</span>}
                          {outCount > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#fff1f2', color:'#be123c', padding:'2px 6px', borderRadius:5 }}>출고 {outCount}</span>}
                          {defCount > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#fff7ed', color:'#c2410c', padding:'2px 6px', borderRadius:5 }}>불량 {defCount}</span>}
                          {adjCount > 0 && <span style={{ fontSize:10.5, fontWeight:800, background:'#eff6ff', color:'#1d4ed8', padding:'2px 6px', borderRadius:5 }}>재고수정 {adjCount}</span>}
                        </div>
                        <div style={{ marginLeft:'auto' }}>
                          <button
                            onClick={e => { e.stopPropagation(); openDateEdit(dateKey) }}
                            style={{ display:'flex', alignItems:'center', gap:4, background:'#eff6ff', color:'#2563eb', border:'none', borderRadius:7, padding:'3px 9px', fontSize:11, fontWeight:800, cursor:'pointer' }}>
                            <Edit2 size={10}/>수정
                          </button>
                        </div>
                      </div>

                      {/* 상세 항목 */}
                      {expanded && (
                        <div className="pm-table-wrap" style={{ paddingLeft:32 }}>
                          <table className="pm-table">
                            <thead>
                              <tr>{['시간','유형','상품명','옵션명','바코드','수량','비고'].map(h => <th key={h}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {dayTx.map(tx => {
                                const ts = TX_STYLE[tx.type]
                                return (
                                  <tr key={tx.id}>
                                    <td style={{ fontSize:11, color:'#94a3b8', whiteSpace:'nowrap' }}>
                                      {new Date(tx.date).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}
                                    </td>
                                    <td>
                                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:800, background:ts.bg, color:ts.color, padding:'2px 8px', borderRadius:99 }}>
                                        <span style={{ width:5,height:5,borderRadius:'50%',background:ts.dot,display:'inline-block' }}/>{ts.label}
                                      </span>
                                    </td>
                                    <td style={{ fontWeight:800, color:'#1e293b', fontSize:12.5 }}>{tx.product_name}</td>
                                    <td style={{ fontSize:12, color:'#64748b' }}>{tx.option_name}</td>
                                    <td><span style={{ fontFamily:'monospace', fontSize:11, background:'#f1f5f9', color:'#475569', padding:'2px 6px', borderRadius:4 }}>{tx.barcode||'-'}</span></td>
                                    <td>
                                      <span style={{ fontSize:14, fontWeight:900, color: tx.qty > 0 ? '#059669' : '#dc2626' }}>
                                        {tx.qty > 0 ? `+${tx.qty}` : tx.qty}
                                      </span>
                                    </td>
                                    <td style={{ fontSize:12, color:'#64748b' }}>{tx.note}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 출고 등록 모달 ── */}
      <Modal isOpen={outModal} onClose={() => { setOutModal(false); resetForm() }} title="출고 등록" size="lg">
        <div style={{ background:'#fff1f2', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#be123c' }}>
          ⬆️ 출고 처리 시 선택한 상품의 <b>현재고가 수량만큼 감소</b>합니다.
        </div>
        {renderModalForm('out')}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setOutModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleOut} disabled={saving || txItems.filter(i=>i.qty&&Number(i.qty)>0).length===0}
            style={{ background:'#dc2626', borderColor:'#dc2626', opacity: saving ? 0.6 : 1 }}>
            <ArrowUpCircle size={13}/>{saving ? '처리 중...' : `출고 처리 (${txItems.filter(i=>i.qty&&Number(i.qty)>0).length}건)`}
          </Button>
        </div>
      </Modal>

      {/* ── 불량 등록 모달 ── */}
      <Modal isOpen={defectModal} onClose={() => { setDefectModal(false); resetForm() }} title="불량 등록" size="lg">
        <div style={{ background:'#fff7ed', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#c2410c' }}>
          ⚠️ 불량 처리 시 <b>현재고가 감소</b>하고, 상품관리에 <b>불량 수량이 누적</b>됩니다.
        </div>
        {renderModalForm('defective')}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setDefectModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleDefect} disabled={saving || txItems.filter(i=>i.qty&&Number(i.qty)>0).length===0}
            style={{ background:'#ea580c', borderColor:'#ea580c', opacity: saving ? 0.6 : 1 }}>
            <ShieldAlert size={13}/>{saving ? '처리 중...' : `불량 등록 (${txItems.filter(i=>i.qty&&Number(i.qty)>0).length}건)`}
          </Button>
        </div>
      </Modal>

      {/* ── 재고 수정 모달 ── */}
      <Modal isOpen={adjustModal} onClose={() => { setAdjustModal(false); resetForm() }} title="재고 수정" size="lg">
        <div style={{ background:'#eff6ff', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:12, fontWeight:700, color:'#1d4ed8' }}>
          ✏️ 실사 후 <b>실제 재고 수량을 직접 입력</b>하여 현재고를 수정합니다.
        </div>
        {renderModalForm('adjust')}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:18 }}>
          <Button variant="outline" onClick={() => { setAdjustModal(false); resetForm() }}>취소</Button>
          <Button onClick={handleAdjust} disabled={saving || txItems.filter(i=>i.adjStock!=='').length===0}
            style={{ opacity: saving ? 0.6 : 1 }}>
            <Plus size={13}/>{saving ? '처리 중...' : `재고 수정 (${txItems.filter(i=>i.adjStock!=='').length}건)`}
          </Button>
        </div>
      </Modal>

      {/* ── 날짜별 내역 수정 모달 ── */}
      <Modal isOpen={editDateModal} onClose={() => setEditDateModal(false)} title={`내역 수정 — ${editDateKey}`} size="xl">
        <div style={{ marginBottom:12, padding:'8px 12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, fontSize:12, fontWeight:700, color:'#b45309' }}>
          ⚠️ 수량 수정 시 해당 변동분이 상품의 현재고에 반영됩니다.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {editDateRows.map((row, idx) => {
            const ts = TX_STYLE[row.type]
            return (
              <div key={row.id} style={{ display:'grid', gridTemplateColumns:'70px 90px 1fr 1fr 60px 1fr', gap:8, alignItems:'center', padding:'8px 10px', background:'#f8fafc', borderRadius:8, border:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{new Date(row.date).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>
                <select value={row.type} onChange={e => setEditDateRows(prev => prev.map((r,i) => i===idx ? {...r, type: e.target.value as TxType} : r))}
                  style={{ border:'1.5px solid #e2e8f0', borderRadius:6, padding:'3px 5px', fontSize:11, fontWeight:700, background:ts.bg, color:ts.color, width:'100%' }}>
                  {Object.entries(TX_STYLE).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{ fontSize:12, fontWeight:800, color:'#1e293b' }}>{row.product_name}</span>
                <span style={{ fontSize:11.5, color:'#64748b' }}>{row.option_name}</span>
                <input type="number" value={row.qty}
                  onChange={e => setEditDateRows(prev => prev.map((r,i) => i===idx ? {...r, qty:Number(e.target.value)} : r))}
                  style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:6, padding:'4px 6px', fontSize:13, fontWeight:800, textAlign:'center', outline:'none' }}/>
                <input value={row.note} placeholder="비고"
                  onChange={e => setEditDateRows(prev => prev.map((r,i) => i===idx ? {...r, note:e.target.value} : r))}
                  style={{ border:'1.5px solid #e2e8f0', borderRadius:6, padding:'4px 8px', fontSize:12, outline:'none', width:'100%' }}/>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Button variant="outline" onClick={() => setEditDateModal(false)}>취소</Button>
          <Button onClick={handleDateEditSave} disabled={editDateSaving} style={{ opacity: editDateSaving ? 0.6 : 1 }}>
            {editDateSaving ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
