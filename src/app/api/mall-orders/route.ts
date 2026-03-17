/**
 * /api/mall-orders
 *
 * 쇼핑몰 주문 수집·관리 API (어댑터 패턴 적용)
 *
 * POST body:
 *   action      : 'collect' | 'collect_all'
 *   mall        : 쇼핑몰 키 (collect 시)
 *   credentials : 인증 정보 (collect 시)
 *   params      : { start_date, end_date, status_filter, limit }
 *   channels    : collect_all 시 [{ mallKey, credentials }]
 */

import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import type { Credentials, OrderQueryParams } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, params = {}, channels } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      params      : OrderQueryParams
      channels    : Array<{ mallKey: string; credentials: Credentials }>
    }

    switch (action) {
      case 'collect': {
        const result = await OrderService.collect(mall, credentials, params)
        if (!result.success) {
          return NextResponse.json({ success: false, message: result.error, orders: [], count: 0 })
        }
        return NextResponse.json({ success: true, orders: result.orders, count: result.count })
      }

      case 'collect_all': {
        const result = await OrderService.collectMultiple(channels || [], params)
        const deduped = OrderService.deduplicateOrders(result.orders)
        return NextResponse.json({
          success : true,
          orders  : deduped,
          total   : deduped.length,
          summary : result.summary,
        })
      }

      default:
        return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg, orders: [] }, { status: 500 })
  }
}
