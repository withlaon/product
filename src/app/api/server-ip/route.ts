/**
 * /api/server-ip
 *
 * 서버(Vercel Serverless Function)의 실제 외부 IP를 반환합니다.
 * 쿠팡 OPEN API IP 화이트리스트 등록 시 이 IP를 사용하세요.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    // 외부 IP 확인 서비스에서 현재 서버의 공인 IP를 가져옴
    const res  = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()

    return NextResponse.json({
      success   : true,
      server_ip : data.ip,
      note      : 'Vercel Serverless Function의 현재 외부 IP입니다. 쿠팡 OPEN API IP 화이트리스트에 이 IP를 등록하세요.',
      warning   : 'Vercel 무료 플랜은 IP가 동적으로 변경될 수 있습니다. IP가 변경되면 재등록이 필요합니다.',
    })
  } catch {
    return NextResponse.json({
      success : false,
      message : '서버 IP 확인에 실패했습니다.',
    }, { status: 500 })
  }
}
