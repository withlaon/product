'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import {
  TrendingUp, Package, Store, Calendar, RefreshCw, ChevronLeft, ChevronRight,
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

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function monthsRangeEndAt(ym: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(ym, -(count - 1 - i)))
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
          <text key={d.label} x={xPos(i)} y={H - 2} textAnchor="middle" fontSize={7.5} fill="#94a3b8">
            {d.label.slice(5).replace(/^0/, '')}월
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

export default function SalesManagementPage() {
  const curYM = getCurYM()
  const pathname = usePathname()
  const [selMonth, setSelMonth] = useState(curYM)
  const [mallFilter, setMallFilter] = useState<string | ''>('') // '' = 전체
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
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refresh()
    })
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onCustom)
      window.removeEventListener('pm_products_cache_sync', onCustom)
    }
  }, [refresh])

  const { valid: validBarcodes, meta: barcodeMeta } = useMemo(
    () => buildBarcodeIndex(products),
    [products],
  )

  /** 출고확정(delivered)만, 바코드는 매핑·SKU 기준, 상품관리에 존재하는 바코드만 집계 */
  const salesRows = useMemo(() => {
    const rows: {
      ym: string
      channel: string
      barcode: string
      qty: number
    }[] = []
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

  const channelsInMonth = useMemo(() => {
    const set = new Set<string>()
    for (const r of salesRows) {
      if (r.ym === selMonth) set.add(r.channel)
    }
    return [...set].sort()
  }, [salesRows, selMonth])

  const filteredRows = useMemo(() => {
    return salesRows.filter(r => {
      if (r.ym !== selMonth) return false
      if (mallFilter && r.channel !== mallFilter) return false
      return true
    })
  }, [salesRows, selMonth, mallFilter])

  const aggByBarcode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of filteredRows) {
      m[r.barcode] = (m[r.barcode] ?? 0) + r.qty
    }
    return m
  }, [filteredRows])

  const topGlobal = useMemo(() => {
    return Object.entries(aggByBarcode)
      .map(([barcode, qty]) => ({ barcode, qty, ...barcodeMeta[barcode] }))
      .sort((a, b) => b.qty - a.qty)
  }, [aggByBarcode, barcodeMeta])

  const topByMall = useMemo(() => {
    const byCh: Record<string, Record<string, number>> = {}
    for (const r of salesRows) {
      if (r.ym !== selMonth) continue
      if (!byCh[r.channel]) byCh[r.channel] = {}
      byCh[r.channel][r.barcode] = (byCh[r.channel][r.barcode] ?? 0) + r.qty
    }
    const result: Record<string, { barcode: string; qty: number; productName: string; optionLabel: string }[]> = {}
    for (const ch of Object.keys(byCh)) {
      result[ch] = Object.entries(byCh[ch])
        .map(([barcode, qty]) => ({
          barcode,
          qty,
          productName: barcodeMeta[barcode]?.productName ?? '',
          optionLabel: barcodeMeta[barcode]?.optionLabel ?? '',
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8)
    }
    return result
  }, [salesRows, selMonth, barcodeMeta])

  const trendMonths = useMemo(() => monthsRangeEndAt(selMonth, 6), [selMonth])

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

  const monthTotalQty = useMemo(
    () => filteredRows.reduce((s, r) => s + r.qty, 0),
    [filteredRows],
  )
  const skuCount = useMemo(() => Object.keys(aggByBarcode).length, [aggByBarcode])

  const handleRefreshClick = async () => {
    setRefreshing(true)
    await hydrateShippedOrdersFromServer()
    await refresh()
    setTimeout(() => setRefreshing(false), 400)
  }

  const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

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
                출고내역에서 <b style={{ color: '#1d4ed8' }}>출고확정</b>된 건만 반영합니다. 집계 바코드는 주문 매핑·SKU와 동일하며,
                <b style={{ color: '#0f172a' }}> 상품관리에 등록된 바코드</b>만 표시됩니다. 상품 삭제 시 여기서도 즉시 빠집니다.
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} color="#64748b" />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>기준 월</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              onClick={() => setSelMonth(m => shiftMonth(m, -1))}
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
              onClick={() => setSelMonth(m => shiftMonth(m, 1))}
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
        <div style={{ width: 1, height: 24, background: '#f1f5f9' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Store size={14} color="#64748b" />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>쇼핑몰</span>
          <select
            value={mallFilter}
            onChange={e => setMallFilter(e.target.value)}
            className="pm-input"
            style={{ height: 32, fontSize: 12, fontWeight: 700, minWidth: 160 }}
          >
            <option value="">전체 쇼핑몰</option>
            {channelsInMonth.map(ch => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          {
            label: `${selMonth.replace('-', '.')}월 판매수량(확정)`,
            value: monthTotalQty.toLocaleString(),
            sub: mallFilter ? `${mallFilter} 한정` : '전체 채널 합산',
            icon: <Package size={16} color="#2563eb" />,
            bg: '#eff6ff',
          },
          {
            label: '판매 SKU 수',
            value: String(skuCount),
            sub: '해당 월·필터 기준 고유 바코드',
            icon: <TrendingUp size={16} color="#7c3aed" />,
            bg: '#f5f3ff',
          },
          {
            label: '이번 달 1위 SKU',
            value: topGlobal[0] ? `${topGlobal[0].qty.toLocaleString()}개` : '—',
            sub: topGlobal[0]
              ? `${topGlobal[0].abbr || topGlobal[0].productName || topGlobal[0].barcode}`
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="pm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            월별 판매 추세 (전체 쇼핑몰 · 수량)
          </div>
          <div style={{ padding: '8px 12px 10px', height: 100 }}>
            <MonthTrendChart data={trendAll} color="#2563eb" gradId="sales-trend-all" />
          </div>
        </div>
        <div className="pm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
            월별 판매 추세 {mallFilter ? `(${mallFilter})` : '(쇼핑몰을 선택하면 표시)'}
          </div>
          <div style={{ padding: '8px 12px 10px', height: 100 }}>
            {mallFilter ? (
              <MonthTrendChart data={trendMall} color="#7c3aed" gradId="sales-trend-mall" />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                상단에서 쇼핑몰을 고르면 보라색 그래프가 갱신됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pm-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
          전체 쇼핑몰 통합 — 인기 상품 TOP {Math.min(20, topGlobal.length) || 20} (바코드 기준)
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {topGlobal.length === 0 ? (
            <p style={{ padding: 16, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>이번 달 출고확정·유효 바코드 데이터가 없습니다.</p>
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
                {topGlobal.slice(0, 20).map((row, i) => (
                  <tr key={row.barcode} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '8px 10px', color: '#94a3b8', fontWeight: 800 }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{row.barcode}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{row.productName || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11 }}>{row.optionLabel || '—'}</td>
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

      <div className="pm-card" style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
          쇼핑몰별 인기 SKU ({selMonth.replace('-', '.')}월 · 채널당 상위 8개)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {channelsInMonth.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>이번 달 데이터가 없습니다.</p>
          ) : (
            channelsInMonth.map(ch => {
              const rows = topByMall[ch] ?? []
              return (
                <div
                  key={ch}
                  style={{
                    border: '1px solid #f1f5f9',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  <div style={{ padding: '8px 10px', background: '#f8fafc', fontSize: 11, fontWeight: 800, color: '#475569' }}>
                    {ch}
                  </div>
                  {rows.length === 0 ? (
                    <p style={{ padding: 10, fontSize: 11, color: '#94a3b8' }}>없음</p>
                  ) : (
                    <table style={{ ...tableStyle, fontSize: 11 }}>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.barcode} style={{ borderTop: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{r.productName || r.barcode}</div>
                              <div style={{ color: '#94a3b8', fontSize: 10 }}>{r.optionLabel}</div>
                              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{r.barcode}</div>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 900, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                              {r.qty.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
