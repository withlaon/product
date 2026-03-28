'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import {
  TrendingUp,
  Package,
  Store,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  loadShippedOrders,
  loadMappings,
  lookupMapping,
  hydrateShippedOrdersFromServer,
  MAPPING_KEY,
  SHIPPED_ORDERS_KEY,
} from '@/lib/orders'
import type { ShippedOrder } from '@/lib/orders'
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboard-sync'

const CHANNEL_STORAGE_KEY = 'pm_mall_channels_v5'

interface CachedOption {
  barcode?: string
  name?: string
  korean_name?: string
  [k: string]: unknown
}
interface CachedProduct {
  id: string
  name?: string
  abbr?: string
  options: CachedOption[]
}

interface BarcodeMeta {
  productName: string
  abbr: string
  optionLabel: string
}

function getCurYM() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function getCurYear() {
  return String(new Date().getFullYear())
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function shiftYear(y: string, delta: number) {
  return String(Number(y) + delta)
}

function monthsRangeEndAt(ym: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(ym, -(count - 1 - i)))
}

function yearMonthKeys(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function loadCachedProducts(): CachedProduct[] {
  try {
    const raw = localStorage.getItem('pm_products_cache_v1')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const data = Array.isArray(parsed) ? parsed : parsed?.data
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function loadConnectedMallNames(): string[] {
  try {
    const raw = localStorage.getItem(CHANNEL_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as { name?: string; active?: boolean }[]
    if (!Array.isArray(arr)) return []
    return arr.filter(c => c && c.active && String(c.name ?? '').trim()).map(c => String(c.name).trim())
  } catch {
    return []
  }
}

function isDeliveredConfirmed(o: ShippedOrder): boolean {
  const st = String((o as { status?: unknown }).status ?? '').trim().toLowerCase()
  return st === 'delivered'
}

function buildBarcodeIndex(products: CachedProduct[]) {
  const valid = new Set<string>()
  const meta: Record<string, BarcodeMeta> = {}
  for (const p of products) {
    for (const o of p.options ?? []) {
      const bc = String(o.barcode ?? '').trim()
      if (!bc) continue
      valid.add(bc)
      meta[bc] = {
        productName: p.name ?? p.abbr ?? '',
        abbr: p.abbr ?? '',
        optionLabel: String(o.korean_name ?? o.name ?? ''),
      }
    }
  }
  return { valid, meta }
}

function resolveBarcode(
  mappings: ReturnType<typeof loadMappings>,
  item: { product_name?: string; sku?: string; option?: string },
): string {
  const m = lookupMapping(mappings, item.product_name ?? '', item.option)
  return String(m.barcode ?? item.sku ?? '').trim()
}

/** 월 단위 추세 차트 (라벨 = YYYY-MM) */
function MonthTrendChart({ data, color, gradId }: {
  data: { label: string; value: number }[]
  color: string
  gradId: string
}) {
  const [tipIdx, setTipIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 400, h: 72 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 10 && height > 10) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const W = size.w
  const H = size.h
  const padL = 6
  const padR = 6
  const padT = 4
  const padB = 16
  const cW = W - padL - padR
  const cH = H - padT - padB
  const maxV = Math.max(...data.map(d => d.value), 1)
  const cols = data.length
  const xPos = (i: number) => (cols <= 1 ? padL + cW / 2 : padL + (i / (cols - 1)) * cW)
  const yVal = (v: number) => padT + cH - (v / maxV) * cH
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yVal(d.value).toFixed(1)}`).join(' ')
  const fillPath = cols > 0
    ? `${linePath} L${xPos(cols - 1).toFixed(1)},${(padT + cH).toFixed(1)} L${padL},${(padT + cH).toFixed(1)} Z`
    : ''

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    let nearest = 0
    let minD = Infinity
    data.forEach((_, i) => {
      const d = Math.abs(xPos(i) - mx)
      if (d < minD) {
        minD = d
        nearest = i
      }
    })
    setTipIdx(nearest)
  }

  const tip = tipIdx !== null ? data[tipIdx] : null
  const tipXPct = tipIdx !== null && W > 0 ? (xPos(tipIdx) / W) * 100 : 0

  const xLabel = (label: string) => {
    if (label.length >= 7 && label.includes('-')) {
      return `${label.slice(5).replace(/^0/, '')}월`
    }
    return label
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 72 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setTipIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={padL} y1={padT + cH} x2={W - padR} y2={padT + cH} stroke="#f1f5f9" strokeWidth={0.8} />
        {fillPath && <path d={fillPath} fill={`url(#${gradId})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {tipIdx !== null && (data[tipIdx]?.value ?? 0) > 0 && (
          <circle
            cx={xPos(tipIdx)}
            cy={yVal(data[tipIdx].value)}
            r={3}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5}
          />
        )}
        {data.map((d, i) => (
          <text key={`${d.label}-${i}`} x={xPos(i)} y={H - 2} textAnchor="middle" fontSize={7.5} fill="#94a3b8">
            {xLabel(d.label)}
          </text>
        ))}
      </svg>
      {tip && tipIdx !== null && (
        <div
          style={{
            position: 'absolute',
            top: '6%',
            pointerEvents: 'none',
            zIndex: 20,
            left: `${tipXPct > 72 ? tipXPct - 18 : tipXPct + 2}%`,
            transform: tipXPct > 72 ? 'translateX(-100%)' : 'none',
            background: 'rgba(15,23,42,0.92)',
            borderRadius: 7,
            padding: '5px 9px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
          }}
        >
          <p style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{tip.label}</p>
          <p style={{ fontSize: '12px', color: '#fff', fontWeight: 800 }}>{tip.value.toLocaleString()}개</p>
        </div>
      )}
    </div>
  )
}

type PeriodMode = 'month' | 'year'

export default function SalesManagementPage() {
  const curYM = getCurYM()
  const curYear = getCurYear()
  const pathname = usePathname()
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selMonth, setSelMonth] = useState(curYM)
  const [selYear, setSelYear] = useState(curYear)
  const [mallFilter, setMallFilter] = useState<string>('')
  const [connectedMalls, setConnectedMalls] = useState<string[]>([])
  const [expandedMallPanel, setExpandedMallPanel] = useState<Record<string, boolean>>({})
  const [expandedCumulativeBarcode, setExpandedCumulativeBarcode] = useState<string | null>(null)
  const [shipped, setShipped] = useState<ShippedOrder[]>([])
  const [mappings, setMappings] = useState<ReturnType<typeof loadMappings>>({})
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const loadProductsWithFallback = useCallback(async (): Promise<CachedProduct[]> => {
    const cached = loadCachedProducts()
    if (cached.length > 0) return cached
    try {
      const res = await fetch('/api/pm-products')
      if (!res.ok) return []
      const arr = await res.json()
      return Array.isArray(arr) ? (arr as CachedProduct[]) : []
    } catch {
      return []
    }
  }, [])

  const refresh = useCallback(async () => {
    setMappings(loadMappings())
    setShipped(loadShippedOrders())
    setConnectedMalls(loadConnectedMallNames().sort((a, b) => a.localeCompare(b, 'ko')))
    const prods = await loadProductsWithFallback()
    setProducts(prods)
  }, [loadProductsWithFallback])

  useEffect(() => {
    void hydrateShippedOrdersFromServer().finally(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void refresh()
  }, [hydrated, pathname, refresh])

  useEffect(() => {
    const WATCH_KEYS = new Set([
      SHIPPED_ORDERS_KEY,
      'pm_products_cache_v1',
      MAPPING_KEY,
      CHANNEL_STORAGE_KEY,
      'pm_dashboard_refresh_ts',
      'pm_products_cache_sync',
      'pm_products_mapping_signal',
      'pm_channel_mappings_v2',
    ])
    const onStorage = (e: StorageEvent) => {
      if (e.key && WATCH_KEYS.has(e.key)) void refresh()
    }
    const onCustom = () => void refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onCustom)
    window.addEventListener('pm_products_cache_sync', onCustom)
    window.addEventListener('pm_mapping_updated', onCustom)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refresh()
    })
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onCustom)
      window.removeEventListener('pm_products_cache_sync', onCustom)
      window.removeEventListener('pm_mapping_updated', onCustom)
    }
  }, [refresh])

  const { valid: validBarcodes, meta: barcodeMeta } = useMemo(
    () => buildBarcodeIndex(products),
    [products],
  )

  const salesRows = useMemo(() => {
    const rows: { ym: string; channel: string; barcode: string; qty: number }[] = []
    for (const o of shipped) {
      if (!isDeliveredConfirmed(o)) continue
      const dateKey = (o.shipped_at ?? o.order_date ?? '').slice(0, 10)
      const ym = dateKey.slice(0, 7)
      if (!ym || ym.length < 7) continue
      for (const item of o.items) {
        const barcode = resolveBarcode(mappings, item)
        if (!barcode || !validBarcodes.has(barcode)) continue
        const qty = item.quantity ?? 1
        rows.push({ ym, channel: o.channel, barcode, qty })
      }
    }
    return rows
  }, [shipped, mappings, validBarcodes])

  const periodLabel = useMemo(() => {
    if (periodMode === 'year') return `${selYear}년`
    return `${selMonth.replace('-', '.')}월`
  }, [periodMode, selYear, selMonth])

  const filteredRows = useMemo(() => {
    return salesRows.filter(r => {
      if (periodMode === 'month') {
        if (r.ym !== selMonth) return false
      } else {
        if (!r.ym.startsWith(`${selYear}-`)) return false
      }
      if (mallFilter && r.channel !== mallFilter) return false
      return true
    })
  }, [salesRows, periodMode, selMonth, selYear, mallFilter])

  const aggByBarcode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of filteredRows) {
      m[r.barcode] = (m[r.barcode] ?? 0) + r.qty
    }
    return m
  }, [filteredRows])

  const topPeriod = useMemo(() => {
    return Object.entries(aggByBarcode)
      .map(([barcode, qty]) => ({ barcode, qty, ...barcodeMeta[barcode] }))
      .sort((a, b) => b.qty - a.qty)
  }, [aggByBarcode, barcodeMeta])

  /** 전체 기간 누적 (바코드 → 수량) */
  const cumulativeGlobalMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of salesRows) {
      m[r.barcode] = (m[r.barcode] ?? 0) + r.qty
    }
    return m
  }, [salesRows])

  const cumulativeTop20 = useMemo(() => {
    return Object.entries(cumulativeGlobalMap)
      .map(([barcode, qty]) => ({ barcode, qty, ...barcodeMeta[barcode] }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20)
  }, [cumulativeGlobalMap, barcodeMeta])

  /** 바코드별 쇼핑몰 누적 수량 (누적 TOP20 상세용) */
  const qtyByBarcodeByChannel = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const r of salesRows) {
      if (!m[r.barcode]) m[r.barcode] = {}
      m[r.barcode][r.channel] = (m[r.barcode][r.channel] ?? 0) + r.qty
    }
    return m
  }, [salesRows])

  /** 쇼핑몰별 누적 TOP (연동 쇼핑몰 이름 기준) */
  const cumulativeByMall = useMemo(() => {
    const byCh: Record<string, Record<string, number>> = {}
    for (const r of salesRows) {
      if (!byCh[r.channel]) byCh[r.channel] = {}
      byCh[r.channel][r.barcode] = (byCh[r.channel][r.barcode] ?? 0) + r.qty
    }
    return byCh
  }, [salesRows])

  const mallCumulativeRanked = useMemo(() => {
    const out: Record<string, { barcode: string; qty: number; productName: string; optionLabel: string }[]> = {}
    for (const mallName of connectedMalls) {
      const sub = cumulativeByMall[mallName] ?? {}
      out[mallName] = Object.entries(sub)
        .map(([barcode, qty]) => ({
          barcode,
          qty,
          productName: barcodeMeta[barcode]?.productName ?? '',
          optionLabel: barcodeMeta[barcode]?.optionLabel ?? '',
        }))
        .sort((a, b) => b.qty - a.qty)
    }
    return out
  }, [connectedMalls, cumulativeByMall, barcodeMeta])

  const trendMonths = useMemo(() => {
    if (periodMode === 'year') return yearMonthKeys(selYear)
    return monthsRangeEndAt(selMonth, 12)
  }, [periodMode, selYear, selMonth])

  const trendAll = useMemo(() => {
    return trendMonths.map(ym => {
      let v = 0
      for (const r of salesRows) {
        if (r.ym !== ym) continue
        v += r.qty
      }
      return { label: ym, value: v }
    })
  }, [salesRows, trendMonths])

  const trendMall = useMemo(() => {
    if (!mallFilter) return trendMonths.map(ym => ({ label: ym, value: 0 }))
    return trendMonths.map(ym => {
      let v = 0
      for (const r of salesRows) {
        if (r.ym !== ym || r.channel !== mallFilter) continue
        v += r.qty
      }
      return { label: ym, value: v }
    })
  }, [salesRows, trendMonths, mallFilter])

  const periodTotalQty = useMemo(() => filteredRows.reduce((s, r) => s + r.qty, 0), [filteredRows])
  const skuCount = useMemo(() => Object.keys(aggByBarcode).length, [aggByBarcode])

  const handleRefreshClick = async () => {
    setRefreshing(true)
    await hydrateShippedOrdersFromServer()
    await refresh()
    setTimeout(() => setRefreshing(false), 400)
  }

  const toggleMallExpand = (mall: string) => {
    setExpandedMallPanel(prev => ({ ...prev, [mall]: !prev[mall] }))
  }

  const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  }

  const centerTitle = mallFilter
    ? `「${mallFilter}」 통합 인기 상품 TOP 20`
    : '전체 쇼핑몰 통합 인기 상품 TOP 20'

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div className="pm-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={18} color="#2563eb" strokeWidth={2.2} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>판매관리</p>
              <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.35 }}>
                출고내역 <b style={{ color: '#1d4ed8' }}>출고확정</b>·바코드 기준. 쇼핑몰 목록은 <b>매핑관리</b> 연동 쇼핑몰과 동일합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshClick()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: '#475569',
            }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'pmSpin 0.6s linear infinite' : 'none' }} />
            동기화
          </button>
        </div>
        <style>{`@keyframes pmSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>

      <div className="pm-card" style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e2e8f0' }}>
          {(['month', 'year'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setPeriodMode(m)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                background: periodMode === m ? '#0f172a' : '#fff',
                color: periodMode === m ? '#fff' : '#64748b',
              }}
            >
              {m === 'month' ? '월 단위' : '연도 단위'}
            </button>
          ))}
        </div>

        {periodMode === 'month' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="#64748b" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>기준 월</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => setSelMonth(x => shiftMonth(x, -1))}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', minWidth: 72, textAlign: 'center' }}>
                {selMonth.replace('-', '.')}월
              </span>
              <button
                type="button"
                onClick={() => setSelMonth(x => shiftMonth(x, 1))}
                disabled={selMonth >= curYM}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: selMonth >= curYM ? 'not-allowed' : 'pointer',
                  opacity: selMonth >= curYM ? 0.45 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="#64748b" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>기준 연도</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => setSelYear(y => shiftYear(y, -1))}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', minWidth: 52, textAlign: 'center' }}>
                {selYear}년
              </span>
              <button
                type="button"
                onClick={() => setSelYear(y => shiftYear(y, 1))}
                disabled={selYear >= curYear}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: selYear >= curYear ? 'not-allowed' : 'pointer',
                  opacity: selYear >= curYear ? 0.45 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        <div style={{ width: 1, height: 24, background: '#f1f5f9' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Store size={14} color="#64748b" />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>쇼핑몰</span>
          <select
            value={mallFilter}
            onChange={e => setMallFilter(e.target.value)}
            className="pm-input"
            style={{ height: 32, fontSize: 12, fontWeight: 700, minWidth: 200, maxWidth: 280 }}
          >
            <option value="">전체 쇼핑몰</option>
            {connectedMalls.map(ch => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          {
            label: `${periodLabel} 판매수량(확정)`,
            value: periodTotalQty.toLocaleString(),
            sub: mallFilter ? `${mallFilter} 한정` : '전체 채널 합산',
            icon: <Package size={16} color="#2563eb" />,
            bg: '#eff6ff',
          },
          {
            label: '판매 SKU 수',
            value: String(skuCount),
            sub: `${periodLabel}·필터 기준 고유 바코드`,
            icon: <TrendingUp size={16} color="#7c3aed" />,
            bg: '#f5f3ff',
          },
          {
            label: `${periodMode === 'year' ? '해당 연도' : '해당 월'} 1위 SKU`,
            value: topPeriod[0] ? `${topPeriod[0].qty.toLocaleString()}개` : '—',
            sub: topPeriod[0]
              ? `${topPeriod[0].abbr || topPeriod[0].productName || topPeriod[0].barcode}`
              : '데이터 없음',
            icon: <Store size={16} color="#059669" />,
            bg: '#ecfdf5',
          },
        ].map(k => (
          <div key={k.label} className="pm-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: k.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {k.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{k.value}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>{k.label}</p>
              <p style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600, marginTop: 2 }}>{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/*
        ① 연동 쇼핑몰별 누적(좌, 세로 통합) | 월별 추세 2열 | ② 누적 TOP 20(우, 세로 통합)
        그 아래(차트 2개 아래): 기간·필터 통합 인기 상품 TOP 20
      */}
      <div className="pm-sales-charts-band">
        {/* ① 왼쪽: 연동 쇼핑몰별 누적 인기 SKU */}
        <div className="pm-card pm-sales-mall" style={{ padding: '10px 12px', maxHeight: 'min(85vh, 720px)', overflowY: 'auto' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
            연동 쇼핑몰별 누적 인기 SKU
          </p>
          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 10, lineHeight: 1.4 }}>
            누적 판매량 기준 TOP 5 · 블록을 누르면 TOP 30까지 펼칩니다.
          </p>
          {connectedMalls.length === 0 ? (
            <p style={{ fontSize: 11, color: '#94a3b8' }}>매핑관리에서 연동 쇼핑몰을 등록하세요.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connectedMalls.map(mall => {
                const ranked = mallCumulativeRanked[mall] ?? []
                const expanded = expandedMallPanel[mall] === true
                const show = expanded ? ranked.slice(0, 30) : ranked.slice(0, 5)
                return (
                  <button
                    key={mall}
                    type="button"
                    onClick={() => toggleMallExpand(mall)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 10,
                      border: expanded ? '1.5px solid #7c3aed' : '1.5px solid #f1f5f9',
                      background: expanded ? '#faf5ff' : '#fff',
                      padding: '10px 10px 8px',
                      cursor: 'pointer',
                      transition: 'border-color 120ms, background 120ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>{mall}</span>
                      {expanded
                        ? <ChevronUp size={14} color="#7c3aed" />
                        : <ChevronDown size={14} color="#94a3b8" />}
                    </div>
                    {ranked.length === 0 ? (
                      <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>누적 실적 없음</span>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {show.map((row, i) => (
                          <li
                            key={row.barcode}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: '4px 0',
                              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                              fontSize: 10,
                            }}
                          >
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 800, color: '#64748b', marginRight: 4 }}>{i + 1}.</span>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.productName || row.barcode}</span>
                              {row.optionLabel ? (
                                <span style={{ display: 'block', color: '#000000', fontWeight: 600, marginTop: 1, fontSize: 12 }}>
                                  {row.optionLabel}
                                </span>
                              ) : null}
                              <span style={{ fontFamily: 'monospace', color: '#000000', fontSize: 11 }}>{row.barcode}</span>
                            </span>
                            <span style={{ fontWeight: 900, color: '#7c3aed', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {row.qty.toLocaleString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {ranked.length > 5 ? (
                      <p style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, marginTop: 6, marginBottom: 0 }}>
                        {expanded ? '접기' : `더보기 · TOP 30 (${ranked.length}개 SKU)`}
                      </p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="pm-card pm-sales-chart-all" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            {periodMode === 'year' ? `${selYear}년` : '최근 1년'} 월별 판매 추세 (전체 쇼핑몰)
          </div>
          <div style={{ padding: '8px 12px 10px', height: 100 }}>
            <MonthTrendChart data={trendAll} color="#2563eb" gradId="sales-trend-all" />
          </div>
        </div>
        <div className="pm-card pm-sales-chart-mall" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            월별 판매 추세 {mallFilter ? `(${mallFilter})` : '(쇼핑몰 선택 시)'}
          </div>
          <div style={{ padding: '8px 12px 10px', height: 100 }}>
            {mallFilter ? (
              <MonthTrendChart data={trendMall} color="#7c3aed" gradId="sales-trend-mall" />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>
                상단에서 쇼핑몰을 고르면 보라색 그래프가 갱신됩니다.
              </div>
            )}
          </div>
        </div>

        {/* ② 오른쪽: 전체 누적 TOP 20 */}
        <div className="pm-card pm-sales-top20" style={{ padding: 0, overflow: 'hidden', maxHeight: 'min(85vh, 720px)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            누적 판매 TOP 20
          </div>
          <p style={{ padding: '6px 14px 0', fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: 0 }}>
            전체 쇼핑몰·전 기간 합산 (출고확정) · 행 클릭 시 쇼핑몰별 수량
          </p>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {cumulativeTop20.length === 0 ? (
              <p style={{ padding: 16, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>누적 데이터 없음</p>
            ) : (
              <table style={{ ...tableStyle, fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#fef3c7', zIndex: 1 }}>
                  <tr>
                    {['#', '상품 / 바코드', '누적'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '7px 10px',
                          textAlign: h === '누적' ? 'right' : 'left',
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#92400e',
                          borderBottom: '1px solid #fde68a',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cumulativeTop20.map((row, i) => {
                    const open = expandedCumulativeBarcode === row.barcode
                    const breakdown = Object.entries(qtyByBarcodeByChannel[row.barcode] ?? {}).sort((a, b) => b[1] - a[1])
                    return (
                      <Fragment key={row.barcode}>
                        <tr
                          onClick={() => setExpandedCumulativeBarcode(open ? null : row.barcode)}
                          style={{
                            borderBottom: '1px solid #fffbeb',
                            cursor: 'pointer',
                            background: open ? '#fffbeb' : undefined,
                          }}
                          onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#fffdf5' }}
                          onMouseLeave={e => { if (!open) e.currentTarget.style.background = '' }}
                        >
                          <td style={{ padding: '7px 10px', color: '#b45309', fontWeight: 900 }}>{i + 1}</td>
                          <td style={{ padding: '7px 10px', minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.productName || row.barcode}</div>
                            <div style={{ fontSize: 12, color: '#000000', fontWeight: 600 }}>{row.optionLabel}</div>
                            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#000000' }}>{row.barcode}</div>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#b45309', whiteSpace: 'nowrap' }}>
                            {row.qty.toLocaleString()}
                          </td>
                        </tr>
                        {open ? (
                          <tr style={{ background: '#fffbeb' }}>
                            <td colSpan={3} style={{ padding: '8px 12px 12px', borderBottom: '1px solid #fde68a' }}>
                              <p style={{ fontSize: 10, fontWeight: 800, color: '#92400e', margin: '0 0 6px' }}>쇼핑몰별 판매</p>
                              {breakdown.length === 0 ? (
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>쇼핑몰별 내역 없음</p>
                              ) : (
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                  {breakdown.map(([ch, q]) => (
                                    <li
                                      key={ch}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: '#0f172a',
                                        padding: '3px 0',
                                      }}
                                    >
                                      <span>{ch}</span>
                                      <span style={{ fontWeight: 900, color: '#b45309' }}>{q.toLocaleString()}개</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 기간·필터 통합 인기 상품 (차트 2개 바로 아래) */}
        <div className="pm-card pm-sales-period-top" style={{ padding: 0, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            {centerTitle} · {periodLabel} · 바코드 기준
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {topPeriod.length === 0 ? (
              <p style={{ padding: 16, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                해당 기간·조건의 출고확정 데이터가 없습니다.
              </p>
            ) : (
              <table style={tableStyle}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    {['#', '바코드', '상품', '옵션', '수량'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: h === '수량' ? 'right' : 'left',
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#64748b',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topPeriod.slice(0, 20).map((row, i) => (
                    <tr key={row.barcode} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 800 }}>{i + 1}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: 900, color: '#000000', letterSpacing: '0.02em' }}>{row.barcode}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{row.productName || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#000000', fontSize: 13, fontWeight: 600 }}>{row.optionLabel || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#2563eb' }}>
                        {row.qty.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .pm-sales-charts-band {
          display: grid;
          grid-template-columns: minmax(260px, 300px) 1fr 1fr minmax(260px, 300px);
          grid-template-rows: auto minmax(0, 1fr);
          gap: 10px;
          align-items: stretch;
        }
        .pm-sales-mall { grid-row: 1 / -1; grid-column: 1; }
        .pm-sales-chart-all { grid-row: 1; grid-column: 2; }
        .pm-sales-chart-mall { grid-row: 1; grid-column: 3; }
        .pm-sales-top20 { grid-row: 1 / -1; grid-column: 4; }
        .pm-sales-period-top { grid-row: 2; grid-column: 2 / span 2; }
        @media (max-width: 1100px) {
          .pm-sales-charts-band {
            grid-template-columns: 1fr;
            grid-template-rows: none;
          }
          .pm-sales-mall,
          .pm-sales-chart-all,
          .pm-sales-chart-mall,
          .pm-sales-top20,
          .pm-sales-period-top {
            grid-row: auto;
            grid-column: auto;
          }
        }
      `}</style>
    </div>
  )
}
