import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')

/** 발주서 엑셀에 상품 이미지를 넣기 위한 같은 출처 프록시.
 *  브라우저에서 Supabase 공개 URL을 캔버스로 줄이려면 CORS가 필요한데,
 *  저장소 응답에 CORS가 없을 수 있어 서버에서 대신 받아 준다.
 *  허용 대상은 이 프로젝트 Supabase Storage URL만. */
export async function GET(req: NextRequest) {
  const url = (req.nextUrl.searchParams.get('url') ?? '').trim()
  if (!SUPABASE_URL || !url.startsWith(`${SUPABASE_URL}/storage/`)) {
    return NextResponse.json({ error: '허용되지 않은 이미지 주소' }, { status: 400 })
  }
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return new NextResponse(null, { status: res.status })
    const buf = await res.arrayBuffer()
    const ct = res.headers.get('content-type') || 'image/jpeg'
    return new NextResponse(buf, {
      headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=300' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
