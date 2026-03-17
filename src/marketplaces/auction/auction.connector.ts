/**
 * 옥션 커넥터
 * API: G마켓과 동일한 ESM+ API 사용 (api.auction.co.kr)
 * 인증: ESM+ 판매자 계정
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedProduct,
  UnifiedOrder,
  UnifiedClaim,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

export class AuctionConnector extends BaseMarketplace {
  readonly mallKey  = 'auction'
  readonly mallName = '옥션'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('옥션 API 인증키 누락')
    return key
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const url = `https://api.auction.co.kr/order/v1/orders`
      + `?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`옥션 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.ordNo || ''),
      order_date    : String(o.ordDt || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.ordNo || ''),
      buyer_name    : String(o.buyNm || ''),
      buyer_phone   : String(o.buyHp || ''),
      receiver_name : String(o.rcvrNm || ''),
      receiver_phone: String(o.rcvrHp || ''),
      receiver_addr : String(o.rcvrAddr || ''),
      items         : [{
        product_name: String(o.prdNm || ''),
        option_name : String(o.optNm || ''),
        qty         : Number(o.qty || 1),
        price       : Number(o.prc || 0),
      }],
      total_price  : Number(o.prc || 0),
      status       : String(o.ordStatNm || ''),
      courier      : String(o.dlvCmpNm || ''),
      invoice_no   : String(o.invcNo || ''),
    }))
  }

  async createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    const res = await fetch('https://api.auction.co.kr/product/v1/products', {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        prdNm : product.name,
        ctgrNo: product.category_id,
        selPrc: product.sale_price,
        qty   : product.stock,
      }),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`옥션 상품 등록 오류: ${res.status}`)
    const data = await res.json()
    return { mall_product_id: String(data.prdNo || '') }
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await fetch(`https://api.auction.co.kr/order/v1/orders/${params.order_id}/shipping`, {
      method : 'PUT',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({ dlvCmpCd: params.courier_code, invcNo: params.invoice_no }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`옥션 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const url = `https://api.auction.co.kr/claim/v1/claims`
      + `?startDate=${params.start_date || ''}&endDate=${params.end_date || ''}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`옥션 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.claims || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.clmNo || ''),
      order_id      : String(c.ordNo || ''),
      marketplace   : this.mallKey,
      claim_type    : '반품' as const,
      claim_date    : String(c.clmDt || ''),
      reason        : String(c.clmResn || ''),
      detail        : '',
      buyer_name    : String(c.buyNm || ''),
      buyer_phone   : '',
      product_name  : String(c.prdNm || ''),
      option_name   : '',
      qty           : Number(c.qty || 1),
      price         : Number(c.prc || 0),
      status        : '접수' as const,
      return_courier: '',
      return_invoice: '',
      return_addr   : '',
    }))
  }
}
