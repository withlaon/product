/**
 * 하프클럽 커넥터
 * API: https://openapi.halfclub.com
 * 인증: 거래처코드 (trader_code) / API Key
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://openapi.halfclub.com/api/v1'

export class HalfclubConnector extends BaseMarketplace {
  readonly mallKey  = 'halfclub'
  readonly mallName = '하프클럽'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('하프클럽 API Key 누락')
    return key
  }

  private authHeader() {
    return {
      'X-Api-Key'      : this.apiKey,
      'X-Trader-Code'  : this.credentials.trader_code || '',
      'Content-Type'   : 'application/json',
    }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await fetch(
      `${BASE_URL}/orders?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`하프클럽 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orderList || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.ordNo || ''),
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
        price       : Number(o.selAmt || 0),
      }],
      total_price  : Number(o.selAmt || 0),
      status       : String(o.ordStatNm || ''),
      courier      : String(o.dlvCmpNm || ''),
      invoice_no   : String(o.invcNo || ''),
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await fetch(`${BASE_URL}/orders/${params.order_id}/delivery`, {
      method : 'PUT',
      headers: this.authHeader(),
      body   : JSON.stringify({ dlvCmpCd: params.courier_code, invcNo: params.invoice_no }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`하프클럽 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(
      `${BASE_URL}/claims?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`하프클럽 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claimList || []).map((c: Record<string, unknown>) => ({
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
