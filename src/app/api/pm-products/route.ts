import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** 상품 목록 조회 / 단일 상품 basic_info 조회 */
export async function GET(req: NextRequest) {
  const supabase = getAdmin()
  const id = new URL(req.url).searchParams.get('id')

  if (id) {
    const { data, error } = await supabase
      .from('pm_products').select('basic_info').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('pm_products')
    .select('id,code,name,abbr,category,loca,cost_price,cost_currency,status,supplier,options,channel_prices,registered_malls,created_at')
    .order('code', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** 상품 추가 */
export async function POST(req: NextRequest) {
  const supabase = getAdmin()
  const body = await req.json()
  const { data, error } = await supabase
    .from('pm_products').insert(body).select().single()

  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json(data)
}

/** 상품 수정
 *  - 단건: { id, ...fields }
 *  - 카테고리 일괄: { filter_category: oldName, category: newName }
 */
export async function PATCH(req: NextRequest) {
  const supabase = getAdmin()
  const body = await req.json()

  // 카테고리 일괄 변경
  if (body.filter_category !== undefined) {
    const { error } = await supabase
      .from('pm_products').update({ category: body.category }).eq('category', body.filter_category)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('pm_products').update(fields).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** 상품 삭제 */
export async function DELETE(req: NextRequest) {
  const supabase = getAdmin()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('pm_products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
