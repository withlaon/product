/**
 * 상품 삭제 시: 출고·주문·송장큐·발주(해당 상품코드) 이력은 제거하되
 * 대시보드 월·일별 판매액·매입액 집계는 삭제 전 금액을 보정치로 남김.
 */

import {
  loadOrders,
  loadInvoiceQueue,
  loadShippedOrders,
  removeOrdersByIds,
  removeInvoiceQueueByIds,
  removeShippedOrdersByIds,
  dashboardAmountForMergedRow,
  type Order,
  type ShippedOrder,
} from '@/lib/orders'
import { DEFAULT_EXCHANGE_RATE, unitToOrderKrw, apiFetchPurchases, apiUpdatePurchase, apiDeletePurchase } from '@/app/purchase/_shared'
import type { Purchase } from '@/app/purchase/_shared'
import { broadcastDashboardRefresh } from '@/lib/dashboard-sync'

export const DASHBOARD_RETENTION_KEY = 'pm_dashboard_retention_v1'

export interface DashboardRetention {
  salesByDay: Record<string, number>
  purchaseByMonth: Record<string, number>
}

export function loadDashboardRetention(): DashboardRetention {
  if (typeof window === 'undefined') return { salesByDay: {}, purchaseByMonth: {} }
  try {
    const raw = localStorage.getItem(DASHBOARD_RETENTION_KEY)
    if (!raw) return { salesByDay: {}, purchaseByMonth: {} }
    const p = JSON.parse(raw) as Partial<DashboardRetention>
    return {
      salesByDay: p.salesByDay && typeof p.salesByDay === 'object' ? { ...p.salesByDay } : {},
      purchaseByMonth:
        p.purchaseByMonth && typeof p.purchaseByMonth === 'object' ? { ...p.purchaseByMonth } : {},
    }
  } catch {
    return { salesByDay: {}, purchaseByMonth: {} }
  }
}

function saveDashboardRetention(r: DashboardRetention) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DASHBOARD_RETENTION_KEY, JSON.stringify(r))
  } catch {
    /* ignore */
  }
}

export function mergeDashboardRetention(deltaSales: Record<string, number>, deltaPurchase: Record<string, number>) {
  const cur = loadDashboardRetention()
  for (const [k, v] of Object.entries(deltaSales)) {
    if (!Number.isFinite(v) || v === 0) continue
    cur.salesByDay[k] = (cur.salesByDay[k] ?? 0) + v
  }
  for (const [k, v] of Object.entries(deltaPurchase)) {
    if (!Number.isFinite(v) || v === 0) continue
    cur.purchaseByMonth[k] = (cur.purchaseByMonth[k] ?? 0) + v
  }
  saveDashboardRetention(cur)
}

export interface DeletedProductTrace {
  id: string
  code: string
  name: string
  abbr: string
  cost_price: number
  cost_currency: string
  barcodes: string[]
}

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function orderTouchesDeletedProduct(o: Order | ShippedOrder, p: DeletedProductTrace): boolean {
  const bc = new Set(p.barcodes.map(String))
  const nName = normName(p.name)
  const nAbbr = normName(p.abbr)
  for (const it of o.items ?? []) {
    const sku = String(it.sku ?? '').trim()
    if (sku && bc.has(sku)) return true
    const pn = normName(String(it.product_name ?? ''))
    if (nName && pn && pn === nName) return true
    if (nAbbr && pn && pn === nAbbr) return true
  }
  return false
}

function isManagePurchaseConfirmForCost(po: Pick<Purchase, 'status' | 'ordered_at' | 'supplier'>): boolean {
  if (po.status === 'cancelled') return false
  if (!po.ordered_at || !String(po.ordered_at).trim()) return false
  if (po.supplier === '미입고확정') return false
  if (po.status === 'completed' && po.supplier === '직접입고') return false
  return true
}

/** 상품 삭제 직후 호출: 금액 보정치 누적 + 관련 로컬·발주 이력 제거 */
export async function archiveAmountsAndPurgeTracesForDeletedProduct(p: DeletedProductTrace): Promise<void> {
  if (typeof window === 'undefined') return

  const code = String(p.code ?? '').trim()
  const orders = loadOrders()
  const queue = loadInvoiceQueue()
  const shipped = loadShippedOrders()
  const shippedById = new Map(shipped.map(o => [o.id, o]))

  const touchIds = new Set<string>()
  const consider = (o: Order | ShippedOrder) => {
    if (orderTouchesDeletedProduct(o, p)) touchIds.add(o.id)
  }
  orders.forEach(consider)
  queue.forEach(consider)
  shipped.forEach(consider)

  const salesDelta: Record<string, number> = {}
  for (const id of touchIds) {
    const merged =
      orders.find(o => o.id === id) ??
      queue.find(o => o.id === id) ??
      shipped.find(o => o.id === id)
    if (!merged || merged.status === 'cancelled') continue
    const amt = dashboardAmountForMergedRow(merged, shippedById)
    const day = (merged.order_date ?? '').trim().slice(0, 10)
    if (!day) continue
    salesDelta[day] = (salesDelta[day] ?? 0) + amt
  }

  let exchangeRate = DEFAULT_EXCHANGE_RATE
  try {
    exchangeRate =
      Number(localStorage.getItem('pm_exchange_rate') || String(DEFAULT_EXCHANGE_RATE)) || DEFAULT_EXCHANGE_RATE
  } catch {
    /* ignore */
  }

  const purchaseDelta: Record<string, number> = {}

  if (code) {
    const purchases = await apiFetchPurchases()
    for (const row of purchases) {
      const hits = row.items?.filter(it => String(it.product_code ?? '').trim() === code) ?? []
      if (hits.length === 0) continue

      const ym = (row.order_date ?? '').slice(0, 7)
      let lineCost = 0
      if (
        ym &&
        isManagePurchaseConfirmForCost(row) &&
        p.cost_price != null &&
        Number.isFinite(Number(p.cost_price))
      ) {
        const unitKrw = unitToOrderKrw(Number(p.cost_price), p.cost_currency || 'KRW', exchangeRate)
        for (const it of hits) lineCost += unitKrw * (Number(it.ordered) || 0)
      }

      const remaining = (row.items ?? []).filter(it => String(it.product_code ?? '').trim() !== code)
      const del = remaining.length === 0
      const { error } = del ? await apiDeletePurchase(row.id) : await apiUpdatePurchase(row.id, { items: remaining })
      if (!error && lineCost) purchaseDelta[ym] = (purchaseDelta[ym] ?? 0) + lineCost
    }
  }

  mergeDashboardRetention(salesDelta, purchaseDelta)

  const ids = [...touchIds]
  if (ids.length > 0) {
    removeShippedOrdersByIds(ids)
    removeOrdersByIds(ids)
    removeInvoiceQueueByIds(ids)
  }

  broadcastDashboardRefresh()
}
