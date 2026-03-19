import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 25

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

export async function GET() {
  const t0 = Date.now()
  const result: Record<string, unknown> = {
    env_url_ok:  !!SUPABASE_URL,
    env_key_ok:  !!SERVICE_KEY && SERVICE_KEY.length > 20,
    key_prefix:  SERVICE_KEY.slice(0, 20) + '...',
  }

  // 최소 쿼리: id 컬럼 1건만
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pm_products?select=id&limit=1`,
      {
        headers: {
          apikey:        SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        signal: ac.signal,
      }
    )
    clearTimeout(t)
    const body = await res.text()
    result.status      = res.status
    result.ok          = res.ok
    result.body_sample = body.slice(0, 200)
    result.elapsed_ms  = Date.now() - t0
  } catch (e) {
    clearTimeout(t)
    result.error      = e instanceof Error ? e.message : String(e)
    result.elapsed_ms = Date.now() - t0
  }

  return NextResponse.json(result)
}
