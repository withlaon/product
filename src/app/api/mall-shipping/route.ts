/**
 * /api/mall-shipping
 *
 * 쇼핑몰 송장 전송·배송 관리 API (어댑터 패턴 적용)
 *
 * POST body:
 *   action      : 'send_invoice' | 'bulk_send' | 'get_shipping_profiles' | 'track' | 'bulk_multi_mall'
 *   mall        : 쇼핑몰 키
 *   credentials : 인증 정보
 *   params      : 액션별 파라미터
 */

import { NextRequest, NextResponse } from 'next/server'
import { ShippingService } from '@/services/shipping.service'
import type { Credentials, InvoiceParams } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, mall, credentials = {}, params = {} } = body as {
      action      : string
      mall        : string
      credentials : Credentials
      params      : Record<string, unknown>
    }

    switch (action) {
      case 'send_invoice': {
        const result = await ShippingService.uploadInvoice(mall, credentials, params as unknown as InvoiceParams)
        return NextResponse.json(result)
      }

      case 'bulk_send': {
        const items = (params.items || []) as InvoiceParams[]
        const result = await ShippingService.bulkUploadInvoices(mall, credentials, items)
        return NextResponse.json(result)
      }

      case 'get_shipping_profiles': {
        const profiles = await ShippingService.getShippingProfiles(mall, credentials)
        return NextResponse.json({ success: true, profiles })
      }

      case 'track': {
        const { courier_code, invoice_no } = params as { courier_code: string; invoice_no: string }
        const result = await ShippingService.trackDelivery(courier_code, invoice_no)
        return NextResponse.json({ success: true, ...result })
      }

      case 'bulk_multi_mall': {
        const invoices = (params.invoices || []) as Array<{
          mallKey: string; credentials: Credentials; params: InvoiceParams
        }>
        const results = await ShippingService.bulkUploadMultiMall(invoices)
        return NextResponse.json({ success: true, results, total: results.length })
      }

      default:
        return NextResponse.json({ success: false, message: `알 수 없는 action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
