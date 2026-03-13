'use client'
import { Bell, Search, Menu, LogOut } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, getDisplayName, getUsername } from '@/lib/auth'
import type { Session } from '@supabase/supabase-js'

const pageTitles: Record<string, { title: string; desc: string }> = {
  '/dashboard': { title: '대시보드', desc: '전체 현황을 한눈에 확인하세요' },
  '/products':  { title: '상품관리',     desc: '상품 등록, 수정 및 상태 관리' },
  '/purchase':  { title: '발주/입고관리', desc: '발주 등록 및 입고 처리 현황' },
  '/inventory': { title: '재고관리',     desc: '입고·출고 및 재고 현황 관리' },
  '/orders':    { title: '주문관리', desc: '주문 확인 및 처리 현황' },
  '/cs':        { title: 'CS관리',   desc: '고객 문의 및 클레임 처리' },
  '/shipping':  { title: '배송·송장', desc: '배송 현황 및 송장번호 관리' },
  '/channels':  { title: '채널연동', desc: '쇼핑몰 API 연동 관리' },
  '/analytics': { title: '통계·분석', desc: '매출 및 상품별 판매 분석' },
  '/settings':  { title: '설정',     desc: '시스템 환경설정' },
}

interface HeaderProps {
  onMenuClick: () => void
  session: Session | null
}

export function Header({ onMenuClick, session }: HeaderProps) {
  const pathname    = usePathname()
  const router      = useRouter()
  const displayName = getDisplayName(session)
  const username    = getUsername(session)
  const initial     = (displayName[0] ?? 'A').toUpperCase()

  const page = Object.entries(pageTitles)
    .find(([key]) => pathname === key || pathname.startsWith(key + '/'))?.[1]
    ?? { title: '대시보드', desc: '' }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <header
      className="h-14 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 flex-shrink-0"
      style={{
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(15,23,42,0.07)',
        boxShadow: '0 1px 0 rgba(15,23,42,0.04)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 transition-colors"
          style={{ transition: 'background 150ms ease' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Menu size={17} />
        </button>

        <div>
          <h1 className="text-[14.5px] font-extrabold text-slate-800 leading-none tracking-tight">{page.title}</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block font-medium">{page.desc}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 검색 */}
        <div className="relative hidden sm:block">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="검색..."
            className="pm-input pm-input-icon"
            style={{ width: 180, height: 32, fontSize: 12.5 }}
          />
        </div>

        {/* 알림 */}
        <button
          className="relative w-8 h-8 flex items-center justify-center rounded-xl text-slate-500"
          style={{ transition: 'background 150ms ease' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444', boxShadow: '0 0 0 2px rgba(255,255,255,0.8)' }} />
        </button>

        {/* 유저 + 로그아웃 (PC) */}
        <div className="hidden sm:flex items-center gap-2 ml-1">
          <div style={{
            height: 28, padding: '0 10px', borderRadius: 8,
            background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6,
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 900, color: 'white',
            }}>{initial}</div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
              {username}
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400"
            style={{ transition: 'all 150ms ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <LogOut size={15} />
          </button>
        </div>

        {/* 유저 아바타 (모바일) */}
        <button
          className="sm:hidden w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-extrabold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
          onClick={handleLogout}
          title="로그아웃"
        >
          {initial}
        </button>
      </div>
    </header>
  )
}
