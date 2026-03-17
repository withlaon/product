'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'success' | 'error'

const MALL_NAMES: Record<string, string> = {
  cafe24 : '카페24',
  naver  : '네이버 스마트스토어',
  zigzag : '지그재그',
}

const MALL_COLORS: Record<string, { from: string; to: string; icon: string }> = {
  cafe24 : { from: '#4f46e5', to: '#7c3aed', icon: '🛍️' },
  naver  : { from: '#05c46b', to: '#0be881', icon: '🟢' },
  zigzag : { from: '#a855f7', to: '#7e22ce', icon: '🟣' },
}

function OAuthCallbackInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [status,  setStatus]  = useState<Status>('loading')
  const [mall,    setMall]    = useState('')
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const run = async () => {
      const code  = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')

      /* ── 에러 파라미터 수신 ── */
      if (error) {
        setStatus('error')
        setMessage(`인증이 거부되었습니다: ${searchParams.get('error_description') ?? error}`)
        return
      }

      if (!code) {
        setStatus('error')
        setMessage('인증 코드(code)가 없습니다. 쇼핑몰 연동 화면에서 다시 시도해 주세요.')
        return
      }

      /* ── state 디코딩 ── */
      let mallKey    = ''
      let clientId   = ''
      let shopId     = ''

      if (state) {
        try {
          const decoded = JSON.parse(atob(state.replace(/-/g, '+').replace(/_/g, '/')))
          mallKey  = decoded.mall      ?? ''
          clientId = decoded.client_id ?? ''
          shopId   = decoded.shop_id   ?? ''
        } catch {
          setStatus('error')
          setMessage('state 파라미터를 파싱하는 중 오류가 발생했습니다.')
          return
        }
      }

      setMall(mallKey)

      /* ── 현재 사용자 확인 ── */
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null

      /* ── 저장된 자격증명 불러오기 (client_secret 조회) ── */
      let clientSecret = ''
      if (userId && mallKey) {
        const { data: cred } = await supabase
          .from('pm_mall_credentials')
          .select('credentials')
          .eq('user_id', userId)
          .eq('mall_key', mallKey)
          .maybeSingle()
        clientSecret = cred?.credentials?.api_secret ?? ''
        if (!shopId) shopId = cred?.credentials?.seller_id ?? ''
      }

      /* ── 토큰 교환 API 호출 ── */
      try {
        const res = await fetch('/api/oauth', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            code,
            state,
            mall     : mallKey,
            client_id: clientId,
            client_secret: clientSecret,
            shop_id  : shopId,
            user_id  : userId,
          }),
        })
        const data = await res.json()

        if (!res.ok || !data.success) {
          setStatus('error')
          setMessage(data.error ?? '토큰 교환에 실패했습니다.')
          return
        }

        setStatus('success')
        setMessage(`${MALL_NAMES[mallKey] ?? mallKey} 연동이 완료되었습니다!`)

        /* ── 부모 창에 완료 메시지 전달 (팝업으로 열린 경우) ── */
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_SUCCESS', mall: mallKey }, '*')
        }

        /* ── 카운트다운 후 자동 이동 ── */
        let cnt = 5
        const timer = setInterval(() => {
          cnt--
          setCountdown(cnt)
          if (cnt <= 0) {
            clearInterval(timer)
            if (window.opener) {
              window.close()
            } else {
              router.replace('/channels')
            }
          }
        }, 1000)
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      }
    }

    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const color  = MALL_COLORS[mall] ?? { from: '#6366f1', to: '#8b5cf6', icon: '🔗' }
  const mallName = MALL_NAMES[mall] ?? mall ?? '쇼핑몰'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: 'var(--font-nanum, sans-serif)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '48px 40px',
        textAlign: 'center',
        maxWidth: 440,
        width: '90%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
      }}>

        {/* 상단 아이콘 */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, margin: '0 auto 20px',
          boxShadow: `0 8px 24px ${color.from}60`,
        }}>
          {status === 'loading' ? '⏳' : status === 'success' ? '✅' : '❌'}
        </div>

        {/* 상태별 내용 */}
        {status === 'loading' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: `3px solid ${color.from}30`,
                borderTopColor: color.from,
                animation: 'spin 0.8s linear infinite',
              }}/>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
              {mallName} OAuth 인증 처리 중
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
              인증 코드를 확인하고 액세스 토큰을 발급받고 있습니다.<br/>
              잠시만 기다려 주세요.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
              연동 완료!
            </h2>
            <p style={{ fontSize: 14, color: '#15803d', fontWeight: 700, marginBottom: 12 }}>
              {message}
            </p>
            <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.7 }}>
              액세스 토큰과 리프레시 토큰이 안전하게 저장되었습니다.<br/>
              이제 상품 등록 및 주문 수집을 자동화할 수 있습니다.
            </p>
            <div style={{
              marginTop: 20,
              background: '#f0fdf4', borderRadius: 10, padding: '10px 16px',
              border: '1px solid #bbf7d0',
            }}>
              <p style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                {window?.opener
                  ? `이 창이 ${countdown}초 후 자동으로 닫힙니다.`
                  : `${countdown}초 후 채널 관리 페이지로 이동합니다.`}
              </p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
              인증 실패
            </h2>
            <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 12, lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{
              marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center',
            }}>
              <button onClick={() => window.history.back()}
                style={{
                  padding: '9px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: 'white', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer',
                }}>
                뒤로가기
              </button>
              <button onClick={() => router.replace('/channels')}
                style={{
                  padding: '9px 20px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer',
                }}>
                채널 관리로 이동
              </button>
            </div>
          </>
        )}

        {/* 하단 도메인 표시 */}
        <p style={{ fontSize: 11, color: '#cbd5e1', marginTop: 24 }}>
          ProductPRO • OAuth 2.0 인증 콜백
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#0f172a,#1e293b)' }}>
        <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid rgba(99,102,241,0.3)', borderTopColor:'#6366f1', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <OAuthCallbackInner />
    </Suspense>
  )
}
