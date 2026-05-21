import React, { useEffect, useState } from 'react'
import { BookOpen, CalendarDays, Clock, MapPin, UserRound } from 'lucide-react'
import { educationService } from '../../services'
import { Spinner } from '../ui'
import { supabase } from '../../lib/supabase'

const TYPE_LABELS: Record<string, string> = {
  lecture: 'محاضرة',
  course: 'دورة',
  workshop: 'ورشة عمل',
  training: 'تدريب',
  awareness: 'توعية',
  meeting: 'لقاء',
  quiz: 'اختبار',
  other: 'أخرى',
}

const CATEGORY_LABELS: Record<string, string> = {
  psychological: 'نفسي',
  medical: 'طبي',
  media: 'إعلامي',
  discipline: 'انضباط',
  nutrition: 'تغذية',
  tactical: 'تكتيكي',
  legal: 'قانوني',
  professional: 'احترافي',
  social: 'اجتماعي',
  other: 'أخرى',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  present: { label: 'حضر', cls: 'bg-emerald-50 text-emerald-700' },
  late: { label: 'تأخر', cls: 'bg-amber-50 text-amber-700' },
  absent: { label: 'غائب بدون عذر', cls: 'bg-red-50 text-red-700' },
  excused: { label: 'غائب بعذر', cls: 'bg-slate-100 text-slate-600' },
  uncertain: { label: 'غائب بدون عذر', cls: 'bg-red-50 text-red-700' },
  pending: { label: 'لم يبدأ', cls: 'bg-blue-50 text-blue-700' },
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function Stat({ label, value, cls = 'bg-slate-50 text-slate-700 border-slate-100' }: {
  label: string
  value: React.ReactNode
  cls?: string
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
      <div className="text-[11px] font-bold opacity-75 mt-1">{label}</div>
    </div>
  )
}

export function EducationSummaryBox({ teamId, userId, audience = 'admin' }: {
  teamId?: string
  userId?: string
  audience?: 'admin' | 'player'
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  async function load() {
    if (!teamId || !userId) return
    setLoading(true)
    educationService.getPlayerSummary(teamId, userId)
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [teamId, userId])

  useEffect(() => {
    if (!teamId || !userId) return
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    const channel = supabase.channel(`player-education:${teamId}:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `team_id=eq.${teamId}`,
      }, (payload: any) => {
        const row = payload.new || payload.old
        if (row?.user_id === userId) refresh()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'education_events',
        filter: `team_id=eq.${teamId}`,
      }, refresh)
      .subscribe()
    return () => {
      window.removeEventListener('focus', refresh)
      channel.unsubscribe()
    }
  }, [teamId, userId])

  if (loading) {
    return <div className="card flex justify-center py-8"><Spinner/></div>
  }

  const summary = data?.summary ?? {}
  const rows = data?.rows ?? []

  return (
    <div className="space-y-3">
      <div className="card p-0 overflow-hidden">
        <div className="bg-teal-50 border-b border-teal-100 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <BookOpen size={16} className="text-teal-600"/> ملخص التعليم
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {audience === 'player'
                ? 'الدورات والمحاضرات التي ظهرت لك وانتهى موعدها'
                : 'ملخص حضور اللاعب في مواعيد التعليم المنتهية'}
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Stat label="مواعيد التعليم" value={summary.total ?? 0} />
            <Stat label="أنجز" value={summary.completed ?? 0} cls="bg-emerald-50 text-emerald-700 border-emerald-100" />
            <Stat label="تأخر" value={summary.late ?? 0} cls="bg-amber-50 text-amber-700 border-amber-100" />
            <Stat label="غياب بعذر" value={summary.excused ?? 0} cls="bg-slate-50 text-slate-600 border-slate-100" />
            <Stat label="غياب بدون عذر" value={summary.absent ?? 0} cls="bg-red-50 text-red-700 border-red-100" />
            <Stat label="قادمة" value={summary.upcoming ?? 0} cls="bg-blue-50 text-blue-700 border-blue-100" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs font-extrabold text-slate-500 mb-2">حسب التصنيف</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data?.byCategory ?? {}).length === 0
                  ? <span className="text-xs text-slate-400">لا توجد بيانات</span>
                  : Object.entries(data.byCategory).map(([key, count]: any) => (
                    <span key={key} className="text-xs font-bold bg-white border border-slate-100 rounded-lg px-2 py-1">
                      {CATEGORY_LABELS[key] || key}: {count}
                    </span>
                  ))}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs font-extrabold text-slate-500 mb-2">حسب النوع</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data?.byType ?? {}).length === 0
                  ? <span className="text-xs text-slate-400">لا توجد بيانات</span>
                  : Object.entries(data.byType).map(([key, count]: any) => (
                    <span key={key} className="text-xs font-bold bg-white border border-slate-100 rounded-lg px-2 py-1">
                      {TYPE_LABELS[key] || key}: {count}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">سجل التعليم</h3>
          <span className="text-xs font-bold text-slate-400">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">لا توجد مواعيد تعليم حتى الآن</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((row: any) => {
              const edu = row.education || {}
              const presenters = edu.presenter_names?.length ? edu.presenter_names : edu.presenter_name ? [edu.presenter_name] : []
              const displayStatus = !row.isPast && !row.hasAttendance ? 'pending' : row.status
              const status = STATUS_LABELS[displayStatus] || STATUS_LABELS.absent
              return (
                <div key={row.event.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-800 truncate">{row.event.title}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><CalendarDays size={12}/>{formatDate(row.event.start_datetime)}</span>
                        <span className="inline-flex items-center gap-1"><MapPin size={12}/>{edu.location_detail || row.event.location || 'بدون موقع'}</span>
                        {presenters.length > 0 && <span className="inline-flex items-center gap-1"><UserRound size={12}/>{presenters.join('، ')}</span>}
                        {row.status === 'late' && <span className="inline-flex items-center gap-1"><Clock size={12}/>{row.lateMinutes} دقيقة</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] font-bold rounded-lg bg-teal-50 text-teal-700 px-2 py-0.5">{TYPE_LABELS[edu.education_type] || 'تعليم'}</span>
                        <span className="text-[10px] font-bold rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5">{CATEGORY_LABELS[edu.education_category] || 'أخرى'}</span>
                        {edu.provider_name && (
                          <span className="text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 px-2 py-0.5">
                            {edu.provider_type === 'external' ? 'خارجي' : 'النادي'}: {edu.provider_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-[11px] font-bold rounded-lg px-2 py-1 ${status.cls}`}>{status.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
