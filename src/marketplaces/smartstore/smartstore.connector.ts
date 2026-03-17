/**
 * 네이버 스마트스토어 커넥터
 * API: https://api.commerce.naver.com
 * 인증: OAuth2 Client Credentials
 *
 * 공식 스펙 (apicenter.commerce.naver.com/docs/auth):
 *   client_secret_sign = Base64( bcrypt(password="{clientId}_{timestamp_ms}", salt=clientSecret) )
 *   ※ client_secret 자체가 bcrypt salt 값입니다 (HMAC-SHA256 아님)
 */

import bcrypt from 'bcryptjs'
import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedProduct,
  UnifiedOrder,
  UnifiedClaim,
  ClaimType,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.commerce.naver.com/external'

export class SmartstoreConnector extends BaseMarketplace {
  readonly mallKey  = 'smartstore'
  readonly mallName = '스마트스토어'

  /**
   * 네이버 커머스 API 서명 생성 (공식 스펙)
   * client_secret_sign = Base64( bcrypt( "{clientId}_{timestamp_ms}", clientSecret_as_salt ) )
   * clientSecret은 bcrypt salt 형식($2b$10$...) 값입니다.
   */
  private async buildSign(clientId: string, clientSecret: string): Promise<{ timestamp: string; sign: string }> {
    const timestamp = String(Date.now())
    const password  = `${clientId}_${timestamp}`
    const hashed    = await bcrypt.hash(password, clientSecret.trim())
    const sign      = Buffer.from(hashed).toString('base64')
    return { timestamp, sign }
  }

  private async getAccessToken(): Promise<string> {
    const { api_key, api_secret } = this.credentials
    if (!api_key || !api_secret) throw new Error('스마트스토어 인증 정보 누락 (Application ID / Secret)')

    const clientId  = String(api_key).trim()
    const clientSec = String(api_secret).trim()
    const { timestamp, sign } = await this.buildSign(clientId, clientSec)

    const params = new URLSearchParams()
    params.append('grant_type',         'client_credentials')
    params.append('client_id',          clientId)
    params.append('timestamp',          timestamp)
    params.append('client_secret_sign', sign)
    params.append('type',               'SELF')

    const res = await this.fetch(`${BASE_URL}/v1/oauth2/token`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body   : params.toString(),
      signal : AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`스마트스토어 토큰 발급 실패: ${res.status} ${detail}`)
    }
    const data = await res.json()
    return data.access_token as string
  }

  private authHeader(token: string) {
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  /* ─── 상품 관리 ─────────────────────────────────────────────── */
  async createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    const token = await this.getAccessToken()
    const body = {
      originProduct: {
        statusType     : 'SALE',
        saleChannelType: 'STOREFARM',
        name           : product.name,
        detailContent  : product.detail_html,
        salePrice      : product.sale_price,
        stockQuantity  : product.stock,
        deliveryInfo   : {
          deliveryType         : 'DELIVERY',
          deliveryAttributeType: 'NORMAL',
          deliveryFee          : { deliveryFeeType: 'FREE' },
        },
        productImages : { representativeImage: { url: product.images[0] || '' } },
        leafCategoryId: product.category_id,
      },
    }
    const res = await this.fetch(`${BASE_URL}/v2/products`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify(body),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`스마트스토어 상품 등록 오류: ${res.status}`)
    const data = await res.json()
    return { mall_product_id: String(data.originProductNo || '') }
  }

  async updateProduct(mallProductId: string, product: Partial<UnifiedProduct>): Promise<void> {
    const token = await this.getAccessToken()
    const body: Record<string, unknown> = { originProduct: {} }
    if (product.name)       (body.originProduct as Record<string, unknown>).name = product.name
    if (product.sale_price) (body.originProduct as Record<string, unknown>).salePrice = product.sale_price
    if (product.stock)      (body.originProduct as Record<string, unknown>).stockQuantity = product.stock
    const res = await this.fetch(`${BASE_URL}/v2/products/${mallProductId}`, {
      method : 'PUT',
      headers: this.authHeader(token),
      body   : JSON.stringify(body),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`스마트스토어 상품 수정 오류: ${res.status}`)
  }

  async deleteProduct(mallProductId: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v2/products/${mallProductId}`, {
      method : 'PUT',
      headers: this.authHeader(token),
      body   : JSON.stringify({ originProduct: { statusType: 'WITHDRAWAL' } }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 상품 삭제 오류: ${res.status}`)
  }

  async updateStock(mallProductId: string, stock: number): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v2/products/${mallProductId}`, {
      method : 'PUT',
      headers: this.authHeader(token),
      body   : JSON.stringify({ originProduct: { stockQuantity: stock } }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 재고 수정 오류: ${res.status}`)
  }

  async updatePrice(mallProductId: string, price: number): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v2/products/${mallProductId}`, {
      method : 'PUT',
      headers: this.authHeader(token),
      body   : JSON.stringify({ originProduct: { salePrice: price } }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 가격 수정 오류: ${res.status}`)
  }

  /* ─── 주문 수집 ─────────────────────────────────────────────── */
  /** ISO date → 네이버 커머스 API 형식 (YYYY-MM-DDTHH:mm:ss) */
  private toNaverDate(dateStr: string, isEnd = false): string {
    const d = (dateStr || '').split('T')[0]
    return d ? (isEnd ? `${d}T23:59:59` : `${d}T00:00:00`) : ''
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const token = await this.getAccessToken()
    const from  = this.toNaverDate(params.start_date || '')
    const to    = this.toNaverDate(params.end_date   || '', true)
    const url   = `${BASE_URL}/v1/pay-order/seller/product-orders/query-by-date`
      + `?lastChangedFrom=${from}`
      + `&lastChangedTo=${to}`
      + `&limitCount=${params.limit || 300}`
    const res = await this.fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`스마트스토어 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.data || []).map((o: Record<string, unknown>) => {
      const order   = o.order   as Record<string, unknown> || {}
      const addr    = o.shippingAddress as Record<string, unknown> || {}
      return {
        order_id        : String(o.productOrderId || ''),
        order_date      : String(o.paymentDate || ''),
        marketplace     : this.mallKey,
        mall_order_no   : String(o.orderId || ''),
        buyer_name      : String(order.ordererName || ''),
        buyer_phone     : String(order.ordererTel || ''),
        receiver_name   : String(addr.name || ''),
        receiver_phone  : String(addr.tel1 || ''),
        receiver_addr   : `${addr.roadAddress || ''} ${addr.detailedAddress || ''}`.trim(),
        receiver_zip    : String(addr.zipCode || ''),
        items           : [{
          product_name  : String(o.productName || ''),
          option_name   : String(o.optionContent || ''),
          qty           : Number(o.quantity || 1),
          price         : Number(o.totalPaymentAmount || 0),
        }],
        total_price     : Number(o.totalPaymentAmount || 0),
        status          : String(o.productOrderStatus || ''),
        courier         : String(o.deliveryCompany || ''),
        invoice_no      : String(o.trackingNumber || ''),
        delivery_message: String((o.shippingAddress as Record<string, unknown>)?.message || ''),
      }
    })
  }

  /* ─── 송장 전송 ─────────────────────────────────────────────── */
  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v1/pay-order/seller/product-orders/dispatch`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify({
        dispatchProductOrders: [{
          productOrderId : params.order_id,
          deliveryMethod : 'PARCEL',
          deliveryCompany: params.courier_code,
          trackingNumber : params.invoice_no,
        }],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 송장 전송 오류: ${res.status}`)
  }

  /* ─── CS / 클레임 ───────────────────────────────────────────── */
  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const token = await this.getAccessToken()
    const claimStatusTypes: Array<[string, ClaimType]> = [
      ['CANCEL', '취소'],
      ['RETURN', '반품'],
      ['EXCHANGE', '교환'],
    ]
    const all: UnifiedClaim[] = []
    for (const [claimStatusType, claimType] of claimStatusTypes) {
      try {
        const res = await fetch(
          `${BASE_URL}/v1/pay-order/seller/product-orders/query-by-date`
          + `?lastChangedFrom=${params.start_date || ''}&lastChangedTo=${params.end_date || ''}`
          + `&limitCount=100&claimStatusType=${claimStatusType}`,
          { headers: { 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }
        )
        if (!res.ok) continue
        const data = await res.json()
        for (const c of (data.data || [])) {
          const order = (c.order as Record<string, unknown>) || {}
          all.push({
            claim_id      : String(c.claimId || c.productOrderId || ''),
            order_id      : String(c.orderId || ''),
            marketplace   : this.mallKey,
            claim_type    : claimType,
            claim_date    : String(c.claimDate || c.paymentDate || ''),
            reason        : String(c.claimReason || ''),
            detail        : String(c.claimReasonDetail || ''),
            buyer_name    : String(order.ordererName || ''),
            buyer_phone   : String(order.ordererTel || ''),
            product_name  : String(c.productName || ''),
            option_name   : String(c.optionContent || ''),
            qty           : Number(c.quantity || 1),
            price         : Number(c.claimPrice || 0),
            status        : '접수',
            return_courier: String(c.returnDeliveryCompany || ''),
            return_invoice: String(c.returnTrackingNumber || ''),
            return_addr   : '',
          })
        }
      } catch { /* 개별 조회 실패 무시 */ }
    }
    return all
  }

  async cancelOrder(orderId: string, reason?: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v1/pay-order/seller/product-orders/cancel`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify({ productOrderIds: [orderId], cancelReason: reason || 'SELLER_REASON' }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 취소 처리 오류: ${res.status}`)
  }

  async approveReturn(claimId: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v1/pay-order/seller/product-orders/${claimId}/return/receive`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify({}),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 반품 승인 오류: ${res.status}`)
  }

  async approveExchange(claimId: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v1/pay-order/seller/product-orders/${claimId}/exchange/receive`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify({}),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 교환 승인 오류: ${res.status}`)
  }

  async rejectClaim(claimId: string, reason?: string): Promise<void> {
    const token = await this.getAccessToken()
    const res = await this.fetch(`${BASE_URL}/v1/pay-order/seller/product-orders/${claimId}/claim/reject`, {
      method : 'POST',
      headers: this.authHeader(token),
      body   : JSON.stringify({ rejectReason: reason || '' }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`스마트스토어 클레임 거부 오류: ${res.status}`)
  }
}
