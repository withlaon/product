import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, ShoppingCart, Package, Users, ArrowUpRight } from 'lucide-react'

const monthly = [
  { month:'10월', amount:38500000, orders:412 },
  { month:'11월', amount:45200000, orders:487 },
  { month:'12월', amount:67800000, orders:720 },
  { month:'1월',  amount:32100000, orders:345 },
  { month:'2월',  amount:41300000, orders:443 },
  { month:'3월',  amount:48750000, orders:521 },
]
const channels = [
  { name:'쿠팡',  amount:21500000, pct:44, color:'bg-orange-400' },
  { name:'네이버', amount:14200000, pct:29, color:'bg-green-400' },
  { name:'11번가', amount:7800000,  pct:16, color:'bg-red-400' },
  { name:'G마켓', amount:5250000,  pct:11, color:'bg-blue-400' },
]
const topProducts = [
  { name:'블루투스 이어폰 Pro Max', sku:'BT-PRO-001', sales:234, revenue:20826000, growth:12 },
  { name:'무선 마우스 에르고',      sku:'MS-WIFI-ERG', sales:156, revenue:12324000, growth:8 },
  { name:'스마트 USB-C 충전기',    sku:'CH-USBC-065', sales:312, revenue:14040000, growth:25 },
  { name:'노트북 파우치 15.6인치', sku:'NB-BAG-156',  sales:89,  revenue:2492000,  growth:-3 },
  { name:'기계식 키보드 TKL RGB',  sku:'KB-MECH-TKL', sales:67,  revenue:8643000,  growth:5 },
]
const maxAmt = Math.max(...monthly.map(m=>m.amount))

export default function AnalyticsPage() {
  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label:'이번 달 매출', v:formatCurrency(48750000), sub:'+18% 전월 대비', up:true, icon:TrendingUp, cls:'text-blue-600 bg-blue-50' },
          { label:'이번 달 주문', v:'521건', sub:'+17% 전월 대비', up:true, icon:ShoppingCart, cls:'text-emerald-600 bg-emerald-50' },
          { label:'평균 주문금액', v:formatCurrency(93570), sub:'+1% 전월 대비', up:true, icon:Package, cls:'text-violet-600 bg-violet-50' },
          { label:'신규 고객',   v:'148명', sub:'-5% 전월 대비', up:false, icon:Users, cls:'text-orange-600 bg-orange-50' },
        ].map(c=>(
          <div key={c.label} className={`rounded-2xl border border-slate-200/80 shadow-sm p-5 ${c.cls}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{c.label}</p>
                <p className="text-[22px] font-extrabold mt-1 leading-none text-slate-800">{c.v}</p>
                <div className="flex items-center gap-1 mt-2">
                  {c.up?<ArrowUpRight size={13} className="text-emerald-500"/>:<TrendingDown size={13} className="text-red-500"/>}
                  <span className={`text-[11.5px] font-bold ${c.up?'text-emerald-600':'text-red-600'}`}>{c.sub}</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-white/60 rounded-xl flex items-center justify-center">
                <c.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 월별 차트 */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="text-[14px] font-extrabold text-slate-800 mb-5">월별 매출 추이</h2>
          <div className="space-y-3">
            {monthly.map(m=>{
              const w=(m.amount/maxAmt)*100
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-[12px] font-extrabold text-slate-400 w-8 flex-shrink-0">{m.month}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-9 relative overflow-hidden">
                    <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700" style={{width:`${w}%`}}/>
                    <div className="absolute inset-0 flex items-center justify-end pr-3 gap-3">
                      <span className="text-[12px] font-extrabold text-slate-700 relative z-10">{formatCurrency(m.amount)}</span>
                      <span className="text-[11px] font-bold text-slate-500 relative z-10">{m.orders}건</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 채널별 */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="text-[14px] font-extrabold text-slate-800 mb-5">채널별 매출</h2>
          <div className="space-y-4">
            {channels.map(c=>(
              <div key={c.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-extrabold text-slate-700">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-extrabold text-slate-500">{formatCurrency(c.amount)}</span>
                    <span className="text-[12px] font-extrabold text-slate-800">{c.pct}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div className={`${c.color} h-2.5 rounded-full transition-all duration-700`} style={{width:`${c.pct}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 상품별 순위 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-[14px] font-extrabold text-slate-800">상품별 판매 현황 (이번 달)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              {['순위','상품명','SKU','판매수량','매출액','성장률'].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {topProducts.map((p,i)=>(
                <tr key={p.sku} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex w-7 h-7 items-center justify-center rounded-xl text-[12px] font-extrabold ${i===0?'bg-amber-100 text-amber-700':i===1?'bg-slate-100 text-slate-600':i===2?'bg-orange-100 text-orange-700':'bg-slate-50 text-slate-400'}`}>{i+1}</span>
                  </td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{p.name}</td>
                  <td className="px-4 py-3"><span className="font-mono text-[11.5px] bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold">{p.sku}</span></td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{p.sales.toLocaleString()}개</td>
                  <td className="px-4 py-3 font-extrabold text-slate-800">{formatCurrency(p.revenue)}</td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 font-extrabold text-[12.5px] ${p.growth>=0?'text-emerald-600':'text-red-600'}`}>
                      {p.growth>=0?<ArrowUpRight size={13}/>:<TrendingDown size={13}/>}{Math.abs(p.growth)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
