import React, { useEffect, useMemo, useState } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import { attendanceService } from '../../services'
import { Spinner } from '../ui'
import { EVENT_CONFIG } from '../../utils/helpers'

type Audience = 'admin' | 'player'

const EVENT_ORDER = ['match', 'training', 'education', 'meeting', 'assessment', 'camp', 'other']
const EVENT_FALLBACK: Record<string, { label: string; icon: string }> = {
  match: { label: 'مباراة', icon: '🏆' },
  training: { label: 'تدريب', icon: '⚽' },
  meeting: { label: 'اجتماع', icon: '📋' },
  education: { label: 'تعليم', icon: '🎓' },
  assessment: { label: 'اختبار', icon: '⏱️' },
  camp: { label: 'معسكر', icon: '🏕️' },
  other: { label: 'أخرى', icon: '📌' },
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  present: { label: 'حاضر', cls: 'bg-emerald-50 text-emerald-700' },
  late: { label: 'متأخر', cls: 'bg-amber-50 text-amber-700' },
  absent: { label: 'غائب بدون عذر', cls: 'bg-red-50 text-red-700' },
  excused: { label: 'غائب بعذر', cls: 'bg-blue-50 text-blue-700' },
  not_called: { label: 'غير مستدعى', cls: 'bg-slate-100 text-slate-500' },
}

const EXCUSE_LABELS: Record<string, string> = {
  leave: 'إجازة',
  injury: 'إصابة',
  nationalTeam: 'استدعاء منتخب',
  adminSuspension: 'إيقاف إداري',
  cards: 'إيقاف كروت',
  emergency: 'طارئ',
  academic: 'دراسة',
  family: 'عائلي',
  other: 'أخرى',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDateTime(iso?: string) {
  if (!iso) return { day: '', date: '—', time: '' }
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString('ar-SA', { weekday: 'short' }),
    date: d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
  }
}

function StatTile({ label, value, className = 'bg-slate-50 text-slate-700 border-slate-100' }: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${className}`}>
      <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
      <div className="text-[11px] font-bold opacity-75 mt-1">{label}</div>
    </div>
  )
}

function pctClass(value: number) {
  return value >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : value >= 60 ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-red-50 text-red-700 border-red-100'
}

export function AttendanceSummaryBox({ teamId, userId, audience = 'admin' }: {
  teamId?: string
  userId?: string
  audience?: Audience
}) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [applied, setApplied] = useState({ fromDate: '', toDate: '' })
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    if (!teamId || !userId) return
    setLoading(true)
    attendanceService.getPlayerAttendanceBreakdown(teamId, userId, applied)
      .then(setData)
      .finally(() => setLoading(false))
  }, [teamId, userId, applied.fromDate, applied.toDate])

  const filteredEvents = useMemo(() => {
    const rows = data?.events ?? []
    return rows.filter((row: any) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (typeFilter !== 'all' && row.eventType !== typeFilter) return false
      return true
    })
  }, [data, statusFilter, typeFilter])

  const summary = data?.summary
  const eventTypes = data?.byEventType ?? {}
  const excused = data?.excusedBreakdown ?? {}

  function applyFilters() {
    setApplied({ fromDate, toDate })
  }

  function resetFilters() {
    setFromDate('')
    setToDate('')
    setApplied({ fromDate: '', toDate: '' })
    setStatusFilter('all')
    setTypeFilter('all')
  }

  return (
    <div className="space-y-3">
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800">ملخص الحضور</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                كامل الموسم حتى اليوم، ولا تحتسب المواعيد المستقبلية
              </p>
            </div>
            {loading && <Spinner size="sm"/>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <label className="text-xs font-bold text-slate-500">
              من تاريخ
              <input className="form-input mt-1" type="date" value={fromDate} max={todayIso()} onChange={e => setFromDate(e.target.value)}/>
            </label>
            <label className="text-xs font-bold text-slate-500">
              إلى تاريخ
              <input className="form-input mt-1" type="date" value={toDate} max={todayIso()} onChange={e => setToDate(e.target.value)}/>
            </label>
            <button className="btn btn-primary btn-sm" onClick={applyFilters}>
              <Filter size={13}/> تطبيق
            </button>
            <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
              <RotateCcw size={13}/> كامل الموسم
            </button>
          </div>
        </div>

        {!summary ? (
          <div className="flex justify-center py-8"><Spinner/></div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <StatTile label="المواعيد" value={summary.totalEvents} className="bg-slate-900 text-white border-slate-900"/>
              <StatTile label="حضر" value={summary.present} className="bg-emerald-50 text-emerald-700 border-emerald-100"/>
              <StatTile label="تأخر" value={summary.late} className="bg-amber-50 text-amber-700 border-amber-100"/>
              <StatTile label="غياب بدون عذر" value={summary.absent} className="bg-red-50 text-red-700 border-red-100"/>
              <StatTile label="غياب بعذر" value={summary.excused} className="bg-blue-50 text-blue-700 border-blue-100"/>
              <StatTile label="دقائق التأخير" value={summary.lateMinutesTotal} />
              <StatTile label="متوسط التأخير" value={`${summary.lateAvgMinutes} د`} />
              <StatTile label="العامة" value={`${summary.generalRate}%`} className={pctClass(summary.generalRate)}/>
              <StatTile label="الفعلية" value={`${summary.effectiveRate}%`} className={pctClass(summary.effectiveRate)}/>
              <StatTile label="مقام الفعلية" value={summary.effectiveDenominator} />
            </div>

            {audience === 'admin' && data.notCalledMatches > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500 font-bold">
                توجد {data.notCalledMatches} مباراة لم يدخلها اللاعب في الحساب لأنه غير مستدعى للقائمة.
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <>
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">تقسيم حسب نوع الموعد</h3>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {EVENT_ORDER.map(type => {
                const bucket = eventTypes[type]
                const cfg = (EVENT_CONFIG as any)[type] || EVENT_FALLBACK[type]
                return (
                  <div key={type} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-extrabold text-sm text-slate-800">{cfg.icon} {cfg.label}</div>
                      <div className="text-xs font-bold text-slate-500">{bucket?.totalEvents || 0} موعد</div>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      <div><div className="font-bold text-emerald-700">{bucket?.present || 0}</div><div className="text-[10px] text-slate-400">حضر</div></div>
                      <div><div className="font-bold text-amber-700">{bucket?.late || 0}</div><div className="text-[10px] text-slate-400">تأخر</div></div>
                      <div><div className="font-bold text-red-600">{bucket?.absent || 0}</div><div className="text-[10px] text-slate-400">غاب</div></div>
                      <div><div className="font-bold text-blue-600">{bucket?.excused || 0}</div><div className="text-[10px] text-slate-400">بعذر</div></div>
                      <div><div className="font-bold text-slate-800">{bucket?.effectiveRate || 0}%</div><div className="text-[10px] text-slate-400">فعلي</div></div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      العامة {bucket?.generalRate || 0}% · الفعلية {bucket?.effectiveRate || 0}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">مصادر الغياب بعذر</h3>
            </div>
            <div className="p-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
              {Object.entries(EXCUSE_LABELS).map(([key, label]) => (
                <div key={key} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
                  <div className="text-lg font-extrabold text-slate-800">{excused[key] || 0}</div>
                  <div className="text-[10px] font-bold text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-slate-800">تفاصيل المواعيد</h3>
                <span className="text-xs font-bold text-slate-400">{filteredEvents.length} سجل</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select className="form-input text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">كل الحالات</option>
                  <option value="present">حضور</option>
                  <option value="late">تأخير</option>
                  <option value="absent">غياب بدون عذر</option>
                  <option value="excused">غياب بعذر</option>
                  <option value="not_called">غير مستدعى</option>
                </select>
                <select className="form-input text-xs" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="all">كل الأنواع</option>
                  {EVENT_ORDER.map(type => {
                    const cfg = (EVENT_CONFIG as any)[type] || EVENT_FALLBACK[type]
                    return <option key={type} value={type}>{cfg.label}</option>
                  })}
                </select>
              </div>
            </div>
            {filteredEvents.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">لا توجد مواعيد ضمن الفلتر</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredEvents.map((row: any) => {
                  const cfg = (EVENT_CONFIG as any)[row.eventType] || EVENT_FALLBACK.other
                  const status = STATUS_LABEL[row.status] || STATUS_LABEL.absent
                  const dt = fmtDateTime(row.event?.start_datetime)
                  return (
                    <div key={`${row.eventId}-${row.status}`} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-500">{cfg.icon} {cfg.label}</span>
                          <span className="font-bold text-sm text-slate-800 truncate">{row.event?.title || 'موعد'}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{dt.day} · {dt.date}{dt.time ? ` · ${dt.time}` : ''}</div>
                        {row.status === 'late' && row.lateMinutes > 0 && (
                          <div className="text-[11px] text-amber-700 mt-1">تأخير {row.lateMinutes} دقيقة</div>
                        )}
                        {row.status === 'excused' && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {audience === 'admin' ? (row.excuseReason || 'غياب بعذر') : 'غياب بعذر'}
                          </div>
                        )}
                        {row.status === 'not_called' && (
                          <div className="text-[11px] text-slate-500 mt-1">هذه المباراة لا تدخل في نسبة حضور اللاعب.</div>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${status.cls}`}>
                        {status.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
