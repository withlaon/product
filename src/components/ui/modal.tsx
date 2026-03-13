'use client'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function Modal({ isOpen, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div
        className={cn('pm-modal w-full', sizeMap[size], className)}
        onClick={e => e.stopPropagation()}
      >
        <div className="pm-modal-header">
          <h2 className="text-[14.5px] font-extrabold text-slate-800 tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            style={{ transition: 'all 150ms var(--ease)' }}
          >
            <X size={15} />
          </button>
        </div>
        <div className="pm-modal-body">{children}</div>
      </div>
    </div>
  )
}
