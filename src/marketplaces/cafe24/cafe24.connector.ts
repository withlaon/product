/**
 * Cafe24 커넥터
 * API: https://{mall_id}.cafe24api.com
 * 인증: OAuth2 (mall_id / client_id / client_secret / access_token)
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

export class Cafe24Connector extends BaseMarketplace {
  readonly mallKey  = 'cafe24'
  readonly mallName = 'Cafe24'

  private get baseUrl(): string {
    const mallId = this.credentials.mall_id
    if (!mallId) throw new Error('Cafe24 쇼핑몰 ID 누락 (mall_id)')
    return `https://${mallId}.cafe24api.com/api/v2`
  }

  private get accessToken(): string {
    const token = this.credentials.access_token
    if (!token) throw new Error('Cafe24 Access Token 누락')
    return token
  }

  private authHeader() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type' : 'application/json',
      'X-Cafe24-Api-Version': '2024-03-01',
    }
  }

  async createProduct(product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    const res = await this.fetch(`${this.baseUrl}/products`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        request: {
          product_name    : product.name,
          price           : product.sale_price,
          stock_quantity  : product.stock,
          category_no     : [Number(product.category_id)],
          description     : product.detail_html,
        },
      }),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Cafe24 상품 등록 오류: ${res.status}`)
    const data = await res.json()
    return { mall_product_id: String(data.product?.product_no || '') }
  }

  async updateProduct(mallProductId: string, product: Partial<UnifiedProduct>): Promise<void> {
    const body: Record<string, unknown> = {}
    if (product.name)       body.product_name = product.name
    if (product.sale_price) body.price = product.sale_price
    if (product.stock)      body.stock_quantity = product.stock
    const res = await this.fetch(`${this.baseUrl}/products/${mallProductId}`, {
      method : 'PUT',
      headers: this.authHeader(),
      body   : JSON.stringify({ request: body }),
      signal : AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Cafe24 상품 수정 오류: ${res.status}`)
  }

  async deleteProduct(mallProductId: string): Promise<void> {
    const res = await this.fetch(`${this.baseUrl}/products/${mallProductId}`, {
      method : 'DELETE',
      headers: this.authHeader(),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Cafe24 상품 삭제 오류: ${res.status}`)
  }

  async updateStock(mallProductId: string, stock: number): Promise<void> {
    await this.updateProduct(mallProductId, { stock })
  }

  async updatePrice(mallProductId: string, price: number): Promise<void> {
    await this.updateProduct(mallProductId, { sale_price: price })
  }

  async getOrders(params: OrderQueryParams): Promise<UnifiedOrder[]> {
    const startDate = (params.start_date || '').split('T')[0]
    const endDate   = (params.end_date   || '').split('T')[0]
    const url = `${this.baseUrl}/orders`
      + `?start_date=${startDate}&end_date=${endDate}`
      + `&order_status=N30&embed=items&limit=${params.limit || 100}`
    const res = await this.fetch(url, { headers: this.authHeader(), signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`Cafe24 주문 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.orders || []).map((o: Record<string, unknown>) => ({
      order_id      : String(o.order_id || ''),
      order_date    : String(o.order_date || ''),
      marketplace   : this.mallKey,
      mall_order_no : String(o.order_id || ''),
      buyer_name    : String(o.buyer_name || ''),
      buyer_phone   : String(o.buyer_phone || ''),
      receiver_name : String(o.receiver_name || ''),
      receiver_phone: String(o.receiver_phone || ''),
      receiver_addr : `${o.receiver_address1 || ''} ${o.receiver_address2 || ''}`.trim(),
      receiver_zip  : String(o.receiver_zipcode || ''),
      items         : (o.items as Record<string, unknown>[] || []).map(i => ({
        product_name: String(i.product_name || ''),
        option_name : String(i.option_value || ''),
        qty         : Number(i.quantity || 1),
        price       : Number(i.price || 0),
      })),
      total_price  : Number(o.total_price || 0),
      status       : String(o.order_status || ''),
      courier      : String(o.carrier_id || ''),
      invoice_no   : String(o.tracking_no || ''),
    }))
  }

  async uploadInvoice(params: InvoiceParams): Promise<void> {
    const res = await this.fetch(`${this.baseUrl}/orders/${params.order_id}/shipments`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({
        request: {
          carrier_id  : params.courier_code,
          tracking_no : params.invoice_no,
        },
      }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Cafe24 송장 전송 오류: ${res.status}`)
  }

  async getClaims(params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    const url = `${this.baseUrl}/cancels?start_date=${params.start_date || ''}&end_date=${params.end_date || ''}`
    const res = await fetch(url, { headers: this.authHeader(), signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`Cafe24 클레임 조회 오류: ${res.status}`)
    const data = await res.json()
    return (data.cancels || []).map((c: Record<string, unknown>) => ({
      claim_id      : String(c.claim_code || ''),
      order_id      : String(c.order_id || ''),
      marketplace   : this.mallKey,
      claim_type    : '취소' as const,
      claim_date    : String(c.created_date || ''),
      reason        : String(c.reason_detail || ''),
      detail        : '',
      buyer_name    : String(c.buyer_name || ''),
      buyer_phone   : '',
      product_name  : String(c.product_name || ''),
      option_name   : '',
      qty           : Number(c.quantity || 1),
      price         : Number(c.cancel_price || 0),
      status        : '접수' as const,
      return_courier: '',
      return_invoice: '',
      return_addr   : '',
    }))
  }

  async cancelOrder(orderId: string, reason?: string): Promise<void> {
    const res = await this.fetch(`${this.baseUrl}/orders/${orderId}/cancels`, {
      method : 'POST',
      headers: this.authHeader(),
      body   : JSON.stringify({ request: { reason: reason || '' } }),
      signal : AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Cafe24 주문 취소 오류: ${res.status}`)
  }
}
