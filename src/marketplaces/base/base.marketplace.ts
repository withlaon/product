/**
 * 모든 쇼핑몰 커넥터의 기반 추상 클래스
 * 미구현 메서드는 NotImplementedError를 throw합니다.
 *
 * 모든 외부 API 호출은 proxyFetch를 통해 Fixie 고정 IP로 발신됩니다.
 */

import type {
  IMarketplaceAdapter,
  Credentials,
  UnifiedProduct,
  UnifiedOrder,
  UnifiedClaim,
  ShippingProfile,
  OrderQueryParams,
  ClaimQueryParams,
  InvoiceParams,
} from '@/adapters/marketplace.adapter'
import { proxyFetch } from '@/lib/proxy-fetch'

export class NotImplementedError extends Error {
  constructor(mallName: string, method: string) {
    super(`[${mallName}] ${method} 기능은 아직 구현되지 않았습니다.`)
    this.name = 'NotImplementedError'
  }
}

export abstract class BaseMarketplace implements IMarketplaceAdapter {
  abstract readonly mallKey  : string
  abstract readonly mallName : string

  protected credentials: Credentials = {}

  /** Fixie 고정 IP를 통한 fetch (FIXIE_URL 미설정 시 기본 fetch) */
  protected fetch = proxyFetch

  connect(credentials: Credentials): void {
    this.credentials = credentials
  }

  protected notImplemented(method: string): never {
    throw new NotImplementedError(this.mallName, method)
  }

  /* 기본 미구현 메서드 – 각 커넥터에서 override */
  async createProduct(_product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    return this.notImplemented('상품 등록')
  }
  async updateProduct(_mallProductId: string, _product: Partial<UnifiedProduct>): Promise<void> {
    return this.notImplemented('상품 수정')
  }
  async deleteProduct(_mallProductId: string): Promise<void> {
    return this.notImplemented('상품 삭제')
  }
  async updateStock(_mallProductId: string, _stock: number): Promise<void> {
    return this.notImplemented('재고 수정')
  }
  async updatePrice(_mallProductId: string, _price: number): Promise<void> {
    return this.notImplemented('가격 수정')
  }
  async getOrders(_params: OrderQueryParams): Promise<UnifiedOrder[]> {
    return this.notImplemented('주문 수집')
  }
  async uploadInvoice(_params: InvoiceParams): Promise<void> {
    return this.notImplemented('송장 전송')
  }
  async bulkUploadInvoices(items: InvoiceParams[]): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(items.map(item => this.uploadInvoice(item)))
    const success = results.filter(r => r.status === 'fulfilled').length
    return { success, failed: items.length - success }
  }
  async getClaims(_params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    return this.notImplemented('클레임 수집')
  }
  async cancelOrder(_orderId: string, _reason?: string): Promise<void> {
    return this.notImplemented('주문 취소')
  }
  async approveReturn(_claimId: string): Promise<void> {
    return this.notImplemented('반품 승인')
  }
  async approveExchange(_claimId: string): Promise<void> {
    return this.notImplemented('교환 승인')
  }
  async rejectClaim(_claimId: string, _reason?: string): Promise<void> {
    return this.notImplemented('클레임 거부')
  }
  async getShippingProfiles(): Promise<ShippingProfile[]> {
    return this.notImplemented('배송 프로필 조회')
  }
}
