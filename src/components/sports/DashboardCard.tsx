import React from 'react'
import { cn } from '../../utils/helpers'

export default function DashboardCard({
  title,
  value,
  hint,
  icon,
  tone = 'emerald',
  children,
  className,
}: {
  title?: string
  value?: string | number
  hint?: string
  icon?: React.ReactNode
  tone?: 'emerald' | 'blue' | 'orange' | 'red' | 'slate'
  children?: React.ReactNode
  className?: string
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  }

  return (
    <section className={cn('rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', className)}>
      {(title || icon) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-extrabold text-slate-900">{title}</h2>}
          {icon && <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', tones[tone])}>{icon}</div>}
        </div>
      )}
      {value !== undefined && <div className="text-3xl font-extrabold text-slate-950">{value}</div>}
      {hint && <p className="mt-1 text-[16px] leading-7 text-slate-500">{hint}</p>}
      {children}
    </section>
  )
}
