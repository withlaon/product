import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/cafe24/token
 * 카페24 OAuth authorization_code → access_token + refresh_token 교환
 *
 * Body: { code, mall_id, user_id? }
 * - code     : 카페24가 redirect_uri로 전달한 authorization_code
 * - mall_id  : 카페24 쇼핑몰 ID (예: withlaon) — state 파라미터 값
 * - user_id  : (옵션) Supabase user_id, 있으면 토큰을 DB에 자동 저장
 */
export async function POST(req: NextRequest) {
  try {
    const { code, mall_id, user_id } = await req.json()

    if (!code || !mall_id) {
      return NextResponse.json({ error: 'code, mall_id 파라미터가 필요합니다.' }, { status: 400 })
    }

    const clientId     = process.env.CAFE24_CLIENT_ID     ?? ''
    const clientSecret = process.env.CAFE24_CLIENT_SECRET ?? ''
    const redirectUri  = process.env.CAFE24_REDIRECT_URI  ?? `${req.headers.get('origin') ?? ''}/oauth`

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'CAFE24_CLIENT_ID / CAFE24_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    /* ── 카페24 토큰 교환 요청 ── */
    // Cafe24 공식 스펙: client_id/client_secret은 Authorization Basic 헤더에만 포함
    // body에 중복 포함 시 400 오류 발생
    const tokenRes = await fetch(`https://${mall_id}.cafe24api.com/api/v2/oauth/token`, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type  : 'authorization_code',
        code,
        redirect_uri : redirectUri,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return NextResponse.json(
        { error: `카페24 토큰 교환 실패 (${tokenRes.status})`, detail: errText },
        { status: 502 }
      )
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in, token_type, scopes } = tokenData

    /* ── Supabase에 저장 (user_id 있는 경우) ── */
    if (user_id) {
      const credentials = {
        seller_id    : mall_id,
        api_key      : clientId,
        api_secret   : '',   // client_secret은 서버에만 보관
        access_token,
        refresh_token: refresh_token ?? '',
        token_expires_at: expires_in
          ? new Date(Date.now() + expires_in * 1000).toISOString()
          : null,
        scopes: scopes ?? [],
      }
      await supabaseAdmin
        .from('pm_mall_credentials')
        .upsert({
          user_id,
          mall_key    : 'cafe24',
          credentials,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id,mall_key' })
    }

    return NextResponse.json({
      success      : true,
      mall         : 'cafe24',
      mall_id,
      access_token,
      refresh_token: refresh_token ?? null,
      expires_in   : expires_in    ?? null,
      token_type   : token_type    ?? 'Bearer',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
