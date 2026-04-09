/** 대시보드 및 동일 창 내 다른 화면이 즉시 수치를 맞추기 위한 브로드캐스트 */

export const DASHBOARD_REFRESH_EVENT = 'pm_dashboard_refresh'
const LS_TICK_KEY = 'pm_dashboard_refresh_ts'

/** 상품관리·발주 등에서 pm_products 캐시/목록을 다시 맞출 때 (출고 재고 반영 등) */
export const PM_PRODUCTS_CACHE_SYNC_KEY = 'pm_products_cache_sync'

export function broadcastPmProductsCacheSync(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PM_PRODUCTS_CACHE_SYNC_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(PM_PRODUCTS_CACHE_SYNC_KEY))
  } catch {
    /* ignore */
  }
}

export function broadcastDashboardRefresh(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_TICK_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT))
  } catch {
    /* ignore */
  }
}
