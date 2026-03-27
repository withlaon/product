'use client'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = { sm: 480, md: 560, lg: 720, xl: 900 }

export function Modal({ isOpen, onClose, title, children, className, size = 'md' }: ModalProps) {
  const [mounted, setMounted] = useState(false)
  // 드래그 시작이 백드롭인지 추적 (입력칸 드래그→백드롭 해제 방지)
  const mouseDownOnBackdrop = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  // 키보드 ESC 닫기
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !mounted) return null

  const maxW = sizeMap[size]

  return createPortal(
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2,6,23,0.62)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '2rem 1rem 4rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={cn(className)}
        style={{
          position: 'relative',
          background: 'white',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(2,6,23,0.28)',
          border: '1px solid rgba(255,255,255,0.7)',
          width: '100%',
          maxWidth: maxW,
          margin: '0 auto',
        }}
      >
        {/* 헤더 — sticky */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(15,23,42,0.07)',
          background: '#fafbfc',
          borderRadius: '20px 20px 0 0',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <h2 style={{ fontSize: 'calc(14.5px + var(--pm-list-fs-add, 0pt))', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.01em' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', color: '#94a3b8',
              cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* 바디 */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
