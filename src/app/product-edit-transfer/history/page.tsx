'use client'

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { ChevronLeft, ChevronRight, Package, Truck, CheckCircle2, RotateCcw, PackageCheck, FileDown, Pencil, Check, X, Search, HeadphonesIcon, AlertTriangle, Clock, RefreshCw, TrendingDown, Wand2, Zap } from 'lucide-react'
import {
  loadShippedOrders, saveShippedOrders, loadOrders, saveOrders,
  loadMappings, saveMappings, lookupMapping, makeMappingKey, extractColor,
} from '@/lib/orders'
import type { ShippedOrder } from '@/lib/orders'
import { broadcastDashboardRefresh } from '@/lib/dashboard-sync'

/* ─── CS 타입 & 헬퍼 ────────────────────────────────────── */
type CsType   = 'return' | 'exchange'
type CsReason = 'simple_change' | 'defective'
interface CsItem {
  id: string; type: CsType; mall: string; customer_name: string
  option_image: string; product_abbr: string; option_name: string
  barcode: string; quantity: number; reason: CsReason
  tracking_number: string; return_tracking_number?: string
  registered_at: string
  status: 'pending' | 'processed'; processed_at?: string
}
const CS_KEY = 'pm_cs_v1'
function loadCs(): CsItem[] {
  try { const r = localStorage.getItem(CS_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function saveCs(items: CsItem[]) {
  try { localStorage.setItem(CS_KEY, JSON.stringify(items)) } catch {}
  broadcastDashboardRefresh()
}

/** 바코드로 상품 약어·옵션명·이미지 조회 */
function lookupProductByBarcode(barcode: string) {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [])
    const bc = barcode.trim()
    for (const p of arr) {
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
  } catch {}
  return null
}

/* 로컬 캐시에서 상품 목록 로드 */
type CachedOption  = { barcode?: string; name?: string; korean_name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
type CachedProduct = { id: string; name?: string; abbr?: string; options: CachedOption[] }
function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const { data } = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch { return [] }
}
function saveCachedProducts(products: CachedProduct[]) {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    localStorage.setItem('pm_products_cache_v1', JSON.stringify({ ...parsed, data: products }))
  } catch {}
}

/* ─── 바코드 자동매칭 ────────────────────────────────────── */
interface AutoMatchResult {
  barcode             : string
  matchedProductName  : string
  matchedOptionName   : string
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s\-_,./()（）【】\[\]]/g, '')
}

function autoMatchBarcode(
  productName : string,
  option      : string,
  products    : CachedProduct[],
): AutoMatchResult | null {
  const normProd  = normalize(productName)
  const normOpt   = normalize(option)
  const color     = extractColor(option) // '블랙' '화이트' 등 표준화된 색상명

  /* 1단계: 상품 후보 추출 */
  // 정확 일치 (name 또는 abbr)
  let candidates = products.filter(p =>
    normalize(p.name  ?? '') === normProd ||
    normalize(p.abbr  ?? '') === normProd
  )
  // 부분 포함 일치 (주문명이 더 길거나 짧은 경우)
  if (candidates.length === 0) {
    candidates = products.filter(p => {
      const pn = normalize(p.name ?? '')
      const pa = normalize(p.abbr ?? '')
      return (pn.length > 0 && (normProd.includes(pn) || pn.includes(normProd))) ||
             (pa.length > 0 && (normProd.includes(pa) || pa.includes(normProd)))
    })
  }
  if (candidates.length === 0) return null

  /* 2단계: 옵션 후보 매칭 */
  for (const p of candidates) {
    const opts = (p.options ?? []).filter(o => o.barcode)

    // 옵션이 하나면 바로 반환
    if (opts.length === 1) {
      return {
        barcode: opts[0].barcode!,
        matchedProductName: p.name ?? p.abbr ?? '',
        matchedOptionName : opts[0].korean_name ?? opts[0].name ?? '',
      }
    }

    // 색상 기준 매칭
    if (color) {
      const byColor = opts.find(o => {
        const oc = extractColor(o.korean_name ?? o.name ?? '')
        const on = normalize(o.korean_name ?? o.name ?? '')
        return oc === color ||
               on.includes(normalize(color)) ||
               normalize(color).includes(on)
      })
      if (byColor) {
        return {
          barcode: byColor.barcode!,
          matchedProductName: p.name ?? p.abbr ?? '',
          matchedOptionName : byColor.korean_name ?? byColor.name ?? '',
        }
      }
    }

    // 옵션 전체 텍스트 포함 매칭
    const byText = opts.find(o => {
      const on = normalize(o.korean_name ?? o.name ?? '')
      return on.length > 0 && (normOpt.includes(on) || on.includes(normOpt))
    })
    if (byText) {
      return {
        barcode: byText.barcode!,
        matchedProductName: p.name ?? p.abbr ?? '',
        matchedOptionName : byText.korean_name ?? byText.name ?? '',
      }
    }
  }

  return null
}

/* ─── 날짜 유틸 ─────────────────────────────────────────── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const wd = ['일','월','화','수','목','금','토'][dt.getDay()]
  return `${d.replace(/-/g, '년 ').replace(/-/, '월 ')}일 (${wd})`
}
function shiftDate(d: string, delta: number) {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

/* ─── 쇼핑몰 뱃지 색상 ──────────────────────────────────── */
const MALL_COLORS: Record<string, { color: string; bg: string }> = {
  '마켓플러스': { color: '#e11d48', bg: '#fff1f2' },
  '토스쇼핑':   { color: '#4f46e5', bg: '#eef2ff' },
  '지에스샵':   { color: '#059669', bg: '#ecfdf5' },
  '올웨이즈':   { color: '#d97706', bg: '#fffbeb' },
  '스마트스토어':{ color: '#059669', bg: '#ecfdf5' },
  '카페24':     { color: '#7c3aed', bg: '#f5f3ff' },
  '쿠팡':       { color: '#f97316', bg: '#fff7ed' },
  '옥션':       { color: '#0284c7', bg: '#f0f9ff' },
}
function mallStyle(channel: string) {
  return MALL_COLORS[channel] ?? { color: '#64748b', bg: '#f8fafc' }
}

/* ─── 바코드 미설정 경고 타입 ────────────────────────────── */
interface UnmappedItem {
  product_name: string
  option: string
  mappingKey: string
  orders: { id: string; order_number: string }[]
}

/* ─── 인라인 편집 타입 ───────────────────────────────────── */
interface EditFields {
  shipped_at     : string
  channel        : string
  customer_name  : string
  tracking_number: string
  product_name   : string
  option         : string
  barcode        : string
  unit_price     : string
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function ShippingHistoryPage() {
  const today  = getToday()
  const curYM  = getCurYM()

  const [shipped,    setShipped]    = useState<ShippedOrder[]>([])
  const [viewMode,   setViewMode]   = useState<'daily' | 'monthly'>('daily')
  const [selDate,    setSelDate]    = useState(today)
  const [selMonth,   setSelMonth]   = useState(curYM)
  const [checked,    setChecked]    = useState<Set<string>>(new Set())
  const [mappings,   setMappings]   = useState<ReturnType<typeof loadMappings>>({})
  const [searchText, setSearchText] = useState('')

  /* 인라인 편집 */
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editFields, setEditFields] = useState<EditFields | null>(null)

  /* CS 접수 모달 */
  const [csModal,  setCsModal]  = useState(false)
  const [csType,   setCsType]   = useState<CsType>('return')
  const [csReason, setCsReason] = useState<CsReason>('simple_change')

  /* 바코드 미설정 경고 모달 */
  const [barcodeWarnModal,  setBarcodeWarnModal]  = useState(false)
  const [unmappedItems,     setUnmappedItems]     = useState<UnmappedItem[]>([])
  const [unmappedInputs,    setUnmappedInputs]    = useState<Record<string, string>>({})
  const [autoFillResults,   setAutoFillResults]   = useState<Record<string, AutoMatchResult | null>>({})
  const [autoMatchRan,      setAutoMatchRan]      = useState(false)

  /* 출고확정 후 재고현황 모달 */
  interface StockResultItem {
    productName : string
    optionName  : string
    barcode     : string
    stock       : number
  }
  interface StockResultData {
    confirmedCount : number
    zeroItems      : StockResultItem[]
    lowItems       : StockResultItem[]   // 1 ~ LOW_STOCK_THRESHOLD 개
    notFoundNames  : string[]
  }
  const LOW_STOCK_THRESHOLD = 10
  const [stockResultModal, setStockResultModal] = useState(false)
  const [stockResultData,  setStockResultData]  = useState<StockResultData | null>(null)

  useEffect(() => {
    // history_moved=true 인 주문만 출고내역에 표시
    setShipped(loadShippedOrders().filter(o => o.history_moved === true))
    setMappings(loadMappings())
  }, [])

  /* 날짜/월별 필터 → 검색 */
  const displayOrders = useMemo(() => {
    let list: ShippedOrder[]
    if (viewMode === 'daily') {
      list = shipped.filter(o => (o.shipped_at ?? o.order_date).slice(0, 10) === selDate)
    } else {
      list = shipped.filter(o => (o.shipped_at ?? o.order_date).slice(0, 7) === selMonth)
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter(o => {
        const item    = o.items[0]
        const mapping = lookupMapping(mappings, item?.product_name ?? '', item?.option)
        const barcode = (mapping.barcode ?? item?.sku ?? '').toLowerCase()
        return (
          o.order_number.toLowerCase().includes(q) ||
          o.channel.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          barcode.includes(q) ||
          (o.tracking_number ?? '').toLowerCase().includes(q) ||
          (item?.product_name ?? '').toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [shipped, viewMode, selDate, selMonth, searchText, mappings])

  /* KPI */
  const todayShipped = useMemo(() => shipped.filter(o => o.shipped_at?.slice(0,10) === today).length, [shipped, today])
  const monthShipped = useMemo(() => shipped.filter(o => o.shipped_at?.slice(0,7) === curYM).length, [shipped, curYM])

  /* 쇼핑몰별 출고수량 (당월 누적 기준) */
  const mallShipStats = useMemo(() => {
    const map: Record<string, number> = {}
    shipped
      .filter(o => (o.shipped_at ?? o.order_date)?.slice(0, 7) === curYM)
      .forEach(o => { map[o.channel] = (map[o.channel] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [shipped, curYM])

  /* 선택한 쇼핑몰의 당월 상품별 누적 출고수량 */
  const [selectedMall, setSelectedMall] = useState<string | null>(null)
  type MallProductStat = { product_name: string; option: string; barcode: string; quantity: number }
  const mallOrderList = useMemo((): MallProductStat[] => {
    if (!selectedMall) return []
    const map: Record<string, MallProductStat> = {}
    shipped
      .filter(o =>
        (o.shipped_at ?? o.order_date)?.slice(0, 7) === curYM &&
        o.channel === selectedMall
      )
      .forEach(o => {
        o.items.forEach(item => {
          const barcode = (item.sku ?? '').trim()
          const key = barcode || `${item.product_name}__${item.option ?? ''}`
          if (!map[key]) {
            map[key] = { product_name: item.product_name, option: item.option ?? '', barcode, quantity: 0 }
          }
          map[key].quantity += item.quantity
        })
      })
    return Object.values(map).sort((a, b) => b.quantity - a.quantity)
  }, [shipped, curYM, selectedMall])

  /* 체크박스 */
  const allChecked = displayOrders.length > 0 && displayOrders.every(o => checked.has(o.id))
  const toggleAll  = () => {
    if (allChecked) setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.delete(o.id)); return n })
    else            setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.add(o.id)); return n })
  }
  const toggleOne = (id: string) => {
    if (editingId) return
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  /* ── 인라인 편집 시작 ── */
  const startEdit = (o: ShippedOrder, barcode: string) => {
    setEditingId(o.id)
    setEditFields({
      shipped_at     : o.shipped_at ? o.shipped_at.slice(0, 10) : o.order_date,
      channel        : o.channel,
      customer_name  : o.customer_name,
      tracking_number: o.tracking_number ?? '',
      product_name   : o.items[0]?.product_name ?? '',
      option         : o.items[0]?.option ?? '',
      barcode        : barcode,
      unit_price     : String(o.items[0]?.unit_price ?? ''),
    })
  }

  /* ── 인라인 편집 저장 ── */
  const saveEdit = (id: string) => {
    if (!editFields) return
    const updated = shipped.map(o => {
      if (o.id !== id) return o
      return {
        ...o,
        shipped_at     : editFields.shipped_at ? `${editFields.shipped_at}T00:00:00.000Z` : o.shipped_at,
        channel        : editFields.channel || o.channel,
        customer_name  : editFields.customer_name || o.customer_name,
        tracking_number: editFields.tracking_number || o.tracking_number,
        items: o.items.map((item, i) => i === 0 ? {
          ...item,
          product_name: editFields.product_name || item.product_name,
          option      : editFields.option,
          sku         : editFields.barcode || item.sku,
          unit_price  : editFields.unit_price !== '' ? Number(editFields.unit_price) : item.unit_price,
        } : item),
      }
    })
    saveShippedOrders(updated)
    setShipped(updated)
    setEditingId(null)
    setEditFields(null)
  }

  const cancelEdit = () => { setEditingId(null); setEditFields(null) }

  /* 출고일 변경 */
  const [changeDateMode, setChangeDateMode] = useState(false)
  const [newDate, setNewDate] = useState('')
  const handleChangeDate = () => {
    if (!newDate || checked.size === 0) return
    const updated = shipped.map(o =>
      checked.has(o.id) ? { ...o, shipped_at: `${newDate}T00:00:00.000Z` } : o
    )
    saveShippedOrders(updated); setShipped(updated)
    setChecked(new Set()); setChangeDateMode(false); setNewDate('')
    alert(`${checked.size}건의 출고일이 ${newDate}로 변경되었습니다.`)
  }

  /* 출고취소 */
  const handleCancelShipping = () => {
    if (checked.size === 0) return
    if (!confirm(`선택한 ${checked.size}건의 출고를 취소하시겠습니까?`)) return
    const toCancel  = shipped.filter(o => checked.has(o.id))
    const remaining = shipped.filter(o => !checked.has(o.id))
    saveShippedOrders(remaining); setShipped(remaining)
    const allOrders = loadOrders()
    const cancelIds = new Set(toCancel.map(o => o.id))
    saveOrders(allOrders.map(o => cancelIds.has(o.id) ? { ...o, status: 'shipped' as const } : o))
    setChecked(new Set())
  }

  /* 출고내역 → CS접수 등록 */
  const handleCsRegister = () => {
    const targets = displayOrders.filter(o => checked.has(o.id))
    if (targets.length === 0) return
    const mappingsSnap = loadMappings()
    const existing     = loadCs()
    const newItems: CsItem[] = targets.map(o => {
      const item    = o.items[0]
      const mapping = lookupMapping(mappingsSnap, item?.product_name ?? '', item?.option)
      const barcode = (mapping.barcode ?? item?.sku ?? '').trim()
      const prod    = lookupProductByBarcode(barcode)
      return {
        id             : crypto.randomUUID(),
        type           : csType,
        mall           : o.channel,
        customer_name  : o.customer_name,
        option_image   : prod?.option_image   ?? '',
        product_abbr   : prod?.product_abbr   ?? '',
        option_name    : prod?.option_name    ?? item?.option ?? '',
        barcode,
        quantity       : item?.quantity ?? 1,
        reason         : csReason,
        tracking_number: o.tracking_number ?? '',
        registered_at  : new Date().toISOString(),
        status         : 'pending',
      }
    })
    saveCs([...newItems, ...existing])
    setCsModal(false)
    setChecked(new Set())
    alert(`${newItems.length}건이 CS접수(${csType === 'return' ? '반품' : '교환'})로 등록되었습니다.\nCS관리 탭에서 확인하세요.`)
  }

  /* 출고내역 엑셀 다운로드 */
  const handleDownloadHistory = () => {
    if (displayOrders.length === 0) return alert('다운로드할 출고내역이 없습니다.')
    const now     = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
    const rows = displayOrders.map(o => {
      const item    = o.items[0]
      const mapping = lookupMapping(mappings, item?.product_name ?? '', item?.option)
      const barcode = mapping.barcode ?? item?.sku ?? ''
      return {
        '출고일': o.shipped_at ? o.shipped_at.slice(0,10) : o.order_date,
        '주문번호': o.order_number, '쇼핑몰': o.channel, '바코드': barcode,
        '상품명': item?.product_name ?? '', '옵션': item?.option ?? '',
        '수량': item?.quantity ?? 1, '판매가': item?.unit_price ?? 0,
        '수취인': o.customer_name, '연락처': o.customer_phone ?? '',
        '배송주소': o.shipping_address, '택배사': o.carrier ?? '',
        '운송장번호': o.tracking_number ?? '',
        '상태': (o as ShippedOrder & { status?: string }).status === 'delivered' ? '출고확정' : '출고',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '출고내역')
    const out  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/octet-stream' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${dateStr}_출고내역.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  /* ── 출고확정 실제 처리 ── */
  const [isConfirming, setIsConfirming] = useState(false)

  /* ── 재고 차감 공통 로직 ── */
  const runStockDeduction = (orders: ShippedOrder[]) => {
    const currentMappings = loadMappings()
    const products        = loadCachedProducts()
    const stockChanges: Record<string, Record<number, number>> = {}
    const notFound: string[] = []
    const stockAppliedIds = new Set<string>()

    orders.forEach(order => {
      const item = order.items[0]
      if (!item) return
      const mapping = lookupMapping(currentMappings, item.product_name ?? '', item.option)
      // mapping.barcode 우선, 없으면 item.sku(출고내역에 표시된 바코드) 사용
      const barcode = mapping.barcode ?? item.sku
      if (!barcode) { notFound.push(item.product_name ?? '?'); return }
      let found = false
      products.forEach(product => {
        product.options.forEach((opt, i) => {
          if (opt.barcode === barcode && !found) {
            found = true
            const cur = opt.current_stock !== undefined
              ? opt.current_stock
              : Math.max(0, (opt.received ?? 0) - (opt.sold ?? 0))
            const qty = item.quantity ?? 1
            if (!stockChanges[product.id]) stockChanges[product.id] = {}
            stockChanges[product.id][i] = (stockChanges[product.id][i] ?? cur) - qty
          }
        })
      })
      if (found) stockAppliedIds.add(order.id)
      else notFound.push(item.product_name ?? '?')
    })

    const updatedProducts = products.map(p => {
      const changes = stockChanges[p.id]
      if (!changes) return p
      return { ...p, options: p.options.map((o, i) => i in changes ? { ...o, current_stock: Math.max(0, changes[i]) } : o) }
    })

    return { stockChanges, updatedProducts, notFound, stockAppliedIds }
  }

  const doConfirmShipping = async (toConfirm: ShippedOrder[]) => {
    setIsConfirming(true)
    try {
      const { stockChanges, updatedProducts, notFound, stockAppliedIds } = runStockDeduction(toConfirm)

      saveCachedProducts(updatedProducts)
      await Promise.all(Object.keys(stockChanges).map(async pid => {
        const p = updatedProducts.find(pp => pp.id === pid)
        if (!p) return
        await fetch('/api/pm-products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pid, options: p.options }) })
      }))
      const confirmedIds   = new Set(toConfirm.map(o => o.id))
      const updatedShipped = shipped.map(o =>
        confirmedIds.has(o.id)
          ? { ...o, status: 'delivered' as const, stock_applied: stockAppliedIds.has(o.id) }
          : o
      )
      saveShippedOrders(updatedShipped)
      setShipped(updatedShipped)
      setChecked(new Set())

      /* ── 재고현황 수집 (0개·부족 상품) ── */
      const zeroItems: StockResultItem[] = []
      const lowItems:  StockResultItem[] = []
      updatedProducts.forEach(p => {
        const changes = stockChanges[p.id]
        if (!changes) return
        p.options.forEach((opt, i) => {
          if (!(i in changes)) return
          const stock = opt.current_stock ?? 0
          const row: StockResultItem = {
            productName: p.name ?? p.abbr ?? p.id,
            optionName : opt.korean_name ?? opt.name ?? '',
            barcode    : opt.barcode ?? '',
            stock,
          }
          if (stock === 0)                                  zeroItems.push(row)
          else if (stock > 0 && stock <= LOW_STOCK_THRESHOLD) lowItems.push(row)
        })
      })
      setStockResultData({
        confirmedCount: toConfirm.length,
        zeroItems,
        lowItems,
        notFoundNames : [...new Set(notFound)],
      })
      setStockResultModal(true)
    } finally {
      setIsConfirming(false)
    }
  }

  /* ── 재고 재반영 (이미 출고확정된 주문에 재고 차감 적용) ── */
  const handleReapplyStock = async () => {
    if (checked.size === 0) return
    const targets = displayOrders.filter(o => checked.has(o.id) && o.status === 'delivered')
    if (targets.length === 0) {
      alert('출고확정(초록 표시)된 항목만 재고 재반영이 가능합니다.')
      return
    }
    const alreadyApplied = targets.filter(o => o.stock_applied === true)
    const msg = alreadyApplied.length > 0
      ? `선택한 ${targets.length}건 중 ${alreadyApplied.length}건은 이미 재고가 반영됐습니다.\n중복 차감 주의! 계속 진행하시겠습니까?`
      : `선택한 ${targets.length}건의 재고를 차감합니다.\n(출고내역 바코드 → 상품관리 재고 차감)`
    if (!confirm(msg)) return

    setIsConfirming(true)
    try {
      const { stockChanges, updatedProducts, notFound, stockAppliedIds } = runStockDeduction(targets)

      saveCachedProducts(updatedProducts)
      await Promise.all(Object.keys(stockChanges).map(async pid => {
        const p = updatedProducts.find(pp => pp.id === pid)
        if (!p) return
        await fetch('/api/pm-products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pid, options: p.options }),
        })
      }))

      // stock_applied 플래그 업데이트 (상태변경 없이 재고 반영 표시만 갱신)
      const targetIds      = new Set(targets.map(o => o.id))
      const updatedShipped = shipped.map(o =>
        targetIds.has(o.id)
          ? { ...o, stock_applied: stockAppliedIds.has(o.id) }
          : o
      )
      saveShippedOrders(updatedShipped)
      setShipped(updatedShipped)
      setChecked(new Set())

      /* 재고현황 결과 팝업 */
      const zeroItems: StockResultItem[] = []
      const lowItems:  StockResultItem[] = []
      updatedProducts.forEach(p => {
        const changes = stockChanges[p.id]
        if (!changes) return
        p.options.forEach((opt, i) => {
          if (!(i in changes)) return
          const stock = opt.current_stock ?? 0
          const row: StockResultItem = {
            productName: p.name ?? p.abbr ?? p.id,
            optionName : opt.korean_name ?? opt.name ?? '',
            barcode    : opt.barcode ?? '',
            stock,
          }
          if (stock === 0)                                      zeroItems.push(row)
          else if (stock > 0 && stock <= LOW_STOCK_THRESHOLD)  lowItems.push(row)
        })
      })
      setStockResultData({
        confirmedCount: targets.length,
        zeroItems,
        lowItems,
        notFoundNames: [...new Set(notFound)],
      })
      setStockResultModal(true)
    } finally {
      setIsConfirming(false)
    }
  }

  /* ── 출고확정 버튼: 바코드 미설정 사전 점검 ── */
  const handleConfirmShipping = () => {
    if (checked.size === 0) return
    const toConfirm     = displayOrders.filter(o => checked.has(o.id))
    const currentMappings = loadMappings()

    // 바코드 없는 (product_name, option) 쌍 수집
    // mapping.barcode 또는 item.sku 중 하나라도 있으면 바코드 있음으로 처리
    const seen = new Map<string, UnmappedItem>()
    toConfirm.forEach(order => {
      const item = order.items[0]
      if (!item) return
      const mapping = lookupMapping(currentMappings, item.product_name ?? '', item.option)
      if (!mapping.barcode && !item.sku) {
        const key = makeMappingKey(item.product_name, item.option)
        if (!seen.has(key)) {
          seen.set(key, {
            product_name: item.product_name ?? '',
            option:       item.option ?? '',
            mappingKey:   key,
            orders:       [],
          })
        }
        seen.get(key)!.orders.push({ id: order.id, order_number: order.order_number })
      }
    })

    if (seen.size > 0) {
      // 바코드 미설정 항목이 있으면 경고 모달 표시
      const items = [...seen.values()]
      setUnmappedItems(items)
      setUnmappedInputs(Object.fromEntries(items.map(u => [u.mappingKey, ''])))
      setAutoFillResults({})
      setAutoMatchRan(false)
      setBarcodeWarnModal(true)
      return
    }

    // 모두 매핑된 경우 바로 진행
    if (!confirm(`선택한 ${toConfirm.length}건을 출고확정하시겠습니까?\n바코드 기준으로 상품 재고가 차감됩니다.`)) return
    doConfirmShipping(toConfirm)
  }

  /* ── 자동 바코드 매칭 ── */
  const handleAutoMatch = () => {
    const products = loadCachedProducts()
    const results: Record<string, AutoMatchResult | null> = {}
    const newInputs = { ...unmappedInputs }

    for (const u of unmappedItems) {
      // 이미 직접 입력된 경우 덮어쓰지 않음
      if (newInputs[u.mappingKey]?.trim()) continue
      const result = autoMatchBarcode(u.product_name, u.option, products)
      results[u.mappingKey] = result
      if (result) newInputs[u.mappingKey] = result.barcode
    }

    setAutoFillResults(results)
    setUnmappedInputs(newInputs)
    setAutoMatchRan(true)
  }

  /* ── 바코드 저장 후 출고확정 ── */
  const handleSaveBarcodeAndConfirm = () => {
    // 모든 입력 필드 채워졌는지 검증
    const missing = unmappedItems.filter(u => !unmappedInputs[u.mappingKey]?.trim())
    if (missing.length > 0) {
      alert(`바코드를 입력하지 않은 항목이 ${missing.length}개 있습니다.\n모든 항목에 바코드를 입력해주세요.`)
      return
    }

    // 매핑 저장
    const currentMappings = loadMappings()
    const updated = { ...currentMappings }
    for (const item of unmappedItems) {
      const barcode  = unmappedInputs[item.mappingKey].trim()
      const existing = currentMappings[item.mappingKey]
      const base     = existing ? { ...existing } : { abbreviation: '', loca: '' }
      updated[item.mappingKey] = { ...base, barcode }
    }
    saveMappings(updated)
    setMappings(updated)
    setBarcodeWarnModal(false)

    // 저장 완료 후 출고확정 진행
    const toConfirm = displayOrders.filter(o => checked.has(o.id))
    if (!confirm(`바코드 매핑 완료! ${toConfirm.length}건을 출고확정하시겠습니까?`)) return
    doConfirmShipping(toConfirm)
  }

  /* ── 편집 인풋 스타일 ── */
  const ei: React.CSSProperties = {
    width: '100%', height: 28, fontSize: 11, fontWeight: 700,
    border: '1.5px solid #3b82f6', borderRadius: 6, padding: '0 6px',
    outline: 'none', background: '#fafcff', color: '#0f172a',
  }

  /* ─── 그리드 컬럼 ─────────────────────────────────────── */
  // 체크 | 주문번호 | 출고일 | 쇼핑몰 | 수령인 | 바코드 | 상품명/옵션 | 판매가 | 운송장번호 | 수정
  const GRID = '36px 130px 78px 84px 80px 100px 1fr 70px 110px 60px'

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* KPI + 쇼핑몰별 출고수량 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 14 }}>
        {/* KPI 3개 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {[
            { label: '오늘 출고',   value: todayShipped,   color: '#2563eb', bg: '#eff6ff', icon: <Truck size={16} style={{ color: '#2563eb' }} /> },
            { label: '이번달 출고', value: monthShipped,   color: '#7c3aed', bg: '#f5f3ff', icon: <CheckCircle2 size={16} style={{ color: '#7c3aed' }} /> },
            { label: '전체 출고',   value: shipped.length, color: '#059669', bg: '#ecfdf5', icon: <Package size={16} style={{ color: '#059669' }} /> },
          ].map(k => (
            <div key={k.label} className="pm-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginTop: 2 }}>{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 쇼핑몰별 출고수량 + TOP3 */}
        <div className="pm-card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Truck size={13} style={{ color: '#64748b' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>쇼핑몰별 출고수량</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              ({curYM.replace('-','년 ')}월 누적 · {mallShipStats.reduce((s,[,c])=>s+c,0)}건)
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>버튼 클릭 → 주문목록</span>
          </div>
          {mallShipStats.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>이번달 출고내역 없음</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 7 }}>
              {mallShipStats.map(([ch, cnt], i) => {
                const max = mallShipStats[0][1]
                const pct = Math.round((cnt / max) * 100)
                const medals = ['🥇','🥈','🥉']
                const isSelected = selectedMall === ch
                return (
                  <button key={ch} onClick={() => setSelectedMall(isSelected ? null : ch)}
                    style={{
                      borderRadius: 10, padding: '8px 12px', cursor: 'pointer', textAlign: 'left', width: '100%',
                      background: isSelected ? '#eff6ff' : i === 0 ? '#fef9c3' : i === 1 ? '#f1f5f9' : i === 2 ? '#fff7ed' : '#f8fafc',
                      border: `1.5px solid ${isSelected?'#2563eb':i===0?'#fde047':i===1?'#e2e8f0':i===2?'#fed7aa':'#f1f5f9'}`,
                      transition: 'all 150ms',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: isSelected ? '#2563eb' : '#334155' }}>
                        {i < 3 ? <span style={{ marginRight: 3 }}>{medals[i]}</span> : null}{ch}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: isSelected ? '#2563eb' : i === 0 ? '#92400e' : i === 1 ? '#475569' : i === 2 ? '#c2410c' : '#64748b' }}>
                        {cnt}건
                      </span>
                    </div>
                    <div style={{ height: 4, background: '#e2e8f0', borderRadius: 99 }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: isSelected?'#3b82f6':i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#f97316':'#cbd5e1', transition: 'width 400ms' }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 선택된 쇼핑몰 상품별 누적 출고수량 */}
      {selectedMall && (
        <div className="pm-card" style={{ marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff' }}>
            <Truck size={13} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>
              {selectedMall} — {curYM.replace('-','년 ')}월 상품별 출고수량
            </span>
            <span style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600 }}>{mallOrderList.length}종</span>
            <button onClick={() => setSelectedMall(null)}
              style={{ marginLeft: 'auto', width: 24, height: 24, borderRadius: 6, border: 'none', background: '#dbeafe', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={13} style={{ color: '#2563eb' }} />
            </button>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {mallOrderList.length === 0 ? (
              <p style={{ padding: '16px', fontSize: 12, color: '#94a3b8' }}>목록 없음</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    {['상품명','옵션','바코드','수량'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', fontWeight: 800, color: '#64748b', fontSize: 10.5, textAlign: h === '수량' ? 'center' : 'left', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mallOrderList.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f0f9ff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                      <td style={{ padding: '7px 10px', color: '#0f172a', maxWidth: 220 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.product_name || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#64748b', fontSize: 11, maxWidth: 140 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.option ? `[${row.option}]` : '-'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
                        {row.barcode || '-'}
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 900, color: '#2563eb', textAlign: 'center', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {row.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 뷰 토글 + 날짜 네비 + 검색 + 버튼 */}
      <div className="pm-card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* 날짜별/월별 토글 */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e2e8f0', flexShrink: 0 }}>
          {(['daily', 'monthly'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer', background: viewMode === m ? '#0f172a' : 'transparent', color: viewMode === m ? '#fff' : '#64748b' }}>
              {m === 'daily' ? '날짜별' : '월별'}
            </button>
          ))}
        </div>

        {/* 날짜 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => viewMode === 'daily' ? setSelDate(shiftDate(selDate, -1)) : setSelMonth(shiftMonth(selMonth, -1))}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', minWidth: 190, textAlign: 'center' }}>
            {viewMode === 'daily' ? fmtDate(selDate) : `${selMonth.replace('-', '년 ')}월`}
          </span>
          <button onClick={() => viewMode === 'daily' ? setSelDate(shiftDate(selDate, 1)) : setSelMonth(shiftMonth(selMonth, 1))}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={14} />
          </button>
          {viewMode === 'daily' && selDate !== today && (
            <button onClick={() => setSelDate(today)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
              TODAY
            </button>
          )}
        </div>

        <input type="date" value={viewMode === 'daily' ? selDate : ''}
          onChange={e => { if (e.target.value) { setViewMode('daily'); setSelDate(e.target.value) } }}
          style={{ height: 32, fontSize: 12.5, fontWeight: 700, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0 8px', color: '#0f172a', cursor: 'pointer', outline: 'none' }}
        />

        {/* 검색창 */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="주문번호 · 쇼핑몰 · 수령인 · 바코드 · 운송장번호"
            style={{ paddingLeft: 30, paddingRight: 30, height: 32, width: 300, fontSize: 12, fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', color: '#0f172a' }}
          />
          {searchText && (
            <button onClick={() => setSearchText('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
              <X size={13} style={{ color: '#94a3b8' }} />
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* 선택 액션 버튼 */}
        {checked.size > 0 && (
          <>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '5px 10px', borderRadius: 8 }}>{checked.size}건 선택</span>
            <button onClick={handleConfirmShipping} disabled={isConfirming}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: isConfirming ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: isConfirming ? 'not-allowed' : 'pointer' }}>
              <PackageCheck size={13} /> {isConfirming ? '처리중...' : '출고확정'}
            </button>
            {/* 재고 재반영 버튼 — 이미 출고확정(delivered)된 항목에 재고를 수동 차감 */}
            <button onClick={handleReapplyStock} disabled={isConfirming}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: isConfirming ? '#94a3b8' : '#0369a1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: isConfirming ? 'not-allowed' : 'pointer' }}>
              <RefreshCw size={13} /> 재고 재반영
            </button>
            {!changeDateMode ? (
              <button onClick={() => { setChangeDateMode(true); setNewDate(selDate) }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                <ChevronLeft size={13} /> 출고일 변경
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  style={{ height: 32, fontSize: 12.5, fontWeight: 700, border: '1.5px solid #f59e0b', borderRadius: 8, padding: '0 8px', outline: 'none' }} />
                <button onClick={handleChangeDate}
                  style={{ padding: '6px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>적용</button>
                <button onClick={() => setChangeDateMode(false)}
                  style={{ padding: '6px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>취소</button>
              </div>
            )}
            <button onClick={handleCancelShipping}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <RotateCcw size={13} /> 출고취소
            </button>
          </>
        )}
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={14} style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
            {viewMode === 'daily' ? `${selDate} 출고내역` : `${selMonth.replace('-', '년 ')}월 출고내역`}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            ({displayOrders.length}건{searchText ? ' · 검색결과' : ''})
          </span>
          <div style={{ flex: 1 }} />
          {/* CS접수 버튼 — 항상 표시, 선택 시 활성화 */}
          <button
            onClick={() => {
              if (checked.size === 0) { alert('CS접수할 항목을 먼저 선택해주세요.'); return }
              setCsType('return'); setCsReason('simple_change'); setCsModal(true)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: checked.size > 0 ? '#7c3aed' : '#e9d5ff', color: checked.size > 0 ? '#fff' : '#a78bfa', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', transition: 'all 150ms' }}>
            <HeadphonesIcon size={13} /> CS접수{checked.size > 0 ? ` (${checked.size})` : ''}
          </button>
          {displayOrders.length > 0 && (
            <button onClick={handleDownloadHistory}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
              <FileDown size={13} /> 엑셀 다운로드
            </button>
          )}
        </div>

        {displayOrders.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
              {shipped.length === 0 ? '출고내역이 없습니다' : searchText ? '검색 결과가 없습니다' : '해당 기간 출고내역이 없습니다'}
            </p>
          </div>
        ) : (
          <div>
            {/* 컬럼 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
              <span onClick={toggleAll} style={{ cursor: 'pointer', fontSize: 13, color: allChecked ? '#2563eb' : '#cbd5e1' }}>
                {allChecked ? '☑' : '☐'}
              </span>
              {['주문번호', '출고일', '쇼핑몰', '수령인', '바코드', '상품명/옵션', '판매가', '운송장번호', '수정'].map(h => (
                <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>

            {/* 행 */}
            {displayOrders.map(o => {
              const isChk       = checked.has(o.id)
              const isDelivered = (o as ShippedOrder & { status?: string }).status === 'delivered'
              const item        = o.items[0]
              const ms          = mallStyle(o.channel)
              const mapping     = lookupMapping(mappings, item?.product_name ?? '', item?.option)
              const barcode     = mapping.barcode ?? item?.sku ?? ''
              const isEditing   = editingId === o.id

              if (isEditing && editFields) {
                return (
                  <div key={o.id} style={{ borderBottom: '2px solid #3b82f6', background: '#f0f7ff' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '10px 16px', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#3b82f6' }}>✎</span>
                      {/* 주문번호 (읽기전용) */}
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.order_number}
                      </span>
                      {/* 출고일 */}
                      <input type="date" value={editFields.shipped_at}
                        onChange={e => setEditFields(f => f ? { ...f, shipped_at: e.target.value } : f)}
                        style={ei} />
                      {/* 쇼핑몰 */}
                      <input value={editFields.channel}
                        onChange={e => setEditFields(f => f ? { ...f, channel: e.target.value } : f)}
                        style={ei} placeholder="쇼핑몰" />
                      {/* 수령인 */}
                      <input value={editFields.customer_name}
                        onChange={e => setEditFields(f => f ? { ...f, customer_name: e.target.value } : f)}
                        style={ei} placeholder="수령인" />
                      {/* 바코드 */}
                      <input value={editFields.barcode}
                        onChange={e => setEditFields(f => f ? { ...f, barcode: e.target.value } : f)}
                        style={{ ...ei, fontFamily: 'monospace' }} placeholder="바코드" />
                      {/* 상품명/옵션 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <input value={editFields.product_name}
                          onChange={e => setEditFields(f => f ? { ...f, product_name: e.target.value } : f)}
                          style={ei} placeholder="상품명" />
                        <input value={editFields.option}
                          onChange={e => setEditFields(f => f ? { ...f, option: e.target.value } : f)}
                          style={{ ...ei, fontSize: 10.5 }} placeholder="옵션" />
                      </div>
                      {/* 판매가 (수정 가능) */}
                      <input type="number" value={editFields.unit_price}
                        onChange={e => setEditFields(f => f ? { ...f, unit_price: e.target.value } : f)}
                        style={{ ...ei, textAlign: 'right' }} placeholder="판매가" />
                      {/* 운송장번호 */}
                      <input value={editFields.tracking_number}
                        onChange={e => setEditFields(f => f ? { ...f, tracking_number: e.target.value } : f)}
                        style={{ ...ei, fontFamily: 'monospace' }} placeholder="운송장번호" />
                      {/* 저장/취소 */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => saveEdit(o.id)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 28, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                          <Check size={11} /> 저장
                        </button>
                        <button onClick={cancelEdit}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 28, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                          <X size={11} /> 취소
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              const optLabel = item?.option ? `[${item.option}]` : ''
              return (
                <div key={o.id} onClick={() => toggleOne(o.id)}
                  style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '10px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center', background: isChk ? '#eff6ff' : isDelivered ? '#f0fdf4' : 'transparent', cursor: 'pointer', transition: 'background 100ms' }}>

                  <span style={{ fontSize: 14, color: isChk ? '#2563eb' : '#cbd5e1' }}>{isChk ? '☑' : '☐'}</span>

                  {/* 주문번호 */}
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.order_number}
                  </span>

                  {/* 출고일 */}
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {o.shipped_at ? o.shipped_at.slice(0, 10) : o.order_date}
                  </span>

                  {/* 쇼핑몰 */}
                  <span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: ms.color, background: ms.bg, padding: '2px 8px', borderRadius: 6 }}>
                      {o.channel}
                    </span>
                  </span>

                  {/* 수령인 */}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.customer_name}
                  </span>

                  {/* 바코드 */}
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {barcode || '-'}
                  </span>

                  {/* 상품명/옵션/수량 */}
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item?.product_name ?? '-'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, overflow: 'hidden' }}>
                      {optLabel && (
                        <span style={{ fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', flexShrink: 1 }}>
                          {optLabel}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        수량 {item?.quantity ?? 1}
                      </span>
                    </div>
                  </div>

                  {/* 판매가 */}
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#334155', textAlign: 'right' }}>
                    {item?.unit_price ? item.unit_price.toLocaleString() : '-'}
                  </span>

                  {/* 운송장번호 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#334155', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {o.tracking_number ?? '-'}
                    </span>
                    {isDelivered && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, width: 'fit-content' }}>
                        출고확정
                      </span>
                    )}
                  </div>

                  {/* 수정 버튼 */}
                  <button onClick={e => { e.stopPropagation(); startEdit(o, barcode) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#2563eb' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#475569' }}>
                    <Pencil size={11} /> 수정
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── 바코드 미설정 경고 모달 ── */}
      {barcodeWarnModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setBarcodeWarnModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(15,23,42,0.2)' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} style={{ color: '#f97316' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>바코드 미설정 상품</p>
                <p style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  바코드가 없는 상품이 <span style={{ color: '#f97316', fontWeight: 800 }}>{unmappedItems.length}종</span> 있습니다.
                </p>
              </div>
              <div style={{ flex: 1 }} />
              {/* 자동 설정 버튼 */}
              <button
                onClick={handleAutoMatch}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                <Wand2 size={14} /> 자동 설정
              </button>
              <button onClick={() => setBarcodeWarnModal(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} style={{ color: '#64748b' }} />
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>

              {/* 자동매칭 결과 요약 배너 */}
              {autoMatchRan && (() => {
                const autoCount   = Object.values(autoFillResults).filter(Boolean).length
                const manualCount = unmappedItems.length - autoCount
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Zap size={14} style={{ color: '#059669', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 900, color: '#059669', margin: 0 }}>자동완성 {autoCount}종</p>
                        <p style={{ fontSize: 10.5, color: '#16a34a', margin: 0 }}>상품관리에서 매칭됨</p>
                      </div>
                    </div>
                    <div style={{ background: manualCount > 0 ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${manualCount > 0 ? '#fed7aa' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Pencil size={14} style={{ color: manualCount > 0 ? '#d97706' : '#94a3b8', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 900, color: manualCount > 0 ? '#d97706' : '#94a3b8', margin: 0 }}>직접입력 {manualCount}종</p>
                        <p style={{ fontSize: 10.5, color: manualCount > 0 ? '#92400e' : '#cbd5e1', margin: 0 }}>아래에서 직접 입력하세요</p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* 미설정 항목 목록 + 바코드 입력 */}
              <div style={{ display: 'grid', gap: 10 }}>
                {unmappedItems.map((u, idx) => {
                  const autoResult  = autoFillResults[u.mappingKey]
                  const inputVal    = unmappedInputs[u.mappingKey] ?? ''
                  const isAutoFilled = !!autoResult && inputVal === autoResult.barcode
                  const isFilled    = inputVal.trim().length > 0
                  // 자동완성 후 사용자가 값을 수정한 경우
                  const isManualOverride = autoResult && inputVal.trim() && inputVal !== autoResult.barcode

                  return (
                    <div key={u.mappingKey} style={{
                      border: `2px solid ${isAutoFilled ? '#86efac' : isFilled ? '#6ee7b7' : '#e2e8f0'}`,
                      borderRadius: 12, padding: '14px 16px',
                      background: isAutoFilled ? '#f0fdf4' : '#fafafa',
                      transition: 'border-color 200ms, background 200ms',
                    }}>
                      {/* 상품 정보 행 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: isAutoFilled ? '#dcfce7' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: isAutoFilled ? '#059669' : '#f97316' }}>{idx + 1}</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', margin: 0 }}>
                            {u.product_name || '(상품명 없음)'}
                          </p>
                          {u.option && (
                            <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>[{u.option}]</p>
                          )}
                          {/* 자동매칭된 경우: 매칭된 상품 정보 표시 */}
                          {autoResult && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 4 }}>자동매칭</span>
                              <span style={{ fontSize: 10.5, color: '#475569' }}>
                                {autoResult.matchedProductName}
                                {autoResult.matchedOptionName ? ` · ${autoResult.matchedOptionName}` : ''}
                              </span>
                            </div>
                          )}
                          {/* 매칭 실패 */}
                          {autoMatchRan && autoFillResults[u.mappingKey] === null && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 4 }}>매칭 없음</span>
                              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>직접 입력하세요</span>
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 5, flexShrink: 0 }}>
                          {u.orders.length}건
                        </span>
                      </div>

                      {/* 바코드 입력 행 */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>바코드</label>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            value={inputVal}
                            onChange={e => {
                              setUnmappedInputs(prev => ({ ...prev, [u.mappingKey]: e.target.value }))
                            }}
                            placeholder={isAutoFilled ? '' : '바코드를 직접 입력하세요'}
                            style={{
                              width: '100%', height: 36, fontSize: 13, fontWeight: 700,
                              border: `1.5px solid ${isAutoFilled ? '#059669' : isFilled ? '#2563eb' : '#e2e8f0'}`,
                              borderRadius: 8, padding: '0 36px 0 10px', outline: 'none',
                              fontFamily: 'monospace', background: isAutoFilled ? '#f0fdf4' : '#fff',
                              color: '#0f172a', transition: 'border-color 150ms',
                              boxSizing: 'border-box',
                            }}
                          />
                          {isFilled && (
                            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                              {isAutoFilled
                                ? <Zap size={15} style={{ color: '#059669' }} />
                                : isManualOverride
                                ? <Pencil size={14} style={{ color: '#2563eb' }} />
                                : <CheckCircle2 size={15} style={{ color: '#059669' }} />}
                            </span>
                          )}
                        </div>
                        {/* 자동완성 값으로 되돌리기 */}
                        {isManualOverride && autoResult && (
                          <button
                            onClick={() => setUnmappedInputs(prev => ({ ...prev, [u.mappingKey]: autoResult.barcode }))}
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                            title="자동완성 값으로 되돌리기">
                            ↩ 자동
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 진행 상황 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: '#f8fafc', borderRadius: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>입력 완료:</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#059669' }}>
                  {Object.values(unmappedInputs).filter(v => v.trim()).length}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>/ {unmappedItems.length}종</span>
                {autoMatchRan && (
                  <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, background: '#f5f3ff', padding: '2px 8px', borderRadius: 5 }}>
                    자동완성 {Object.values(autoFillResults).filter(Boolean).length}종 포함
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                  ※ 저장 시 다음에도 자동 적용
                </span>
              </div>

              {/* 버튼 */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setBarcodeWarnModal(false)}
                  style={{ flex: 1, padding: '12px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  취소
                </button>
                <button
                  onClick={handleSaveBarcodeAndConfirm}
                  disabled={isConfirming}
                  style={{
                    flex: 2, padding: '12px 0', border: 'none', borderRadius: 10,
                    fontSize: 13, fontWeight: 800, cursor: isConfirming ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: Object.values(unmappedInputs).every(v => v.trim()) ? '#059669' : '#94a3b8',
                    color: '#fff', transition: 'background 200ms',
                  }}>
                  <PackageCheck size={15} />
                  {isConfirming ? '처리중...' : '바코드 저장 후 출고확정'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CS접수 모달 ── */}
      {csModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setCsModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(15,23,42,0.18)' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <HeadphonesIcon size={18} style={{ color: '#7c3aed' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>CS접수 등록</p>
                <p style={{ fontSize: 11.5, color: '#94a3b8' }}>선택한 {checked.size}건을 CS접수로 등록합니다</p>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setCsModal(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} style={{ color: '#64748b' }} />
              </button>
            </div>

            <div style={{ padding: '20px 22px', display: 'grid', gap: 18 }}>

              {/* 유형 선택 */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 10 }}>CS 유형</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([['return', '반품', RotateCcw, '#dc2626', '#fff1f2'], ['exchange', '교환', RefreshCw, '#7c3aed', '#f5f3ff']] as const).map(([val, label, Icon, color, bg]) => (
                    <div key={val} onClick={() => setCsType(val)}
                      style={{ padding: '14px 16px', borderRadius: 12, border: `2px solid ${csType === val ? color : '#e2e8f0'}`, background: csType === val ? bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 120ms' }}>
                      <Icon size={16} style={{ color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{label}</p>
                        <p style={{ fontSize: 10.5, color: '#94a3b8' }}>{val === 'return' ? '상품을 돌려받음' : '새 상품으로 교체'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 사유 선택 */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 10 }}>사유</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([['simple_change', '단순변심', Clock, '#2563eb', '#eff6ff'], ['defective', '불량', AlertTriangle, '#f97316', '#fff7ed']] as const).map(([val, label, Icon, color, bg]) => (
                    <div key={val} onClick={() => setCsReason(val)}
                      style={{ padding: '14px 16px', borderRadius: 12, border: `2px solid ${csReason === val ? color : '#e2e8f0'}`, background: csReason === val ? bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 120ms' }}>
                      <Icon size={16} style={{ color, flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{label}</p>
                        <p style={{ fontSize: 10.5, color: '#94a3b8' }}>{val === 'defective' ? '불량수량 +처리' : '재고수량 +복원'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 선택 항목 미리보기 */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 8 }}>접수 대상 ({checked.size}건)</p>
                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                  {displayOrders.filter(o => checked.has(o.id)).map((o, idx) => {
                    const item    = o.items[0]
                    const mapping = lookupMapping(mappings, item?.product_name ?? '', item?.option)
                    const barcode = mapping.barcode ?? item?.sku ?? ''
                    const qty     = item?.quantity ?? 1
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: idx < checked.size - 1 ? '1px solid #f8fafc' : 'none', background: '#fafafe' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: '#2563eb' }}>{idx + 1}</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>{o.customer_name}</span>
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{o.channel}</span>
                            {/* 주문 수량 표시 */}
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', padding: '1px 6px', borderRadius: 5 }}>
                              수량 {qty}개
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>{barcode || '-'}</span>
                            {item?.option && <span style={{ fontSize: 10, color: '#64748b' }}>[{item.option}]</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#64748b', flexShrink: 0 }}>
                          {o.tracking_number ?? '-'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 등록 버튼 */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCsModal(false)}
                  style={{ flex: 1, padding: '12px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  취소
                </button>
                <button onClick={handleCsRegister}
                  style={{ flex: 2, padding: '12px 0', background: csType === 'return' ? '#dc2626' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {csType === 'return' ? <RotateCcw size={14} /> : <RefreshCw size={14} />}
                  {checked.size}건 {csType === 'return' ? '반품' : '교환'} 접수 등록
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 출고확정 후 재고현황 팝업 ── */}
      {stockResultModal && stockResultData && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}
        >
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 28px 72px rgba(15,23,42,0.22)' }}>

            {/* 헤더 */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 13, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <PackageCheck size={20} style={{ color: '#059669' }} />
              </div>
              <div>
                <p style={{ fontSize: 15.5, fontWeight: 900, color: '#0f172a', margin: 0 }}>출고확정 완료</p>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  <span style={{ fontWeight: 800, color: '#059669' }}>{stockResultData.confirmedCount}건</span> 출고확정 · 재고 차감 결과
                </p>
              </div>
            </div>

            <div style={{ padding: '18px 24px', display: 'grid', gap: 16 }}>

              {/* 재고 미차감 상품 (바코드 없음) */}
              {stockResultData.notFoundNames.length > 0 && (
                <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <AlertTriangle size={15} style={{ color: '#f97316', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#9a3412' }}>재고 미차감 상품 ({stockResultData.notFoundNames.length}종)</span>
                    <span style={{ fontSize: 11, color: '#c2410c' }}>— 바코드 매핑 없음</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {stockResultData.notFoundNames.map((name, i) => (
                      <span key={i} style={{ fontSize: 11.5, fontWeight: 700, background: '#ffedd5', color: '#9a3412', padding: '3px 10px', borderRadius: 6 }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 재고 소진 (0개) */}
              {stockResultData.zeroItems.length > 0 ? (
                <div style={{ border: '2px solid #fecaca', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#fef2f2', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Package size={14} style={{ color: '#dc2626' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>재고 소진 상품</span>
                    <span style={{ fontSize: 12, fontWeight: 800, background: '#dc2626', color: '#fff', padding: '1px 8px', borderRadius: 20, marginLeft: 2 }}>{stockResultData.zeroItems.length}종</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {stockResultData.zeroItems.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: i < stockResultData.zeroItems.length - 1 ? '1px solid #fff1f2' : 'none', background: i % 2 === 0 ? '#fff' : '#fff8f8' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {item.productName}
                          </p>
                          {item.optionName && (
                            <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>[{item.optionName}]</p>
                          )}
                        </div>
                        {item.barcode && (
                          <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0 }}>{item.barcode}</span>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626', background: '#fee2e2', padding: '2px 10px', borderRadius: 20, flexShrink: 0 }}>0개</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                  <CheckCircle2 size={15} style={{ color: '#059669', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#15803d' }}>재고 소진 상품 없음</span>
                </div>
              )}

              {/* 재고 부족 (1 ~ LOW_STOCK_THRESHOLD) */}
              {stockResultData.lowItems.length > 0 ? (
                <div style={{ border: '2px solid #fde68a', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: '#fffbeb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <TrendingDown size={14} style={{ color: '#d97706' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#b45309' }}>재고 부족 상품</span>
                    <span style={{ fontSize: 11.5, color: '#92400e' }}>({LOW_STOCK_THRESHOLD}개 이하)</span>
                    <span style={{ fontSize: 12, fontWeight: 800, background: '#d97706', color: '#fff', padding: '1px 8px', borderRadius: 20, marginLeft: 2 }}>{stockResultData.lowItems.length}종</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {stockResultData.lowItems.sort((a, b) => a.stock - b.stock).map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: i < stockResultData.lowItems.length - 1 ? '1px solid #fef9c3' : 'none', background: i % 2 === 0 ? '#fff' : '#fffdf0' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {item.productName}
                          </p>
                          {item.optionName && (
                            <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>[{item.optionName}]</p>
                          )}
                        </div>
                        {item.barcode && (
                          <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0 }}>{item.barcode}</span>
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 900, flexShrink: 0,
                          color: item.stock <= 3 ? '#dc2626' : '#d97706',
                          background: item.stock <= 3 ? '#fee2e2' : '#fef3c7',
                          padding: '2px 10px', borderRadius: 20,
                        }}>{item.stock}개</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                  <CheckCircle2 size={15} style={{ color: '#059669', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#15803d' }}>재고 부족 상품 없음</span>
                </div>
              )}

            </div>

            {/* 확인 버튼 */}
            <div style={{ padding: '0 24px 22px' }}>
              <button
                onClick={() => setStockResultModal(false)}
                style={{ width: '100%', padding: '13px 0', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'background 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1e293b' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0f172a' }}
              >
                확인
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
