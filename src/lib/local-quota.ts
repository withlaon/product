/** 브라우저 localStorage(보통 5MB)가 원본 엑셀·이미지 캐시로 가득 차
 *  주문관리(pm_orders_v1) 저장이 실패하는 문제를 피하기 위한 보조 저장소.
 *  IndexedDB는 용량이 훨씬 커서 원본 행과 전체 주문 목록을 여기 둔다. */

const DB_NAME = 'pm_overflow_v1'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = run(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
  }))
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return withStore('readwrite', store => store.put(value, key)).then(() => undefined)
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return withStore<T | undefined>('readonly', store => store.get(key)).catch(() => undefined)
}

export interface DayRawPayload {
  raw_rows?: Record<string, unknown>[]
  toss_raw_aoa?: unknown[][]
  toss_sheet_name?: string
  toss_row1_value?: string
}

function trySet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** order_reg_v1_* 에 들어 있는 원본 엑셀(raw_rows, toss_raw_aoa)을 IndexedDB로 옮기고
 *  localStorage에는 주문 목록만 남긴다. skipKey 는 곧 새 원본으로 덮어쓸 키. */
export function evacuateOrderRegRawSync(skipKey?: string): void {
  if (typeof localStorage === 'undefined') return
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('order_reg_v1_') && k !== skipKey) keys.push(k)
    }
  } catch { return }

  for (const k of keys) {
    let raw = ''
    try { raw = localStorage.getItem(k) ?? '' } catch { continue }
    if (!raw.includes('"raw_rows"') && !raw.includes('"toss_raw_aoa"')) continue
    let data: DayRawPayload & Record<string, unknown>
    try { data = JSON.parse(raw) as DayRawPayload & Record<string, unknown> } catch { continue }
    if (!data.raw_rows && !data.toss_raw_aoa) continue
    const payload: DayRawPayload = {
      raw_rows: data.raw_rows,
      toss_raw_aoa: data.toss_raw_aoa,
      toss_sheet_name: data.toss_sheet_name,
      toss_row1_value: data.toss_row1_value,
    }
    void idbSet(k, payload)
    delete data.raw_rows
    delete data.toss_raw_aoa
    try {
      localStorage.removeItem(k)
      localStorage.setItem(k, JSON.stringify(data))
    } catch { /* 원본은 이미 IndexedDB로 보내는 중. 키 삭제로 공간은 확보됨 */ }
  }
}

/** 다시 받을 수 있는 캐시(상품 이미지)를 비워 주문 저장 공간을 만든다. */
export function dropRegenerableCaches(): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem('pm_product_images_v1') } catch { /* ignore */ }
  try {
    const key = 'pm_products_cache_v1'
    const raw = localStorage.getItem(key)
    if (!raw || !raw.includes('"image"')) return
    const parsed = JSON.parse(raw) as { data?: unknown[] } | unknown[]
    const list = Array.isArray(parsed) ? parsed : parsed?.data
    if (!Array.isArray(list)) return
    for (const p of list) {
      const prod = p as { options?: Array<Record<string, unknown>> }
      if (!Array.isArray(prod?.options)) continue
      prod.options = prod.options.map(o => {
        if (!o || typeof o !== 'object' || !('image' in o)) return o
        const { image: _image, ...rest } = o
        return rest
      })
    }
    localStorage.removeItem(key)
    localStorage.setItem(key, JSON.stringify(parsed))
  } catch { /* ignore */ }
}

/** 전체 목록이 들어가면 'full'. 최신 주문만 들어가면 'partial'. 한 건도 못 쓰면 'fail'. */
export function writeLocalOrders(key: string, list: unknown[]): 'full' | 'partial' | 'fail' {
  const json = JSON.stringify(list)
  if (trySet(key, json)) return 'full'
  evacuateOrderRegRawSync()
  dropRegenerableCaches()
  if (trySet(key, json)) return 'full'

  const sorted = [...list].sort((a, b) => {
    const ad = String((a as { order_date?: string })?.order_date ?? '')
    const bd = String((b as { order_date?: string })?.order_date ?? '')
    return bd.localeCompare(ad)
  })
  let best = 0
  let lo = 1
  let hi = sorted.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (trySet(key, JSON.stringify(sorted.slice(0, mid)))) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best > 0) {
    trySet(key, JSON.stringify(sorted.slice(0, best)))
    return 'partial'
  }
  return 'fail'
}
