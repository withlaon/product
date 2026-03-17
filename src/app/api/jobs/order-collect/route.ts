/**
 * /api/jobs/order-collect
 *
 * 주문 자동 수집 Job API
 * - 외부 스케줄러(cron, Vercel Cron, GitHub Actions 등)에서 5분마다 호출
 * - Authorization: Bearer {JOB_SECRET} 헤더 필요
 *
 * POST body:
 *   channels : [{ mallKey, credentials }]  // 수집할 채널 목록
 *   hours    : 수집할 시간 범위 (기본 1시간)
 */

import { NextRequest, NextResponse } from 'next/server'
import { OrderService } from '@/services/order.service'
import { format, subHours } from 'date-fns'
import type { Credentials } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

/** Job Secret 인증 */
function isAuthorized(req: NextRequest): boolean {
  const jobSecret = process.env.JOB_SECRET
  if (!jobSecret) return true  // 미설정 시 개발 환경으로 간주
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${jobSecret}`
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: '인증 실패' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { channels = [], hours = 1 } = body as {
      channels : Array<{ mallKey: string; credentials: Credentials }>
      hours    : number
    }

    if (channels.length === 0) {
      return NextResponse.json({ success: false, message: '수집할 채널이 없습니다.' })
    }

    const now       = new Date()
    const startDate = format(subHours(now, hours), "yyyy-MM-dd'T'HH:mm:ss")
    const endDate   = format(now, "yyyy-MM-dd'T'HH:mm:ss")

    const result = await OrderService.collectMultiple(channels, { start_date: startDate, end_date: endDate })
    const deduped = OrderService.deduplicateOrders(result.orders)

    return NextResponse.json({
      success       : true,
      collected_at  : now.toISOString(),
      period        : { start: startDate, end: endDate },
      total         : deduped.length,
      by_mall       : result.summary,
      orders        : deduped,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}

/** GET: Job 상태 확인 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: '인증 실패' }, { status: 401 })
  }
  return NextResponse.json({
    success  : true,
    job      : 'order-collect',
    status   : 'ready',
    timestamp: new Date().toISOString(),
  })
}
