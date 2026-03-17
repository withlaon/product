/**
 * POST /api/orders/collect
 *
 * 클라이언트에서 각 쇼핑몰의 credentials를 받아 실제 주문을 수집하여 반환합니다.
 * "신규주문"만 반환: 배송중/배송완료/취소/반품 상태는 제외합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdapter } from '@/marketplaces'
import type { Credentials, UnifiedOrder } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

interface MallInput {
  key         : string
  name        : string
  credentials : Credentials
}

interface CollectRequest {
  malls      : MallInput[]
  start_date : string   // ISO date string (e.g. "2026-03-16")
  end_date   : string   // ISO date string (e.g. "2026-03-17")
}

/** 배송이 이미 진행됐거나 종결된 상태를 제외하고 "신규주문"만 통과시킵니다 */
function isNewOrder(status: string): boolean {
  const s = (status || '').toLowerCase()
  const excludeKeywords = [
    // 배송 진행
    'delivering', '배송중', 'shipped', 'shipping',
    // 배송 완료
    'delivered', '배송완료', 'complete', 'completed', '구매확정',
    // 취소
    'cancel', '취소', 'canceled', 'cancelled',
    // 반품/교환
    'return', '반품', 'exchange', '교환', 'refund', '환불',
    // 기타 종결
    'closed', 'done', 'finish',
  ]
  return !excludeKeywords.some(k => s.includes(k))
}

/** UnifiedOrder → UI에서 사용하는 Order 형태로 변환 */
function toUiOrder(u: UnifiedOrder, mallName: string) {
  const firstItem = u.items?.[0]
  return {
    id              : `${u.marketplace}_${u.order_id}`,
    order_number    : u.mall_order_no || u.order_id,
    channel         : mallName,
    channel_key     : u.marketplace,
    channel_order_id: u.order_id,
    customer_name   : u.receiver_name || u.buyer_name,
    customer_phone  : u.receiver_phone || u.buyer_phone,
    shipping_address: u.receiver_addr || '',
    receiver_zip    : u.receiver_zip || '',
    delivery_message: u.delivery_message || '',
    status          : 'pending' as const,
    mapped_status   : 'new' as const,
    total_amount    : u.total_price || u.items.reduce((s, i) => s + i.qty * i.price, 0),
    shipping_fee    : 0,
    tracking_number : u.invoice_no || null,
    carrier         : u.courier  || null,
    created_at      : u.order_date,
    product_name    : firstItem?.product_name || '',
    option_name     : firstItem?.option_name  || '',
    abbr            : '',   // 매핑 전 공백
    loca            : '',
    items           : u.items.map(i => ({
      name        : i.product_name,
      option_name : i.option_name,
      sku         : i.mall_order_item_id || '',
      quantity    : i.qty,
      price       : i.price,
    })),
    is_claim: false,
    raw_status: u.status,   // 원본 상태코드 보존
  }
}

export async function POST(req: NextRequest) {
  let body: CollectRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { malls, start_date, end_date } = body

  if (!malls?.length) {
    return NextResponse.json({ success: false, message: '수집할 쇼핑몰이 없습니다.' }, { status: 400 })
  }

  const results: ReturnType<typeof toUiOrder>[] = []
  const errors : { mall: string; error: string }[]  = []

  await Promise.allSettled(
    malls.map(async ({ key, name, credentials }) => {
      try {
        const adapter = createAdapter(key, credentials)
        const raw: UnifiedOrder[] = await adapter.getOrders({
          start_date,
          end_date,
        })
        const newOrders = raw.filter(o => isNewOrder(o.status))
        newOrders.forEach(o => results.push(toUiOrder(o, name)))
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err)
        // 에러 메시지를 사용자 친화적으로 변환
        let msg = raw
        if (raw.includes('timeout') || raw.includes('aborted'))
          msg = `API 응답 없음 — 해당 쇼핑몰은 공개 API가 아니거나 IP 화이트리스트 등록이 필요합니다`
        else if (raw.includes('404'))
          msg = `주문 조회 실패 (404) — API 엔드포인트 또는 인증정보를 확인해주세요`
        else if (raw.includes('403'))
          msg = `접근 거부 (403) — 쇼핑몰 관리에서 서버 IP(52.5.155.132)를 화이트리스트에 등록해주세요`
        else if (raw.includes('401'))
          msg = `인증 실패 (401) — API Key / Secret Key를 다시 확인해주세요`
        else if (raw.includes('fetch failed') || raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED'))
          msg = `네트워크 연결 실패 — 해당 쇼핑몰 API가 공개되지 않았거나 별도 파트너 계약이 필요합니다`
        errors.push({ mall: name, error: msg })
      }
    })
  )

  return NextResponse.json({
    success: true,
    orders : results,
    errors,
  })
}
