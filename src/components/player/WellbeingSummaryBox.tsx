import React, { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Brain, CheckCircle2, Moon, ShieldAlert, Zap } from 'lucide-react'
import { Spinner } from '../ui'
import { cn, formatDate } from '../../utils/helpers'

export type WellbeingEntry = {
  id?: string
  team_id?: string
  player_id?: string
  entry_date: string
  sleep_quality: number
  fatigue_level: number
  muscle_soreness: number
  stress_level: number
  mood_level: number
  energy_level: number
  pain_area?: string | null
  notes?: string | null
  readiness_score: number
  status: 'green' | 'yellow' | 'red'
  medical_note?: string | null
  reviewed_at?: string | null
  reviewer?: { full_name?: string | null } | null
}

type FormState = {
  sleep_quality: number
  fatigue_level: number
  muscle_soreness: number
  stress_level: number
  mood_level: number
  energy_level: number
  pain_area: string
  notes: string
}

const METRICS = [
  { key: 'sleep_quality', label: 'النوم', goodHigh: true, icon: Moon },
  { key: 'fatigue_level', label: 'الإرهاق', goodHigh: false, icon: Activity },
  { key: 'muscle_soreness', label: 'ألم العضلات', goodHigh: false, icon: ShieldAlert },
  { key: 'stress_level', label: 'الضغط', goodHigh: false, icon: Brain },
  { key: 'mood_level', label: 'المزاج', goodHigh: true, icon: CheckCircle2 },
  { key: 'energy_level', label: 'الطاقة', goodHigh: true, icon: Zap },
] as const

const STATUS = {
  green: { label: 'جاهز', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  yellow: { label: 'يحتاج متابعة', cls: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-400' },
  red: { label: 'يحتاج تدخل', cls: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' },
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function calculateReadiness(input: FormState | WellbeingEntry) {
  const positive = Number(input.sleep_quality || 0) + Number(input.mood_level || 0) + Number(input.energy_level || 0)
  const inverse = (6 - Number(input.fatigue_level || 0)) + (6 - Number(input.muscle_soreness || 0)) + (6 - Number(input.stress_level || 0))
  const score = Math.max(0, Math.min(100, Math.round(((positive + inverse) / 30) * 100)))
  const redFlag = Number(input.sleep_quality) <= 2
    || Number(input.fatigue_level) >= 4
    || Number(input.muscle_soreness) >= 4
    || Number(input.stress_level) >= 4
    || score < 55
  const status: 'green' | 'yellow' | 'red' = redFlag ? 'red' : score < 72 ? 'yellow' : 'green'
  return { score, status }
}

function avg(items: number[]) {
  if (!items.length) return 0
  return Math.round((items.reduce((s, v) => s + v, 0) / items.length) * 10) / 10
}

function buildAlerts(entries: WellbeingEntry[]) {
  const latest = entries[0]
  const last3 = entries.slice(0, 3)
  const alerts: string[] = []
  if (!latest) return alerts
  if (latest.status === 'red') alerts.push('آخر قراءة حمراء وتحتاج مراجعة قبل رفع الحمل.')
  if (last3.length >= 2 && last3.slice(0, 2).every(e => e.fatigue_level >= 4)) alerts.push('إرهاق مرتفع في يومين متتاليين.')
  if (last3.length >= 2 && last3.slice(0, 2).every(e => e.sleep_quality <= 2)) alerts.push('جودة النوم منخفضة في يومين متتاليين.')
  if (last3.length >= 2 && last3.slice(0, 2).every(e => e.muscle_soreness >= 4)) alerts.push('ألم عضلي مرتفع في يومين متتاليين.')
  if (last3.length >= 3 && last3.every(e => e.readiness_score < 72)) alerts.push('جاهزية منخفضة لثلاث قراءات متتالية.')
  return alerts
}

function MetricInput({ label, value, onChange, lowLabel, highLabel }: {
  label: string
  value: number
  onChange: (value: number) => void
  lowLabel: string
  highLabel: string
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="text-sm font-extrabold text-slate-900 tabular-nums">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  )
}

function Tile({ label, value, hint, className }: {
  label: string
  value: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border px-3 py-2.5 bg-slate-50 text-slate-700 border-slate-100', className)}>
      <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
      <div className="text-[11px] font-bold opacity-75 mt-1">{label}</div>
      {hint && <div className="text-[10px] opacity-70 mt-0.5">{hint}</div>}
    </div>
  )
}

export function WellbeingSummaryBox({
  entries,
  audience = 'admin',
  canSubmit = false,
  canReview = false,
  submitting = false,
  reviewing = false,
  onSubmit,
  onReview,
}: {
  entries: WellbeingEntry[]
  audience?: 'admin' | 'player'
  canSubmit?: boolean
  canReview?: boolean
  submitting?: boolean
  reviewing?: boolean
  onSubmit?: (payload: FormState & { readiness_score: number; status: 'green' | 'yellow' | 'red'; entry_date: string }) => Promise<void> | void
  onReview?: (entryId: string, medicalNote: string) => Promise<void> | void
}) {
  const sorted = useMemo(() => [...entries].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date))), [entries])
  const todaysEntry = sorted.find(e => e.entry_date === today())
  const [reviewNote, setReviewNote] = useState('')
  const [form, setForm] = useState<FormState>({
    sleep_quality: 3,
    fatigue_level: 3,
    muscle_soreness: 2,
    stress_level: 2,
    mood_level: 3,
    energy_level: 3,
    pain_area: '',
    notes: '',
  })

  useEffect(() => {
    if (!todaysEntry || !canSubmit) return
    setForm({
      sleep_quality: todaysEntry.sleep_quality,
      fatigue_level: todaysEntry.fatigue_level,
      muscle_soreness: todaysEntry.muscle_soreness,
      stress_level: todaysEntry.stress_level,
      mood_level: todaysEntry.mood_level,
      energy_level: todaysEntry.energy_level,
      pain_area: todaysEntry.pain_area || '',
      notes: todaysEntry.notes || '',
    })
  }, [todaysEntry?.id, canSubmit])

  const latest = sorted[0]
  const last7 = sorted.slice(0, 7)
  const alerts = buildAlerts(sorted)
  const readiness = calculateReadiness(form)
  const avgScore = avg(last7.map(e => e.readiness_score))
  const avgSleep = avg(last7.map(e => e.sleep_quality))
  const avgFatigue = avg(last7.map(e => e.fatigue_level))
  const avgSoreness = avg(last7.map(e => e.muscle_soreness))
  const redDays = last7.filter(e => e.status === 'red').length
  const yellowDays = last7.filter(e => e.status === 'yellow').length

  async function submit() {
    await onSubmit?.({ ...form, readiness_score: readiness.score, status: readiness.status, entry_date: today() })
  }

  async function review() {
    if (!latest?.id || !reviewNote.trim()) return
    await onReview?.(latest.id, reviewNote.trim())
    setReviewNote('')
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">الجاهزية والرفاهية</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            مؤشر متابعة يومي يساعد على قرار الحمل التدريبي ولا يعتبر تشخيصًا طبيًا.
          </p>
        </div>
        <div className={cn('inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold', STATUS[latest?.status || 'green'].cls)}>
          <span className={cn('w-2 h-2 rounded-full', STATUS[latest?.status || 'green'].dot)} />
          {latest ? STATUS[latest.status].label : 'لا توجد قراءة'}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="متوسط الجاهزية" value={`${avgScore || 0}%`} className="bg-slate-900 text-white border-slate-900" hint="آخر 7 قراءات"/>
          <Tile label="متوسط النوم" value={`${avgSleep || 0}/5`} className="bg-blue-50 text-blue-700 border-blue-100"/>
          <Tile label="متوسط الإرهاق" value={`${avgFatigue || 0}/5`} className="bg-amber-50 text-amber-700 border-amber-100"/>
          <Tile label="ألم العضلات" value={`${avgSoreness || 0}/5`} className="bg-red-50 text-red-700 border-red-100"/>
          <Tile label="أيام حمراء" value={redDays} className="bg-red-50 text-red-700 border-red-100"/>
          <Tile label="أيام متابعة" value={yellowDays} className="bg-amber-50 text-amber-700 border-amber-100"/>
          <Tile label="آخر قراءة" value={latest ? `${latest.readiness_score}%` : '—'} hint={latest ? formatDate(latest.entry_date) : undefined}/>
          <Tile label="عدد القراءات" value={sorted.length}/>
        </div>

        {latest && (
          <div className={cn('rounded-xl border p-3', STATUS[latest.status].cls)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold opacity-75">قرار مقترح</div>
                <div className="text-sm font-extrabold mt-0.5">
                  {latest.status === 'red'
                    ? 'راجع اللاعب قبل التدريب أو خفف الحمل.'
                    : latest.status === 'yellow'
                      ? 'راقب اللاعب ووازن الحمل حسب التمرين.'
                      : 'القراءة مناسبة للمشاركة الطبيعية.'}
                </div>
                {(latest.pain_area || latest.notes) && (
                  <div className="text-[11px] opacity-75 mt-1">
                    {[latest.pain_area && `منطقة ألم: ${latest.pain_area}`, latest.notes].filter(Boolean).join(' - ')}
                  </div>
                )}
              </div>
              <div className="text-2xl font-extrabold">{latest.readiness_score}%</div>
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-sm font-extrabold text-red-700 mb-2">
              <AlertTriangle size={16}/> تنبيهات مهمة
            </div>
            <div className="space-y-1">
              {alerts.map((alert, idx) => (
                <div key={idx} className="text-xs font-bold text-red-700">- {alert}</div>
              ))}
            </div>
          </div>
        )}

        {canSubmit && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-extrabold text-slate-800">تقييم اليوم</div>
                <div className="text-[11px] text-slate-400">يمكن تحديث قراءة اليوم أكثر من مرة عند الحاجة.</div>
              </div>
              <div className={cn('rounded-xl border px-3 py-2 text-xs font-bold', STATUS[readiness.status].cls)}>
                {readiness.score}% - {STATUS[readiness.status].label}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <MetricInput label="جودة النوم" value={form.sleep_quality} lowLabel="سيئ" highLabel="ممتاز" onChange={v => setForm(p => ({ ...p, sleep_quality: v }))}/>
              <MetricInput label="الإرهاق" value={form.fatigue_level} lowLabel="منخفض" highLabel="مرتفع" onChange={v => setForm(p => ({ ...p, fatigue_level: v }))}/>
              <MetricInput label="ألم العضلات" value={form.muscle_soreness} lowLabel="لا يوجد" highLabel="شديد" onChange={v => setForm(p => ({ ...p, muscle_soreness: v }))}/>
              <MetricInput label="الضغط" value={form.stress_level} lowLabel="منخفض" highLabel="مرتفع" onChange={v => setForm(p => ({ ...p, stress_level: v }))}/>
              <MetricInput label="المزاج" value={form.mood_level} lowLabel="سيئ" highLabel="ممتاز" onChange={v => setForm(p => ({ ...p, mood_level: v }))}/>
              <MetricInput label="الطاقة" value={form.energy_level} lowLabel="منخفضة" highLabel="عالية" onChange={v => setForm(p => ({ ...p, energy_level: v }))}/>
            </div>
            <div className="grid md:grid-cols-2 gap-2 mt-2">
              <input className="form-input" value={form.pain_area} onChange={e => setForm(p => ({ ...p, pain_area: e.target.value }))} placeholder="منطقة ألم إن وجدت"/>
              <input className="form-input" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظة اختيارية"/>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>
                {submitting ? <Spinner size="sm"/> : todaysEntry ? 'تحديث قراءة اليوم' : 'حفظ قراءة اليوم'}
              </button>
            </div>
          </div>
        )}

        {canReview && latest?.id && (
          <div className="rounded-xl border border-slate-100 p-3">
            <div className="text-sm font-extrabold text-slate-800 mb-2">مراجعة طبية لآخر قراءة</div>
            {latest.medical_note && (
              <div className="rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-xs mb-2">
                تمت المراجعة: {latest.medical_note}
                {latest.reviewer?.full_name && <span> - {latest.reviewer.full_name}</span>}
              </div>
            )}
            <textarea className="form-input min-h-[72px]" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="اكتب توصية طبية أو قرار متابعة"/>
            <div className="flex justify-end mt-2">
              <button className="btn btn-ghost btn-sm" onClick={review} disabled={reviewing || !reviewNote.trim()}>
                {reviewing ? <Spinner size="sm"/> : 'حفظ المراجعة'}
              </button>
            </div>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-right py-2">التاريخ</th>
                  <th className="text-right py-2">الحالة</th>
                  <th className="text-right py-2">الجاهزية</th>
                  {METRICS.map(m => <th key={m.key} className="text-right py-2">{m.label}</th>)}
                  <th className="text-right py-2">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, audience === 'player' ? 7 : 14).map(entry => (
                  <tr key={entry.id || entry.entry_date} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-700">{formatDate(entry.entry_date)}</td>
                    <td className="py-2"><span className={cn('rounded-lg px-2 py-0.5 font-bold', STATUS[entry.status].cls)}>{STATUS[entry.status].label}</span></td>
                    <td className="py-2 font-extrabold text-slate-800">{entry.readiness_score}%</td>
                    {METRICS.map(m => <td key={m.key} className="py-2 text-slate-600">{Number(entry[m.key] || 0)}/5</td>)}
                    <td className="py-2 text-slate-500 max-w-[220px] truncate">{entry.pain_area || entry.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
