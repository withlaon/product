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

      /* ── API 직접 연동 불가 / 공개 API 없는 쇼핑몰: 자격증명 형식만 검증 ── */
      const LIMITED_API_MALLS: Record<string, { key: string; label: string }> = {
        ablly      : { key: 'api_key',   label: 'API Token' },
        ably       : { key: 'api_key',   label: 'API Token' },
        always     : { key: 'api_key',   label: 'API Key' },
        alwayz     : { key: 'api_key',   label: 'API Key' },
        tosshopping: { key: 'api_key',   label: 'API Key' },
        lotteon    : { key: 'api_key',   label: 'API Key' },
        ssg        : { key: 'api_key',   label: 'API Key' },
        halfclub   : { key: 'api_key',   label: 'API Key' },
        gsshop     : { key: 'api_key',   label: 'API Key' },
        fashionplus: { key: 'login_id',  label: 'SCM 로그인 ID' },
        // 지그재그(카카오스타일): partner-api.zigzag.kr 는 공식 파트너만 접근 가능 — 자격증명 형식 검증으로 대체
        zigzag     : { key: 'api_key',   label: 'Access Key' },
        // ESM(옥션/지마켓): 공식 파트너 셀링툴만 API 사용 가능 — 로그인 ID 저장
        gmarket    : { key: 'login_id',  label: 'ESM PLUS ID' },
        auction    : { key: 'login_id',  label: 'ESM PLUS ID' },
      }
      if (mall in LIMITED_API_MALLS) {
        const { key: tokenKey, label: tokenLabel } = LIMITED_API_MALLS[mall]
        const token = credentials[tokenKey]
        if (!token || (token as string).length < 4) {
          return NextResponse.json({ success: false, mall, message: `${tokenLabel}이 입력되지 않았습니다.` })
        }
        // 지그재그: Access Key + Secret Key 둘 다 있는지 추가 검증
        if (mall === 'zigzag') {
          const secretKey = credentials.api_secret
          if (!secretKey || (secretKey as string).length < 8) {
            return NextResponse.json({ success: false, mall, message: 'Secret Key가 입력되지 않았습니다. 카카오스타일 파트너센터 [API 인증키 관리]에서 확인하세요.' })
          }
          return NextResponse.json({
            success: true, mall,
            message: `지그재그 자격증명 저장 완료 ✓ (Access Key + Secret Key 확인됨)\n실제 API 연동은 카카오스타일 공식 파트너 심사 후 활성화됩니다.`,
          })
        }
        const isEsm = mall === 'gmarket' || mall === 'auction'
        return NextResponse.json({
          success: true, mall,
          message: isEsm
            ? `${tokenLabel} 저장 완료. ESM(옥션/지마켓)은 공식 API 직접 연동이 불가하여 로그인 정보를 저장합니다.`
            : `${tokenLabel}이 저장되었습니다. (해당 쇼핑몰 API는 공개 문서가 제한적이어서 실시간 검증은 생략됩니다)`,
        })
      }

      /* ── 카페24: refresh_token → access_token 갱신 후 테스트 ── */
      if (mall === 'cafe24') {
        const { refresh_token, api_key: clientId, api_secret: clientSecret, seller_id: shopId } = credentials
        if (!refresh_token) {
          return NextResponse.json({ success: false, mall, message: 'Refresh Token이 없습니다. OAuth 인증을 먼저 완료해 주세요.' })
        }
        if (!clientId || !clientSecret || !shopId) {
          return NextResponse.json({ success: false, mall, message: 'Client ID / Client Secret / 쇼핑몰 ID를 모두 입력해 주세요.' })
        }
        try {
          const tokenRes = await fetch(`https://${shopId}.cafe24api.com/api/v2/oauth/token`, {
            method : 'POST',
            headers: {
              'Content-Type' : 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }).toString(),
          })
          if (!tokenRes.ok) {
            const detail = await tokenRes.text().catch(() => '')
            const msg = tokenRes.status === 401
              ? 'Client ID / Secret 인증 실패 (401) — 카페24 개발자센터에서 자격증명을 확인하세요.'
              : `토큰 갱신 실패 (${tokenRes.status}) — ${detail}`
            return NextResponse.json({ success: false, mall, message: msg })
          }
          const { access_token } = await tokenRes.json()
          // access_token으로 주문 조회 테스트
          const adapter = createAdapter('cafe24', { ...credentials, mall_id: shopId, access_token })
          await adapter.getOrders({
            start_date: format(subDays(now, 7), 'yyyy-MM-dd'),
            end_date  : format(now, 'yyyy-MM-dd'),
            limit     : 1,
          })
          return NextResponse.json({ success: true, mall, message: '카페24 API 연결 성공 ✓ (Refresh Token 정상)' })
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e)
          return NextResponse.json({ success: false, mall, message: `카페24 연결 실패: ${raw}` })
        }
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
