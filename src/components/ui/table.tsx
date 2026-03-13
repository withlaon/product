import { cn } from '@/lib/utils'
interface P { children: React.ReactNode; className?: string }

export function Table({ children, className }: P) {
  return (
    <div className="pm-table-wrap">
      <table className={cn('pm-table', className)}>{children}</table>
    </div>
  )
}
export function TableHeader({ children }: P) { return <thead>{children}</thead> }
export function TableBody({ children }: P)   { return <tbody>{children}</tbody> }
export function TableRow({ children, className }: P) { return <tr className={className}>{children}</tr> }
export function TableHead({ children, className }: P) { return <th className={className}>{children}</th> }
export function TableCell({ children, className }: P) { return <td className={className}>{children}</td> }
