'use client'
import { Search, Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'

const pageTitles: Record<string, { title: string; desc: string }> = {
  '/dashboard':             { title: '대시보드',     desc: '전체 현황을 한눈에 확인하세요' },
  '/products':              { title: '상품관리',     desc: '상품 등록, 수정 및 상태 관리' },
  '/purchase':              { title: '발주/입고관리', desc: '발주 등록 및 입고 처리 현황' },
  '/product-transfer':      { title: '주문관리',   desc: '주문 업로드 및 이번달 주문 현황' },
  '/product-edit-transfer': { title: '송장등록',   desc: '배송 택배사 및 운송장번호 등록' },
  '/inventory':             { title: '재고관리',     desc: '입고·출고 및 재고 현황 관리' },
  '/mapping':               { title: '매핑관리',     desc: '쇼핑몰 상품 매핑 관리' },
  '/settings':              { title: '설정',         desc: '시스템 환경설정' },
}

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname()

  const page = Object.entries(pageTitles)
    .find(([key]) => pathname === key || pathname.startsWith(key + '/'))?.[1]
    ?? { title: '상품관리', desc: '' }

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
      </div>
    </header>
  )
}
