type CsLike = {
  type?: string
  status?: string
  barcode?: string
  barcode_in?: string
  barcode_out?: string
  exchange_in_processed_at?: string
  exchange_out_processed_at?: string
}

/** CS관리 탭 좌측 '미처리' 목록과 동일한 기준 (대시보드 등에서 재사용) */
export function isCsItemPending(c: CsLike): boolean {
  if (c.type === 'return') return c.status === 'pending'
  const bin = (c.barcode_in ?? c.barcode ?? '').trim()
  const bout = (c.barcode_out ?? '').trim()
  if (bin && !c.exchange_in_processed_at) return true
  if (bout && !c.exchange_out_processed_at) return true
  if (!bin && !bout && !c.exchange_in_processed_at) return true
  return false
}

/** 미처리 CS **행** 수 — 교환 입고·출고 펼침 건수까지 CS관리 헤더 카운트와 동일 */
export function countPendingCsRows(items: CsLike[]): number {
  let n = 0
  for (const item of items) {
    if (!isCsItemPending(item)) continue
    if (item.type !== 'exchange') {
      n += 1
      continue
    }
    const bin = (item.barcode_in ?? item.barcode ?? '').trim()
    const bout = (item.barcode_out ?? '').trim()
    if (bin && !item.exchange_in_processed_at) n += 1
    if (bout && !item.exchange_out_processed_at) n += 1
    if (!bin && !bout) n += 1
  }
  return n
}
