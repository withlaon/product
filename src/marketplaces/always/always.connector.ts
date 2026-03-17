/**
 * ???? ???
 * API: https://api.always.kr/openapi
 * ??: API Key (?? ??? api_key ?? login_id ??)
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.always.kr/openapi/v1'

export class AlwaysConnector extends BaseMarketplace {
  readonly mallKey  = 'always'
  readonly mallName = '????'

  private get apiKey(): string {
    // ?? ???? api_key ?? login_id ? ??? ? ??
    const key = this.credentials.api_key || this.credentials.login_id
    if (!key) throw new Error('???? API Key ??')
    return key
  }

  private authHeader() {
    return { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await this.fetch(
      `${BASE_URL}/orders?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`???? ?? ?? ??: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.orderItemId || ''),
      order_date    : String(o.orderedAt || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.orderId || ''),
      buyer_name    : String(o.buyerName || ''),
      buyer_phone   : String(o.buyerPhone || ''),
      receiver_name : String(o.receiverName || ''),
      receiver_phone: String(o.receiverPhone || ''),
      receiver_addr : String(o.receiverAddress || ''),
      items         : [{
        product_name: String(o.productName || ''),
        option_name : String(o.optionText || ''),
        qty         : Number(o.count || 1),
        price       : Number(o.sellPrice || 0),
      }],
      total_price  : Number(o.sellPrice || 0),
      status       : String(o.orderStatus || ''),
      courier      : '',
      invoice_no   : '',
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${params.order_id}/shipping`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        courier      : params.courier_code,
        invoiceNumber: params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`???? ?? ?? ??: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await this.fetch(
      `${BASE_URL}/claims?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`???? ??? ?? ??: ${res.status}`)
    const data = await res.json()
    return (data.claims || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.claimId || ''),
      order_id      : String(c.orderId || ''),
      marketplace   : this.mallKey,
      claim_type    : '??' as const,
      claim_date    : String(c.createdAt || ''),
      reason        : String(c.reason || ''),
      detail        : '',
      buyer_name    : String(c.buyerName || ''),
      buyer_phone   : '',
      product_name  : String(c.productName || ''),
      option_name   : '',
      qty           : Number(c.quantity || 1),
      price         : Number(c.amount || 0),
      status        : '??' as const,
      return_courier: '',
      return_invoice: '',
      return_addr   : '',
    }))
  }
}
