/**
 * POST /api/orders/invoice
 *
 * 쇼핑몰 API에 송장번호를 전송합니다.
 * 클라이언트(shipping page)에서 credentials와 함께 호출합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdapter } from '@/marketplaces'
import type { Credentials } from '@/adapters/marketplace.adapter'

export const runtime = 'nodejs'

/** 택배사 한국 이름 → 공통 코드 */
const CARRIER_KEY: Record<string, string> = {
  'CJ대한통운' : 'cj',
  'CJ':         'cj',
  '롯데택배'   : 'lotte',
  '롯데글로벌' : 'lotte',
  '한진택배'   : 'hanjin',
  '한진'       : 'hanjin',
  '우체국택배' : 'epost',
  '우체국'     : 'epost',
  '로젠택배'   : 'logen',
  '로젠'       : 'logen',
  '경동택배'   : 'kyungdong',
  '경동'       : 'kyungdong',
  '편의점택배' : 'convenience',
  'GS편의점'   : 'convenience',
  'CU편의점'   : 'convenience',
}

/** 공통 코드 → 쇼핑몰별 코드 */
const CARRIER_CODES: Record<string, Record<string, string>> = {
  // 쿠팡
  coupang: {
    cj          : 'CJGLS',
    lotte       : 'LOTTE',
    hanjin      : 'HANJIN',
    epost       : 'EPOST',
    logen       : 'LOGEN',
    kyungdong   : 'KYUNGDONG',
    convenience : 'CVSNHNPARCEL',
  },
  // 스마트스토어 (네이버 커머스)
  smartstore: {
    cj          : '04',
    lotte       : '08',
    hanjin      : '05',
    epost       : '01',
    logen       : '06',
    kyungdong   : '56',
    convenience : '71',
  },
  naver: {  // alias
    cj: '04', lotte: '08', hanjin: '05', epost: '01', logen: '06', kyungdong: '56', convenience: '71',
  },
  // Cafe24
  cafe24: {
    cj          : '0019',
    lotte       : '0003',
    hanjin      : '0002',
    epost       : '0001',
    logen       : '0045',
    kyungdong   : '0116',
    convenience : '0082',
  },
  // 11번가
  '11st': {
    cj          : '04',
    lotte       : '08',
    hanjin      : '05',
    epost       : '01',
    logen       : '06',
    kyungdong   : '23',
    convenience : '32',
  },
  // G마켓 / 옥션 (ESM)
  gmarket : { cj:'04', lotte:'08', hanjin:'05', epost:'01', logen:'06', kyungdong:'23' },
  auction : { cj:'04', lotte:'08', hanjin:'05', epost:'01', logen:'06', kyungdong:'23' },
  // 에이블리
  ably    : { cj:'CJGLS', lotte:'LOTTE', hanjin:'HANJIN', epost:'EPOST', logen:'LOGEN', kyungdong:'KGB', convenience:'CVSGLOBALZ' },
  ablly   : { cj:'CJGLS', lotte:'LOTTE', hanjin:'HANJIN', epost:'EPOST', logen:'LOGEN', kyungdong:'KGB', convenience:'CVSGLOBALZ' },
  // 지그재그
  zigzag  : { cj:'cj_logistics', lotte:'lotte', hanjin:'hanjin', epost:'epost', logen:'logen', kyungdong:'kyungdong', convenience:'cvs' },
  // 올웨이즈
  always  : { cj:'CJ', lotte:'LOTTE', hanjin:'HANJIN', epost:'EPOST', logen:'LOGEN', kyungdong:'KGB' },
  alwayz  : { cj:'CJ', lotte:'LOTTE', hanjin:'HANJIN', epost:'EPOST', logen:'LOGEN', kyungdong:'KGB' },
}

/** 택배사 이름 → 해당 쇼핑몰 코드 변환 */
function resolveCarrierCode(carrierName: string, mallKey: string): string {
  const common = CARRIER_KEY[carrierName] || CARRIER_KEY[Object.keys(CARRIER_KEY).find(k => carrierName.includes(k)) || ''] || 'cj'
  return CARRIER_CODES[mallKey]?.[common] || carrierName
}

interface InvoiceRequest {
  mall_key          : string
  credentials       : Credentials
  channel_order_id  : string   // 쇼핑몰의 주문 ID
  carrier_name      : string   // 한국 택배사 이름 (e.g. 'CJ대한통운')
  invoice_no        : string   // 송장번호
}

export async function POST(req: NextRequest) {
  let body: InvoiceRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식' }, { status: 400 })
  }

  const { mall_key, credentials, channel_order_id, carrier_name, invoice_no } = body

  if (!mall_key || !channel_order_id || !invoice_no) {
    return NextResponse.json({ success: false, message: '필수 파라미터 누락 (mall_key, channel_order_id, invoice_no)' }, { status: 400 })
  }

  // 수동 등록 주문은 API 전송 불필요
  if (mall_key === 'manual' || mall_key === '') {
    return NextResponse.json({ success: true, message: '수동 등록 주문 — 쇼핑몰 API 전송 생략', manual: true })
  }

  try {
    const courierCode = resolveCarrierCode(carrier_name, mall_key)
    const adapter = createAdapter(mall_key, credentials)
    await adapter.uploadInvoice({
      order_id    : channel_order_id,
      courier_code: courierCode,
      invoice_no  : invoice_no,
    })
    return NextResponse.json({ success: true, message: `송장 전송 완료 (${carrier_name} ${invoice_no})` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
