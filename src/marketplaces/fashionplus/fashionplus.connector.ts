/**
 * 패션플러스 커넥터
 * API: https://api.fashionplus.co.kr
 * 인증: 거래처코드 (trader_code) + 로그인 ID/PW
 */

import { BaseMarketplace } from '@/marketplaces/base/base.marketplace'
import type {
  UnifiedOrder,
  UnifiedClaim,
  ShippingProfile,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'

const BASE_URL = 'https://api.fashionplus.co.kr/v1'

export class FashionplusConnector extends BaseMarketplace {
  readonly mallKey  = 'fashionplus'
  readonly mallName = '패션플러스'

  private get traderCode(): string {
    const code = this.credentials.api_key
    if (!code) throw new Error('패션플러스 거래처코드 누락 (api_key)')
    return code
  }

  private authBody() {
    return {
      traderCode: this.traderCode,
      loginId   : this.credentials.login_id || '',
      loginPw   : this.credentials.login_pw || '',
    }
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const res = await fetch(`${BASE_URL}/orders`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trader-Code': this.traderCode },
      body   : JSON.stringify({ ...this.authBody(), startDate: params.start_date, endDate: params.end_date }),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`패션플러스 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
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
    const res = await fetch(`${BASE_URL}/shipping/invoice`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trader-Code': this.traderCode },
      body   : JSON.stringify({
        ...this.authBody(),
        ordNo  : params.order_id,
        dlvCmpCd: params.courier_code,
        invcNo : params.invoice_no,
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`패션플러스 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const res = await fetch(`${BASE_URL}/claims`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trader-Code': this.traderCode },
      body   : JSON.stringify({ ...this.authBody(), startDate: params.start_date, endDate: params.end_date }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`패션플러스 클레임 조회 오류: ${res.status}`)
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
      return_courier: String(c.rtrnCmpNm || ''),
      return_invoice: String(c.rtrnInvcNo || ''),
      return_addr   : '',
    }))
  }

  /* 배송 프로필 조회 (패션플러스 특수 기능) */
  async getShippingProfiles(): Promise<ShippingProfile[]> {
    const res = await fetch(`${BASE_URL}/shipping/profiles`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trader-Code': this.traderCode },
      body   : JSON.stringify(this.authBody()),
      signal : AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.profiles || []).map((p: Record<string, unknown>) => ({
      id            : String(p.profileId || ''),
      name          : String(p.profileName || ''),
      delivery_type : (String(p.deliveryType || '무료배송')) as ShippingProfile['delivery_type'],
      fee           : Number(p.deliveryFee || 0),
      free_condition: Number(p.freeConditionAmount || 0),
      return_fee    : Number(p.returnFee || 0),
      exchange_fee  : Number(p.exchangeFee || 0),
      courier       : String(p.courierName || ''),
      warehouse_addr: String(p.warehouseAddress || ''),
      lead_time     : Number(p.leadTime || 1),
    }))
  }
}
