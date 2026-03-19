import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TABLE         = 'pm_products'
const TIMEOUT_MS    = 9000   // Vercel Hobby 10s 제한 내에 완료

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

const SELECT_COLS = 'id,code,name,abbr,category,loca,cost_price,cost_currency,status,supplier,options,channel_prices,registered_malls,created_at'

/** 상품 목록 조회 / 단일 상품 basic_info 조회 */
export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id')

    if (id) {
      const res = await sbFetch(`${TABLE}?select=basic_info&id=eq.${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/vnd.pgrst.object+json' },
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return NextResponse.json({ error: `${res.status}: ${txt}` }, { status: res.status })
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    const res = await sbFetch(`${TABLE}?select=${SELECT_COLS}&order=code.asc`)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: `${res.status}: ${txt}` }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [], {
      headers: { 'Cache-Control': 'no-store' },
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
