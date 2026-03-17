/**
 * 옥션 커넥터
 *
 * ⚠️ 중요: ESM(옥션/G마켓) API는 공식 파트너 셀링툴 업체에게만 개방됩니다.
 *    개인/소규모 프로그램은 직접 API 연동이 불가하며,
 *    현재는 로그인 정보를 저장하는 방식으로만 지원됩니다.
 *
 * 향후 지원 예정:
 *   - ESM PLUS 웹 자동화 (Puppeteer/Playwright 기반 주문 수집)
 *   - 공식 셀링툴 API 중계 방식 (플레이오토, 셀로 등)
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

  private notSupported(method: string): never {
    throw new Error(
      `옥션 ${method}: ESM 직접 API는 공식 파트너 셀링툴만 사용 가능합니다. ` +
      `ESM PLUS(esmplus.com)에서 셀링툴 업체를 선택하거나 웹 자동화 방식을 사용하세요.`
    )
  }

  async getOrders(_params: OrderQueryParams): Promise<UnifiedOrder[]> {
    // ESM API 직접 호출 불가 — 로그인 정보만 저장된 상태
    // 향후 웹 자동화(Puppeteer) 방식으로 구현 예정
    const loginId = this.credentials.login_id
    if (!loginId) throw new Error('옥션 ESM PLUS ID가 입력되지 않았습니다.')
    // 현재는 빈 배열 반환 (웹 자동화 구현 전)
    return []
  }

  async createProduct(_product: UnifiedProduct): Promise<{ mall_product_id: string }> {
    this.notSupported('상품 등록')
  }

  async updateProduct(_mallProductId: string, _product: Partial<UnifiedProduct>): Promise<void> {
    this.notSupported('상품 수정')
  }

  async deleteProduct(_mallProductId: string): Promise<void> {
    this.notSupported('상품 삭제')
  }

  async updateStock(_mallProductId: string, _stock: number): Promise<void> {
    this.notSupported('재고 수정')
  }

  async updatePrice(_mallProductId: string, _price: number): Promise<void> {
    this.notSupported('가격 수정')
  }

  async uploadInvoice(_params: InvoiceParams): Promise<void> {
    this.notSupported('송장 전송')
  }

  async getClaims(_params: ClaimQueryParams): Promise<UnifiedClaim[]> {
    this.notSupported('클레임 조회')
  }
}
