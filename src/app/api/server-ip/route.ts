/**
 * /api/server-ip
 *
 * 서버의 외부(공인) IP를 반환합니다.
 * FIXIE_URL 환경변수가 설정된 경우 → Fixie 고정 IP를 반환합니다.
 * 미설정 경우 → Vercel 동적 IP를 반환합니다.
 *
 * 쿠팡 / 스마트스토어 / 11번가 / 롯데ON / SSG / 토스쇼핑 등
 * IP 화이트리스트 등록 시 이 IP를 사용하세요.
 */

import { NextResponse } from 'next/server'
import { getServerIp } from '@/lib/proxy-fetch'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const ip      = await getServerIp()
    const isFixie = !!process.env.FIXIE_URL

    return NextResponse.json({
      success   : true,
      server_ip : ip,
      is_fixed  : isFixie,
      note      : isFixie
        ? '✅ Fixie 고정 IP입니다. 이 IP를 각 쇼핑몰 화이트리스트에 등록하세요.'
        : '⚠️ Vercel 동적 IP입니다. IP가 수시로 변경될 수 있습니다. 고정 IP가 필요한 쇼핑몰(스마트스토어·쿠팡·11번가·롯데ON·SSG·토스쇼핑)은 Fixie 설정을 완료해 주세요.',
    })
  } catch {
    return NextResponse.json({
      success : false,
      message : '서버 IP 확인에 실패했습니다.',
    }, { status: 500 })
  }
}
