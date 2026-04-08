import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 55   // Disk IO 스로틀 상태에서 충분한 시간

export const dynamic = 'force-dynamic'

const SUPABASE_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim()
const SERVICE_KEY   = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TABLE         = 'pm_products'
const TIMEOUT_MS    = 50000  // Disk IO 고갈 상태 대응: 50s

/** 옵션 이미지 배치 조회(?imageIds)는 저장 직후 다른 탭에서도 최신 URL이 필요하므로 캐시하지 않음 */
const NO_STORE = { 'Cache-Control': 'no-store, must-revalidate' } as const

/** AbortController + timeout 을 붙인 native fetch */
async function sbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), TIMEOUT_MS)

  const headers: Record<string, string> = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
    ...(init.headers as Record<string, string> ?? {}),
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers,
      signal: ac.signal,
    })
    clearTimeout(t)
    return res
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

const SELECT_COLS = 'id,code,name,abbr,category,loca,cost_price,cost_currency,status,supplier,options,channel_prices,registered_malls,created_at,active_since'

/** 상품 목록 조회 / 단일 상품 basic_info 조회 */
export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id')

    if (id) {
      const full = new URL(req.url).searchParams.get('full')
      const selectCols = full ? '*' : 'basic_info'
      const res = await sbFetch(`${TABLE}?select=${selectCols}&id=eq.${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/vnd.pgrst.object+json' },
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json({ error: `${res.status}: ${txt}` }, { status: res.status })
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    // 이미지 배치 조회: ?imageIds=id1,id2,...
    // RPC는 이미지 제거 버전이므로 직접 테이블 쿼리로 이미지 포함 데이터 조회
    // 현재 페이지 상품(최대 10개)만 조회 → 응답 크기 작음 + 1시간 캐시로 재호출 최소화
    const imageIds = new URL(req.url).searchParams.get('imageIds')
    if (imageIds) {
      const ids = imageIds.split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length === 0) return NextResponse.json([])

      const imgHeaders: Record<string, string> = {
        apikey:         SERVICE_KEY,
        Authorization:  `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      }
      const imgRes = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,options&id=in.(${ids.join(',')})`,
        {
          headers: imgHeaders,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        }
      ).catch(() => null)

      if (!imgRes || !imgRes.ok) return NextResponse.json([], { headers: NO_STORE })
      const data = await imgRes.json()
      return NextResponse.json(Array.isArray(data) ? data : [], { headers: NO_STORE })
    }

    // RPC 함수 우선 시도 (statement_timeout 120s 설정됨 → 57014 오류 우회)
    const rpcHeaders: Record<string, string> = {
      apikey:         SERVICE_KEY,
      Authorization:  `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    }
    let data: unknown = null
    const rpcRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_pm_products_all`,
      {
        method: 'POST',
        headers: rpcHeaders,
        body: '{}',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: 300 },
      }
    ).catch(() => null)

    if (rpcRes && rpcRes.ok) {
      const rpcData = await rpcRes.json()
      const rpcArr = Array.isArray(rpcData) ? rpcData as Record<string, unknown>[] : []
      // RPC 응답에 status 필드가 없으면 직접 SELECT fallback (오래된 RPC 정의 대응)
      const rpcHasStatus = rpcArr.length === 0 || 'status' in rpcArr[0]
      if (rpcHasStatus) {
        data = rpcData
      }
      // rpcHasStatus = false → fall through to direct SELECT below
    }

    if (data === null) {
      // RPC 미지원 또는 status 필드 누락 → 직접 테이블 조회
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?select=${SELECT_COLS}&order=code.asc`,
        {
          headers: { ...rpcHeaders },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          next: { revalidate: 300 },
        }
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json({ error: `${res.status}: ${txt}` }, { status: res.status })
      }
      data = await res.json()
    }

    const arr = Array.isArray(data) ? data : []

    // 목록 조회 시 options 내 base64 image 제거 (데이터 크기 대폭 감소)
    const stripped = arr.map((p: Record<string, unknown>) => ({
      ...p,
      options: ((p.options as Record<string, unknown>[] | null) ?? []).map(
        ({ image: _img, ...rest }: Record<string, unknown>) => rest
      ),
    }))

    return NextResponse.json(stripped, {
      headers: { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=60' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('abort') || msg.includes('timeout') ? 504 : 500
    return NextResponse.json({ error: `서버 오류: ${msg}` }, { status })
  }
}

/** 상품 추가 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await sbFetch(TABLE, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data[0] : data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** 상품 수정
 *  - 단건: { id, ...fields }
 *  - 카테고리 일괄: { filter_category: oldName, category: newName }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()

    // 카테고리 일괄 변경
    if (body.filter_category !== undefined) {
      const res = await sbFetch(
        `${TABLE}?category=eq.${encodeURIComponent(body.filter_category)}`,
        { method: 'PATCH', body: JSON.stringify({ category: body.category }) }
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json({ error: txt }, { status: res.status })
      }
      return NextResponse.json({ ok: true })
    }

    const { id, ...fields } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await sbFetch(
      `${TABLE}?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(fields) }
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** 상품 삭제 */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await sbFetch(
      `${TABLE}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
