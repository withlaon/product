import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// service role key 사용 → RLS 우회, 모든 상품 조회 가능
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('pm_products')
    .select('id,code,name,abbr,category,loca,cost_price,cost_currency,status,supplier,options,channel_prices,mall_categories,registered_malls,created_at')
    .order('code', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
