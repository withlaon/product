'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  loadShippedOrders, loadMappings, lookupMapping,
  isShippedOrderDelivered, shippedOrderLocalYmd, ymdComparable,
  SHIPPED_ORDERS_KEY,
  type ShippedOrder, type MappingStore,
} from '@/lib/orders'
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboard-sync'
import {
  Purchase, PurchaseItem, PmProduct, PmOption, PurchaseStatus, DateMode,
  ST, isUnresolved,
  getToday, getThisMonth,
  fmtMonthLabel, fmtDayLabel,
  syncProductQty, DateNav,
  apiFetchPurchases, apiInsertPurchase, apiUpdatePurchase, apiDeletePurchase,
  DEFAULT_EXCHANGE_RATE, PRICE_FACTOR, unitToOrderKrw,
} from '../_shared'
import { Truck, Edit2, Trash2, X, Plus, CheckCircle2, PackagePlus, ChevronDown, ChevronUp, AlertTriangle, Package, FileDown, RefreshCw } from 'lucide-react'

// 출고내역 기반 판매수량 집계 기준일 (발주 이력이 없을 경우 기본값 — 3/29 발주 기준 재집계)
const SHIP_BASE_DATE = '2026-03-29'

// Sheet3 컬러 코드 → 영문색상명 맵
const COLOR_EN_MAP: Record<string, string> = {
  BD:'BURGANDY',BE:'BEIGE',BG:'BLUE GREEN',BI:'BLUE INDIGO',BK:'BLACK',BL:'BLUE',BN:'BLUE GREEN',
  BR:'BROWN',CA:'CHARCOAL',CB:'COBALT BLUE',CG:'CHARCOAL GREY',CH:'CHOCOLATE',CL:'CORAL',CM:'CAMEL',
  CO:'COCOA',CP:'CHERRYPINK',CR:'CREAM',DB:'DARK BROWN',DE:'DARK BEIGE',DG:'DARK GREY',DI:'DARK INDIGO',
  DN:'DARK GREEN',DO:'DARK ORANGE',DP:'DARK PINK',DU:'DARK BLUE',GN:'GREEN',GO:'GOLD',GP:'LIGHT PURPLE',
  GR:'GREY',IP:'INDIAN PINK',IV:'IVORY',KB:'KHAKI BEIGE',KH:'KHAKI',KN:'KHAKI BROWN',LB:'LIGHT BEIGE',
  LE:'LEMON',LG:'LIGHT GREY',LK:'LIGHT KHAKI',LM:'LIME',LN:'LIGHT MINT',LO:'LIGHT BROWN',LP:'LIGHT PINK',
  LU:'LIGHT BLUE',LV:'LIGHT VILOET',LY:'LIGHT YELLOW',MC:'MOCHA',MG:'M/GREY',MN:'MINT',MT:'MUSTARD',
  MU:'MULTI',NA:'NAVY',OG:'OLIVE GREEN',OL:'OLIVE',OR:'ORANGE',OT:'OATMEAL',PC:'PEACH',PK:'PINK',
  PU:'PURPLE',RB:'RED BROWN',RD:'RED',SB:'SKY BLUE',SI:'SILVER',VI:'VIOLET',WH:'WHITE',WM:'WHITE MELANGE',
  WN:'WINE',YE:'YELLOW',YG:'YELLOW GREEN',
}

// 상품약어에서 앞의 "숫자_" 제거 (예: "112_벨 숄더백" → "벨 숄더백")
function stripCodePrefix(abbr?: string): string {
  return (abbr || '').replace(/^\d+_/, '').trim()
}

/* ── 발주 추천 옵션 타입 ── */
interface QualOpt {
  key: string
  prodId: string
  prodCode: string
  prodAbbr: string
  optName: string
  barcode: string
  image: string
  currentStock: number
  unreceived: number
  sold: number          // 누적 판매수량
  reason: 'lowStock' | 'unreceived' | 'both' | 'sold'
}
interface SelectedOpt extends QualOpt { qty: string }

/** 발주 추천·발주 확정 목록 공통: 바코드 오름차순 */
function compareByBarcode(a: QualOpt, b: QualOpt): number {
  const c = (a.barcode || '').localeCompare(b.barcode || '', undefined, { numeric: true })
  if (c !== 0) return c
  return (a.key || '').localeCompare(b.key || '')
}

const DRAFT_KEY = 'pm_purchase_draft_v1'

export default function PurchaseManagePage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [products,  setProducts]  = useState<PmProduct[]>([])
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  /* 발주 추천 → 선택 상태 (localStorage로 탭 이동해도 유지) */
  const [selectedOpts, setSelectedOpts] = useState<SelectedOpt[]>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return JSON.parse(raw) as SelectedOpt[]
    } catch { /* ignore */ }
    return []
  })
  const [orderDate,    setOrderDate]    = useState(getToday())
  const [orderSupplier, setOrderSupplier] = useState('')
  const [exchangeRate,  setExchangeRate]  = useState(() => {
    try { return Number(localStorage.getItem('pm_exchange_rate') || String(DEFAULT_EXCHANGE_RATE)) || DEFAULT_EXCHANGE_RATE } catch { return DEFAULT_EXCHANGE_RATE }
  })

  /* 발주 이력 영역 */
  const [showHistory, setShowHistory] = useState(false)
  const [mode,  setMode]  = useState<DateMode>('month')
  const [month, setMonth] = useState(getThisMonth())
  const [day,   setDay]   = useState(getToday())

  /* 모달 */
  const [receiveTarget, setReceiveTarget] = useState<Purchase | null>(null)
  const [editTarget,    setEditTarget]    = useState<Purchase | null>(null)
  const [editFormData,  setEditFormData]  = useState<Purchase | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Purchase | null>(null)
  const [showAddModal,  setShowAddModal]  = useState(false)

  /* ── 데이터 로드 ── */
  const loadPurchases = useCallback(async () => {
    const data = await apiFetchPurchases()
    setPurchases(data)
  }, [])

  const [loadError, setLoadError] = useState('')
  // 추천 목록 옵션이미지: 바코드 → base64 (별도 비동기 로딩)
  const [qualImages, setQualImages] = useState<Record<string, string>>({})
  // 출고내역 + 매핑 (판매수량 계산용)
  const [shippedOrders, setShippedOrders] = useState<ShippedOrder[]>([])
  const [mappings,      setMappings]      = useState<MappingStore>({})

  // 상품관리 탭과 동일한 localStorage 캐시 키 / TTL
  const SHARED_CACHE_KEY = 'pm_products_cache_v1'
  const SHARED_CACHE_TTL = 30 * 60 * 1000 // 30분

  const loadProducts = useCallback(async (force = false) => {
    setLoadError('')

    // ① localStorage 캐시 우선 (force=false 이고 캐시 유효할 때만)
    if (!force) {
      try {
        const raw = localStorage.getItem(SHARED_CACHE_KEY)
        if (raw) {
          const { ts, data } = JSON.parse(raw)
          if (Date.now() - ts < SHARED_CACHE_TTL && Array.isArray(data) && data.length > 0) {
            setProducts(data as PmProduct[])
            return
          }
        }
      } catch { /* ignore */ }
    }

    // ② API 라우트 (force 시 캐시 버스팅)
    try {
      const res = await fetch(`/api/pm-products${force ? `?t=${Date.now()}` : ''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProducts(data as PmProduct[])
      // 캐시 갱신
      try { localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* ignore */ }
    } catch (e: unknown) {
      // ③ 최후 fallback → supabase 클라이언트 직접
      try {
        const { data, error } = await supabase.from('pm_products').select('id,code,name,abbr,status,options')
        if (error) throw new Error(error.message)
        setProducts((data ?? []) as PmProduct[])
        try { localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* ignore */ }
      } catch (e2: unknown) {
        setLoadError(e2 instanceof Error ? e2.message : String(e instanceof Error ? e.message : e))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadPurchases()
    loadProducts()
    setShippedOrders(loadShippedOrders())
    setMappings(loadMappings())
  }, [loadPurchases, loadProducts])

  /* 출고확정 등 출고 저장소 변경 시 추천 목록 판매 수 즉시 반영 */
  useEffect(() => {
    const bump = () => {
      setShippedOrders(loadShippedOrders())
      setMappings(loadMappings())
    }
    window.addEventListener(DASHBOARD_REFRESH_EVENT, bump)
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHIPPED_ORDERS_KEY || e.key === 'pm_product_mapping_v1') bump()
    }
    window.addEventListener('storage', onStorage)
    const onVis = () => { if (document.visibilityState === 'visible') bump() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, bump)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // selectedOpts가 바뀔 때마다 localStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(selectedOpts))
    } catch { /* ignore */ }
  }, [selectedOpts])

  /* ── 출고내역 기반 판매수량 맵 (바코드 → 마지막 발주일 이후 판매수량) ──
     바코드 조회 우선순위:
     1. pm_product_mapping_v1 매핑 (기존)
     2. pm_products 상품약어(abbr) + 옵션명 직접 매칭 (매핑 없는 경우 폴백)
     3. OrderItem.sku 직접 사용
  ── */
  const shipSoldMap = useMemo(() => {
    // ── 옵션 정규화: "색상=베이지, 사이즈=FREE" → "베이지, FREE" ──
    const extractOptVal = (opt?: string): string => {
      if (!opt) return ''
      return opt.split(',')
        .map(s => { const e = s.indexOf('='); return e >= 0 ? s.slice(e + 1).trim() : s.trim() })
        .join(', ')
    }
    const normStr = (s: string) => s.replace(/\s/g, '').toLowerCase()

    // ── pm_products 기반 약어+옵션 → 바코드 인덱스 ──
    const abbrOptIdx: Record<string, string> = {}  // key: norm(abbr)+'|||'+norm(optName)
    const abbrIdx:    Record<string, string> = {}  // key: norm(abbr) (단일 옵션 폴백)
    for (const prod of products) {
      const abbr = normStr(prod.abbr || prod.name)
      for (const opt of prod.options ?? []) {
        if (!opt.barcode) continue
        abbrOptIdx[`${abbr}|||${normStr(opt.name)}`] = opt.barcode
        if (!abbrIdx[abbr]) abbrIdx[abbr] = opt.barcode  // 첫 옵션만 등록
      }
    }

    // ① 바코드별 마지막 발주일 계산
    const lastOrderByBarcode: Record<string, string> = {}
    for (const p of purchases) {
      if (p.status === 'cancelled') continue
      const po = ymdComparable(p.order_date || '')
      if (!po) continue
      for (const item of p.items) {
        const bc = item.barcode
        if (!bc) continue
        if (!lastOrderByBarcode[bc] || po > ymdComparable(lastOrderByBarcode[bc])) {
          lastOrderByBarcode[bc] = po
        }
      }
    }

    // ② 출고내역 → 바코드별 판매수량 집계 (기준일 이후만)
    const map: Record<string, number> = {}
    for (const order of shippedOrders) {
      if (!isShippedOrderDelivered(order)) continue
      const shippedDate = shippedOrderLocalYmd(order)
      for (const item of order.items) {
        // 1. 매핑으로 바코드 조회
        let bc = lookupMapping(mappings, item.product_name, item.option).barcode || ''
        // 2. 폴백: 상품약어+옵션명 직접 매칭
        if (!bc) {
          const na = normStr(item.product_name)
          const ov = normStr(extractOptVal(item.option))
          const oo = normStr(item.option || '')
          bc = abbrOptIdx[`${na}|||${ov}`]
            || abbrOptIdx[`${na}|||${oo}`]
            || abbrIdx[na]
            || ''
        }
        // 3. 폴백: sku 직접 사용
        if (!bc && item.sku) bc = item.sku

        if (!bc) continue
        const base = ymdComparable(lastOrderByBarcode[bc] || SHIP_BASE_DATE)
        const shipDay = ymdComparable(shippedDate)
        if (shipDay && base && shipDay >= base) {
          map[bc] = (map[bc] || 0) + (Number(item.quantity) || 0)
        }
      }
    }
    return map
  }, [products, purchases, shippedOrders, mappings])

  /* ── 바코드별 미입고 수량 계산 (pm_products 옵션 기준) ── */
  const unreceivedMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const prod of products) {
      for (const opt of prod.options ?? []) {
        if (!opt.barcode) continue
        const unr = (opt.ordered ?? 0) - (opt.received ?? 0)
        if (unr > 0) map[opt.barcode] = (map[opt.barcode] || 0) + unr
      }
    }
    return map
  }, [products])

  /* ── 발주 추천 목록 ──
     조건: 판매중(active) 옵션 중
       · 현재고 ≤ 3 이거나
       · 최근 발주일(없으면 기준일) 이후 출고 누적 판매 > 0 (당일 출고확정 포함, shipped_at 기준)
     정렬: 바코드 오름차순(부족·품절·판매 등으로 묶지 않음)
  ── */
  const qualOpts = useMemo((): QualOpt[] => {
    const result: QualOpt[] = []
    for (const prod of products) {
      if (prod.status !== 'active') continue  // 판매중 상품만
      for (const opt of prod.options) {
        const stock = opt.current_stock ?? 0
        const unr   = unreceivedMap[opt.barcode || ''] || 0
        const sold  = shipSoldMap[opt.barcode || ''] || 0
        const includeLowStock = stock <= 3
        const includePostOrderSales = sold > 0
        if (!includeLowStock && !includePostOrderSales) continue

        let reason: QualOpt['reason'] = 'lowStock'
        if (stock > 3 && sold > 0) reason = 'sold'
        else if (stock <= 3 && sold > 0) reason = 'both'
        else if (stock <= 3 && unr > 0) reason = 'unreceived'

        result.push({
          key:          `${prod.id}__${opt.barcode || opt.name}`,
          prodId:       prod.id,
          prodCode:     prod.code,
          prodAbbr:     prod.abbr || prod.name,
          optName:      opt.name,
          barcode:      opt.barcode || '',
          image:        opt.image || '',
          currentStock: stock,
          unreceived:   unr,
          sold,
          reason,
        })
      }
    }
    return result.sort(compareByBarcode)
  }, [products, unreceivedMap, shipSoldMap])

  // 추천 목록 이미지 로딩: qualOpts 내 prodId 목록이 바뀔 때마다 재실행
  const qualProdIdsKey = useMemo(
    () => [...new Set(qualOpts.map(o => o.prodId))].sort().join(','),
    [qualOpts]
  )

  /** 상품관리 캐시 우선, 없으면 imageIds API(qualImages) — 키는 바코드 트림 통일 */
  const productOptionImageByBarcode = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of products) {
      for (const o of p.options ?? []) {
        const bc = (o.barcode || '').trim()
        if (bc && o.image) m[bc] = o.image
      }
    }
    return m
  }, [products])
  const mergedBarcodeImages = useMemo(
    () => ({ ...qualImages, ...productOptionImageByBarcode }),
    [qualImages, productOptionImageByBarcode]
  )
  const resolveQualImage = (barcode: string, fallback?: string) => {
    const bc = (barcode || '').trim()
    if (!bc) return fallback || ''
    return mergedBarcodeImages[bc] || fallback || ''
  }

  useEffect(() => {
    if (!qualProdIdsKey) return
    const prodIds = qualProdIdsKey.split(',').filter(Boolean)
    let cancelled = false

    // 전체를 한 번에 배치 요청 (최대 20개씩 묶어서)
    const chunks: string[][] = []
    for (let i = 0; i < prodIds.length; i += 20) {
      chunks.push(prodIds.slice(i, i + 20))
    }

    ;(async () => {
      for (const chunk of chunks) {
        if (cancelled) break
        try {
          const res = await fetch(`/api/pm-products?imageIds=${chunk.join(',')}`)
          if (!res.ok || cancelled) continue
          const data = await res.json() as Array<{ id: string; options?: Array<{ barcode?: string; image?: string }> }>
          if (!Array.isArray(data)) continue
          const imgs: Record<string, string> = {}
          data.forEach(prod => {
            ;(prod.options ?? []).forEach(o => {
              const bc = (o.barcode && String(o.barcode).trim()) || ''
              if (bc && o.image) imgs[bc] = o.image
            })
          })
          if (!cancelled && Object.keys(imgs).length > 0) {
            setQualImages(prev => ({ ...prev, ...imgs }))
          }
        } catch { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [qualProdIdsKey])

  const selectedKeys = useMemo(() => new Set(selectedOpts.map(s => s.key)), [selectedOpts])
  const selectedOptsSorted = useMemo(
    () => [...selectedOpts].sort(compareByBarcode),
    [selectedOpts]
  )

  const toggleSelect = (opt: QualOpt) => {
    if (selectedKeys.has(opt.key)) {
      setSelectedOpts(prev => prev.filter(s => s.key !== opt.key))
    } else {
      setSelectedOpts(prev => [...prev, { ...opt, qty: '1' }])
    }
  }

  /* ── 발주서 Excel 다운로드 (YNM 템플릿 사용) ── */
  const handleDownloadOrderSheet = async () => {
    if (!selectedOpts.length) return alert('선택된 상품이 없습니다.')

    // 전체 product 정보 접근 (localStorage 캐시에는 category, cost_price 등 full data 포함)
    type FullProduct = PmProduct & {
      category?: string; cost_price?: number; cost_currency?: string; supplier?: string
    }
    const fullProducts = products as unknown as FullProduct[]

    try {
      // ① 템플릿 파일 로드
      const res = await fetch('/purchase-order-template.xls')
      if (!res.ok) throw new Error('템플릿 파일을 찾을 수 없습니다.')
      const buf = await res.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })

      const ws1Name = wb.SheetNames[0] // 주문장
      const ws2Name = wb.SheetNames[1] // 스티커작업 리스트
      const ws1 = wb.Sheets[ws1Name]
      const ws2 = wb.Sheets[ws2Name]

      // ② 각 선택 상품 → 행 데이터 구성
      const sheet1Rows: (string | number)[][] = []
      for (const s of selectedOptsSorted) {
        const prod = fullProducts.find(p => p.id === s.prodId)
        if (!prod) continue
        const opt  = prod.options.find(o => o.barcode === s.barcode)
        if (!opt) continue

        const colorCode   = (opt.name || '').toUpperCase()
        const englishName = COLOR_EN_MAP[colorCode] || ''
        const koreanName  = (opt as PmOption & { korean_name?: string }).korean_name || opt.name || ''
        const chineseName = (opt as PmOption & { chinese_name?: string }).chinese_name || ''
        const imgVal      = resolveQualImage(s.barcode, s.image)
        const abbrClean   = stripCodePrefix(prod.abbr || prod.name)

        sheet1Rows.push([
          prod.code        || '',   // A: 품번
          colorCode,                // B: 색상코드
          englishName,              // C: 영문색상명
          koreanName,               // D: 한글색상명
          chineseName,              // E: 중국색상
          s.barcode        || '',   // F: 바코드
          abbrClean,                // G: 상품명(15자이내)
          'F',                      // H: 중국사이즈 (고정)
          'FFF',                    // I: 리블리크사이즈 (고정)
          prod.category    || '',   // J: 품목
          '',                       // K: 이미지 (링크 미출력)
          prod.supplier    || '',   // L: URL (구매처 사이트)
          prod.cost_price  ?? '',   // M: 단가
          Number(s.qty)    || 0,    // N: 부족수량
        ])
      }

      // ③ Sheet1 셀에 데이터 입력 (row 2부터, 1행 헤더 유지)
      sheet1Rows.forEach((row, ri) => {
        row.forEach((val, ci) => {
          const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
          // M열(ci=12): 원가 - 정수면 정수, 소숫점 있으면 끝까지 표시
          if (ci === 12 && val !== '') {
            const numVal = typeof val === 'number' ? val : Number(val)
            if (!isNaN(numVal)) {
              const isInt = Number.isInteger(numVal)
              ws1[cellRef] = { v: numVal, t: 'n', z: isInt ? '#,##0' : '#,##0.##########' }
            } else {
              ws1[cellRef] = { v: val, t: 's' }
            }
          } else {
            ws1[cellRef] = { v: val, t: typeof val === 'number' ? 'n' : 's' }
          }
        })
      })
      // Sheet1 범위 갱신
      const r1 = XLSX.utils.decode_range(ws1['!ref'] || 'A1')
      r1.e.r = Math.max(r1.e.r, sheet1Rows.length)
      r1.e.c = Math.max(r1.e.c, 13)
      ws1['!ref'] = XLSX.utils.encode_range(r1)

      // ④ Sheet2 (스티커작업 리스트): A상품명, B품번, C색상, D리블리크사이즈(FFF), E바코드, F부족수량
      sheet1Rows.forEach((row, ri) => {
        const s2row = [
          row[6],   // A: 상품명 = Sheet1 G(상품명)
          row[0],   // B: 품번   = Sheet1 A(품번)
          row[3],   // C: 색상   = Sheet1 D(한글색상명)
          'FFF',    // D: 리블리크사이즈 고정
          row[5],   // E: 바코드 = Sheet1 F(바코드)
          row[13],  // F: 부족수량
        ]
        s2row.forEach((val, ci) => {
          const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
          ws2[cellRef] = { v: val, t: typeof val === 'number' ? 'n' : 's' }
        })
      })
      const r2 = XLSX.utils.decode_range(ws2['!ref'] || 'A1')
      r2.e.r = Math.max(r2.e.r, sheet1Rows.length)
      r2.e.c = Math.max(r2.e.c, 5)
      ws2['!ref'] = XLSX.utils.encode_range(r2)

      // ⑤ 다운로드
      const d  = new Date()
      const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
      XLSX.writeFile(wb, `YNM_온라인 오더리스트_가방_${ds}.xlsx`)
    } catch (e: unknown) {
      alert('다운로드 오류: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  /* ── 발주 확정 ── */
  const handleSubmitOrder = async () => {
    const valid = selectedOptsSorted.filter(s => s.qty && Number(s.qty) > 0)
    if (!valid.length || !orderDate) return
    setSaving(true)
    setSaveMsg({ type: 'ok', text: '발주 확정 중...' })
    try {
      const items: PurchaseItem[] = valid.map(s => ({
        product_code: s.prodCode,
        option_name:  s.optName,
        barcode:      s.barcode,
        ordered:      Number(s.qty),
        received:     0,
      }))
      const purchase: Omit<Purchase, 'id'> = {
        order_date:  orderDate,
        supplier:    orderSupplier || '미지정',
        status:      'ordered',
        ordered_at:  new Date().toISOString(),
        received_at: null,
        items,
      }
      const { error: insertErr } = await apiInsertPurchase(purchase)
      if (insertErr) { setSaveMsg({ type: 'err', text: `발주 확정 실패: ${insertErr}` }); setSaving(false); return }
      // 바코드 기준으로 상품관리탭 발주 수량 카운팅
      const deltas = valid.map(s => ({
        prodId:       s.prodId,
        optName:      s.optName,
        barcode:      s.barcode,   // 바코드 우선 매칭
        orderedDelta: Number(s.qty),
        receivedDelta: 0,
      }))
      setSaveMsg({ type: 'ok', text: `상품관리 발주수량 반영 중 (${deltas.length}종)...` })
      await syncProductQty(products, deltas)
      localStorage.removeItem(SHARED_CACHE_KEY)  // 캐시 클리어 → 강제 재로딩
      localStorage.setItem('pm_products_mapping_signal', Date.now().toString()) // 상품관리탭 실시간 갱신
      await loadPurchases()
      await loadProducts(true)
      localStorage.removeItem(DRAFT_KEY)
      setSelectedOpts([])
      setOrderSupplier('')
      setOrderDate(getToday())
      setSaveMsg({ type: 'ok', text: '✅ 발주 확정 완료! 상품관리 발주수량에 반영되었습니다.' })
      setTimeout(() => setSaveMsg(null), 4000)
    } catch (e: unknown) {
      setSaveMsg({ type: 'err', text: `❌ 오류: ${e instanceof Error ? e.message : String(e)}` })
      setTimeout(() => setSaveMsg(null), 5000)
    } finally {
      setSaving(false)
    }
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
    await apiUpdatePurchase(receiveTarget.id, { items: updated.items, status: updated.status, received_at: updated.received_at })
    const deltas = receiveTarget.items.map((item, i) => {
      const prod = products.find(p => p.code === item.product_code)
      return { prodId: prod?.id ?? '', optName: item.option_name, orderedDelta: 0, receivedDelta: receivedItems[i] || 0 }
    }).filter(d => d.prodId && d.receivedDelta > 0)
    if (deltas.length) await syncProductQty(products, deltas)
    await loadPurchases()
    await loadProducts(true)
    setReceiveTarget(null); setSaving(false)
  }

  /* ── 수정 ── */
  const handleEditSave = async () => {
    if (!editTarget || !editFormData) return
    setSaving(true)
    const deltas = editFormData.items.map((newItem, i) => {
      const oldItem = editTarget.items[i] || { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }
      const prod = products.find(p => p.code === newItem.product_code || p.code === oldItem.product_code)
      return { prodId: prod?.id ?? '', optName: newItem.option_name, orderedDelta: newItem.ordered - oldItem.ordered, receivedDelta: newItem.received - oldItem.received }
    }).filter(d => d.prodId && (d.orderedDelta !== 0 || d.receivedDelta !== 0))
    await apiUpdatePurchase(editTarget.id, { order_date: editFormData.order_date, supplier: editFormData.supplier, status: editFormData.status, items: editFormData.items })
    if (deltas.length) await syncProductQty(products, deltas)
    localStorage.removeItem(SHARED_CACHE_KEY)
    await loadPurchases(); await loadProducts(true)
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
    localStorage.removeItem(SHARED_CACHE_KEY)
    await apiDeletePurchase(p.id)
    await loadPurchases(); await loadProducts(true)
    setDeleteTarget(null); setSaving(false)
  }

  /* ── 이력 필터 ── */
  const key       = mode === 'month' ? month : day
  const filtered  = useMemo(() => purchases.filter(p => p.order_date.startsWith(key)).sort((a, b) => b.order_date.localeCompare(a.order_date)), [purchases, key])
  const unresolvedOld = useMemo(() => purchases.filter(p => isUnresolved(p) && !p.order_date.startsWith(key)), [purchases, key])
  const allList   = useMemo(() => {
    const ids = new Set(filtered.map(p => p.id))
    return [...filtered, ...unresolvedOld.filter(p => !ids.has(p.id))]
  }, [filtered, unresolvedOld])

  const L = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: 5 }}>{children}</label>
  )

  /* ── 재고 색상 ── */
  const stockColor = (s: number) => s === 0 ? '#dc2626' : s <= 2 ? '#d97706' : '#059669'
  const stockBg    = (s: number) => s === 0 ? '#fff1f2' : s <= 2 ? '#fffbeb' : '#f0fdf4'

  return (
    <div className="pm-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', margin: 0 }}>📦 발주관리</h2>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          추천 {qualOpts.length}건 · 선택 {selectedOpts.length}건
        </span>
      </div>

      {/* ── 2단 메인 레이아웃 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, flex: 1, overflow: 'hidden' }}>

        {/* ◀ 왼쪽: 발주 추천 목록 ── */}
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {/* 패널 헤더 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <AlertTriangle size={14} style={{ color: '#d97706' }} />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>발주 추천 목록</span>
            <span style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>판매중 · 재고 부족(≤3) 또는 발주일 이후 판매 있음</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {qualOpts.filter(o => o.currentStock === 0).length > 0 && (
                <span style={{ fontSize: '11px', background: '#fff1f2', color: '#dc2626', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  재고 0개: {qualOpts.filter(o => o.currentStock === 0).length}
                </span>
              )}
              {qualOpts.filter(o => o.currentStock > 0 && o.currentStock <= 3).length > 0 && (
                <span style={{ fontSize: '11px', background: '#fffbeb', color: '#d97706', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  1~3개: {qualOpts.filter(o => o.currentStock > 0 && o.currentStock <= 3).length}
                </span>
              )}
              {qualOpts.filter(o => o.sold > 0).length > 0 && (
                <span style={{ fontSize: '11px', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                  발주 후 판매: {qualOpts.filter(o => o.sold > 0).length}
                </span>
              )}
            </div>
          </div>

          {/* 목록 */}
          {loadError && (
            <div style={{ margin: '12px 14px', padding: '8px 12px', background: '#fff1f2', borderRadius: 6, fontSize: '11px', color: '#dc2626' }}>
              상품 로딩 오류: {loadError}
            </div>
          )}
          {qualOpts.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
              <Package size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: '13px', fontWeight: 700 }}>{products.length === 0 ? '상품 데이터 로딩 중...' : '발주가 필요한 상품이 없습니다'}</p>
              <p style={{ fontSize: '11px', color: '#cbd5e1' }}>{products.length === 0 ? '잠시 후 자동으로 표시됩니다' : '재고 3개 이하 또는 최근 발주일 이후 출고 실적이 있는 옵션이 없습니다'}</p>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    {[
                      ['', ''],
                      ['이미지', ''],
                      ['약어 / 옵션 / 바코드', ''],
                      ['판매', '누적·발주일 이후'],
                      ['미입고', ''],
                      ['현재고', ''],
                      ['', ''],
                    ].map(([h, sub], hi) => (
                      <th key={`qual-h-${hi}`} style={{ padding: '7px 6px', fontWeight: 800, color: '#64748b', fontSize: '10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                        {h}{sub ? <><br /><span style={{ fontSize: '8.5px', fontWeight: 700, color: '#a5b4fc' }}>{sub}</span></> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qualOpts.map(opt => {
                    const sel = selectedKeys.has(opt.key)
                    const hasSalesRow = opt.sold > 0 && opt.currentStock > 0
                    const rowBg = sel
                      ? '#eff6ff'
                      : opt.currentStock === 0
                        ? '#fff7f7'
                        : hasSalesRow
                          ? '#f5f3ff'
                          : undefined
                    return (
                      <tr key={opt.key} style={{ borderBottom: '1px solid #f8fafc', background: rowBg, cursor: 'pointer', transition: 'background 0.15s' }}
                        onClick={() => toggleSelect(opt)}>
                        {/* 재고 / 발주 후 판매 배지: 판매 1건 이상이면 재고 부족이어도 판매 표시 */}
                        <td style={{ padding: '5px 3px 5px 6px', textAlign: 'center', width: 44, flexShrink: 0 }}>
                          {opt.currentStock === 0 ? (
                            <span style={{ fontSize: '8.5px', background: '#fff1f2', color: '#dc2626', fontWeight: 800, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>품절</span>
                          ) : opt.sold > 0 ? (
                            <span style={{ fontSize: '8.5px', background: '#eef2ff', color: '#4f46e5', fontWeight: 800, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>판매</span>
                          ) : (
                            <span style={{ fontSize: '8.5px', background: '#fffbeb', color: '#d97706', fontWeight: 800, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>부족</span>
                          )}
                        </td>
                        {/* 이미지 (약어 앞으로 이동) */}
                        <td style={{ padding: '4px 5px', textAlign: 'center', width: 46 }}>
                          {(() => { const img = resolveQualImage(opt.barcode, opt.image); return img
                            ? <img src={img} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', display: 'block', margin: '0 auto' }} />
                            : <div style={{ width: 36, height: 36, background: '#f1f5f9', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={14} style={{ color: '#cbd5e1' }} />
                              </div>
                          })()}
                        </td>
                        {/* 약어 · 옵션 · 바코드 */}
                        <td style={{ padding: '5px 6px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', flexShrink: 0 }}>{opt.prodAbbr}</span>
                            <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                            <span style={{ fontSize: '10.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{opt.optName}</span>
                            <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                            <span data-pm-barcode="1" style={{ fontSize: 11, fontWeight: 900, color: '#000000', letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 }}>{opt.barcode || '-'}</span>
                          </div>
                        </td>
                        {/* 판매수량 */}
                        <td style={{ padding: '5px 6px', textAlign: 'center', width: 40 }}>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: opt.sold > 0 ? '#6366f1' : '#94a3b8' }}>{opt.sold > 0 ? opt.sold : '-'}</span>
                        </td>
                        {/* 미입고 */}
                        <td style={{ padding: '5px 6px', textAlign: 'center', width: 40 }}>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: opt.unreceived > 0 ? '#d97706' : '#94a3b8' }}>{opt.unreceived > 0 ? opt.unreceived : '-'}</span>
                        </td>
                        {/* 현재고 */}
                        <td style={{ padding: '5px 6px', textAlign: 'center', width: 40 }}>
                          <span style={{ fontSize: '12px', fontWeight: 900, color: stockColor(opt.currentStock), background: stockBg(opt.currentStock), padding: '2px 6px', borderRadius: 99 }}>
                            {opt.currentStock}
                          </span>
                        </td>
                        {/* 선택 체크 */}
                        <td style={{ padding: '5px 6px', textAlign: 'center', width: 30 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`,
                            background: sel ? '#2563eb' : 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                          }}>
                            {sel && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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

        {/* ▶ 오른쪽: 발주 확정 ── */}
        <div className="pm-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
          {/* 패널 헤더 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <PackagePlus size={14} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>발주 확정</span>
            {selectedOpts.length > 0 && (
              <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                {selectedOpts.length}종
              </span>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 800, color: '#059669', background: '#ecfdf5', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} />발주등록
            </button>
            <button
              onClick={() => { loadPurchases(); loadProducts(true); setShippedOrders(loadShippedOrders()); setMappings(loadMappings()) }}
              style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} />새로고침
            </button>
          </div>

          {selectedOpts.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 8 }}>
              <PackagePlus size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: '13px', fontWeight: 700 }}>왼쪽에서 상품을 선택하세요</p>
              <p style={{ fontSize: '11px', color: '#cbd5e1' }}>선택한 상품이 여기 표시됩니다</p>
            </div>
          ) : (
            <>
              {/* 발주 기본 정보 */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <div>
                    <L>발주일 *</L>
                    <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                  </div>
                  <div>
                    <L>환율 (비원화→원화)</L>
                    <Input type="number" min="1" value={exchangeRate}
                      onChange={e => {
                        const v = Number(e.target.value) || 1
                        setExchangeRate(v)
                        try { localStorage.setItem('pm_exchange_rate', String(v)) } catch {}
                      }}
                      style={{ textAlign: 'right', fontWeight: 700 }} />
                  </div>
                </div>
                {/* 합계금액 표시 */}
                {(() => {
                  type FP = PmProduct & { cost_price?: number; cost_currency?: string }
                  const fp = products as unknown as FP[]
                  const total = selectedOpts.reduce((sum, s) => {
                    const p = fp.find(x => x.id === s.prodId)
                    const u = p?.cost_price ?? 0
                    const krw = unitToOrderKrw(u, p?.cost_currency || '원', exchangeRate)
                    return sum + krw * (Number(s.qty) || 0)
                  }, 0)
                  return (
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>합계금액</span>
                      <span style={{ fontSize: '15px', fontWeight: 900, color: total > 0 ? '#0f172a' : '#cbd5e1' }}>
                        {total > 0 ? `₩ ${Math.round(total).toLocaleString()}` : '-'}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* 선택 상품 목록 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                {selectedOptsSorted.map(s => {
                  const img = resolveQualImage(s.barcode, s.image)
                  type FP = PmProduct & { cost_price?: number; cost_currency?: string }
                  const prod = (products as unknown as FP[]).find(p => p.id === s.prodId)
                  const unitCost = prod?.cost_price ?? null
                  const currency = prod?.cost_currency || '원'
                  const unitKrw = unitCost != null ? unitToOrderKrw(unitCost, currency, exchangeRate) : null
                  const lineKrw = unitKrw != null ? unitKrw * (Number(s.qty) || 0) : null
                  return (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                      {/* 이미지 */}
                      {img
                        ? <img src={img} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 7, border: '1px solid #e2e8f0', flexShrink: 0, marginTop: 2 }} />
                        : <div style={{ width: 38, height: 38, background: '#f1f5f9', borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                            <Package size={14} style={{ color: '#cbd5e1' }} />
                          </div>
                      }
                      {/* 상품 정보 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.prodAbbr}</span>
                          <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                          <span style={{ fontSize: '10.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{s.optName}</span>
                          <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                          <span data-pm-barcode="1" style={{ fontSize: 11, fontWeight: 900, color: '#000000', letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.barcode || '-'}</span>
                        </div>
                        {/* 원가 + KRW 환산 */}
                        {unitCost != null && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '10px', color: '#475569', fontWeight: 700 }}>
                              단가: {currency !== '원' ? `${unitCost.toLocaleString()} ${currency}` : `₩${unitCost.toLocaleString()}`}
                            </span>
                            {currency !== '원' && (
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                (₩{Math.round(unitKrw!).toLocaleString()})
                              </span>
                            )}
                            {lineKrw != null && (
                              <span style={{ fontSize: '10px', fontWeight: 900, color: '#2563eb', marginLeft: 2 }}>
                                소계 ₩{Math.round(lineKrw).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* 수량 입력 */}
                      <Input type="number" min="1" value={s.qty}
                        onChange={e => setSelectedOpts(prev => prev.map(o => o.key === s.key ? { ...o, qty: e.target.value } : o))}
                        style={{ width: 64, textAlign: 'center', fontWeight: 800, flexShrink: 0 }} />
                      {/* 제거 버튼 */}
                      <button onClick={() => setSelectedOpts(prev => prev.filter(o => o.key !== s.key))}
                        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* 발주 확정 버튼 */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700 }}>
                    총 {selectedOpts.reduce((s, o) => s + (Number(o.qty) || 0), 0).toLocaleString()}개
                  </span>
                  <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setSelectedOpts([]) }}
                    style={{ fontSize: '11px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    전체 선택 해제
                  </button>
                </div>
                {/* 발주 종합계 KRW */}
                {(() => {
                  type FP = PmProduct & { cost_price?: number; cost_currency?: string }
                  const fp = products as unknown as FP[]
                  const grandTotal = selectedOpts.reduce((sum, s) => {
                    const p = fp.find(x => x.id === s.prodId)
                    const u = p?.cost_price ?? 0
                    const krw = unitToOrderKrw(u, p?.cost_currency || '원', exchangeRate)
                    return sum + krw * (Number(s.qty) || 0)
                  }, 0)
                  if (grandTotal <= 0) return null
                  return (
                    <div style={{ background: '#eff6ff', borderRadius: 8, padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>발주 종합계</span>
                      <span style={{ fontSize: '15px', fontWeight: 900, color: '#1d4ed8' }}>₩ {Math.round(grandTotal).toLocaleString()}</span>
                    </div>
                  )
                })()}
                {/* 발주서 다운 → 발주 확정 순서 */}
                <button onClick={handleDownloadOrderSheet}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer', marginBottom: 8 }}>
                  <FileDown size={14} />발주서 다운
                </button>
                <Button onClick={handleSubmitOrder} disabled={saving || !orderDate}
                  style={{ width: '100%', fontWeight: 800, height: 40, opacity: (saving || !orderDate) ? 0.6 : 1 }}>
                  <PackagePlus size={14} style={{ marginRight: 4 }} />
                  {saving ? '확정 중...' : '발주 확정'}
                </Button>
                {/* 상태 메시지 */}
                {saveMsg && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: '12px', fontWeight: 700, textAlign: 'center',
                    background: saveMsg.type === 'ok' ? '#ecfdf5' : '#fff1f2',
                    color:      saveMsg.type === 'ok' ? '#059669'  : '#dc2626',
                    border:    `1px solid ${saveMsg.type === 'ok' ? '#a7f3d0' : '#fecaca'}` }}>
                    {saveMsg.text}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 발주 이력 (토글) ── */}
      <div className="pm-card" style={{ flexShrink: 0, padding: 0, overflow: 'hidden' }}>
        <button onClick={() => setShowHistory(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
          <span>📋 발주 이력</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!showHistory && purchases.filter(isUnresolved).length > 0 && (
              <span style={{ fontSize: '11px', background: '#fffbeb', color: '#d97706', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                미입고 {purchases.filter(isUnresolved).length}건
              </span>
            )}
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {showHistory && (
          <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {/* DateNav */}
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}>
              <DateNav mode={mode} setMode={setMode} month={month} setMonth={setMonth} day={day} setDay={setDay} />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {allList.length}건
                {unresolvedOld.length > 0 && <span style={{ marginLeft: 8, color: '#d97706', fontWeight: 700 }}>⚠ 이전 미입고 {unresolvedOld.length}건 포함</span>}
              </span>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {allList.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700 }}>발주 내역이 없습니다</p>
                  </div>
                : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['발주일', '구매처', '품목', '발주', '입고', '미입고', '상태', '관리'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', fontWeight: 800, color: '#64748b', fontSize: '10.5px', textAlign: h === '구매처' || h === '발주일' ? 'left' : 'center', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allList.map(p => {
                        const tOrd = p.items.reduce((s, i) => s + i.ordered, 0)
                        const tRcv = p.items.reduce((s, i) => s + i.received, 0)
                        const tMis = tOrd - tRcv
                        const st = ST[p.status]
                        const old = isUnresolved(p) && !p.order_date.startsWith(key)
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', background: old ? '#fffbeb' : undefined }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700, color: '#334155' }}>
                              {p.order_date}
                              {old && <span style={{ marginLeft: 5, fontSize: '9.5px', fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '1px 5px', borderRadius: 99 }}>이전↑</span>}
                            </td>
                            <td style={{ padding: '7px 10px', color: '#475569' }}>{p.supplier || '-'}</td>
                            <td style={{ textAlign: 'center', color: '#64748b' }}>{p.items.length}건</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#1e293b' }}>{tOrd}</td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#0ea5e9' }}>{tRcv}</td>
                            <td style={{ textAlign: 'center', fontWeight: 900, color: tMis > 0 ? '#d97706' : '#94a3b8' }}>{tMis}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-flex', fontSize: '10.5px', fontWeight: 800, background: st.bg, color: st.color, padding: '3px 8px', borderRadius: 99 }}>{st.label}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {p.status !== 'completed' && p.status !== 'cancelled' && (
                                  <button onClick={() => setReceiveTarget(p)}
                                    style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ecfdf5', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Truck size={10} />입고
                                  </button>
                                )}
                                <button onClick={() => { setEditTarget(p); setEditFormData(JSON.parse(JSON.stringify(p))) }}
                                  style={{ fontSize: '11px', fontWeight: 800, color: '#7e22ce', background: '#fdf4ff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Edit2 size={10} />수정
                                </button>
                                <button onClick={() => setDeleteTarget(p)}
                                  style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626', background: '#fff1f2', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Trash2 size={10} />삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              }
            </div>
          </div>
        )}
      </div>

      {/* ── 발주등록 — 상품 검색 모달 ── */}
      {showAddModal && (
        <AddProductModal
          products={products}
          qualImages={mergedBarcodeImages}
          selectedKeys={selectedKeys}
          onAdd={opt => {
            if (!selectedKeys.has(opt.key)) setSelectedOpts(prev => [...prev, opt])
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── 입고 처리 모달 ── */}
      {receiveTarget && (
        <ReceiveModal purchase={receiveTarget} onClose={() => setReceiveTarget(null)} onSave={handleReceive} />
      )}

      {/* ── 수정 모달 ── */}
      {editTarget && editFormData && (
        <Modal isOpen onClose={() => { setEditTarget(null); setEditFormData(null) }} title={`발주 수정 — ${editTarget.order_date}`} size="xl">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><L>발주일</L><Input type="date" value={editFormData.order_date} onChange={e => setEditFormData(f => f ? { ...f, order_date: e.target.value } : f)} /></div>
            <div><L>구매처</L><Input value={editFormData.supplier} onChange={e => setEditFormData(f => f ? { ...f, supplier: e.target.value } : f)} /></div>
          </div>
          {editFormData.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.6fr 0.8fr 0.8fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Input value={item.product_code} onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], product_code: e.target.value }; return { ...f, items: it } })} />
              <Input value={item.option_name}  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], option_name: e.target.value }; return { ...f, items: it } })} />
              <Input value={item.barcode}       onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], barcode: e.target.value }; return { ...f, items: it } })} />
              <Input type="number" value={item.ordered}  onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], ordered: Number(e.target.value) || 0 }; return { ...f, items: it } })} />
              <Input type="number" value={item.received} onChange={e => setEditFormData(f => { if (!f) return f; const it = [...f.items]; it[i] = { ...it[i], received: Number(e.target.value) || 0 }; return { ...f, items: it } })} />
              <button onClick={() => setEditFormData(f => f ? { ...f, items: f.items.filter((_, j) => j !== i) } : f)}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff1f2', color: '#dc2626', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button onClick={() => setEditFormData(f => f ? { ...f, items: [...f.items, { product_code: '', option_name: '', barcode: '', ordered: 0, received: 0 }] } : f)}
            style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            <Plus size={12} />상품 추가
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditFormData(null) }}>취소</Button>
            <Button onClick={handleEditSave} disabled={saving}>저장</Button>
          </div>
        </Modal>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <Modal isOpen onClose={() => setDeleteTarget(null)} title="발주 삭제 확인" size="sm">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Trash2 size={36} style={{ color: '#dc2626', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{deleteTarget.order_date} 발주를 삭제하시겠습니까?</p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>삭제 시 발주/입고 수량이 상품관리에서 차감됩니다.</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={saving}
              style={{ background: '#dc2626', borderColor: '#dc2626', opacity: saving ? 0.6 : 1 }}>
              <Trash2 size={13} />{saving ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── 발주등록 — 상품 검색 모달 ── */
function AddProductModal({
  products, qualImages, selectedKeys, onAdd, onClose,
}: {
  products: PmProduct[]
  qualImages: Record<string, string>
  selectedKeys: Set<string>
  onAdd: (opt: SelectedOpt) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const results: SelectedOpt[] = []
    for (const prod of products) {
      const abbrMatch = (prod.abbr || prod.name || '').toLowerCase().includes(q)
      const codeMatch = (prod.code || '').toLowerCase().includes(q)
      for (const opt of prod.options ?? []) {
        const optMatch = (opt.name || '').toLowerCase().includes(q)
        const bcMatch  = (opt.barcode || '').toLowerCase().includes(q)
        if (abbrMatch || codeMatch || optMatch || bcMatch) {
          const key = `${prod.id}__${opt.barcode || opt.name}`
          results.push({
            key,
            prodId:       prod.id,
            prodCode:     prod.code,
            prodAbbr:     prod.abbr || prod.name,
            optName:      opt.name,
            barcode:      opt.barcode || '',
            image:        opt.image || '',
            currentStock: opt.current_stock ?? 0,
            unreceived:   0,
            sold:         0,
            reason:       'lowStock',
            qty:          '1',
          })
        }
      }
      if (results.length >= 80) break
    }
    return results
  }, [search, products])

  const stockColor = (s: number) => s === 0 ? '#dc2626' : s <= 3 ? '#d97706' : '#059669'
  const stockBg    = (s: number) => s === 0 ? '#fff1f2' : s <= 3 ? '#fffbeb' : '#f0fdf4'

  return (
    <Modal isOpen onClose={onClose} title="발주등록 — 상품 검색" size="lg">
      {/* 검색 입력 */}
      <div style={{ marginBottom: 12 }}>
        <input
          autoFocus
          placeholder="상품 약어, 품번, 옵션명, 바코드로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pm-input"
          style={{ width: '100%' }}
        />
      </div>

      {!search.trim() ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
          <Package size={36} style={{ opacity: 0.2, margin: '0 auto 10px' }} />
          <p style={{ fontSize: '13px', fontWeight: 700 }}>검색어를 입력하세요</p>
          <p style={{ fontSize: '11px', color: '#cbd5e1', marginTop: 4 }}>약어, 품번, 옵션명, 바코드 모두 검색 가능합니다</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
          <p style={{ fontSize: '13px', fontWeight: 700 }}>검색 결과가 없습니다</p>
          <p style={{ fontSize: '11px', color: '#cbd5e1', marginTop: 4 }}>다른 검색어를 입력해 보세요</p>
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                {['이미지', '약어 / 옵션 / 바코드', '현재고', ''].map(h => (
                  <th key={h} style={{ padding: '7px 8px', fontWeight: 800, color: '#64748b', fontSize: '10.5px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const img = qualImages[(item.barcode || '').trim()] || item.image
                const alreadySel = selectedKeys.has(item.key)
                return (
                  <tr key={item.key} style={{ borderBottom: '1px solid #f8fafc', background: alreadySel ? '#f0fdf4' : undefined }}>
                    {/* 이미지 */}
                    <td style={{ padding: '5px 8px', textAlign: 'center', width: 50 }}>
                      {img
                        ? <img src={img} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 7, border: '1px solid #e2e8f0', display: 'block', margin: '0 auto' }} />
                        : <div style={{ width: 38, height: 38, background: '#f1f5f9', borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={14} style={{ color: '#cbd5e1' }} />
                          </div>
                      }
                    </td>
                    {/* 약어·옵션·바코드 */}
                    <td style={{ padding: '5px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.prodAbbr}</span>
                        <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                        <span style={{ fontSize: '10.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{item.optName}</span>
                        <span style={{ fontSize: '10px', color: '#cbd5e1', flexShrink: 0 }}>·</span>
                        <span data-pm-barcode="1" style={{ fontSize: 11, fontWeight: 900, color: '#000000', letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.barcode || '-'}</span>
                      </div>
                    </td>
                    {/* 현재고 */}
                    <td style={{ padding: '5px 8px', textAlign: 'center', width: 64 }}>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: stockColor(item.currentStock), background: stockBg(item.currentStock), padding: '2px 8px', borderRadius: 99 }}>
                        {item.currentStock}
                      </span>
                    </td>
                    {/* 추가 버튼 */}
                    <td style={{ padding: '5px 10px', textAlign: 'center', width: 76 }}>
                      {alreadySel ? (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '3px 9px', borderRadius: 6 }}>추가됨</span>
                      ) : (
                        <button
                          onClick={() => onAdd(item)}
                          style={{ fontSize: '11.5px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Plus size={11} />추가
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length >= 80 && (
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', padding: '8px 0', background: '#f8fafc' }}>
              최대 80개까지 표시됩니다. 검색어를 더 구체적으로 입력하세요.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose}
          style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>
          닫기
        </button>
      </div>
    </Modal>
  )
}

/* ── 입고 처리 모달 ── */
function ReceiveModal({ purchase, onClose, onSave }: { purchase: Purchase; onClose: () => void; onSave: (items: Record<number, number>) => void }) {
  const [qty, setQty] = useState<Record<number, string>>(
    () => Object.fromEntries(purchase.items.map((item, i) => [i, String(item.ordered - item.received)]))
  )
  return (
    <Modal isOpen onClose={onClose} title={`입고 처리 — ${purchase.order_date}`} size="md">
      <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: 14 }}>실제 입고된 수량을 입력하세요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {purchase.items.map((item, i) => {
          const remain = item.ordered - item.received
          return (
            <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>{item.product_code}</p>
                  {item.option_name && <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: 2 }}>{item.option_name}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8' }}>발주 {item.ordered} / 기입고 {item.received}</p>
                  <p style={{ fontSize: '11.5px', fontWeight: 800, color: '#f59e0b' }}>미입고 {remain}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>입고 수량</label>
                <Input type="number" value={qty[i]} min={0} max={remain}
                  onChange={e => setQty(prev => ({ ...prev, [i]: e.target.value }))}
                  style={{ fontWeight: 800, fontSize: '14px' }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={() => onSave(Object.fromEntries(Object.entries(qty).map(([k, v]) => [Number(k), Number(v) || 0])))}>
          <CheckCircle2 size={13} />입고 처리 완료
        </Button>
      </div>
    </Modal>
  )
}
