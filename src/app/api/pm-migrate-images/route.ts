import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 55

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const TABLE  = 'pm_products'
const BUCKET = 'product-images'

const SB_HEADERS = {
  apikey:         SERVICE_KEY,
  Authorization:  `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function ensureBucket() {
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  }).catch(() => {})
}

/** 전체 상품 수 반환 (마이그레이션 진행률 계산용) */
export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=id`,
      { headers: { ...SB_HEADERS, Prefer: 'count=exact' }, signal: AbortSignal.timeout(20000) }
    )
    const total = parseInt(res.headers.get('Content-Range')?.split('/')[1] ?? '0', 10)
    return NextResponse.json({ total })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/**
 * 배치 마이그레이션: body = { offset: number, limit: number }
 * base64 이미지를 Supabase Storage 로 업로드하고 DB 를 URL 로 업데이트
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number }
    const offset = body.offset ?? 0
    const limit  = body.limit  ?? 5

    await ensureBucket()

    // base64 이미지가 있는 상품만 가져오기
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,options&limit=${limit}&offset=${offset}&order=id.asc`,
      { headers: { ...SB_HEADERS, Prefer: 'count=exact' }, signal: AbortSignal.timeout(45000) }
    )
    if (!fetchRes.ok) return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 })

    const products = await fetchRes.json()
    const totalStr = fetchRes.headers.get('Content-Range')?.split('/')[1] ?? '0'
    const total    = parseInt(totalStr, 10)

    let migrated = 0
    let skipped  = 0
    let errors   = 0

    for (const product of products) {
      const opts = (product.options ?? []) as Array<{ image?: string; [k: string]: unknown }>
      let changed = false

      const newOpts = await Promise.all(
        opts.map(async (opt, i) => {
          const image = opt.image ?? ''

          // 이미 URL이거나 비어있으면 스킵
          if (!image || !image.startsWith('data:')) {
            skipped++
            return opt
          }

          try {
            const commaIdx = image.indexOf(',')
            const metaPart = image.slice(0, commaIdx)
            const dataPart = image.slice(commaIdx + 1)
            const mimeType = metaPart.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
            const ext      = mimeType.includes('png') ? 'png' : 'jpg'
            const path     = `${product.id}/${i}.${ext}`
            const buffer   = Buffer.from(dataPart, 'base64')

            const uploadRes = await fetch(
              `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
              {
                method:  'POST',
                headers: {
                  Authorization:  `Bearer ${SERVICE_KEY}`,
                  apikey:         SERVICE_KEY,
                  'Content-Type': mimeType,
                  'x-upsert':     'true',
                },
                body: buffer,
                signal: AbortSignal.timeout(20000),
              }
            )

            if (!uploadRes.ok) {
              errors++
              return opt
            }

            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
            changed = true
            migrated++
            return { ...opt, image: publicUrl }
          } catch {
            errors++
            return opt
          }
        })
      )

      if (changed) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${product.id}`,
          {
            method:  'PATCH',
            headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
            body:    JSON.stringify({ options: newOpts }),
            signal:  AbortSignal.timeout(15000),
          }
        ).catch(() => {})
      }
    }

    const processed  = Array.isArray(products) ? products.length : 0
    const nextOffset = offset + processed
    const done       = processed === 0 || nextOffset >= total

    return NextResponse.json({ migrated, skipped, errors, processed, total, nextOffset, done })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
