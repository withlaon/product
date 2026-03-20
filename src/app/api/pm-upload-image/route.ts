import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim()
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const BUCKET = 'product-images'

async function ensureBucket() {
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, fileSizeLimit: 5242880 }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  try {
    const { base64, path } = await req.json() as { base64?: string; path?: string }
    if (!base64 || !path) return NextResponse.json({ error: 'base64, path 필수' }, { status: 400 })

    await ensureBucket()

    const commaIdx = base64.indexOf(',')
    const metaPart  = commaIdx >= 0 ? base64.slice(0, commaIdx) : ''
    const dataPart  = commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64
    const mimeType  = metaPart.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
    const buffer    = Buffer.from(dataPart, 'base64')

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${SERVICE_KEY}`,
        apikey:         SERVICE_KEY,
        'Content-Type': mimeType,
        'x-upsert':     'true',
      },
      body: buffer,
      signal: AbortSignal.timeout(25000),
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ error: err }, { status: uploadRes.status })
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    return NextResponse.json({ url: publicUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
