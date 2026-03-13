import { TrendingUp, ShoppingCart, Package, Users, BarChart3 } from 'lucide-react'

const kpis = [
  { label:'이번 달 매출',  v:'₩0',  icon:TrendingUp,   bg:'#eff6ff', color:'#2563eb' },
  { label:'이번 달 주문',  v:'0건',  icon:ShoppingCart, bg:'#ecfdf5', color:'#059669' },
  { label:'평균 주문금액', v:'₩0',  icon:Package,      bg:'#f5f3ff', color:'#7c3aed' },
  { label:'신규 고객',    v:'0명',  icon:Users,        bg:'#fff7ed', color:'#c2410c' },
]

function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      gap:10, padding:'48px 0', color:'#cbd5e1' }}>
      <BarChart3 size={36} style={{ opacity:0.3 }} />
      <p style={{ fontSize:13, fontWeight:700 }}>{label}</p>
      <p style={{ fontSize:12, fontWeight:500, color:'#e2e8f0' }}>데이터가 없습니다</p>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(c => (
          <div key={c.label} className="pm-card p-5" style={{ background: c.bg }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{c.label}</p>
                <p style={{ fontSize:24, fontWeight:900, color: c.color, lineHeight:1, marginTop:6 }}>{c.v}</p>
                <p style={{ fontSize:11.5, fontWeight:700, color:'#cbd5e1', marginTop:6 }}>데이터 없음</p>
              </div>
              <div style={{ width:40, height:40, background:'rgba(255,255,255,0.6)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <c.icon size={18} color={c.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 월별 매출 추이 */}
        <div className="pm-card p-5 xl:col-span-2">
          <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b', marginBottom:16 }}>월별 매출 추이</h2>
          <EmptyChart label="주문 데이터가 쌓이면 차트가 표시됩니다" />
        </div>

        {/* 채널별 매출 */}
        <div className="pm-card p-5">
          <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b', marginBottom:16 }}>채널별 매출</h2>
          <EmptyChart label="채널 연동 후 데이터가 표시됩니다" />
        </div>
      </div>

      {/* 상품별 판매 현황 */}
      <div className="pm-card overflow-hidden">
        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(15,23,42,0.07)' }}>
          <h2 style={{ fontSize:14, fontWeight:900, color:'#1e293b' }}>상품별 판매 현황 (이번 달)</h2>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          gap:10, padding:'56px 0', color:'#cbd5e1' }}>
          <Package size={36} style={{ opacity:0.25 }} />
          <p style={{ fontSize:13.5, fontWeight:700, color:'#94a3b8' }}>판매 데이터가 없습니다</p>
          <p style={{ fontSize:12, fontWeight:500 }}>주문이 수집되면 자동으로 집계됩니다</p>
        </div>
      </div>
    </div>
  )
}
