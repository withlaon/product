import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 25

const PROJECT_REF = 'bwdxijebymwvqkznydrw'

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')
  if (!pat) {
    return NextResponse.json({
      error: 'pat 파라미터 필요',
      usage: '?pat=YOUR_SUPABASE_PAT',
      how_to_get_pat: 'https://supabase.com/dashboard/account/tokens → Generate new token',
    }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  // 1) 프로젝트 상태 조회
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(8000),
    })
    const body = await r.json()
    results.project_status = body
  } catch (e) {
    results.project_status_error = String(e)
  }

  // 2) Restore (paused → active)
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    })
    const body = await r.json().catch(() => r.text())
    results.restore = { status: r.status, body }
  } catch (e) {
    results.restore_error = String(e)
  }

  // 3) Database restart
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    })
    const body = await r.json().catch(() => r.text())
    results.db_restart = { status: r.status, body }
  } catch (e) {
    results.db_restart_error = String(e)
  }

  return NextResponse.json(results)
}
