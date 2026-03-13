import { cn } from '@/lib/utils'

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple' | 'indigo' | 'gray' | 'pink'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: BadgeVariant | 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'
  dot?: boolean
}

const variantMap: Record<string, string> = {
  default:     'pm-badge-blue',
  blue:        'pm-badge-blue',
  secondary:   'pm-badge-gray',
  gray:        'pm-badge-gray',
  destructive: 'pm-badge-red',
  red:         'pm-badge-red',
  success:     'pm-badge-green',
  green:       'pm-badge-green',
  warning:     'pm-badge-yellow',
  yellow:      'pm-badge-yellow',
  orange:      'pm-badge-orange',
  purple:      'pm-badge-purple',
  indigo:      'pm-badge-indigo',
  pink:        'pm-badge-pink',
  outline:     'pm-badge-gray',
}

const dotColorMap: Record<string, string> = {
  blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', red: '#ef4444',
  orange: '#f97316', purple: '#a855f7', indigo: '#6366f1', gray: '#94a3b8', pink: '#ec4899',
  default: '#3b82f6', secondary: '#94a3b8', destructive: '#ef4444',
  success: '#22c55e', warning: '#eab308', outline: '#94a3b8',
}

export function Badge({ children, className, variant = 'default', dot }: BadgeProps) {
  const cls = variantMap[variant as string] ?? 'pm-badge-gray'
  const dotColor = dotColorMap[variant as string] ?? '#94a3b8'
  return (
    <span className={cn('pm-badge', cls, className)}>
      {dot && (
        <span
          className="pm-badge-dot"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  )
}
