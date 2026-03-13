import { Package, ShoppingCart, AlertTriangle, TrendingUp, ArrowUpRight, Truck, MessageSquare } from 'lucide-react'
import Link from 'next/link'

const stats = [
  { title: '전체 상품',    value: '0',  sub: '상품을 등록하세요',  icon: Package,       bg: '#eff6ff', ic: '#2563eb', href: '/products' },
  { title: '오늘 주문',    value: '0',  sub: '주문이 없습니다',     icon: ShoppingCart,  bg: '#ecfdf5', ic: '#059669', href: '/orders' },
  { title: '재고 부족',    value: '0',  sub: '재고 현황 정상',      icon: AlertTriangle, bg: '#fffbeb', ic: '#d97706', href: '/inventory' },
  { title: '이번 달 매출', value: '₩0', sub: '데이터 없음',         icon: TrendingUp,    bg: '#f5f3ff', ic: '#7c3aed', href: '/analytics' },
]

const shippingStats = [
  { label:'송장 미등록', value: 0, bg:'#fff1f2', color:'#be123c', bar:'#f43f5e' },
  { label:'배송 준비중', value: 0, bg:'#eff6ff', color:'#1d4ed8', bar:'#3b82f6' },
  { label:'배송 중',     value: 0, bg:'#faf5ff', color:'#7e22ce', bar:'#a855f7' },
  { label:'배송 완료',   value: 0, bg:'#f0fdf4', color:'#15803d', bar:'#22c55e' },
]

function EmptyState({ icon: Icon, text, sub, href, linkText }: {
  icon: React.ElementType; text: string; sub: string; href?: string; linkText?: string
}) {
  return (
    <div style={{ textAlign:'center', padding:'2.5rem 1rem', color:'#94a3b8' }}>
      <Icon size={32} style={{ opacity: 0.22, margin:'0 auto 10px' }} />
      <p style={{ fontSize:13.5, fontWeight:700, color:'#94a3b8' }}>{text}</p>
      <p style={{ fontSize:12, fontWeight:500, color:'#cbd5e1', marginTop:4 }}>{sub}</p>
      {href && linkText && (
        <Link href={href} style={{ display:'inline-block', marginTop:12, fontSize:12.5, fontWeight:700, color:'#2563eb', textDecoration:'none', padding:'6px 14px', background:'#eff6ff', borderRadius:8 }}>
          {linkText}
        </Link>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="pm-page space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.title} href={s.href} style={{ textDecoration:'none' }}>
            <div className="stat-card" style={{ cursor:'pointer' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.title}</p>
                  <p style={{ fontSize:26, fontWeight:900, color:'#0f172a', marginTop:4, lineHeight:1 }}>{s.value}</p>
                  <p style={{ fontSize:11.5, fontWeight:600, color:'#94a3b8', marginTop:6 }}>{s.sub}</p>
                </div>
                <div style={{ width:44, height:44, borderRadius:14, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <s.icon size={20} color={s.ic} strokeWidth={2} />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 최근 주문 */}
        <div className="xl:col-span-2 pm-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <div style={{ width:28, height:28, borderRadius:9, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ShoppingCart size={14} color="#2563eb" />
              </div>
              <span style={{ fontSize:14, fontWeight:800, color:'#0f172a' }}>최근 주문</span>
              <span style={{ background:'#e2e8f0', color:'#64748b', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99 }}>0</span>
            </div>
            <Link href="/orders" className="flex items-center gap-0.5" style={{ fontSize:12, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>
              전체 보기 <ArrowUpRight size={12} />
            </Link>
          </div>
          <EmptyState icon={ShoppingCart} text="주문 내역이 없습니다" sub="쇼핑몰 채널을 연동하면 주문이 자동으로 수집됩니다" href="/channels" linkText="채널 연동하기" />
        </div>

        {/* 우측 */}
        <div className="space-y-5">
          {/* 재고 부족 */}
          <div className="pm-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width:28, height:28, borderRadius:9, background:'#fffbeb', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <AlertTriangle size={14} color="#d97706" />
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:'#0f172a' }}>재고 부족</span>
                <span style={{ background:'#e2e8f0', color:'#64748b', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99 }}>0</span>
              </div>
              <Link href="/inventory" style={{ fontSize:12, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>보기 →</Link>
            </div>
            <EmptyState icon={Package} text="부족 재고 없음" sub="재고가 기준 이하인 상품이 없습니다" />
          </div>

          {/* CS */}
          <div className="pm-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width:28, height:28, borderRadius:9, background:'#fff1f2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <MessageSquare size={14} color="#be123c" />
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:'#0f172a' }}>미처리 CS</span>
                <span style={{ background:'#e2e8f0', color:'#64748b', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:99 }}>0</span>
              </div>
              <Link href="/cs" style={{ fontSize:12, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>보기 →</Link>
            </div>
            <EmptyState icon={MessageSquare} text="처리할 CS가 없습니다" sub="미처리 문의가 없습니다" />
          </div>
        </div>
      </div>

      {/* 배송 현황 */}
      <div className="pm-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid rgba(15,23,42,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width:28, height:28, borderRadius:9, background:'#faf5ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Truck size={14} color="#7c3aed" />
            </div>
            <span style={{ fontSize:14, fontWeight:800, color:'#0f172a' }}>오늘 배송 현황</span>
          </div>
          <Link href="/shipping" style={{ fontSize:12, fontWeight:700, color:'#2563eb', textDecoration:'none' }}>전체 보기 →</Link>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {shippingStats.map(s => (
            <div key={s.label} className="rounded-2xl p-4" style={{ background: s.bg }}>
              <p style={{ fontSize:11.5, fontWeight:700, color:'#475569' }}>{s.label}</p>
              <p style={{ fontSize:34, fontWeight:900, color: s.color, marginTop:4, lineHeight:1 }}>{s.value}</p>
              <div style={{ width:'100%', height:4, background:'rgba(0,0,0,0.06)', borderRadius:99, marginTop:12 }}>
                <div style={{ width:'0%', height:'100%', background:s.bar, borderRadius:99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
