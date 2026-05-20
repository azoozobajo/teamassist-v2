import React from 'react'
import { BookOpen } from 'lucide-react'

type NoteSummaryBoxProps = {
  notes: Array<{
    note_type?: string | null
    is_visible_to_player?: boolean | null
  }>
  showVisibilityBreakdown?: boolean
}

const NOTE_TYPE_ORDER = ['مدح', 'تطوير', 'توجيه', 'تحذير']

const NOTE_TYPE_STYLE: Record<string, string> = {
  مدح: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  تطوير: 'bg-amber-50 text-amber-700 border-amber-100',
  توجيه: 'bg-blue-50 text-blue-700 border-blue-100',
  تحذير: 'bg-red-50 text-red-700 border-red-100',
}

function SummaryTile({ label, value, className = 'bg-slate-50 text-slate-700 border-slate-100' }: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${className}`}>
      <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
      <div className="text-[11px] font-bold opacity-75 mt-1">{label}</div>
    </div>
  )
}

export function NotesSummaryBox({ notes, showVisibilityBreakdown = false }: NoteSummaryBoxProps) {
  const total = notes.length
  const visible = notes.filter(n => n.is_visible_to_player).length
  const hidden = total - visible

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">ملخص الملاحظات</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">نظرة سريعة قبل تفاصيل الملاحظات</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
          <BookOpen size={17}/>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <SummaryTile label="الإجمالي" value={total} className="bg-slate-900 text-white border-slate-900"/>
          {NOTE_TYPE_ORDER.map(type => (
            <SummaryTile
              key={type}
              label={type}
              value={notes.filter(n => n.note_type === type).length}
              className={NOTE_TYPE_STYLE[type]}
            />
          ))}
        </div>

        {showVisibilityBreakdown && (
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="مرئية للاعب" value={visible} className="bg-emerald-50 text-emerald-700 border-emerald-100"/>
            <SummaryTile label="خاصة للمدربين" value={hidden} className="bg-slate-50 text-slate-600 border-slate-100"/>
          </div>
        )}
      </div>
    </div>
  )
}
