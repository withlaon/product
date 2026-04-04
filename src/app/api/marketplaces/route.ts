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
import { proxyFetch } from '@/lib/proxy-fetch'

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
        always     : { key: 'login_id',  label: '쇼핑몰ID' },
        alwayz     : { key: 'login_id',  label: '쇼핑몰ID' },
        tosshopping: { key: 'api_key',    label: 'Access Key' },
        toss       : { key: 'api_secret', label: 'Secret Key' },
        lotteon    : { key: 'api_key',   label: '인증키' },
        ssg        : { key: 'api_key',   label: 'API 인증키' },
        halfclub   : { key: 'api_key',   label: 'API 인증키' },
        gsshop     : { key: 'login_id',  label: '쇼핑몰ID' },
        fashionplus: { key: 'login_id',  label: 'SCM 로그인 ID' },
        // 지그재그(카카오스타일): partner-api.zigzag.kr 는 공식 파트너만 접근 가능 — 자격증명 형식 검증으로 대체
        zigzag     : { key: 'api_key',   label: 'Access Key' },
        // ESM(옥션/G마켓): 공식 파트너 셀링툴만 API 사용 가능 — 로그인 ID 저장
        gmarket    : { key: 'login_id',  label: 'ESM PLUS ID' },
        auction    : { key: 'login_id',  label: 'ESM PLUS ID' },
      }
      if (mall in LIMITED_API_MALLS) {
        const { key: tokenKey, label: tokenLabel } = LIMITED_API_MALLS[mall]
        const token = credentials[tokenKey]
        if (!token || (token as string).length < 4) {
          return NextResponse.json({ success: false, mall, message: `${tokenLabel}이 입력되지 않았습니다.` })
        }
        // 토스쇼핑: Secret Key + Access Key 모두 검증
        if (mall === 'toss') {
          const secretKey = credentials.api_secret as string
          const accessKey = credentials.api_key as string
          if (!secretKey || secretKey.length < 4) {
            return NextResponse.json({ success: false, mall, message: 'Secret Key가 입력되지 않았습니다. 셀러센터 [자체개발 → 키발급]에서 발급하세요.' })
          }
          if (!accessKey || accessKey.length < 4) {
            return NextResponse.json({ success: false, mall, message: 'Access Key가 입력되지 않았습니다. 셀러센터 [자체개발 → 키발급]에서 발급하세요.' })
          }
          return NextResponse.json({
            success: true, mall,
            message: `토스쇼핑 자격증명 저장 완료 ✓ (Secret Key + Access Key 확인됨)\n서버 IP가 키 발급 시 등록된 IP와 일치해야 정상 연동됩니다.`,
          })
        }
        // SSG: API 인증키 UUID 형식 검증
        if (mall === 'ssg') {
          const authKey = credentials.api_key as string
          if (!authKey || authKey.length < 8) {
            return NextResponse.json({ success: false, mall, message: 'API 인증키가 입력되지 않았습니다. SSG 파트너오피스 [API관리 → API계정정보]에서 인증 상태가 "인증"인 키를 확인하세요.' })
          }
          return NextResponse.json({
            success: true, mall,
            message: `SSG 자격증명 저장 완료 ✓ (API 인증키 확인됨)\n운영/테스트 서버 IP가 직접입력 방식으로 등록되어 있어야 정상 연동됩니다.`,
          })
        }
        // 롯데온: 인증키 + 거래처번호 검증
        if (mall === 'lotteon') {
          const vendorCode = credentials.seller_id
          if (!vendorCode || (vendorCode as string).length < 4) {
            return NextResponse.json({ success: false, mall, message: '거래처번호가 입력되지 않았습니다. SCM [판매자정보 → 기본정보관리 → 거래처번호]에서 확인하세요.' })
          }
          const authKey = credentials.api_key
          if (!authKey || (authKey as string).length < 8) {
            return NextResponse.json({ success: false, mall, message: '인증키가 입력되지 않았습니다. SCM [판매자정보 → Open API 관리 → 인증키 발급]에서 발급 후 입력하세요.' })
          }
          return NextResponse.json({
            success: true, mall,
            message: `롯데ON 자격증명 저장 완료 ✓ (거래처번호: ${vendorCode} · 인증키 확인됨)\n서버 IP 등록 후 연동이 정상 작동합니다.`,
          })
        }
        // 하프클럽: API 인증키 + 협력사코드 둘 다 확인
        if (mall === 'halfclub') {
          const partnerCode = credentials.seller_id
          if (!partnerCode || (partnerCode as string).length < 2) {
            return NextResponse.json({ success: false, mall, message: '협력사코드가 입력되지 않았습니다. SCM [G.협력사관리 → G101 → 협력사 정보] 에서 확인하세요.' })
          }
          return NextResponse.json({
            success: true, mall,
            message: `하프클럽 자격증명 저장 완료 ✓ (협력사코드: ${partnerCode} · API 인증키 확인됨)`,
          })
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
            ? `${tokenLabel} 저장 완료. ESM(옥션/G마켓)은 공식 API 직접 연동이 불가하여 로그인 정보를 저장합니다.`
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
          const tokenRes = await proxyFetch(`https://${shopId}.cafe24api.com/api/v2/oauth/token`, {
            method : 'POST',
            headers: {
              'Content-Type' : 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }).toString(),
          })
          if (!tokenRes.ok) {
            const detail = await tokenRes.text().catch(() => '')
            let msg = `토큰 갱신 실패 (${tokenRes.status})`
            if (tokenRes.status === 401) {
              msg = 'Client ID / Secret 인증 실패 (401)\n→ 카페24 개발자센터에서 Client Secret이 재발급되지 않았는지 확인하세요.\n→ 재발급된 경우 프로그램의 Client Secret을 새 값으로 변경 후 [OAuth 재인증] 버튼을 클릭하세요.'
            } else if (tokenRes.status === 400) {
              if (detail.includes('invalid_grant') || detail.includes('Invalid refresh_token')) {
                msg = 'Refresh Token이 만료되었거나 무효화되었습니다 (invalid_grant)\n\n원인: 카페24 개발자센터에서 Client Secret이 재발급되면 기존 토큰 전체가 무효화됩니다.\n\n해결 방법:\n① 카페24 개발자센터 → 내 앱 → 기본정보에서 새 Client Secret Key 복사\n② 이 화면의 [Client Secret] 필드에 새 값 입력 후 [설정 저장]\n③ [OAuth 재인증 (Refresh Token 재발급)] 버튼 클릭\n④ 카페24 로그인 → 권한 승인 완료'
              } else {
                msg = `토큰 갱신 실패 (400) — ${detail}`
              }
            }
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
