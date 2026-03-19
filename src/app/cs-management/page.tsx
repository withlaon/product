'use client'

import { HeadphonesIcon } from 'lucide-react'

export default function CsManagementPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <HeadphonesIcon size={32} style={{ color: '#059669' }} />
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>CS관리</h1>
      <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>준비 중인 기능입니다.</p>
    </div>
  )
}
