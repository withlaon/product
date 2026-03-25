'use client'

import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { ChevronLeft, ChevronRight, Package, Truck, CheckCircle2, RotateCcw, PackageCheck, FileDown, Pencil, Check, X, Search, HeadphonesIcon, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import {
  loadShippedOrders, saveShippedOrders, loadOrders, saveOrders,
  loadMappings, saveMappings, lookupMapping, makeMappingKey,
} from '@/lib/orders'
import type { ShippedOrder } from '@/lib/orders'

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
type CachedOption = { barcode?: string; name?: string; current_stock?: number; received?: number; sold?: number; [k: string]: unknown }
type CachedProduct = { id: string; options: CachedOption[] }
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
  const [barcodeWarnModal, setBarcodeWarnModal] = useState(false)
  const [unmappedItems,    setUnmappedItems]    = useState<UnmappedItem[]>([])
  const [unmappedInputs,   setUnmappedInputs]   = useState<Record<string, string>>({})

  useEffect(() => {
    setShipped(loadShippedOrders())
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
    return Object.values(map).sort((a, b) => a.barcode.localeCompare(b.barcode))
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

  const doConfirmShipping = async (toConfirm: ShippedOrder[]) => {
    setIsConfirming(true)
    try {
      const currentMappings = loadMappings()
      const products        = loadCachedProducts()
      const stockChanges: Record<string, Record<number, number>> = {}
      const notFound: string[] = []
      toConfirm.forEach(order => {
        const item = order.items[0]
        if (!item) return
        const mapping = lookupMapping(currentMappings, item.product_name ?? '', item.option)
        const barcode = mapping.barcode
        if (!barcode) { notFound.push(item.product_name ?? '?'); return }
        let found = false
        products.forEach(product => {
          product.options.forEach((opt, i) => {
            if (opt.barcode === barcode && !found) {
              found = true
              const cur = opt.current_stock !== undefined ? opt.current_stock : Math.max(0, (opt.received ?? 0) - (opt.sold ?? 0))
              const qty = item.quantity ?? 1
              if (!stockChanges[product.id]) stockChanges[product.id] = {}
              stockChanges[product.id][i] = (stockChanges[product.id][i] ?? cur) - qty
            }
          })
        })
        if (!found) notFound.push(item.product_name ?? '?')
      })
      const updatedProducts = products.map(p => {
        const changes = stockChanges[p.id]
        if (!changes) return p
        return { ...p, options: p.options.map((o, i) => i in changes ? { ...o, current_stock: Math.max(0, changes[i]) } : o) }
      })
      saveCachedProducts(updatedProducts)
      await Promise.all(Object.keys(stockChanges).map(async pid => {
        const p = updatedProducts.find(pp => pp.id === pid)
        if (!p) return
        await fetch('/api/pm-products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pid, options: p.options }) })
      }))
      const confirmedIds   = new Set(toConfirm.map(o => o.id))
      const updatedShipped = shipped.map(o => confirmedIds.has(o.id) ? { ...o, status: 'delivered' as const } : o)
      saveShippedOrders(updatedShipped)
      setShipped(updatedShipped)
      setChecked(new Set())
      alert(notFound.length > 0
        ? `${toConfirm.length}건 출고확정 완료.\n재고 미차감: ${[...new Set(notFound)].join(', ')}`
        : `${toConfirm.length}건 출고확정 완료.`)
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
    const seen = new Map<string, UnmappedItem>()
    toConfirm.forEach(order => {
      const item = order.items[0]
      if (!item) return
      const mapping = lookupMapping(currentMappings, item.product_name ?? '', item.option)
      if (!mapping.barcode) {
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
      setBarcodeWarnModal(true)
      return
    }

    // 모두 매핑된 경우 바로 진행
    if (!confirm(`선택한 ${toConfirm.length}건을 출고확정하시겠습니까?\n바코드 기준으로 상품 재고가 차감됩니다.`)) return
    doConfirmShipping(toConfirm)
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
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 580, maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(15,23,42,0.2)' }}>

            {/* 모달 헤더 */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} style={{ color: '#f97316' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>바코드 미설정 상품</p>
                <p style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  바코드가 없는 상품이 <span style={{ color: '#f97316', fontWeight: 800 }}>{unmappedItems.length}종</span> 있습니다. 바코드를 입력해야 출고확정이 가능합니다.
                </p>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setBarcodeWarnModal(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} style={{ color: '#64748b' }} />
              </button>
            </div>

            <div style={{ padding: '20px 22px', display: 'grid', gap: 14 }}>

              {/* 안내 배너 */}
              <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.6 }}>
                  아래 상품들은 매핑 테이블에 바코드가 없습니다.<br />
                  각 항목에 바코드를 직접 입력하면 매핑이 저장되고 출고확정이 진행됩니다.
                </p>
              </div>

              {/* 미설정 항목 목록 + 바코드 입력 */}
              <div style={{ display: 'grid', gap: 10 }}>
                {unmappedItems.map((u, idx) => (
                  <div key={u.mappingKey} style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, color: '#f97316' }}>{idx + 1}</span>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {u.product_name || '(상품명 없음)'}
                        </p>
                        {u.option && (
                          <p style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>[{u.option}]</p>
                        )}
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 5, flexShrink: 0 }}>
                        {u.orders.length}건
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>바코드</label>
                      <input
                        value={unmappedInputs[u.mappingKey] ?? ''}
                        onChange={e => setUnmappedInputs(prev => ({ ...prev, [u.mappingKey]: e.target.value }))}
                        placeholder="바코드를 입력하세요"
                        style={{
                          flex: 1, height: 34, fontSize: 12.5, fontWeight: 700,
                          border: `1.5px solid ${unmappedInputs[u.mappingKey]?.trim() ? '#059669' : '#e2e8f0'}`,
                          borderRadius: 8, padding: '0 10px', outline: 'none',
                          fontFamily: 'monospace', background: '#fff', color: '#0f172a',
                          transition: 'border-color 150ms',
                        }}
                      />
                      {unmappedInputs[u.mappingKey]?.trim() && (
                        <CheckCircle2 size={18} style={{ color: '#059669', flexShrink: 0 }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 진행 상황 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>입력 완료:</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#059669' }}>
                  {Object.values(unmappedInputs).filter(v => v.trim()).length}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>/ {unmappedItems.length}개</span>
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
    </div>
  )
}
