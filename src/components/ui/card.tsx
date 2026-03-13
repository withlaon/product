import { cn } from '@/lib/utils'

interface CardProps { children: React.ReactNode; className?: string; interactive?: boolean }

export function Card({ children, className, interactive }: CardProps) {
  return (
    <div className={cn('pm-card', interactive && 'pm-card-interactive cursor-pointer', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 pt-5 pb-0', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[13.5px] font-extrabold text-slate-800 tracking-tight leading-snug', className)}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[12px] text-[var(--color-faint)] mt-0.5 font-medium', className)}>{children}</p>
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 pb-5 pt-4', className)}>{children}</div>
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-5 pb-4 pt-0 flex items-center border-t border-[rgba(15,23,42,0.06)] mt-0', className)}>
      {children}
    </div>
  )
}
