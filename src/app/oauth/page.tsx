/**
 * /oauth - OAuth 2.0 콜백 페이지
 *
 * ★ Edge Runtime: Cold Start 없음 → 수십ms 이내에 코드 교환 완료
 *   Cafe24 인증 코드 만료(30초) 문제 완전 해결
 */
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import { OAuthResultClient } from './OAuthResultClient'

const MALL_NAMES: Record<string, string> = {
  cafe24: '카페24',
  naver : '네이버 스마트스토어',
  zigzag: '지그재그',
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

/** URL-safe base64 → UTF-8 문자열 (Edge 환경, Buffer 없음) */
function decodeBase64Url(str: string): string {
  const std = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad  = std + '=='.slice(0, (4 - (std.length % 4)) % 4)
  const raw  = atob(pad)
  // UTF-8 바이트 배열로 디코딩
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** ASCII 문자열 → base64 (Edge 환경) */
function toBase64(str: string): string {
  return btoa(str)
}

export default async function OAuthCallbackPage({ searchParams }: Props) {
  const params = await searchParams
  const code   = params.code
  const state  = params.state
  const error  = params.error

  /* ── 에러 파라미터 ── */
  if (error) {
    return <OAuthResultClient
      status="error" mall=""
      message={`인증이 거부되었습니다: ${params.error_description ?? error}`}
      refresh_token=""
    />
  }

  if (!code) {
    return <OAuthResultClient
      status="error" mall=""
      message="인증 코드(code)가 없습니다. 쇼핑몰 연동 화면에서 다시 시도해 주세요."
      refresh_token=""
    />
  }

  /* ── state 디코딩 ── */
  let mallKey      = ''
  let clientId     = ''
  let clientSecret = ''
  let shopId       = ''

  if (state) {
    try {
      const decoded = JSON.parse(decodeBase64Url(state))
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

  /* ── Cafe24 토큰 교환 ── */
  if (mallKey === 'cafe24') {
    const resolvedClientId     = clientId     || (process.env.CAFE24_CLIENT_ID     ?? '')
    const resolvedClientSecret = clientSecret || (process.env.CAFE24_CLIENT_SECRET ?? '')
    const redirectUri          = process.env.CAFE24_REDIRECT_URI ?? 'https://withlaon.vercel.app/oauth'
    const resolvedShopId       = shopId || 'withlaon'

    if (!resolvedClientId || !resolvedClientSecret) {
      return <OAuthResultClient
        status="error" mall={mallKey}
        message="Client ID 또는 Client Secret이 없습니다. 채널 연동 설정에서 먼저 입력해 주세요."
        refresh_token=""
      />
    }

    try {
      const tokenRes = await fetch(
        `https://${resolvedShopId}.cafe24api.com/api/v2/oauth/token`,
        {
          method : 'POST',
          headers: {
            'Content-Type' : 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${toBase64(`${resolvedClientId}:${resolvedClientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type  : 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }).toString(),
        }
      )

      if (!tokenRes.ok) {
        let detail = ''
        try { detail = await tokenRes.text() } catch { /* ignore */ }

        let msg = `카페24 토큰 교환 실패 (${tokenRes.status})`
        if (tokenRes.status === 401) {
          msg = 'Client ID 또는 Client Secret이 올바르지 않습니다 (401). 카페24 개발자센터에서 자격증명을 확인해 주세요.'
        } else if (tokenRes.status === 400) {
          msg = detail.includes('redirect_uri')
            ? `redirect_uri 불일치 — 카페24 개발자센터에 등록된 Redirect URI: "${redirectUri}" 와 일치하는지 확인하세요.`
            : '인증 코드가 만료되었거나 이미 사용되었습니다. OAuth 인증 버튼을 다시 클릭해 주세요.'
        }

        return <OAuthResultClient status="error" mall={mallKey} message={msg} refresh_token="" />
      }

      const tokenData                       = await tokenRes.json()
      const { access_token, refresh_token } = tokenData

      return <OAuthResultClient
        status="success"
        mall={mallKey}
        mallName={MALL_NAMES[mallKey] ?? mallKey}
        message={`${MALL_NAMES[mallKey] ?? mallKey} 연동이 완료되었습니다!`}
        refresh_token={refresh_token ?? ''}
        access_token={access_token  ?? ''}
      />
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      return <OAuthResultClient status="error" mall={mallKey} message={msg} refresh_token="" />
    }
  }

  return <OAuthResultClient
    status="error" mall={mallKey}
    message={`${MALL_NAMES[mallKey] ?? mallKey} OAuth 처리는 준비 중입니다.`}
    refresh_token=""
  />
}
