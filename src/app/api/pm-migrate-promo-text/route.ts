import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 25

const PROJECT_REF = 'bwdxijebymwvqkznydrw'
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const SQL = `ALTER TABLE pm_products ADD COLUMN IF NOT EXISTS promo_text text DEFAULT '';`

/** promo_text 컬럼이 이미 있는지 확인 */
async function checkColumnExists(): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pm_products?select=promo_text&limit=1`,
      {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        signal: AbortSignal.timeout(8000),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const pat = req.nextUrl.searchParams.get('pat')

  // 1) 컬럼 이미 존재 여부 먼저 확인
  const exists = await checkColumnExists()
  if (exists) {
    return NextResponse.json({
      status: '✅ 이미 완료',
      message: 'promo_text 컬럼이 이미 pm_products 테이블에 존재합니다.',
    })
  }

  // 2) PAT 없으면 안내 반환
  if (!pat) {
    return NextResponse.json({
      status: '⚠️ 마이그레이션 필요',
      message: 'promo_text 컬럼이 없습니다. 아래 두 가지 방법 중 하나로 추가하세요.',
      방법1_PAT_사용: {
        설명: 'Supabase Personal Access Token을 발급받아 URL에 추가',
        url: `http://localhost:3000/api/pm-migrate-promo-text?pat=YOUR_PAT`,
        PAT_발급: 'https://supabase.com/dashboard/account/tokens → Generate new token',
      },
      방법2_SQL_직접실행: {
        설명: 'Supabase Dashboard > SQL Editor에서 아래 SQL 실행',
        dashboard: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`,
        sql: SQL,
      },
    }, { status: 400 })
  }

  // 3) PAT 있으면 Management API로 마이그레이션 실행
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SQL }),
      signal: AbortSignal.timeout(15000),
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json({
        status: '❌ 실패',
        http_status: res.status,
        detail: body,
        sql_to_run_manually: SQL,
      }, { status: 500 })
    }

    // 4) 성공 후 재확인
    const verified = await checkColumnExists()
    return NextResponse.json({
      status: verified ? '✅ 마이그레이션 완료' : '⚠️ SQL 실행됨 (검증 불확실)',
      promo_text_column: verified ? '존재함' : '확인 필요',
      migration_result: body,
    })
  } catch (e) {
    return NextResponse.json({ status: '❌ 오류', error: String(e) }, { status: 500 })
  }
}
