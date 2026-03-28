import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 55

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TABLE = 'pm_shipped_orders'
const TIMEOUT_MS = 50000

async function sbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
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

function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY)
}

/** 전체 출고내역 조회 */
export async function GET() {
  try {
    if (!supabaseConfigured()) {
      return NextResponse.json({ orders: [], warning: 'supabase_not_configured' }, { status: 200 })
    }
    const res = await sbFetch(`${TABLE}?select=id,data,updated_at&order=updated_at.desc`)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: `${res.status}: ${txt}` }, { status: res.status })
    }
    const rows = (await res.json()) as { id: string; data: Record<string, unknown> }[]
    const orders = rows.map((r) => ({ ...r.data, id: r.id } as Record<string, unknown>))
    return NextResponse.json({ orders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** 출고내역 upsert (배열) */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })
    }
    const body = await req.json()
    const upserts = body?.upserts as { id?: string }[] | undefined
    if (!Array.isArray(upserts) || upserts.length === 0) {
      return NextResponse.json({ error: 'upserts array required' }, { status: 400 })
    }
    const rows = upserts
      .filter((o) => o && typeof o.id === 'string' && o.id.length > 0)
      .map((o) => ({
        id: o.id as string,
        data: o as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }))
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }
    const res = await sbFetch(TABLE, {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** 명시적 삭제: id 목록 */
export async function DELETE(req: NextRequest) {
  try {
    if (!supabaseConfigured()) {
      return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })
    }
    const body = await req.json().catch(() => ({}))
    const ids = body?.ids as string[] | undefined
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }
    const safe = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (safe.length === 0) return NextResponse.json({ ok: true, count: 0 })
    const inList = safe.map((id) => encodeURIComponent(id)).join(',')
    const res = await sbFetch(`${TABLE}?id=in.(${inList})`, { method: 'DELETE' })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: txt }, { status: res.status })
    }
    return NextResponse.json({ ok: true, count: safe.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
