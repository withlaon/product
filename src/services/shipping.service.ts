/**
 * 배송/송장 서비스 레이어
 */

import { createAdapter } from '@/marketplaces'
import type { Credentials, InvoiceParams, ShippingProfile } from '@/adapters/marketplace.adapter'

/** 택배사 코드 표준화 (쇼핑몰별 코드 통일) */
export const COURIER_CODES: Record<string, { name: string; codes: Record<string, string> }> = {
  CJ대한통운: {
    name : 'CJ대한통운',
    codes: { smartstore: 'CJ대한통운', coupang: '04', '11st': 'CJ대한통운', gmarket: '04', auction: '04', lotteon: '04', ssg: '04' },
  },
  한진택배: {
    name : '한진택배',
    codes: { smartstore: '한진택배', coupang: '05', '11st': '한진택배', gmarket: '05', lotteon: '05' },
  },
  롯데택배: {
    name : '롯데택배',
    codes: { smartstore: '롯데택배', coupang: '08', '11st': '롯데택배', gmarket: '06', lotteon: '08' },
  },
  로젠택배: {
    name : '로젠택배',
    codes: { smartstore: '로젠택배', coupang: '06', '11st': '로젠택배', gmarket: '07', lotteon: '06' },
  },
  우체국택배: {
    name : '우체국택배',
    codes: { smartstore: '우체국택배', coupang: '01', '11st': '우체국택배', gmarket: '01', lotteon: '01' },
  },
  경동택배: {
    name : '경동택배',
    codes: { smartstore: '경동택배', coupang: '23', '11st': '경동택배', gmarket: '23' },
  },
  대신택배: {
    name : '대신택배',
    codes: { smartstore: '대신택배', coupang: '22', '11st': '대신택배' },
  },
}

/** 쇼핑몰에 맞는 택배사 코드 변환 */
export function getCourierCode(courierName: string, mallKey: string): string {
  const courier = COURIER_CODES[courierName]
  if (!courier) return courierName
  return courier.codes[mallKey] || courierName
}

export class ShippingService {
  /**
   * 단일 송장 전송
   */
  static async uploadInvoice(
    mallKey    : string,
    credentials: Credentials,
    params     : InvoiceParams,
  ) {
    const adapter     = createAdapter(mallKey, credentials)
    const courierCode = getCourierCode(params.courier_code, mallKey)
    await adapter.uploadInvoice({ ...params, courier_code: courierCode })
    return { success: true, mall: mallKey, order_id: params.order_id }
  }

  /**
   * 대량 송장 전송
   */
  static async bulkUploadInvoices(
    mallKey    : string,
    credentials: Credentials,
    items      : InvoiceParams[],
  ) {
    const adapter  = createAdapter(mallKey, credentials)
    const mapped   = items.map(item => ({
      ...item,
      courier_code: getCourierCode(item.courier_code, mallKey),
    }))
    const result   = await adapter.bulkUploadInvoices(mapped)
    return { success: true, mall: mallKey, successCount: result.success, failed: result.failed, total: items.length }
  }

  /**
   * 여러 쇼핑몰 동시 송장 전송 (한 번에 여러 채널)
   */
  static async bulkUploadMultiMall(
    invoices: Array<{ mallKey: string; credentials: Credentials; params: InvoiceParams }>
  ) {
    const results = await Promise.allSettled(
      invoices.map(({ mallKey, credentials, params }) =>
        ShippingService.uploadInvoice(mallKey, credentials, params)
      )
    )
    return results.map((r, i) => ({
      mall    : invoices[i].mallKey,
      order_id: invoices[i].params.order_id,
      success : r.status === 'fulfilled',
      error   : r.status === 'rejected' ? String(r.reason) : undefined,
    }))
  }

  /**
   * 배송 프로필 조회
   */
  static async getShippingProfiles(
    mallKey    : string,
    credentials: Credentials,
  ): Promise<ShippingProfile[]> {
    const adapter = createAdapter(mallKey, credentials)
    if (!adapter.getShippingProfiles) return []
    return await adapter.getShippingProfiles()
  }

  /**
   * 배송 추적 (스윗트래커 API 활용)
   */
  static async trackDelivery(courierCode: string, invoiceNo: string) {
    const SWEETTRACKER_API_KEY = process.env.SWEETTRACKER_API_KEY || ''
    try {
      const res = await fetch(
        `https://info.sweettracker.co.kr/tracking/5?t_key=${SWEETTRACKER_API_KEY}&t_code=${courierCode}&t_invoice=${invoiceNo}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return { status: '조회불가', details: [] }
      const data = await res.json()
    return {
      trackingStatus : data.trackingDetails?.[0]?.where || '정보없음',
      details        : data.trackingDetails || [],
    }
  } catch {
    return { trackingStatus: '조회불가', details: [] }
  }
}
}
