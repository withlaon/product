'use client'
import { cn } from '@/lib/utils'
import { SelectHTMLAttributes, forwardRef } from 'react'

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn('pm-input pm-select', className)}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'
export { Select }
