'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Boxes, Eye, EyeOff, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { signIn, getSession } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [id, setId]           = useState('')
  const [pw, setPw]           = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  // 이미 로그인된 경우 대시보드로
  useEffect(() => {
    getSession().then(session => {
      if (session) router.replace('/dashboard')
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !pw.trim()) { setError('아이디와 비밀번호를 입력하세요.'); return }
    setError('')
    setLoading(true)
    const { error: err } = await signIn(id, pw)
    if (err) {
      setError(err)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #0d1117 0%, #0a0f1e 60%, #060d1a 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(59,130,246,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 90% 100%, rgba(99,102,241,0.1) 0%, transparent 60%)',
      }} />
      <div style={{
        position: 'absolute', top: '20%', left: '5%', width: 400, height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Left branding panel — desktop only */}
      <div className="hidden lg:flex" style={{
        flex: '0 0 480px', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        padding: '3rem', gap: '2rem', position: 'relative',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            boxShadow: '0 8px 32px rgba(59,130,246,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <Boxes size={36} color="white" />
          </div>
          <h1 style={{ fontSize: 'calc(32px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', marginBottom: 8 }}>
            ProductPRO
          </h1>
          <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: 'rgba(148,163,184,0.9)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
            상품 통합 관리 시스템
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
          {[
            { icon: '📦', text: '상품·재고 통합 관리' },
            { icon: '🛒', text: '쇼핑몰 채널 연동' },
            { icon: '📊', text: '주문·CS·배송 한눈에' },
            { icon: '📈', text: '실시간 매출 분석' },
          ].map(f => (
            <div key={f.text} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <span style={{ fontSize: 'calc(20px + var(--pm-list-fs-add, 0pt))' }}>{f.icon}</span>
              <span style={{ fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{f.text}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: 'rgba(100,116,139,0.7)', textAlign: 'center' }}>
          © 2026 ProductPRO. All rights reserved.
        </p>
      </div>

      {/* Divider */}
      <div className="hidden lg:block" style={{
        width: 1,
        background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)',
      }} />

      {/* Right form panel */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 24,
          padding: '2.5rem',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          animation: 'fade-up 400ms cubic-bezier(0,0,0.2,1) both',
        }}>
          {/* Mobile logo */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 6px 24px rgba(59,130,246,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <Boxes size={28} color="white" />
            </div>
            <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>ProductPRO</p>
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: 'calc(22px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', marginBottom: 6 }}>
              로그인
            </h2>
            <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: 'rgba(148,163,184,0.75)', fontWeight: 500 }}>
              관리자 계정으로 로그인하세요
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ID */}
            <div>
              <label style={{ display: 'block', fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6, letterSpacing: '0.05em' }}>
                아이디
              </label>
              <input
                type="text"
                value={id}
                onChange={e => { setId(e.target.value); setError('') }}
                placeholder="아이디 입력"
                autoComplete="username"
                autoFocus
                style={{
                  width: '100%', height: 44, padding: '0 14px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12, fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 600,
                  color: 'white', outline: 'none',
                  transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  fontFamily: 'inherit',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.18)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* PW */}
            <div>
              <label style={{ display: 'block', fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6, letterSpacing: '0.05em' }}>
                비밀번호
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => { setPw(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: 44, padding: '0 44px 0 14px',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 600,
                    color: 'white', outline: 'none',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#3b82f6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.18)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(148,163,184,0.6)', padding: 4, display: 'flex',
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 600, color: '#fca5a5',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white', fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
                transition: 'all 200ms ease',
                marginTop: 4,
                fontFamily: 'inherit',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    animation: 'spin-slow 0.7s linear infinite',
                  }} />
                  로그인 중...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  로그인
                </>
              )}
            </button>
          </form>

          {/* 회원가입 링크 */}
          <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 600, color: 'rgba(100,116,139,0.7)', whiteSpace: 'nowrap' }}>계정이 없으신가요?</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          <Link href="/signup" style={{ textDecoration: 'none', display: 'block', marginTop: '0.75rem' }}>
            <button
              type="button"
              style={{
                width: '100%', height: 44, borderRadius: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.85)', fontSize: 'calc(13.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 200ms ease',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
              }}
            >
              <UserPlus size={15} />
              회원가입
            </button>
          </Link>

          {/* Info */}
          <div style={{
            marginTop: '1rem', padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <ShieldCheck size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 'calc(11px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.7)', marginBottom: 2 }}>관리자 전용 시스템</p>
              <p style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', color: 'rgba(100,116,139,0.65)', lineHeight: 1.5 }}>
                인가된 계정만 접근할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
