/**
 * 쇼핑몰 표시명 표준화 (UI·출고·통계 공통)
 * 마이그레이션은 runMallDisplayNameMigration() 에서 1회 수행.
 */

export const MALL_DISPLAY_MIGRATION_KEY = 'pm_mall_display_migration_v5'

const EXACT_LEGACY: Record<string, string> = {
  'GS SHOP': '지에스샵',
  'GS샵': '지에스샵',
  '지마켓': 'G마켓',
  '롯데온': '롯데ON',
  'SSG.COM': 'SSG종합몰',
  'SSG닷컴': 'SSG종합몰',
  'SSG': 'SSG종합몰',
}

/** 레거시 표기 → 현재 UI 표준명 */
export function canonicalMallDisplayName(raw: string): string {
  const t = String(raw ?? '').trim()
  if (!t) return t
  if (/^ssg\.com$/i.test(t)) return 'SSG종합몰'
  return EXACT_LEGACY[t] ?? t
}

function normRegisteredMalls(
  rm: unknown,
): (string | { mall: string; code: string })[] | null {
  if (!Array.isArray(rm)) return null
  let changed = false
  const out: (string | { mall: string; code: string })[] = []
  for (const entry of rm) {
    if (typeof entry === 'string') {
      const n = canonicalMallDisplayName(entry)
      if (n !== entry) changed = true
      out.push(n)
      continue
    }
    if (entry && typeof entry === 'object' && 'mall' in entry) {
      const o = entry as { mall: string; code: string }
      const n = canonicalMallDisplayName(o.mall)
      if (n !== o.mall) changed = true
      out.push({ ...o, mall: n })
      continue
    }
    out.push(entry as string | { mall: string; code: string })
  }
  return changed ? out : null
}

function normChannelPrices(cp: unknown): unknown[] | null {
  if (!Array.isArray(cp)) return null
  let changed = false
  const out = cp.map((row: unknown) => {
    if (!row || typeof row !== 'object' || !('channel' in row)) return row
    const r = row as { channel: string; price?: number; tag_price?: number }
    const n = canonicalMallDisplayName(r.channel)
    if (n !== r.channel) changed = true
    return { ...r, channel: n }
  })
  return changed ? out : null
}

function normMallCategories(mc: unknown): unknown[] | null {
  if (!Array.isArray(mc)) return null
  let changed = false
  const out = mc.map((row: unknown) => {
    if (!row || typeof row !== 'object' || !('channel' in row)) return row
    const r = row as { channel: string }
    const n = canonicalMallDisplayName(r.channel)
    if (n !== r.channel) changed = true
    return { ...r, channel: n }
  })
  return changed ? out : null
}

/** localStorage·Supabase 상품·출고 채널명 1회 정규화 */
export async function runMallDisplayNameMigration(): Promise<void> {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(MALL_DISPLAY_MIGRATION_KEY) === '1') return

  const {
    loadOrders,
    upsertOrders,
    loadInvoiceQueue,
    upsertInvoiceQueue,
    loadShippedOrders,
    upsertShippedOrders,
  } = await import('./orders')

  let any = false

  try {
    const raw = localStorage.getItem('pm_mall_channels_v5')
    if (raw) {
      const arr = JSON.parse(raw) as { name?: string; key?: string; active?: boolean }[]
      if (Array.isArray(arr)) {
        let ch = false
        const next = arr.map(c => {
          const prev = String(c.name ?? '').trim()
          const n = canonicalMallDisplayName(prev)
          if (n !== prev) {
            ch = true
            return { ...c, name: n }
          }
          return c
        })
        if (ch) {
          localStorage.setItem('pm_mall_channels_v5', JSON.stringify(next))
          any = true
        }
      }
    }
  } catch { /* ignore */ }

  const migrateOrders = (list: import('./orders').Order[]) => {
    let ch = false
    const next = list.map(o => {
      const n = canonicalMallDisplayName(o.channel)
      if (n !== o.channel) {
        ch = true
        return { ...o, channel: n }
      }
      return o
    })
    return { next, ch }
  }

  try {
    const { next, ch } = migrateOrders(loadOrders())
    if (ch) {
      upsertOrders(next)
      any = true
    }
  } catch { /* ignore */ }

  try {
    const { next, ch } = migrateOrders(loadInvoiceQueue() as import('./orders').Order[])
    if (ch) {
      upsertInvoiceQueue(next)
      any = true
    }
  } catch { /* ignore */ }

  try {
    const shipped = loadShippedOrders()
    let ch = false
    const next = shipped.map(o => {
      const n = canonicalMallDisplayName(o.channel)
      if (n !== o.channel) {
        ch = true
        return { ...o, channel: n }
      }
      return o
    })
    if (ch) {
      upsertShippedOrders(next)
      any = true
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem('pm_cs_v1')
    if (raw) {
      const arr = JSON.parse(raw) as { mall?: string }[]
      if (Array.isArray(arr)) {
        let ch = false
        const next = arr.map(it => {
          if (!it.mall) return it
          const n = canonicalMallDisplayName(it.mall)
          if (n !== it.mall) {
            ch = true
            return { ...it, mall: n }
          }
          return it
        })
        if (ch) {
          localStorage.setItem('pm_cs_v1', JSON.stringify(next))
          any = true
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const CACHE_KEY = 'pm_products_cache_v1'
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { ts?: number; data?: Record<string, unknown>[] } | Record<string, unknown>[]
      const isArr = Array.isArray(parsed)
      const data = isArr ? parsed : parsed?.data
      if (Array.isArray(data)) {
        let ch = false
        const newData = data.map((p: Record<string, unknown>) => {
          const nRm = normRegisteredMalls(p.registered_malls)
          const nCp = normChannelPrices(p.channel_prices)
          const nMc = normMallCategories(p.mall_categories)
          if (!nRm && !nCp && !nMc) return p
          ch = true
          return {
            ...p,
            ...(nRm ? { registered_malls: nRm } : {}),
            ...(nCp ? { channel_prices: nCp } : {}),
            ...(nMc ? { mall_categories: nMc } : {}),
          }
        })
        if (ch) {
          if (isArr) localStorage.setItem(CACHE_KEY, JSON.stringify(newData))
          else localStorage.setItem(CACHE_KEY, JSON.stringify({ ...parsed, data: newData, ts: Date.now() }))
          any = true
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch('/api/pm-products')
    if (res.ok) {
      const products = (await res.json()) as Record<string, unknown>[]
      if (Array.isArray(products)) {
        for (const p of products) {
          const id = p.id
          if (typeof id !== 'string') continue
          const nRm = normRegisteredMalls(p.registered_malls)
          const nCp = normChannelPrices(p.channel_prices)
          const nMc = normMallCategories(p.mall_categories)
          if (!nRm && !nCp && !nMc) continue
          const body: Record<string, unknown> = { id }
          if (nRm) body.registered_malls = nRm
          if (nCp) body.channel_prices = nCp
          if (nMc) body.mall_categories = nMc
          await fetch('/api/pm-products', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          any = true
        }
      }
    }
  } catch { /* ignore */ }

  localStorage.setItem(MALL_DISPLAY_MIGRATION_KEY, '1')
  if (any) {
    try {
      const { broadcastDashboardRefresh } = await import('./dashboard-sync')
      broadcastDashboardRefresh()
    } catch { /* ignore */ }
    try {
      localStorage.setItem('pm_products_mapping_signal', String(Date.now()))
    } catch { /* ignore */ }
  }
}
