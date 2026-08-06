/**
 * POST /api/pm-cs-stock
 * CS(반품/교환) 처리완료 시 바코드 기준으로 pm_products.options의
 * current_stock / defective 수량을 서버사이드에서 "항상 최신 DB 값" 기준으로 직접 반영.
 * - 클라이언트 캐시(localStorage)에 의존하지 않고, 매 호출마다 Supabase에서 해당 상품을
 *   다시 조회한 뒤 델타(증감분)만 적용 → 실시간성 + 동시성 문제(stale overwrite) 방지.
 * - SERVICE_ROLE_KEY 사용 → RLS 완전 우회
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 55

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TABLE = 'pm_products'

const BASE_HEADERS = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

interface CsStockUpdate {
  /** CS 항목 식별용 키 (결과 매칭용, 임의 문자열) */
  key: string
  barcode: string
  stockDelta?: number
  defectiveDelta?: number
}

interface PmOption {
  name?: string
  barcode?: string
  korean_name?: string
  current_stock?: number
  defective?: number
  [key: string]: unknown
}

interface PmProductRow {
  id: string
  status?: string
  options: PmOption[]
}

async function sbGet(query: string): Promise<PmProductRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query}`, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data as PmProductRow[] : []
}

/** 바코드로 상품 찾기: ① "코드 옵션" 규칙으로 빠르게 조회 → ② 실패 시 전체 스캔 */
async function findProductByBarcode(barcode: string): Promise<PmProductRow | null> {
  const bc = barcode.trim().toLowerCase()
  if (!bc) return null

  const codeGuess = barcode.trim().split(/\s+/)[0]
  if (codeGuess) {
    const rows = await sbGet(`select=id,status,options&code=eq.${encodeURIComponent(codeGuess)}`)
    for (const p of rows) {
      if ((p.options ?? []).some(o => (o.barcode ?? '').trim().toLowerCase() === bc)) return p
    }
  }

  // fallback: 전체 스캔 (코드-바코드 규칙이 다른 예외 케이스 대응)
  const all = await sbGet(`select=id,status,options&order=code.asc`)
  for (const p of all) {
    if ((p.options ?? []).some(o => (o.barcode ?? '').trim().toLowerCase() === bc)) return p
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { updates }: { updates: CsStockUpdate[] } = await req.json()
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates 배열이 비어있습니다' }, { status: 400 })
    }

    const results: { key: string; ok: boolean; error?: string; newStock?: number; newDefective?: number }[] = []

    // 동일 상품에 대한 동시 PATCH 충돌 방지를 위해 순차 처리
    for (const u of updates) {
      const barcode = (u.barcode ?? '').trim()
      if (!barcode) {
        results.push({ key: u.key, ok: false, error: '바코드 없음' })
        continue
      }
      try {
        const product = await findProductByBarcode(barcode)
        if (!product) {
          results.push({ key: u.key, ok: false, error: `바코드(${barcode})와 일치하는 상품을 찾을 수 없습니다` })
          continue
        }

        const bc = barcode.toLowerCase()
        let newStock = 0
        let newDefective = 0
        const updatedOpts = product.options.map(opt => {
          if ((opt.barcode ?? '').trim().toLowerCase() !== bc) return opt
          newStock     = Math.max(0, (typeof opt.current_stock === 'number' ? opt.current_stock : 0) + (u.stockDelta ?? 0))
          newDefective = Math.max(0, (typeof opt.defective === 'number' ? opt.defective : 0) + (u.defectiveDelta ?? 0))
          return { ...opt, current_stock: newStock, defective: newDefective }
        })

        const totalStock = updatedOpts.reduce((sum, o) =>
          sum + (typeof o.current_stock === 'number' ? o.current_stock : 0), 0)
        const patchPayload: Record<string, unknown> = { options: updatedOpts }
        if (product.status === 'soldout' && totalStock > 0) {
          patchPayload.status = 'active'
        }

        const patchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(product.id)}`,
          {
            method: 'PATCH',
            headers: { ...BASE_HEADERS, Prefer: 'return=minimal' },
            body: JSON.stringify(patchPayload),
            signal: AbortSignal.timeout(30000),
          }
        )

        if (!patchRes.ok) {
          const txt = await patchRes.text().catch(() => '')
          results.push({ key: u.key, ok: false, error: `PATCH 실패 HTTP ${patchRes.status}: ${txt}` })
        } else {
          results.push({ key: u.key, ok: true, newStock, newDefective })
        }
      } catch (e) {
        results.push({ key: u.key, ok: false, error: String(e) })
      }
    }

    const failed = results.filter(r => !r.ok)
    if (failed.length > 0) {
      return NextResponse.json(
        { ok: false, results, error: failed.map(f => `${f.key}: ${f.error}`).join(' | ') },
        { status: 207 }
      )
    }

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
