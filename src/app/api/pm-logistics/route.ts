import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TABLE        = 'pm_logistics'

const BASE_HEADERS: Record<string, string> = {
  apikey:         SERVICE_KEY,
  Authorization:  `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:         'return=representation',
}

async function sbFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...BASE_HEADERS, ...(init.headers as Record<string, string> ?? {}) },
    signal: AbortSignal.timeout(25000),
  })
  return res
}

/** 목록 조회: GET /api/pm-logistics */
export async function GET() {
  try {
    const res = await sbFetch(`${TABLE}?select=*&order=date.desc`)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** 등록: POST /api/pm-logistics  body: { date, amount, memo } */
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

/** 수정: PATCH /api/pm-logistics  body: { id, ...fields } */
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...fields } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const res = await sbFetch(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** 삭제: DELETE /api/pm-logistics  body: { id } */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const res = await sbFetch(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
