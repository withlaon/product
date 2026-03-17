/**
 * 11번가 Open API 커넥터
 * API: https://openapi.11st.co.kr
 * 인증: API Key (헤더 또는 쿼리 파라미터)
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

const BASE_URL = 'https://openapi.11st.co.kr/openapi/OpenApiService.tmall'

export class ElevenStConnector extends BaseMarketplace {
  readonly mallKey  = '11st'
  readonly mallName = '11번가'

  private get apiKey(): string {
    const key = this.credentials.api_key
    if (!key) throw new Error('11번가 API 인증키 누락')
    return key
  }

  private buildUrl(service: string, method: string, extra = ''): string {
    return `${BASE_URL}?key=${this.apiKey}&serviceName=${service}&version=2&method=${method}${extra}`
  }

  /** 11번가 XML 응답에서 태그 값 추출 */
  private extractXml(xml: string, tag: string): string[] {
    const results: string[] = []
    const re = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g')
    let m
    while ((m = re.exec(xml)) !== null) results.push(m[1])
    return results
  }

  /* ─── 상품 관리 ─────────────────────────────────────────────── */
  async createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    const body = [
      '<product>',
      `<prdNm>${product.name}</prdNm>`,
      `<dispCtgrNo>${product.category_id}</dispCtgrNo>`,
      `<selPrc>${product.sale_price}</selPrc>`,
      `<qty>${product.stock}</qty>`,
      `<brandNm>${product.brand || ''}</brandNm>`,
      '</product>',
    ].join('')
    const res = await fetch(this.buildUrl('ProductService', 'insertProduct'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`11번가 상품 등록 오류: ${res.status}`)
    const text = await res.text()
    const prdNos = this.extractXml(text, 'prdNo')
    return { mall_product_id: prdNos[0] || '' }
  }

  async updateProduct(mallProductId: string, product: Partial<UnifiedProduct>): Promise<void> {
    const fields: string[] = [`<prdNo>${mallProductId}</prdNo>`]
    if (product.name)       fields.push(`<prdNm>${product.name}</prdNm>`)
    if (product.sale_price) fields.push(`<selPrc>${product.sale_price}</selPrc>`)
    if (product.stock)      fields.push(`<qty>${product.stock}</qty>`)
    const body = `<product>${fields.join('')}</product>`
    const res = await fetch(this.buildUrl('ProductService', 'updateProduct'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`11번가 상품 수정 오류: ${res.status}`)
  }

  async deleteProduct(mallProductId: string): Promise<void> {
    const body = `<product><prdNo>${mallProductId}</prdNo><prdStatCd>3</prdStatCd></product>`
    const res = await fetch(this.buildUrl('ProductService', 'updateProductStatus'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`11번가 상품 삭제 오류: ${res.status}`)
  }

  async updateStock(mallProductId: string, stock: number): Promise<void> {
    await this.updateProduct(mallProductId, { stock })
  }

  async updatePrice(mallProductId: string, price: number): Promise<void> {
    await this.updateProduct(mallProductId, { sale_price: price })
  }

  /* ─── 주문 수집 ─────────────────────────────────────────────── */
  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const startDate = (params.start_date || '').replace(/-/g, '')
    const endDate   = (params.end_date   || '').replace(/-/g, '')
    const url = this.buildUrl('OrderService', 'getOrderList', `&orderStatus=BF&startDate=${startDate}&endDate=${endDate}`)
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`11번가 주문 조회 오류: ${res.status}`)
    const text = await res.text()

    const orders: UnifiedOrder[] = []
    const ordNos = this.extractXml(text, 'ordNo')
    const prdNms = this.extractXml(text, 'prdNm')
    const buyNms = this.extractXml(text, 'buyNm')
    const ordDts = this.extractXml(text, 'ordDt')
    const rcvrNms= this.extractXml(text, 'rcvrNm')
    const rcvrHps= this.extractXml(text, 'rcvrHp')
    const rcvrAds= this.extractXml(text, 'rcvrAddr')
    const qtys   = this.extractXml(text, 'prdQty')
    const prcs   = this.extractXml(text, 'selPrc')

    for (let i = 0; i < ordNos.length; i++) {
      orders.push({
        order_id      : ordNos[i],
        order_date    : ordDts[i] || '',
        marketplace   : this.mallKey,
        mall_order_no : ordNos[i],
        buyer_name    : buyNms[i] || '',
        buyer_phone   : '',
        receiver_name : rcvrNms[i] || '',
        receiver_phone: rcvrHps[i] || '',
        receiver_addr : rcvrAds[i] || '',
        items         : [{
          product_name: prdNms[i] || '',
          option_name : '',
          qty         : Number(qtys[i] || 1),
          price       : Number(prcs[i] || 0),
        }],
        total_price  : Number(prcs[i] || 0),
        status       : '결제완료',
        courier      : '',
        invoice_no   : '',
      })
    }
    return orders
  }

  /* ─── 송장 전송 ─────────────────────────────────────────────── */
  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const body = [
      '<order>',
      `<ordNo>${params.order_id}</ordNo>`,
      `<dlvMthdCd>05</dlvMthdCd>`,
      `<dlvNm>${params.courier_code}</dlvNm>`,
      `<invcNo>${params.invoice_no}</invcNo>`,
      '</order>',
    ].join('')
    const res = await fetch(this.buildUrl('OrderService', 'updateDeliveryInfo'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`11번가 송장 전송 오류: ${res.status}`)
  }

  /* ─── CS / 클레임 ───────────────────────────────────────────── */
  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const startDate = (params.start_date || '').replace(/-/g, '')
    const endDate   = (params.end_date   || '').replace(/-/g, '')
    const url = this.buildUrl('ClaimService', 'getClaimList', `&startDate=${startDate}&endDate=${endDate}`)
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`11번가 클레임 조회 오류: ${res.status}`)
    const text = await res.text()

    const claims: UnifiedClaim[] = []
    const clmNos  = this.extractXml(text, 'clmNo')
    const ordNos  = this.extractXml(text, 'ordNo')
    const clmTps  = this.extractXml(text, 'clmTpCd')
    const reasons = this.extractXml(text, 'clmResn')
    const prdNms  = this.extractXml(text, 'prdNm')
    const buyNms  = this.extractXml(text, 'buyNm')

    const typeMap: Record<string, UnifiedClaim['claim_type']> = {
      '1': '취소', '2': '반품', '3': '교환',
    }

    for (let i = 0; i < clmNos.length; i++) {
      claims.push({
        claim_id      : clmNos[i],
        order_id      : ordNos[i] || '',
        marketplace   : this.mallKey,
        claim_type    : typeMap[clmTps[i]] || '반품',
        claim_date    : '',
        reason        : reasons[i] || '',
        detail        : '',
        buyer_name    : buyNms[i] || '',
        buyer_phone   : '',
        product_name  : prdNms[i] || '',
        option_name   : '',
        qty           : 1,
        price         : 0,
        status        : '접수',
        return_courier: '',
        return_invoice: '',
        return_addr   : '',
      })
    }
    return claims
  }

  async cancelOrder(orderId: string): Promise<void> {
    const body = `<order><ordNo>${orderId}</ordNo></order>`
    const res = await fetch(this.buildUrl('OrderService', 'cancelOrder'), {
      method : 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body,
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`11번가 취소 처리 오류: ${res.status}`)
  }
}
