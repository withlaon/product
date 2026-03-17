/**
 * 토스쇼핑 커넥터
 * API: https://api.shopping.toss.im
 * 인증: API Key (X-Toss-Shopping-API-Key 헤더)
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.shopping.toss.im/v1'

export class TossshoppingConnector extends BaseMarketplace {
  readonly mallKey  = 'tosshopping'
  readonly mallName = '토스쇼핑'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('토스쇼핑 API Key 누락')
    return key
  }

  private authHeader() {
    return { 'X-Toss-Shopping-API-Key': this.apiKey, 'Content-Type': 'application/json' }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await fetch(
      `${BASE_URL}/orders?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`토스쇼핑 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.orderItemId || ''),
      order_date    : String(o.orderedAt || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.orderId || ''),
      buyer_name    : String(o.buyerName || ''),
      buyer_phone   : String(o.buyerPhone || ''),
      receiver_name : String(o.shippingName || ''),
      receiver_phone: String(o.shippingPhone || ''),
      receiver_addr : String(o.shippingAddress || ''),
      items         : [{
        product_name: String(o.productName || ''),
        option_name : String(o.optionName || ''),
        qty         : Number(o.quantity || 1),
        price       : Number(o.itemPrice || 0),
      }],
      total_price  : Number(o.totalPrice || 0),
      status       : String(o.status || ''),
      courier      : '',
      invoice_no   : '',
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${params.order_id}/shipment`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        courierCode   : params.courier_code,
        trackingNumber: params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`토스쇼핑 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(
      `${BASE_URL}/claims?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`토스쇼핑 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claims || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.claimId || ''),
      order_id      : String(c.orderId || ''),
      marketplace   : this.mallKey,
      claim_type    : '반품' as const,
      claim_date    : String(c.createdAt || ''),
      reason        : String(c.reason || ''),
      detail        : '',
      buyer_name    : String(c.buyerName || ''),
      buyer_phone   : '',
      product_name  : String(c.productName || ''),
      option_name   : '',
      qty           : Number(c.quantity || 1),
      price         : Number(c.refundAmount || 0),
      status        : '접수' as const,
      return_courier: '',
      return_invoice: '',
      return_addr   : '',
    }))
  }
}
