/**
 * /api/mall-orders
 *
 * 쇼핑몰 주문 관련 API 프록시 (서버사이드 – CORS 없이 각 쇼핑몰 API 호출)
 *
 * POST body:
 *   action      : 'collect' | 'update_status'
 *   mall        : 쇼핑몰 키 (coupang, naver, 11st, gmarket, auction, ablly, ...)
 *   credentials : { login_id, login_pw, api_key, api_secret, seller_id, ... }
 *   params      : 액션별 파라미터
 *     collect      → { start_date, end_date, status_filter }
 *     update_status → { order_id, status, reason? }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/* ─── 공통 타입 ─────────────────────────────────────────────────── */
type Credentials = Record<string, string>

interface MallOrder {
  order_id       : string
  order_date     : string
  mall           : string
  mall_order_no  : string
  buyer_name     : string
  buyer_phone    : string
  receiver_name  : string
  receiver_phone : string
  receiver_addr  : string
  product_name   : string
  option_name    : string
  qty            : number
  price          : number
  status         : string  // '결제완료' | '배송준비' | '배송중' | '배송완료' | '취소' | '반품' | '교환'
  courier        : string
  invoice_no     : string
}

/* ─── 쇼핑몰별 주문 수집 구현 ───────────────────────────────────── */

async function collectCoupang(creds: Credentials, params: Record<string, string>): Promise<MallOrder[]> {
  const { seller_id, api_key, api_secret } = creds
  if (!seller_id || !api_key || !api_secret) throw new Error('쿠팡 인증 정보 누락 (판매자코드/AccessKey/SecretKey)')
  // WING API: GET /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/ordersheets
  const url = `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/ordersheets`
  const res = await fetch(url, {
    headers: {
      'Authorization': `CEA algorithm=HmacSHA256, access-key=${api_key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`쿠팡 API 오류: ${res.status}`)
  const data = await res.json()
  return (data.data || []).map((o: Record<string, unknown>) => ({
    order_id: String(o.orderId || ''),
    order_date: String(o.orderDate || ''),
    mall: 'coupang',
    mall_order_no: String(o.orderId || ''),
    buyer_name: String((o.orderer as Record<string, unknown>)?.name || ''),
    buyer_phone: String((o.orderer as Record<string, unknown>)?.phone || ''),
    receiver_name: String((o.shippingInfo as Record<string, unknown>)?.name || ''),
    receiver_phone: String((o.shippingInfo as Record<string, unknown>)?.phone || ''),
    receiver_addr: String((o.shippingInfo as Record<string, unknown>)?.addr || ''),
    product_name: String(o.productName || ''),
    option_name: String(o.sellerProductItemName || ''),
    qty: Number(o.quantity || 1),
    price: Number(o.salePrice || 0),
    status: String(o.status || ''),
    courier: '',
    invoice_no: '',
  }))
}

async function collectNaver(creds: Credentials, params: Record<string, string>): Promise<MallOrder[]> {
  const { api_key, api_secret } = creds
  if (!api_key || !api_secret) throw new Error('스마트스토어 인증 정보 누락 (Application ID/Secret)')
  // Commerce API: GET /external/v1/pay-order/seller/product-orders/query-by-date
  const tokenRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: api_key, client_secret: api_secret }),
    signal: AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) throw new Error('스마트스토어 토큰 발급 실패')
  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  const url = `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query-by-date?lastChangedFrom=${params.start_date || ''}&lastChangedTo=${params.end_date || ''}&limitCount=300`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`스마트스토어 주문 조회 오류: ${res.status}`)
  const data = await res.json()
  return (data.data || []).map((o: Record<string, unknown>) => ({
    order_id: String(o.productOrderId || ''),
    order_date: String(o.paymentDate || ''),
    mall: 'naver',
    mall_order_no: String(o.orderId || ''),
    buyer_name: String((o.order as Record<string, unknown>)?.ordererName || ''),
    buyer_phone: String((o.order as Record<string, unknown>)?.ordererTel || ''),
    receiver_name: String((o.shippingAddress as Record<string, unknown>)?.name || ''),
    receiver_phone: String((o.shippingAddress as Record<string, unknown>)?.tel1 || ''),
    receiver_addr: `${(o.shippingAddress as Record<string, unknown>)?.roadAddress || ''} ${(o.shippingAddress as Record<string, unknown>)?.detailedAddress || ''}`.trim(),
    product_name: String(o.productName || ''),
    option_name: String(o.optionContent || ''),
    qty: Number(o.quantity || 1),
    price: Number(o.totalPaymentAmount || 0),
    status: String(o.productOrderStatus || ''),
    courier: String(o.deliveryCompany || ''),
    invoice_no: String(o.trackingNumber || ''),
  }))
}

async function collect11st(creds: Credentials, params: Record<string, string>): Promise<MallOrder[]> {
  const { api_key } = creds
  if (!api_key) throw new Error('11번가 API 인증키 누락')
  const startDate = (params.start_date || '').replace(/-/g, '')
  const endDate   = (params.end_date   || '').replace(/-/g, '')
  const url = `https://openapi.11st.co.kr/openapi/OpenApiService.tmall?key=${api_key}&serviceName=OrderService&version=2&method=getOrderList&orderStatus=BF&startDate=${startDate}&endDate=${endDate}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`11번가 주문 조회 오류: ${res.status}`)
  const text = await res.text()
  // XML 응답 파싱 (간략 처리)
  const orders: MallOrder[] = []
  const matches = text.matchAll(/<ordNo>(.*?)<\/ordNo>/g)
  for (const m of matches) {
    orders.push({ order_id: m[1], order_date: '', mall: '11st', mall_order_no: m[1], buyer_name: '', buyer_phone: '', receiver_name: '', receiver_phone: '', receiver_addr: '', product_name: '', option_name: '', qty: 1, price: 0, status: '결제완료', courier: '', invoice_no: '' })
  }
  return orders
}

/* ─── 라우터 ────────────────────────────────────────────────────── */
const COLLECTORS: Record<string, (c: Credentials, p: Record<string, string>) => Promise<MallOrder[]>> = {
  coupang  : collectCoupang,
  naver    : collectNaver,
  '11st'   : collect11st,
  // gmarket, auction, ablly, zigzag 등은 추후 실제 API 연동 시 추가
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

    if (action === 'collect') {
      const collector = COLLECTORS[mall]
      if (!collector) {
        return NextResponse.json({
          success: false,
          message: `${mall} 주문 수집은 아직 지원되지 않습니다. (개발 예정)`,
          orders: [],
        })
      }
      const orders = await collector(credentials, params)
      return NextResponse.json({ success: true, orders, count: orders.length })
    }

    return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg, orders: [] }, { status: 500 })
  }
}
