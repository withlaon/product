/**
 * 주문 서비스 레이어
 * 어댑터를 통해 모든 쇼핑몰 주문을 통합 수집·관리합니다.
 */

import { createAdapter, getSupportedMalls } from '@/marketplaces'
import type { Credentials, UnifiedOrder, OrderQueryParams } from '@/adapters/marketplace.adapter'
import { NotImplementedError } from '@/marketplaces/base/base.marketplace'

export class OrderService {
  /**
   * 단일 쇼핑몰 주문 수집
   */
  static async collect(
    mallKey    : string,
    credentials: Credentials,
    params     : OrderQueryParams,
  ): Promise<{ success: boolean; mall: string; orders: UnifiedOrder[]; count: number; error?: string }> {
    try {
      const adapter = createAdapter(mallKey, credentials)
      const orders  = await adapter.getOrders(params)
      return { success: true, mall: mallKey, orders, count: orders.length }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, mall: mallKey, orders: [], count: 0, error: msg }
    }
  }

  /**
   * 여러 쇼핑몰 주문 동시 수집
   */
  static async collectMultiple(
    channels: Array<{ mallKey: string; credentials: Credentials }>,
    params  : OrderQueryParams,
  ) {
    const results = await Promise.allSettled(
      channels.map(({ mallKey, credentials }) =>
        OrderService.collect(mallKey, credentials, params)
      )
    )
    const allOrders: UnifiedOrder[] = []
    const summary: Array<{ mall: string; count: number; success: boolean; error?: string }> = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        allOrders.push(...r.value.orders)
        summary.push({ mall: channels[i].mallKey, count: r.value.count, success: r.value.success, error: r.value.error })
      } else {
        summary.push({ mall: channels[i].mallKey, count: 0, success: false, error: String(r.reason) })
      }
    })

    return { orders: allOrders, total: allOrders.length, summary }
  }

  /**
   * 중복 주문 제거 (mall + mall_order_no 기준)
   */
  static deduplicateOrders(orders: UnifiedOrder[]): UnifiedOrder[] {
    const seen = new Set<string>()
    return orders.filter(o => {
      const key = `${o.marketplace}:${o.mall_order_no}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  /**
   * 주문 상태 표준화 (각 쇼핑몰 상태코드 → 통합 상태)
   */
  static normalizeStatus(mallKey: string, rawStatus: string): string {
    const statusMaps: Record<string, Record<string, string>> = {
      smartstore: {
        'PAYMENT_WAITING'      : '결제대기',
        'PAYED'                : '결제완료',
        'DELIVERING'           : '배송중',
        'DELIVERED'            : '배송완료',
        'PURCHASE_DECIDED'     : '구매확정',
        'CANCELED'             : '취소',
        'RETURNED'             : '반품',
        'EXCHANGED'            : '교환',
      },
      coupang: {
        'ACCEPT'               : '결제완료',
        'INSTRUCT'             : '발송지시',
        'DEPARTURE'            : '배송중',
        'DELIVERING'           : '배송중',
        'FINAL_DELIVERY'       : '배송완료',
        'PURCHASE_DECISION'    : '구매확정',
        'CANCEL_REQUEST'       : '취소요청',
        'CANCELED'             : '취소',
        'RETURN_REQUEST'       : '반품요청',
        'RETURNED'             : '반품완료',
        'EXCHANGE_REQUEST'     : '교환요청',
      },
    }
    const map = statusMaps[mallKey] || {}
    return map[rawStatus] || rawStatus
  }
}
