/**
 * 에이블리 커넥터
 * API: https://api.a-bly.com/openapi
 * 인증: API Token 단독 (Authorization 헤더)
 *
 * credentials 매핑:
 *   api_key → API Token (ABLY Sellers 기본 정보 페이지에서 발급)
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.a-bly.com/openapi/v1'

export class AblyConnector extends BaseMarketplace {
  readonly mallKey  = 'ably'
  readonly mallName = '에이블리'

  private get apiToken(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('에이블리 API Token 누락 — my.a-bly.com 기본 정보 페이지에서 발급')
    return key
  }

  private authHeader() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type' : 'application/json',
    }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await fetch(
      `${BASE_URL}/orders?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`에이블리 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orderList || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.orderItemId || ''),
      order_date    : String(o.createdAt || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.orderId || ''),
      buyer_name    : String(o.buyerName || ''),
      buyer_phone   : String(o.buyerPhone || ''),
      receiver_name : String(o.receiverName || ''),
      receiver_phone: String(o.receiverPhone || ''),
      receiver_addr : String(o.receiverAddress || ''),
      items         : [{
        product_name: String(o.productName || ''),
        option_name : String(o.optionName || ''),
        qty         : Number(o.quantity || 1),
        price       : Number(o.price || 0),
      }],
      total_price  : Number(o.price || 0),
      status       : String(o.status || ''),
      courier      : String(o.deliveryCompany || ''),
      invoice_no   : String(o.trackingNumber || ''),
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${params.order_id}/delivery`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        deliveryCompanyCode: params.courier_code,
        trackingNumber     : params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`에이블리 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(
      `${BASE_URL}/claims?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`에이블리 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claimList || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.claimId || ''),
      order_id      : String(c.orderId || ''),
      marketplace   : this.mallKey,
      claim_type    : '반품' as const,
      claim_date    : String(c.createdAt || ''),
      reason        : String(c.reason || ''),
      detail        : String(c.reasonDetail || ''),
      buyer_name    : String(c.buyerName || ''),
      buyer_phone   : String(c.buyerPhone || ''),
      product_name  : String(c.productName || ''),
      option_name   : '',
      qty           : Number(c.quantity || 1),
      price         : Number(c.refundAmount || 0),
      status        : '접수' as const,
      return_courier: String(c.returnDeliveryCompany || ''),
      return_invoice: String(c.returnTrackingNumber || ''),
      return_addr   : '',
    }))
  }
}
