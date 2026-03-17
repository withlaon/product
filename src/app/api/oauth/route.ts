import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ─── 쇼핑몰별 토큰 교환 설정 ─────────────────────────── */
interface OAuthConfig {
  tokenUrl    : string
  grantType   : string
  extraParams?: Record<string, string>
}

function getMallConfig(mall: string, clientId: string, clientSecret: string, redirectUri: string, shopId?: string): OAuthConfig | null {
  switch (mall) {
    case 'cafe24': {
      // 카페24: tokenUrl 서브도메인은 shopId(mall_id), client_id는 앱 ID
      const mallId = shopId || clientId
      return {
        tokenUrl  : `https://${mallId}.cafe24api.com/api/v2/oauth/token`,
        grantType : 'authorization_code',
        extraParams: { client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri },
      }
    }
    case 'naver':
      return {
        tokenUrl  : 'https://api.commerce.naver.com/external/v1/oauth2/token',
        grantType : 'authorization_code',
        extraParams: { client_id: clientId, client_secret: clientSecret },
      }
    case 'zigzag':
      return {
        tokenUrl  : 'https://api.zigzag.kr/api/v1/oauth/token',
        grantType : 'authorization_code',
        extraParams: { client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri },
      }
    default:
      return null
  }
}

/* ─── GET: 인증 URL 생성 ──────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mall        = searchParams.get('mall') ?? ''
  const clientId    = searchParams.get('client_id') ?? ''
  const shopId      = searchParams.get('shop_id') ?? ''   // Cafe24 쇼핑몰 ID
  const redirectUri = searchParams.get('redirect_uri') ?? `${req.nextUrl.origin}/oauth`

  if (!mall || !clientId) {
    return NextResponse.json({ error: 'mall, client_id 파라미터가 필요합니다.' }, { status: 400 })
  }

  const state = Buffer.from(JSON.stringify({ mall, client_id: clientId, shop_id: shopId })).toString('base64url')

  let authUrl = ''
  switch (mall) {
    case 'cafe24':
      authUrl = `https://${shopId}.cafe24api.com/api/v2/oauth/authorize`
        + `?response_type=code&client_id=${clientId}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&scope=mall.read_product,mall.write_product,mall.read_order,mall.write_order`
        + `&state=${state}`
      break
    case 'naver':
      authUrl = `https://api.commerce.naver.com/external/v1/oauth2/authorize`
        + `?response_type=code&client_id=${clientId}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&state=${state}`
      break
    case 'zigzag':
      authUrl = `https://api.zigzag.kr/api/v1/oauth/authorize`
        + `?response_type=code&client_id=${clientId}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&state=${state}`
      break
    default:
      return NextResponse.json({ error: `지원하지 않는 쇼핑몰: ${mall}` }, { status: 400 })
  }

  return NextResponse.json({ auth_url: authUrl, state })
}

/* ─── POST: 코드 → 토큰 교환 + DB 저장 ───────────────── */
export async function POST(req: NextRequest) {
  try {
    const body         = await req.json()
    const { code, state, mall: directMall, client_id, client_secret, shop_id, user_id } = body

    // state 디코딩 (GET 방식 리다이렉트 경유 시)
    let mall       = directMall ?? ''
    let clientId   = client_id ?? ''
    let shopId     = shop_id ?? ''

    if (state && !directMall) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
        mall     = decoded.mall     ?? mall
        clientId = decoded.client_id ?? clientId
        shopId   = decoded.shop_id   ?? shopId
      } catch { /* state 파싱 실패 무시 */ }
    }

    if (!code || !mall) {
      return NextResponse.json({ error: 'code, mall 파라미터가 필요합니다.' }, { status: 400 })
    }

    // 카페24는 환경변수로 fallback (client_id, client_secret 미전달 시)
    const resolvedClientId = clientId
      || (mall === 'cafe24' ? (process.env.CAFE24_CLIENT_ID ?? '') : '')
    const resolvedSecret   = client_secret
      || (mall === 'cafe24' ? (process.env.CAFE24_CLIENT_SECRET ?? '') : '')

    const redirectUri = `${req.headers.get('origin') ?? ''}/oauth`
    const config      = getMallConfig(mall, resolvedClientId, resolvedSecret, redirectUri, shopId)

    if (!config) {
      return NextResponse.json({ error: `OAuth 미지원 쇼핑몰: ${mall}` }, { status: 400 })
    }

    /* ── 토큰 교환 요청 ── */
    const params = new URLSearchParams({
      grant_type  : config.grantType,
      code,
      ...(config.extraParams ?? {}),
    })

    const tokenRes = await fetch(config.tokenUrl, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${resolvedClientId}:${resolvedSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return NextResponse.json({ error: `토큰 교환 실패: ${tokenRes.status}`, detail: errText }, { status: 502 })
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in, token_type } = tokenData

    /* ── Supabase에 토큰 저장 (pm_mall_credentials 테이블) ── */
    if (user_id) {
      const credentials = {
        seller_id    : shopId || resolvedClientId,
        api_key      : resolvedClientId,
        api_secret   : resolvedSecret,
        access_token,
        refresh_token: refresh_token ?? '',
        token_expires_at: expires_in
          ? new Date(Date.now() + expires_in * 1000).toISOString()
          : null,
      }
      await supabaseAdmin
        .from('pm_mall_credentials')
        .upsert({
          user_id,
          mall_key    : mall,
          credentials,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id,mall_key' })
    }

    return NextResponse.json({
      success      : true,
      mall,
      access_token,
      refresh_token: refresh_token ?? null,
      expires_in   : expires_in   ?? null,
      token_type   : token_type   ?? 'Bearer',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
