/**
 * 쿠팡 WING API 커넥터
 * API: https://api-gateway.coupang.com
 * 인증: HMAC-SHA256 (Access Key / Secret Key)
 * 문서: https://developers.coupangcorp.com
 */

import { createHmac } from 'crypto'
import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedProduct,
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api-gateway.coupang.com'

export class CoupangConnector extends BaseMarketplace {
  readonly mallKey  = 'coupang'
  readonly mallName = '쿠팡'

  /**
   * HMAC-SHA256 Authorization 헤더 생성 (쿠팡 CEA 인증)
   *
   * 공식 Postman pre-script 기준:
   *   signed-date : YYMMDDTHHmmssZ  (2자리 연도, UTC)
   *   message     : signed-date + METHOD + pathOnly + queryString (? 없이 연결)
   *   signature   : HmacSHA256(secret_key, message).hexdigest()
   *   헤더        : Authorization + X-Requested-By(vendorId) 필수
   */
  private buildAuthHeader(method: string, path: string): Record<string, string> {
    const { api_key, api_secret } = this.credentials
    if (!api_key || !api_secret) throw new Error('쿠팡 인증 정보 누락 (AccessKey / SecretKey)')

    // "2026-03-17T09:47:00.000Z" → split → "2026-03-17T09:47:00" + "Z"
    //   → replace(:,-)  → "20260317T094700Z"
    //   → substring(2)  → "260317T094700Z"  ← 쿠팡 공식 2자리 연도 형식
    const signed = (new Date().toISOString().split('.')[0] + 'Z')
      .replace(/:/g, '')
      .replace(/-/g, '')
      .substring(2)

    // path = "/v2/.../ordersheets?createdAtFrom=...&createdAtTo=..."
    // 서명 메시지: pathOnly + queryString (? 제외)
    const [pathOnly, queryStr = ''] = path.split('?')
    const message   = signed + method + pathOnly + queryStr
    const signature = createHmac('sha256', api_secret).update(message).digest('hex')

    return {
      'Authorization' : `CEA algorithm=HmacSHA256, access-key=${api_key}, signed-date=${signed}, signature=${signature}`,
      'Content-Type'  : 'application/json;charset=UTF-8',
      'X-Requested-By': this.credentials.seller_id || '',
    }
  }

  private get sellerId(): string {
    const id = this.credentials.seller_id
    if (!id) throw new Error('쿠팡 Vendor ID(seller_id) 누락')
    return id
  }

  /** 쿠팡 API 날짜 포맷: yyyy-MM-ddT00:00:00 */
  private fmtDate(dateStr: string, isEnd = false): string {
    if (!dateStr) return ''
    const d = dateStr.split('T')[0]  // "yyyy-MM-dd" 부분만
    return isEnd ? `${d}T23:59:59` : `${d}T00:00:00`
  }

  /* ─── 상품 관리 ─────────────────────────────────────────────── */
  async createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/products`
    const body = {
      vendorId            : this.sellerId,
      saleStartedAt       : new Date().toISOString(),
      saleEndedAt         : '2099-12-31T23:59:59',
      displayCategoryCode : product.category_id,
      sellerProductName   : product.name,
      brand               : product.brand || '자체브랜드',
      generalProductName  : product.name,
      productGroup        : '패션의류',
      deliveryChargeType  : 'FREE',
      items: product.options.map(o => ({
        itemName     : `${product.name} / ${o.size || o.name}`,
        originalPrice: product.sale_price,
        salePrice    : product.sale_price,
        maxBuyCount  : 99,
        images       : product.images.map(url => ({ cdnPath: url })),
      })),
    }
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'POST',
      headers: this.buildAuthHeader('POST', path),
      body   : JSON.stringify(body),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`쿠팡 상품 등록 오류: ${res.status}`)
    const data = await res.json()
    return { mall_product_id: String(data.data?.productId || '') }
  }

  async updateProduct(mallProductId: string, product: Partial<UnifiedProduct>): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/products/${mallProductId}`
    const body: Record<string, unknown> = {}
    if (product.name)       body.sellerProductName = product.name
    if (product.sale_price) body.salePrice = product.sale_price
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify(body),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`쿠팡 상품 수정 오류: ${res.status}`)
  }

  async deleteProduct(mallProductId: string): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/products/${mallProductId}`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'DELETE',
      headers: this.buildAuthHeader('DELETE', path),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 상품 삭제 오류: ${res.status}`)
  }

  async updateStock(mallProductId: string, stock: number): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/products/${mallProductId}/quantity`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({ quantity: stock }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 재고 수정 오류: ${res.status}`)
  }

  async updatePrice(mallProductId: string, price: number): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/products/${mallProductId}/price`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({ salePrice: price }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 가격 수정 오류: ${res.status}`)
  }

  /* ─── 주문 수집 ─────────────────────────────────────────────── */
  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const from = this.fmtDate(params.start_date || '')
    const to   = this.fmtDate(params.end_date   || '', true)
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/ordersheets`
      + `?createdAtFrom=${from}&createdAtTo=${to}&maxPerPage=${params.limit || 100}`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      headers: this.buildAuthHeader('GET', path),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`쿠팡 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.data || []).map((o: Record<string, unknown>) => {
      const orderer  = (o.orderer      as Record<string, unknown>) || {}
      const shipping = (o.shippingInfo as Record<string, unknown>) || {}
      return {
        order_id       : String(o.orderId || ''),
        order_date     : String(o.orderDate || ''),
        marketplace    : this.mallKey,
        mall_order_no  : String(o.orderId || ''),
        buyer_name     : String(orderer.name || ''),
        buyer_phone    : String(orderer.phone || ''),
        receiver_name  : String(shipping.name || ''),
        receiver_phone : String(shipping.phone || ''),
        receiver_addr  : String(shipping.addr || ''),
        receiver_zip   : String(shipping.zipCode || ''),
        items          : [{
          product_name       : String(o.productName || ''),
          option_name        : String(o.sellerProductItemName || ''),
          qty                : Number(o.quantity || 1),
          price              : Number(o.salePrice || 0),
          mall_order_item_id : String(o.productOrderId || ''),
        }],
        total_price     : Number(o.salePrice || 0),
        status          : String(o.status || ''),
        courier         : '',
        invoice_no      : '',
        delivery_message: String(shipping.memo || ''),
      }
    })
  }

  /* ─── 송장 전송 ─────────────────────────────────────────────── */
  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/orders/${params.order_id}/shipments`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({
        deliveryCompanyCode: params.courier_code,
        trackingNumber     : params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 송장 전송 오류: ${res.status}`)
  }

  /* ─── CS / 클레임 ───────────────────────────────────────────── */
  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/returns`
      + `?createdAtFrom=${params.start_date || ''}&createdAtTo=${params.end_date || ''}&status=RETURN_REQUEST`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      headers: this.buildAuthHeader('GET', path),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.data || []).map((c: Record<string, unknown>) => {
      const orderer = (c.orderer as Record<string, unknown>) || {}
      return {
        claim_id      : String(c.returnId || ''),
        order_id      : String(c.orderId || ''),
        marketplace   : this.mallKey,
        claim_type    : '반품' as const,
        claim_date    : String(c.returnCompletedDate || c.createdAt || ''),
        reason        : String(c.returnReason || ''),
        detail        : String(c.returnReasonContent || ''),
        buyer_name    : String(orderer.name || ''),
        buyer_phone   : String(orderer.phone || ''),
        product_name  : String(c.productName || ''),
        option_name   : String(c.sellerProductItemName || ''),
        qty           : Number(c.returnQuantity || 1),
        price         : Number(c.refundPrice || 0),
        status        : '접수' as const,
        return_courier: String(c.deliveryCompanyName || ''),
        return_invoice: String(c.trackingNumber || ''),
        return_addr   : '',
      }
    })
  }

  async cancelOrder(orderId: string, reason?: string): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/cancels/${orderId}/approve`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({ cancelReason: reason || '' }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 취소 승인 오류: ${res.status}`)
  }

  async approveReturn(claimId: string): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/returns/${claimId}/approve`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({}),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 반품 승인 오류: ${res.status}`)
  }

  async approveExchange(claimId: string): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/exchanges/${claimId}/approve`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({}),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 교환 승인 오류: ${res.status}`)
  }

  async rejectClaim(claimId: string, reason?: string): Promise<void> {
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.sellerId}/returns/${claimId}/reject`
    const res = await this.fetch(`${BASE_URL}${path}`, {
      method : 'PUT',
      headers: this.buildAuthHeader('PUT', path),
      body   : JSON.stringify({ rejectReason: reason || '' }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`쿠팡 클레임 거부 오류: ${res.status}`)
  }
}
