'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

const PUBLIC_PATHS = ['/', '/login', '/signup']

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop]   = useState(false)
  const [session, setSession]       = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const pathname = usePathname()
  const router   = useRouter()

  const isPublic = PUBLIC_PATHS.includes(pathname)

  // 반응형
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Supabase 세션 감시 (Auth Guard)
  useEffect(() => {
    // 공개 경로는 체크 불필요
    if (isPublic) { setAuthLoading(false); return }

    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setAuthLoading(false)
      if (!s) router.replace('/login')
    })

    // 실시간 세션 변화 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s && !PUBLIC_PATHS.includes(window.location.pathname)) {
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [isPublic, router])

  // 공개 경로: 사이드바 없이 렌더링
  if (isPublic) return <>{children}</>

  // 인증 확인 중: 로딩 스피너
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(59,130,246,0.3)', borderTopColor: '#3b82f6', animation: 'spin-slow 0.7s linear infinite' }} />
    </div>
  )

  // 세션 없음 (리다이렉트 중): 아무것도 렌더링하지 않음
  if (!session) return null

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
        className="flex flex-col min-h-screen"
        style={{
          marginLeft: sidebarW,
          transition: 'margin-left 300ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <Header onMenuClick={() => setMobileOpen(true)} session={session} />
        <main
          className="flex-1 p-4 md:p-5"
          style={{ background: 'var(--color-bg)', width: '100%', minWidth: 0 }}
        >
          {children}
        </main>
      </div>
    </>
  )
}
