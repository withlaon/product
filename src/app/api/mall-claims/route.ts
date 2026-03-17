/**
 * /api/mall-claims
 *
 * 쇼핑몰 클레임(반품·교환·취소·CS) 수집·처리 API (어댑터 패턴 적용)
 *
 * POST body:
 *   action      : 'collect' | 'collect_all' | 'approve_cancel' | 'approve_return'
 *                 | 'approve_exchange' | 'reject_claim'
 *   mall        : 쇼핑몰 키
 *   credentials : 인증 정보
 *   params      : 액션별 파라미터
 */

import { NextRequest, NextResponse } from 'next/server'
import { CsService } from '@/services/cs.service'
import type { Credentials, ClaimQueryParams } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, params = {}, channels } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      params      : Record<string, string>
      channels    : Array<{ mallKey: string; credentials: Credentials }>
    }

    switch (action) {
      case 'collect': {
        const result = await CsService.collectClaims(mall, credentials, params as ClaimQueryParams)
        if (!result.success) {
          return NextResponse.json({ success: false, message: result.error, claims: [], count: 0 })
        }
        return NextResponse.json({ success: true, claims: result.claims, count: result.count })
      }

      case 'collect_all': {
        const result = await CsService.collectMultiple(channels || [], params as ClaimQueryParams)
        return NextResponse.json({ success: true, claims: result.claims, total: result.total, summary: result.summary })
      }

      case 'approve_cancel': {
        const result = await CsService.approveCancel(mall, credentials, params.order_id, params.reason)
        return NextResponse.json(result)
      }

      case 'approve_return': {
        const result = await CsService.approveReturn(mall, credentials, params.claim_id)
        return NextResponse.json(result)
      }

      case 'approve_exchange': {
        const result = await CsService.approveExchange(mall, credentials, params.claim_id)
        return NextResponse.json(result)
      }

      case 'reject_claim': {
        const result = await CsService.rejectClaim(mall, credentials, params.claim_id, params.reason)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg, claims: [] }, { status: 500 })
  }
}
