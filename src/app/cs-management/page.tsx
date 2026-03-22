'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Plus, RotateCcw, RefreshCw,
  HeadphonesIcon, CheckCircle2, Clock, Search, FileUp, X,
  AlertTriangle, Image as ImageIcon, Trash2,
} from 'lucide-react'
import { loadShippedOrders, loadMappings, lookupMapping } from '@/lib/orders'

/* ─── 타입 ──────────────────────────────────────────────────────── */
type CsType   = 'return' | 'exchange'
type CsReason = 'simple_change' | 'defective'
type CsStatus = 'pending' | 'processed'

interface CsItem {
  id             : string
  type           : CsType
  mall           : string
  customer_name  : string
  option_image   : string
  product_abbr   : string
  option_name    : string
  barcode        : string
  quantity       : number
  reason         : CsReason
  tracking_number: string
  registered_at  : string
  status         : CsStatus
  processed_at  ?: string
}

/* ─── 로컬스토리지 헬퍼 ──────────────────────────────────────────── */
const CS_KEY = 'pm_cs_v1'
function loadCs(): CsItem[] {
  try { const r = localStorage.getItem(CS_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveCs(items: CsItem[]) {
  try { localStorage.setItem(CS_KEY, JSON.stringify(items)) } catch {}
}

/* ─── 상품 캐시 헬퍼 ─────────────────────────────────────────────── */
type CachedOption = {
  barcode?: string; name?: string; korean_name?: string
  image?: string; current_stock?: number; defective?: number
  [k: string]: unknown
}
type CachedProduct = { id: string; abbr?: string; options: CachedOption[] }

function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // { data: [...] } 형식 또는 직접 배열 모두 지원
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [])
    return arr as CachedProduct[]
  } catch { return [] }
}

function saveCachedProducts(products: CachedProduct[]) {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      localStorage.setItem('pm_products_cache_v1', JSON.stringify(products))
    } else {
      localStorage.setItem('pm_products_cache_v1', JSON.stringify({ ...parsed, data: products }))
    }
  } catch {}
}

/* ─── 상품캐시 기반 자동조회 ────────────────────────────────────── */
export type OptionSuggestion = {
  barcode: string; option_name: string; option_image: string; product_abbr: string
}

/** 바코드 → 상품약어 + 옵션명 + 이미지 (공백 제거 후 대소문자 무시) */
function lookupByBarcode(barcode: string): Omit<OptionSuggestion, 'barcode'> | null {
  const bc = barcode.trim()
  if (!bc) return null
  const products = loadCachedProducts()
  for (const p of products) {
    for (const o of p.options) {
      if ((o.barcode ?? '').trim() === bc) {
        return {
          product_abbr: p.abbr ?? '',
          option_name : String(o.korean_name ?? o.name ?? ''),
          option_image: String(o.image ?? ''),
        }
      }
    }
  }
  return null
}

/** 상품약어 → 전체 옵션 목록 (드롭다운용) */
function getOptionsByAbbr(abbr: string): OptionSuggestion[] {
  if (!abbr.trim()) return []
  const products = loadCachedProducts()
  const abbrLow  = abbr.trim().toLowerCase()
  const result: OptionSuggestion[] = []
  for (const p of products) {
    if (!(p.abbr ?? '').toLowerCase().startsWith(abbrLow)) continue
    for (const o of p.options) {
      result.push({
        barcode     : String(o.barcode ?? ''),
        option_name : String(o.korean_name ?? o.name ?? ''),
        option_image: String(o.image ?? ''),
        product_abbr: p.abbr ?? '',
      })
    }
  }
  return result
}

/** 약어 + 옵션명 → 바코드 + 이미지 */
function lookupByAbbrAndOption(abbr: string, optionName: string): Pick<OptionSuggestion, 'barcode' | 'option_image'> | null {
  const opts = getOptionsByAbbr(abbr)
  if (opts.length === 0) return null
  if (!optionName) return { barcode: opts[0].barcode, option_image: opts[0].option_image }
  const q   = optionName.trim().toLowerCase()
  const hit = opts.find(o => o.option_name.toLowerCase().includes(q))
  return hit ? { barcode: hit.barcode, option_image: hit.option_image } : null
}

/* ─── 출고내역 송장번호 조회 ─────────────────────────────────────── */
/**
 * 바코드 기준으로 출고내역에서 송장번호 조회.
 * mall / customerName 은 선택 필터 (입력된 경우에만 비교).
 */
function lookupTracking(barcode: string, mall?: string, customerName?: string): string {
  const bc = barcode.trim()
  if (!bc) return ''
  const shipped  = loadShippedOrders()
  const mappings = loadMappings()
  for (const order of shipped) {
    // 쇼핑몰 필터 (입력된 경우)
    if (mall && order.channel !== mall) continue
    // 수령인 필터 (입력된 경우)
    if (customerName) {
      const cn = customerName.trim()
      if (!order.customer_name.includes(cn) && !cn.includes(order.customer_name)) continue
    }
    for (const item of order.items) {
      const m         = lookupMapping(mappings, item.product_name ?? '', item.option)
      const itemBarcode = (m.barcode ?? item.sku ?? '').trim()
      if (itemBarcode === bc) return order.tracking_number ?? ''
    }
  }
  return ''
}

/* ─── 날짜 유틸 ──────────────────────────────────────────────────── */
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
function fmtDateTime(iso: string) {
  const d  = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}
function nowIso() { return new Date().toISOString() }

/* ─── 쇼핑몰 배지 색상 ──────────────────────────────────────────── */
const MALL_COLORS: Record<string, { color: string; bg: string }> = {
  '스마트스토어': { color: '#059669', bg: '#ecfdf5' },
  '쿠팡':        { color: '#f97316', bg: '#fff7ed' },
  '11번가':      { color: '#be123c', bg: '#fff1f2' },
  'G마켓':       { color: '#0284c7', bg: '#f0f9ff' },
  '옥션':        { color: '#7c3aed', bg: '#f5f3ff' },
  '카페24':      { color: '#7c3aed', bg: '#f5f3ff' },
  '지그재그':    { color: '#e11d48', bg: '#fff1f2' },
  '에이블리':    { color: '#db2777', bg: '#fdf2f8' },
  '올웨이즈':    { color: '#d97706', bg: '#fffbeb' },
  '토스쇼핑':    { color: '#4f46e5', bg: '#eef2ff' },
  '롯데온':      { color: '#dc2626', bg: '#fef2f2' },
  'SSG':         { color: '#c2410c', bg: '#fff7ed' },
}
const mallStyle = (mall: string) => MALL_COLORS[mall] ?? { color: '#64748b', bg: '#f8fafc' }

/* ─── 폼 초기값 ─────────────────────────────────────────────────── */
const EMPTY_FORM = {
  mall           : '',
  customer_name  : '',
  option_image   : '',
  product_abbr   : '',
  option_name    : '',
  barcode        : '',
  reason         : 'simple_change' as CsReason,
  tracking_number: '',
}
const EMPTY_QTY = 1

/* ════════════════════════════════════════════════════════════════ */
/*  메인 컴포넌트                                                   */
/* ════════════════════════════════════════════════════════════════ */
export default function CsManagementPage() {
  const curYM = getCurYM()

  const [items,      setItems]      = useState<CsItem[]>([])
  const [leftYM,     setLeftYM]     = useState(curYM)
  const [rightYM,    setRightYM]    = useState(curYM)
  const [leftSearch, setLeftSearch] = useState('')
  const [rightSearch,setRightSearch]= useState('')

  /* 등록 모달 */
  const [modal,      setModal]      = useState<{ open: boolean; type: CsType; tab: 'direct' | 'file' } | null>(null)
  const [form,       setForm]       = useState({ ...EMPTY_FORM })
  const [formQty,    setFormQty]    = useState(EMPTY_QTY)
  const [saving,     setSaving]     = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const fileRef    = useRef<HTMLInputElement>(null)

  /* 드롭다운 */
  const [abbrSuggestions, setAbbrSuggestions] = useState<OptionSuggestion[]>([])
  const [showAbbrDrop,    setShowAbbrDrop]    = useState(false)
  const abbrDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setItems(loadCs()) }, [])

  /* ── 파생 목록 ── */
  const pending = useMemo(() => {
    let list = items.filter(i => i.status === 'pending' && i.registered_at.slice(0, 7) === leftYM)
    if (leftSearch) {
      const q = leftSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q)
      )
    }
    return list.slice().sort((a, b) => b.registered_at.localeCompare(a.registered_at))
  }, [items, leftYM, leftSearch])

  const processed = useMemo(() => {
    let list = items.filter(i => i.status === 'processed' && (i.processed_at ?? '').slice(0, 7) === rightYM)
    if (rightSearch) {
      const q = rightSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q)
      )
    }
    return list.slice().sort((a, b) => (b.processed_at ?? '').localeCompare(a.processed_at ?? ''))
  }, [items, rightYM, rightSearch])

  /* ── 모달 열기 ── */
  const openModal = (type: CsType) => {
    setForm({ ...EMPTY_FORM })
    setFormQty(EMPTY_QTY)
    setAbbrSuggestions([])
    setShowAbbrDrop(false)
    setModal({ open: true, type, tab: 'direct' })
  }

  /* ── 폼 기본 setter ── */
  const setF = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }))

  /* ── 바코드 변경 → 약어/옵션명/이미지 자동입력 ── */
  const handleBarcodeChange = (v: string) => {
    const found = lookupByBarcode(v)
    setForm(f => ({
      ...f,
      barcode      : v,
      product_abbr : found?.product_abbr || f.product_abbr,
      option_name  : found?.option_name  || f.option_name,
      option_image : found?.option_image || f.option_image,
    }))
  }

  /* ── 상품약어 변경 → 드롭다운 + 바코드/이미지 자동입력 ── */
  const handleAbbrChange = (v: string) => {
    const suggs = getOptionsByAbbr(v)
    setAbbrSuggestions(suggs)
    setShowAbbrDrop(suggs.length > 0)
    const found = lookupByAbbrAndOption(v, form.option_name)
    setForm(f => ({
      ...f,
      product_abbr: v,
      barcode      : found?.barcode       || f.barcode,
      option_image : found?.option_image  || f.option_image,
    }))
  }

  /* ── 옵션명 변경 → 바코드/이미지 자동입력 ── */
  const handleOptionNameChange = (v: string) => {
    const found = lookupByAbbrAndOption(form.product_abbr, v)
    setForm(f => ({
      ...f,
      option_name  : v,
      barcode      : found?.barcode       || f.barcode,
      option_image : found?.option_image  || f.option_image,
    }))
  }

  /* ── 드롭다운 선택 ── */
  const selectAbbrSuggestion = (s: OptionSuggestion) => {
    setForm(f => ({ ...f, product_abbr: s.product_abbr, option_name: s.option_name, barcode: s.barcode, option_image: s.option_image }))
    setShowAbbrDrop(false)
  }

  /* ── 자동 송장조회 (바코드 기준, 쇼핑몰/수령인은 선택 필터) ── */
  const autoLookupTracking = () => {
    if (!form.barcode) { alert('바코드를 먼저 입력해주세요.'); return }
    const tn = lookupTracking(
      form.barcode,
      form.mall       || undefined,
      form.customer_name || undefined,
    )
    if (tn) setForm(f => ({ ...f, tracking_number: tn }))
    else alert('출고내역에서 해당 바코드의 송장번호를 찾지 못했습니다.\n쇼핑몰·수령인을 함께 입력하면 더 정확하게 찾을 수 있습니다.')
  }

  /* ── 직접 등록 저장 ── */
  const handleDirectSave = () => {
    if (!form.mall || !form.customer_name || !form.barcode) {
      alert('쇼핑몰, 수령인, 바코드는 필수 입력입니다.')
      return
    }
    setSaving(true)
    const qty = Math.max(1, formQty || 1)
    const newItem: CsItem = {
      id: crypto.randomUUID(), type: modal!.type,
      mall: form.mall, customer_name: form.customer_name,
      option_image: form.option_image, product_abbr: form.product_abbr,
      option_name: form.option_name, barcode: form.barcode.trim(),
      quantity: qty, reason: form.reason,
      tracking_number: form.tracking_number,
      registered_at: nowIso(), status: 'pending',
    }
    const updated = [newItem, ...items]
    saveCs(updated); setItems(updated)
    setModal(null); setSaving(false)
  }

  /* ── 파일 등록 ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
        const newItems: CsItem[] = rows.map(r => ({
          id: crypto.randomUUID(), type: modal!.type,
          mall: String(r['쇼핑몰'] ?? ''),
          customer_name: String(r['수령인'] ?? r['주문자'] ?? ''),
          option_image: String(r['옵션이미지'] ?? ''),
          product_abbr: String(r['상품약어'] ?? ''),
          option_name: String(r['옵션명'] ?? ''),
          barcode: String(r['바코드'] ?? '').trim(),
          quantity: Number(r['수량']) || 1,
          reason: (r['구분'] === '불량' ? 'defective' : 'simple_change') as CsReason,
          tracking_number: String(r['송장번호'] ?? ''),
          registered_at: nowIso(), status: 'pending',
        }))
        const updated = [...newItems, ...items]
        saveCs(updated); setItems(updated)
        alert(`${newItems.length}건이 등록되었습니다.`)
        setModal(null)
      } catch { alert('파일 형식이 올바르지 않습니다.') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 처리완료 ── */
  const handleProcess = async (item: CsItem) => {
    if (processing) return
    setProcessing(item.id)
    const qty = item.quantity ?? 1
    try {
      const products = loadCachedProducts()
      let found = false
      const updatedProducts = products.map(p => ({
        ...p,
        options: p.options.map(o => {
          if ((o.barcode ?? '').trim() !== item.barcode.trim()) return o
          found = true
          if (item.reason === 'simple_change') {
            return { ...o, current_stock: (typeof o.current_stock === 'number' ? o.current_stock : 0) + qty }
          } else {
            return { ...o, defective: (typeof o.defective === 'number' ? o.defective : 0) + qty }
          }
        }),
      }))

      if (found) {
        saveCachedProducts(updatedProducts)
        const changedIds = new Set(
          updatedProducts
            .filter(p => p.options.some((o, i) => {
              const orig = products.find(pp => pp.id === p.id)?.options[i]
              return orig && (o.current_stock !== orig.current_stock || o.defective !== orig.defective)
            }))
            .map(p => p.id)
        )
        await Promise.all([...changedIds].map(id => {
          const p = updatedProducts.find(pp => pp.id === id)!
          return fetch('/api/pm-products', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, options: p.options }),
          })
        }))
      }

      const updated = items.map(i =>
        i.id === item.id ? { ...i, status: 'processed' as CsStatus, processed_at: nowIso() } : i
      )
      saveCs(updated); setItems(updated)
    } finally { setProcessing(null) }
  }

  /* ── 삭제 ── */
  const handleDelete = (id: string, label: string) => {
    if (!confirm(`[${label}] 항목을 삭제하시겠습니까?`)) return
    const updated = items.filter(i => i.id !== id)
    saveCs(updated); setItems(updated)
  }

  /* ── 엑셀 템플릿 다운로드 ── */
  const handleDownloadTemplate = () => {
    const rows = [{ 쇼핑몰: '', 수령인: '', 옵션이미지: '', 상품약어: '', 옵션명: '', 바코드: '', 수량: 1, 구분: '단순변심', 송장번호: '' }]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CS접수')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'CS접수_템플릿.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  /* ════ 그리드 컬럼 ════ */
  const GRID_LEFT  = '38px 72px 1fr 42px 1.2fr 104px 32px 62px 66px 58px'
  const GRID_RIGHT = '38px 72px 1fr 42px 1.2fr 104px 32px 62px 78px 58px'
  const HDRS_LEFT  = ['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '바코드', '수량', '사유', '', '']
  const HDRS_RIGHT = ['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '바코드', '수량', '사유', '처리일시', '']

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100vh - 72px)', minHeight: 0 }}>

      {/* ══════ 좌측: CS접수 ══════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 헤더 카드 */}
        <div className="pm-card" style={{ padding: '12px 16px', marginBottom: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HeadphonesIcon size={16} style={{ color: '#2563eb' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>CS접수</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                {pending.length}건
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => openModal('return')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <RotateCcw size={13} /> 반품등록
            </button>
            <button onClick={() => openModal('exchange')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <RefreshCw size={13} /> 교환등록
            </button>
          </div>
          {/* 월 네비 + 검색 */}
          <MonthNav ym={leftYM} curYM={curYM} onChange={setLeftYM} accentColor="#2563eb" accentBg="#eff6ff">
            <SearchBox value={leftSearch} onChange={setLeftSearch} />
          </MonthNav>
        </div>

        {/* 목록 카드 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <GridHeader cols={GRID_LEFT} headers={HDRS_LEFT} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pending.length === 0 ? (
              <EmptyState icon={<HeadphonesIcon size={32} />} text={`${leftYM.replace('-', '년 ')}월 접수된 CS가 없습니다`} />
            ) : pending.map(item => {
              const ms     = mallStyle(item.mall)
              const isProc = processing === item.id
              const qty    = item.quantity ?? 1
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: GRID_LEFT, gap: 5, padding: '8px 10px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                  <TypeBadge type={item.type} />
                  <MallBadge mall={item.mall} style={ms} />
                  <CustomerCell name={item.customer_name} date={item.registered_at} />
                  <ImageCell src={item.option_image} />
                  <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  <BarcodeCell barcode={item.barcode} />
                  {/* 수량 */}
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>{qty}</span>
                  <ReasonBadge reason={item.reason} />
                  {/* 처리완료 */}
                  <button onClick={() => handleProcess(item)} disabled={!!processing}
                    style={{ padding: '4px 6px', background: isProc ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: isProc ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {isProc ? '처리중' : '처리완료'}
                  </button>
                  {/* 삭제 */}
                  <button onClick={() => handleDelete(item.id, `${item.customer_name} / ${item.barcode}`)}
                    title="삭제"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 7px', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff1f2')}>
                    <Trash2 size={11} /> 삭제
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══════ 우측: CS처리현황 ═══════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* 헤더 카드 */}
        <div className="pm-card" style={{ padding: '12px 16px', marginBottom: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} style={{ color: '#059669' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>CS처리현황</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{processed.length}건</span>
          </div>
          <MonthNav ym={rightYM} curYM={curYM} onChange={setRightYM} accentColor="#059669" accentBg="#f0fdf4">
            <SearchBox value={rightSearch} onChange={setRightSearch} />
          </MonthNav>
        </div>

        {/* 목록 카드 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <GridHeader cols={GRID_RIGHT} headers={HDRS_RIGHT} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {processed.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={32} />} text={`${rightYM.replace('-', '년 ')}월 처리된 CS가 없습니다`} />
            ) : processed.map(item => {
              const ms  = mallStyle(item.mall)
              const qty = item.quantity ?? 1
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: GRID_RIGHT, gap: 5, padding: '8px 10px', borderBottom: '1px solid #f8fafc', alignItems: 'center', background: '#fafffe' }}>
                  <TypeBadge type={item.type} />
                  <MallBadge mall={item.mall} style={ms} />
                  <CustomerCell name={item.customer_name} date={item.registered_at} />
                  <ImageCell src={item.option_image} />
                  <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  <BarcodeCell barcode={item.barcode} />
                  {/* 수량 */}
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>{qty}</span>
                  <ReasonBadge reason={item.reason} />
                  {/* 처리일시 + 재고/불량 표기 */}
                  <div>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#059669' }}>
                      ✓ {fmtDateTime(item.processed_at ?? '')}
                    </span>
                    {item.reason === 'simple_change' && (
                      <p style={{ fontSize: 9, color: '#0284c7', marginTop: 1 }}>재고+{qty}</p>
                    )}
                    {item.reason === 'defective' && (
                      <p style={{ fontSize: 9, color: '#c2410c', marginTop: 1 }}>불량+{qty}</p>
                    )}
                  </div>
                  {/* 삭제 */}
                  <button onClick={() => handleDelete(item.id, `${item.customer_name} / ${item.barcode}`)}
                    title="삭제"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 7px', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff1f2')}>
                    <Trash2 size={11} /> 삭제
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ══════ 등록 모달 ══════════════════════════════════════════════ */}
      {modal?.open && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="pm-card animate-scale-in" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: modal.type === 'return' ? '#fff1f2' : '#f5f3ff' }}>
                {modal.type === 'return' ? <RotateCcw size={15} style={{ color: '#dc2626' }} /> : <RefreshCw size={15} style={{ color: '#7c3aed' }} />}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>{modal.type === 'return' ? '반품' : '교환'} 등록</p>
                <p style={{ fontSize: 11, color: '#94a3b8' }}>등록 방식을 선택하세요</p>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setModal(null)}
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#64748b' }} />
              </button>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {(['direct', 'file'] as const).map(t => (
                <button key={t} onClick={() => setModal(m => m ? { ...m, tab: t } : m)}
                  style={{ flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, background: modal.tab === t ? '#fff' : '#f8fafc', color: modal.tab === t ? '#0f172a' : '#94a3b8', borderBottom: modal.tab === t ? '2px solid #2563eb' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {t === 'direct' ? <><Plus size={13} />직접등록</> : <><FileUp size={13} />파일등록</>}
                </button>
              ))}
            </div>

            {/* ── 직접등록 폼 ── */}
            {modal.tab === 'direct' && (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gap: 12 }}>

                  {/* 쇼핑몰 */}
                  <div>
                    <label style={labelStyle}>쇼핑몰 <Req /></label>
                    <select value={form.mall} onChange={e => setF('mall', e.target.value)} className="pm-input pm-select" style={{ fontSize: 13 }}>
                      <option value="">쇼핑몰 선택</option>
                      {['스마트스토어', '쿠팡', '11번가', 'G마켓', '옥션', '카페24', '지그재그', '에이블리', '올웨이즈', '토스쇼핑', '롯데온', 'SSG', '기타'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* 주문자(수령인) */}
                  <div>
                    <label style={labelStyle}>주문자(수령인) <Req /></label>
                    <input value={form.customer_name} onChange={e => setF('customer_name', e.target.value)} placeholder="수령인 이름" className="pm-input" />
                  </div>

                  {/* 바코드 → 자동입력 */}
                  <div>
                    <label style={labelStyle}>
                      바코드 <Req />
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>입력 시 약어/옵션명/이미지 자동입력</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={form.barcode} onChange={e => handleBarcodeChange(e.target.value)} placeholder="바코드 번호" className="pm-input" style={{ flex: 1 }} />
                      <button onClick={autoLookupTracking} type="button" title="출고내역에서 송장번호 자동 조회"
                        style={{ padding: '0 12px', height: 36, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11.5, fontWeight: 800, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                        <Search size={12} /> 송장조회
                      </button>
                    </div>
                  </div>

                  {/* 상품약어 + 옵션명 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ position: 'relative' }} ref={abbrDropRef}>
                      <label style={labelStyle}>상품약어 <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>→ 바코드 자동</span></label>
                      <input value={form.product_abbr} onChange={e => handleAbbrChange(e.target.value)}
                        onBlur={() => setTimeout(() => setShowAbbrDrop(false), 150)}
                        onFocus={() => { if (abbrSuggestions.length > 0) setShowAbbrDrop(true) }}
                        placeholder="예: BLK-MT" className="pm-input" autoComplete="off" />
                      {showAbbrDrop && abbrSuggestions.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 3, maxHeight: 200, overflowY: 'auto' }}>
                          {abbrSuggestions.map((s, i) => (
                            <div key={i} onMouseDown={() => selectAbbrSuggestion(s)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              {s.option_image
                                ? <img src={s.option_image} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} />
                                : <div style={{ width: 28, height: 28, borderRadius: 5, background: '#f1f5f9', flexShrink: 0 }} />
                              }
                              <div style={{ overflow: 'hidden', flex: 1 }}>
                                <p style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.option_name || '(옵션명 없음)'}</p>
                                <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{s.barcode}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>옵션명 <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>→ 바코드 자동</span></label>
                      <input value={form.option_name} onChange={e => handleOptionNameChange(e.target.value)} placeholder="예: 블랙/FREE" className="pm-input" />
                    </div>
                  </div>

                  {/* 옵션이미지 */}
                  <div>
                    <label style={labelStyle}>옵션이미지 URL <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>(바코드 입력 시 자동입력)</span></label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input value={form.option_image} onChange={e => setF('option_image', e.target.value)} placeholder="https://..." className="pm-input" style={{ flex: 1 }} />
                      {form.option_image && (
                        <img src={form.option_image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                  </div>

                  {/* 구분 */}
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>구분 <Req /></label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['simple_change', 'defective'] as CsReason[]).map(r => (
                        <div key={r} onClick={() => setF('reason', r)}
                          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${form.reason === r ? (r === 'defective' ? '#f97316' : '#2563eb') : '#e2e8f0'}`, background: form.reason === r ? (r === 'defective' ? '#fff7ed' : '#eff6ff') : '#fff', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 120ms' }}>
                          {r === 'defective' ? <AlertTriangle size={14} style={{ color: '#f97316', flexShrink: 0 }} /> : <Clock size={14} style={{ color: '#2563eb', flexShrink: 0 }} />}
                          <div>
                            <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>{r === 'defective' ? '불량' : '단순변심'}</p>
                            <p style={{ fontSize: 10, color: '#94a3b8' }}>{r === 'defective' ? '불량수량 +N 처리' : '재고수량 +N 복원'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 수량 */}
                  <div>
                    <label style={labelStyle}>
                      {modal.type === 'return' ? '반품' : '교환'}수량 <Req />
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>처리완료 시 해당 수량만큼 재고/불량 반영</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setFormQty(q => Math.max(1, q - 1))}
                        style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <input
                        type="number" min={1} value={formQty}
                        onChange={e => setFormQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 72, height: 36, textAlign: 'center', fontSize: 16, fontWeight: 900, border: '1.5px solid #e2e8f0', borderRadius: 9, outline: 'none', color: '#0f172a' }}
                      />
                      <button onClick={() => setFormQty(q => q + 1)}
                        style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>개</span>
                    </div>
                  </div>

                  {/* 송장번호 */}
                  <div>
                    <label style={labelStyle}>
                      송장번호
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>(출고내역에서 자동조회 가능)</span>
                    </label>
                    <input value={form.tracking_number} onChange={e => setF('tracking_number', e.target.value)} placeholder="운송장번호" className="pm-input" />
                  </div>
                </div>

                {/* 저장 버튼 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setModal(null)}
                    style={{ flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    취소
                  </button>
                  <button onClick={handleDirectSave} disabled={saving}
                    style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', background: modal.type === 'return' ? '#dc2626' : '#7c3aed', color: '#fff' }}>
                    {saving ? '저장중...' : `${modal.type === 'return' ? '반품' : '교환'} ${formQty}개 접수 등록`}
                  </button>
                </div>
              </div>
            )}

            {/* ── 파일등록 탭 ── */}
            {modal.tab === 'file' && (
              <div style={{ padding: '24px 20px' }}>
                <div style={{ background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 14, padding: '32px 24px', textAlign: 'center', marginBottom: 20 }}>
                  <FileUp size={32} style={{ margin: '0 auto 12px', color: '#94a3b8', display: 'block' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: '#334155', marginBottom: 6 }}>엑셀 파일을 업로드하세요</p>
                  <p style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 16 }}>쇼핑몰, 수령인, 상품약어, 옵션명, 바코드, 수량, 구분, 송장번호</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={handleDownloadTemplate}
                      style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      템플릿 다운로드
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                      파일 선택
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
                <div className="pm-card" style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', marginBottom: 10 }}>📋 엑셀 컬럼 형식</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['쇼핑몰', '스마트스토어, 쿠팡 등'], ['수령인', '주문자 또는 수령인'],
                      ['옵션이미지', '이미지 URL (선택)'],  ['상품약어', '상품 약어코드'],
                      ['옵션명', '예: 블랙/FREE'],          ['바코드', '바코드 번호'],
                      ['수량', '숫자 (기본값 1)'],          ['구분', '단순변심 또는 불량'],
                      ['송장번호', '운송장번호'],
                    ].map(([col, desc]) => (
                      <div key={col} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: 5, flexShrink: 0 }}>{col}</span>
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => setModal(null)}
                  style={{ width: '100%', marginTop: 16, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 서브 컴포넌트 ──────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }
const Req = () => <span style={{ color: '#dc2626' }}>*</span>

function MonthNav({ ym, curYM, onChange, accentColor, accentBg, children }: {
  ym: string; curYM: string; onChange: (v: string) => void
  accentColor: string; accentBg: string; children?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(shiftMonth(ym, -1))}
        style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChevronLeft size={13} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 78, textAlign: 'center' }}>
        {ym.replace('-', '년 ')}월
      </span>
      <button onClick={() => onChange(shiftMonth(ym, 1))}
        style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChevronRight size={13} />
      </button>
      {ym !== curYM && (
        <button onClick={() => onChange(curYM)}
          style={{ padding: '3px 9px', borderRadius: 6, border: `1.5px solid ${accentColor}`, background: accentBg, color: accentColor, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
          이번달
        </button>
      )}
      <div style={{ flex: 1 }} />
      {children}
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="검색..."
        style={{ paddingLeft: 26, height: 28, fontSize: 12, fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 7, outline: 'none', width: 130 }} />
    </div>
  )
}

function GridHeader({ cols, headers }: { cols: string; headers: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 5, padding: '7px 10px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
      {headers.map((h, i) => (
        <span key={i} style={{ fontSize: 9.5, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
      ))}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ margin: '0 auto 12px', opacity: 0.15, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{text}</p>
    </div>
  )
}

function TypeBadge({ type }: { type: CsType }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 4px', borderRadius: 4, color: type === 'return' ? '#dc2626' : '#7c3aed', background: type === 'return' ? '#fff1f2' : '#f5f3ff', whiteSpace: 'nowrap' }}>
      {type === 'return' ? '반품' : '교환'}
    </span>
  )
}

function MallBadge({ mall, style }: { mall: string; style: { color: string; bg: string } }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 5, color: style.color, background: style.bg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
      {mall || '-'}
    </span>
  )
}

function CustomerCell({ name, date }: { name: string; date: string }) {
  return (
    <div style={{ overflow: 'hidden' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
      <p style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>{fmtDateTime(date)}</p>
    </div>
  )
}

function ImageCell({ src }: { src: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {src ? (
        <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: 5, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageIcon size={12} style={{ color: '#cbd5e1' }} />
        </div>
      )}
    </div>
  )
}

function AbbrOptionCell({ abbr, option }: { abbr: string; option: string }) {
  return (
    <div style={{ overflow: 'hidden' }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbr || '-'}</p>
      <p style={{ fontSize: 9.5, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option || '-'}</p>
    </div>
  )
}

function BarcodeCell({ barcode }: { barcode: string }) {
  return (
    <span style={{ fontSize: 9.5, fontFamily: 'monospace', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
      {barcode || '-'}
    </span>
  )
}

function ReasonBadge({ reason }: { reason: CsReason }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 4px', borderRadius: 4, whiteSpace: 'nowrap', color: reason === 'defective' ? '#c2410c' : '#0369a1', background: reason === 'defective' ? '#fff7ed' : '#f0f9ff' }}>
      {reason === 'defective' ? '불량' : '단순변심'}
    </span>
  )
}
