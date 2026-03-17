/**
 * /api/marketplaces
 *
 * 지원 쇼핑몰 목록 및 연결 테스트 API
 *
 * GET  : 지원 쇼핑몰 목록 반환
 * POST : 쇼핑몰 연결 테스트 (주문 1건 조회로 검증)
 */

import { NextRequest, NextResponse } from 'next/server'
import { MARKETPLACE_LIST, createAdapter } from '@/marketplaces'
import type { Credentials } from '@/adapters/marketplace.adapter'
import { format, subDays } from 'date-fns'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    success     : true,
    marketplaces: MARKETPLACE_LIST,
    count       : MARKETPLACE_LIST.length,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {} } = body as {
      action      : string
      mall        : string
      credentials : Credentials
    }

    if (action === 'test_connection') {
      const now = new Date()

      /* ── API 문서가 제한적인 쇼핑몰: 토큰 형식만 검증 ── */
      const LIMITED_API_MALLS: Record<string, string> = {
        ablly      : 'api_key',
        ably       : 'api_key',
        always     : 'api_key',
        alwayz     : 'api_key',
        tosshopping: 'api_key',
        lotteon    : 'api_key',
        ssg        : 'api_key',
        halfclub   : 'api_key',
        gsshop     : 'api_key',
        fashionplus: 'login_id',  // SCM 방식, 공개 REST API 없음
      }
      if (mall in LIMITED_API_MALLS) {
        const tokenKey = LIMITED_API_MALLS[mall]
        const token    = credentials[tokenKey]
        if (!token || token.length < 8) {
          return NextResponse.json({ success: false, mall, message: 'API Token이 입력되지 않았거나 너무 짧습니다.' })
        }
        return NextResponse.json({
          success: true, mall,
          message: 'API Token이 저장되었습니다. (해당 쇼핑몰 API는 공개 문서가 제한적이어서 실시간 검증은 생략됩니다)',
        })
      }

      let adapter
      try {
        adapter = createAdapter(mall, credentials)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ success: false, mall, message: msg })
      }

      try {
        await adapter.getOrders({
          start_date: format(subDays(now, 7), 'yyyy-MM-dd'),
          end_date  : format(now, 'yyyy-MM-dd'),
          limit     : 1,
        })
        return NextResponse.json({ success: true, mall, message: 'API 연결 성공 ✓' })
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)

        // 인증 오류(401/403) → 실패
        if (raw.includes('401') || raw.includes('403')) {
          return NextResponse.json({
            success: false, mall,
            message: `인증 실패 (${raw.includes('401') ? '401' : '403'}) — API 키 / 비밀번호를 확인해주세요.`,
          })
        }
        // 404 → 엔드포인트 오류
        if (raw.includes('404')) {
          return NextResponse.json({
            success: false, mall,
            message: 'API 엔드포인트 오류 (404) — 셀러 코드나 API URL을 확인해주세요.',
          })
        }
        // 연결 timeout 등 네트워크 오류
        if (raw.toLowerCase().includes('timeout') || raw.toLowerCase().includes('fetch')) {
          return NextResponse.json({
            success: false, mall,
            message: 'API 서버 응답 없음 — 네트워크 상태나 API 서버 점검 여부를 확인해주세요.',
          })
        }
        return NextResponse.json({ success: false, mall, message: `연결 실패: ${raw}` })
      }
    }

    return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
