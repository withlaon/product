/**
 * /api/mall-claims
 *
 * 쇼핑몰 클레임(반품·교환·취소·CS) 수집·처리 API 프록시
 *
 * POST body:
 *   action      : 'collect' | 'approve_cancel' | 'approve_return' | 'approve_exchange'
 *                 | 'reject_claim' | 'complete_return' | 'collect_cs'
 *   mall        : 쇼핑몰 키
 *   credentials : { login_id, login_pw, api_key, api_secret, seller_id, ... }
 *   params      : 액션별 파라미터
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type Credentials = Record<string, string>

/* ─── 표준 클레임 인터페이스 ────────────────────────────────────── */
export type ClaimType = '취소' | '반품' | '교환' | '환불' | 'CS문의'

export interface MallClaim {
  claim_id        : string
  order_id        : string
  mall            : string
  claim_type      : ClaimType
  claim_date      : string
  reason          : string
  detail          : string
  buyer_name      : string
  buyer_phone     : string
  product_name    : string
  option_name     : string
  qty             : number
  price           : number
  status          : '접수' | '처리중' | '완료' | '거부'
  return_courier  : string
  return_invoice  : string
  return_addr     : string
}

/* ─── 쇼핑몰별 클레임 수집 구현 ────────────────────────────────── */

async function collectClaimsCoupang(creds: Credentials, params: Record<string, string>): Promise<MallClaim[]> {
  const { seller_id, api_key } = creds
  if (!seller_id || !api_key) throw new Error('쿠팡 인증 정보 누락')
  const url = `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/returns?createdAtFrom=${params.start_date || ''}&createdAtTo=${params.end_date || ''}&status=RETURN_REQUEST`
  const res = await fetch(url, {
    headers: { 'Authorization': `CEA algorithm=HmacSHA256, access-key=${api_key}` },
    signal : AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`쿠팡 클레임 조회 오류: ${res.status}`)
  const data = await res.json()
  return (data.data || []).map((c: Record<string, unknown>) => ({
    claim_id       : String(c.returnId || ''),
    order_id       : String(c.orderId || ''),
    mall           : 'coupang',
    claim_type     : '반품' as ClaimType,
    claim_date     : String(c.returnCompletedDate || c.createdAt || ''),
    reason         : String(c.returnReason || ''),
    detail         : String(c.returnReasonContent || ''),
    buyer_name     : String((c.orderer as Record<string, unknown>)?.name || ''),
    buyer_phone    : String((c.orderer as Record<string, unknown>)?.phone || ''),
    product_name   : String(c.productName || ''),
    option_name    : String(c.sellerProductItemName || ''),
    qty            : Number(c.returnQuantity || 1),
    price          : Number(c.refundPrice || 0),
    status         : '접수' as const,
    return_courier : String(c.deliveryCompanyName || ''),
    return_invoice : String(c.trackingNumber || ''),
    return_addr    : '',
  }))
}

async function collectClaimsNaver(creds: Credentials, params: Record<string, string>): Promise<MallClaim[]> {
  const { api_key, api_secret } = creds
  if (!api_key || !api_secret) throw new Error('스마트스토어 인증 정보 누락')
  const tokenRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : new URLSearchParams({ grant_type: 'client_credentials', client_id: api_key, client_secret: api_secret }),
    signal : AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) throw new Error('스마트스토어 토큰 발급 실패')
  const { access_token } = await tokenRes.json()
  // 취소·반품·교환 각각 조회
  const claimTypes: Array<[string, ClaimType]> = [
    ['CANCEL', '취소'],
    ['RETURN', '반품'],
    ['EXCHANGE', '교환'],
  ]
  const all: MallClaim[] = []
  for (const [claimStatusType, claimType] of claimTypes) {
    try {
      const res = await fetch(
        `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query-by-date?lastChangedFrom=${params.start_date || ''}&lastChangedTo=${params.end_date || ''}&limitCount=100&claimStatusType=${claimStatusType}`,
        { headers: { 'Authorization': `Bearer ${access_token}` }, signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      for (const c of (data.data || [])) {
        all.push({
          claim_id       : String(c.claimId || c.productOrderId || ''),
          order_id       : String(c.orderId || ''),
          mall           : 'naver',
          claim_type     : claimType,
          claim_date     : String(c.claimDate || c.paymentDate || ''),
          reason         : String(c.claimReason || ''),
          detail         : String(c.claimReasonDetail || ''),
          buyer_name     : String((c.order as Record<string, unknown>)?.ordererName || ''),
          buyer_phone    : String((c.order as Record<string, unknown>)?.ordererTel || ''),
          product_name   : String(c.productName || ''),
          option_name    : String(c.optionContent || ''),
          qty            : Number(c.quantity || 1),
          price          : Number(c.claimPrice || 0),
          status         : '접수' as const,
          return_courier : String(c.returnDeliveryCompany || ''),
          return_invoice : String(c.returnTrackingNumber || ''),
          return_addr    : '',
        })
      }
    } catch { /* 개별 조회 실패 무시 */ }
  }
  return all
}

/* ─── 클레임 처리 (취소승인/반품승인/교환승인/거부) ──────────────── */

async function approveCoupangClaim(creds: Credentials, params: Record<string, string>) {
  const { seller_id, api_key } = creds
  if (!seller_id || !api_key) throw new Error('쿠팡 인증 정보 누락')
  const { claim_id, action } = params
  const endpoint = action === 'approve_cancel'
    ? `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/cancels/${claim_id}/approve`
    : `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/returns/${claim_id}/approve`
  const res = await fetch(endpoint, {
    method : 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `CEA algorithm=HmacSHA256, access-key=${api_key}` },
    body   : JSON.stringify({}),
    signal : AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`쿠팡 클레임 처리 오류: ${res.status}`)
  return { success: true }
}

/* ─── 라우터 ────────────────────────────────────────────────────── */
const CLAIM_COLLECTORS: Record<string, (c: Credentials, p: Record<string, string>) => Promise<MallClaim[]>> = {
  coupang : collectClaimsCoupang,
  naver   : collectClaimsNaver,
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, params = {} } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      params      : Record<string, string>
    }

    // 클레임 수집
    if (action === 'collect') {
      const collector = CLAIM_COLLECTORS[mall]
      if (!collector) {
        return NextResponse.json({
          success: false,
          message: `${mall} 클레임 수집은 아직 지원되지 않습니다. (개발 예정)`,
          claims: [],
        })
      }
      const claims = await collector(credentials, params)
      return NextResponse.json({ success: true, claims, count: claims.length })
    }

    // 취소 승인
    if (action === 'approve_cancel' || action === 'approve_return' || action === 'approve_exchange') {
      if (mall === 'coupang') {
        const result = await approveCoupangClaim(credentials, { ...params, action })
        return NextResponse.json(result)
      }
      return NextResponse.json({ success: false, message: `${mall} 클레임 처리 API 연동 준비 중` })
    }

    // 클레임 거부
    if (action === 'reject_claim') {
      return NextResponse.json({ success: false, message: `${mall} 클레임 거부 API 연동 준비 중` })
    }

    // 반품 완료
    if (action === 'complete_return') {
      return NextResponse.json({ success: false, message: `${mall} 반품 완료 처리 API 연동 준비 중` })
    }

    // CS(문의) 수집 – 쇼핑몰에서 고객문의 가져오기
    if (action === 'collect_cs') {
      return NextResponse.json({
        success: false,
        message: `${mall} CS 문의 수집 API 연동 준비 중`,
        cs_list: [],
      })
    }

    return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg, claims: [] }, { status: 500 })
  }
}
