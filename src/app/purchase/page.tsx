'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  Plus, Search, PackagePlus, CheckCircle2, Clock,
  Truck, X, Upload, Download, Layers,
  ChevronDown, ChevronRight, Edit2, Trash2, AlertTriangle,
} from 'lucide-react'

/* ── 타입 ── */
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

interface PmOption {
  name: string; barcode: string; chinese_name?: string
  ordered?: number; received?: number; sold?: number; current_stock?: number
}
interface PmProduct { id: string; code: string; name: string; options: PmOption[] }

/* BulkRow: 바코드 기반 행 */
interface BulkRow {
  barcode: string
  qty: string
  matchedProdId: string
  matchedProdCode: string
  matchedProdName: string
  matchedOptName: string
  manualSearch: string
  manualResults: { prodId: string; prodCode: string; prodName: string; optName: string; barcode: string }[]
  showSearch: boolean
}

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

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5 }}>{children}</label>
}

/* ── 엑셀 양식 (바코드+수량만) ── */
function downloadBarcodeTemplate(filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['바코드', '수량'],
    ['예시: 1234567890123', 10],
  ])
  ws['!cols'] = [{ wch: 24 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '양식')
  XLSX.writeFile(wb, filename)
}

/* ── 날짜 포맷 ── */
function fmtMonth(ym: string) {
  return `${ym.slice(0, 4)}년 ${ym.slice(5)}월`
}
function fmtDate(d: string) {
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}(${['일','월','화','수','목','금','토'][dt.getDay()]})`
}

/* ── 상품 수량 동기화 헬퍼 ── */
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
      const newOrdered = Math.max(0, (opt.ordered || 0) + u.orderedDelta)
      const prevStock = opt.current_stock !== undefined ? opt.current_stock : Math.max(0, (opt.received || 0) - (opt.sold || 0))
      const newReceived = Math.max(0, (opt.received || 0) + u.receivedDelta)
      const newStock = Math.max(0, prevStock + u.receivedDelta)
      return { ...opt, ordered: newOrdered, received: newReceived, current_stock: newStock }
    })
    await supabase.from('pm_products').update({ options: updatedOpts }).eq('id', prodId)
  }
}

export default function PurchasePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products, setProducts]   = useState<PmProduct[]>([])

  /* KPI 필터: all | ordered(발주완료) | completed(입고완료) | unresolved(미입고) */
  const [activeKpi, setActiveKpi] = useState<'all' | 'ordered' | 'completed' | 'unresolved'>('all')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [expandedDates,  setExpandedDates]  = useState<Set<string>>(new Set())

  /* 모달 */
  const [isAdd,      setIsAdd]      = useState(false)
  const [isBulkIn,   setIsBulkIn]   = useState(false)
  const [isBulkPo,   setIsBulkPo]   = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [editTarget,    setEditTarget]    = useState<Purchase | null>(null)
  const [editFormData,  setEditFormData]  = useState<Purchase | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Purchase | null>(null)
  const [saving, setSaving] = useState(false)

  /* 발주 등록 폼 */
  const [form, setForm] = useState({
    order_date: '', supplier: '',
    items: [{ product_code: '', option_name: '', barcode: '', ordered: '' }],
  })

  /* 일괄 입고/발주 */
  const [bulkInDate,     setBulkInDate]     = useState('')
  const [bulkInSupplier, setBulkInSupplier] = useState('')
  const [bulkInRows,     setBulkInRows]     = useState<BulkRow[]>([])
  const [bulkPoDate,     setBulkPoDate]     = useState('')
  const [bulkPoSupplier, setBulkPoSupplier] = useState('')
  const [bulkPoRows,     setBulkPoRows]     = useState<BulkRow[]>([])

  /* ── 로드 ── */
  const loadPurchases = useCallback(async () => {
    const { data } = await supabase.from('pm_purchases').select('*').order('order_date', { ascending: false })
    if (data) setPurchases(data as Purchase[])
  }, [])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('pm_products').select('id,code,name,options')
    if (data) setProducts(data as PmProduct[])
  }, [])

  useEffect(() => { loadPurchases(); loadProducts() }, [loadPurchases, loadProducts])

  /* ── 바코드 맵 ── */
  const barcodeMap = useMemo(() => {
    const m: Record<string, { prodId: string; prodCode: string; prodName: string; optName: string }> = {}
    for (const prod of products) {
      for (const opt of prod.options) {
        if (opt.barcode) m[opt.barcode] = { prodId: prod.id, prodCode: prod.code, prodName: prod.name, optName: opt.name }
      }
    }
    return m
  }, [products])

  const makeBulkRow = useCallback((barcode = '', qty = ''): BulkRow => {
    const match = barcode ? (barcodeMap[barcode] ?? null) : null
    return {
      barcode, qty,
      matchedProdId: match?.prodId ?? '',
      matchedProdCode: match?.prodCode ?? '',
      matchedProdName: match?.prodName ?? '',
      matchedOptName: match?.optName ?? '',
      manualSearch: '', manualResults: [], showSearch: false,
    }
  }, [barcodeMap])

  /* ── 엑셀 파싱 (바코드+수량) ── */
  const parseExcel = (file: File, cb: (rows: BulkRow[]) => void) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any[] = XLSX.utils.sheet_to_json(ws)
      const rows = json.map(r => {
        const bc  = String(r['바코드'] ?? r['barcode'] ?? '').trim()
        const qty = String(r['수량']   ?? r['qty']     ?? '').trim()
        return makeBulkRow(bc, qty)
      }).filter(r => r.barcode)
      cb(rows)
    }
    reader.readAsBinaryString(file)
  }

  /* ── 수동 검색 ── */
  const handleManualSearch = (
    rows: BulkRow[], setRows: (r: BulkRow[]) => void, idx: number, q: string
  ) => {
    const results = q.trim() ? products.flatMap(prod =>
      prod.options
        .filter(opt =>
          prod.name.includes(q) || prod.code.toLowerCase().includes(q.toLowerCase()) ||
          opt.name.toLowerCase().includes(q.toLowerCase()) || opt.barcode.includes(q)
        )
        .map(opt => ({ prodId: prod.id, prodCode: prod.code, prodName: prod.name, optName: opt.name, barcode: opt.barcode }))
    ).slice(0, 15) : []
    const newRows = [...rows]
    newRows[idx] = { ...newRows[idx], manualSearch: q, manualResults: results, showSearch: true }
    setRows(newRows)
  }

  const selectMatch = (
    rows: BulkRow[], setRows: (r: BulkRow[]) => void,
    idx: number, match: { prodId: string; prodCode: string; prodName: string; optName: string; barcode: string }
  ) => {
    const newRows = [...rows]
    newRows[idx] = {
      ...newRows[idx],
      barcode: match.barcode,
      matchedProdId: match.prodId, matchedProdCode: match.prodCode,
      matchedProdName: match.prodName, matchedOptName: match.optName,
      manualSearch: '', manualResults: [], showSearch: false,
    }
    setRows(newRows)
  }

  /* ── 일괄 입고 등록 ── */
  const handleBulkInSubmit = async () => {
    const valid = bulkInRows.filter(r => r.barcode && r.qty && r.matchedProdId)
    if (!valid.length) return
    setSaving(true)
    const today = bulkInDate || new Date().toISOString().slice(0, 10)
    const items: PurchaseItem[] = valid.map(r => ({
      product_code: r.matchedProdCode,
      option_name: r.matchedOptName,
      barcode: r.barcode,
      ordered: Number(r.qty) || 0,
      received: Number(r.qty) || 0,
    }))
    const p: Purchase = {
      id: String(Date.now()), order_date: today,
      supplier: bulkInSupplier || '직접입고',
      status: 'completed',
      ordered_at: new Date().toISOString(), received_at: new Date().toISOString(), items,
    }
    await supabase.from('pm_purchases').insert(p)
    await syncProductQty(products, valid.map(r => ({
      prodId: r.matchedProdId, optName: r.matchedOptName,
      orderedDelta: Number(r.qty) || 0, receivedDelta: Number(r.qty) || 0,
    })))
    await loadPurchases(); await loadProducts()
    setIsBulkIn(false); setBulkInDate(''); setBulkInSupplier(''); setBulkInRows([])
    setSaving(false)
  }

  /* ── 일괄 발주 등록 ── */
  const handleBulkPoSubmit = async () => {
    const valid = bulkPoRows.filter(r => r.barcode && r.qty && r.matchedProdId)
    if (!valid.length) return
    setSaving(true)
    const today = bulkPoDate || new Date().toISOString().slice(0, 10)
    const items: PurchaseItem[] = valid.map(r => ({
      product_code: r.matchedProdCode,
      option_name: r.matchedOptName,
      barcode: r.barcode,
      ordered: Number(r.qty) || 0,
      received: 0,
    }))
    const p: Purchase = {
      id: String(Date.now()), order_date: today,
      supplier: bulkPoSupplier || '미지정',
      status: 'ordered',
      ordered_at: new Date().toISOString(), received_at: null, items,
    }
    await supabase.from('pm_purchases').insert(p)
    await syncProductQty(products, valid.map(r => ({
      prodId: r.matchedProdId, optName: r.matchedOptName,
      orderedDelta: Number(r.qty) || 0, receivedDelta: 0,
    })))
    await loadPurchases(); await loadProducts()
    setIsBulkPo(false); setBulkPoDate(''); setBulkPoSupplier(''); setBulkPoRows([])
    setSaving(false)
  }

  /* ── 개별 발주 등록 ── */
  const handleAdd = async () => {
    if (!form.order_date) return
    const items = form.items.filter(i => i.product_code).map(i => ({
      product_code: i.product_code, option_name: i.option_name,
      barcode: i.barcode, ordered: Number(i.ordered) || 0, received: 0,
    }))
    if (!items.length) return
    setSaving(true)
    const p: Purchase = {
      id: String(Date.now()), order_date: form.order_date,
      supplier: form.supplier || '미지정', status: 'ordered',
      ordered_at: new Date().toISOString(), received_at: null, items,
    }
    await supabase.from('pm_purchases').insert(p)
    // 기존 방식(code 기반) 발주 동기화
    for (const item of items) {
      if (!item.product_code) continue
      const prod = products.find(p => p.code === item.product_code)
      if (!prod) continue
      const updatedOpts = prod.options.map(o => {
        const match = !item.option_name || o.name === item.option_name || o.barcode === item.barcode
        return match ? { ...o, ordered: (o.ordered || 0) + item.ordered } : o
      })
      await supabase.from('pm_products').update({ options: updatedOpts }).eq('id', prod.id)
    }
    await loadPurchases(); await loadProducts()
    setIsAdd(false)
    setForm({ order_date: '', supplier: '', items: [{ product_code: '', option_name: '', barcode: '', ordered: '' }] })
    setSaving(false)
  }

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
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: 0, receivedDelta: receivedItems[i] || 0 }
    }).filter(d => d.prodId && d.receivedDelta > 0)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases(); await loadProducts()
    setReceiveTarget(null); setSaving(false)
  }

  /* ── 수정 ── */
  const openEdit = (p: Purchase) => {
    setEditTarget(p)
    setEditFormData(JSON.parse(JSON.stringify(p)))
  }

  const handleEditSave = async () => {
    if (!editTarget || !editFormData) return
    setSaving(true)
    const orderedDeltas = editFormData.items.map((newItem, i) => {
      const oldItem = editTarget.items[i] || { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }
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
    // 발주/입고 역산
    const deltas = p.items.map(item => {
      const prod = products.find(pr => pr.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: -item.ordered, receivedDelta: -item.received }
    }).filter(d => d.prodId)
    if (deltas.length) await syncProductQty(products, deltas)
    await supabase.from('pm_purchases').delete().eq('id', p.id)
    await loadPurchases(); await loadProducts()
    setDeleteTarget(null); setSaving(false)
  }

  /* ── KPI ── */
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const kpiOrdered   = purchases.filter(p => p.status === 'ordered').length
  const kpiCompleted = purchases.filter(p => p.status === 'completed').length
  const kpiUnresolved = purchases.filter(p => isUnresolved(p)).length

  /* ── 뷰 필터 ── */
  const filteredPurchases = useMemo(() => {
    if (activeKpi === 'ordered')   return purchases.filter(p => p.status === 'ordered')
    if (activeKpi === 'completed') return purchases.filter(p => p.status === 'completed')
    if (activeKpi === 'unresolved') return purchases.filter(p => isUnresolved(p))
    return purchases
  }, [purchases, activeKpi])

  /* ── 월별 그룹핑 ── */
  const purchasesByMonth = useMemo(() => {
    const acc: Record<string, Purchase[]> = {}
    for (const p of filteredPurchases) {
      const ym = p.order_date.slice(0, 7)
      if (!acc[ym]) acc[ym] = []
      acc[ym].push(p)
    }
    // 미입고는 과거 월이라도 항상 포함 (all 뷰에서도)
    if (activeKpi === 'all') {
      for (const p of purchases) {
        if (!isUnresolved(p)) continue
        const ym = p.order_date.slice(0, 7)
        if (!acc[ym]) acc[ym] = []
        if (!acc[ym].find(x => x.id === p.id)) acc[ym].push(p)
      }
    }
    return Object.fromEntries(Object.entries(acc).sort((a, b) => b[0].localeCompare(a[0])))
  }, [filteredPurchases, purchases, activeKpi])

  /* ── 날짜별 그룹핑 ── */
  const groupByDate = (list: Purchase[]) => {
    const acc: Record<string, Purchase[]> = {}
    for (const p of list) {
      if (!acc[p.order_date]) acc[p.order_date] = []
      acc[p.order_date].push(p)
    }
    return Object.fromEntries(Object.entries(acc).sort((a, b) => b[0].localeCompare(a[0])))
  }

  const toggleMonth = (ym: string) => setExpandedMonths(prev => {
    const n = new Set(prev)
    n.has(ym) ? n.delete(ym) : n.add(ym)
    return n
  })
  const toggleDate = (key: string) => setExpandedDates(prev => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })

  /* ── 벌크 폼 렌더 공통 ── */
  const renderBulkTable = (
    rows: BulkRow[],
    setRows: (r: BulkRow[]) => void,
    type: 'in' | 'po'
  ) => (
    <div>
      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>
          엑셀을 업로드하거나 행 추가 버튼을 눌러 상품을 추가하세요
        </div>
      )}
      {rows.map((row, i) => {
        const isUnmatched = row.barcode && !row.matchedProdId
        return (
          <div key={i} style={{ marginBottom: 8, border: `1.5px solid ${isUnmatched ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 12px', background: isUnmatched ? '#fff5f5' : '#fafafa' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 3 }}>바코드</label>
                <input
                  value={row.barcode}
                  placeholder="바코드 입력..."
                  onChange={e => {
                    const newRows = [...rows]
                    newRows[i] = makeBulkRow(e.target.value, row.qty)
                    setRows(newRows)
                  }}
                  style={{ width: '100%', border: `1.5px solid ${isUnmatched ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 7, padding: '6px 10px', fontSize: 12.5, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 3 }}>수량</label>
                <input
                  type="number" value={row.qty} placeholder="0"
                  onChange={e => { const newRows = [...rows]; newRows[i] = { ...newRows[i], qty: e.target.value }; setRows(newRows) }}
                  style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '6px 10px', fontSize: 13, textAlign: 'right', outline: 'none' }}
                />
              </div>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 7, cursor: 'pointer', marginBottom: 1 }}>
                <X size={12} />
              </button>
            </div>

            {/* 매칭 정보 */}
            {row.matchedProdId ? (
              <div style={{ marginTop: 6, fontSize: 11.5, color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={11} />
                {row.matchedProdName} — {row.matchedOptName}
                <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontWeight: 400 }}>({row.matchedProdCode})</span>
              </div>
            ) : row.barcode ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <AlertTriangle size={11} />바코드 미매칭 — 직접 검색하여 연결
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    value={row.manualSearch}
                    placeholder="상품명, 코드, 옵션명으로 검색..."
                    onChange={e => handleManualSearch(rows, setRows, i, e.target.value)}
                    onFocus={() => { const newRows = [...rows]; newRows[i] = { ...newRows[i], showSearch: true }; setRows(newRows) }}
                    style={{ width: '100%', border: '1.5px solid #fca5a5', borderRadius: 7, padding: '5px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                  />
                  {row.showSearch && row.manualResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 50, maxHeight: 160, overflowY: 'auto' }}>
                      {row.manualResults.map((m, mi) => (
                        <button key={mi}
                          onClick={() => selectMatch(rows, setRows, i, m)}
                          style={{ width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'none', cursor: 'pointer', fontSize: 12 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontWeight: 800, color: '#1e293b' }}>{m.prodName}</span>
                          <span style={{ color: '#64748b', marginLeft: 6 }}>— {m.optName}</span>
                          {m.barcode && <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: '#94a3b8', marginLeft: 5 }}>{m.barcode}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button onClick={() => setRows([...rows, makeBulkRow()])}
          style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={12} />행 추가
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          매칭 {rows.filter(r => r.matchedProdId).length}/{rows.length}건
          {rows.filter(r => r.barcode && !r.matchedProdId).length > 0 && (
            <span style={{ color: '#dc2626', marginLeft: 6 }}>
              ⚠️ 미매칭 {rows.filter(r => r.barcode && !r.matchedProdId).length}건
            </span>
          )}
        </span>
      </div>
    </div>
  )

  return (
    <div className="pm-page space-y-4">

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { key: 'all',        label: '전체 발주', value: purchases.length,  bg: '#f8fafc', color: '#475569' },
          { key: 'ordered',    label: '발주완료',  value: kpiOrdered,        bg: '#eff6ff', color: '#2563eb' },
          { key: 'completed',  label: '입고완료',  value: kpiCompleted,      bg: '#f0fdf4', color: '#15803d' },
          { key: 'unresolved', label: '미입고',    value: kpiUnresolved,     bg: '#fffbeb', color: '#d97706' },
        ].map(c => (
          <button key={c.key}
            onClick={() => setActiveKpi(c.key as typeof activeKpi)}
            className="pm-card p-4 text-left"
            style={{ background: activeKpi === c.key ? c.bg : 'white', border: activeKpi === c.key ? `2px solid ${c.color}` : '1.5px solid rgba(15,23,42,0.07)', cursor: 'pointer' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: c.color, lineHeight: 1, marginTop: 6 }}>{c.value}</p>
          </button>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div className="pm-card p-3">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="sm" onClick={() => { setIsBulkIn(true); setBulkInRows([makeBulkRow()]) }}
            style={{ background: '#0d9488', borderColor: '#0d9488' }}>
            <Layers size={13} />일괄 입고 등록
          </Button>
          <Button size="sm" onClick={() => setIsAdd(true)}>
            <Plus size={13} />발주 등록
          </Button>
          <Button size="sm" onClick={() => { setIsBulkPo(true); setBulkPoRows([makeBulkRow()]) }}
            style={{ background: '#2563eb', borderColor: '#2563eb' }}>
            <Layers size={13} />일괄 발주 등록
          </Button>
          {activeKpi !== 'all' && (
            <button onClick={() => setActiveKpi('all')}
              style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
              전체 보기
            </button>
          )}
        </div>
      </div>

      {/* ── 월별 발주 목록 ── */}
      <div className="space-y-3">
        {Object.keys(purchasesByMonth).length === 0 && (
          <div className="pm-card" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8' }}>
            <PackagePlus size={36} style={{ opacity: 0.22, margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13.5, fontWeight: 700 }}>등록된 발주가 없습니다</p>
          </div>
        )}

        {Object.entries(purchasesByMonth).map(([ym, list]) => {
          const isExpanded = expandedMonths.has(ym)
          const mOrdered   = list.filter(p => p.status === 'ordered').length
          const mCompleted = list.filter(p => p.status === 'completed').length
          const mUnresolved = list.filter(p => isUnresolved(p)).length
          const dateGroups = groupByDate(list)
          const isPastMonth = ym < thisMonth

          return (
            <div key={ym} className="pm-card overflow-hidden">
              {/* 월 헤더 */}
              <button
                onClick={() => toggleMonth(ym)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: isExpanded ? '#f8fafc' : 'white', border: 'none', cursor: 'pointer', borderBottom: isExpanded ? '1px solid rgba(15,23,42,0.06)' : 'none' }}>
                {isExpanded ? <ChevronDown size={15} style={{ color: '#64748b' }} /> : <ChevronRight size={15} style={{ color: '#64748b' }} />}
                <span style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>{fmtMonth(ym)}</span>
                {isPastMonth && mUnresolved > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 20 }}>
                    ⚠️ 미입고 {mUnresolved}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {mOrdered > 0 && <span style={{ fontSize: 11, fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '2px 9px', borderRadius: 20 }}>발주완료 {mOrdered}</span>}
                  {mCompleted > 0 && <span style={{ fontSize: 11, fontWeight: 800, background: '#f0fdf4', color: '#15803d', padding: '2px 9px', borderRadius: 20 }}>입고완료 {mCompleted}</span>}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>총 {list.length}건</span>
                </span>
              </button>

              {/* 날짜별 그룹 */}
              {isExpanded && (
                <div style={{ padding: '8px 12px 12px' }}>
                  {Object.entries(dateGroups).map(([date, dayList]) => {
                    const dateKey = `${ym}_${date}`
                    const isDateExpanded = expandedDates.has(dateKey)
                    const dayOrdered   = dayList.filter(p => p.status === 'ordered').length
                    const dayCompleted = dayList.filter(p => p.status === 'completed').length
                    const dayUnresolved = dayList.filter(p => isUnresolved(p)).length

                    return (
                      <div key={date} style={{ marginBottom: 6, border: '1.5px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                        {/* 날짜 헤더 */}
                        <button
                          onClick={() => toggleDate(dateKey)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: isDateExpanded ? '#f8fafc' : 'white', border: 'none', cursor: 'pointer' }}>
                          {isDateExpanded ? <ChevronDown size={13} style={{ color: '#94a3b8' }} /> : <ChevronRight size={13} style={{ color: '#94a3b8' }} />}
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>{fmtDate(date)}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>{date}</span>
                          {dayUnresolved > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fef3c7', color: '#d97706', padding: '1px 7px', borderRadius: 20 }}>미입고 {dayUnresolved}</span>}
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                            {dayOrdered > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '1px 7px', borderRadius: 20 }}>발주 {dayOrdered}</span>}
                            {dayCompleted > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, background: '#f0fdf4', color: '#15803d', padding: '1px 7px', borderRadius: 20 }}>입고 {dayCompleted}</span>}
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>총 {dayList.length}건</span>
                          </span>
                        </button>

                        {/* 해당 날짜 발주 목록 */}
                        {isDateExpanded && (
                          <div style={{ borderTop: '1px solid #f1f5f9' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  {['구매처', '상품수', '발주', '입고', '미입고', '상태', '관리'].map(h => (
                                    <th key={h} style={{ padding: '7px 10px', fontWeight: 800, color: '#64748b', fontSize: 11, textAlign: h === '구매처' ? 'left' : 'center', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {dayList.map(p => {
                                  const totalOrdered  = p.items.reduce((s, i) => s + i.ordered, 0)
                                  const totalReceived = p.items.reduce((s, i) => s + i.received, 0)
                                  const undelivered   = totalOrdered - totalReceived
                                  const st = ST[p.status]
                                  return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#334155' }}>{p.supplier || '-'}</td>
                                      <td style={{ textAlign: 'center', color: '#64748b' }}>{p.items.length}건</td>
                                      <td style={{ textAlign: 'center', fontWeight: 800, color: '#1e293b' }}>{totalOrdered.toLocaleString()}</td>
                                      <td style={{ textAlign: 'center', fontWeight: 800, color: '#0ea5e9' }}>{totalReceived.toLocaleString()}</td>
                                      <td style={{ textAlign: 'center', fontWeight: 900, color: undelivered > 0 ? '#d97706' : '#94a3b8' }}>{undelivered.toLocaleString()}</td>
                                      <td style={{ textAlign: 'center' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800, background: st.bg, color: st.color, padding: '3px 9px', borderRadius: 99 }}>
                                          {st.label}
                                        </span>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                          {p.status !== 'completed' && p.status !== 'cancelled' && (
                                            <button onClick={() => setReceiveTarget(p)}
                                              style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ecfdf5', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                              <Truck size={10} />입고
                                            </button>
                                          )}
                                          <button onClick={() => openEdit(p)}
                                            style={{ fontSize: 11, fontWeight: 800, color: '#7e22ce', background: '#fdf4ff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Edit2 size={10} />수정
                                          </button>
                                          <button onClick={() => setDeleteTarget(p)}
                                            style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fff1f2', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Trash2 size={10} />삭제
                                          </button>
                                        </div>
                                      </td>
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
              )}
            </div>
          )
        })}
      </div>

      {/* ── 발주 등록 모달 ── */}
      <Modal isOpen={isAdd} onClose={() => setIsAdd(false)} title="발주 등록" size="xl">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Label>발주일 *</Label><Input type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}/></div>
          <div><Label>구매처 (선택)</Label><Input placeholder="동대문 A상회" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}/></div>
          <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', paddingBottom: 6, borderBottom: '1px solid #eff6ff', marginBottom: 10 }}>📦 발주 상품</p>
            {form.items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr auto', gap: 8, marginBottom: 8 }}>
                <div><Label>상품코드</Label><Input placeholder="WA5AC001" value={item.product_code}
                  onChange={e => { const it = [...form.items]; it[i] = { ...it[i], product_code: e.target.value }; setForm(f => ({ ...f, items: it })) }}/></div>
                <div><Label>옵션명</Label><Input placeholder="BE" value={item.option_name}
                  onChange={e => { const it = [...form.items]; it[i] = { ...it[i], option_name: e.target.value }; setForm(f => ({ ...f, items: it })) }}/></div>
                <div><Label>바코드</Label><Input placeholder="" value={item.barcode}
                  onChange={e => { const it = [...form.items]; it[i] = { ...it[i], barcode: e.target.value }; setForm(f => ({ ...f, items: it })) }}/></div>
                <div><Label>발주 수량</Label><Input type="number" placeholder="0" value={item.ordered}
                  onChange={e => { const it = [...form.items]; it[i] = { ...it[i], ordered: e.target.value }; setForm(f => ({ ...f, items: it })) }}/></div>
                <div style={{ paddingTop: 21 }}>
                  {form.items.length > 1 && (
                    <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                      <X size={13}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { product_code: '', option_name: '', barcode: '', ordered: '' }] }))}
              style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12}/>상품 추가
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="outline" onClick={() => setIsAdd(false)}>취소</Button>
          <Button onClick={handleAdd} disabled={saving}>발주 등록</Button>
        </div>
      </Modal>

      {/* ── 일괄 입고 등록 모달 ── */}
      <Modal isOpen={isBulkIn} onClose={() => setIsBulkIn(false)} title="일괄 입고 등록" size="xl">
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, fontWeight: 700, color: '#059669' }}>
          💡 바코드를 기준으로 상품을 찾아 일괄 입고 등록합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><Label>입고일</Label><Input type="date" value={bulkInDate} onChange={e => setBulkInDate(e.target.value)}/></div>
          <div><Label>구매처 (선택)</Label><Input placeholder="동대문 A상회" value={bulkInSupplier} onChange={e => setBulkInSupplier(e.target.value)}/></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#059669', flex: 1 }}>📦 입고 상품 목록</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Upload size={12}/>엑셀 업로드
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseExcel(f, rows => setBulkInRows(prev => [...prev.filter(r => r.barcode), ...rows])); e.target.value = '' }}/>
          </label>
          <button onClick={() => downloadBarcodeTemplate('일괄입고_양식.xlsx')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Download size={12}/>양식 다운로드
          </button>
        </div>
        {renderBulkTable(bulkInRows, setBulkInRows, 'in')}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="outline" onClick={() => setIsBulkIn(false)}>취소</Button>
          <Button onClick={handleBulkInSubmit} disabled={saving || bulkInRows.filter(r => r.matchedProdId).length === 0}
            style={{ background: '#059669', borderColor: '#059669', opacity: saving ? 0.6 : 1 }}>
            <CheckCircle2 size={13}/>{saving ? '처리 중...' : `일괄 입고 등록 (${bulkInRows.filter(r => r.matchedProdId).length}건)`}
          </Button>
        </div>
      </Modal>

      {/* ── 일괄 발주 등록 모달 ── */}
      <Modal isOpen={isBulkPo} onClose={() => setIsBulkPo(false)} title="일괄 발주 등록" size="xl">
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
          💡 바코드를 기준으로 상품을 찾아 일괄 발주 등록합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><Label>발주일</Label><Input type="date" value={bulkPoDate} onChange={e => setBulkPoDate(e.target.value)}/></div>
          <div><Label>구매처 (선택)</Label><Input placeholder="동대문 A상회" value={bulkPoSupplier} onChange={e => setBulkPoSupplier(e.target.value)}/></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', flex: 1 }}>📦 발주 상품 목록</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Upload size={12}/>엑셀 업로드
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseExcel(f, rows => setBulkPoRows(prev => [...prev.filter(r => r.barcode), ...rows])); e.target.value = '' }}/>
          </label>
          <button onClick={() => downloadBarcodeTemplate('일괄발주_양식.xlsx')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Download size={12}/>양식 다운로드
          </button>
        </div>
        {renderBulkTable(bulkPoRows, setBulkPoRows, 'po')}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="outline" onClick={() => setIsBulkPo(false)}>취소</Button>
          <Button onClick={handleBulkPoSubmit} disabled={saving || bulkPoRows.filter(r => r.matchedProdId).length === 0}
            style={{ opacity: saving ? 0.6 : 1 }}>
            <Layers size={13}/>{saving ? '처리 중...' : `일괄 발주 등록 (${bulkPoRows.filter(r => r.matchedProdId).length}건)`}
          </Button>
        </div>
      </Modal>

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={() => setReceiveTarget(null)} onSave={handleReceive} />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={() => { setEditTarget(null); setEditFormData(null) }} title={`발주 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <Label>발주일 *</Label>
              <Input type="date" value={editFormData.order_date}
                onChange={e => setEditFormData(f => f ? { ...f, order_date: e.target.value } : f)}/>
            </div>
            <div>
              <Label>구매처 (선택)</Label>
              <Input placeholder="구매처" value={editFormData.supplier}
                onChange={e => setEditFormData(f => f ? { ...f, supplier: e.target.value } : f)}/>
            </div>
          </div>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>📦 발주 상품 목록 (수정 가능)</p>
          {editFormData.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div>
                {i === 0 && <Label>상품코드</Label>}
                <Input placeholder="WA5AC001" value={item.product_code}
                  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], product_code: e.target.value }; return { ...f, items: it } })}/>
              </div>
              <div>
                {i === 0 && <Label>옵션명</Label>}
                <Input placeholder="BE" value={item.option_name}
                  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], option_name: e.target.value }; return { ...f, items: it } })}/>
              </div>
              <div>
                {i === 0 && <Label>바코드</Label>}
                <Input style={{ fontFamily: 'monospace', background: '#f8fafc' }} value={item.barcode}
                  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], barcode: e.target.value }; return { ...f, items: it } })}/>
              </div>
              <div>
                {i === 0 && <Label>발주수량</Label>}
                <Input type="number" value={item.ordered}
                  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], ordered: Number(e.target.value) || 0 }; return { ...f, items: it } })}/>
              </div>
              <div>
                {i === 0 && <Label>입고수량</Label>}
                <Input type="number" value={item.received}
                  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], received: Number(e.target.value) || 0 }; return { ...f, items: it } })}/>
              </div>
              <button onClick={() => setEditFormData(f => f ? { ...f, items: f.items.filter((_, j) => j !== i) } : f)}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 7, cursor: 'pointer', marginBottom: 1 }}>
                <X size={12}/>
              </button>
            </div>
          ))}
          <button onClick={() => setEditFormData(f => f ? { ...f, items: [...f.items, { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }] } : f)}
            style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            <Plus size={12}/>상품 추가
          </button>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 16 }}>
            💡 저장 시 발주/입고 수량의 변동분이 상품관리 탭에 자동 반영됩니다.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditFormData(null) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장 및 상품 반영</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="발주 삭제 확인" size="sm">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Trash2 size={36} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
              {deleteTarget.order_date} 발주를 삭제하시겠습니까?
            </p>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              삭제 시 발주/입고 수량이 상품관리에서 차감됩니다.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={saving}
              style={{ background: '#dc2626', borderColor: '#dc2626', opacity: saving ? 0.6 : 1 }}>
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
      <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 14 }}>실제 입고된 수량을 입력하세요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {purchase.items.map((item, i) => {
          const remain = item.ordered - item.received
          return (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{item.product_code}</p>
                  {item.option_name && <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{item.option_name}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>발주 {item.ordered} / 기입고 {item.received}</p>
                  <p style={{ fontSize: 11.5, fontWeight: 800, color: '#f59e0b' }}>미입고 {remain}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>입고 수량</label>
                <Input type="number" value={qty[i]} min={0} max={remain}
                  onChange={e => setQty(prev => ({ ...prev, [i]: e.target.value }))}
                  style={{ fontWeight: 800, fontSize: 14 }}/>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(qty).map(([k, v]) => [Number(k), Number(v) || 0])))}>
          <CheckCircle2 size={13}/>입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
