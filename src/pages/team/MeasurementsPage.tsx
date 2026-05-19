import React, { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Ruler, Plus, ChevronUp, ChevronDown, X, Dumbbell, CheckCircle, ChevronLeft, ChevronRight, Pencil, Trash2, AlertTriangle, BarChart2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { measurementService } from '../../services'
import FitnessPage from './FitnessPage'
import TechnicalEvalPage from './TechnicalEvalPage'
import { Avatar } from '../../components/ui'
import { canManageEvents } from '../../utils/helpers'
import {
  METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, METRIC_UNUSUAL_RANGES, MetricKey,
  calculateBMI, calculateLegLength, calculateFatMass, calculateBodyFatPercent,
  calculateMuscleMass, calculateMusclePercent,
  getLatestByMetric, getLatestBMI, getGrowthVelocity, getHeightSparkline,
  getMetricTimeSeries, getBMITimeSeries,
  compareLatestWithPrevious, compareBMI, check30DayViolation,
  getMeasurementAgeColor, getMeasurementAgeLabel, calcPlayerAge, formatDate,
} from '../../utils/measurementHelpers'

type SortKey = 'name' | 'age' | MetricKey | 'bmi' | 'growth' | 'lastDate'
type SortDir = 'asc' | 'desc'

// ── SVG Sparkline ──────────────────────────────────────────────────────
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-slate-300 text-xs">—</span>
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const W = 56, H = 22, pad = 2
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const color = values[values.length - 1] >= values[values.length - 2] ? '#10b981' : '#ef4444'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// ── Trend badge ────────────────────────────────────────────────────────
function TrendBadge({ trend, diff }: { trend: string; diff?: number | null }) {
  if (trend === 'زيادة') return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">↑ {diff != null ? `+${diff}` : 'زيادة'}</span>
  if (trend === 'نقصان') return <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">↓ {diff != null ? diff : 'نقصان'}</span>
  if (trend === 'ثابت') return <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">= ثابت</span>
  return <span className="text-[10px] text-slate-400">—</span>
}

// ── Team bar chart (basic measurements) ────────────────────────────────
const CHART_METRICS: Array<{ key: MetricKey | 'bmi'; label: string; unit: string }> = [
  ...METRIC_KEYS.map(k => ({ key: k as MetricKey | 'bmi', label: METRIC_LABELS[k], unit: METRIC_UNITS[k] })),
  { key: 'bmi', label: 'مؤشر كتلة الجسم (BMI)', unit: 'كغ/م²' },
]

function BasicTeamBarChart({ players }: { players: any[] }) {
  const [metric, setMetric] = useState<MetricKey | 'bmi'>('standing_height_cm')
  const metricDef = CHART_METRICS.find(m => m.key === metric)!
  const data = players
    .map(p => ({
      id: p.id,
      name: p.full_name,
      value: metric === 'bmi' ? p.latestBMI : p.latestByMetric[metric as MetricKey],
    }))
    .filter(d => d.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-brand-500" fill="currentColor">
              <rect x="1" y="10" width="3" height="5" rx="1"/>
              <rect x="6" y="6" width="3" height="9" rx="1"/>
              <rect x="11" y="2" width="3" height="13" rx="1"/>
            </svg>
            مقارنة الفريق
          </h3>
          {data.length > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{data.length} لاعب لديهم بيانات</p>}
        </div>
        <select value={metric} onChange={e => setMetric(e.target.value as MetricKey | 'bmi')}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400">
          {CHART_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">لا توجد بيانات لهذا المؤشر</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {data.map((d, i) => {
            const pct = ((d.value as number) / (data[0].value as number)) * 100
            const rankPct = i / Math.max(data.length - 1, 1)
            const color = rankPct <= 0.33 ? '#3b82f6' : rankPct <= 0.66 ? '#8b5cf6' : '#94a3b8'
            return (
              <div key={d.id} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 w-28 text-right shrink-0 truncate">{d.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden" dir="ltr">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}/>
                </div>
                <span className="text-xs font-bold w-20 shrink-0 text-left" style={{ color }}>
                  {d.value} {metricDef.unit}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Inline SVG line chart ──────────────────────────────────────────────
function LineChart({ series, label, unit }: { series: Array<{ date: string; value: number }>; label: string; unit: string }) {
  if (series.length < 2) return (
    <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-400">
      {series.length === 0 ? `لا توجد بيانات لـ ${label}` : 'قياس واحد فقط — أضف المزيد لعرض الرسم البياني'}
    </div>
  )
  const W = 460, H = 90, padX = 36, padY = 10
  const values = series.map(d => d.value)
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const pts = series.map((d, i) => ({
    x: padX + (i / (series.length - 1)) * (W - padX * 2),
    y: padY + (1 - (d.value - min) / range) * (H - padY * 2),
    d,
  }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const fill = `${path} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`
  return (
    <div className="bg-slate-50 rounded-xl p-3 overflow-hidden">
      <p className="text-xs font-bold text-slate-600 mb-2">{label} ({unit})</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 18}`} className="h-28">
        <path d={fill} fill="rgba(59,130,246,0.08)"/>
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="white" stroke="#3b82f6" strokeWidth="1.5"/>
            <text x={p.x} y={H + 14} textAnchor="middle" fontSize="7" fill="#94a3b8">
              {new Date(p.d.date).toLocaleDateString('ar-SA', { month: 'numeric', day: 'numeric' })}
            </text>
          </g>
        ))}
        <text x="2" y={padY + 4} fontSize="7" fill="#94a3b8">{max}</text>
        <text x="2" y={H - padY} fontSize="7" fill="#94a3b8">{min}</text>
      </svg>
    </div>
  )
}

// ── Delete Modal ───────────────────────────────────────────────────────
interface DeleteModalProps { measurement: any; onClose: () => void; onDeleted: () => void; userId: string }
function DeleteModal({ measurement, onClose, onDeleted, userId }: DeleteModalProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleDelete() {
    if (!reason.trim()) { setErr('يجب كتابة سبب الحذف.'); return }
    setLoading(true)
    const { error } = await measurementService.deleteMeasurement(measurement.id, measurement.team_id, measurement.player_id, reason, userId)
    setLoading(false)
    if (error) { setErr('حدث خطأ، حاول مجددًا.'); return }
    onDeleted()
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Trash2 size={20} className="text-red-500"/>
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800">حذف القياس</h3>
            <p className="text-xs text-slate-400">{formatDate(measurement.measurement_date)}</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
          ⚠️ حذف هذا القياس سيؤثر على الرسوم والمقارنات. هل أنت متأكد؟
        </div>
        <label className="text-xs font-bold text-slate-600 block mb-1.5">سبب الحذف <span className="text-red-500">*</span></label>
        <textarea className="form-input w-full text-sm resize-none" rows={3} value={reason}
          onChange={e => { setReason(e.target.value); setErr('') }}
          placeholder="اكتب سبب الحذف..."/>
        {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">إلغاء</button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50">
            {loading ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Modal ─────────────────────────────────────────────────────────
interface EditModalProps { measurement: any; allMeasurements: any[]; onClose: () => void; onSaved: () => void; userId: string }
function EditModal({ measurement, allMeasurements, onClose, onSaved, userId }: EditModalProps) {
  const [form, setForm] = useState<Partial<Record<MetricKey, string>>>(() => {
    const f: any = {}
    METRIC_KEYS.forEach(k => { if (measurement[k] != null) f[k] = String(measurement[k]) })
    return f
  })
  const [method, setMethod] = useState(measurement.measurement_method ?? 'يدوي')
  const [notes, setNotes] = useState(measurement.notes ?? '')
  const [reason, setReason] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [errs, setErrs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const editCount = measurement.edit_count ?? 0

  function setVal(k: MetricKey, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function validate(): string[] {
    const errors: string[] = []
    const w = parseFloat(form.weight_kg ?? '')
    const h = parseFloat(form.standing_height_cm ?? '')
    const sh = parseFloat(form.sitting_height_cm ?? '')
    const fp = parseFloat(form.body_fat_percent ?? '')
    const mp = parseFloat(form.muscle_percent ?? '')

    if (form.weight_kg && !isNaN(w) && !form.standing_height_cm) {
      errors.push('لا يمكن حفظ الوزن بدون تسجيل الطول واقفًا لنفس اللاعب.')
    }
    if (form.sitting_height_cm && form.standing_height_cm && !isNaN(sh) && !isNaN(h) && sh > h) {
      errors.push('الطول جالسًا لا يمكن أن يكون أكبر من الطول واقفًا.')
    }
    if ((form.body_fat_percent && !isNaN(fp) && (fp < 0 || fp > 100)) ||
      (form.muscle_percent && !isNaN(mp) && (mp < 0 || mp > 100))) {
      errors.push('النسبة يجب أن تكون بين 0 و100.')
    }
    METRIC_KEYS.forEach(k => {
      const v = parseFloat(form[k] ?? '')
      if (form[k] && !isNaN(v) && v < 0) errors.push(`القيمة لا يمكن أن تكون سالبة (${METRIC_LABELS[k]}).`)
    })
    return errors
  }

  function getWarnings(): string[] {
    const warns: string[] = []
    METRIC_KEYS.forEach(k => {
      const v = parseFloat(form[k] ?? '')
      if (!form[k] || isNaN(v)) return
      const r = METRIC_UNUSUAL_RANGES[k]
      if (v < r.min || v > r.max) warns.push(`قيمة ${METRIC_LABELS[k]} (${v}) تبدو غير معتادة. تحقق منها قبل الحفظ.`)
    })
    return warns
  }

  async function handleSave() {
    const errors = validate()
    if (errors.length) { setErrs(errors); return }
    const ws = getWarnings()
    if (ws.length && !warnings.length) { setWarnings(ws); return } // show warnings first, second click saves
    if (!reason.trim()) { setErrs(['يجب كتابة سبب التعديل قبل حفظ التغييرات.']); return }

    setLoading(true)
    const updates: any = { measurement_method: method, notes: notes || null }
    METRIC_KEYS.forEach(k => {
      const v = form[k]
      updates[k] = v && v.trim() !== '' ? parseFloat(v) : null
    })

    const { error } = await measurementService.updateMeasurement(
      measurement.id, measurement.team_id, measurement.player_id, updates, reason, userId
    )
    setLoading(false)
    if (error?.message === 'MAX_EDITS') {
      setErrs(['لا يمكن تعديل هذا القياس أكثر من 3 مرات. يمكنك حذف القياس وإضافة قياس جديد إذا لزم الأمر.'])
      return
    }
    if (error) { setErrs(['حدث خطأ، حاول مجددًا.']); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-extrabold text-slate-800">تعديل القياس</h2>
            <p className="text-xs text-slate-400">{formatDate(measurement.measurement_date)} · تعديل {editCount}/3</p>
          </div>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        {editCount >= 3 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            لا يمكن تعديل هذا القياس أكثر من 3 مرات. يمكنك حذف القياس وإضافة قياس جديد إذا لزم الأمر.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {METRIC_KEYS.map(k => (
                  <div key={k}>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{METRIC_LABELS[k]} ({METRIC_UNITS[k]})</label>
                    <input type="number" step="0.1" min="0" className="form-input w-full text-sm"
                      value={form[k] ?? ''} onChange={e => setVal(k, e.target.value)} placeholder="—"/>
                  </div>
                ))}
              </div>
              {/* Auto-calc preview */}
              {form.weight_kg && form.standing_height_cm && (
                <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                  BMI: <strong>{calculateBMI(parseFloat(form.weight_kg ?? ''), parseFloat(form.standing_height_cm ?? ''))}</strong>
                  {form.sitting_height_cm && (
                    <span className="mr-3">طول الساق: <strong>{calculateLegLength(parseFloat(form.standing_height_cm), parseFloat(form.sitting_height_cm))} سم</strong></span>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">طريقة القياس</label>
                <select className="form-input w-full text-sm" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="يدوي">يدوي</option>
                  <option value="جهاز">جهاز</option>
                  <option value="أشعة">أشعة</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات</label>
                <textarea className="form-input w-full text-sm resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)}/>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سبب التعديل <span className="text-red-500">*</span></label>
                <textarea className="form-input w-full text-sm resize-none" rows={2} value={reason}
                  onChange={e => { setReason(e.target.value); setErrs([]) }}
                  placeholder="يجب كتابة سبب التعديل قبل حفظ التغييرات."/>
              </div>
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-bold text-amber-700 flex items-center gap-1"><AlertTriangle size={12}/> تحذيرات — اضغط حفظ مجددًا للتأكيد</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
                </div>
              )}
              {errs.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  {errs.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">إلغاء</button>
              <button onClick={handleSave} disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50">
                {loading ? 'جاري الحفظ...' : 'حفظ التعديل'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Add Measurement Modal (3 steps) ────────────────────────────────────
const STEP_LABELS = ['اختيار اللاعبين', 'اختيار المؤشرات', 'إدخال القيم']

interface AddModalProps {
  players: any[]
  allMeasurements: any[]
  teamId: string
  userId: string
  onClose: () => void
  onSaved: () => void
}

function AddMeasurementModal({ players, allMeasurements, teamId, userId, onClose, onSaved }: AddModalProps) {
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'all' | 'specific'>('all')
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(players.map(p => p.id))
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>([])
  const [measureDate, setMeasureDate] = useState(new Date().toISOString().slice(0, 10))
  const [measureTime, setMeasureTime] = useState('')
  const [measureMethod, setMeasureMethod] = useState('يدوي')
  const [sessionNotes, setSessionNotes] = useState('')
  const [values, setValues] = useState<Record<string, Partial<Record<MetricKey, string>>>>({})
  const [calcLocked, setCalcLocked] = useState<Record<string, Partial<Record<MetricKey, boolean>>>>({})
  const [rowWarnings, setRowWarnings] = useState<Record<string, string[]>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({})
  const [globalErrors, setGlobalErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [warningConfirmed, setWarningConfirmed] = useState(false)

  // Mode change resets selection
  function handleModeChange(m: 'all' | 'specific') {
    setMode(m)
    setSelectedPlayers(m === 'all' ? players.map(p => p.id) : [])
  }

  function togglePlayer(id: string) {
    setSelectedPlayers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  function toggleMetric(k: MetricKey) {
    setSelectedMetrics(prev => {
      const adding = !prev.includes(k)
      let next = adding ? [...prev, k] : prev.filter(x => x !== k)
      // Weight ↔ Height: always paired together
      if (k === 'weight_kg' || k === 'standing_height_cm') {
        if (adding) {
          if (!next.includes('weight_kg')) next = [...next, 'weight_kg']
          if (!next.includes('standing_height_cm')) next = [...next, 'standing_height_cm']
        } else {
          next = next.filter(x => x !== 'weight_kg' && x !== 'standing_height_cm')
        }
      }
      // Fat% ↔ Fat mass: always paired together
      if (k === 'body_fat_percent' || k === 'body_fat_mass_kg') {
        if (adding) {
          if (!next.includes('body_fat_percent')) next = [...next, 'body_fat_percent']
          if (!next.includes('body_fat_mass_kg')) next = [...next, 'body_fat_mass_kg']
        } else {
          next = next.filter(x => x !== 'body_fat_percent' && x !== 'body_fat_mass_kg')
        }
      }
      // Muscle% ↔ Muscle mass: always paired together
      if (k === 'muscle_percent' || k === 'muscle_mass_kg') {
        if (adding) {
          if (!next.includes('muscle_percent')) next = [...next, 'muscle_percent']
          if (!next.includes('muscle_mass_kg')) next = [...next, 'muscle_mass_kg']
        } else {
          next = next.filter(x => x !== 'muscle_percent' && x !== 'muscle_mass_kg')
        }
      }
      return next
    })
  }

  function setVal(playerId: string, key: MetricKey, val: string) {
    const pv = { ...(values[playerId] ?? {}), [key]: val } as Partial<Record<MetricKey, string>>
    const w = parseFloat(pv.weight_kg ?? '')
    const derived: Partial<Record<MetricKey, string>> = {}
    const newLocks: Partial<Record<MetricKey, boolean>> = {}
    const removeLocks: MetricKey[] = []

    if (key === 'body_fat_percent') {
      if (val && !isNaN(parseFloat(val)) && !isNaN(w)) {
        const fm = calculateFatMass(w, parseFloat(val))
        if (fm != null) { derived.body_fat_mass_kg = String(fm); newLocks.body_fat_mass_kg = true }
      } else {
        derived.body_fat_mass_kg = ''; removeLocks.push('body_fat_mass_kg')
      }
    }
    if (key === 'body_fat_mass_kg') {
      if (val && !isNaN(parseFloat(val)) && !isNaN(w)) {
        const fp = calculateBodyFatPercent(w, parseFloat(val))
        if (fp != null) { derived.body_fat_percent = String(fp); newLocks.body_fat_percent = true }
      } else {
        derived.body_fat_percent = ''; removeLocks.push('body_fat_percent')
      }
    }
    if (key === 'muscle_percent') {
      if (val && !isNaN(parseFloat(val)) && !isNaN(w)) {
        const mm = calculateMuscleMass(w, parseFloat(val))
        if (mm != null) { derived.muscle_mass_kg = String(mm); newLocks.muscle_mass_kg = true }
      } else {
        derived.muscle_mass_kg = ''; removeLocks.push('muscle_mass_kg')
      }
    }
    if (key === 'muscle_mass_kg') {
      if (val && !isNaN(parseFloat(val)) && !isNaN(w)) {
        const mp = calculateMusclePercent(w, parseFloat(val))
        if (mp != null) { derived.muscle_percent = String(mp); newLocks.muscle_percent = true }
      } else {
        derived.muscle_percent = ''; removeLocks.push('muscle_percent')
      }
    }
    // When weight changes, recompute any currently locked fat/muscle fields
    if (key === 'weight_kg') {
      const wNew = parseFloat(val)
      if (!isNaN(wNew)) {
        const locked = calcLocked[playerId] ?? {}
        if (locked.body_fat_mass_kg) {
          const fp = parseFloat(pv.body_fat_percent ?? '')
          if (!isNaN(fp)) { const fm = calculateFatMass(wNew, fp); if (fm != null) { derived.body_fat_mass_kg = String(fm); newLocks.body_fat_mass_kg = true } }
        }
        if (locked.body_fat_percent) {
          const fm = parseFloat(pv.body_fat_mass_kg ?? '')
          if (!isNaN(fm)) { const fp = calculateBodyFatPercent(wNew, fm); if (fp != null) { derived.body_fat_percent = String(fp); newLocks.body_fat_percent = true } }
        }
        if (locked.muscle_mass_kg) {
          const mp = parseFloat(pv.muscle_percent ?? '')
          if (!isNaN(mp)) { const mm = calculateMuscleMass(wNew, mp); if (mm != null) { derived.muscle_mass_kg = String(mm); newLocks.muscle_mass_kg = true } }
        }
        if (locked.muscle_percent) {
          const mm = parseFloat(pv.muscle_mass_kg ?? '')
          if (!isNaN(mm)) { const mp = calculateMusclePercent(wNew, mm); if (mp != null) { derived.muscle_percent = String(mp); newLocks.muscle_percent = true } }
        }
      }
    }

    setValues(v => ({ ...v, [playerId]: { ...v[playerId], [key]: val, ...derived } }))
    if (Object.keys(newLocks).length || removeLocks.length) {
      setCalcLocked(prev => {
        const pl = { ...(prev[playerId] ?? {}), ...newLocks }
        for (const k of removeLocks) delete pl[k as MetricKey]
        return { ...prev, [playerId]: pl }
      })
    }
  }

  function validateAll(): { rowErrs: Record<string, string[]>; rowWarns: Record<string, string[]>; globalErrs: string[] } {
    const rowErrs: Record<string, string[]> = {}
    const rowWarns: Record<string, string[]> = {}
    const globalErrs: string[] = []

    for (const pid of selectedPlayers) {
      const pv: Partial<Record<MetricKey, string>> = values[pid] ?? {}
      const errs: string[] = []
      const warns: string[] = []

      const w = parseFloat(pv.weight_kg ?? '')
      const h = parseFloat(pv.standing_height_cm ?? '')
      const sh = parseFloat(pv.sitting_height_cm ?? '')
      const fp = parseFloat(pv.body_fat_percent ?? '')
      const mp = parseFloat(pv.muscle_percent ?? '')
      const fm = parseFloat(pv.body_fat_mass_kg ?? '')
      const mm = parseFloat(pv.muscle_mass_kg ?? '')

      // Check if any value entered for this player
      const hasAny = selectedMetrics.some(k => pv[k] && pv[k]!.trim() !== '')
      if (!hasAny) continue // skip empty rows

      // Weight requires standing height
      if (pv.weight_kg && pv.weight_kg.trim() && !pv.standing_height_cm?.trim()) {
        errs.push('لا يمكن حفظ الوزن بدون تسجيل الطول واقفًا لنفس اللاعب.')
      }
      // Sitting cannot be > standing
      if (pv.sitting_height_cm?.trim() && pv.standing_height_cm?.trim() && !isNaN(sh) && !isNaN(h) && sh > h) {
        errs.push('الطول جالسًا لا يمكن أن يكون أكبر من الطول واقفًا.')
      }
      // Percentages
      if (pv.body_fat_percent?.trim() && !isNaN(fp) && (fp < 0 || fp > 100)) errs.push('نسبة الدهون يجب أن تكون بين 0 و100.')
      if (pv.muscle_percent?.trim() && !isNaN(mp) && (mp < 0 || mp > 100)) errs.push('نسبة العضل يجب أن تكون بين 0 و100.')
      // Negatives
      METRIC_KEYS.forEach(k => {
        const v = parseFloat(pv[k] ?? '')
        if (pv[k]?.trim() && !isNaN(v) && v < 0) errs.push(`القيمة لا يمكن أن تكون سالبة (${METRIC_LABELS[k]}).`)
      })
      // Consistency warning: fat percent vs fat mass
      if (w && pv.body_fat_percent?.trim() && pv.body_fat_mass_kg?.trim() && !isNaN(fp) && !isNaN(fm)) {
        const calcFm = calculateFatMass(w, fp)
        if (calcFm != null && Math.abs(calcFm - fm) > 0.5) warns.push('هناك اختلاف بين نسبة الدهون وكتلة الدهون المدخلة. تحقق من القيم.')
      }
      if (w && pv.muscle_percent?.trim() && pv.muscle_mass_kg?.trim() && !isNaN(mp) && !isNaN(mm)) {
        const calcMm = calculateMuscleMass(w, mp)
        if (calcMm != null && Math.abs(calcMm - mm) > 0.5) warns.push('هناك اختلاف بين نسبة العضل وكتلة العضل المدخلة. تحقق من القيم.')
      }
      // Unusual value warnings
      METRIC_KEYS.forEach(k => {
        const v = parseFloat(pv[k] ?? '')
        if (!pv[k]?.trim() || isNaN(v)) return
        const r = METRIC_UNUSUAL_RANGES[k]
        if (v < r.min || v > r.max) warns.push(`قيمة ${METRIC_LABELS[k]} (${v}) تبدو غير معتادة. تحقق منها.`)
      })
      // 30-day and same-day rules
      for (const k of selectedMetrics) {
        if (!pv[k]?.trim()) continue
        const check = check30DayViolation(allMeasurements, pid, k, measureDate)
        if (check.violated) {
          if (check.sameDay) {
            errs.push(`${METRIC_LABELS[k]}: يوجد قياس مسجل لهذا المؤشر في نفس اليوم. يمكنك تحديث القياس الحالي أو الانتظار حتى مرور 30 يومًا.`)
          } else {
            errs.push(`${METRIC_LABELS[k]}: لا يمكن تسجيل قياس جديد لهذا المؤشر قبل مرور 30 يومًا من آخر قياس (${formatDate(check.nearestDate!)}).`)
          }
        }
      }

      if (errs.length) rowErrs[pid] = errs
      if (warns.length) rowWarns[pid] = warns
    }
    return { rowErrs, rowWarns, globalErrs }
  }

  async function handleSave() {
    setGlobalErrors([])
    const { rowErrs, rowWarns, globalErrs } = validateAll()
    setRowErrors(rowErrs)
    setRowWarnings(rowWarns)
    if (Object.keys(rowErrs).length || globalErrs.length) { setGlobalErrors(globalErrs); return }
    if (Object.keys(rowWarns).length && !warningConfirmed) {
      setWarningConfirmed(true)
      return // user must click again to confirm warnings
    }

    setSaving(true)
    let count = 0
    const saveErrors: string[] = []

    for (const pid of selectedPlayers) {
      const pv: Partial<Record<MetricKey, string>> = values[pid] ?? {}
      const hasAny = selectedMetrics.some(k => pv[k] && pv[k]!.trim() !== '')
      if (!hasAny) continue

      const record: any = {
        team_id: teamId,
        player_id: pid,
        measurement_date: measureDate,
        measurement_time: measureTime || null,
        measurement_method: measureMethod,
        notes: sessionNotes || null,
        created_by: userId,
      }
      for (const k of selectedMetrics) {
        const v = pv[k]
        if (v && v.trim() !== '') record[k] = parseFloat(v)
      }
      const { error } = await measurementService.addMeasurement(record)
      if (error) saveErrors.push(`خطأ في حفظ قياس: ${error.message}`)
      else count++
    }

    setSaving(false)
    if (saveErrors.length) { setGlobalErrors(saveErrors); return }
    setSavedCount(count)
    setTimeout(() => { onSaved(); onClose() }, 800)
  }

  if (savedCount > 0) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-500"/>
          </div>
          <p className="font-extrabold text-slate-800 text-lg">تم الحفظ!</p>
          <p className="text-slate-500 text-sm mt-1">تم حفظ قياسات {savedCount} لاعب بنجاح</p>
        </div>
      </div>
    )
  }

  const activePlayerList = mode === 'all' ? players : players.filter(p => selectedPlayers.includes(p.id))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-extrabold text-slate-800">إضافة قياسات</h2>
            <p className="text-xs text-slate-400 mt-0.5">{STEP_LABELS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X size={18}/></button>
        </div>

        {/* Steps */}
        <div className="flex gap-1 px-5 pt-4 pb-2 flex-shrink-0">
          {STEP_LABELS.map((l, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>{i < step ? '✓' : i + 1}</div>
              <span className={`text-[10px] text-center hidden sm:block ${i === step ? 'text-brand-700 font-bold' : 'text-slate-400'}`}>{l}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Step 0: Player selection */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">تاريخ القياس <span className="text-red-500">*</span></label>
                <input type="date" className="form-input w-full" value={measureDate}
                  onChange={e => setMeasureDate(e.target.value)} max={new Date().toISOString().slice(0, 10)}/>
              </div>

              <div className="flex gap-2">
                {(['all', 'specific'] as const).map(m => (
                  <button key={m} onClick={() => handleModeChange(m)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                      mode === m ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {m === 'all' ? 'كل اللاعبين' : 'لاعبين محددين'}
                  </button>
                ))}
              </div>

              {mode === 'specific' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-700">اختر اللاعبين ({selectedPlayers.length})</p>
                    <button className="text-xs text-brand-600 font-bold"
                      onClick={() => setSelectedPlayers(selectedPlayers.length === players.length ? [] : players.map(p => p.id))}>
                      {selectedPlayers.length === players.length ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  {players.map(p => {
                    const age = calcPlayerAge(p.date_of_birth)
                    const sel = selectedPlayers.includes(p.id)
                    const lastMs = p.measurements?.[0]
                    return (
                      <button key={p.id} onClick={() => togglePlayer(p.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-right ${sel ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-bold text-sm text-slate-800 truncate">{p.full_name}</div>
                          {age != null && <div className="text-xs text-slate-400">{age} سنة</div>}
                        </div>
                        {lastMs && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getMeasurementAgeColor(lastMs.measurement_date)}`}>
                            {getMeasurementAgeLabel(lastMs.measurement_date)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {mode === 'all' && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-brand-700">
                  سيتم إضافة قياسات لجميع اللاعبين ({players.length} لاعب)
                </div>
              )}
            </div>
          )}

          {/* Step 1: Metric selection */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700 mb-3">اختر القياسات المراد تسجيلها</p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 mb-3">
                💡 الوزن والطول مرتبطان دائماً (لحساب BMI). نسبة ومقدار الدهون مرتبطان، ونسبة ومقدار العضل مرتبطان — اختيار أي منهم يحدد الاثنين معاً.
              </div>

              {METRIC_KEYS.map(k => {
                const sel = selectedMetrics.includes(k)
                const isSecondInPair =
                  (k === 'standing_height_cm' && selectedMetrics.includes('weight_kg')) ||
                  (k === 'body_fat_mass_kg' && selectedMetrics.includes('body_fat_percent')) ||
                  (k === 'muscle_mass_kg' && selectedMetrics.includes('muscle_percent'))
                return (
                  <button key={k} onClick={() => toggleMetric(k)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-right ${
                      sel ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                      {sel && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 text-right">
                      <span className="text-sm font-bold text-slate-700">{METRIC_LABELS[k]}</span>
                      {isSecondInPair && <span className="text-xs text-amber-600 mr-2">(مرتبط)</span>}
                    </div>
                    <span className="text-xs text-slate-400">{METRIC_UNITS[k]}</span>
                  </button>
                )
              })}

              <div className="pt-3 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">وقت القياس (اختياري)</label>
                  <input type="time" className="form-input w-full" value={measureTime} onChange={e => setMeasureTime(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طريقة القياس</label>
                  <select className="form-input w-full" value={measureMethod} onChange={e => setMeasureMethod(e.target.value)}>
                    <option value="يدوي">يدوي</option>
                    <option value="جهاز">جهاز</option>
                    <option value="أشعة">أشعة</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات (اختياري)</label>
                  <textarea className="form-input w-full text-sm resize-none" rows={2} value={sessionNotes} onChange={e => setSessionNotes(e.target.value)}/>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Values entry — table layout */}
          {step === 2 && (
            <div className="space-y-4">
              {warningConfirmed && Object.keys(rowWarnings).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <p className="font-bold mb-1 flex items-center gap-1"><AlertTriangle size={12}/> توجد تحذيرات — اضغط "حفظ" مجددًا للتأكيد</p>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-right px-3 py-2.5 font-bold text-slate-600 min-w-[120px] sticky right-0 bg-slate-50 z-10">اللاعب</th>
                      {selectedMetrics.map(k => (
                        <th key={k} className="text-center px-3 py-2.5 font-bold text-slate-600 min-w-[90px] whitespace-nowrap">
                          {METRIC_LABELS[k]}<br/><span className="text-[10px] text-slate-400 font-normal">({METRIC_UNITS[k]})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePlayerList.map(p => {
                      const pv: Partial<Record<MetricKey, string>> = values[p.id] ?? {}
                      const pErrs = rowErrors[p.id] ?? []
                      const pWarns = rowWarnings[p.id] ?? []
                      return (
                        <React.Fragment key={p.id}>
                          <tr className={`border-b border-slate-100 ${pErrs.length ? 'bg-red-50' : pWarns.length ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-2.5 sticky right-0 bg-white z-10">
                              <div className="flex items-center gap-2">
                                <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                                <div>
                                  <p className="font-bold text-slate-800 text-xs">{p.full_name}</p>
                                  {calcPlayerAge(p.date_of_birth) != null && (
                                    <p className="text-[10px] text-slate-400">{calcPlayerAge(p.date_of_birth)} سنة</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            {selectedMetrics.map(k => {
                              const isLocked = !!calcLocked[p.id]?.[k]
                              return (
                                <td key={k} className="px-2 py-2">
                                  <input type="number" step="0.1" min="0"
                                    readOnly={isLocked}
                                    className={`w-full border rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none ${
                                      isLocked
                                        ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                        : pErrs.some(e => e.includes(METRIC_LABELS[k]))
                                          ? 'border-red-400 bg-red-50 focus:ring-1 focus:ring-brand-400'
                                          : 'border-slate-200 focus:ring-1 focus:ring-brand-400'
                                    }`}
                                    value={pv[k] ?? ''}
                                    onChange={e => !isLocked && setVal(p.id, k, e.target.value)}
                                    placeholder={isLocked ? '—' : '—'}
                                    title={isLocked ? 'محسوبة تلقائياً' : undefined}/>
                                </td>
                              )
                            })}
                          </tr>
                          {(pErrs.length > 0 || pWarns.length > 0) && (
                            <tr>
                              <td colSpan={selectedMetrics.length + 1} className="px-3 pb-2">
                                {pErrs.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                                {pWarns.map((w, i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Auto-calc info */}
              <p className="text-xs text-slate-400">* الخلايا الرمادية محسوبة تلقائياً — أدخل نسبة الدهون أو مقدارها وسيحتسب الآخر، وكذلك العضل. BMI وطول الساق يحتسبان تلقائياً.</p>

              {globalErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  {globalErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-slate-100 flex-shrink-0">
          {step > 0 && (
            <button onClick={() => { setStep(s => s - 1); setWarningConfirmed(false) }}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
              <ChevronRight size={15}/> السابق
            </button>
          )}
          <div className="flex-1"/>
          {step < 2 ? (
            <button
              disabled={
                (step === 0 && selectedPlayers.length === 0) ||
                (step === 1 && selectedMetrics.length === 0)
              }
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-40">
              التالي <ChevronLeft size={15}/>
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 ${
                warningConfirmed && Object.keys(rowWarnings).length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}>
              {saving ? 'جاري الحفظ...' : warningConfirmed && Object.keys(rowWarnings).length > 0 ? 'تأكيد الحفظ رغم التحذيرات' : 'حفظ القياسات'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Player Comparison Section ──────────────────────────────────────────
interface ComparisonProps {
  player: any
  onClose: () => void
  canManage: boolean
  userId: string
  onDataChanged: () => void
}

function PlayerComparisonSection({ player, onClose, canManage, userId, onDataChanged }: ComparisonProps) {
  const measurements = player.measurements ?? []
  const [chartMetric, setChartMetric] = useState<MetricKey | 'bmi'>('standing_height_cm')
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)

  const summary = useMemo(() => {
    const entries: { key: MetricKey | 'bmi' | 'growth'; label: string; unit: string; curr: number | null; prev: number | null; diff: number | null; trend: string }[] = []
    METRIC_KEYS.forEach(k => {
      const { latest, prev, diff, trend } = compareLatestWithPrevious(measurements, k)
      entries.push({ key: k, label: METRIC_LABELS[k], unit: METRIC_UNITS[k], curr: latest, prev, diff, trend })
    })
    // BMI card
    const bmiData = compareBMI(measurements)
    entries.push({ key: 'bmi', label: 'مؤشر كتلة الجسم', unit: '', curr: bmiData.latest, prev: bmiData.prev, diff: bmiData.diff, trend: bmiData.trend })
    // Growth velocity card
    const gv = getGrowthVelocity(measurements)
    entries.push({ key: 'growth', label: 'سرعة النمو', unit: 'سم/سنة', curr: gv, prev: null, diff: null, trend: 'لا توجد مقارنة سابقة' })
    return entries
  }, [measurements])

  // Chart series
  const chartSeries = useMemo(() => {
    if (chartMetric === 'bmi') return getBMITimeSeries(measurements)
    return getMetricTimeSeries(measurements, chartMetric as MetricKey)
  }, [measurements, chartMetric])

  const chartLabel = chartMetric === 'bmi' ? 'مؤشر كتلة الجسم'
    : METRIC_LABELS[chartMetric as MetricKey]
  const chartUnit = chartMetric === 'bmi' ? '' : METRIC_UNITS[chartMetric as MetricKey]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 mt-4">

      {/* Player header */}
      <div className="flex items-center gap-3 p-5 border-b border-slate-100">
        <Avatar name={player.full_name} src={player.avatar_url} size="md"/>
        <div className="flex-1">
          <h3 className="font-extrabold text-slate-800">{player.full_name}</h3>
          <p className="text-xs text-slate-400">
            {calcPlayerAge(player.date_of_birth) != null ? `${calcPlayerAge(player.date_of_birth)} سنة · ` : ''}
            {measurements.length} قياس مسجل
          </p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X size={16}/></button>
      </div>

      <div className="p-5 space-y-6">

        {/* Summary cards */}
        <div>
          <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">ملخص القياسات</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {summary.map(s => (
              <div key={s.key} className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 font-bold mb-1 truncate">{s.label}</p>
                <p className="text-lg font-extrabold text-slate-800">
                  {s.curr != null ? s.curr : <span className="text-slate-300 text-sm">—</span>}
                  {s.curr != null && s.unit && <span className="text-[10px] text-slate-400 mr-1">{s.unit}</span>}
                </p>
                {s.prev != null && (
                  <p className="text-[10px] text-slate-400">السابق: {s.prev} {s.unit}</p>
                )}
                <div className="mt-1"><TrendBadge trend={s.trend} diff={s.diff}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">الرسم البياني</p>
            <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              value={chartMetric} onChange={e => setChartMetric(e.target.value as any)}>
              {METRIC_KEYS.map(k => <option key={k} value={k}>{METRIC_LABELS[k]}</option>)}
              <option value="bmi">مؤشر كتلة الجسم</option>
            </select>
          </div>
          <LineChart series={chartSeries} label={chartLabel} unit={chartUnit}/>
        </div>

        {/* History table */}
        <div>
          <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">سجل القياسات</p>
          {measurements.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">لا توجد قياسات مسجلة</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">التاريخ</th>
                    <th className="text-center px-2 py-2.5 font-bold">طول ↕</th>
                    <th className="text-center px-2 py-2.5 font-bold">طول ↕↕</th>
                    <th className="text-center px-2 py-2.5 font-bold">الوزن</th>
                    <th className="text-center px-2 py-2.5 font-bold">BMI</th>
                    <th className="text-center px-2 py-2.5 font-bold">دهون%</th>
                    <th className="text-center px-2 py-2.5 font-bold">كتلة د</th>
                    <th className="text-center px-2 py-2.5 font-bold">عضل%</th>
                    <th className="text-center px-2 py-2.5 font-bold">كتلة ع</th>
                    <th className="text-center px-2 py-2.5 font-bold">الطريقة</th>
                    <th className="text-center px-2 py-2.5 font-bold">تعديل</th>
                    {canManage && <th className="text-center px-2 py-2.5 font-bold">إجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m: any, i: number) => {
                    const bmi = calculateBMI(m.weight_kg, m.standing_height_cm)
                    return (
                      <tr key={m.id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                        <td className="px-3 py-2 text-right font-bold text-slate-700 whitespace-nowrap">
                          <div>{formatDate(m.measurement_date)}</div>
                          {m.measurement_time && <div className="text-[10px] text-slate-400">{m.measurement_time}</div>}
                          {m.notes && <div className="text-[10px] text-slate-400 max-w-[100px] truncate">{m.notes}</div>}
                        </td>
                        {(['standing_height_cm', 'sitting_height_cm', 'weight_kg'] as const).map(k => (
                          <td key={k} className="px-2 py-2 text-center text-slate-600">
                            {m[k] != null ? m[k] : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center">
                          {bmi != null ? (
                            <span className={`font-bold px-1 py-0.5 rounded text-[10px] ${
                              bmi < 18.5 ? 'bg-blue-100 text-blue-700' : bmi < 25 ? 'bg-emerald-100 text-emerald-700' : bmi < 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                            }`}>{bmi}</span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        {(['body_fat_percent', 'body_fat_mass_kg', 'muscle_percent', 'muscle_mass_kg'] as const).map(k => (
                          <td key={k} className="px-2 py-2 text-center text-slate-600">
                            {m[k] != null ? m[k] : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center text-slate-500">{m.measurement_method ?? '—'}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            m.edit_count >= 3 ? 'bg-red-100 text-red-600' : m.edit_count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>{m.edit_count ?? 0}/3</span>
                        </td>
                        {canManage && (
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setEditTarget(m)} title="تعديل"
                                disabled={m.edit_count >= 3}
                                className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-600 disabled:opacity-30 disabled:cursor-not-allowed">
                                <Pencil size={12}/>
                              </button>
                              <button onClick={() => setDeleteTarget(m)} title="حذف"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                                <Trash2 size={12}/>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit/Delete modals */}
      {editTarget && (
        <EditModal
          measurement={editTarget}
          allMeasurements={measurements}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onDataChanged() }}
          userId={userId}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          measurement={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); onDataChanged() }}
          userId={userId}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────
type ExtSortKey = 'name' | 'age' | MetricKey | 'bmi' | 'growth' | 'lastDate'

export default function MeasurementsPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const { user } = useAuth()
  const [myRole, setMyRole] = useState('')
  const [tab, setTab] = useState<'basic' | 'fitness' | 'technical'>('basic')
  const [playerData, setPlayerData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [fitnessAddTrigger, setFitnessAddTrigger] = useState(0)
  const [sortKey, setSortKey] = useState<ExtSortKey>('age')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [comparePlayer, setComparePlayer] = useState<any | null>(null)

  const canManage = canManageEvents(myRole)

  useEffect(() => {
    if (!teamId || !user) return
    import('../../services').then(({ teamService }) => {
      teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    })
  }, [teamId, user])

  async function loadData() {
    if (!teamId) return
    setLoading(true)
    const data = await measurementService.getPlayersWithMeasurements(teamId)
    setPlayerData(data)
    // Refresh comparison player if open
    if (comparePlayer) {
      const refreshed = data.find((p: any) => p.id === comparePlayer.id)
      if (refreshed) setComparePlayer(refreshed)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [teamId])

  // All measurements flat array for 30-day rule checks
  const allMeasurements = useMemo(() => playerData.flatMap((p: any) => p.measurements ?? []), [playerData])

  // Compute derived row values for sorting/display
  const rows = useMemo(() => playerData.map((p: any) => {
    const ms: any[] = p.measurements ?? []
    return {
      ...p,
      age: calcPlayerAge(p.date_of_birth),
      latestByMetric: Object.fromEntries(METRIC_KEYS.map(k => [k, getLatestByMetric(ms, k)])),
      latestBMI: getLatestBMI(ms),
      growthVelocity: getGrowthVelocity(ms),
      heightSparkline: getHeightSparkline(ms),
      lastDate: ms[0]?.measurement_date ?? null,
    }
  }), [playerData])

  function handleSort(k: ExtSortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'name': va = a.full_name ?? ''; vb = b.full_name ?? ''; break
        case 'age': va = a.age ?? 999; vb = b.age ?? 999; break
        case 'bmi': va = a.latestBMI; vb = b.latestBMI; break
        case 'growth': va = a.growthVelocity; vb = b.growthVelocity; break
        case 'lastDate': va = a.lastDate ?? '0000'; vb = b.lastDate ?? '0000'; break
        default: va = a.latestByMetric?.[sortKey as MetricKey]; vb = b.latestByMetric?.[sortKey as MetricKey]
      }
      // Nulls always at bottom
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sortKey, sortDir])

  function SortIcon({ k }: { k: ExtSortKey }) {
    if (sortKey !== k) return <span className="text-slate-300 text-[9px] ml-0.5">↕</span>
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-brand-600 inline ml-0.5"/>
      : <ChevronDown size={11} className="text-brand-600 inline ml-0.5"/>
  }

  function Th({ label, k, extra }: { label: string; k: ExtSortKey; extra?: string }) {
    return (
      <th className={`px-2 py-2.5 text-center font-bold cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap text-[11px] ${extra ?? ''}`}
        onClick={() => handleSort(k)}>
        {label}<SortIcon k={k}/>
      </th>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <Ruler size={22} className="text-brand-600"/> القياسات والمتابعة
          </h1>
          <p className="text-sm text-slate-500 mt-1">متابعة النمو والتطور البدني للاعبين</p>
        </div>
        {canManage && tab === 'basic' && (
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700">
            <Plus size={16}/> إضافة قياس
          </button>
        )}
        {canManage && tab === 'fitness' && (
          <button onClick={() => setFitnessAddTrigger(t => t + 1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700">
            <Plus size={16}/> إضافة اختبار لياقي
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: 'basic', label: 'القياسات الأساسية', icon: Ruler },
          { key: 'fitness', label: 'القياسات اللياقية', icon: Dumbbell },
          { key: 'technical', label: 'التقييمات الفنية والتكتيكية', icon: BarChart2 },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={15}/> {label}
          </button>
        ))}
      </div>

      {/* Technical Evaluations tab */}
      {tab === 'technical' && <TechnicalEvalPage/>}

      {/* Fitness tab */}
      {tab === 'fitness' && <FitnessPage addTrigger={fitnessAddTrigger}/>}

      {/* Basic tab */}
      {tab === 'basic' && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Ruler size={36} className="text-slate-300 mb-3"/>
              <p className="font-bold text-slate-600 mb-1">لا يوجد لاعبون</p>
              <p className="text-sm text-slate-400">أضف لاعبين للفريق أولاً</p>
            </div>
          ) : (
            <>
              {/* Team bar chart */}
              <BasicTeamBarChart players={sorted}/>

              {/* Players table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-center font-bold w-8 text-[11px]">#</th>
                        <th className="px-3 py-2.5 text-right font-bold text-[11px] cursor-pointer hover:bg-slate-100 min-w-[130px]"
                          onClick={() => handleSort('name')}>اللاعب<SortIcon k="name"/></th>
                        <Th label="العمر" k="age"/>
                        <Th label="طول ↕" k="standing_height_cm"/>
                        <Th label="طول ↕↕" k="sitting_height_cm"/>
                        <Th label="الوزن" k="weight_kg"/>
                        <Th label="BMI" k="bmi"/>
                        <Th label="دهون%" k="body_fat_percent"/>
                        <Th label="كتلة د" k="body_fat_mass_kg"/>
                        <Th label="عضل%" k="muscle_percent"/>
                        <Th label="كتلة ع" k="muscle_mass_kg"/>
                        <Th label="نمو" k="growth"/>
                        <Th label="آخر قياس" k="lastDate"/>
                        <th className="px-2 py-2.5 text-center font-bold text-[11px]">اتجاه</th>
                        <th className="px-2 py-2.5 text-center font-bold text-[11px]">تفاصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p, i) => {
                        const bmi = p.latestBMI
                        const isSelected = comparePlayer?.id === p.id
                        const lm = p.latestByMetric
                        const ageColor = getMeasurementAgeColor(p.lastDate)
                        const { trend } = compareLatestWithPrevious(p.measurements ?? [], 'standing_height_cm')
                        return (
                          <tr key={p.id} className={`border-b border-slate-100 transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                            <td className="px-3 py-2.5 text-slate-400 font-bold text-center">{i + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                                <div>
                                  <p className="font-bold text-slate-800 truncate max-w-[110px]">{p.full_name}</p>
                                  {p.date_of_birth && <p className="text-[10px] text-slate-400">{new Date(p.date_of_birth).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short' })}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-center text-slate-600 font-bold">{p.age ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center font-bold text-slate-700">{lm.standing_height_cm ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center text-slate-600">{lm.sitting_height_cm ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center font-bold text-slate-700">{lm.weight_kg ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center">
                              {bmi != null ? (
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                  bmi < 18.5 ? 'bg-blue-100 text-blue-700' : bmi < 25 ? 'bg-emerald-100 text-emerald-700' : bmi < 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                                }`}>{bmi}</span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-2.5 text-center text-slate-600">{lm.body_fat_percent != null ? `${lm.body_fat_percent}%` : <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center text-slate-600">{lm.body_fat_mass_kg ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center text-slate-600">{lm.muscle_percent != null ? `${lm.muscle_percent}%` : <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center text-slate-600">{lm.muscle_mass_kg ?? <span className="text-slate-300">—</span>}</td>
                            <td className="px-2 py-2.5 text-center font-bold text-slate-700">
                              {p.growthVelocity != null ? <span className="text-brand-700">{p.growthVelocity}</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {p.lastDate ? (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ageColor}`}>
                                  {getMeasurementAgeLabel(p.lastDate)}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <Sparkline values={p.heightSparkline}/>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={() => setComparePlayer(isSelected ? null : p)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                  isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                                }`}>
                                {isSelected ? '✓' : 'تفاصيل'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Player comparison section */}
              {comparePlayer && (
                <PlayerComparisonSection
                  player={comparePlayer}
                  onClose={() => setComparePlayer(null)}
                  canManage={canManage}
                  userId={user?.id ?? ''}
                  onDataChanged={loadData}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Add modal */}
      {showAddModal && teamId && user && (
        <AddMeasurementModal
          players={rows}
          allMeasurements={allMeasurements}
          teamId={teamId}
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}
