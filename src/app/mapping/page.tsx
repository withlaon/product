'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, RefreshCw, Link2, Trash2, CheckCircle2, AlertCircle, FileSpreadsheet, X, Search, Store, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'

const CHANNEL_STORAGE_KEY = 'pm_mall_channels_v5'

interface MappedRow {
  mall_product_id: string
  mall_product_name: string
  mall_option: string
  matched_product_id: string | null
  matched_product_name: string | null
  matched_option: string | null
  matched_barcode: string | null
  mall_price: number | null   // 쇼핑몰 판매가
  status: 'matched' | 'unmatched'
}

interface PmOption { name: string; barcode: string }
interface PmProduct { id: string; code: string; name: string; category: string; options: PmOption[] }

const MAPPING_KEY = 'pm_channel_mappings_v2'

function loadMappings(): Record<string, MappedRow[]> {
  try {
    const r = localStorage.getItem(MAPPING_KEY)
    if (!r) return {}
    const data = JSON.parse(r)
    // mall_price 필드 없는 기존 데이터 마이그레이션
    for (const key of Object.keys(data)) {
      data[key] = data[key].map((row: MappedRow) => ({ ...row, mall_price: row.mall_price ?? null }))
    }
    return data
  } catch { return {} }
}
function saveMappings(data: Record<string, MappedRow[]>) {
  localStorage.setItem(MAPPING_KEY, JSON.stringify(data))
}

export default function MappingPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [connectedMalls, setConnectedMalls] = useState<{ key: string; name: string }[]>([])
  const [selectedMall, setSelectedMall] = useState('')
  const [products, setProducts] = useState<PmProduct[]>([])
  const [mappings, setMappings] = useState<Record<string, MappedRow[]>>({})
  const [importing, setImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // 체크박스 선택
  const [checkedIdxs, setCheckedIdxs] = useState<Set<number>>(new Set())
  // KPI 필터
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'unmatched'>('all')

  // 수동 매핑 모달
  const [manualTarget, setManualTarget] = useState<MappedRow | null>(null)
  const [manualTargetIdx, setManualTargetIdx] = useState(-1)
  const [manualSearch, setManualSearch] = useState('')
  const [manualSelProduct, setManualSelProduct] = useState('')
  const [manualSelOption, setManualSelOption] = useState('')
  const [manualPrice, setManualPrice] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHANNEL_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // ChannelData[] 배열 형식 (active:true 기준)
        const arr: { key: string; name: string; active: boolean }[] = Array.isArray(parsed) ? parsed : []
        const connected = arr
          .filter(c => c.active)
          .map(c => ({ key: c.key, name: c.name }))
        setConnectedMalls(connected)
        if (connected.length > 0) setSelectedMall(connected[0].key)
      }
    } catch { /* empty */ }

    supabase.from('pm_products').select('id,code,name,category,options').then(({ data }) => {
      if (data) setProducts(data as PmProduct[])
    })
    setMappings(loadMappings())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 상품관리탭에서 직접 매핑 시 localStorage 변경 감지 → 매핑 목록 갱신 ── */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MAPPING_KEY || e.key === 'pm_products_mapping_signal') {
        setMappings(loadMappings())
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setMappings(loadMappings())
      }
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const rows = mappings[selectedMall] || []
  const filtered = rows.filter(row => {
    const q = searchQuery.toLowerCase()
    const mSearch = !searchQuery || row.mall_product_name.toLowerCase().includes(q) || row.mall_option.toLowerCase().includes(q)
    const mStatus = statusFilter === 'all' || row.status === statusFilter
    return mSearch && mStatus
  })

  const stats = (mallKey: string) => {
    const r = mappings[mallKey] || []
    return { total: r.length, matched: r.filter(x => x.status === 'matched').length, unmatched: r.filter(x => x.status === 'unmatched').length }
  }

  // productCode: 엑셀 '상품코드' 컬럼값 (= pm_products.code)
  function autoMatch(mallId: string, mallName: string, productCode: string) {
    const codeLc = productCode.toLowerCase().trim()
    const idLc   = mallId.toLowerCase().trim()
    const nameLc = mallName.toLowerCase()

    const matchProduct = (p: PmProduct) => {
      if (p.options.length === 1) {
        const o = p.options[0]
        return { pid: p.id, pname: p.name, oname: o.name, barcode: o.barcode }
      }
      return { pid: p.id, pname: p.name, oname: null, barcode: null }
    }

    // 1순위: 엑셀 상품코드 컬럼이 pm_products.code와 정확히 일치
    if (codeLc) {
      for (const p of products) {
        if (!p.code) continue
        if (p.code.toLowerCase().trim() === codeLc) return matchProduct(p)
      }
    }

    // 2순위: 쇼핑몰 상품ID가 pm_products.code와 정확히 일치
    for (const p of products) {
      if (!p.code) continue
      if (p.code.toLowerCase().trim() === idLc) return matchProduct(p)
    }

    // 3순위: 쇼핑몰 상품ID 또는 상품명에 pm_products.code가 포함
    for (const p of products) {
      if (!p.code) continue
      const pCodeLc = p.code.toLowerCase().trim()
      if (idLc.includes(pCodeLc) || nameLc.includes(pCodeLc)) {
        return matchProduct(p)
      }
    }
    return null
  }

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['쇼핑몰상품ID', '쇼핑몰상품명', '상품코드', '판매가'],
      ['MALL_PROD_001', '예시상품명', 'ABC-001', '29900'],
    ])
    ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws, '매핑업로드')
    XLSX.writeFile(wb, '매핑업로드.xlsx')
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedMall) return
    setImporting(true)
    try {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const header = (raw[0] || []).map(h => String(h).trim().toLowerCase())
      const idxId   = header.findIndex(h => h.includes('상품id') || h.includes('상품id') || (h.includes('id') && !h.includes('상품코드')))
      const idxName = header.findIndex(h => h.includes('상품명') || h.includes('name'))
      const idxCode = header.findIndex(h => h.includes('상품코드') || h.includes('코드'))
      const idxPrice = header.findIndex(h => h.includes('판매가') || h.includes('price') || h.includes('가격'))

      const newRows: MappedRow[] = raw.slice(1).filter(r => r.some(c => c !== '')).map(r => {
        const mallId   = idxId   >= 0 ? String(r[idxId]).trim()   : String(r[0] ?? '').trim()
        const mallName = idxName >= 0 ? String(r[idxName]).trim() : String(r[1] ?? '').trim()
        const productCode = idxCode >= 0 ? String(r[idxCode]).trim() : ''
        const priceVal = idxPrice >= 0 ? Number(String(r[idxPrice]).replace(/[^0-9.]/g,'')) || null : null
        const m = autoMatch(mallId, mallName, productCode)
        return {
          mall_product_id: mallId,
          mall_product_name: mallName,
          mall_option: '',
          matched_product_id: m?.pid || null,
          matched_product_name: m?.pname || null,
          matched_option: m?.oname || null,
          matched_barcode: m?.barcode || null,
          mall_price: priceVal,
          status: m ? 'matched' : 'unmatched',
        }
      })
      const updated = { ...mappings, [selectedMall]: newRows }
      setMappings(updated); saveMappings(updated)

      // 자동 매핑된 상품에 쇼핑몰 등록현황 + 판매가 업데이트
      const mallName = connectedMalls.find(m => m.key === selectedMall)?.name || selectedMall
      const matched = newRows.filter(r => r.status === 'matched' && r.matched_product_id)
      for (const r of matched) {
        if (r.matched_product_id) {
          await updateRegisteredMalls(r.matched_product_id, mallName, r.mall_product_id)
          if (r.mall_price && r.mall_price > 0) {
            await updateChannelPrice(r.matched_product_id, mallName, r.mall_price)
          }
        }
      }
      if (matched.length > 0) {
        try { localStorage.removeItem('pm_products_cache_v1') } catch {}
        localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
      }
    } catch (err) { console.error(err) }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const openManual = (row: MappedRow, idx: number) => {
    setManualTarget(row); setManualTargetIdx(idx)
    setManualSearch(''); setManualSelProduct(''); setManualSelOption('')
    setManualPrice(row.mall_price ? String(row.mall_price) : '')
  }

  const updateChannelPrice = async (productId: string, mallName: string, price: number) => {
    try {
      const { data } = await supabase.from('pm_products').select('channel_prices').eq('id', productId).single()
      if (!data) return
      const current: { channel: string; price: number }[] = data.channel_prices ?? []
      const exists = current.find(cp => cp.channel === mallName)
      const updated = exists
        ? current.map(cp => cp.channel === mallName ? { ...cp, price } : cp)
        : [...current, { channel: mallName, price }]
      await supabase.from('pm_products').update({ channel_prices: updated }).eq('id', productId)
    } catch { /* 무시 */ }
  }

  const updateRegisteredMalls = async (productId: string, mallName: string, mallCode: string) => {
    try {
      const { data } = await supabase.from('pm_products').select('registered_malls').eq('id', productId).single()
      if (!data) return
      const current: (string | { mall: string; code: string })[] = data.registered_malls ?? []
      const hasMall = current.some(m => (typeof m === 'string' ? m === mallName : m.mall === mallName))
      if (hasMall) {
        const updated = current.map(m =>
          (typeof m === 'string' ? m === mallName : m.mall === mallName)
            ? { mall: mallName, code: mallCode }
            : m
        )
        await supabase.from('pm_products').update({ registered_malls: updated }).eq('id', productId)
      } else {
        await supabase.from('pm_products').update({
          registered_malls: [...current, { mall: mallName, code: mallCode }],
        }).eq('id', productId)
      }
    } catch { /* 무시 */ }
  }

  const handleManualSave = async () => {
    if (!manualTarget || manualTargetIdx < 0 || !manualSelProduct) return
    const prod = products.find(p => p.id === manualSelProduct)
    const opt = prod?.options.find(o => o.name === manualSelOption)
    const price = manualPrice ? Number(manualPrice) : null
    const newRows = [...rows]
    newRows[manualTargetIdx] = {
      ...newRows[manualTargetIdx],
      matched_product_id: prod?.id || null,
      matched_product_name: prod?.name || null,
      matched_option: opt?.name || null,
      matched_barcode: opt?.barcode || null,
      mall_price: price,
      status: prod ? 'matched' : 'unmatched',
    }
    const updated = { ...mappings, [selectedMall]: newRows }
    setMappings(updated); saveMappings(updated); setManualTarget(null)

    // 매핑된 상품에 쇼핑몰 등록현황 + 판매가 업데이트
    if (prod) {
      const mallName = connectedMalls.find(m => m.key === selectedMall)?.name || selectedMall
      await updateRegisteredMalls(prod.id, mallName, manualTarget?.mall_product_id || '')
      if (price && price > 0) await updateChannelPrice(prod.id, mallName, price)
      try { localStorage.removeItem('pm_products_cache_v1') } catch {}
      localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
    }
  }

  /* registered_malls에서 특정 쇼핑몰 제거 (매핑 삭제 시 동기화) */
  const removeRegisteredMall = async (productId: string, mallName: string) => {
    try {
      const { data } = await supabase.from('pm_products').select('registered_malls').eq('id', productId).single()
      if (!data) return
      const current: (string | { mall: string; code: string })[] = data.registered_malls ?? []
      const updated = current.filter(m => (typeof m === 'string' ? m !== mallName : m.mall !== mallName))
      await supabase.from('pm_products').update({ registered_malls: updated }).eq('id', productId)
    } catch { /* 무시 */ }
  }

  const handleDeleteRow = (idx: number) => {
    const row = rows[idx]
    const newRows = [...rows]; newRows.splice(idx, 1)
    const updated = { ...mappings, [selectedMall]: newRows }
    setMappings(updated); saveMappings(updated)
    setCheckedIdxs(new Set())
    // 해당 상품이 이 쇼핑몰로 더 이상 매핑되지 않으면 registered_malls에서 제거
    if (row.matched_product_id) {
      const mallName = connectedMalls.find(m => m.key === selectedMall)?.name || selectedMall
      const stillMapped = newRows.some(r => r.matched_product_id === row.matched_product_id && r.status === 'matched')
      if (!stillMapped) {
        removeRegisteredMall(row.matched_product_id, mallName)
        try { localStorage.removeItem('pm_products_cache_v1') } catch {}
        localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
      }
    }
  }

  const handleDeleteChecked = () => {
    if (checkedIdxs.size === 0) return
    if (!confirm(`선택한 ${checkedIdxs.size}개 항목을 삭제하시겠습니까?`)) return
    const mallName = connectedMalls.find(m => m.key === selectedMall)?.name || selectedMall
    const deletedRows = rows.filter((_, i) => checkedIdxs.has(i))
    const newRows = rows.filter((_, i) => !checkedIdxs.has(i))
    const updated = { ...mappings, [selectedMall]: newRows }
    setMappings(updated); saveMappings(updated)
    setCheckedIdxs(new Set())
    // 삭제된 행 중 이 쇼핑몰에서 더 이상 매핑되지 않는 상품의 registered_malls 정리
    const remainingIds = new Set(newRows.filter(r => r.status === 'matched').map(r => r.matched_product_id))
    deletedRows.forEach(row => {
      if (row.matched_product_id && !remainingIds.has(row.matched_product_id)) {
        removeRegisteredMall(row.matched_product_id, mallName)
      }
    })
    try { localStorage.removeItem('pm_products_cache_v1') } catch {}
    localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
  }

  const handleClearAll = () => {
    if (!confirm('현재 쇼핑몰의 매핑 데이터를 모두 삭제하고 등록현황도 초기화하시겠습니까?')) return
    const mallName = connectedMalls.find(m => m.key === selectedMall)?.name || selectedMall
    // 현재 매핑된 모든 상품의 registered_malls에서 이 쇼핑몰 제거
    const matchedIds = new Set(rows.filter(r => r.status === 'matched' && r.matched_product_id).map(r => r.matched_product_id!))
    matchedIds.forEach(pid => removeRegisteredMall(pid, mallName))
    const updated = { ...mappings }; delete updated[selectedMall]
    setMappings(updated); saveMappings(updated)
    setCheckedIdxs(new Set())
    try { localStorage.removeItem('pm_products_cache_v1') } catch {}
    localStorage.setItem('pm_products_mapping_signal', Date.now().toString())
  }

  const toggleCheck = (idx: number) => {
    setCheckedIdxs(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const toggleCheckAll = () => {
    if (checkedIdxs.size === filtered.length) {
      setCheckedIdxs(new Set())
    } else {
      setCheckedIdxs(new Set(filtered.map((row) => rows.indexOf(row))))
    }
  }

  const manualFiltered = products.filter(p => {
    if (!manualSearch) return true
    const q = manualSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  })

  const selectedMallName = connectedMalls.find(m => m.key === selectedMall)?.name || ''

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* ── 좌측 쇼핑몰 목록 ── */}
      <aside style={{
        width: 200, flexShrink: 0,
        background: 'white',
        borderRight: '1px solid #f1f5f9',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <p style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>연동 쇼핑몰</p>
        </div>

        {connectedMalls.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <Store size={28} color="#e2e8f0" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 700, lineHeight: 1.5 }}>연동된 쇼핑몰이<br />없습니다</p>
            <p style={{ fontSize: 11, color: '#e2e8f0', marginTop: 6 }}>쇼핑몰 관리에서<br />먼저 연동해주세요</p>
          </div>
        ) : (
          <nav style={{ padding: '8px 8px' }}>
            {connectedMalls.map(m => {
              const s = stats(m.key)
              const isActive = selectedMall === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => { setSelectedMall(m.key); setSearchQuery(''); setStatusFilter('all') }}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    borderRadius: 10, padding: '9px 10px', marginBottom: 3,
                    background: isActive ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'transparent',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${m.key}&sz=16`}
                      alt={m.name}
                      style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span style={{ fontSize: 12.5, fontWeight: isActive ? 900 : 700, color: isActive ? '#1d4ed8' : '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, background: isActive ? '#dbeafe' : '#f1f5f9', color: isActive ? '#1d4ed8' : '#64748b', padding: '1px 6px', borderRadius: 4 }}>
                      전체 {s.total}
                    </span>
                    {s.unmatched > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: '#fff1f2', color: '#be123c', padding: '1px 6px', borderRadius: 4 }}>
                        미매핑 {s.unmatched}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </nav>
        )}
      </aside>

      {/* ── 우측 매핑 내용 ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>

        {!selectedMall ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <Store size={48} color="#e2e8f0" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 800, color: '#94a3b8' }}>쇼핑몰을 선택해주세요</p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI + 컨트롤 바 */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              {/* 쇼핑몰명 + 통계 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>{selectedMallName}</h2>
                {([
                  { label: '전체',   value: stats(selectedMall).total,     color: '#2563eb', bg: '#eff6ff', activeBg: '#2563eb', key: 'all'       as const },
                  { label: '매핑완료', value: stats(selectedMall).matched,  color: '#059669', bg: '#ecfdf5', activeBg: '#059669', key: 'matched'   as const },
                  { label: '미매핑', value: stats(selectedMall).unmatched,  color: '#be123c', bg: '#fff1f2', activeBg: '#be123c', key: 'unmatched' as const },
                ]).map((k) => {
                  const isActive = statusFilter === k.key
                  return (
                    <button key={k.key}
                      onClick={() => setStatusFilter(isActive && k.key !== 'all' ? 'all' : k.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer',
                        background: isActive ? k.activeBg : k.bg,
                        padding: '5px 12px', borderRadius: 8,
                        transition: 'all 150ms',
                        boxShadow: isActive ? `0 2px 8px ${k.activeBg}50` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? 'white' : k.color }}>{k.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: isActive ? 'white' : k.color }}>{k.value}</span>
                    </button>
                  )
                })}
              </div>

              {/* 액션 바 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                {/* 검색 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', flex: 1, minWidth: 200 }}>
                  <Search size={13} color="#94a3b8" />
                  <input
                    placeholder="상품명 또는 옵션명 검색"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#334155', width: '100%' }}
                  />
                  {searchQuery && <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={12} /></button>}
                </div>

                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
                <button
                  onClick={handleDownloadTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#059669', border: '1.5px solid #bbf7d0', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  title="매핑업로드 양식 다운로드"
                >
                  <Download size={13} />업로드 양식다운
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                >
                  {importing ? <RefreshCw size={13} style={{ animation: 'spin-slow 0.7s linear infinite' }} /> : <Upload size={13} />}
                  엑셀 업로드
                </button>

                {checkedIdxs.size > 0 && (
                  <button
                    onClick={handleDeleteChecked}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff1f2', color: '#be123c', border: '1.5px solid #fecdd3', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />선택 삭제 ({checkedIdxs.size})
                  </button>
                )}
                {rows.length > 0 && checkedIdxs.size === 0 && (
                  <button
                    onClick={handleClearAll}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'white', color: '#be123c', border: '1.5px solid #fecdd3', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />전체 삭제
                  </button>
                )}
              </div>

              {/* 엑셀 안내 */}
              <div style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 14 }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#0369a1' }}>
                  📋 양식 다운로드 후 <strong>상품코드</strong> 컬럼에 등록상품 코드를 입력하면 자동 매핑됩니다. 상품코드가 없으면 쇼핑몰상품ID와 등록상품 코드를 비교하여 매핑합니다. 매핑 안 된 항목은 <strong>수동매핑</strong> 버튼으로 직접 연결할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 테이블 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <FileSpreadsheet size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#94a3b8' }}>
                      {rows.length === 0 ? '엑셀 파일을 업로드하면 자동으로 매핑됩니다' : '검색 결과가 없습니다'}
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <th style={{ padding: '9px 12px', width: 36 }}>
                            <input type="checkbox"
                              checked={filtered.length > 0 && checkedIdxs.size === filtered.length}
                              onChange={toggleCheckAll}
                              style={{ cursor:'pointer', width:14, height:14 }}
                            />
                          </th>
                          {['#', '쇼핑몰 상품ID', '쇼핑몰 상품명', '쇼핑몰 옵션', '매핑 상품명', '매핑 옵션', '바코드', '판매가', '상태', '관리'].map((h, i) => (
                            <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 900, color: '#94a3b8', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                          {filtered.map((row, idx) => {
                          const realIdx = rows.indexOf(row)
                          const isChecked = checkedIdxs.has(realIdx)
                          return (
                            <tr key={idx}
                              style={{ borderBottom: '1px solid #f8fafc', background: isChecked ? '#eff6ff' : 'transparent' }}
                              onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#fafbfc' }}
                              onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent' }}
                            >
                              <td style={{ padding: '9px 12px' }}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(realIdx)}
                                  style={{ cursor:'pointer', width:14, height:14 }} />
                              </td>
                              <td style={{ padding: '9px 12px', fontSize: 11.5, color: '#94a3b8', fontWeight: 700 }}>{realIdx + 1}</td>
                              <td style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', fontFamily: 'monospace' }}>{row.mall_product_id || '-'}</td>
                              <td style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 700, color: '#1e293b', maxWidth: 160 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mall_product_name}</span>
                              </td>
                              <td style={{ padding: '9px 12px', fontSize: 12, color: '#64748b', maxWidth: 120 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mall_option || '-'}</span>
                              </td>
                              <td style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 700, color: row.matched_product_name ? '#1e293b' : '#cbd5e1', maxWidth: 160 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.matched_product_name || <span style={{ color: '#cbd5e1' }}>미매핑</span>}
                                </span>
                              </td>
                              <td style={{ padding: '9px 12px', fontSize: 12, color: row.matched_option ? '#64748b' : '#e2e8f0' }}>{row.matched_option || '-'}</td>
                              <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: 'monospace', color: '#334155' }}>{row.matched_barcode || '-'}</td>
                              <td style={{ padding: '9px 12px' }}>
                                {row.mall_price ? (
                                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2563eb' }}>
                                    {row.mall_price.toLocaleString()}원
                                  </span>
                                ) : <span style={{ color: '#e2e8f0' }}>-</span>}
                              </td>
                              <td style={{ padding: '9px 12px' }}>
                                {row.status === 'matched' ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#ecfdf5', color: '#059669', fontSize: 10.5, fontWeight: 800, padding: '3px 7px', borderRadius: 6 }}>
                                    <CheckCircle2 size={10} />완료
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fff1f2', color: '#be123c', fontSize: 10.5, fontWeight: 800, padding: '3px 7px', borderRadius: 6 }}>
                                    <AlertCircle size={10} />미매핑
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '9px 12px' }}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => openManual(row, realIdx)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                                  ><Link2 size={10} />수동매핑</button>
                                  <button
                                    onClick={() => handleDeleteRow(realIdx)}
                                    style={{ display: 'flex', alignItems: 'center', background: '#fff1f2', color: '#be123c', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer' }}
                                  ><X size={11} /></button>
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
            </div>
          </>
        )}
      </div>

      {/* 수동 매핑 모달 */}
      <Modal isOpen={!!manualTarget} onClose={() => setManualTarget(null)} title="수동 매핑" size="md">
        {manualTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>쇼핑몰 상품</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{manualTarget.mall_product_name}</p>
              {manualTarget.mall_option && <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>옵션: {manualTarget.mall_option}</p>}
            </div>

            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>매핑할 상품 검색</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', marginBottom: 8 }}>
                <Search size={13} color="#94a3b8" />
                <input
                  placeholder="상품명 또는 코드"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: '#334155', flex: 1 }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: 8 }}>
                {manualFiltered.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>검색 결과 없음</div>
                ) : manualFiltered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setManualSelProduct(p.id); setManualSelOption('') }}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                      background: manualSelProduct === p.id ? '#eff6ff' : 'transparent',
                    }}
                    onMouseEnter={e => { if (manualSelProduct !== p.id) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (manualSelProduct !== p.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1e293b' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{p.code}</span>
                  </div>
                ))}
              </div>
            </div>

            {manualSelProduct && (() => {
              const prod = products.find(p => p.id === manualSelProduct)
              if (!prod || prod.options.length === 0) return null
              return (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>옵션 선택</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {prod.options.map((o, i) => (
                      <button key={i} onClick={() => setManualSelOption(o.name)} style={{
                        padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
                        borderColor: manualSelOption === o.name ? '#2563eb' : '#e2e8f0',
                        background: manualSelOption === o.name ? '#eff6ff' : 'white',
                        color: manualSelOption === o.name ? '#2563eb' : '#64748b',
                      }}>{o.name}</button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* 판매가 입력 */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>쇼핑몰 판매가 <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8' }}>(선택)</span></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 12px' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>₩</span>
                <input
                  type="number"
                  placeholder="0"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: '#1e293b', flex: 1 }}
                />
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>입력 시 상품관리 탭의 쇼핑몰판매가에도 자동 적용됩니다</p>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setManualTarget(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>취소</button>
              <button onClick={handleManualSave} disabled={!manualSelProduct} style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: manualSelProduct ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#e2e8f0',
                color: manualSelProduct ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 800,
                cursor: manualSelProduct ? 'pointer' : 'not-allowed',
              }}>매핑 저장</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
