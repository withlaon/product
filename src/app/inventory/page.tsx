'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShieldAlert, RefreshCw, Package, FileDown, Pencil, Trash2, Check, X } from 'lucide-react'

type TxType = 'in' | 'out' | 'defective' | 'adjust'
interface TxRecord {
  id: string
  date: string
  type: TxType
  product_code: string
  product_name: string
  option_name: string
  barcode: string
  qty: number
  note: string
}

interface PmOption {
  name: string
  chinese_name: string
  barcode: string
  image: string
  ordered: number
  received: number
  sold: number
  current_stock?: number
  defective?: number
  korean_name?: string
}
interface PmProduct {
  id: string
  code: string
  name: string
  abbr?: string
  category: string
  options: PmOption[]
}

const TX_KEY = 'pm_inv_tx_v1'
const SHARED_CACHE_KEY = 'pm_products_cache_v1'

function loadTx(): TxRecord[] {
  try {
    const r = localStorage.getItem(TX_KEY)
    return r ? JSON.parse(r) : []
  } catch {
    return []
  }
}
function saveTx(tx: TxRecord[]) {
  try {
    localStorage.setItem(TX_KEY, JSON.stringify(tx))
  } catch { /* ignore */ }
}

function getStock(o: PmOption) {
  return o.current_stock !== undefined ? o.current_stock : Math.max(0, o.received - (o.sold || 0))
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

function getThisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function InventoryPage() {
  const [products, setProducts] = useState<PmProduct[]>([])
  const [txList, setTxList] = useState<TxRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [bcInput, setBcInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [optInput, setOptInput] = useState('')
  const [qtyInput, setQtyInput] = useState('1')
  const [noteInput, setNoteInput] = useState('')
  const [syncFlag, setSyncFlag] = useState(0)

  // 월별 검색
  const [filterMonth, setFilterMonth] = useState(getThisMonth())

  // 불량 이력 편집
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editNote, setEditNote] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null) // 처리 중인 tx.id

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('pm_products').select('id,code,name,abbr,category,options').order('code', { ascending: true })
    if (data) {
      setProducts(data as PmProduct[])
      // 상품관리 공유 캐시에는 쓰지 않음 (불량등록은 일부 필드만 조회하므로 기존 캐시 덮어쓰면 안 됨)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts, syncFlag])

  useEffect(() => {
    setTxList(loadTx())
  }, [])

  useEffect(() => {
    const onSync = () => setSyncFlag(f => f + 1)
    window.addEventListener('pm_products_cache_sync', onSync)
    return () => window.removeEventListener('pm_products_cache_sync', onSync)
  }, [])

  useEffect(() => {
    const onDel = (ev: Event) => {
      const e = ev as CustomEvent<{ barcodes: string[] }>
      const bcs = new Set((e.detail?.barcodes ?? []).map(String))
      if (bcs.size === 0) return
      setTxList(prev => {
        const next = prev.filter(t => !(t.type === 'defective' && t.barcode && bcs.has(t.barcode)))
        saveTx(next)
        return next
      })
    }
    window.addEventListener('pm_product_deleted', onDel as EventListener)
    return () => window.removeEventListener('pm_product_deleted', onDel as EventListener)
  }, [])

  const barcodeIndex = useMemo(() => {
    const m = new Map<string, { prod: PmProduct; opt: PmOption }>()
    for (const prod of products) {
      for (const opt of prod.options ?? []) {
        const bc = (opt.barcode ?? '').trim()
        if (bc) m.set(bc, { prod, opt })
      }
    }
    return m
  }, [products])

  const fillFromBarcode = useCallback(
    (bc: string) => {
      const row = barcodeIndex.get(bc.trim())
      if (!row) return
      setCodeInput(row.prod.code)
      setOptInput(row.opt.name)
    },
    [barcodeIndex],
  )

  const fillFromCodeOption = useCallback(
    (code: string, optName: string) => {
      const c = code.trim()
      const o = optName.trim()
      if (!c || !o) return
      const prod = products.find(p => p.code.trim() === c)
      if (!prod) return
      const opt = prod.options.find(
        x =>
          x.name.trim() === o ||
          (x.korean_name && x.korean_name.trim() === o) ||
          norm(x.name) === norm(o) ||
          (x.korean_name && norm(x.korean_name) === norm(o)),
      )
      if (!opt?.barcode) return
      setBcInput(opt.barcode)
    },
    [products],
  )

  const handleBarcodeInput = (v: string) => {
    setBcInput(v)
    const t = v.trim()
    if (t && barcodeIndex.has(t)) fillFromBarcode(t)
  }

  const handleCodeBlur = () => {
    if (codeInput.trim() && optInput.trim()) fillFromCodeOption(codeInput, optInput)
  }

  const handleOptBlur = () => {
    if (codeInput.trim() && optInput.trim()) fillFromCodeOption(codeInput, optInput)
  }

  const resolved = useMemo(() => {
    const t = bcInput.trim()
    if (t && barcodeIndex.has(t)) return barcodeIndex.get(t)!
    const c = codeInput.trim()
    const o = optInput.trim()
    if (!c || !o) return null
    const prod = products.find(p => p.code.trim() === c)
    if (!prod) return null
    const opt = prod.options.find(
      x =>
        x.name.trim() === o ||
        (x.korean_name && x.korean_name.trim() === o) ||
        norm(x.name) === norm(o) ||
        (x.korean_name && norm(x.korean_name) === norm(o)),
    )
    if (!opt) return null
    return { prod, opt }
  }, [bcInput, codeInput, optInput, products, barcodeIndex])

  const batchUpdateOptions = useCallback(
    async (updates: { prodId: string; optName: string; updater: (o: PmOption) => PmOption }[]) => {
      const grouped: Record<string, typeof updates> = {}
      for (const u of updates) {
        if (!grouped[u.prodId]) grouped[u.prodId] = []
        grouped[u.prodId].push(u)
      }
      await Promise.all(
        Object.entries(grouped).map(async ([prodId, items]) => {
          const prod = products.find(p => p.id === prodId)
          if (!prod) return
          let opts = [...prod.options]
          for (const { optName, updater } of items) {
            opts = opts.map(o => (o.name === optName ? updater(o) : o))
          }
          await supabase.from('pm_products').update({ options: opts }).eq('id', prodId)
          setProducts(prev => prev.map(p => (p.id === prodId ? { ...p, options: opts } : p)))
        }),
      )
    },
    [products],
  )

  const handleSubmit = async () => {
    const n = Number(qtyInput)
    if (!resolved || !n || n < 1) {
      alert('바코드·상품코드·옵션명을 확인하고 수량을 입력하세요.')
      return
    }
    const { prod, opt } = resolved
    setSaving(true)
    const itemBarcode = (opt.barcode || bcInput).trim()
    const record: TxRecord = {
      id: `${Date.now()}_${itemBarcode}_${Math.random()}`,
      date: new Date().toISOString(),
      type: 'defective',
      product_code: prod.code,
      product_name: prod.name,
      option_name: opt.name,
      barcode: itemBarcode,
      qty: -n,
      note: noteInput.trim() || '불량 등록',
    }
    await batchUpdateOptions([
      {
        prodId: prod.id,
        optName: opt.name,
        updater: o => ({
          ...o,
          current_stock: Math.max(0, getStock(o) - n),
          defective: (o.defective || 0) + n,
        }),
      },
    ])
    const updated = [...txList, record]
    setTxList(updated)
    saveTx(updated)
    setSaving(false)
    setQtyInput('1')
    setNoteInput('')
    // 상품관리탭 캐시 무효화 → 다른 탭에서 즉시 반영
    try {
      localStorage.removeItem(SHARED_CACHE_KEY)
      window.dispatchEvent(new CustomEvent('pm_products_cache_sync'))
    } catch { /* ignore */ }
    // DB에서 최신 데이터 재로드
    void loadProducts()
  }

  /* ── 불량 이력 삭제: 바코드 기준으로 defective 차감 + 재고 복구 ── */
  const handleDeleteTx = async (tx: TxRecord) => {
    if (!confirm(`이 불량 이력을 삭제하시겠습니까?\n수량 ${Math.abs(tx.qty)}개가 재고에 복구됩니다.`)) return
    setActionLoading(tx.id)
    const n = Math.abs(tx.qty)
    const entry = barcodeIndex.get(tx.barcode)
    if (entry) {
      await batchUpdateOptions([{
        prodId: entry.prod.id,
        optName: entry.opt.name,
        updater: o => ({
          ...o,
          current_stock: getStock(o) + n,
          defective: Math.max(0, (o.defective || 0) - n),
        }),
      }])
      try {
        localStorage.removeItem(SHARED_CACHE_KEY)
        window.dispatchEvent(new CustomEvent('pm_products_cache_sync'))
      } catch { /* ignore */ }
      void loadProducts()
    }
    const updated = txList.filter(t => t.id !== tx.id)
    setTxList(updated)
    saveTx(updated)
    setActionLoading(null)
  }

  /* ── 불량 이력 편집 시작 ── */
  const startEdit = (tx: TxRecord) => {
    setEditingId(tx.id)
    setEditQty(String(Math.abs(tx.qty)))
    setEditNote(tx.note)
  }

  /* ── 불량 이력 편집 저장: 수량 차이만큼 DB 보정 ── */
  const handleEditSave = async (tx: TxRecord) => {
    const newN = Number(editQty)
    if (!newN || newN < 1) { alert('수량을 올바르게 입력하세요.'); return }
    setActionLoading(tx.id)
    const oldN = Math.abs(tx.qty)
    const delta = newN - oldN // 양수 = 불량 증가, 음수 = 불량 감소
    const entry = barcodeIndex.get(tx.barcode)
    if (entry && delta !== 0) {
      await batchUpdateOptions([{
        prodId: entry.prod.id,
        optName: entry.opt.name,
        updater: o => ({
          ...o,
          current_stock: Math.max(0, getStock(o) - delta),
          defective: Math.max(0, (o.defective || 0) + delta),
        }),
      }])
      try {
        localStorage.removeItem(SHARED_CACHE_KEY)
        window.dispatchEvent(new CustomEvent('pm_products_cache_sync'))
      } catch { /* ignore */ }
      void loadProducts()
    }
    const updated = txList.map(t =>
      t.id === tx.id ? { ...t, qty: -newN, note: editNote.trim() || t.note } : t,
    )
    setTxList(updated)
    saveTx(updated)
    setEditingId(null)
    setActionLoading(null)
  }

  const defectTx = useMemo(
    () => txList.filter(t => t.type === 'defective').sort((a, b) => b.date.localeCompare(a.date)),
    [txList],
  )

  // 월별 필터링된 불량 이력
  const filteredDefectTx = useMemo(
    () => defectTx.filter(t => t.date.startsWith(filterMonth)),
    [defectTx, filterMonth],
  )

  const cumulativeRegistrations = useMemo(
    () => defectTx.reduce((s, t) => s + Math.abs(t.qty), 0),
    [defectTx],
  )

  const totalDefectiveInDb = useMemo(
    () => products.flatMap(p => p.options).reduce((s, o) => s + (o.defective || 0), 0),
    [products],
  )

  const metaByBarcode = useMemo(() => {
    const m: Record<string, { abbr: string; image: string }> = {}
    for (const p of products) {
      const ab = p.abbr ?? ''
      for (const o of p.options ?? []) {
        const b = (o.barcode ?? '').trim()
        if (b) m[b] = { abbr: ab, image: o.image || '' }
      }
    }
    return m
  }, [products])

  // 월별 엑셀 다운로드
  const handleExcelDownload = () => {
    if (filteredDefectTx.length === 0) {
      alert('해당 월에 불량 등록 내역이 없습니다.')
      return
    }
    const rows = filteredDefectTx.map(tx => {
      const meta = metaByBarcode[tx.barcode] ?? { abbr: '', image: '' }
      return {
        '일시': new Date(tx.date).toLocaleString('ko-KR'),
        '상품코드': tx.product_code,
        '상품약어': meta.abbr || '',
        '상품명': tx.product_name,
        '옵션명': tx.option_name,
        '바코드': tx.barcode,
        '수량': Math.abs(tx.qty),
        '비고': tx.note,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '불량등록이력')
    const [year, month] = filterMonth.split('-')
    XLSX.writeFile(wb, `불량등록이력_${year}년${month}월.xlsx`)
  }

  return (
    <div className="pm-page space-y-5" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="pm-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={20} color="#c2410c" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>불량등록</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>
              바코드만 입력하면 상품코드·옵션명이 채워지고, 상품코드·옵션명만 입력하면 바코드가 채워집니다. 등록 시 상품관리의{' '}
              <b style={{ color: '#c2410c' }}>불량·현재고</b>가 바코드 기준으로 즉시 반영됩니다.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadProducts()} style={{ marginLeft: 'auto' }}>
            <RefreshCw size={13} /> 새로고침
          </Button>
        </div>
      </div>

      <div className="pm-card" style={{ padding: '16px 18px' }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>불량 등록</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6 }}>바코드</label>
            <Input value={bcInput} onChange={e => handleBarcodeInput(e.target.value)} placeholder="스캔 또는 입력" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6 }}>상품코드</label>
            <Input value={codeInput} onChange={e => setCodeInput(e.target.value)} onBlur={handleCodeBlur} placeholder="예: ABC-01" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6 }}>옵션명</label>
            <Input value={optInput} onChange={e => setOptInput(e.target.value)} onBlur={handleOptBlur} placeholder="영문 옵션코드 또는 한글명" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6 }}>수량</label>
            <Input type="number" min={1} value={qtyInput} onChange={e => setQtyInput(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6 }}>비고 (선택)</label>
            <Input value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="메모" />
          </div>
        </div>
        {resolved ? (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: '#e2e8f0', flexShrink: 0 }}>
              {resolved.opt.image ? <img src={resolved.opt.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{resolved.prod.name}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                {resolved.prod.code} · {resolved.opt.name}
                {resolved.opt.barcode ? (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 900, color: '#000', letterSpacing: '0.02em' }}>{resolved.opt.barcode}</span>
                ) : null}
              </p>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginTop: 4 }}>현재고 {getStock(resolved.opt)} · 불량 {resolved.opt.defective ?? 0}</p>
            </div>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving || loading} style={{ background: '#ea580c', borderColor: '#ea580c' }}>
              <ShieldAlert size={14} /> {saving ? '처리 중...' : '불량 등록'}
            </Button>
          </div>
        ) : (
          <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>매칭되는 상품 옵션이 없습니다. 바코드 또는 상품코드·옵션명을 확인하세요.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="pm-card p-4">
          <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>등록 이력 합산 (기간 무관)</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: '#c2410c', marginTop: 4 }}>{cumulativeRegistrations.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600 }}>개</span></p>
        </div>
        <div className="pm-card p-4">
          <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>상품 DB 누적 불량 (옵션 불량수 합)</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: '#7c2d12', marginTop: 4 }}>{totalDefectiveInDb.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600 }}>개</span></p>
        </div>
      </div>

      <div className="pm-card overflow-hidden">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(15,23,42,0.07)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Package size={16} color="#64748b" />
          <span style={{ fontSize: 14, fontWeight: 900, color: '#1e293b' }}>불량 등록 이력</span>
          {/* 월별 검색 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>월 선택</label>
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              style={{
                fontSize: 12, fontWeight: 700, color: '#1e293b',
                border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '4px 8px',
                background: '#f8fafc', cursor: 'pointer', outline: 'none',
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
            {filteredDefectTx.length}건
            <span style={{ marginLeft: 6, fontSize: 11, color: '#cbd5e1' }}>/ 전체 {defectTx.length}건</span>
          </span>
          {/* 엑셀 다운로드 버튼 */}
          <button
            onClick={handleExcelDownload}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 800, color: '#059669',
              background: '#ecfdf5', border: '1.5px solid #6ee7b7',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            }}
          >
            <FileDown size={13} />
            엑셀 다운로드
          </button>
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</div>
          ) : filteredDefectTx.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ fontWeight: 700 }}>
                {filterMonth} 불량 등록 내역이 없습니다.
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  {['일시', '이미지', '상품코드', '상품약어', '상품명', '바코드', '수량', '비고', '작업'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 800, fontSize: 10, color: '#64748b', textAlign: h === '수량' ? 'right' : 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDefectTx.map(tx => {
                  const meta = metaByBarcode[tx.barcode] ?? { abbr: '', image: '' }
                  const qty = Math.abs(tx.qty)
                  const isEditing = editingId === tx.id
                  const isBusy = actionLoading === tx.id
                  return (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : undefined }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748b', fontSize: 11 }}>{new Date(tx.date).toLocaleString('ko-KR')}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9' }}>
                          {meta.image ? <img src={meta.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0f172a' }}>{tx.product_code}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 900, color: '#7e22ce', fontSize: 11 }}>{meta.abbr || '—'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#334155', maxWidth: 200 }}>{tx.product_name}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: 900, color: '#000', letterSpacing: '0.02em' }}>{tx.barcode || '—'}</td>
                      {/* 수량 셀: 편집 중이면 입력 필드 */}
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            type="number" min={1} value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            style={{ width: 64, textAlign: 'right', fontWeight: 900, fontSize: 13, border: '1.5px solid #f97316', borderRadius: 6, padding: '2px 6px', outline: 'none' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 900, color: '#c2410c' }}>{qty.toLocaleString()}</span>
                        )}
                      </td>
                      {/* 비고 셀: 편집 중이면 입력 필드 */}
                      <td style={{ padding: '8px 10px' }}>
                        {isEditing ? (
                          <input
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            style={{ width: 120, fontSize: 12, border: '1.5px solid #f97316', borderRadius: 6, padding: '2px 6px', outline: 'none' }}
                          />
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>{tx.note}</span>
                        )}
                      </td>
                      {/* 작업 버튼 */}
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => void handleEditSave(tx)}
                              disabled={isBusy}
                              title="저장"
                              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: isBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800 }}
                            >
                              <Check size={12} /> 저장
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              disabled={isBusy}
                              title="취소"
                              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#e2e8f0', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 800 }}
                            >
                              <X size={12} /> 취소
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => startEdit(tx)}
                              disabled={!!actionLoading}
                              title="편집"
                              style={{ padding: '4px 7px', borderRadius: 6, border: 'none', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => void handleDeleteTx(tx)}
                              disabled={isBusy || !!actionLoading}
                              title="삭제"
                              style={{ padding: '4px 7px', borderRadius: 6, border: 'none', background: '#fff1f2', color: '#e11d48', cursor: isBusy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              {isBusy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
