'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const MALL_COLORS: Record<string, { from: string; to: string }> = {
  cafe24 : { from: '#4f46e5', to: '#7c3aed' },
  naver  : { from: '#05c46b', to: '#0be881' },
  zigzag : { from: '#a855f7', to: '#7e22ce' },
}

interface Props {
  status       : 'success' | 'error'
  mall         : string
  mallName?    : string
  message      : string
  refresh_token: string
  access_token?: string
}

export function OAuthResultClient({ status, mall, mallName, message, refresh_token, access_token }: Props) {
  const router     = useRouter()
  const [cnt, setCnt] = useState(5)
  const color      = MALL_COLORS[mall] ?? { from: '#6366f1', to: '#8b5cf6' }
  const displayName = mallName ?? mall ?? '쇼핑몰'

  /* ── 성공 시 부모 창에 즉시 postMessage ── */
  useEffect(() => {
    if (status !== 'success') return

    if (window.opener) {
      window.opener.postMessage({
        type : 'OAUTH_SUCCESS',
        mall,
        refresh_token,
        access_token: access_token ?? '',
      }, '*')
    }

    const timer = setInterval(() => {
      setCnt(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          if (window.opener) window.close()
          else router.replace('/channels')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '48px 40px',
        textAlign: 'center', maxWidth: 440, width: '90%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
      }}>
        {/* 아이콘 */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, margin: '0 auto 20px',
          boxShadow: `0 8px 24px ${color.from}60`,
        }}>
          {status === 'success' ? '✅' : '❌'}
        </div>

        {status === 'success' ? (
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
              marginTop: 20, background: '#f0fdf4', borderRadius: 10,
              padding: '10px 16px', border: '1px solid #bbf7d0',
            }}>
              <p style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                {typeof window !== 'undefined' && window.opener
                  ? `이 창이 ${cnt}초 후 자동으로 닫힙니다.`
                  : `${cnt}초 후 채널 관리 페이지로 이동합니다.`}
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
              인증 실패
            </h2>
            <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 12, lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => window.history.back()}
                style={{
                  padding: '9px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: 'white', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer',
                }}>
                뒤로가기
              </button>
              <button
                onClick={() => router.replace('/channels')}
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

        <p style={{ fontSize: 11, color: '#cbd5e1', marginTop: 24 }}>
          ProductPRO • OAuth 2.0 인증 콜백 — {displayName}
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
