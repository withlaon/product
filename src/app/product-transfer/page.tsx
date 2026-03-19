'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, Calendar, Package, Map, Printer,
  Truck, X, Save, ChevronLeft, ChevronRight,
  BarChart2, ListFilter, CheckSquare, Square,
  ChevronDown, Link2, Link2Off, Search, AlertCircle,
} from 'lucide-react'
import {
  loadOrders, saveOrders, loadMappings, saveMappings, extractColor,
  saveSelectedForInvoice, STATUS_MAP, makeMappingKey, lookupMapping, splitMappingKey,
} from '@/lib/orders'
import type { Order, MappingStore } from '@/lib/orders'

/* ─── 내 상품 타입 (상품관리에서 로드) ─────────────────── */
interface MyProductOption {
  name: string
  size: string
  korean_name: string
  barcode?: string
}
interface MyProduct {
  id: string
  code: string
  name: string
  abbr: string
  loca: string
  options: MyProductOption[]
}

const PRODUCTS_CACHE_KEY = 'pm_products_cache_v1'
const PRODUCTS_CACHE_TTL = 10 * 60 * 1000
const FETCH_TIMEOUT = 12000

/** 스테일 캐시 포함 반환 - TTL이 지나도 일단 보여줌 */
function loadMyProductsFromCache(allowStale = true): MyProduct[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { ts: number; data: MyProduct[] }
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return []
    const isFresh = Date.now() - parsed.ts < PRODUCTS_CACHE_TTL
    if (isFresh || allowStale) return parsed.data
  } catch {}
  return []
}

function saveProductsToCache(data: MyProduct[]) {
  try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

async function fetchProductsWithTimeout(): Promise<MyProduct[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch('/api/pm-products', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return []
    const json = await res.json() as unknown
    return Array.isArray(json) ? (json as MyProduct[]) : []
  } catch {
    clearTimeout(timer)
    return []
  }
}

/* ─── 상품 검색 콤보박스 컴포넌트 ──────────────────────── */
function ProductCombobox({
  products,
  value,
  onChange,
}: {
  products: MyProduct[]
  value: string
  onChange: (productId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = products.find(p => p.id === value)
  const filtered = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.abbr.toLowerCase().includes(search.toLowerCase())
      )
    : products

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          height: 34, borderRadius: 8, border: `1.5px solid ${open ? '#2563eb' : '#e2e8f0'}`,
          padding: '0 10px', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          background: 'white', transition: 'border-color 150ms',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: selected ? '#0f172a' : '#94a3b8', fontWeight: selected ? 700 : 400, fontSize: 11.5 }}>
          {selected ? `[${selected.code}] ${selected.name}` : '상품 선택...'}
        </span>
        <ChevronDown size={11} style={{ color: '#94a3b8', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 50, overflow: 'hidden' }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="상품명·코드 검색..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, background: 'transparent' }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {value && (
              <div onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 11.5, color: '#dc2626', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 5 }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Link2Off size={11} /> 연결 해제
              </div>
            )}
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 10px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>상품이 없습니다</div>
            ) : filtered.map(p => (
              <div key={p.id} onClick={() => { onChange(p.id); setOpen(false); setSearch('') }}
                style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: p.id === value ? '#eff6ff' : 'transparent', transition: 'background 80ms' }}
                onMouseEnter={e => { if (p.id !== value) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (p.id !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#2563eb', marginRight: 6 }}>[{p.code}]</span>
                <span style={{ fontSize: 12, fontWeight: p.id === value ? 800 : 600, color: '#0f172a' }}>{p.name}</span>
                {p.abbr && <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 5 }}>· {p.abbr}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 하위 호환 re-export (product-edit-transfer가 import 함) ── */
export { loadOrders, saveOrders } from '@/lib/orders'
export { ORDERS_KEY } from '@/lib/orders'
export type { Order } from '@/lib/orders'

/* ─── 유틸 ──────────────────────────────────────────────── */
function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: string, n: number) {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00:00').getDay()]
  return `${y}년 ${parseInt(m)}월 ${parseInt(day)}일 (${dow})`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

/* ─── 피킹리스트 출력 ─────────────────────────────────────── */
function printPickingList(orders: Order[], mappings: MappingStore) {
  interface PickRow {
    order_number: string
    customer_name: string
    shipping_address: string
    abbreviation: string
    color: string
    quantity: number
    loca: string
    sku: string
  }

  const rows: PickRow[] = []
  for (const order of orders) {
    for (const item of order.items) {
      const m = lookupMapping(mappings, item.product_name, item.option)
      rows.push({
        order_number: order.order_number,
        customer_name: order.customer_name,
        shipping_address: order.shipping_address,
        abbreviation: m.abbreviation || item.product_name,
        color: extractColor(item.option ?? ''),
        quantity: item.quantity,
        loca: m.loca ?? '',
        sku: item.sku ?? '',
      })
    }
  }

  // LOCA 내림차순
  rows.sort((a, b) => b.loca.localeCompare(a.loca, 'ko'))

  // 같은 수령인+주소 카운트
  const addrCount: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.customer_name}||${r.shipping_address}`
    addrCount[k] = (addrCount[k] ?? 0) + 1
  }

  const today = getToday()
  const trRows = rows.map((r, i) => {
    const k = `${r.customer_name}||${r.shipping_address}`
    const isDup = addrCount[k] > 1
    const isQty2 = r.quantity >= 2
    let bg = ''
    if (isDup && isQty2) bg = 'background:#bbf7d0'
    else if (isDup)      bg = 'background:#bfdbfe'
    else if (isQty2)     bg = 'background:#fef9c3'
    return `<tr style="${bg}">
      <td style="text-align:center">${i + 1}</td>
      <td><b>${r.customer_name}</b></td>
      <td>${r.abbreviation}</td>
      <td>${r.color}</td>
      <td style="text-align:center;font-weight:900;${isQty2 ? 'color:#b45309' : ''}">${r.quantity}</td>
      <td style="text-align:center;font-family:monospace">${r.loca}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>피킹리스트 ${today}</title>
<style>
  @page{size:A4 portrait;margin:12mm 10mm}
  body{font-family:'Malgun Gothic',sans-serif;margin:0;padding:10px}
  h2{margin:0 0 10px;font-size:14px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #475569;padding:5px 8px}
  th{background:#1e293b;color:#fff;font-weight:800;text-align:left}
  .btn{padding:8px 18px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:12px}
  @media print{.btn{display:none}body{padding:0}h2{font-size:13px}}
</style></head><body>
<h2>📋 피킹리스트 — ${today} (${rows.length}건)</h2>
<button class="btn" onclick="window.print()">🖨 인쇄</button>
<table>
  <thead><tr>
    <th style="width:36px">NO</th>
    <th>수령인</th>
    <th>상품약어</th>
    <th>색상</th>
    <th style="width:46px">수량</th>
    <th style="width:70px">LOCA</th>
  </tr></thead>
  <tbody>${trRows}</tbody>
</table>
<div style="margin-top:14px;font-size:11px;color:#64748b">
  ● 파란배경: 동일 수령인·주소 중복  ● 노란배경: 수량 2개 이상  ● 초록배경: 중복+2개이상
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=720')
  if (w) { w.document.write(html); w.document.close() }
}

/* ─── 페이지 ─────────────────────────────────────────────── */
export default function OrdersPage() {
  const router = useRouter()
  const today  = getToday()
  const now    = new Date()
  const curYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [orders, setOrders]         = useState<Order[]>([])
  const [viewMode, setViewMode]     = useState<'monthly' | 'daily'>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(curYM)
  const [checked, setChecked]       = useState<Set<string>>(new Set())
  const [mappings, setMappings]     = useState<MappingStore>({})
  const [showMapping, setShowMapping] = useState(false)
  const [draftMappings, setDraftMappings] = useState<MappingStore>({})
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [myProducts, setMyProducts]           = useState<MyProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [mappingFilter, setMappingFilter]     = useState<'all' | 'unmapped'>('all')
  const [mappingSearch, setMappingSearch]     = useState('')
  const [autoMapResult, setAutoMapResult]     = useState<{ mapped: number; skipped: number; total: number } | null>(null)

  useEffect(() => {
    setOrders(loadOrders())
    setMappings(loadMappings())

    // 상품 목록을 마운트 시 미리 로드 (스테일 캐시 포함)
    const preFetch = async () => {
      // 스테일 캐시도 즉시 표시
      const stale = loadMyProductsFromCache(true)
      if (stale.length > 0) setMyProducts(stale)

      // 캐시가 만료됐으면 백그라운드에서 신선한 데이터 재로드
      const isFresh = (() => {
        try {
          const raw = localStorage.getItem(PRODUCTS_CACHE_KEY)
          if (!raw) return false
          const { ts } = JSON.parse(raw) as { ts: number }
          return Date.now() - ts < PRODUCTS_CACHE_TTL
        } catch { return false }
      })()

      if (!isFresh) {
        const prods = await fetchProductsWithTimeout()
        if (prods.length > 0) {
          setMyProducts(prods)
          saveProductsToCache(prods)
        }
      }
    }
    preFetch()
  }, [])

  /* 스토리지 변경 이벤트 수신 (같은 탭 내 주문서등록 동기화) */
  useEffect(() => {
    const onStorage = () => {
      setOrders(loadOrders())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /* 날짜별 표시 주문 */
  const dailyOrders = useMemo(() =>
    orders
      .filter(o => o.order_date === selectedDate)
      .sort((a, b) => {
        const ch = a.channel.localeCompare(b.channel, 'ko')
        if (ch !== 0) return ch
        const skuA = a.items[0]?.sku ?? ''
        const skuB = b.items[0]?.sku ?? ''
        const sk = skuA.localeCompare(skuB)
        if (sk !== 0) return sk
        const optA = a.items[0]?.option ?? ''
        const optB = b.items[0]?.option ?? ''
        const op = optA.localeCompare(optB, 'ko')
        if (op !== 0) return op
        return (b.items[0]?.unit_price ?? 0) - (a.items[0]?.unit_price ?? 0)
      }),
  [orders, selectedDate])

  /* 월별 표시 주문 (날짜 그룹화) */
  const monthOrders = useMemo(() =>
    orders.filter(o => o.order_date.startsWith(selectedMonth))
      .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.channel.localeCompare(b.channel, 'ko')),
  [orders, selectedMonth])

  const monthGrouped = useMemo(() => {
    const g: Record<string, Order[]> = {}
    monthOrders.forEach(o => { (g[o.order_date] ??= []).push(o) })
    return g
  }, [monthOrders])

  const displayOrders = viewMode === 'daily' ? dailyOrders : monthOrders

  /* 매핑 모달용 - useMemo로 렌더 분리 */
  const mappingAllEntries = useMemo(() => Object.entries(draftMappings), [draftMappings])
  const mappingMappedCount = useMemo(() => mappingAllEntries.filter(([, m]) => !!m.product_id).length, [mappingAllEntries])
  const mappingFilteredEntries = useMemo(() => {
    const searchLower = mappingSearch.toLowerCase()
    return mappingAllEntries.filter(([key, m]) => {
      if (mappingFilter === 'unmapped' && m.product_id) return false
      if (searchLower) {
        const [productName, option] = splitMappingKey(key)
        if (!productName.toLowerCase().includes(searchLower) && !option.toLowerCase().includes(searchLower)) return false
      }
      return true
    })
  }, [mappingAllEntries, mappingFilter, mappingSearch])

  /* 전체 선택 */
  const allChecked = displayOrders.length > 0 && displayOrders.every(o => checked.has(o.id))
  const toggleAll = () => {
    if (allChecked) {
      setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.delete(o.id)); return n })
    } else {
      setChecked(prev => { const n = new Set(prev); displayOrders.forEach(o => n.add(o.id)); return n })
    }
  }
  const toggleOne = (id: string) => setChecked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /* 매핑 모달 열기 - 즉시 표시, 상품은 백그라운드 로드 */
  const openMapping = () => {
    // 주문 상품+옵션 키 수집 (동기)
    const keySet: Record<string, boolean> = {}
    orders.forEach(o => {
      o.items.forEach(i => {
        const key = makeMappingKey(i.product_name, i.option ?? '')
        keySet[key] = true
      })
    })
    const draft: MappingStore = {}
    Object.keys(keySet).forEach(key => {
      draft[key] = mappings[key] ?? { abbreviation: '', loca: '' }
    })
    setDraftMappings(draft)
    setMappingFilter('all')
    setMappingSearch('')
    setAutoMapResult(null)
    setShowMapping(true)   // 즉시 모달 표시

    // 상품이 없으면 백그라운드에서 로드
    if (myProducts.length === 0) {
      setProductsLoading(true)
      ;(async () => {
        const cached = loadMyProductsFromCache(true)
        if (cached.length > 0) {
          setMyProducts(cached)
          setProductsLoading(false)
          return
        }
        const prods = await fetchProductsWithTimeout()
        if (prods.length > 0) {
          setMyProducts(prods)
          saveProductsToCache(prods)
        }
        setProductsLoading(false)
      })()
    }
  }

  /* ── 자동매핑 ───────────────────────────────────────────── */
  const handleAutoMap = () => {
    if (myProducts.length === 0) return

    let mapped = 0
    let skipped = 0
    const total = Object.keys(draftMappings).length

    const normalize = (s: string) => s.toLowerCase().replace(/[\s,_\-]/g, '')

    const matchOption = (opt: string, productOpts: MyProductOption[]): MyProductOption | undefined => {
      if (!opt) return undefined
      const normOpt = normalize(opt)
      return (
        productOpts.find(o => normalize(o.name) === normOpt) ??
        productOpts.find(o => o.korean_name && normalize(o.korean_name) === normOpt) ??
        productOpts.find(o => o.korean_name && normOpt.includes(normalize(o.korean_name))) ??
        productOpts.find(o => normalize(o.name) !== '' && normOpt.includes(normalize(o.name))) ??
        productOpts.find(o => o.korean_name && normalize(o.korean_name).includes(normOpt))
      )
    }

    const matchProduct = (productName: string): MyProduct | undefined => {
      const norm = normalize(productName)
      return (
        myProducts.find(p => normalize(p.name) === norm) ??
        myProducts.find(p => p.abbr && normalize(p.abbr) === norm) ??
        myProducts.find(p => normalize(p.name).includes(norm) && norm.length >= 4) ??
        myProducts.find(p => norm.includes(normalize(p.name)) && normalize(p.name).length >= 4) ??
        myProducts.find(p => p.abbr && norm.includes(normalize(p.abbr)) && normalize(p.abbr).length >= 2)
      )
    }

    const newDraft = { ...draftMappings }
    Object.entries(newDraft).forEach(([key, m]) => {
      // 이미 연결된 항목은 건너뜀 (수동 저장된 매핑 보존)
      if (m.product_id) { skipped++; return }

      const [productName, option] = splitMappingKey(key)
      const p = matchProduct(productName)
      if (!p) return

      const matchedOpt = option ? matchOption(option, p.options) : undefined

      newDraft[key] = {
        ...m,
        product_id:      p.id,
        product_code:    p.code,
        my_product_name: p.name,
        my_option_name:  matchedOpt?.name,
        barcode:         matchedOpt?.barcode,
        abbreviation:    m.abbreviation || p.abbr || '',
        loca:            m.loca || p.loca || '',
      }
      mapped++
    })

    setDraftMappings(newDraft)
    setAutoMapResult({ mapped, skipped, total })
  }

  /* 매핑에서 내 상품 선택 시 */
  const handleProductSelect = (key: string, productId: string) => {
    if (!productId) {
      setDraftMappings(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          product_id: undefined,
          product_code: undefined,
          my_product_name: undefined,
          my_option_name: undefined,
          barcode: undefined,
        },
      }))
      return
    }
    const p = myProducts.find(p => p.id === productId)
    if (!p) return
    setDraftMappings(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        product_id: p.id,
        product_code: p.code,
        my_product_name: p.name,
        my_option_name: undefined,
        barcode: undefined,
        abbreviation: p.abbr || prev[key].abbreviation,
        loca: p.loca || prev[key].loca,
      },
    }))
  }

  /* 매핑에서 옵션 선택 시 (바코드 자동 채움) */
  const handleOptionSelect = (key: string, optName: string) => {
    const m = draftMappings[key]
    const product = myProducts.find(p => p.id === m?.product_id)
    const opt = product?.options.find(o => o.name === optName)
    setDraftMappings(prev => ({
      ...prev,
      [key]: { ...prev[key], my_option_name: optName, barcode: opt?.barcode ?? prev[key].barcode },
    }))
  }

  const saveMapping = () => {
    saveMappings(draftMappings)
    setMappings(draftMappings)
    setShowMapping(false)
  }

  /* 피킹리스트 출력 */
  const handlePickingList = () => {
    const targets = checked.size > 0
      ? orders.filter(o => checked.has(o.id))
      : displayOrders
    if (targets.length === 0) return alert('출력할 주문이 없습니다.')
    printPickingList(targets, mappings)
  }

  /* 송장등록으로 이동 */
  const goToInvoice = () => {
    const targets = checked.size > 0
      ? Array.from(checked)
      : displayOrders.map(o => o.id)
    if (targets.length === 0) return alert('이동할 주문을 선택하세요.')
    saveSelectedForInvoice(targets)
    router.push('/product-edit-transfer/print')
  }

  /* KPI */
  const todayCount   = orders.filter(o => o.order_date === today).length
  const monthCount   = orders.filter(o => o.order_date.startsWith(curYM)).length
  const shippedCount = orders.filter(o => o.status === 'shipped').length

  /* ─── 테이블 행 공통 렌더 ─────────────────────────────── */
  const renderRow = (order: Order) => {
    const st   = STATUS_MAP[order.status] ?? STATUS_MAP.pending
    const item = order.items[0]
    const isChk = checked.has(order.id)
    return (
      <div
        key={order.id}
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 140px 80px 100px 1fr 80px 90px 90px',
          gap: 8, padding: '11px 16px',
          borderBottom: '1px solid #f1f5f9',
          alignItems: 'center',
          background: isChk ? '#eff6ff' : 'transparent',
          transition: 'background 100ms',
          cursor: 'pointer',
        }}
        onClick={() => setSelectedOrder(order)}
      >
        <span
          onClick={e => { e.stopPropagation(); toggleOne(order.id) }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {isChk
            ? <CheckSquare size={15} style={{ color: '#2563eb' }} />
            : <Square size={15} style={{ color: '#cbd5e1' }} />}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.order_number}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.channel}
        </span>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
            {item?.sku || '-'}
          </p>
          {item && (() => {
            const m = lookupMapping(mappings, item.product_name, item.option)
            const abbr = m.abbreviation
            const opt  = item.option
            if (!abbr && !opt) return null
            return (
              <p style={{ fontSize: 10.5, color: '#475569', fontWeight: 700, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {abbr}{opt ? `[${opt}]` : ''}
              </p>
            )
          })()}
        </div>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item?.product_name}
          </p>
          {item?.option && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.option}
            </p>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>
          {item?.unit_price ? item.unit_price.toLocaleString() : '-'}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
          {order.customer_name}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: st.color, background: st.bg,
          padding: '3px 7px', borderRadius: 6, textAlign: 'center', display: 'block',
        }}>
          {st.label}
        </span>
      </div>
    )
  }

  const TableHeader = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 140px 80px 100px 1fr 80px 90px 90px',
      gap: 8, padding: '9px 16px',
      background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      <span
        onClick={toggleAll}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        {allChecked
          ? <CheckSquare size={14} style={{ color: '#2563eb' }} />
          : <Square size={14} style={{ color: '#cbd5e1' }} />}
      </span>
      {['주문번호', '쇼핑몰', '상품코드', '상품명/옵션', '판매가', '수취인', '상태'].map(h => (
        <span key={h} style={{ fontSize: 10.5, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {h}
        </span>
      ))}
    </div>
  )

  /* ─── 렌더 ────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: '오늘 주문',   value: todayCount,   color: '#2563eb' },
          { label: '이번달 전체', value: monthCount,   color: '#7c3aed' },
          { label: '배송중',      value: shippedCount, color: '#059669' },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingCart size={17} style={{ color: k.color }} />
            </div>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{k.value}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 툴바 */}
      <div className="pm-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {/* 뷰 모드 토글 */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {(['daily', 'monthly'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '7px 14px', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: viewMode === mode ? '#1e293b' : 'white',
                color: viewMode === mode ? 'white' : '#64748b',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {mode === 'daily' ? <><Calendar size={13} />날짜별</> : <><BarChart2 size={13} />월별</>}
            </button>
          ))}
        </div>

        {/* 날짜/월 이동 */}
        {viewMode === 'daily' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSelectedDate(d => addDays(d, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} style={{ color: '#64748b' }} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', minWidth: 180, textAlign: 'center' }}>
              {fmtDate(selectedDate)}
              {selectedDate === today && <span style={{ fontSize: 10, background: '#dbeafe', color: '#2563eb', fontWeight: 900, padding: '2px 6px', borderRadius: 20, marginLeft: 6 }}>TODAY</span>}
            </span>
            <button onClick={() => selectedDate < today && setSelectedDate(d => addDays(d, 1))}
              disabled={selectedDate >= today}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: selectedDate < today ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedDate < today ? 1 : 0.3 }}>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSelectedMonth(m => addMonths(m, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={14} style={{ color: '#64748b' }} />
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', minWidth: 120, textAlign: 'center' }}>
              {fmtMonth(selectedMonth)}
            </span>
            <button onClick={() => selectedMonth < curYM && setSelectedMonth(m => addMonths(m, 1))}
              disabled={selectedMonth >= curYM}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: selectedMonth < curYM ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedMonth < curYM ? 1 : 0.3 }}>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {checked.size > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckSquare size={13} />{checked.size}건 선택
            </span>
          )}

          {/* 매핑하기 */}
          <button onClick={openMapping} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f1f5f9', color: '#475569', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Map size={13} />매핑하기
          </button>

          {/* 피킹리스트 출력 */}
          <button onClick={handlePickingList} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#059669', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Printer size={13} />피킹리스트 출력
          </button>

          {/* 송장등록으로 이동 */}
          <button onClick={goToInvoice} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#7c3aed', color: 'white', borderRadius: 9, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
            <Truck size={13} />송장등록 이동
          </button>
        </div>
      </div>

      {/* 주문 목록 */}
      <div className="pm-card" style={{ overflow: 'hidden', flex: 1 }}>
        {viewMode === 'daily' ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListFilter size={14} style={{ color: '#64748b' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                {fmtDate(selectedDate)} 주문
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({dailyOrders.length}건)</span>
              <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 8 }}>
                정렬: 쇼핑몰 → 상품코드 → 옵션 → 판매가↓
              </span>
            </div>
            {dailyOrders.length === 0 ? (
              <EmptyState text="해당 날짜의 주문이 없습니다" sub="주문서등록 탭에서 주문서를 업로드하세요" />
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                <TableHeader />
                {dailyOrders.map(renderRow)}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={14} style={{ color: '#64748b' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{fmtMonth(selectedMonth)} 주문</span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({monthOrders.length}건)</span>
            </div>
            {monthOrders.length === 0 ? (
              <EmptyState text="해당 월의 주문이 없습니다" sub="주문서등록 탭에서 주문서를 업로드하세요" />
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
                {Object.entries(monthGrouped)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, dayOrders]) => (
                    <div key={date}>
                      <div style={{
                        padding: '8px 16px',
                        background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'center', gap: 8,
                        position: 'sticky', top: 0, zIndex: 2,
                      }}>
                        <Calendar size={13} style={{ color: '#64748b' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>
                          {date === today ? `${fmtDate(date)} ⭐ 오늘` : fmtDate(date)}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{dayOrders.length}건</span>
                      </div>
                      <TableHeader />
                      {dayOrders.map(renderRow)}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 매핑 모달 ── */}
      {showMapping && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowMapping(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 1200, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 3 }}>상품 매핑 설정</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                  주문서 상품과 <strong style={{ color: '#2563eb' }}>내 상품</strong>을 연결하면 바코드·약어·LOCA가 자동으로 채워집니다
                  {myProducts.length === 0 && !productsLoading && (
                    <span style={{ color: '#f59e0b', marginLeft: 8 }}><AlertCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />상품관리에 상품이 없습니다</span>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>연결 현황</p>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#2563eb', margin: 0 }}>{mappingMappedCount} / {mappingAllEntries.length}</p>
                </div>
                <button onClick={() => setShowMapping(false)} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={15} style={{ color: '#94a3b8' }} />
                </button>
              </div>
            </div>

            {/* 툴바 */}
            <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: '#fafafa', flexWrap: 'wrap' }}>
              {/* 자동매핑 버튼 */}
              <button
                onClick={() => { if (myProducts.length > 0) { setAutoMapResult(null); handleAutoMap() } }}
                disabled={productsLoading && myProducts.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 800,
                  cursor: (productsLoading && myProducts.length === 0) ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: (productsLoading && myProducts.length === 0) ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#7c3aed)',
                  color: (productsLoading && myProducts.length === 0) ? '#94a3b8' : 'white',
                  boxShadow: myProducts.length > 0 ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                  flexShrink: 0,
                }}
              >
                {productsLoading && myProducts.length === 0 ? '⏳ 상품 로딩중...' : '✨ 자동매핑'}
              </button>

              <div style={{ width: 1, height: 20, background: '#e2e8f0', flexShrink: 0 }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 180, maxWidth: 260, border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '0 10px', background: 'white', height: 32 }}>
                <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <input value={mappingSearch} onChange={e => setMappingSearch(e.target.value)}
                  placeholder="주문서 상품명 검색..."
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, background: 'transparent' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'unmapped'] as const).map(f => (
                  <button key={f} onClick={() => setMappingFilter(f)}
                    style={{ padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: mappingFilter === f ? '#2563eb' : '#e2e8f0', background: mappingFilter === f ? '#eff6ff' : 'white', color: mappingFilter === f ? '#2563eb' : '#64748b' }}
                  >
                    {f === 'all' ? `전체 (${mappingAllEntries.length})` : `미연결 (${mappingAllEntries.length - mappingMappedCount})`}
                  </button>
                ))}
              </div>
              {productsLoading && <span style={{ fontSize: 12, color: '#94a3b8' }}>상품 불러오는 중...</span>}
            </div>

            {/* 자동매핑 결과 배너 */}
            {autoMapResult && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, background: autoMapResult.mapped > 0 ? '#f0fdf4' : '#fffbeb' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: autoMapResult.mapped > 0 ? '#16a34a' : '#d97706' }}>
                  {autoMapResult.mapped > 0 ? '✅' : '⚠️'} 자동매핑 결과:
                </span>
                <span style={{ fontSize: 12.5, color: '#334155', fontWeight: 600 }}>
                  총 {autoMapResult.total}건 중{' '}
                  <strong style={{ color: '#2563eb' }}>{autoMapResult.mapped}건 자동매핑 완료</strong>
                  {autoMapResult.skipped > 0 && `, ${autoMapResult.skipped}건 기존 매핑 유지`}
                  {autoMapResult.total - autoMapResult.mapped - autoMapResult.skipped > 0 &&
                    `, `}<strong style={{ color: '#dc2626' }}>{autoMapResult.total - autoMapResult.mapped - autoMapResult.skipped > 0 ? `${autoMapResult.total - autoMapResult.mapped - autoMapResult.skipped}건 수동 매핑 필요` : ''}</strong>
                </span>
                {autoMapResult.total - autoMapResult.mapped - autoMapResult.skipped > 0 && (
                  <button onClick={() => setMappingFilter('unmapped')}
                    style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                    미연결만 보기
                  </button>
                )}
                <button onClick={() => setAutoMapResult(null)}
                  style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', marginLeft: autoMapResult.total - autoMapResult.mapped - autoMapResult.skipped > 0 ? 0 : 'auto' }}>
                  ✕
                </button>
              </div>
            )}

            {/* 컬럼 헤더 */}
            <div style={{ padding: '0 24px', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 130px 220px 155px 120px 80px 70px', gap: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, margin: '8px 0 3px' }}>
                {[
                  { label: '주문서 상품명' },
                  { label: '주문 옵션' },
                  { label: '내 상품 연결' },
                  { label: '내 옵션 선택' },
                  { label: '바코드' },
                  { label: '약어' },
                  { label: 'LOCA' },
                ].map(col => (
                  <span key={col.label} style={{ fontSize: 10.5, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</span>
                ))}
              </div>
            </div>

            {/* 매핑 행들 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 10px' }}>
              {mappingFilteredEntries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <Package size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ fontSize: 13 }}>{mappingAllEntries.length === 0 ? '주문관리에 등록된 상품이 없습니다.' : '검색 결과가 없습니다.'}</p>
                </div>
              ) : mappingFilteredEntries.map(([key, m]) => {
                const [productName, option] = splitMappingKey(key)
                const selectedProduct = myProducts.find(p => p.id === m.product_id)
                const isMapped = !!m.product_id
                return (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '2fr 130px 220px 155px 120px 80px 70px', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 9, marginBottom: 3, background: isMapped ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${isMapped ? '#bbf7d0' : '#f1f5f9'}` }}>
                    {/* 주문서 상품명 */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={productName}>{productName}</p>
                      {isMapped && (
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
                          <Link2 size={9} />연결됨
                        </span>
                      )}
                    </div>

                    {/* 주문 옵션 */}
                    <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={option}>
                      {option || <span style={{ color: '#cbd5e1' }}>—</span>}
                    </span>

                    {/* 내 상품 선택 */}
                    <ProductCombobox
                      products={myProducts}
                      value={m.product_id ?? ''}
                      onChange={pid => handleProductSelect(key, pid)}
                    />

                    {/* 내 옵션 선택 */}
                    <select
                      value={m.my_option_name ?? ''}
                      disabled={!selectedProduct}
                      onChange={e => handleOptionSelect(key, e.target.value)}
                      style={{ height: 34, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 8px', fontSize: 11.5, outline: 'none', width: '100%', background: !selectedProduct ? '#f8fafc' : 'white', color: !selectedProduct ? '#94a3b8' : '#0f172a', cursor: !selectedProduct ? 'not-allowed' : 'pointer' }}
                    >
                      <option value="">-- 선택 --</option>
                      {selectedProduct?.options.map(opt => {
                        const label = `${opt.korean_name || opt.name}${opt.size && opt.size !== 'FREE' ? ' / ' + opt.size : ''}`
                        return <option key={opt.name + opt.size} value={opt.name}>{label}</option>
                      })}
                    </select>

                    {/* 바코드 (옵션 선택 후 자동) */}
                    <div style={{ height: 34, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 8px', display: 'flex', alignItems: 'center', background: '#f8fafc', overflow: 'hidden' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: m.barcode ? '#0f172a' : '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.barcode}>
                        {m.barcode || '—'}
                      </span>
                    </div>

                    {/* 약어 */}
                    <input
                      value={m.abbreviation}
                      onChange={e => setDraftMappings(prev => ({ ...prev, [key]: { ...prev[key], abbreviation: e.target.value } }))}
                      placeholder="약어"
                      style={{ height: 34, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 8px', fontSize: 12, fontWeight: 700, outline: 'none', width: '100%' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />

                    {/* LOCA */}
                    <input
                      value={m.loca}
                      onChange={e => setDraftMappings(prev => ({ ...prev, [key]: { ...prev[key], loca: e.target.value } }))}
                      placeholder="LOCA"
                      style={{ height: 34, borderRadius: 8, border: '1.5px solid #e2e8f0', padding: '0 8px', fontSize: 12, fontWeight: 700, outline: 'none', width: '100%', fontFamily: 'monospace' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#2563eb')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                )
              })}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'white' }}>
              <p style={{ fontSize: 11.5, color: '#94a3b8', margin: 0 }}>
                내 상품 옵션 선택 시 바코드·약어·LOCA가 자동 입력되며, 직접 수정도 가능합니다
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowMapping(false)} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  취소
                </button>
                <button onClick={saveMapping} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: 'white', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  <Save size={13} />저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 주문 상세 모달 ── */}
      {selectedOrder && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 18, padding: 28, maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>주문 상세</h2>
              <button onClick={() => setSelectedOrder(null)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} style={{ color: '#94a3b8' }} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {([
                ['주문번호', selectedOrder.order_number],
                ['쇼핑몰',   selectedOrder.channel],
                ['주문일',   selectedOrder.order_date],
                ['상태',     STATUS_MAP[selectedOrder.status]?.label ?? '-'],
                ['수취인',   selectedOrder.customer_name],
                ['연락처',   selectedOrder.customer_phone || '-'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{value}</p>
                </div>
              ))}
            </div>
            {selectedOrder.shipping_address && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>배송주소</p>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{selectedOrder.shipping_address}</p>
              </div>
            )}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>주문 상품</p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.product_name}</p>
                    {item.option && <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>옵션: {item.option}</p>}
                    {item.sku && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>SKU: {item.sku}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                    <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>×{item.quantity}</p>
                    {item.unit_price ? <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{item.unit_price.toLocaleString()}원</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <Package size={40} style={{ margin: '0 auto 14px', opacity: 0.12, display: 'block' }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{text}</p>
      <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>{sub}</p>
    </div>
  )
}
