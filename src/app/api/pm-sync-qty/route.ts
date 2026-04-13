/**
 * POST /api/pm-sync-qty
 * 발주확정/입고확정 시 pm_products.options의 ordered/received/current_stock 수량을 서버사이드에서 직접 업데이트
 * SERVICE_ROLE_KEY 사용 → RLS 완전 우회
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

interface SyncRow {
  prodId:        string
  optName:       string
  barcode?:      string
  orderedDelta:  number
  receivedDelta: number
}

interface PmOption {
  name?: string
  barcode?: string
  korean_name?: string
  ordered?: number
  received?: number
  current_stock?: number
  sold?: number
  [key: string]: unknown
}

export async function POST(req: NextRequest) {
  try {
    const { updates }: { updates: SyncRow[] } = await req.json()
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates 배열이 비어있습니다' }, { status: 400 })
    }

    // prodId 별로 그룹핑
    const grouped: Record<string, SyncRow[]> = {}
    for (const r of updates) {
      if (!r.prodId) continue
      if (!grouped[r.prodId]) grouped[r.prodId] = []
      grouped[r.prodId].push(r)
    }

    const results: { prodId: string; ok: boolean; error?: string }[] = []

    for (const [prodId, rows] of Object.entries(grouped)) {
      try {
        // ① Supabase에서 최신 options 직접 조회 (이미지 포함 전체 필드)
        const getRes = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,options&id=eq.${encodeURIComponent(prodId)}`,
          {
            headers: {
              ...BASE_HEADERS,
              Accept: 'application/vnd.pgrst.object+json',
            },
            signal: AbortSignal.timeout(30000),
          }
        )

        if (!getRes.ok) {
          const txt = await getRes.text().catch(() => '')
          results.push({ prodId, ok: false, error: `options 조회 실패 HTTP ${getRes.status}: ${txt}` })
          continue
        }

        const product = await getRes.json() as { id: string; options: PmOption[] }
        const baseOpts: PmOption[] = Array.isArray(product?.options) ? product.options : []

        if (baseOpts.length === 0) {
          results.push({ prodId, ok: false, error: 'options 배열이 비어있음' })
          continue
        }

        // ② 수량 업데이트
        const updatedOpts = baseOpts.map((opt: PmOption) => {
          const ob = String(opt.barcode ?? '').trim()
          const u = rows.find(r => {
            const rb = String(r.barcode ?? '').trim()
            if (rb) return rb === ob
            const on = String(r.optName ?? '').trim()
            if (!on) return false
            return on === String(opt.name ?? '').trim() || on === String(opt.korean_name ?? '').trim()
          })
          if (!u) return opt

          const newOrdered  = Math.max(0, (opt.ordered  || 0) + u.orderedDelta)
          const newReceived = Math.max(0, (opt.received || 0) + u.receivedDelta)
          const prevStock   = opt.current_stock !== undefined
            ? opt.current_stock
            : Math.max(0, (opt.received || 0) - (opt.sold || 0))
          const newStock    = Math.max(0, prevStock + u.receivedDelta)

          return { ...opt, ordered: newOrdered, received: newReceived, current_stock: newStock }
        })

        // ③ Supabase에 PATCH (SERVICE_ROLE_KEY → RLS 우회)
        const patchRes = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(prodId)}`,
          {
            method: 'PATCH',
            headers: { ...BASE_HEADERS, Prefer: 'return=minimal' },
            body: JSON.stringify({ options: updatedOpts }),
            signal: AbortSignal.timeout(30000),
          }
        )

        if (!patchRes.ok) {
          const txt = await patchRes.text().catch(() => '')
          results.push({ prodId, ok: false, error: `PATCH 실패 HTTP ${patchRes.status}: ${txt}` })
        } else {
          results.push({ prodId, ok: true })
        }
      } catch (e) {
        results.push({ prodId, ok: false, error: String(e) })
      }
    }

    const failed = results.filter(r => !r.ok)
    if (failed.length > 0) {
      return NextResponse.json(
        { ok: false, results, error: failed.map(f => `${f.prodId}: ${f.error}`).join(' | ') },
        { status: 207 }
      )
    }

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
