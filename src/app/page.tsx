'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    try {
      const auth = localStorage.getItem('pm_auth')
      router.replace(auth ? '/dashboard' : '/login')
    } catch {
      router.replace('/login')
    }
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0d1117',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid rgba(59,130,246,0.3)',
        borderTopColor: '#3b82f6',
        animation: 'spin-slow 0.7s linear infinite',
      }} />
    </div>
  )
}
