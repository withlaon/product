/**
 * /api/mall-products
 *
 * 쇼핑몰 상품 관리 API (어댑터 패턴 적용)
 *
 * POST body:
 *   action      : 'register' | 'update' | 'delete' | 'update_stock' | 'update_price' | 'bulk_register'
 *   mall        : 쇼핑몰 키 (단일 발송)
 *   credentials : 인증 정보
 *   product     : 상품 데이터
 *   targets     : bulk_register 시 [{ mallKey, credentials, categoryId }]
 */

import { NextRequest, NextResponse } from 'next/server'
import { ProductService } from '@/services/product.service'
import type { UnifiedProduct, Credentials } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, product, params = {}, targets } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      product     : UnifiedProduct
      params      : Record<string, string | number>
      targets     : Array<{ mallKey: string; credentials: Credentials; categoryId: string }>
    }

    switch (action) {
      case 'register': {
        const result = await ProductService.create(mall, credentials, product)
        return NextResponse.json(result)
      }

      case 'update': {
        const result = await ProductService.update(mall, credentials, String(params.mall_product_id || ''), product)
        return NextResponse.json(result)
      }

      case 'delete': {
        const result = await ProductService.delete(mall, credentials, String(params.mall_product_id || ''))
        return NextResponse.json(result)
      }

      case 'update_stock': {
        const result = await ProductService.updateStock(mall, credentials, String(params.mall_product_id || ''), Number(params.stock))
        return NextResponse.json(result)
      }

      case 'update_price': {
        const result = await ProductService.updatePrice(mall, credentials, String(params.mall_product_id || ''), Number(params.price))
        return NextResponse.json(result)
      }

      case 'bulk_register': {
        const results = await ProductService.bulkCreate(targets || [], product)
        const success = results.filter(r => r.success).length
        return NextResponse.json({ success: true, results, total: results.length, registered: success, failed: results.length - success })
      }

      default:
        return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
