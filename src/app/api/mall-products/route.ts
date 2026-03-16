/**
 * /api/mall-products
 *
 * 쇼핑몰 상품 등록·수정·삭제 API 프록시
 *
 * POST body:
 *   action      : 'register' | 'update' | 'delete' | 'status_change'
 *   mall        : 쇼핑몰 키
 *   credentials : { login_id, login_pw, api_key, api_secret, seller_id, ... }
 *   product     : 상품 데이터 (ProductPayload)
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type Credentials = Record<string, string>

/* ─── 상품 데이터 표준 인터페이스 ──────────────────────────────── */
interface ProductOption {
  option_code  : string
  size         : string
  barcode      : string
  color?       : string
  stock        : number
  extra_price  : number
}

interface ProductPayload {
  internal_id   : string           // 내부 상품 ID
  mall_product_id?: string         // 쇼핑몰 상품 ID (수정/삭제 시)
  name          : string
  category_id   : string           // 쇼핑몰 카테고리 ID
  brand         : string
  cost_price    : number
  sale_price    : number
  stock         : number
  images        : string[]         // 이미지 URL 배열
  detail_html   : string
  options       : ProductOption[]
  shipping_id   : string           // 쇼핑몰 배송정보 ID
  status?       : 'on_sale' | 'soldout' | 'hidden'
}

/* ─── 쇼핑몰별 상품 등록 구현 ──────────────────────────────────── */

async function registerCoupang(creds: Credentials, product: ProductPayload) {
  const { seller_id, api_key, api_secret } = creds
  if (!seller_id || !api_key || !api_secret) throw new Error('쿠팡 인증 정보 누락')
  // WING API: POST /v2/providers/openapi/apis/api/v4/vendors/{vendorId}/products
  const body = {
    vendorId          : seller_id,
    saleStartedAt     : new Date().toISOString(),
    saleEndedAt       : '2099-12-31T23:59:59',
    displayCategoryCode: product.category_id,
    sellerProductName : product.name,
    brand             : product.brand || '자체브랜드',
    generalProductName: product.name,
    productGroup      : '패션의류',
    deliveryChargeType: 'FREE',
    items: product.options.map(o => ({
      itemName  : `${product.name} / ${o.size} / ${o.option_code}`,
      originalPrice: product.sale_price,
      salePrice : product.sale_price,
      maxBuyCount: 99,
      images    : product.images.map(url => ({ cdnPath: url })),
    })),
  }
  const res = await fetch(
    `https://api-gateway.coupang.com/v2/providers/openapi/apis/api/v4/vendors/${seller_id}/products`,
    {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `CEA algorithm=HmacSHA256, access-key=${api_key}` },
      body   : JSON.stringify(body),
      signal : AbortSignal.timeout(15000),
    }
  )
  if (!res.ok) throw new Error(`쿠팡 상품등록 오류: ${res.status}`)
  const data = await res.json()
  return { mall_product_id: String(data.data?.productId || '') }
}

async function registerNaver(creds: Credentials, product: ProductPayload) {
  const { api_key, api_secret } = creds
  if (!api_key || !api_secret) throw new Error('스마트스토어 인증 정보 누락')
  // 토큰 발급
  const tokenRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : new URLSearchParams({ grant_type: 'client_credentials', client_id: api_key, client_secret: api_secret }),
    signal : AbortSignal.timeout(8000),
  })
  if (!tokenRes.ok) throw new Error('스마트스토어 토큰 발급 실패')
  const { access_token } = await tokenRes.json()
  // 상품 등록
  const body = {
    originProduct: {
      statusType           : 'SALE',
      saleChannelType      : 'STOREFARM',
      name                 : product.name,
      detailContent        : product.detail_html,
      salePrice            : product.sale_price,
      stockQuantity        : product.stock,
      deliveryInfo         : { deliveryType: 'DELIVERY', deliveryAttributeType: 'NORMAL', deliveryFee: { deliveryFeeType: 'FREE' } },
      productImages        : { representativeImage: { url: product.images[0] || '' } },
      leafCategoryId       : product.category_id,
    },
  }
  const res = await fetch('https://api.commerce.naver.com/external/v2/products', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
    body   : JSON.stringify(body),
    signal : AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`스마트스토어 상품등록 오류: ${res.status}`)
  const data = await res.json()
  return { mall_product_id: String(data.originProductNo || '') }
}

async function register11st(creds: Credentials, product: ProductPayload) {
  const { api_key } = creds
  if (!api_key) throw new Error('11번가 API 인증키 누락')
  // 11번가 Open API: 상품 등록
  const body = `<product><prdNm>${product.name}</prdNm><dispCtgrNo>${product.category_id}</dispCtgrNo><selPrc>${product.sale_price}</selPrc><qty>${product.stock}</qty></product>`
  const res = await fetch(`https://openapi.11st.co.kr/openapi/OpenApiService.tmall?key=${api_key}&serviceName=ProductService&version=2&method=insertProduct`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
    signal : AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`11번가 상품등록 오류: ${res.status}`)
  const text = await res.text()
  const match = text.match(/<prdNo>(.*?)<\/prdNo>/)
  return { mall_product_id: match?.[1] || '' }
}

/* ─── 라우터 ────────────────────────────────────────────────────── */
const REGISTRARS: Record<string, (c: Credentials, p: ProductPayload) => Promise<{ mall_product_id: string }>> = {
  coupang: registerCoupang,
  naver  : registerNaver,
  '11st' : register11st,
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, product } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      product     : ProductPayload
    }

    if (action === 'register') {
      const registrar = REGISTRARS[mall]
      if (!registrar) {
        return NextResponse.json({
          success: false,
          message: `${mall} 상품 등록은 아직 지원되지 않습니다. (개발 예정)`,
        })
      }
      const result = await registrar(credentials, product)
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'update') {
      return NextResponse.json({ success: false, message: `${mall} 상품 수정 API 연동 준비 중` })
    }

    if (action === 'delete') {
      return NextResponse.json({ success: false, message: `${mall} 상품 삭제 API 연동 준비 중` })
    }

    if (action === 'status_change') {
      return NextResponse.json({ success: false, message: `${mall} 상품 상태 변경 API 연동 준비 중` })
    }

    return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
