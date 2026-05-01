import React, { useState, useRef, useEffect } from 'react'
import { X, AlertCircle, CheckCircle, Info, Loader2, Search, Eye, EyeOff, Upload, ChevronDown } from 'lucide-react'
import { cn, getInitials } from '../../utils/helpers'

// ── Spinner ───────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' }[size]
  return <Loader2 className={cn(s, 'animate-spin text-brand-500', className)} />
}

export function LoadingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center mb-5 shadow-lg">
        <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
          <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.4C17.25 22.15 21 17.25 21 12V7l-9-5z"/>
        </svg>
      </div>
      <Spinner size="lg" />
      <p className="text-slate-400 text-sm mt-3 font-medium">جاري التحميل...</p>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────
export function Avatar({ name, src, size = 'md', badge, className }: {
  name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'; badge?: number; className?: string
}) {
  const sizes = {
    xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl', '2xl': 'w-24 h-24 text-3xl'
  }
  return (
    <div className={cn('relative flex-shrink-0', className)}>
      {src ? (
        <img src={src} className={cn(sizes[size], 'rounded-full object-cover ring-2 ring-white')} alt={name} />
      ) : (
        <div className={cn(sizes[size], 'rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white font-bold flex items-center justify-center ring-2 ring-white shadow-sm')}>
          {getInitials(name)}
        </div>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5 border border-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
  )
}

// ── Alert ─────────────────────────────────────────────────────────────
export function Alert({ type, message, onClose }: { type: 'success' | 'error' | 'info'; message: string; onClose?: () => void }) {
  const cfg = {
    success: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: CheckCircle },
    error:   { cls: 'bg-red-50 border-red-200 text-red-800', Icon: AlertCircle },
    info:    { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Info },
  }[type]
  return (
    <div className={cn('flex items-start gap-2.5 p-3 rounded-xl border text-sm animate-fade', cfg.cls)}>
      <cfg.Icon size={16} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={14} /></button>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-md', footer }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; width?: string; footer?: React.ReactNode
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <div className="modal-overlay animate-fade" onClick={onClose}>
      <div className={cn('modal-box animate-fade', width)} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h3 className="modal-title mb-0">{title}</h3>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1">{children}</div>
        {footer && <div className="mt-5 pt-4 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  )
}

// ── FormField ─────────────────────────────────────────────────────────
export function FormField({ label, required, children, hint, error }: {
  label?: string; required?: boolean; children: React.ReactNode; hint?: string; error?: string
}) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}{required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string; badge?: number }[]
  active: string; onChange: (k: string) => void
}) {
  return (
    <div className="flex border-b border-slate-100 mb-5 gap-1">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn('tab-btn flex items-center gap-1.5', active === t.key && 'active')}>
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="bg-brand-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon, color, onClick }: {
  label: string; value: string | number; sub?: string; icon?: string; color?: string; onClick?: () => void
}) {
  return (
    <div className={cn('stat-box', onClick && 'cursor-pointer hover:bg-slate-100 transition-colors')} onClick={onClick}>
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div className={cn('stat-value', color)}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-xs text-slate-300 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── PageHeader ────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, back, action }: {
  title: string; subtitle?: string; back?: () => void; action?: React.ReactNode
}) {
  return (
    <div className="page-header gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        {back && (
          <button onClick={back} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex gap-2 flex-wrap">{action}</div>}
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div className="text-center py-12">
      {icon && <div className="flex justify-center mb-3 text-slate-300">{icon}</div>}
      <p className="font-bold text-slate-500 mb-1">{title}</p>
      {description && <p className="text-xs text-slate-400 mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────
export function ProgressBar({ value, color = 'bg-brand-500', height = 'h-2' }: {
  value: number; color?: string; height?: string
}) {
  return (
    <div className={cn('progress', height)}>
      <div className={cn('progress-fill', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

// ── SearchBox ─────────────────────────────────────────────────────────
export function SearchBox({ placeholder, value, onChange }: {
  placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
      <Search size={14} className="text-slate-400 flex-shrink-0" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent border-none outline-none text-sm flex-1" />
      {value && <button onClick={() => onChange('')} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>}
    </div>
  )
}

// ── ConfirmDialog ─────────────────────────────────────────────────────
export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger, loading }: {
  open: boolean; title: string; message: string; onConfirm: () => void;
  onCancel: () => void; danger?: boolean; loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600 mb-5">{message}</p>
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
        <button className={cn('btn', danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'تأكيد'}
        </button>
      </div>
    </Modal>
  )
}

// ── AttendanceButton ──────────────────────────────────────────────────
export function AttendanceButton({ status, onSelect, locked, compact }: {
  status: string; onSelect: (s: string) => void; locked?: boolean; compact?: boolean
}) {
  const options = [
    { key: 'present', label: 'حاضر', icon: '✓', cls: 'bg-emerald-500 text-white', inactiveCls: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
    { key: 'uncertain', label: 'غير متأكد', icon: '?', cls: 'bg-amber-400 text-white', inactiveCls: 'border-amber-200 text-amber-600 hover:bg-amber-50' },
    { key: 'absent', label: 'غائب', icon: '✗', cls: 'bg-red-500 text-white', inactiveCls: 'border-red-200 text-red-600 hover:bg-red-50' },
    { key: 'late', label: 'متأخر', icon: '⏱', cls: 'bg-orange-400 text-white', inactiveCls: 'border-orange-200 text-orange-600 hover:bg-orange-50' },
  ]
  return (
    <div className={cn('flex gap-1.5', compact && 'gap-1')}>
      {options.map(o => (
        <button key={o.key} disabled={locked}
          onClick={() => !locked && onSelect(o.key)}
          className={cn(
            'rounded-xl border font-bold transition-all',
            compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs',
            status === o.key ? o.cls : cn('bg-white', o.inactiveCls),
            locked && 'opacity-50 cursor-not-allowed'
          )}>
          {compact ? o.icon : `${o.icon} ${o.label}`}
        </button>
      ))}
    </div>
  )
}

// ── ImageUpload ───────────────────────────────────────────────────────
export function ImageUpload({ value, onChange, label = 'رفع صورة' }: {
  value?: string | null; onChange: (url: string) => void; label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setUploading(true)
          // In a real app, upload to Supabase storage
          const reader = new FileReader()
          reader.onload = (ev) => { onChange(ev.target?.result as string); setUploading(false) }
          reader.readAsDataURL(file)
        }} />
      <div className="flex items-center gap-3">
        {value && <img src={value} className="w-14 h-14 rounded-xl object-cover border border-slate-200" alt="preview" />}
        <button onClick={() => ref.current?.click()} disabled={uploading}
          className="btn btn-ghost btn-sm flex items-center gap-2">
          {uploading ? <Spinner size="sm" /> : <Upload size={14} />}
          {label}
        </button>
      </div>
    </div>
  )
}

// ── CheckboxList ──────────────────────────────────────────────────────
export function CheckboxList({ items, selected, onChange, maxH = 'max-h-36' }: {
  items: { value: string; label: string; sub?: string }[]
  selected: string[]; onChange: (v: string[]) => void; maxH?: string
}) {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }
  return (
    <div className={cn('overflow-y-auto border border-slate-200 rounded-xl', maxH)}>
      {items.map(item => (
        <label key={item.value} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0">
          <input type="checkbox" checked={selected.includes(item.value)} onChange={() => toggle(item.value)}
            className="w-4 h-4 accent-brand-500 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium">{item.label}</div>
            {item.sub && <div className="text-xs text-slate-400">{item.sub}</div>}
          </div>
        </label>
      ))}
    </div>
  )
}
