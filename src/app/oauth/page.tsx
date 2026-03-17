/**
 * /oauth - OAuth 2.0 콜백 페이지 (서버 컴포넌트)
 *
 * ★ 핵심: 서버에서 직접 토큰 교환 → React 하이드레이션/useEffect 대기 없음
 *   클라이언트 JS 실행 전에 코드 교환 완료 → 코드 만료 문제 근본 해결
 */
export const dynamic = 'force-dynamic'

import { OAuthResultClient } from './OAuthResultClient'

const MALL_NAMES: Record<string, string> = {
  cafe24 : '카페24',
  naver  : '네이버 스마트스토어',
  zigzag : '지그재그',
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function OAuthCallbackPage({ searchParams }: Props) {
  const params = await searchParams
  const code  = params.code
  const state = params.state
  const error = params.error

  /* ── 에러 파라미터 ── */
  if (error) {
    return <OAuthResultClient
      status="error"
      mall=""
      message={`인증이 거부되었습니다: ${params.error_description ?? error}`}
      refresh_token=""
    />
  }

  if (!code) {
    return <OAuthResultClient
      status="error"
      mall=""
      message="인증 코드(code)가 없습니다. 쇼핑몰 연동 화면에서 다시 시도해 주세요."
      refresh_token=""
    />
  }

  /* ── state 디코딩 ── */
  let mallKey       = ''
  let clientId      = ''
  let clientSecret  = ''
  let shopId        = ''

  if (state) {
    try {
      const decoded = JSON.parse(
        Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
      )
      mallKey      = decoded.mall          ?? ''
      clientId     = decoded.client_id     ?? ''
      clientSecret = decoded.client_secret ?? ''
      shopId       = decoded.shop_id       ?? ''
    } catch {
      shopId  = state
      mallKey = 'cafe24'
    }
  }
  if (!mallKey) mallKey = 'cafe24'

  /* ── 서버에서 직접 토큰 교환 (API 라우트 호출 없음) ── */
  const resolvedClientId     = clientId     || process.env.CAFE24_CLIENT_ID     || ''
  const resolvedClientSecret = clientSecret || process.env.CAFE24_CLIENT_SECRET || ''
  const redirectUri          = process.env.CAFE24_REDIRECT_URI || 'https://withlaon.vercel.app/oauth'
  const resolvedShopId       = shopId || 'withlaon'

  if (mallKey === 'cafe24') {
    if (!resolvedClientId || !resolvedClientSecret) {
      return <OAuthResultClient
        status="error"
        mall={mallKey}
        message="Client ID 또는 Client Secret이 없습니다. 채널 연동 설정에서 Client ID와 Client Secret을 먼저 입력해 주세요."
        refresh_token=""
      />
    }

    try {
      /* ── Cafe24 토큰 교환: 서버-서버 직접 호출 ── */
      const tokenRes = await fetch(
        `https://${resolvedShopId}.cafe24api.com/api/v2/oauth/token`,
        {
          method : 'POST',
          headers: {
            'Content-Type' : 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${resolvedClientId}:${resolvedClientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type  : 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }).toString(),
          cache: 'no-store',
        }
      )

      if (!tokenRes.ok) {
        let detail = ''
        try { detail = await tokenRes.text() } catch { /* ignore */ }

        let msg = `카페24 토큰 교환 실패 (${tokenRes.status})`
        if (tokenRes.status === 401) {
          msg = 'Client ID 또는 Client Secret이 올바르지 않습니다 (401). 카페24 개발자센터에서 앱 자격증명을 확인해 주세요.'
        } else if (tokenRes.status === 400) {
          msg = detail.includes('redirect_uri')
            ? `redirect_uri 불일치 — 등록된 redirect_uri: "${redirectUri}"`
            : '인증 코드가 만료되었거나 이미 사용되었습니다. OAuth 인증을 다시 시도해 주세요.'
        }

        console.error('[oauth/page] Cafe24 토큰 교환 실패', { status: tokenRes.status, detail, resolvedShopId, redirectUri })

        return <OAuthResultClient status="error" mall={mallKey} message={msg} refresh_token="" />
      }

      const tokenData = await tokenRes.json()
      const { access_token, refresh_token } = tokenData

      return <OAuthResultClient
        status="success"
        mall={mallKey}
        mallName={MALL_NAMES[mallKey] ?? mallKey}
        message={`${MALL_NAMES[mallKey] ?? mallKey} 연동이 완료되었습니다!`}
        refresh_token={refresh_token ?? ''}
        access_token={access_token ?? ''}
      />
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      return <OAuthResultClient status="error" mall={mallKey} message={msg} refresh_token="" />
    }
  }

  /* ── 기타 OAuth 쇼핑몰 (naver, zigzag 등) ── */
  return <OAuthResultClient
    status="error"
    mall={mallKey}
    message={`${mallKey} OAuth 처리는 준비 중입니다.`}
    refresh_token=""
  />
}
