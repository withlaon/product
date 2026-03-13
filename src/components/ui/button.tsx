import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'success'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'pm-btn',
        variant === 'default'     && 'pm-btn-primary',
        variant === 'secondary'   && 'pm-btn-secondary',
        variant === 'destructive' && 'pm-btn-danger',
        variant === 'outline'     && 'pm-btn-outline',
        variant === 'ghost'       && 'pm-btn-ghost',
        variant === 'success'     && 'pm-btn-success',
        size === 'default' && '',
        size === 'sm'      && 'pm-btn-sm',
        size === 'lg'      && 'pm-btn-lg',
        size === 'icon'    && 'pm-btn-icon',
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'
export { Button }
