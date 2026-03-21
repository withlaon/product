'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  Purchase, PurchaseItem, PmProduct,
  getToday, getThisMonth, shiftMonth,
  fmtMonthLabel,
  syncProductQty,
} from '../_shared'
import {
  Edit2, Trash2, X, Plus, PackagePlus, CheckCircle2,
  Upload, ChevronLeft, ChevronRight,
} from 'lucide-react'

/* ── 월별 전용 날짜 네비 ── */
function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const thisMonth = getThisMonth()
  const isFuture  = month >= thisMonth
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <button onClick={() => setMonth(shiftMonth(month, -1))}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronLeft size={12}/>
      </button>
      <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', minWidth:80, textAlign:'center', whiteSpace:'nowrap' }}>
        {fmtMonthLabel(month)}
      </span>
      <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isFuture}
        style={{ width:26, height:26, borderRadius:6, border:'1.5px solid #e2e8f0', background:'white', cursor:isFuture?'not-allowed':'pointer', opacity:isFuture?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ChevronRight size={12}/>
      </button>
      <button onClick={() => setMonth(thisMonth)}
        style={{ fontSize:10.5, fontWeight:700, color:'#2563eb', background:'#eff6ff', border:'none', borderRadius:6, padding:'4px 9px', cursor:'pointer' }}>
        이번달
      </button>
    </div>
  )
}

/* ── localStorage 키 ── */
const CONFIRMED_KEY = 'pm_receive_confirmed_v1'

/* ── 초기 폼 상태 ── */
const EMPTY_FORM = () => ({
  order_date: getToday(),
  supplier: '',
  items: [{ product_code: '', option_name: '', barcode: '', qty: '' }],
})

/* ── 오른쪽 패널 펼친 아이템 타입 ── */
interface RcItem {
  purchaseId:   string
  itemIndex:    number
  product_code: string
  option_name:  string
  barcode:      string
  received:     number
  confirmed:    boolean
  prodId:       string
  prodAbbr:     string
  optImage:     string
}

function loadLocalSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try { const r = localStorage.getItem(key); return r ? new Set(JSON.parse(r)) : new Set() }
  catch { return new Set() }
}

export default function ReceiveManagePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)

  /* 오른쪽 날짜 네비 (월별 전용) */
  const [month, setMonth] = useState(getThisMonth())

  /* 체크박스 */
  const [selectedKeys,  setSelectedKeys]  = useState<Set<string>>(new Set())

  /* 확정된 아이템 키 */
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(() => loadLocalSet(CONFIRMED_KEY))

  /* 입고 등록 모달 */
  const [isAdd, setIsAdd] = useState(false)
  const [form,  setForm]  = useState(EMPTY_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* 수정/삭제 모달 */
  const [editTarget,   setEditTarget]   = useState<Purchase | null>(null)
  const [editFormData, setEditFormData] = useState<Purchase | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null)

  /* ── 데이터 로드 ── */
  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending: false })
    if (data) setPurchases(data as Purchase[])
  }, [])
  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('pm_products').select('id,code,name,abbr,options')
    if (data) setProducts(data as PmProduct[])
  }, [])
  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  /* ── 왼쪽: 미입고 목록 (pm_products 기준 ordered > received, 상품코드 내림차순) ── */
  const unreceivedList = useMemo(() => {
    const list: {
      prodId: string; prodCode: string; abbr: string; optName: string
      barcode: string; image: string; qty: number
    }[] = []
    for (const prod of products) {
      for (const opt of prod.options) {
        const unreceived = (opt.ordered || 0) - (opt.received || 0)
        if (unreceived > 0) {
          list.push({
            prodId:   prod.id,
            prodCode: prod.code,
            abbr:     prod.abbr || prod.name || prod.code,
            optName:  opt.name || opt.korean_name || '',
            barcode:  opt.barcode || '',
            image:    opt.image   || '',
            qty:      unreceived,
          })
        }
      }
    }
    return list.sort((a, b) => b.prodCode.localeCompare(a.prodCode))
  }, [products])

  /* ── 오른쪽: 날짜 필터 입고 목록 ── */
  const rcPurchases = useMemo(() =>
    purchases
      .filter(p => p.status !== 'ordered' && p.status !== 'cancelled')
      .filter(p => {
        const ref = (p.received_at ?? p.order_date).slice(0, month.length)
        return ref === month
      })
      .sort((a, b) => {
        const aD = (a.received_at ?? a.order_date).slice(0, 10)
        const bD = (b.received_at ?? b.order_date).slice(0, 10)
        return bD.localeCompare(aD)
      })
  , [purchases, month])

  /* ── 오른쪽: 펼친 아이템 목록 (상품코드 내림차순) ── */
  const rcItems = useMemo((): RcItem[] => {
    const items: RcItem[] = []
    for (const p of rcPurchases) {
      for (let i = 0; i < p.items.length; i++) {
        const item = p.items[i]
        const barcode  = item.barcode || ''
        const itemKey  = `${p.id}|${i}`

        let prodId = '', prodAbbr = '', optImage = ''
        if (barcode) {
          for (const prod of products) {
            const opt = prod.options.find(o => o.barcode === barcode)
            if (opt) { prodId = prod.id; prodAbbr = prod.abbr || prod.name; optImage = opt.image || ''; break }
          }
        }
        if (!prodId) {
          const prod = products.find(pr => pr.code === item.product_code)
          if (prod) {
            const opt = prod.options.find(o =>
              o.name === item.option_name || o.korean_name === item.option_name
            )
            prodId = prod.id; prodAbbr = prod.abbr || prod.name; optImage = opt?.image || ''
          }
        }

        items.push({
          purchaseId: p.id, itemIndex: i,
          product_code: item.product_code, option_name: item.option_name,
          barcode, received: item.received,
          confirmed: confirmedKeys.has(itemKey),
          prodId, prodAbbr, optImage,
        })
      }
    }
    return items.sort((a, b) => b.product_code.localeCompare(a.product_code))
  }, [rcPurchases, products, confirmedKeys])

  /* ── 입고확정 ── */
  const handleConfirm = async () => {
    const toConfirm = rcItems.filter(item => {
      const k = `${item.purchaseId}|${item.itemIndex}`
      return selectedKeys.has(k) && !confirmedKeys.has(k)
    })
    if (selectedKeys.size === 0) { alert('확정할 항목을 선택하세요.'); return }
    if (!toConfirm.length)       { alert('선택한 항목이 이미 모두 확정되었습니다.'); return }

    setSaving(true)
    const deltas = toConfirm
      .filter(item => item.prodId)
      .map(item => ({
        prodId:        item.prodId,
        optName:       item.option_name,
        barcode:       item.barcode || undefined,
        orderedDelta:  0,
        receivedDelta: item.received,
      }))

    if (deltas.length) await syncProductQty(products, deltas)

    const newKeys = new Set(confirmedKeys)
    for (const item of toConfirm) newKeys.add(`${item.purchaseId}|${item.itemIndex}`)
    setConfirmedKeys(newKeys)
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...newKeys]))

    await loadProducts()
    setSaving(false)
    setSelectedKeys(new Set())
  }

  /* ── 수정 ── */
  const handleEditSave = async () => {
    if (!editTarget || !editFormData) return
    setSaving(true)
    const deltas = editFormData.items.map((newItem, i) => {
      const oldItem = editTarget.items[i] || { product_code:'', option_name:'', barcode:'', ordered:0, received:0 }
      const prod = products.find(p => p.code === newItem.product_code || p.code === oldItem.product_code)
      return {
        prodId: prod?.id ?? '',
        optName: newItem.option_name,
        orderedDelta:  newItem.ordered  - oldItem.ordered,
        receivedDelta: newItem.received - oldItem.received,
      }
    }).filter(d => d.prodId && (d.orderedDelta !== 0 || d.receivedDelta !== 0))
    await supabase.from('pm_purchases').update({
      order_date: editFormData.order_date, supplier: editFormData.supplier,
      status: editFormData.status, items: editFormData.items,
    }).eq('id', editTarget.id)
    if (deltas.length) await syncProductQty(products, deltas)
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

  /* ── 파일 업로드 ──
     1. W로 시작하는 상품코드만 표시
     2. 한국어 옵션명 → pm_products의 영어 옵션명(name)으로 자동변환
     3. 바코드 자동완성
     4. 상품코드 내림차순 정렬
  ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb  = XLSX.read(ev.target?.result, { type: 'binary' })
        const ws  = wb.Sheets[wb.SheetNames[0]]

        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', header: 'A' })

        /* 헤더 행 탐색 (B열이 '품번' | '상품코드' 포함) */
        const headerIdx = raw.findIndex(row =>
          String(row['B'] || '').trim().includes('품번') ||
          String(row['B'] || '').trim().includes('상품코드') ||
          String(row['B'] || '').toLowerCase().trim() === 'product_code'
        )

        let parsedItems: { product_code:string; option_name:string; barcode:string; qty:string }[] = []
        let dateVal = ''; let supplierVal = ''

        if (headerIdx >= 0) {
          /* ── 패킹리스트 형식: B=품번, D=컬러, E=수량 ── */
          const dataRows = raw.slice(headerIdx + 2)
            .filter(row =>
              String(row['B'] || '').trim() &&
              !String(row['B'] || '').includes('합계') &&
              !String(row['B'] || '').includes('총')
            )
          parsedItems = dataRows.map(row => ({
            product_code: String(row['B'] || '').trim(),
            option_name:  String(row['D'] || '').trim(),
            barcode:      '',
            qty:          String(row['E'] || '').trim(),
          })).filter(i => i.product_code && i.qty && Number(i.qty) > 0)
        } else {
          /* ── 기존 헤더 기반 파싱 ── */
          const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          if (!allRows.length) return
          const COL = {
            product_code: ['상품코드','product_code','상품 코드','코드','품번'],
            option_name:  ['옵션명','option_name','옵션','옵션 명','옵션이름','컬러','색상','color'],
            barcode:      ['바코드','barcode','바 코드','BARCODE'],
            qty:          ['입고수량','수량','입고 수량','qty','QTY','Qty','입고량'],
            order_date:   ['입고일','입고일자','날짜','date','입고 일자'],
            supplier:     ['구매처','공급처','supplier','거래처'],
          }
          const headers   = Object.keys(allRows[0])
          const findCol   = (keys: string[]) =>
            headers.find(h => keys.map(k => k.toLowerCase()).includes(h.toLowerCase())) ?? ''
          const cCode = findCol(COL.product_code); const cOpt = findCol(COL.option_name)
          const cBar  = findCol(COL.barcode);      const cQty = findCol(COL.qty)
          const cDate = findCol(COL.order_date);   const cSup = findCol(COL.supplier)
          parsedItems = allRows
            .map(row => ({
              product_code: String(row[cCode] ?? '').trim(),
              option_name:  String(row[cOpt]  ?? '').trim(),
              barcode:      String(row[cBar]  ?? '').trim(),
              qty:          String(row[cQty]  ?? '').trim(),
            }))
            .filter(i => i.product_code || i.barcode)
          if (cDate) dateVal     = String(allRows[0][cDate] ?? '').slice(0, 10)
          if (cSup)  supplierVal = String(allRows[0][cSup]  ?? '').trim()
        }

        /* ── 1. W로 시작하는 상품코드만 ── */
        parsedItems = parsedItems.filter(i =>
          i.product_code.toUpperCase().startsWith('W')
        )

        /* ── 2. 영어 옵션명 자동변환 + 3. 바코드 자동완성 ── */
        parsedItems = parsedItems.map(item => {
          const prod = products.find(p => p.code === item.product_code)
          if (!prod) return item

          /* korean_name 또는 name으로 옵션 매칭 */
          const opt = prod.options.find(o => {
            const kn = (o.korean_name || '').trim()
            const en = (o.name || '').trim()
            const q  = item.option_name.trim()
            return kn === q || en === q ||
              (kn && kn.includes(q)) || (q && q.includes(kn)) ||
              (en && en.includes(q)) || (q && q.includes(en))
          })

          if (!opt) return item
          return {
            ...item,
            option_name: opt.name || item.option_name,  // 영어 옵션명으로 교체
            barcode:     opt.barcode || item.barcode,    // 바코드 자동완성
          }
        })

        /* ── 4. 상품코드 내림차순 정렬 ── */
        parsedItems = parsedItems.sort((a, b) => b.product_code.localeCompare(a.product_code))

        if (!parsedItems.length) {
          alert('W로 시작하는 상품코드가 없거나 파싱 가능한 행이 없습니다.')
          return
        }
        setForm(f => ({
          order_date: dateVal || f.order_date,
          supplier:   supplierVal || f.supplier,
          items:      parsedItems,
        }))
      } catch (err) {
        console.error(err); alert('파일 파싱 오류가 발생했습니다.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  /* ── 입고 등록 모달 닫기 (폼 리셋 포함) ── */
  const closeAddModal = () => {
    setIsAdd(false)
    setForm(EMPTY_FORM)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /* ── 입고 등록 ── */
  const handleAdd = async () => {
    if (!form.order_date) return
    const items: PurchaseItem[] = form.items
      .filter(i => i.product_code || i.barcode)
      .map(i => ({
        product_code: i.product_code, option_name: i.option_name, barcode: i.barcode,
        ordered: Number(i.qty) || 0, received: Number(i.qty) || 0,
      }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = {
      id: String(Date.now()), order_date: form.order_date,
      supplier: form.supplier || '직접입고', status: 'completed',
      ordered_at: new Date().toISOString(), received_at: new Date().toISOString(), items,
    }
    await supabase.from('pm_purchases').insert(p)
    await loadPurchases()
    closeAddModal()
    setSaving(false)
  }

  /* KPI */
  const kpiQty = useMemo(() =>
    rcPurchases.reduce((s, p) => s + p.items.reduce((ss, i) => ss + i.received, 0), 0),
    [rcPurchases]
  )

  const L = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display:'block', fontSize:11.5, fontWeight:800, color:'#475569', marginBottom:5 }}>{children}</label>
  )

  /* 전체 체크박스 */
  const allChecked = rcItems.length > 0 && rcItems.every(i => selectedKeys.has(`${i.purchaseId}|${i.itemIndex}`))
  const toggleAll  = (v: boolean) =>
    setSelectedKeys(v ? new Set(rcItems.map(i => `${i.purchaseId}|${i.itemIndex}`)) : new Set())

  return (
    <div className="pm-page" style={{ display:'flex', flexDirection:'column', height:'100%', gap:10 }}>

      {/* ── 상단: KPI + 등록 버튼 ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { label:'이번달 입고 건수', value:rcPurchases.length,    color:'#059669', bg:'#f0fdf4' },
            { label:'입고 수량',        value:kpiQty,                color:'#1e293b', bg:'#f8fafc' },
            { label:'전체 미입고 종류', value:unreceivedList.length, color:unreceivedList.length>0?'#d97706':'#94a3b8', bg:unreceivedList.length>0?'#fffbeb':'#f8fafc' },
          ].map(c => (
            <div key={c.label} className="pm-card" style={{ padding:'8px 16px', background:c.bg, minWidth:130 }}>
              <p style={{ fontSize:10, fontWeight:800, color:'#94a3b8', marginBottom:2 }}>{c.label}</p>
              <p style={{ fontSize:20, fontWeight:900, color:c.color, lineHeight:1 }}>{c.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setIsAdd(true)}
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, fontWeight:800, color:'white', background:'#059669', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer' }}>
          <Plus size={13}/>입고 등록
        </button>
      </div>

      {/* ── 2분할 메인 영역 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, flex:1, overflow:'hidden' }}>

        {/* ══ 왼쪽: 미입고 내역 ══ */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>미입고 내역</span>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{unreceivedList.length}종</span>
          </div>
          <div style={{ flex:1, overflow:'auto' }}>
            {unreceivedList.length === 0
              ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <CheckCircle2 size={32} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>미입고 상품이 없습니다</p>
                </div>
              )
              : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:1 }}>
                      {['이미지','상품약어','옵션명','바코드','미입고'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:'center', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unreceivedList.map((u, idx) => (
                      <tr key={idx} style={{ borderBottom:'1px solid #f8fafc' }}>
                        <td style={{ textAlign:'center', padding:'5px 6px' }}>
                          {u.image
                            ? <img src={u.image} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:4 }}/>
                            : <div style={{ width:32, height:32, background:'#f1f5f9', borderRadius:4, margin:'0 auto' }}/>}
                        </td>
                        <td style={{ padding:'5px 8px', fontWeight:700, color:'#0f172a', fontSize:11, maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.abbr}</td>
                        <td style={{ padding:'5px 8px', color:'#475569', fontSize:11, maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.optName}</td>
                        <td style={{ padding:'5px 8px', color:'#94a3b8', fontSize:10, fontFamily:'monospace' }}>{u.barcode || '-'}</td>
                        <td style={{ textAlign:'center', fontWeight:900, color:'#dc2626', fontSize:13 }}>{u.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>

        {/* ══ 오른쪽: 입고 목록 ══ */}
        <div className="pm-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          {/* 날짜 네비 + 입고확정 버튼 */}
          <div style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <MonthNav month={month} setMonth={setMonth}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{rcItems.length}건</span>
            </div>
            <button onClick={handleConfirm} disabled={saving}
              style={{ width:'100%', fontSize:12, fontWeight:800, color:'white', background:saving?'#a3a3a3':'#059669', border:'none', borderRadius:7, padding:'7px 0', cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
              <CheckCircle2 size={12}/>{saving ? '처리 중...' : '입고확정'}
            </button>
          </div>

          {/* 입고 아이템 목록 */}
          <div style={{ flex:1, overflow:'auto' }}>
            {rcItems.length === 0
              ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8' }}>
                  <PackagePlus size={32} style={{ opacity:0.2, margin:'0 auto 10px' }}/>
                  <p style={{ fontSize:13, fontWeight:700 }}>입고 내역이 없습니다</p>
                  <p style={{ fontSize:11, color:'#cbd5e1', marginTop:4 }}>
                    {fmtMonthLabel(month)} 기간에 입고 등록된 항목이 없습니다
                  </p>
                </div>
              )
              : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:1 }}>
                      <th style={{ padding:'6px 8px', borderBottom:'1px solid #f1f5f9', width:28 }}>
                        <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={{ cursor:'pointer' }}/>
                      </th>
                      {['이미지','상품약어','옵션명','바코드','입고수량','확정'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', fontWeight:800, color:'#64748b', fontSize:10.5, textAlign:'center', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rcItems.map(item => {
                      const k = `${item.purchaseId}|${item.itemIndex}`
                      return (
                        <tr key={k} style={{ borderBottom:'1px solid #f8fafc', background:item.confirmed ? '#f0fdf4' : 'white' }}>
                          <td style={{ textAlign:'center', padding:'5px 8px' }}>
                            <input type="checkbox" checked={selectedKeys.has(k)}
                              onChange={e => {
                                const ns = new Set(selectedKeys)
                                e.target.checked ? ns.add(k) : ns.delete(k)
                                setSelectedKeys(ns)
                              }} style={{ cursor:'pointer' }}/>
                          </td>
                          <td style={{ textAlign:'center', padding:'5px 6px' }}>
                            {item.optImage
                              ? <img src={item.optImage} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:4 }}/>
                              : <div style={{ width:32, height:32, background:'#f1f5f9', borderRadius:4, margin:'0 auto' }}/>}
                          </td>
                          <td style={{ padding:'5px 8px', fontWeight:700, color:'#0f172a', fontSize:11, maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {item.prodAbbr || item.product_code}
                          </td>
                          <td style={{ padding:'5px 8px', color:'#475569', fontSize:11, maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {item.option_name}
                          </td>
                          <td style={{ padding:'5px 8px', fontSize:10, fontFamily:'monospace' }}>
                            {item.barcode
                              ? <span style={{ color:'#64748b' }}>{item.barcode}</span>
                              : <span style={{ color:'#f59e0b', fontWeight:700, fontSize:10 }}>미매핑</span>}
                          </td>
                          <td style={{ textAlign:'center', fontWeight:800, color:'#0ea5e9', fontSize:13 }}>{item.received}</td>
                          <td style={{ textAlign:'center' }}>
                            {item.confirmed
                              ? <span style={{ fontSize:10, fontWeight:800, color:'#15803d', background:'#dcfce7', padding:'2px 7px', borderRadius:99 }}>확정</span>
                              : <span style={{ fontSize:10, fontWeight:800, color:'#d97706', background:'#fef3c7', padding:'2px 7px', borderRadius:99 }}>대기</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>
      </div>

      {/* ── 입고 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={closeAddModal} title="입고 등록" size="xl">
        <div style={{ marginBottom:14, padding:'10px 14px', background:'#f8fafc', borderRadius:8, border:'1px dashed #cbd5e1', display:'flex', alignItems:'center', gap:10 }}>
          <Upload size={15} style={{ color:'#64748b', flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#334155', marginBottom:2 }}>입고 파일 업로드 (선택)</p>
            <p style={{ fontSize:10.5, color:'#94a3b8' }}>패킹리스트(B=품번·D=컬러·E=수량) — W 상품코드만 표시, 영어 옵션명·바코드 자동완성</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={handleFileUpload}/>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ fontSize:12, fontWeight:800, color:'#0ea5e9', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:7, padding:'6px 14px', cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
            <Upload size={12}/>파일 선택
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><L>입고일 *</L><Input type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}/></div>
          <div><L>구매처</L><Input placeholder="구매처" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}/></div>
          <div style={{ gridColumn:'1/-1', marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:800, color:'#059669', paddingBottom:6, borderBottom:'1px solid #f0fdf4', marginBottom:10 }}>✅ 입고 상품</p>
            {form.items.map((item, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr auto', gap:8, marginBottom:8 }}>
                <Input placeholder="상품코드(품번)" value={item.product_code} onChange={e => { const it=[...form.items]; it[i]={...it[i],product_code:e.target.value}; setForm(f=>({...f,items:it})) }}/>
                <Input placeholder="옵션명" value={item.option_name} onChange={e => { const it=[...form.items]; it[i]={...it[i],option_name:e.target.value}; setForm(f=>({...f,items:it})) }}/>
                <Input placeholder="바코드" value={item.barcode} onChange={e => { const it=[...form.items]; it[i]={...it[i],barcode:e.target.value}; setForm(f=>({...f,items:it})) }}/>
                <Input type="number" placeholder="입고수량" value={item.qty} onChange={e => { const it=[...form.items]; it[i]={...it[i],qty:e.target.value}; setForm(f=>({...f,items:it})) }}/>
                {form.items.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                    style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:8, cursor:'pointer' }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { product_code:'', option_name:'', barcode:'', qty:'' }] }))}
              style={{ fontSize:12, fontWeight:800, color:'#059669', background:'#f0fdf4', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ marginTop:12, padding:'8px 12px', background:'#fef3c7', borderRadius:8 }}>
          <p style={{ fontSize:11, color:'#92400e' }}>
            ⚠️ 입고 등록 후 <strong>입고확정</strong> 버튼을 눌러야 재고에 반영됩니다.
          </p>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
          <Button variant="outline" onClick={closeAddModal}>취소</Button>
          <Button onClick={handleAdd} disabled={saving} style={{ background:'#059669', borderColor:'#059669' }}>
            <CheckCircle2 size={13}/>{saving ? '저장 중...' : '입고 등록'}
          </Button>
        </div>
      </Modal>

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={() => { setEditTarget(null); setEditFormData(null) }} title={`입고 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div><L>발주일</L><Input type="date" value={editFormData.order_date} onChange={e => setEditFormData(f => f ? { ...f, order_date: e.target.value } : f)}/></div>
            <div><L>구매처</L><Input value={editFormData.supplier} onChange={e => setEditFormData(f => f ? { ...f, supplier: e.target.value } : f)}/></div>
          </div>
          {editFormData.items.map((item, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
              <Input value={item.product_code} onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],product_code:e.target.value}; return{...f,items:it} })}/>
              <Input value={item.option_name}  onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],option_name:e.target.value}; return{...f,items:it} })}/>
              <Input value={item.barcode}       onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],barcode:e.target.value}; return{...f,items:it} })}/>
              <Input type="number" value={item.ordered}  onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],ordered:Number(e.target.value)||0}; return{...f,items:it} })}/>
              <Input type="number" value={item.received} onChange={e => setEditFormData(f => { if(!f) return f; const it=[...f.items]; it[i]={...it[i],received:Number(e.target.value)||0}; return{...f,items:it} })}/>
              <button onClick={() => setEditFormData(f => f ? { ...f, items: f.items.filter((_, j) => j !== i) } : f)}
                style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', color:'#dc2626', border:'none', borderRadius:7, cursor:'pointer' }}>
                <X size={12}/>
              </button>
            </div>
          ))}
          <button onClick={() => setEditFormData(f => f ? { ...f, items: [...f.items, { product_code:'', option_name:'', barcode:'', ordered:0, received:0 }] } : f)}
            style={{ fontSize:12, fontWeight:800, color:'#059669', background:'#f0fdf4', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, marginBottom:16 }}>
            <Plus size={12}/>상품 추가
          </button>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditFormData(null) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="입고 삭제 확인" size="sm">
          <div style={{ textAlign:'center', padding:'16px 0' }}>
            <Trash2 size={36} style={{ color:'#dc2626', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:8 }}>{deleteTarget.order_date} 입고를 삭제하시겠습니까?</p>
            <p style={{ fontSize:12, color:'#64748b' }}>삭제 시 확정된 입고 수량이 상품관리에서 차감됩니다.</p>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={saving}
              style={{ background:'#dc2626', borderColor:'#dc2626', opacity:saving ? 0.6 : 1 }}>
              <Trash2 size={13}/>{saving ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
