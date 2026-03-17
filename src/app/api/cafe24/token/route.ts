import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { proxyFetch } from '@/lib/proxy-fetch'

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
    const body = await req.json()
    const { code, mall_id, user_id, client_id: bodyClientId, client_secret: bodyClientSecret } = body

    if (!code || !mall_id) {
      return NextResponse.json({ error: 'code, mall_id 파라미터가 필요합니다.' }, { status: 400 })
    }

    // 우선순위: 요청 body → 환경변수 → DB 저장값
    let clientId     = bodyClientId     || process.env.CAFE24_CLIENT_ID     || ''
    let clientSecret = bodyClientSecret || process.env.CAFE24_CLIENT_SECRET || ''
    const redirectUri = process.env.CAFE24_REDIRECT_URI
      || `${req.headers.get('origin') || 'https://withlaon.vercel.app'}/oauth`

    // DB에서 저장된 credentials 조회 (폴백)
    if (user_id && (!clientId || !clientSecret)) {
      const { data: cred } = await supabaseAdmin
        .from('pm_mall_credentials')
        .select('credentials')
        .eq('user_id', user_id)
        .eq('mall_key', 'cafe24')
        .maybeSingle()
      if (cred?.credentials) {
        if (!clientId)     clientId     = cred.credentials.api_key     || ''
        if (!clientSecret) clientSecret = cred.credentials.api_secret  || ''
      }
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID / Client Secret을 확인할 수 없습니다. 채널 연동 설정에서 Client ID와 Client Secret을 입력해 주세요.' },
        { status: 500 }
      )
    }

    /* ── 카페24 토큰 교환 요청 ── */
    // Cafe24 공식 스펙: client_id/client_secret은 Authorization Basic 헤더에만 포함
    const tokenRes = await proxyFetch(`https://${mall_id}.cafe24api.com/api/v2/oauth/token`, {
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
      let errDetail = ''
      try { errDetail = await tokenRes.text() } catch { /* ignore */ }

      // Vercel 로그에 디버그 정보 출력
      console.error('[cafe24/token] 토큰 교환 실패', {
        status     : tokenRes.status,
        mall_id,
        clientId   : clientId ? `${clientId.slice(0, 6)}...` : '(없음)',
        hasSecret  : !!clientSecret,
        redirectUri,
        errDetail,
      })

      let errMsg = `카페24 토큰 교환 실패 (${tokenRes.status})`
      if (tokenRes.status === 401) {
        errMsg = 'Client ID 또는 Client Secret이 올바르지 않습니다 (401). 카페24 개발자센터 → 내 앱 → 기본 정보에서 Client Secret을 확인 후 Vercel 환경변수 CAFE24_CLIENT_SECRET을 업데이트 해주세요.'
      } else if (tokenRes.status === 400) {
        errMsg = '인증 코드 만료 또는 이미 사용됨 (400) — OAuth 인증 팝업을 다시 열어 재시도해 주세요.'
        if (errDetail.includes('redirect_uri')) {
          errMsg = `redirect_uri 불일치 (400) — 카페24 앱에 등록된 redirect_uri: "${redirectUri}" 와 일치하는지 확인해 주세요.`
        }
      }
      return NextResponse.json(
        { error: errMsg, detail: errDetail, status: tokenRes.status, debugRedirectUri: redirectUri },
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
