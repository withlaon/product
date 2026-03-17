/**
 * 지그재그(카카오스타일/포스티) 커넥터
 * API: https://partner-api.zigzag.kr
 * 인증: Access Key (X-API-KEY) + Secret Key (X-SECRET-KEY) 헤더
 * 확인: 파트너센터 → 내 스토어 정보 관리 → API 인증키 관리
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://partner-api.zigzag.kr/api/v1'

export class ZigzagConnector extends BaseMarketplace {
  readonly mallKey  = 'zigzag'
  readonly mallName = '지그재그'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('지그재그 Access Key 누락 — 카카오스타일 파트너센터 [API 인증키 관리]에서 확인')
    return key
  }

  private get secretKey(): string {
    return this.credentials.api_secret || ''
  }

  private authHeader(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-API-KEY'   : this.apiKey,
      'Content-Type': 'application/json',
    }
    if (this.secretKey) headers['X-SECRET-KEY'] = this.secretKey
    return headers
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await fetch(
      `${BASE_URL}/orders?date_from=${params.start_date || ''}&date_to=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`지그재그 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.order_list || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.order_item_number || ''),
      order_date    : String(o.order_date || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.order_number || ''),
      buyer_name    : String(o.buyer_name || ''),
      buyer_phone   : String(o.buyer_mobile || ''),
      receiver_name : String(o.receiver_name || ''),
      receiver_phone: String(o.receiver_mobile || ''),
      receiver_addr : String(o.shipping_address || ''),
      items         : [{
        product_name: String(o.goods_name || ''),
        option_name : String(o.option_name || ''),
        qty         : Number(o.order_quantity || 1),
        price       : Number(o.order_price || 0),
      }],
      total_price  : Number(o.order_price || 0),
      status       : String(o.order_status || ''),
      courier      : String(o.shipping_company_name || ''),
      invoice_no   : String(o.tracking_number || ''),
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${params.order_id}/shipping`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        shipping_company_code: params.courier_code,
        tracking_number      : params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`지그재그 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(
      `${BASE_URL}/claims?date_from=${params.start_date || ''}&date_to=${params.end_date || ''}`,
      { headers: this.authHeader(), signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) throw new Error(`지그재그 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claim_list || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.claim_number || ''),
      order_id      : String(c.order_number || ''),
      marketplace   : this.mallKey,
      claim_type    : '반품' as const,
      claim_date    : String(c.claim_date || ''),
      reason        : String(c.claim_reason || ''),
      detail        : '',
      buyer_name    : String(c.buyer_name || ''),
      buyer_phone   : String(c.buyer_mobile || ''),
      product_name  : String(c.goods_name || ''),
      option_name   : '',
      qty           : Number(c.quantity || 1),
      price         : Number(c.claim_price || 0),
      status        : '접수' as const,
      return_courier: String(c.return_shipping_company || ''),
      return_invoice: String(c.return_tracking_number || ''),
      return_addr   : '',
    }))
  }

  async cancelOrder(orderId: string): Promise<void> {
    const res = await this.fetch(`${BASE_URL}/orders/${orderId}/cancel`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({}),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`지그재그 취소 처리 오류: ${res.status}`)
  }
}
