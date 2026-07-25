import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * MONEY(금전출납부) 앱의 Supabase 프로젝트에서 '물류비' 지출 카테고리 내역을
 * 실시간으로 읽어와 대시보드 택배비/물류비 카드 계산에 사용한다.
 * (PRODUCT 앱과는 별도의 Supabase 프로젝트이며, 같은 계정으로 관리됨)
 */
const MONEY_URL = (process.env.MONEY_SUPABASE_URL ?? '').trim()
const MONEY_KEY = (process.env.MONEY_SUPABASE_ANON_KEY ?? '').trim()
const CATEGORY_NAME = '물류비'

const HEADERS: Record<string, string> = {
  apikey: MONEY_KEY,
  Authorization: `Bearer ${MONEY_KEY}`,
  'Content-Type': 'application/json',
}

async function moneyFetch(path: string) {
  return fetch(`${MONEY_URL}/rest/v1/${path}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
}

/** 목록 조회: GET /api/money-logistics → [{ id, date, amount, memo }] */
export async function GET() {
  try {
    if (!MONEY_URL || !MONEY_KEY) {
      return NextResponse.json([])
    }

    // 1) '물류비' 지출 카테고리 id 조회
    const catRes = await moneyFetch(`expense_categories?select=id&name=eq.${encodeURIComponent(CATEGORY_NAME)}`)
    if (!catRes.ok) return NextResponse.json([])
    const cats = await catRes.json()
    const catIds: string[] = Array.isArray(cats) ? cats.map((c: { id: string }) => c.id) : []
    if (catIds.length === 0) return NextResponse.json([])

    // 2) 해당 카테고리의 지출(expense) 내역 조회
    const idFilter = catIds.map(id => `"${id}"`).join(',')
    const txRes = await moneyFetch(
      `transactions?select=id,amount,transaction_date,description,memo&transaction_type=eq.expense&expense_category_id=in.(${idFilter})&order=transaction_date.desc`
    )
    if (!txRes.ok) return NextResponse.json([])
    const txs = await txRes.json()
    type MoneyTx = { id: string; amount: number; transaction_date: string; description?: string; memo?: string }
    const out = (Array.isArray(txs) ? txs : []).map((t: MoneyTx) => ({
      id: t.id,
      date: t.transaction_date,
      amount: t.amount || 0,
      memo: t.description || t.memo || '',
    }))
    return NextResponse.json(out)
  } catch (e) {
    console.error('[money-logistics]', e)
    return NextResponse.json([])
  }
}
