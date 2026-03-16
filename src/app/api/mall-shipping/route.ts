/**
 * /api/mall-shipping
 *
 * 쇼핑몰 송장 등록·전송·배송정보 조회 API 프록시
 *
 * POST body:
 *   action      : 'send_invoice' | 'bulk_send' | 'get_shipping_profiles' | 'track'
 *   mall        : 쇼핑몰 키
 *   credentials : { login_id, login_pw, api_key, api_secret, seller_id, ... }
 *   params      : 액션별 파라미터
 *     send_invoice  → { order_id, courier_code, invoice_no }
 *     bulk_send     → { items: [{order_id, courier_code, invoice_no}] }
 *     get_shipping_profiles → {}
 *     track         → { courier_code, invoice_no }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type Credentials = Record<string, string>

/* ─── 표준 배송정보 프로필 인터페이스 ──────────────────────────── */
interface ShippingProfile {
  id              : string
  name            : string
  delivery_type   : '무료배송' | '유료배송' | '조건부무료'
  fee             : number
  free_condition  : number   // 무료조건 금액 (0 = 무조건 무료)
  return_fee      : number
  exchange_fee    : number
  courier         : string
  warehouse_addr  : string
  lead_time       : number   // 발송 소요일
}

/* ─── 택배사 코드 표준화 ────────────────────────────────────────── */
const COURIER_MAP: Record<string, string> = {
  'CJ대한통운' : '04',
  '한진택배'   : '05',
  '롯데택배'   : '08',
  '로젠택배'   : '06',
  '우체국택배' : '01',
  '경동택배'   : '23',
  '대신택배'   : '22',
  '일양로지스' : '11',
}

/* ─── 쇼핑몰별 송장 전송 구현 ──────────────────────────────────── */

async function sendInvoiceCoupang(
  creds: Credentials,
  params: { order_id: string; courier_code: string; invoice_no: string }
) {
  const { seller_id, api_key } = creds
  if (!seller_id || !api_key) throw new Error('쿠팡 인증 정보 누락')
  const url = `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/orders/${params.order_id}/shipments`
  const res = await fetch(url, {
    method : 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `CEA algorithm=HmacSHA256, access-key=${api_key}` },
    body   : JSON.stringify({ deliveryCompanyCode: params.courier_code, trackingNumber: params.invoice_no }),
    signal : AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`쿠팡 송장 전송 오류: ${res.status}`)
  return { success: true }
}

async function sendInvoiceNaver(
  creds: Credentials,
  params: { order_id: string; courier_code: string; invoice_no: string }
) {
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
  const res = await fetch('https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/dispatch', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
    body   : JSON.stringify({
      dispatchProductOrders: [{
        productOrderId  : params.order_id,
        deliveryMethod  : 'PARCEL',
        deliveryCompany : params.courier_code,
        trackingNumber  : params.invoice_no,
      }],
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`스마트스토어 송장 전송 오류: ${res.status}`)
  return { success: true }
}

async function sendInvoice11st(
  creds: Credentials,
  params: { order_id: string; courier_code: string; invoice_no: string }
) {
  const { api_key } = creds
  if (!api_key) throw new Error('11번가 API 인증키 누락')
  const body = `<order><ordNo>${params.order_id}</ordNo><dlvMthdCd>05</dlvMthdCd><dlvNm>${params.courier_code}</dlvNm><invcNo>${params.invoice_no}</invcNo></order>`
  const res = await fetch(
    `https://openapi.11st.co.kr/openapi/OpenApiService.tmall?key=${api_key}&serviceName=OrderService&version=2&method=updateDeliveryInfo`,
    { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body, signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) throw new Error(`11번가 송장 전송 오류: ${res.status}`)
  return { success: true }
}

/* ─── 배송정보(배송템플릿) 조회 ────────────────────────────────── */

async function getShippingProfilesFashionplus(creds: Credentials): Promise<ShippingProfile[]> {
  const { api_key, login_id, login_pw } = creds
  if (!api_key) throw new Error('패션플러스 거래처코드 누락')
  try {
    const res = await fetch('https://api.fashionplus.co.kr/v1/shipping/profiles', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trader-Code': api_key },
      body   : JSON.stringify({ traderCode: api_key, loginId: login_id, loginPw: login_pw }),
      signal : AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.profiles || []).map((p: Record<string, unknown>) => ({
      id           : String(p.profileId || ''),
      name         : String(p.profileName || ''),
      delivery_type: String(p.deliveryType || '무료배송') as ShippingProfile['delivery_type'],
      fee          : Number(p.deliveryFee || 0),
      free_condition: Number(p.freeConditionAmount || 0),
      return_fee   : Number(p.returnFee || 0),
      exchange_fee : Number(p.exchangeFee || 0),
      courier      : String(p.courierName || ''),
      warehouse_addr: String(p.warehouseAddress || ''),
      lead_time    : Number(p.leadTime || 1),
    }))
  } catch {
    return []
  }
}

/* ─── 배송 추적 ─────────────────────────────────────────────────── */

async function trackDelivery(params: { courier_code: string; invoice_no: string }) {
  try {
    // 스마트택배 API (무료 배송 추적 서비스)
    const res = await fetch(
      `https://info.sweettracker.co.kr/tracking/5?t_key=dummy&t_code=${COURIER_MAP[params.courier_code] || params.courier_code}&t_invoice=${params.invoice_no}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return { status: '조회불가', details: [] }
    const data = await res.json()
    return {
      status : data.trackingDetails?.[0]?.where || '정보없음',
      details: data.trackingDetails || [],
    }
  } catch {
    return { status: '조회불가', details: [] }
  }
}

/* ─── 라우터 ────────────────────────────────────────────────────── */
type InvoiceSender = (c: Credentials, p: { order_id: string; courier_code: string; invoice_no: string }) => Promise<{ success: boolean }>

const INVOICE_SENDERS: Record<string, InvoiceSender> = {
  coupang: sendInvoiceCoupang,
  naver  : sendInvoiceNaver,
  '11st' : sendInvoice11st,
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

    if (action === 'send_invoice' || action === 'bulk_send') {
      const sender = INVOICE_SENDERS[mall]
      if (!sender) {
        return NextResponse.json({ success: false, message: `${mall} 송장 전송은 아직 지원되지 않습니다.` })
      }
      if (action === 'bulk_send') {
        const items = (params as unknown as { items: Array<{ order_id: string; courier_code: string; invoice_no: string }> }).items || []
        const results = await Promise.allSettled(items.map(item => sender(credentials, item)))
        const success = results.filter(r => r.status === 'fulfilled').length
        return NextResponse.json({ success: true, total: items.length, sent: success, failed: items.length - success })
      }
      const result = await sender(credentials, params as { order_id: string; courier_code: string; invoice_no: string })
      return NextResponse.json(result)
    }

    if (action === 'get_shipping_profiles') {
      if (mall === 'fashionplus') {
        const profiles = await getShippingProfilesFashionplus(credentials)
        return NextResponse.json({ success: true, profiles })
      }
      return NextResponse.json({ success: false, message: `${mall} 배송정보 조회는 아직 지원되지 않습니다.`, profiles: [] })
    }

    if (action === 'track') {
      const result = await trackDelivery(params as { courier_code: string; invoice_no: string })
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
