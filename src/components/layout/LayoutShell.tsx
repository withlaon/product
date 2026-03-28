'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { usePathname } from 'next/navigation'
import { hydrateShippedOrdersFromServer } from '@/lib/orders'

const NO_LAYOUT_PATHS = ['/login', '/signup', '/oauth']

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop]   = useState(false)
  const pathname = usePathname()

  const noLayout = NO_LAYOUT_PATHS.includes(pathname)

  // 반응형
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // 출고내역: Supabase와 로컬 캐시 동기화 (로그인·회원가입 제외)
  useEffect(() => {
    if (NO_LAYOUT_PATHS.includes(pathname)) return
    void hydrateShippedOrdersFromServer()
  }, [pathname])

  // 로그인/회원가입 페이지: 사이드바 없이 렌더링
  if (noLayout) return <>{children}</>

  const sidebarW = isDesktop ? (collapsed ? 64 : 220) : 0

  return (
    <>
      {/* 모바일 딤 */}
      <div
        onClick={() => setMobileOpen(false)}
        className="fixed inset-0 z-30 lg:hidden transition-opacity duration-300"
        style={{
          background: 'rgba(2,6,23,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? 'auto' : 'none',
        }}
      />

      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className="flex flex-col"
        style={{
          marginLeft: sidebarW,
          transition: 'margin-left 300ms cubic-bezier(0.4,0,0.2,1)',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main
          className="flex-1 p-4 md:p-5"
          style={{ background: 'var(--color-bg)', width: '100%', minWidth: 0, overflow: 'auto', height: 0 }}
        >
          {children}
        </main>
      </div>
    </>
  )
}
