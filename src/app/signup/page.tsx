'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Boxes, Eye, EyeOff, UserPlus, ArrowLeft, CheckCircle2, User, Lock, Mail } from 'lucide-react'
import { signUp, getSession } from '@/lib/auth'

export default function SignupPage() {
  const router = useRouter()

  const [form, setForm]   = useState({ name: '', id: '', email: '', pw: '', pwConfirm: '' })
  const [showPw, setShowPw]   = useState(false)
  const [showPwC, setShowPwC] = useState(false)
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [doneUser, setDoneUser] = useState('')

  useEffect(() => {
    getSession().then(session => {
      if (session) router.replace('/dashboard')
    })
  }, [router])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim())       e.name      = '이름을 입력하세요.'
    if (!form.id.trim())         e.id        = '아이디를 입력하세요.'
    else if (form.id.length < 4) e.id        = '아이디는 4자 이상이어야 합니다.'
    else if (!/^[a-zA-Z0-9_]+$/.test(form.id)) e.id = '영문, 숫자, 언더스코어만 사용 가능합니다.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = '올바른 이메일 형식이 아닙니다.'
    if (!form.pw)                e.pw        = '비밀번호를 입력하세요.'
    else if (form.pw.length < 6) e.pw        = '비밀번호는 6자 이상이어야 합니다.'
    if (form.pw !== form.pwConfirm) e.pwConfirm = '비밀번호가 일치하지 않습니다.'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setLoading(true)

    const { error } = await signUp(form.id, form.pw, form.name)
    if (error) {
      setErrors({ id: error })
      setLoading(false)
      return
    }

    setDoneUser(form.name)
    setLoading(false)
    setDone(true)
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    width: '100%', height: 44, padding: '0 14px',
    background: 'rgba(255,255,255,0.07)',
    border: `1px solid ${hasErr ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 12, fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 600,
    color: 'white', outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
    fontFamily: 'inherit',
  })

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#3b82f6'
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.18)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>, hasErr: boolean) => {
    e.currentTarget.style.borderColor = hasErr ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0d1117 0%, #0a0f1e 60%, #060d1a 100%)',
      padding: '2rem 1rem', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 90% 0%, rgba(99,102,241,0.1) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 10% 100%, rgba(59,130,246,0.08) 0%, transparent 60%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 24, padding: '2.5rem',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        animation: 'fade-up 400ms cubic-bezier(0,0,0.2,1) both',
        position: 'relative',
      }}>
        {/* 뒤로가기 */}
        <Link href="/login" style={{
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
          marginBottom: '1.5rem', color: 'rgba(148,163,184,0.7)', fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 700,
          transition: 'color 150ms ease',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.7)')}
        >
          <ArrowLeft size={14} />
          로그인으로 돌아가기
        </Link>

        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.75rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Boxes size={22} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 'calc(20px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', marginBottom: 3 }}>
              회원가입
            </h2>
            <p style={{ fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', color: 'rgba(148,163,184,0.7)', fontWeight: 500 }}>
              ProductPRO 계정을 만드세요
            </p>
          </div>
        </div>

        {/* ── 가입 완료 화면 ── */}
        {done ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(16,185,129,0.15)',
              border: '2px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}>
              <CheckCircle2 size={30} color="#34d399" />
            </div>
            <h3 style={{ fontSize: 'calc(17px + var(--pm-list-fs-add, 0pt))', fontWeight: 800, color: 'white', marginBottom: 8 }}>가입 완료!</h3>
            <p style={{ fontSize: 'calc(13px + var(--pm-list-fs-add, 0pt))', color: 'rgba(148,163,184,0.75)', lineHeight: 1.7, marginBottom: '1.75rem' }}>
              <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{doneUser}</strong>님, 환영합니다!<br />
              지금 바로 로그인하실 수 있습니다.
            </p>
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button style={{
                width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white', fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
                fontFamily: 'inherit',
              }}>
                로그인 하기
              </button>
            </Link>
          </div>
        ) : (
          /* ── 가입 폼 ── */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* 이름 */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6 }}>
                <User size={11} /> 이름
              </label>
              <input
                type="text" value={form.name} onChange={set('name')}
                placeholder="홍길동" autoComplete="name" autoFocus
                style={inputStyle(!!errors.name)}
                onFocus={onFocus} onBlur={e => onBlur(e, !!errors.name)}
              />
              {errors.name && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#f87171', marginTop: 5, fontWeight: 600 }}>⚠ {errors.name}</p>}
            </div>

            {/* 아이디 */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6 }}>
                <User size={11} /> 아이디
              </label>
              <input
                type="text" value={form.id} onChange={set('id')}
                placeholder="영문/숫자 4자 이상" autoComplete="username"
                style={inputStyle(!!errors.id)}
                onFocus={onFocus} onBlur={e => onBlur(e, !!errors.id)}
              />
              {errors.id && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#f87171', marginTop: 5, fontWeight: 600 }}>⚠ {errors.id}</p>}
            </div>

            {/* 이메일 (선택) */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6 }}>
                <Mail size={11} /> 이메일 <span style={{ fontSize: 'calc(10.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 500, color: 'rgba(100,116,139,0.65)' }}>(선택)</span>
              </label>
              <input
                type="email" value={form.email} onChange={set('email')}
                placeholder="example@email.com" autoComplete="email"
                style={inputStyle(!!errors.email)}
                onFocus={onFocus} onBlur={e => onBlur(e, !!errors.email)}
              />
              {errors.email && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#f87171', marginTop: 5, fontWeight: 600 }}>⚠ {errors.email}</p>}
            </div>

            {/* 비밀번호 */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6 }}>
                <Lock size={11} /> 비밀번호
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={form.pw} onChange={set('pw')}
                  placeholder="6자 이상" autoComplete="new-password"
                  style={{ ...inputStyle(!!errors.pw), paddingRight: 44 }}
                  onFocus={onFocus} onBlur={e => onBlur(e, !!errors.pw)}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.6)', padding: 4, display: 'flex' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.pw && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#f87171', marginTop: 5, fontWeight: 600 }}>⚠ {errors.pw}</p>}
            </div>

            {/* 비밀번호 확인 */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'calc(12px + var(--pm-list-fs-add, 0pt))', fontWeight: 700, color: 'rgba(148,163,184,0.8)', marginBottom: 6 }}>
                <Lock size={11} /> 비밀번호 확인
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwC ? 'text' : 'password'} value={form.pwConfirm} onChange={set('pwConfirm')}
                  placeholder="비밀번호 재입력" autoComplete="new-password"
                  style={{ ...inputStyle(!!errors.pwConfirm), paddingRight: 44 }}
                  onFocus={onFocus} onBlur={e => onBlur(e, !!errors.pwConfirm)}
                />
                <button type="button" onClick={() => setShowPwC(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.6)', padding: 4, display: 'flex' }}>
                  {showPwC ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.pwConfirm && <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#f87171', marginTop: 5, fontWeight: 600 }}>⚠ {errors.pwConfirm}</p>}
              {form.pw && form.pwConfirm && !errors.pwConfirm && form.pw === form.pwConfirm && (
                <p style={{ fontSize: 'calc(11.5px + var(--pm-list-fs-add, 0pt))', color: '#34d399', marginTop: 5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> 비밀번호가 일치합니다
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{
                height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: 'white', fontSize: 'calc(14px + var(--pm-list-fs-add, 0pt))', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)',
                transition: 'all 200ms ease', marginTop: 4,
                fontFamily: 'inherit',
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin-slow 0.7s linear infinite' }} />
                  처리 중...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  가입하기
                </>
              )}
            </button>

            <p style={{ textAlign: 'center', fontSize: 'calc(12.5px + var(--pm-list-fs-add, 0pt))', color: 'rgba(100,116,139,0.75)', marginTop: 2 }}>
              이미 계정이 있으신가요?{' '}
              <Link href="/login" style={{ color: '#818cf8', fontWeight: 700, textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a5b4fc')}
                onMouseLeave={e => (e.currentTarget.style.color = '#818cf8')}
              >
                로그인
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
