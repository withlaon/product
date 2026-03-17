/**
 * 상품 서비스 레이어
 * 어댑터를 통해 각 쇼핑몰 상품 API를 통합 처리합니다.
 */

import { createAdapter } from '@/marketplaces'
import type { Credentials, UnifiedProduct } from '@/adapters/marketplace.adapter'
import { NotImplementedError } from '@/marketplaces/base/base.marketplace'

export class ProductService {
  /**
   * 쇼핑몰에 상품 등록
   */
  static async create(
    mallKey: string,
    credentials: Credentials,
    product: UnifiedProduct,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    const result  = await adapter.createProduct(product)
    return { success: true, mall: mallKey, ...result }
  }

  /**
   * 쇼핑몰 상품 수정
   */
  static async update(
    mallKey: string,
    credentials: Credentials,
    mallProductId: string,
    product: Partial<UnifiedProduct>,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.updateProduct(mallProductId, product)
    return { success: true, mall: mallKey, mall_product_id: mallProductId }
  }

  /**
   * 쇼핑몰 상품 삭제
   */
  static async delete(
    mallKey: string,
    credentials: Credentials,
    mallProductId: string,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.deleteProduct(mallProductId)
    return { success: true, mall: mallKey, mall_product_id: mallProductId }
  }

  /**
   * 재고 수정
   */
  static async updateStock(
    mallKey: string,
    credentials: Credentials,
    mallProductId: string,
    stock: number,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.updateStock(mallProductId, stock)
    return { success: true, mall: mallKey, stock }
  }

  /**
   * 가격 수정
   */
  static async updatePrice(
    mallKey: string,
    credentials: Credentials,
    mallProductId: string,
    price: number,
  ) {
    const adapter = createAdapter(mallKey, credentials)
    await adapter.updatePrice(mallProductId, price)
    return { success: true, mall: mallKey, price }
  }

  /**
   * 여러 쇼핑몰에 동시 등록 (멀티채널 발송)
   */
  static async bulkCreate(
    targets: Array<{ mallKey: string; credentials: Credentials; categoryId: string }>,
    product: UnifiedProduct,
  ) {
    const results = await Promise.allSettled(
      targets.map(async ({ mallKey, credentials, categoryId }) => {
        const adapter = createAdapter(mallKey, credentials)
        const result  = await adapter.createProduct({ ...product, category_id: categoryId, marketplace: mallKey })
        return { mall: mallKey, ...result }
      })
    )
    return results.map((r, i) => ({
      mall   : targets[i].mallKey,
      success: r.status === 'fulfilled',
      mall_product_id: r.status === 'fulfilled' ? r.value.mall_product_id : undefined,
      error  : r.status === 'rejected'
        ? (r.reason instanceof NotImplementedError ? r.reason.message : String(r.reason))
        : undefined,
    }))
  }
}
