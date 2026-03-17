/**
 * SSG닷컴 커넥터
 * API: https://api.ssg.com/openapi
 * 인증: API Key
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.ssg.com/openapi/v1'

export class SsgConnector extends BaseMarketplace {
  readonly mallKey  = 'ssg'
  readonly mallName = 'SSG닷컴'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('SSG닷컴 API Key 누락')
    return key
  }

  private authHeader() {
    return { 'Authorization': `ApiKey ${this.apiKey}`, 'Content-Type': 'application/json' }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await this.fetch(
      `${BASE_URL}/orders?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}&pageSize=${params.limit || 100}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`SSG닷컴 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.ordItemNo || ''),
      order_date    : String(o.ordDt || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.ordNo || ''),
      buyer_name    : String(o.buyerNm || ''),
      buyer_phone   : String(o.buyerHp || ''),
      receiver_name : String(o.rcvrNm || ''),
      receiver_phone: String(o.rcvrHp || ''),
      receiver_addr : String(o.rcvrAddr || ''),
      items         : [{
        product_name: String(o.prdNm || ''),
        option_name : String(o.optNm || ''),
        qty         : Number(o.ordQty || 1),
        price       : Number(o.saleAmt || 0),
      }],
      total_price  : Number(o.saleAmt || 0),
      status       : String(o.ordStatNm || ''),
      courier      : String(o.dlvCmpNm || ''),
      invoice_no   : String(o.invcNo || ''),
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${params.order_id}/shipping`, {
      method : 'PUT',
      headers: this.authHeader(),
      body   : JSON.stringify({ dlvCmpCd: params.courier_code, invcNo: params.invoice_no }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`SSG닷컴 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(
      `${BASE_URL}/claims?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`SSG닷컴 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claims || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.clmNo || ''),
      order_id      : String(c.ordNo || ''),
      marketplace   : this.mallKey,
      claim_type    : '반품' as const,
      claim_date    : String(c.clmDt || ''),
      reason        : String(c.clmResn || ''),
      detail        : '',
      buyer_name    : String(c.buyerNm || ''),
      buyer_phone   : '',
      product_name  : String(c.prdNm || ''),
      option_name   : '',
      qty           : Number(c.clmQty || 1),
      price         : Number(c.rfndAmt || 0),
      status        : '접수' as const,
      return_courier: '',
      return_invoice: '',
      return_addr   : '',
    }))
  }
}
