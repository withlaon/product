/** 대시보드 및 동일 창 내 다른 화면이 즉시 수치를 맞추기 위한 브로드캐스트 */

export const DASHBOARD_REFRESH_EVENT = 'pm_dashboard_refresh'
const LS_TICK_KEY = 'pm_dashboard_refresh_ts'

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
