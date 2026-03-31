'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  ChevronLeft, ChevronRight, Plus, RotateCcw, RefreshCw,
  HeadphonesIcon, CheckCircle2, Clock, Search, FileUp, X,
  AlertTriangle, Image as ImageIcon, Trash2,
} from 'lucide-react'
import { loadShippedOrders, loadMappings, lookupMapping } from '@/lib/orders'
import { broadcastDashboardRefresh } from '@/lib/dashboard-sync'

/* ─── 타입 ──────────────────────────────────────────────────────── */
type CsType   = 'return' | 'exchange'
type CsReason = 'simple_change' | 'defective'
type CsStatus = 'pending' | 'processed'

interface CsItem {
  id                    : string
  type                  : CsType
  mall                  : string
  customer_name         : string
  option_image          : string
  product_abbr          : string
  option_name           : string
  barcode               : string
  quantity              : number
  reason                : CsReason
  tracking_number       : string
  return_tracking_number?: string
  registered_at         : string
  status                : CsStatus
  processed_at         ?: string
  /** 교환: 회수(재고+), 교환 발송(재고-) — 다리별 처리(각각 처리완료 시각) */
  barcode_in                 ?: string
  barcode_out                ?: string
  option_image_out           ?: string
  product_abbr_out           ?: string
  option_name_out            ?: string
  /** 교환 발송(출고) 운송장 — 입고 행 `tracking_number`와 별도 */
  tracking_number_out        ?: string
  exchange_in_processed_at   ?: string
  exchange_out_processed_at  ?: string
}

/** 목록 표시: 교환은 교환입고·교환출고 각각 한 행 */
type CsListRow =
  | { kind: 'single'; item: CsItem }
  | { kind: 'exchange_leg'; item: CsItem; leg: 'in' | 'out' }

function exchangeAnyLegPending(item: CsItem): boolean {
  const bin = (item.barcode_in ?? item.barcode ?? '').trim()
  const bout = (item.barcode_out ?? '').trim()
  if (bin && !item.exchange_in_processed_at) return true
  if (bout && !item.exchange_out_processed_at) return true
  if (!bin && !bout && !item.exchange_in_processed_at) return true
  return false
}

function expandCsListRows(items: CsItem[], mode: 'pending' | 'processed', rightYM: string): CsListRow[] {
  const rows: CsListRow[] = []
  for (const item of items) {
    if (item.type !== 'exchange') {
      rows.push({ kind: 'single', item })
      continue
    }
    const bin = (item.barcode_in ?? item.barcode ?? '').trim()
    const bout = (item.barcode_out ?? '').trim()
    if (mode === 'pending') {
      if (bin && !item.exchange_in_processed_at) rows.push({ kind: 'exchange_leg', item, leg: 'in' })
      if (bout && !item.exchange_out_processed_at) rows.push({ kind: 'exchange_leg', item, leg: 'out' })
      if (!bin && !bout) rows.push({ kind: 'exchange_leg', item, leg: 'in' })
    } else {
      const inM = (item.exchange_in_processed_at ?? '').slice(0, 7) === rightYM
      const outM = (item.exchange_out_processed_at ?? '').slice(0, 7) === rightYM
      if (inM) rows.push({ kind: 'exchange_leg', item, leg: 'in' })
      if (outM) rows.push({ kind: 'exchange_leg', item, leg: 'out' })
    }
  }
  return rows
}

function migrateExchangeProcessedFields(i: CsItem): CsItem {
  if (i.type !== 'exchange') return i
  if (i.exchange_in_processed_at || i.exchange_out_processed_at) return i
  if (i.status !== 'processed' || !i.processed_at) return i
  const bin = (i.barcode_in ?? i.barcode ?? '').trim()
  const bout = (i.barcode_out ?? '').trim()
  if (bin && bout) {
    return { ...i, exchange_in_processed_at: i.processed_at, exchange_out_processed_at: i.processed_at }
  }
  if (bin) return { ...i, exchange_in_processed_at: i.processed_at }
  return i
}

function finalizeCsItemTimestamps(prev: CsItem, patch: Partial<CsItem>): CsItem {
  const n: CsItem = { ...prev, ...patch }
  if (n.type !== 'exchange') return n
  const bin = (n.barcode_in ?? n.barcode ?? '').trim()
  const bout = (n.barcode_out ?? '').trim()
  if (bin && bout && n.exchange_in_processed_at && n.exchange_out_processed_at) {
    const processed_at = n.exchange_in_processed_at > n.exchange_out_processed_at
      ? n.exchange_in_processed_at
      : n.exchange_out_processed_at
    return { ...n, status: 'processed', processed_at }
  }
  if (bin && !bout && n.exchange_in_processed_at) {
    return { ...n, status: 'processed', processed_at: n.exchange_in_processed_at }
  }
  return n
}

function csListRowKey(row: CsListRow): string {
  if (row.kind === 'single') return row.item.id
  return `${row.item.id}:${row.leg}`
}

/* ─── 로컬스토리지 헬퍼 ──────────────────────────────────────────── */
const CS_KEY = 'pm_cs_v1'
function loadCs(): CsItem[] {
  try { const r = localStorage.getItem(CS_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveCs(items: CsItem[]) {
  try { localStorage.setItem(CS_KEY, JSON.stringify(items)) } catch {}
  broadcastDashboardRefresh()
}

/* ─── 상품 캐시 헬퍼 ─────────────────────────────────────────────── */
type CachedOption = {
  barcode?: string; name?: string; korean_name?: string
  image?: string; current_stock?: number; defective?: number
  [k: string]: unknown
}
type CachedProduct = { id: string; abbr?: string; options: CachedOption[] }

const PM_IMG_CACHE_KEY = 'pm_product_images_v1'

function overlayOptionImage(productId: string, optIdx: number, base: string): string {
  const b = (base ?? '').trim()
  if (b) return b
  try {
    const raw = localStorage.getItem(PM_IMG_CACHE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { data?: Record<string, string[]> }
    const arr = parsed?.data?.[productId]
    if (Array.isArray(arr) && arr[optIdx] && String(arr[optIdx]).trim()) return String(arr[optIdx])
  } catch {}
  return ''
}

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
    const opts = p.options ?? []
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]
      if ((o.barcode ?? '').trim() === bc) {
        return {
          product_abbr: p.abbr ?? '',
          option_name : String(o.korean_name ?? o.name ?? ''),
          option_image: overlayOptionImage(String(p.id), i, String(o.image ?? '')),
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
    const opts = p.options ?? []
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i]
      result.push({
        barcode     : String(o.barcode ?? ''),
        option_name : String(o.korean_name ?? o.name ?? ''),
        option_image: overlayOptionImage(String(p.id), i, String(o.image ?? '')),
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
      const m = lookupMapping(mappings, item.product_name ?? '', item.option)
      // mapping 바코드 + item.sku 둘 다 체크 (출고내역 직접 수정된 바코드도 반영)
      const barcodes = [(m.barcode ?? '').trim(), (item.sku ?? '').trim()].filter(Boolean)
      if (barcodes.includes(bc)) return order.tracking_number ?? ''
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
  mall                  : '',
  customer_name         : '',
  option_image          : '',
  product_abbr          : '',
  option_name           : '',
  barcode               : '',
  barcode_in            : '',
  barcode_out           : '',
  product_abbr_out      : '',
  option_name_out       : '',
  option_image_out      : '',
  reason                : 'simple_change' as CsReason,
  tracking_number       : '',
  tracking_number_out   : '',
  return_tracking_number: '',
}
const EMPTY_QTY = 1

/* ════════════════════════════════════════════════════════════════ */
/*  메인 컴포넌트                                                   */
/* ════════════════════════════════════════════════════════════════ */
export default function CsManagementPage() {
  const curYM = getCurYM()

  const [items,      setItems]      = useState<CsItem[]>([])
  const [leftSearch, setLeftSearch] = useState('')
  const [rightYM,    setRightYM]    = useState(curYM)
  const [rightSearch,setRightSearch]= useState('')

  /* 등록 모달 */
  const [modal,      setModal]      = useState<{ open: boolean; type: CsType; tab: 'direct' | 'file' } | null>(null)
  const [form,       setForm]       = useState({ ...EMPTY_FORM })
  const [formQty,    setFormQty]    = useState(EMPTY_QTY)
  const [saving,     setSaving]     = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [editDraft,  setEditDraft]  = useState<CsItem | null>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const editBackdropRef = useRef(false)

  /* 드롭다운 */
  const [abbrSuggestions, setAbbrSuggestions] = useState<OptionSuggestion[]>([])
  const [showAbbrDrop,    setShowAbbrDrop]    = useState(false)
  const abbrDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = loadCs()
    const migrated = raw.map(migrateExchangeProcessedFields)
    setItems(migrated)
    try {
      if (JSON.stringify(raw) !== JSON.stringify(migrated)) saveCs(migrated)
    } catch { /* ignore */ }
  }, [])

  /* ── 옵션이미지/상품약어 누락 시 캐시에서 자동 보완 ── */
  const enrichedItems = useMemo(() => items.map(item => {
    let next = { ...item }
    if (item.type === 'exchange') {
      const bin = (item.barcode_in ?? item.barcode ?? '').trim()
      const bout = (item.barcode_out ?? '').trim()
      if (bin) {
        const fin = lookupByBarcode(bin)
        if (fin) {
          next = {
            ...next,
            option_image: next.option_image || fin.option_image,
            product_abbr: next.product_abbr || fin.product_abbr,
            option_name: next.option_name || fin.option_name,
          }
        }
      }
      if (bout) {
        const fout = lookupByBarcode(bout)
        if (fout) {
          next = {
            ...next,
            option_image_out: next.option_image_out || fout.option_image,
            product_abbr_out: next.product_abbr_out || fout.product_abbr,
            option_name_out: next.option_name_out || fout.option_name,
          }
        }
      }
      return next
    }
    if (item.option_image && item.product_abbr) return item
    const found = lookupByBarcode(item.barcode)
    if (!found) return item
    return {
      ...item,
      option_image: item.option_image || found.option_image,
      product_abbr: item.product_abbr || found.product_abbr,
      option_name : item.option_name  || found.option_name,
    }
  }), [items])

  /* ── 파생 목록 (교환은 입고·출고 행으로 펼침) ── */
  const pendingItems = useMemo(() => {
    let list = enrichedItems.filter(i =>
      i.type === 'return' ? i.status === 'pending' : exchangeAnyLegPending(i),
    )
    if (leftSearch) {
      const q = leftSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q) ||
        (i.barcode_in ?? '').includes(q) || (i.barcode_out ?? '').includes(q) ||
        (i.product_abbr_out ?? '').toLowerCase().includes(q)
      )
    }
    return list.slice().sort((a, b) => b.registered_at.localeCompare(a.registered_at))
  }, [enrichedItems, leftSearch])

  const pendingRows = useMemo(() => expandCsListRows(pendingItems, 'pending', rightYM), [pendingItems, rightYM])

  const processedItems = useMemo(() => {
    let list = enrichedItems.filter(i => {
      if (i.type === 'return') {
        return i.status === 'processed' && (i.processed_at ?? '').slice(0, 7) === rightYM
      }
      const inM = (i.exchange_in_processed_at ?? '').slice(0, 7) === rightYM
      const outM = (i.exchange_out_processed_at ?? '').slice(0, 7) === rightYM
      return inM || outM
    })
    if (rightSearch) {
      const q = rightSearch.toLowerCase()
      list = list.filter(i =>
        i.customer_name.includes(q) || i.product_abbr.toLowerCase().includes(q) ||
        i.barcode.includes(q) || i.option_name.toLowerCase().includes(q) || i.mall.includes(q) ||
        (i.barcode_in ?? '').includes(q) || (i.barcode_out ?? '').includes(q) ||
        (i.product_abbr_out ?? '').toLowerCase().includes(q)
      )
    }
    return list.slice().sort((a, b) => (b.processed_at ?? '').localeCompare(a.processed_at ?? ''))
  }, [enrichedItems, rightYM, rightSearch])

  const processedRows = useMemo(() => expandCsListRows(processedItems, 'processed', rightYM), [processedItems, rightYM])

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

  const handleExchangeInChange = (v: string) => {
    const found = lookupByBarcode(v)
    setForm(f => ({
      ...f,
      barcode_in   : v,
      barcode      : v,
      product_abbr : found?.product_abbr || f.product_abbr,
      option_name  : found?.option_name  || f.option_name,
      option_image : found?.option_image || f.option_image,
    }))
  }

  const handleExchangeOutChange = (v: string) => {
    const found = lookupByBarcode(v)
    setForm(f => ({
      ...f,
      barcode_out       : v,
      product_abbr_out  : found?.product_abbr ?? f.product_abbr_out,
      option_name_out   : found?.option_name ?? f.option_name_out,
      option_image_out  : found?.option_image ?? f.option_image_out,
    }))
  }

  /* ── 상품약어 변경 → 드롭다운 + 바코드/이미지 자동입력 ── */
  const handleAbbrChange = (v: string) => {
    const suggs = getOptionsByAbbr(v)
    setAbbrSuggestions(suggs)
    setShowAbbrDrop(suggs.length > 0)
    const found = lookupByAbbrAndOption(v, form.option_name)
    setForm(f => {
      const bc = found?.barcode || f.barcode
      return {
        ...f,
        product_abbr: v,
        barcode      : bc,
        option_image : found?.option_image  || f.option_image,
        ...(modal?.type === 'exchange' && found?.barcode ? { barcode_in: found.barcode } : {}),
      }
    })
  }

  /* ── 옵션명 변경 → 바코드/이미지 자동입력 ── */
  const handleOptionNameChange = (v: string) => {
    const found = lookupByAbbrAndOption(form.product_abbr, v)
    const bc = found?.barcode || form.barcode
    setForm(f => ({
      ...f,
      option_name  : v,
      barcode      : bc,
      option_image : found?.option_image  || f.option_image,
      ...(modal?.type === 'exchange' && found?.barcode ? { barcode_in: found.barcode } : {}),
    }))
  }

  /* ── 드롭다운 선택 ── */
  const selectAbbrSuggestion = (s: OptionSuggestion) => {
    setForm(f => ({
      ...f,
      product_abbr: s.product_abbr,
      option_name: s.option_name,
      barcode: s.barcode,
      ...(modal?.type === 'exchange' ? { barcode_in: s.barcode } : {}),
      option_image: s.option_image,
    }))
    setShowAbbrDrop(false)
  }

  /* ── 자동 송장조회 (바코드 기준, 쇼핑몰/수령인은 선택 필터) ── */
  const autoLookupTracking = () => {
    const bc = modal?.type === 'exchange'
      ? (form.barcode_in || form.barcode)
      : form.barcode
    if (!bc) { alert('바코드를 먼저 입력해주세요.'); return }
    const tn = lookupTracking(
      bc,
      form.mall       || undefined,
      form.customer_name || undefined,
    )
    if (tn) setForm(f => ({ ...f, tracking_number: tn }))
    else alert('출고내역에서 해당 바코드의 송장번호를 찾지 못했습니다.\n쇼핑몰·수령인을 함께 입력하면 더 정확하게 찾을 수 있습니다.')
  }

  /* ── 직접 등록 저장 ── */
  const handleDirectSave = () => {
    const qty = Math.max(1, formQty || 1)
    if (modal!.type === 'exchange') {
      const bin  = form.barcode_in.trim()
      const bout = form.barcode_out.trim()
      if (!form.mall || !form.customer_name || !bin || !bout) {
        alert('교환 등록: 쇼핑몰, 수령인, 기존 출고 바코드(교환입고), 교환 발송 바코드(교환출고)를 모두 입력해주세요.')
        return
      }
      setSaving(true)
      const fin  = lookupByBarcode(bin)
      const fout = lookupByBarcode(bout)
      const newItem: CsItem = {
        id: crypto.randomUUID(), type: 'exchange',
        mall: form.mall, customer_name: form.customer_name,
        barcode: bin,
        barcode_in: bin,
        barcode_out: bout,
        option_image: form.option_image || fin?.option_image || '',
        option_image_out: form.option_image_out || fout?.option_image || '',
        product_abbr: form.product_abbr || fin?.product_abbr || '',
        option_name: form.option_name || fin?.option_name || '',
        product_abbr_out: form.product_abbr_out || fout?.product_abbr || '',
        option_name_out: form.option_name_out || fout?.option_name || '',
        quantity: qty, reason: form.reason,
        tracking_number: form.tracking_number,
        tracking_number_out: form.tracking_number_out || '',
        return_tracking_number: form.return_tracking_number || '',
        registered_at: nowIso(), status: 'pending',
      }
      const updated = [newItem, ...items]
      saveCs(updated); setItems(updated)
      setModal(null); setSaving(false)
      return
    }
    if (!form.mall || !form.customer_name || !form.barcode) {
      alert('쇼핑몰, 수령인, 바코드는 필수 입력입니다.')
      return
    }
    setSaving(true)
    const newItem: CsItem = {
      id: crypto.randomUUID(), type: modal!.type,
      mall: form.mall, customer_name: form.customer_name,
      option_image: form.option_image, product_abbr: form.product_abbr,
      option_name: form.option_name, barcode: form.barcode.trim(),
      quantity: qty, reason: form.reason,
      tracking_number: form.tracking_number,
      return_tracking_number: form.return_tracking_number || '',
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
        const isEx = modal!.type === 'exchange'
        const newItems: CsItem[] = rows.map(r => {
          const bin   = String(r['교환입고바코드'] ?? r['입고바코드'] ?? '').trim()
          const bout  = String(r['교환출고바코드'] ?? r['출고바코드'] ?? '').trim()
          const legacyBc = String(r['바코드'] ?? '').trim()
          const qty   = Number(r['수량']) || 1
          const reason = (r['구분'] === '불량' ? 'defective' : 'simple_change') as CsReason
          const base = {
            mall: String(r['쇼핑몰'] ?? ''),
            customer_name: String(r['수령인'] ?? r['주문자'] ?? ''),
            quantity: qty, reason,
            tracking_number: String(r['송장번호'] ?? ''),
            tracking_number_out: String(r['교환출고송장번호'] ?? r['출고송장번호'] ?? ''),
            return_tracking_number: String(r['반송장번호'] ?? ''),
            registered_at: nowIso(), status: 'pending' as const,
          }
          if (isEx && bin && bout) {
            const fin = lookupByBarcode(bin)
            const fout = lookupByBarcode(bout)
            return {
              id: crypto.randomUUID(), type: 'exchange' as const, ...base,
              barcode: bin,
              barcode_in: bin,
              barcode_out: bout,
              option_image: String(r['옵션이미지'] ?? '') || fin?.option_image || '',
              option_image_out: fout?.option_image || '',
              product_abbr: String(r['상품약어'] ?? '') || fin?.product_abbr || '',
              option_name: String(r['옵션명'] ?? '') || fin?.option_name || '',
              product_abbr_out: fout?.product_abbr || '',
              option_name_out: fout?.option_name || '',
            }
          }
          const bc = isEx && bin ? bin : legacyBc
          const fin = lookupByBarcode(bc)
          return {
            id: crypto.randomUUID(), type: modal!.type,
            ...base,
            option_image: String(r['옵션이미지'] ?? '') || fin?.option_image || '',
            product_abbr: String(r['상품약어'] ?? '') || fin?.product_abbr || '',
            option_name: String(r['옵션명'] ?? '') || fin?.option_name || '',
            barcode: bc,
            ...(isEx && bin ? { barcode_in: bin, barcode_out: bout } : {}),
          }
        })
        const updated = [...newItems, ...items]
        saveCs(updated); setItems(updated)
        alert(`${newItems.length}건이 등록되었습니다.`)
        setModal(null)
      } catch { alert('파일 형식이 올바르지 않습니다.') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 처리완료 (교환: leg 'in' 입고+ / 'out' 출고− 각각) ── */
  const handleProcess = async (item: CsItem, leg?: 'in' | 'out') => {
    if (processing) return
    const reasonLabel = item.reason === 'defective' ? '불량' : '단순변심'
    const qty         = item.quantity ?? 1
    const procKey     = item.type === 'exchange' && leg ? `${item.id}:${leg}` : item.id

    if (item.type === 'exchange') {
      const bin  = (item.barcode_in ?? item.barcode ?? '').trim()
      const bout = (item.barcode_out ?? '').trim()
      if (bin && bout) {
        if (leg === 'in') {
          if (!confirm(
            `[교환입고] ${item.customer_name}\n바코드: ${bin} → 재고 +${qty}\n\n처리완료 하시겠습니까?`,
          )) return
        } else if (leg === 'out') {
          if (!confirm(
            `[교환출고] ${item.customer_name}\n바코드: ${bout} → 재고 −${qty}\n\n처리완료 하시겠습니까?`,
          )) return
        } else return
      } else {
        if (!confirm(`[교환·기존형] ${item.customer_name} / ${bin || item.barcode}\n사유: ${reasonLabel} / 수량: ${qty}개\n(교환출고 바코드 없음 → 입고 바코드만 재고 반영)\n\n처리완료 하시겠습니까?`)) return
      }
    } else {
      if (!confirm(`[반품] ${item.customer_name} / ${item.barcode}\n사유: ${reasonLabel} / 수량: ${qty}개\n\n처리완료 하시겠습니까?`)) return
    }

    setProcessing(procKey)
    try {
      let products = loadCachedProducts()

      const patchOptionByBarcode = (
        barcode: string,
        fn: (o: CachedOption) => CachedOption,
      ): { products: CachedProduct[]; hit: boolean } => {
        let hit = false
        const next = products.map(p => ({
          ...p,
          options: p.options.map(o => {
            if ((o.barcode ?? '').trim() !== barcode.trim()) return o
            hit = true
            return fn(o)
          }),
        }))
        return { products: next, hit }
      }

      const ts = nowIso()

      if (item.type === 'exchange') {
        const bin  = (item.barcode_in ?? item.barcode ?? '').trim()
        const bout = (item.barcode_out ?? '').trim()
        if (bin && bout) {
          if (leg === 'in') {
            const r1 = patchOptionByBarcode(bin, o => ({
              ...o,
              current_stock: (typeof o.current_stock === 'number' ? o.current_stock : 0) + qty,
            }))
            products = r1.products
          } else if (leg === 'out') {
            const r2 = patchOptionByBarcode(bout, o => ({
              ...o,
              current_stock: Math.max(0, (typeof o.current_stock === 'number' ? o.current_stock : 0) - qty),
            }))
            products = r2.products
          }
        } else if (bin) {
          const r = patchOptionByBarcode(bin, o => {
            if (item.reason === 'simple_change') {
              return { ...o, current_stock: (typeof o.current_stock === 'number' ? o.current_stock : 0) + qty }
            }
            return { ...o, defective: (typeof o.defective === 'number' ? o.defective : 0) + qty }
          })
          products = r.products
        }
      } else {
        let found = false
        products = products.map(p => ({
          ...p,
          options: p.options.map(o => {
            if ((o.barcode ?? '').trim() !== item.barcode.trim()) return o
            found = true
            if (item.reason === 'simple_change') {
              return { ...o, current_stock: (typeof o.current_stock === 'number' ? o.current_stock : 0) + qty }
            }
            return { ...o, defective: (typeof o.defective === 'number' ? o.defective : 0) + qty }
          }),
        }))
        if (!found) {
          const updated = items.map(i =>
            i.id === item.id ? { ...i, status: 'processed' as CsStatus, processed_at: ts } : i
          )
          saveCs(updated); setItems(updated)
          return
        }
      }

      const origSnapshot = loadCachedProducts()
      saveCachedProducts(products)
      const changedIds = new Set(
        products
          .filter(p => p.options.some((o, i) => {
            const orig = origSnapshot.find(pp => pp.id === p.id)?.options[i]
            return orig && (o.current_stock !== orig.current_stock || o.defective !== orig.defective)
          }))
          .map(p => p.id)
      )
      await Promise.all([...changedIds].map(id => {
        const p = products.find(pp => pp.id === id)!
        return fetch('/api/pm-products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, options: p.options }),
        })
      }))

      let patch: Partial<CsItem> = {}
      if (item.type === 'exchange') {
        const bin  = (item.barcode_in ?? item.barcode ?? '').trim()
        const bout = (item.barcode_out ?? '').trim()
        if (bin && bout) {
          if (leg === 'in') patch = { exchange_in_processed_at: ts }
          else if (leg === 'out') patch = { exchange_out_processed_at: ts }
        } else if (bin) {
          patch = { exchange_in_processed_at: ts, status: 'processed', processed_at: ts }
        }
      } else {
        patch = { status: 'processed', processed_at: ts }
      }

      const updated = items.map(i => {
        if (i.id !== item.id) return i
        if (item.type === 'exchange' && (item.barcode_in ?? item.barcode ?? '').trim()
          && (item.barcode_out ?? '').trim()) {
          return finalizeCsItemTimestamps(i, patch)
        }
        return { ...i, ...patch }
      })
      saveCs(updated); setItems(updated)
    } finally { setProcessing(null) }
  }

  /* ── 반송장번호 인라인 저장 ── */
  const handleReturnTrackingChange = (id: string, value: string) => {
    const updated = items.map(i => i.id === id ? { ...i, return_tracking_number: value } : i)
    saveCs(updated); setItems(updated)
  }

  const handleTrackingOutChange = (id: string, value: string) => {
    const updated = items.map(i => i.id === id ? { ...i, tracking_number_out: value } : i)
    saveCs(updated); setItems(updated)
  }

  /* ── 수정 저장 ── */
  const handleEditSave = () => {
    if (!editDraft) return
    const updated = items.map(i => i.id === editDraft.id ? editDraft : i)
    saveCs(updated); setItems(updated)
    setEditDraft(null)
  }

  /* ── 삭제 ── */
  const handleDelete = (id: string, label: string) => {
    if (!confirm(`[${label}] 항목을 삭제하시겠습니까?`)) return
    const updated = items.filter(i => i.id !== id)
    saveCs(updated); setItems(updated)
  }

  /* ── 엑셀 템플릿 다운로드 ── */
  const handleDownloadTemplate = () => {
    const rows = [{
      쇼핑몰: '', 수령인: '',
      교환입고바코드: '', 교환출고바코드: '',
      교환출고송장번호: '',
      옵션이미지: '', 상품약어: '', 옵션명: '', 바코드: '', 수량: 1, 구분: '단순변심', 송장번호: '', 반송장번호: '',
    }]
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
  const GRID_LEFT  = 'minmax(76px,0.55fr) 56px minmax(72px,0.65fr) 34px minmax(72px,0.8fr) minmax(132px,1.4fr) minmax(132px,1.4fr) minmax(120px,1.3fr) 26px minmax(52px,0.45fr) 56px 48px'
  const GRID_RIGHT = 'minmax(76px,0.55fr) 56px minmax(72px,0.65fr) 34px minmax(72px,0.8fr) minmax(132px,1.4fr) minmax(132px,1.4fr) minmax(120px,1.3fr) 26px minmax(52px,0.45fr) 68px 48px'
  const HDRS_LEFT  = ['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '송장번호', '반송장번호', '바코드', '수량', '사유', '', '']
  const HDRS_RIGHT = ['구분', '쇼핑몰', '수령인', '이미지', '약어/옵션', '송장번호', '반송장번호', '바코드', '수량', '사유', '처리일시', '']

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
              <span style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>CS접수</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                {pendingRows.length}건
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => openModal('return')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}>
              <RotateCcw size={13} /> 반품등록
            </button>
            <button onClick={() => openModal('exchange')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}>
              <RefreshCw size={13} /> 교환등록
            </button>
          </div>
          {/* 검색 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SearchBox value={leftSearch} onChange={setLeftSearch} />
          </div>
        </div>

        {/* 목록 카드 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <GridHeader cols={GRID_LEFT} headers={HDRS_LEFT} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pendingRows.length === 0 ? (
              <EmptyState icon={<HeadphonesIcon size={32} />} text="미처리 CS가 없습니다" />
            ) : pendingRows.map(row => {
              const item = row.item
              const ms   = mallStyle(item.mall)
              const procKey = row.kind === 'exchange_leg' ? `${item.id}:${row.leg}` : item.id
              const isProc = processing === procKey
              const qty    = item.quantity ?? 1
              const exInRow = row.kind === 'exchange_leg' && row.leg === 'in'
              const showReturnInput = row.kind === 'single' || exInRow
              const delLabel = item.type === 'exchange' && item.barcode_out
                ? `${item.customer_name} / 입고${item.barcode_in ?? item.barcode} 출고${item.barcode_out}`
                : `${item.customer_name} / ${item.barcode}`
              const pendingIdleBg = row.kind === 'exchange_leg' && row.leg === 'out' ? '#fafafa' : 'transparent'
              return (
                <div key={csListRowKey(row)}
                  onClick={() => setEditDraft({ ...item })}
                  style={{ display: 'grid', gridTemplateColumns: GRID_LEFT, gap: 5, padding: '8px 10px', borderBottom: '1px solid #f8fafc', alignItems: 'start', cursor: 'pointer', transition: 'background 120ms', background: pendingIdleBg }}
                  onMouseEnter={e => { e.currentTarget.style.background = row.kind === 'exchange_leg' && row.leg === 'out' ? '#ecfdf5' : '#f0f9ff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = pendingIdleBg }}
                >
                  {row.kind === 'single' ? (
                    <TypeBadge type={item.type} />
                  ) : (
                    <ExchangeLegTypeBadge leg={row.leg} />
                  )}
                  <MallBadge mall={item.mall} style={ms} />
                  <CustomerCell name={item.customer_name} date={item.registered_at} />
                  {row.kind === 'single' ? (
                    <ImageCell src={item.option_image} />
                  ) : row.leg === 'in' ? (
                    <ImageCell src={item.option_image} />
                  ) : (
                    <ImageCell src={item.option_image_out ?? ''} />
                  )}
                  {row.kind === 'single' ? (
                    <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  ) : row.leg === 'in' ? (
                    <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  ) : (
                    <AbbrOptionCell abbr={item.product_abbr_out ?? ''} option={item.option_name_out ?? ''} />
                  )}
                  {row.kind === 'exchange_leg' && row.leg === 'out' ? (
                    <input
                      value={item.tracking_number_out ?? ''}
                      onChange={e => handleTrackingOutChange(item.id, e.target.value)}
                      placeholder="교환 발송 송장"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.02em', color: '#2563eb', width: '100%', minWidth: 0, border: '1px solid #fecaca', borderRadius: 4, padding: '4px 6px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 1, background: '#fff' }}
                    />
                  ) : (
                    <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.02em', color: '#2563eb', display: 'block', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.35, paddingTop: 2 }}>
                      {item.tracking_number || '-'}
                    </span>
                  )}
                  {showReturnInput ? (
                    <input
                      value={item.return_tracking_number || ''}
                      onChange={e => handleReturnTrackingChange(item.id, e.target.value)}
                      placeholder="반송장"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.02em', color: '#7c3aed', width: '100%', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 6px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 1 }}
                    />
                  ) : (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', paddingTop: 6 }} title="동일 접수 반송장">{item.return_tracking_number || '—'}</span>
                  )}
                  {row.kind === 'single' ? (
                    <BarcodeCell barcode={item.barcode} />
                  ) : row.leg === 'in' ? (
                    <BarcodeCell barcode={(item.barcode_in ?? item.barcode ?? '').trim() || '-'} />
                  ) : (
                    <BarcodeCell barcode={(item.barcode_out ?? '').trim() || '-'} />
                  )}
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textAlign: 'center', paddingTop: 4 }}>{qty}</span>
                  <ReasonBadge reason={item.reason} />
                  <button onClick={e => { e.stopPropagation(); handleProcess(item, row.kind === 'exchange_leg' ? row.leg : undefined) }} disabled={!!processing}
                    style={{ padding: '4px 6px', background: isProc ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '10px', fontWeight: 800, cursor: isProc ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {isProc ? '처리중' : '처리완료'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(item.id, delLabel) }}
                    title="삭제"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 7px', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 6, cursor: 'pointer', fontSize: '10.5px', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}
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
            <span style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>CS처리현황</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{processedRows.length}건</span>
          </div>
          <MonthNav ym={rightYM} curYM={curYM} onChange={setRightYM} accentColor="#059669" accentBg="#f0fdf4">
            <SearchBox value={rightSearch} onChange={setRightSearch} />
          </MonthNav>
        </div>

        {/* 목록 카드 */}
        <div className="pm-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <GridHeader cols={GRID_RIGHT} headers={HDRS_RIGHT} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {processedRows.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={32} />} text={`${rightYM.replace('-', '년 ')}월 처리된 CS가 없습니다`} />
            ) : processedRows.map(row => {
              const item = row.item
              const ms   = mallStyle(item.mall)
              const qty  = item.quantity ?? 1
              const exLead = row.kind === 'exchange_leg' && row.leg === 'in'
              const showReturnInput = row.kind === 'single' || exLead
              const delLabel = item.type === 'exchange' && item.barcode_out
                ? `${item.customer_name} / 입고${item.barcode_in ?? item.barcode} 출고${item.barcode_out}`
                : `${item.customer_name} / ${item.barcode}`
              const baseBg = row.kind === 'exchange_leg' && row.leg === 'out' ? '#f7fef9' : '#fafffe'
              return (
                <div key={csListRowKey(row)}
                  onClick={() => setEditDraft({ ...item })}
                  style={{ display: 'grid', gridTemplateColumns: GRID_RIGHT, gap: 5, padding: '8px 10px', borderBottom: '1px solid #f8fafc', alignItems: 'start', background: baseBg, cursor: 'pointer', transition: 'background 120ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ecfdf5')}
                  onMouseLeave={e => (e.currentTarget.style.background = baseBg)}
                >
                  {row.kind === 'single' ? (
                    <TypeBadge type={item.type} />
                  ) : (
                    <ExchangeLegTypeBadge leg={row.leg} />
                  )}
                  <MallBadge mall={item.mall} style={ms} />
                  <CustomerCell name={item.customer_name} date={item.registered_at} />
                  {row.kind === 'single' ? (
                    <ImageCell src={item.option_image} />
                  ) : row.leg === 'in' ? (
                    <ImageCell src={item.option_image} />
                  ) : (
                    <ImageCell src={item.option_image_out ?? ''} />
                  )}
                  {row.kind === 'single' ? (
                    <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  ) : row.leg === 'in' ? (
                    <AbbrOptionCell abbr={item.product_abbr} option={item.option_name} />
                  ) : (
                    <AbbrOptionCell abbr={item.product_abbr_out ?? ''} option={item.option_name_out ?? ''} />
                  )}
                  <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.02em', color: '#2563eb', display: 'block', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.35, paddingTop: 2 }}>
                    {row.kind === 'exchange_leg' && row.leg === 'out'
                      ? (item.tracking_number_out || '−')
                      : (item.tracking_number || '−')}
                  </span>
                  {showReturnInput ? (
                    <input
                      value={item.return_tracking_number || ''}
                      onChange={e => handleReturnTrackingChange(item.id, e.target.value)}
                      placeholder="반송장"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.02em', color: '#7c3aed', width: '100%', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 6px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 1 }}
                    />
                  ) : (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', paddingTop: 6 }}>{item.return_tracking_number || '—'}</span>
                  )}
                  {row.kind === 'single' ? (
                    <BarcodeCell barcode={item.barcode} />
                  ) : row.leg === 'in' ? (
                    <BarcodeCell barcode={(item.barcode_in ?? item.barcode ?? '').trim() || '-'} />
                  ) : (
                    <BarcodeCell barcode={(item.barcode_out ?? '').trim() || '-'} />
                  )}
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textAlign: 'center', paddingTop: 4 }}>{qty}</span>
                  <ReasonBadge reason={item.reason} />
                  <div>
                    {row.kind === 'single' && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#059669' }}>
                        ✓ {fmtDateTime(item.processed_at ?? '')}
                      </span>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'in' && item.exchange_in_processed_at && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#059669' }}>
                        ✓ 입고 {fmtDateTime(item.exchange_in_processed_at)}
                      </span>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'out' && item.exchange_out_processed_at && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#dc2626' }}>
                        ✓ 출고 {fmtDateTime(item.exchange_out_processed_at)}
                      </span>
                    )}
                    {row.kind === 'single' && item.reason === 'simple_change' && (
                      <p style={{ fontSize: '9px', color: '#0284c7', marginTop: 1 }}>재고+{qty}</p>
                    )}
                    {row.kind === 'single' && item.reason === 'defective' && (
                      <p style={{ fontSize: '9px', color: '#c2410c', marginTop: 1 }}>불량+{qty}</p>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'in' && (item.barcode_out ?? '').trim() && (
                      <p style={{ fontSize: '9px', color: '#0284c7', marginTop: 1 }}>입고+{qty}</p>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'out' && (item.barcode_out ?? '').trim() && (
                      <p style={{ fontSize: '9px', color: '#dc2626', marginTop: 1 }}>출고−{qty}</p>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'in' && !(item.barcode_out ?? '').trim() && item.reason === 'simple_change' && (
                      <p style={{ fontSize: '9px', color: '#0284c7', marginTop: 1 }}>재고+{qty}</p>
                    )}
                    {row.kind === 'exchange_leg' && row.leg === 'in' && !(item.barcode_out ?? '').trim() && item.reason === 'defective' && (
                      <p style={{ fontSize: '9px', color: '#c2410c', marginTop: 1 }}>불량+{qty}</p>
                    )}
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(item.id, delLabel) }}
                    title="삭제"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 7px', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 6, cursor: 'pointer', fontSize: '10.5px', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}
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
                <p style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>{modal.type === 'return' ? '반품' : '교환'} 등록</p>
                <p style={{ fontSize: '11px', color: '#94a3b8' }}>등록 방식을 선택하세요</p>
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
                  style={{ flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 800, background: modal.tab === t ? '#fff' : '#f8fafc', color: modal.tab === t ? '#0f172a' : '#94a3b8', borderBottom: modal.tab === t ? '2px solid #2563eb' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
                    <select value={form.mall} onChange={e => setF('mall', e.target.value)} className="pm-input pm-select" style={{ fontSize: '13px' }}>
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

                  {/* 바코드 → 자동입력 (반품: 단일 / 교환: 입고+출고) */}
                  {modal.type === 'return' ? (
                    <div>
                      <label style={labelStyle}>
                        바코드 <Req />
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>입력 시 약어/옵션명/이미지 자동입력</span>
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={form.barcode} onChange={e => handleBarcodeChange(e.target.value)} placeholder="바코드 번호" className="pm-input" style={{ flex: 1 }} />
                        <button onClick={autoLookupTracking} type="button" title="출고내역에서 송장번호 자동 조회"
                          style={{ padding: '0 12px', height: 36, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '11.5px', fontWeight: 800, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                          <Search size={12} /> 송장조회
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: '10px 12px', background: '#ecfdf5', borderRadius: 10, border: '1px solid #bbf7d0', marginBottom: 4 }}>
                        <p style={{ fontSize: '11px', fontWeight: 900, color: '#047857', margin: 0 }}>교환입고 — 기존에 출고된 상품(회수·재고 +)</p>
                        <p style={{ fontSize: '10px', color: '#059669', margin: '4px 0 0' }}>고객이 돌려보내는 바코드입니다. 아래 약어/옵션은 이쪽 기준으로 선택하세요.</p>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          기존 출고 바코드 (교환입고) <Req />
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input value={form.barcode_in} onChange={e => handleExchangeInChange(e.target.value)} placeholder="출고했던 상품 바코드" className="pm-input" style={{ flex: 1, fontFamily: 'monospace' }} />
                          <button onClick={autoLookupTracking} type="button" title="출고내역에서 송장번호 자동 조회"
                            style={{ padding: '0 12px', height: 36, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '11.5px', fontWeight: 800, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                            <Search size={12} /> 송장조회
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: '10px 12px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', marginTop: 6 }}>
                        <p style={{ fontSize: '11px', fontWeight: 900, color: '#b91c1c', margin: 0 }}>교환출고 — 보내줄 교환 상품(재고 −)</p>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          교환 발송 바코드 (교환출고) <Req />
                        </label>
                        <input value={form.barcode_out} onChange={e => handleExchangeOutChange(e.target.value)} placeholder="새로 보낼 상품 바코드" className="pm-input" style={{ fontFamily: 'monospace' }} />
                      </div>
                    </>
                  )}

                  {/* 상품약어 + 옵션명 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ position: 'relative' }} ref={abbrDropRef}>
                      <label style={labelStyle}>상품약어 <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>→ 바코드 자동</span></label>
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
                                <p style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.option_name || '(옵션명 없음)'}</p>
                                <p data-pm-barcode="1" style={{ fontSize: '10px', fontFamily: 'monospace' }}>{s.barcode}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>옵션명 <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>→ 바코드 자동</span></label>
                      <input value={form.option_name} onChange={e => handleOptionNameChange(e.target.value)} placeholder="예: 블랙/FREE" className="pm-input" />
                    </div>
                  </div>

                  {/* 옵션이미지 */}
                  <div>
                    <label style={labelStyle}>옵션이미지 URL <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>(바코드 입력 시 자동입력)</span></label>
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
                            <p style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>{r === 'defective' ? '불량' : '단순변심'}</p>
                            <p style={{ fontSize: '10px', color: '#94a3b8' }}>{r === 'defective' ? '불량수량 +N 처리' : '재고수량 +N 복원'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 수량 */}
                  <div>
                    <label style={labelStyle}>
                      {modal.type === 'return' ? '반품' : '교환'}수량 <Req />
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>처리완료 시 해당 수량만큼 재고/불량 반영</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setFormQty(q => Math.max(1, q - 1))}
                        style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <input
                        type="number" min={1} value={formQty}
                        onChange={e => setFormQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 72, height: 36, textAlign: 'center', fontSize: '16px', fontWeight: 900, border: '1.5px solid #e2e8f0', borderRadius: 9, outline: 'none', color: '#0f172a' }}
                      />
                      <button onClick={() => setFormQty(q => q + 1)}
                        style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>개</span>
                    </div>
                  </div>

                  {/* 송장번호 */}
                  <div>
                    <label style={labelStyle}>
                      {modal.type === 'exchange' ? '송장번호 (교환입고·기존 출고)' : '송장번호'}
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>(출고내역에서 자동조회 가능)</span>
                    </label>
                    <input value={form.tracking_number} onChange={e => setF('tracking_number', e.target.value)} placeholder="운송장번호" className="pm-input" />
                  </div>

                  {modal.type === 'exchange' && (
                    <div>
                      <label style={labelStyle}>송장번호 (교환출고·신규 발송)</label>
                      <input value={form.tracking_number_out} onChange={e => setF('tracking_number_out', e.target.value)} placeholder="교환 발송 운송장 (접수 후 목록에서도 입력 가능)" className="pm-input" />
                    </div>
                  )}

                  {/* 반송장번호 */}
                  <div>
                    <label style={labelStyle}>반송장번호</label>
                    <input value={form.return_tracking_number} onChange={e => setF('return_tracking_number', e.target.value)} placeholder="반품 운송장번호 (선택)" className="pm-input" />
                  </div>
                </div>

                {/* 저장 버튼 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={() => setModal(null)}
                    style={{ flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                    취소
                  </button>
                  <button onClick={handleDirectSave} disabled={saving}
                    style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', background: modal.type === 'return' ? '#dc2626' : '#7c3aed', color: '#fff' }}>
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
                  <p style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155', marginBottom: 6 }}>엑셀 파일을 업로드하세요</p>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: 16 }}>쇼핑몰, 수령인, 상품약어, 옵션명, 바코드, 수량, 구분, 송장번호, 반송장번호</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={handleDownloadTemplate}
                      style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}>
                      템플릿 다운로드
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 9, fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}>
                      파일 선택
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
                <div className="pm-card" style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: 10 }}>📋 엑셀 컬럼 형식</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      ['쇼핑몰', '스마트스토어, 쿠팡 등'], ['수령인', '주문자 또는 수령인'],
                      ['옵션이미지', '이미지 URL (선택)'],  ['상품약어', '상품 약어코드'],
                      ['옵션명', '예: 블랙/FREE'],          ['바코드', '바코드 번호'],
                      ['수량', '숫자 (기본값 1)'],          ['구분', '단순변심 또는 불량'],
                      ['송장번호', '운송장번호 (교환입고)'],     ['교환출고송장번호', '교환 발송 송장 (선택)'],
                      ['반송장번호', '반품 운송장번호 (선택)'],  ['교환 바코드', '교환입고바코드·교환출고바코드'],
                    ].map(([col, desc]) => (
                      <div key={`${col}-${desc}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: 5, flexShrink: 0 }}>{col}</span>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => setModal(null)}
                  style={{ width: '100%', marginTop: 16, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ 수정 모달 ══════════════════════════════════════════════ */}
      {editDraft && (
        <div
          onMouseDown={e => { editBackdropRef.current = e.target === e.currentTarget }}
          onClick={e => { if (editBackdropRef.current && e.target === e.currentTarget) setEditDraft(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="pm-card animate-scale-in" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: editDraft.type === 'return' ? '#fff1f2' : '#f5f3ff' }}>
                {editDraft.type === 'return' ? <RotateCcw size={15} style={{ color: '#dc2626' }} /> : <RefreshCw size={15} style={{ color: '#7c3aed' }} />}
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>CS 항목 수정</p>
                <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {editDraft.customer_name} / {editDraft.type === 'exchange' && editDraft.barcode_out
                    ? `입고 ${editDraft.barcode_in ?? editDraft.barcode} · 출고 ${editDraft.barcode_out}`
                    : editDraft.barcode}
                </p>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setEditDraft(null)}
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#64748b' }} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gap: 12 }}>

                {/* 구분 (반품/교환) */}
                <div>
                  <label style={labelStyle}>구분</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['return', 'exchange'] as CsType[]).map(t => (
                      <div key={t} onClick={() => setEditDraft(d => d ? { ...d, type: t } : d)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', border: `2px solid ${editDraft.type === t ? (t === 'return' ? '#dc2626' : '#7c3aed') : '#e2e8f0'}`, background: editDraft.type === t ? (t === 'return' ? '#fff1f2' : '#f5f3ff') : '#fff', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 120ms' }}>
                        {t === 'return' ? <RotateCcw size={13} style={{ color: '#dc2626', flexShrink: 0 }} /> : <RefreshCw size={13} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>{t === 'return' ? '반품' : '교환'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 쇼핑몰 */}
                <div>
                  <label style={labelStyle}>쇼핑몰</label>
                  <select value={editDraft.mall} onChange={e => setEditDraft(d => d ? { ...d, mall: e.target.value } : d)} className="pm-input pm-select" style={{ fontSize: '13px' }}>
                    <option value="">쇼핑몰 선택</option>
                    {['스마트스토어', '쿠팡', '11번가', 'G마켓', '옥션', '카페24', '지그재그', '에이블리', '올웨이즈', '토스쇼핑', '롯데온', 'SSG', '기타'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* 주문자(수령인) */}
                <div>
                  <label style={labelStyle}>주문자(수령인)</label>
                  <input value={editDraft.customer_name} onChange={e => setEditDraft(d => d ? { ...d, customer_name: e.target.value } : d)} placeholder="수령인 이름" className="pm-input" />
                </div>

                {/* 바코드 */}
                {editDraft.type === 'exchange' ? (
                  <>
                    <div>
                      <label style={labelStyle}>교환입고 바코드 (기존 출고)</label>
                      <input value={editDraft.barcode_in ?? editDraft.barcode} onChange={e => setEditDraft(d => d ? { ...d, barcode_in: e.target.value, barcode: e.target.value } : d)} placeholder="회수 바코드" className="pm-input" style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <label style={labelStyle}>교환출고 바코드 (발송)</label>
                      <input value={editDraft.barcode_out ?? ''} onChange={e => setEditDraft(d => d ? { ...d, barcode_out: e.target.value } : d)} placeholder="교환 발송 바코드" className="pm-input" style={{ fontFamily: 'monospace' }} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={labelStyle}>바코드</label>
                    <input value={editDraft.barcode} onChange={e => setEditDraft(d => d ? { ...d, barcode: e.target.value } : d)} placeholder="바코드 번호" className="pm-input" />
                  </div>
                )}

                {/* 상품약어 + 옵션명 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>상품약어</label>
                    <input value={editDraft.product_abbr} onChange={e => setEditDraft(d => d ? { ...d, product_abbr: e.target.value } : d)} placeholder="예: BLK-MT" className="pm-input" />
                  </div>
                  <div>
                    <label style={labelStyle}>옵션명</label>
                    <input value={editDraft.option_name} onChange={e => setEditDraft(d => d ? { ...d, option_name: e.target.value } : d)} placeholder="예: 블랙/FREE" className="pm-input" />
                  </div>
                </div>

                {editDraft.type === 'exchange' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>교환출고 상품약어</label>
                      <input value={editDraft.product_abbr_out ?? ''} onChange={e => setEditDraft(d => d ? { ...d, product_abbr_out: e.target.value } : d)} className="pm-input" />
                    </div>
                    <div>
                      <label style={labelStyle}>교환출고 옵션명</label>
                      <input value={editDraft.option_name_out ?? ''} onChange={e => setEditDraft(d => d ? { ...d, option_name_out: e.target.value } : d)} className="pm-input" />
                    </div>
                  </div>
                )}

                {/* 옵션이미지 */}
                <div>
                  <label style={labelStyle}>{editDraft.type === 'exchange' ? '옵션이미지 URL (교환입고)' : '옵션이미지 URL'}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input value={editDraft.option_image} onChange={e => setEditDraft(d => d ? { ...d, option_image: e.target.value } : d)} placeholder="https://..." className="pm-input" style={{ flex: 1 }} />
                    {editDraft.option_image && (
                      <img src={editDraft.option_image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                  </div>
                </div>

                {editDraft.type === 'exchange' && (
                  <div>
                    <label style={labelStyle}>옵션이미지 URL (교환출고)</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <input value={editDraft.option_image_out ?? ''} onChange={e => setEditDraft(d => d ? { ...d, option_image_out: e.target.value } : d)} placeholder="https://..." className="pm-input" style={{ flex: 1 }} />
                      {(editDraft.option_image_out ?? '').trim() && (
                        <img src={editDraft.option_image_out} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                  </div>
                )}

                {/* 송장번호 + 반송장번호 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{editDraft.type === 'exchange' ? '송장번호 (교환입고)' : '송장번호'}</label>
                    <input value={editDraft.tracking_number} onChange={e => setEditDraft(d => d ? { ...d, tracking_number: e.target.value } : d)} placeholder="운송장번호" className="pm-input" />
                  </div>
                  <div>
                    <label style={labelStyle}>반송장번호</label>
                    <input value={editDraft.return_tracking_number || ''} onChange={e => setEditDraft(d => d ? { ...d, return_tracking_number: e.target.value } : d)} placeholder="반품 운송장번호" className="pm-input" />
                  </div>
                </div>
                {editDraft.type === 'exchange' && (
                  <div>
                    <label style={labelStyle}>송장번호 (교환출고·신규 발송)</label>
                    <input value={editDraft.tracking_number_out ?? ''} onChange={e => setEditDraft(d => d ? { ...d, tracking_number_out: e.target.value } : d)} placeholder="교환 발송 운송장" className="pm-input" />
                  </div>
                )}

                {/* 사유 */}
                <div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>사유</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['simple_change', 'defective'] as CsReason[]).map(r => (
                      <div key={r} onClick={() => setEditDraft(d => d ? { ...d, reason: r } : d)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', border: `2px solid ${editDraft.reason === r ? (r === 'defective' ? '#f97316' : '#2563eb') : '#e2e8f0'}`, background: editDraft.reason === r ? (r === 'defective' ? '#fff7ed' : '#eff6ff') : '#fff', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 120ms' }}>
                        {r === 'defective' ? <AlertTriangle size={13} style={{ color: '#f97316', flexShrink: 0 }} /> : <Clock size={13} style={{ color: '#2563eb', flexShrink: 0 }} />}
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>{r === 'defective' ? '불량' : '단순변심'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 수량 */}
                <div>
                  <label style={labelStyle}>수량</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setEditDraft(d => d ? { ...d, quantity: Math.max(1, (d.quantity ?? 1) - 1) } : d)}
                      style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <input type="number" min={1} value={editDraft.quantity ?? 1}
                      onChange={e => setEditDraft(d => d ? { ...d, quantity: Math.max(1, parseInt(e.target.value) || 1) } : d)}
                      style={{ width: 72, height: 36, textAlign: 'center', fontSize: '16px', fontWeight: 900, border: '1.5px solid #e2e8f0', borderRadius: 9, outline: 'none', color: '#0f172a' }} />
                    <button onClick={() => setEditDraft(d => d ? { ...d, quantity: (d.quantity ?? 1) + 1 } : d)}
                      style={{ width: 36, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', cursor: 'pointer', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>개</span>
                  </div>
                </div>
              </div>

              {/* 저장 버튼 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => setEditDraft(null)}
                  style={{ flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                  취소
                </button>
                <button onClick={handleEditSave}
                  style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 800, cursor: 'pointer', background: editDraft.type === 'return' ? '#dc2626' : '#7c3aed', color: '#fff' }}>
                  수정 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 서브 컴포넌트 ──────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: 5, display: 'block' }
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
      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', minWidth: 78, textAlign: 'center' }}>
        {ym.replace('-', '년 ')}월
      </span>
      <button onClick={() => onChange(shiftMonth(ym, 1))}
        style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ChevronRight size={13} />
      </button>
      {ym !== curYM && (
        <button onClick={() => onChange(curYM)}
          style={{ padding: '3px 9px', borderRadius: 6, border: `1.5px solid ${accentColor}`, background: accentBg, color: accentColor, fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
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
        style={{ paddingLeft: 26, height: 28, fontSize: '12px', fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 7, outline: 'none', width: 130 }} />
    </div>
  )
}

function GridHeader({ cols, headers }: { cols: string; headers: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 5, padding: '7px 10px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
      {headers.map((h, i) => (
        <span key={i} style={{ fontSize: '9.5px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
      ))}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{ margin: '0 auto 12px', opacity: 0.15, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <p style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>{text}</p>
    </div>
  )
}

function TypeBadge({ type }: { type: CsType }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 800, padding: '3px 6px', borderRadius: 5, lineHeight: 1.25,
      color: type === 'return' ? '#dc2626' : '#7c3aed', background: type === 'return' ? '#fff1f2' : '#f5f3ff',
      whiteSpace: 'normal', wordBreak: 'keep-all', display: 'inline-block', maxWidth: '100%',
    }}>
      {type === 'return' ? '반품' : '교환'}
    </span>
  )
}

function ExchangeLegTypeBadge({ leg }: { leg: 'in' | 'out' }) {
  const inStyle = { color: '#059669', bg: '#ecfdf5', label: '교환입고' as const }
  const outStyle = { color: '#dc2626', bg: '#fef2f2', label: '교환출고' as const }
  const s = leg === 'in' ? inStyle : outStyle
  return (
    <span style={{
      fontSize: '10px', fontWeight: 800, padding: '3px 6px', borderRadius: 5, lineHeight: 1.25,
      whiteSpace: 'normal', wordBreak: 'keep-all', display: 'inline-block', maxWidth: '100%',
      color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  )
}

function MallBadge({ mall, style }: { mall: string; style: { color: string; bg: string } }) {
  return (
    <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '2px 5px', borderRadius: 5, color: style.color, background: style.bg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
      {mall || '-'}
    </span>
  )
}

function CustomerCell({ name, date }: { name: string; date: string }) {
  return (
    <div style={{ overflow: 'hidden' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
      <p style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: 1 }}>{fmtDateTime(date)}</p>
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
      <p style={{ fontSize: '10px', fontWeight: 800, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abbr || '-'}</p>
      <p style={{ fontSize: '9.5px', color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option || '-'}</p>
    </div>
  )
}

function BarcodeCell({ barcode }: { barcode: string }) {
  return (
    <span data-pm-barcode="1" style={{ fontSize: '10.5px', fontWeight: 900, letterSpacing: '0.02em', color: '#000000', display: 'block', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.35, paddingTop: 2 }}>
      {barcode || '-'}
    </span>
  )
}

function ReasonBadge({ reason }: { reason: CsReason }) {
  return (
    <span style={{
      fontSize: '9.5px', fontWeight: 800, padding: '3px 5px', borderRadius: 4, lineHeight: 1.25,
      whiteSpace: 'normal', wordBreak: 'keep-all', display: 'inline-block', maxWidth: '100%',
      color: reason === 'defective' ? '#c2410c' : '#0369a1', background: reason === 'defective' ? '#fff7ed' : '#f0f9ff',
    }}>
      {reason === 'defective' ? '불량' : '단순변심'}
    </span>
  )
}
