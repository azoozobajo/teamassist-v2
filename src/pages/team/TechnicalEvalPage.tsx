import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { technicalEvalService } from '../../services'
import { Avatar } from '../../components/ui'
import { canManageEvents } from '../../utils/helpers'
import {
  CATEGORY_LABELS, CATEGORY_COLORS, INDICATOR_TYPE_LABELS, PRIORITY_LABELS,
  REVIEW_TYPE_LABELS, RECOMMENDATION_OPTIONS, INDICATOR_LIBRARY, DEFAULT_EVAL_SETTINGS,
  getCurrentSeason, getSeasonOptions,
  calcStrengthAvg, calcDevAvg, calcOverallAvg, calcImprovementRate, calcIndicatorDiff,
  getStatusLabel, getStatusColorClass, getActiveIndicators,
  getTopStrengths, getMostImproved, getDeclined, getRemainingDev,
  getLastReviewDate, getMostImprovedSingle, getMostDeclinedSingle,
  fmtScore, formatReviewDate, buildIndicatorSparkline,
  type IndicatorRow, type ReviewRow, type EvalSettings,
  type IndicatorCategory, type IndicatorType, type Priority, type ReviewType,
} from '../../utils/technicalEvalHelpers'
import {
  Plus, ChevronRight, ArrowRight, Settings, Pencil, Trash2, X,
  AlertTriangle, ClipboardList, Star, TrendingUp, BarChart2,
  ChevronDown, ChevronUp, RefreshCw, FileText, GitCompare,
} from 'lucide-react'

// ── TINY HELPERS ──────────────────────────────────────────────────────

function ScoreCircle({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }[size]
  const color =
    score >= 8 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : score >= 6 ? 'bg-blue-100 text-blue-700 border-blue-300'
    : score >= 4 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : 'bg-red-50 text-red-600 border-red-200'
  return (
    <span className={`${s} ${color} border rounded-full flex items-center justify-center font-extrabold`}>
      {score}
    </span>
  )
}

function StatusBadge({ diff }: { diff: number }) {
  const cls = getStatusColorClass(diff)
  const lbl = getStatusLabel(diff)
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='} {lbl}
    </span>
  )
}

function CategoryBadge({ cat }: { cat: IndicatorCategory }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}>
      {CATEGORY_LABELS[cat]}
    </span>
  )
}

function TypeBadge({ type }: { type: IndicatorType }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
      type === 'strength' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {INDICATOR_TYPE_LABELS[type]}
    </span>
  )
}

// RTL Sparkline — newest point on the left (Arabic right-to-left)
function ScoreSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-slate-300 text-xs">—</span>
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const color = last > prev ? '#10b981' : last < prev ? '#ef4444' : '#94a3b8'
  // Reverse for RTL: newest (last) appears on the left side of the chart
  const rtl = [...values].reverse()
  const min = Math.min(...rtl), max = Math.max(...rtl), range = max - min || 1
  const W = 60, H = 24, pad = 2
  const pts = rtl.map((v, i) => {
    const x = pad + (i / (rtl.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

// Modal wrapper
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-extrabold text-slate-800 text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X size={18}/>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-slate-700">
        {label}{required && <span className="text-red-500 mr-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'
const selectCls = `${inputCls} bg-white`
const textareaCls = `${inputCls} resize-none`

// ── ADD INDICATOR MODAL ───────────────────────────────────────────────

function AddIndicatorModal({
  teamId, playerId, season, settings, onClose, onSaved,
}: {
  teamId: string; playerId: string; season: string
  settings: EvalSettings; onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [customLibrary, setCustomLibrary] = useState<{indicator_name: string; category: string}[]>([])

  const [indicatorType, setIndicatorType] = useState<IndicatorType>('strength')
  const [category, setCategory] = useState<IndicatorCategory>('technical')
  const [selectedLib, setSelectedLib] = useState('')
  const [customName, setCustomName] = useState('')
  const [selectedCustomLib, setSelectedCustomLib] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [startScore, setStartScore] = useState(5)
  const [startNote, setStartNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [nextAction, setNextAction] = useState('')

  useEffect(() => {
    technicalEvalService.getTeamCustomIndicators(teamId).then(data => setCustomLibrary(data as any[]))
  }, [teamId])

  // When switching category, reset indicator name selections
  const handleCategoryChange = (cat: IndicatorCategory) => {
    setCategory(cat)
    setSelectedLib('')
    setSelectedCustomLib('')
    setCustomName('')
  }

  // Derive the final indicator name
  const indicatorName = isCustom
    ? (customName.trim() || selectedCustomLib)
    : selectedLib

  // Custom indicators previously saved for this team in this category
  const filteredCustomLib = customLibrary.filter(i => i.category === category)

  async function handleSave() {
    setErr('')
    if (!indicatorName.trim()) return setErr('يجب اختيار المؤشر أو كتابة مؤشر مخصص.')
    if (!startNote.trim()) return setErr('لا يمكن حفظ التقييم بدون ملاحظة أو دليل.')
    if (settings.require_evidence_for_indicator && !evidence.trim()) return setErr('لا يمكن حفظ التقييم بدون ملاحظة أو دليل.')
    setSaving(true)
    const { error } = await technicalEvalService.addIndicator({
      team_id: teamId, player_id: playerId, season,
      indicator_name: indicatorName.trim(),
      indicator_type: indicatorType,
      category,
      custom_indicator: isCustom,
      start_score: startScore,
      current_score: startScore,
      priority,
      start_note: startNote.trim(),
      evidence: evidence.trim(),
      next_action: nextAction.trim() || null,
    }, user!.id)
    setSaving(false)
    if (error) return setErr(error.message)
    onSaved()
    onClose()
  }

  const libraryItems = INDICATOR_LIBRARY[category] ?? []

  return (
    <Modal title="إضافة مؤشر" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع المؤشر" required>
            <select value={indicatorType} onChange={e => setIndicatorType(e.target.value as IndicatorType)} className={selectCls}>
              <option value="strength">مؤشر قوة</option>
              <option value="development">مؤشر تطوير</option>
            </select>
          </Field>
          <Field label="التصنيف" required>
            <select value={category} onChange={e => handleCategoryChange(e.target.value as IndicatorCategory)} className={selectCls}>
              {(Object.keys(CATEGORY_LABELS) as IndicatorCategory[]).map(k => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="المؤشر" required>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setIsCustom(false)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${!isCustom ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-600 border-slate-200 hover:border-brand-300'}`}>
              من المكتبة
            </button>
            <button onClick={() => setIsCustom(true)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${isCustom ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-600 border-slate-200 hover:border-brand-300'}`}>
              مخصص
            </button>
          </div>
          {isCustom ? (
            <div className="space-y-2">
              {filteredCustomLib.length > 0 && (
                <select
                  value={selectedCustomLib}
                  onChange={e => { setSelectedCustomLib(e.target.value); setCustomName('') }}
                  className={selectCls}>
                  <option value="">— من المؤشرات المخصصة السابقة —</option>
                  {filteredCustomLib.map(item => (
                    <option key={item.indicator_name} value={item.indicator_name}>{item.indicator_name}</option>
                  ))}
                </select>
              )}
              <input
                value={customName}
                onChange={e => { setCustomName(e.target.value); setSelectedCustomLib('') }}
                placeholder="أو اكتب مؤشراً مخصصاً جديداً..."
                className={inputCls}
              />
              {(selectedCustomLib || customName) && (
                <p className="text-xs text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg">
                  سيُضاف <strong>{customName || selectedCustomLib}</strong> تلقائياً لمكتبة المؤشرات المخصصة للفريق
                </p>
              )}
            </div>
          ) : (
            <select value={selectedLib} onChange={e => setSelectedLib(e.target.value)} className={selectCls}>
              <option value="">— اختر مؤشراً —</option>
              {libraryItems.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          )}
        </Field>

        <Field label="درجة البداية (1–10)" required>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={10} value={startScore}
              onChange={e => setStartScore(Number(e.target.value))}
              className="flex-1 accent-brand-600"/>
            <ScoreCircle score={startScore} size="lg"/>
          </div>
        </Field>

        <Field label="الملاحظة" required>
          <textarea value={startNote} onChange={e => setStartNote(e.target.value)}
            rows={2} placeholder="ملاحظة المدرب عند إضافة المؤشر..." className={textareaCls}/>
        </Field>

        <Field label="الدليل / سبب التقييم" required={settings.require_evidence_for_indicator}>
          <textarea value={evidence} onChange={e => setEvidence(e.target.value)}
            rows={2} placeholder="دليل أو موقف يثبت هذا التقييم..." className={textareaCls}/>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الأولوية" required>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={selectCls}>
              {(Object.entries(PRIORITY_LABELS)).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="الإجراء القادم">
            <input value={nextAction} onChange={e => setNextAction(e.target.value)}
              placeholder="خطة المتابعة..." className={inputCls}/>
          </Field>
        </div>

        {err && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl">{err}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ المؤشر'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── ADD REVIEW MODAL ──────────────────────────────────────────────────

function AddReviewModal({
  indicator, teamId, settings, onClose, onSaved,
}: {
  indicator: IndicatorRow; teamId: string; settings: EvalSettings
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [score, setScore] = useState(indicator.current_score)
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [reviewType, setReviewType] = useState<ReviewType>('training')
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [nextAction, setNextAction] = useState('')

  async function handleSave() {
    setErr('')
    if (!note.trim()) return setErr('لا يمكن حفظ التقييم بدون ملاحظة أو دليل.')
    if (settings.require_evidence_for_indicator && !evidence.trim()) return setErr('لا يمكن حفظ التقييم بدون ملاحظة أو دليل.')
    setSaving(true)
    const { error } = await technicalEvalService.addReview({
      indicator_id: indicator.id,
      team_id: teamId,
      player_id: indicator.player_id,
      review_date: reviewDate,
      review_type: reviewType,
      score,
      note: note.trim(),
      evidence: evidence.trim(),
      next_action: nextAction.trim() || null,
    }, user!.id)
    setSaving(false)
    if (error) return setErr(error.message)
    onSaved()
    onClose()
  }

  const diff = score - indicator.start_score

  return (
    <Modal title={`مراجعة: ${indicator.indicator_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-sm flex-wrap">
          <TypeBadge type={indicator.indicator_type}/>
          <CategoryBadge cat={indicator.category}/>
          <span className="text-slate-500">البداية: {indicator.start_score}</span>
          <span className="text-slate-500">الحالي: {indicator.current_score}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ المراجعة" required>
            <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className={inputCls}/>
          </Field>
          <Field label="نوع المراجعة" required>
            <select value={reviewType} onChange={e => setReviewType(e.target.value as ReviewType)} className={selectCls}>
              {(Object.entries(REVIEW_TYPE_LABELS)).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="الدرجة الجديدة (1–10)" required>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={10} value={score}
              onChange={e => setScore(Number(e.target.value))}
              className="flex-1 accent-brand-600"/>
            <ScoreCircle score={score} size="lg"/>
            <StatusBadge diff={diff}/>
          </div>
        </Field>

        <Field label="الملاحظة" required>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            rows={2} placeholder="ملاحظة المدرب عن هذا التطور..." className={textareaCls}/>
        </Field>

        <Field label="الدليل / سبب التقييم" required={settings.require_evidence_for_indicator}>
          <textarea value={evidence} onChange={e => setEvidence(e.target.value)}
            rows={2} placeholder="دليل أو موقف يثبت هذا التغيير..." className={textareaCls}/>
        </Field>

        <Field label="الإجراء القادم">
          <input value={nextAction} onChange={e => setNextAction(e.target.value)}
            placeholder="ما الخطوة التالية في تطوير هذا الجانب؟" className={inputCls}/>
        </Field>

        {err && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl">{err}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ المراجعة'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── EDIT INDICATOR MODAL ──────────────────────────────────────────────

function EditIndicatorModal({
  indicator, teamId, settings, onClose, onSaved,
}: {
  indicator: IndicatorRow; teamId: string; settings: EvalSettings
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [startNote, setStartNote] = useState(indicator.start_note)
  const [evidence, setEvidence] = useState(indicator.evidence)
  const [priority, setPriority] = useState<Priority>(indicator.priority)
  const [nextAction, setNextAction] = useState(indicator.next_action ?? '')
  const [reason, setReason] = useState('')

  async function handleSave() {
    setErr('')
    if (!reason.trim()) return setErr('يجب كتابة سبب التعديل قبل حفظ التغييرات.')
    setSaving(true)
    const { error } = await technicalEvalService.updateIndicator(
      indicator.id, teamId, indicator.player_id,
      { start_note: startNote, evidence, priority, next_action: nextAction || null },
      reason.trim(), user!.id
    )
    setSaving(false)
    if (error) return setErr(error.message)
    onSaved(); onClose()
  }

  return (
    <Modal title={`تعديل: ${indicator.indicator_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          ملاحظة: لا يمكن تعديل اسم المؤشر أو درجة البداية لضمان سلامة التاريخ.
        </div>
        <Field label="الملاحظة" required>
          <textarea value={startNote} onChange={e => setStartNote(e.target.value)} rows={2} className={textareaCls}/>
        </Field>
        <Field label="الدليل / سبب التقييم" required={settings.require_evidence_for_indicator}>
          <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={2} className={textareaCls}/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الأولوية">
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={selectCls}>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="الإجراء القادم">
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} className={inputCls}/>
          </Field>
        </div>
        <Field label="سبب التعديل" required>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            rows={2} placeholder="يجب كتابة سبب التعديل قبل حفظ التغييرات." className={textareaCls}/>
        </Field>
        {err && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ التعديل'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── DELETE INDICATOR MODAL ────────────────────────────────────────────

function DeleteIndicatorModal({
  indicator, teamId, onClose, onDeleted,
}: {
  indicator: IndicatorRow; teamId: string; onClose: () => void; onDeleted: () => void
}) {
  const { user } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  async function handleDelete() {
    setErr('')
    if (!reason.trim()) return setErr('يجب كتابة سبب الحذف.')
    setDeleting(true)
    const { error } = await technicalEvalService.softDeleteIndicator(
      indicator.id, teamId, indicator.player_id, reason.trim(), user!.id
    )
    setDeleting(false)
    if (error) return setErr(error.message)
    onDeleted(); onClose()
  }

  return (
    <Modal title="حذف المؤشر" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5"/>
          <div>
            <p className="font-bold text-red-700 text-sm">حذف هذا المؤشر سيؤثر على التقارير والمقارنات. هل أنت متأكد؟</p>
            <p className="text-red-600 text-xs mt-1">المؤشر: <strong>{indicator.indicator_name}</strong></p>
          </div>
        </div>
        <Field label="سبب الحذف" required>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            rows={2} placeholder="يجب كتابة سبب الحذف." className={textareaCls}/>
        </Field>
        {err && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-60">
            {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── DELETE REVIEW MODAL ───────────────────────────────────────────────

function DeleteReviewModal({
  review, indicatorId, teamId, playerId, onClose, onDeleted,
}: {
  review: ReviewRow; indicatorId: string; teamId: string; playerId: string
  onClose: () => void; onDeleted: () => void
}) {
  const { user } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  async function handleDelete() {
    setErr('')
    if (!reason.trim()) return setErr('يجب كتابة سبب الحذف.')
    setDeleting(true)
    const { error } = await technicalEvalService.softDeleteReview(
      review.id, indicatorId, teamId, playerId, reason.trim(), user!.id
    )
    setDeleting(false)
    if (error) return setErr(error.message)
    onDeleted(); onClose()
  }

  return (
    <Modal title="حذف المراجعة" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5"/>
          <p className="font-bold text-red-700 text-sm">سيتم حذف هذه المراجعة وإعادة حساب الدرجة الحالية.</p>
        </div>
        <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">
          <span className="font-bold">{REVIEW_TYPE_LABELS[review.review_type]}</span>
          {' · '}{formatReviewDate(review.review_date)}
          {' · '}درجة: <strong>{review.score}</strong>
        </div>
        <Field label="سبب الحذف" required>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            rows={2} placeholder="يجب كتابة سبب الحذف." className={textareaCls}/>
        </Field>
        {err && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-xl">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-60">
            {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SETTINGS MODAL ────────────────────────────────────────────────────

function SettingsModal({
  teamId, settings, onClose, onSaved,
}: {
  teamId: string; settings: EvalSettings; onClose: () => void; onSaved: (s: EvalSettings) => void
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [s, setS] = useState<EvalSettings>({ ...settings })

  async function handleSave() {
    setSaving(true)
    await technicalEvalService.saveSettings(teamId, s, user!.id)
    setSaving(false)
    onSaved(s)
    onClose()
  }

  const toggle = (key: keyof EvalSettings) => setS(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <Modal title="إعدادات التقييمات الفنية" onClose={onClose}>
      <div className="space-y-5">
        {[
          { key: 'show_overall_score' as const, label: 'إظهار المتوسط العام للاعبين' },
          { key: 'show_strength_average' as const, label: 'إظهار متوسط مؤشرات القوة' },
          { key: 'show_development_average' as const, label: 'إظهار متوسط مؤشرات التطوير' },
          { key: 'require_note_for_score' as const, label: 'إلزامية الملاحظة عند كل تقييم' },
          { key: 'require_evidence_for_indicator' as const, label: 'إلزامية الدليل عند إضافة مؤشر' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-slate-700 flex-1">{label}</span>
            {/* Fixed toggle — proper absolute positioning */}
            <button
              onClick={() => toggle(key)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${s[key] ? 'bg-brand-600' : 'bg-slate-200'}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${s[key] ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        ))}

        <div className="pt-2 border-t border-slate-100">
          <Field label="الحد الأدنى للمؤشرات لحساب المتوسط العام">
            <div className="flex items-center gap-3 mt-1">
              <input type="range" min={1} max={20} value={s.minimum_indicators_for_overall_score}
                onChange={e => setS(prev => ({ ...prev, minimum_indicators_for_overall_score: Number(e.target.value) }))}
                className="flex-1 accent-brand-600"/>
              <span className="font-extrabold text-brand-600 text-lg w-8 text-center">{s.minimum_indicators_for_overall_score}</span>
            </div>
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── INDICATORS TABLE ──────────────────────────────────────────────────

function IndicatorsTable({
  indicators, type, canManage, teamId, settings,
  onAddReview, onEdit, onDelete, onRefresh,
}: {
  indicators: IndicatorRow[]
  type: IndicatorType
  canManage: boolean
  teamId: string
  settings: EvalSettings
  onAddReview: (ind: IndicatorRow) => void
  onEdit: (ind: IndicatorRow) => void
  onDelete: (ind: IndicatorRow) => void
  onRefresh: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteReview, setDeleteReview] = useState<{ review: ReviewRow; ind: IndicatorRow } | null>(null)

  const filtered = indicators.filter(i => i.indicator_type === type)

  if (!filtered.length) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <ClipboardList size={32} className="text-slate-300 mb-3"/>
        <p className="font-bold text-slate-500 mb-1">لا توجد مؤشرات مسجلة</p>
        {canManage && (
          <p className="text-sm text-slate-400">
            {type === 'strength' ? 'أضف أول مؤشر قوة لهذا اللاعب' : 'أضف أول مؤشر تطوير لهذا اللاعب'}
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map(ind => {
          const diff = calcIndicatorDiff(ind)
          const sparkline = buildIndicatorSparkline(ind)
          const activeReviews = (ind.reviews ?? []).filter(r => !r.deleted_at)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
          const expanded = expandedId === ind.id

          return (
            <div key={ind.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-slate-800 text-sm">{ind.indicator_name}</span>
                      <CategoryBadge cat={ind.category}/>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ind.priority === 'high' ? 'bg-red-100 text-red-600'
                        : ind.priority === 'medium' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-slate-100 text-slate-500'
                      }`}>
                        {PRIORITY_LABELS[ind.priority]}
                      </span>
                      {ind.custom_indicator && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">مخصص</span>
                      )}
                    </div>

                    {/* Score row */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 mb-2">
                      <span>بداية: <strong className="text-slate-700">{ind.start_score}</strong></span>
                      <span>حالي: <strong className="text-slate-700">{ind.current_score}</strong></span>
                      <StatusBadge diff={diff}/>
                      <ScoreSparkline values={sparkline}/>
                    </div>

                    {/* Always-visible note */}
                    {ind.start_note && (
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
                        <span className="font-bold text-slate-400 text-[10px] block mb-0.5">الملاحظة</span>
                        {ind.start_note}
                      </div>
                    )}

                    {/* Always-visible evidence */}
                    {ind.evidence && (
                      <div className="mt-1.5 p-2.5 bg-blue-50 rounded-xl text-xs text-blue-700 border border-blue-100">
                        <span className="font-bold text-[10px] block mb-0.5">الدليل</span>
                        {ind.evidence}
                      </div>
                    )}

                    {ind.next_action && (
                      <p className="text-xs text-brand-600 mt-1.5">← {ind.next_action}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <ScoreCircle score={ind.current_score}/>
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <>
                          <button onClick={() => onAddReview(ind)}
                            title="إضافة مراجعة"
                            className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50">
                            <Plus size={14}/>
                          </button>
                          <button onClick={() => onEdit(ind)}
                            title="تعديل"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                            <Pencil size={13}/>
                          </button>
                          <button onClick={() => onDelete(ind)}
                            title="حذف"
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                            <Trash2 size={13}/>
                          </button>
                        </>
                      )}
                      {activeReviews.length > 0 && (
                        <button onClick={() => setExpandedId(expanded ? null : ind.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                          {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        </button>
                      )}
                    </div>
                    {activeReviews.length > 0 && (
                      <span className="text-[10px] text-slate-400">{activeReviews.length} مراجعة</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded reviews */}
              {expanded && activeReviews.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-slate-500 mb-2">سجل المراجعات ({activeReviews.length})</p>
                  {activeReviews.map(rev => (
                    <div key={rev.id} className="bg-white rounded-xl p-3 border border-slate-100">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-xs font-bold text-slate-700">{REVIEW_TYPE_LABELS[rev.review_type]}</span>
                            <span className="text-[10px] text-slate-400">{formatReviewDate(rev.review_date)}</span>
                            <ScoreCircle score={rev.score} size="sm"/>
                            <StatusBadge diff={rev.score - ind.start_score}/>
                          </div>
                          {rev.note && (
                            <div className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600 mb-1">
                              <span className="font-bold text-[10px] text-slate-400 block mb-0.5">الملاحظة</span>
                              {rev.note}
                            </div>
                          )}
                          {rev.evidence && (
                            <div className="p-2 bg-blue-50 rounded-lg text-xs text-blue-700 mb-1">
                              <span className="font-bold text-[10px] block mb-0.5">الدليل</span>
                              {rev.evidence}
                            </div>
                          )}
                          {rev.next_action && <p className="text-xs text-brand-600 mt-0.5">← {rev.next_action}</p>}
                        </div>
                        {canManage && (
                          <button onClick={() => setDeleteReview({ review: rev, ind })}
                            className="p-1 rounded text-red-400 hover:bg-red-50 shrink-0">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {deleteReview && (
        <DeleteReviewModal
          review={deleteReview.review}
          indicatorId={deleteReview.ind.id}
          teamId={teamId}
          playerId={deleteReview.ind.player_id}
          onClose={() => setDeleteReview(null)}
          onDeleted={() => { setDeleteReview(null); onRefresh() }}
        />
      )}
    </>
  )
}

// ── ALL REVIEWS TAB ───────────────────────────────────────────────────

function AllReviewsTab({
  indicators, canManage, teamId, onRefresh,
}: {
  indicators: IndicatorRow[]; canManage: boolean; teamId: string; onRefresh: () => void
}) {
  const [deleteReview, setDeleteReview] = useState<{ review: ReviewRow; ind: IndicatorRow } | null>(null)

  const allReviews = indicators.flatMap(ind =>
    (ind.reviews ?? [])
      .filter(r => !r.deleted_at)
      .map(r => ({ review: r, indicator: ind }))
  ).sort((a, b) => b.review.created_at.localeCompare(a.review.created_at))

  if (!allReviews.length) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <RefreshCw size={32} className="text-slate-300 mb-3"/>
        <p className="font-bold text-slate-500">لا توجد مراجعات مسجلة بعد.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {allReviews.map(({ review, indicator }) => (
          <div key={review.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-bold text-sm text-slate-800">{indicator.indicator_name}</span>
                  <TypeBadge type={indicator.indicator_type}/>
                  <CategoryBadge cat={indicator.category}/>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold text-slate-600">{REVIEW_TYPE_LABELS[review.review_type]}</span>
                  <span className="text-xs text-slate-400">{formatReviewDate(review.review_date)}</span>
                  <ScoreCircle score={review.score} size="sm"/>
                  <StatusBadge diff={review.score - indicator.start_score}/>
                </div>
                {review.note && (
                  <div className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600 mb-1">
                    <span className="font-bold text-[10px] text-slate-400 block mb-0.5">الملاحظة</span>
                    {review.note}
                  </div>
                )}
                {review.evidence && (
                  <div className="p-2 bg-blue-50 rounded-lg text-xs text-blue-700 mb-1">
                    <span className="font-bold text-[10px] block mb-0.5">الدليل</span>
                    {review.evidence}
                  </div>
                )}
                {review.next_action && <p className="text-xs text-brand-600 mt-0.5">← {review.next_action}</p>}
              </div>
              {canManage && (
                <button onClick={() => setDeleteReview({ review, ind: indicator })}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 shrink-0">
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {deleteReview && (
        <DeleteReviewModal
          review={deleteReview.review}
          indicatorId={deleteReview.ind.id}
          teamId={teamId}
          playerId={deleteReview.ind.player_id}
          onClose={() => setDeleteReview(null)}
          onDeleted={() => { setDeleteReview(null); onRefresh() }}
        />
      )}
    </>
  )
}

// ── CHARTS TAB ────────────────────────────────────────────────────────

function ChartsTab({ indicators }: { indicators: IndicatorRow[] }) {
  const active = getActiveIndicators(indicators)
  const improved = active.filter(i => calcIndicatorDiff(i) > 0).length
  const same = active.filter(i => calcIndicatorDiff(i) === 0).length
  const declined = active.filter(i => calcIndicatorDiff(i) < 0).length
  const total = active.length

  const categoryData = (Object.keys(CATEGORY_LABELS) as IndicatorCategory[]).map(cat => ({
    cat, label: CATEGORY_LABELS[cat],
    items: active.filter(i => i.category === cat),
  })).filter(d => d.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h4 className="font-extrabold text-slate-700 text-sm mb-4">توزيع حالة المؤشرات</h4>
        {total === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">لا توجد بيانات كافية.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-3">
              {[
                { label: 'تحسن', count: improved, color: 'bg-emerald-500' },
                { label: 'ثابت', count: same, color: 'bg-slate-300' },
                { label: 'تراجع', count: declined, color: 'bg-red-400' },
              ].map(d => (
                <div key={d.label} className="flex-1 text-center">
                  <div className={`${d.color} text-white rounded-xl py-3 font-extrabold text-2xl mb-1`}>{d.count}</div>
                  <p className="text-xs text-slate-500">{d.label}</p>
                </div>
              ))}
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {improved > 0 && <div style={{ flex: improved }} className="bg-emerald-500 rounded-r-full"/>}
              {same > 0 && <div style={{ flex: same }} className="bg-slate-300"/>}
              {declined > 0 && <div style={{ flex: declined }} className="bg-red-400 rounded-l-full"/>}
            </div>
          </>
        )}
      </div>

      {categoryData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h4 className="font-extrabold text-slate-700 text-sm mb-4">متوسطات التصنيفات</h4>
          <div className="space-y-3">
            {categoryData.map(({ cat, label, items }) => {
              const avg = items.reduce((s, i) => s + i.current_score, 0) / items.length
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]} w-28 text-center shrink-0`}>{label}</span>
                  {/* RTL bar: starts from right */}
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden" dir="rtl">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(avg / 10) * 100}%` }}/>
                  </div>
                  <span className="text-sm font-extrabold text-slate-700 w-14 text-left">{fmtScore(avg)}/10</span>
                  <span className="text-xs text-slate-400">({items.length})</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h4 className="font-extrabold text-slate-700 text-sm mb-4">
            تطور المؤشرات الفردية
            <span className="text-xs text-slate-400 font-normal mr-2">(الأحدث على اليسار)</span>
          </h4>
          <div className="space-y-3">
            {active.slice(0, 8).map(ind => {
              const pts = buildIndicatorSparkline(ind)
              return (
                <div key={ind.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-700 font-bold w-36 truncate">{ind.indicator_name}</span>
                  <ScoreSparkline values={pts}/>
                  <span className="text-xs text-slate-500">{ind.start_score} → <strong className="text-slate-700">{ind.current_score}</strong></span>
                  <StatusBadge diff={calcIndicatorDiff(ind)}/>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SEASON REPORT TAB ─────────────────────────────────────────────────

function ReportTab({
  indicators, player, season, settings,
}: {
  indicators: IndicatorRow[]; player: any; season: string; settings: EvalSettings
}) {
  const [conclusion, setConclusion] = useState('')
  const [recommendation, setRecommendation] = useState('')

  const active = getActiveIndicators(indicators)
  const strengthAvg = calcStrengthAvg(indicators)
  const devAvg = calcDevAvg(indicators)
  const overallAvg = calcOverallAvg(indicators, settings.minimum_indicators_for_overall_score)
  const improvementRate = calcImprovementRate(indicators)
  const improved = active.filter(i => calcIndicatorDiff(i) > 0).length
  const same = active.filter(i => calcIndicatorDiff(i) === 0).length
  const declined = active.filter(i => calcIndicatorDiff(i) < 0).length
  const top5 = getTopStrengths(indicators, 5)
  const mostImproved5 = getMostImproved(indicators, 5)
  const remainingDev = getRemainingDev(indicators, 5)
  const declinedList = getDeclined(indicators)

  if (active.length < settings.minimum_indicators_for_overall_score) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <FileText size={32} className="text-slate-300 mb-3"/>
        <p className="font-bold text-slate-500 mb-2">لا توجد بيانات كافية لإصدار تقرير نهاية الموسم.</p>
        <p className="text-sm text-slate-400">
          يجب أن يكون للاعب على الأقل {settings.minimum_indicators_for_overall_score} مؤشرات نشطة.
          <br/>لديه حالياً {active.length} مؤشر.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-l from-brand-50 to-white border border-brand-200 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <FileText size={18} className="text-white"/>
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800">تقرير نهاية الموسم</h4>
            <p className="text-xs text-slate-500">الموسم: {season} · اللاعب: {player?.full_name}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {settings.show_strength_average && strengthAvg !== null && (
            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">متوسط مؤشرات القوة</p>
              <p className="font-extrabold text-emerald-600 text-lg">{fmtScore(strengthAvg)}</p>
              <p className="text-[10px] text-slate-400">/ 10</p>
            </div>
          )}
          {settings.show_development_average && devAvg !== null && (
            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">متوسط مؤشرات التطوير</p>
              <p className="font-extrabold text-amber-600 text-lg">{fmtScore(devAvg)}</p>
              <p className="text-[10px] text-slate-400">/ 10</p>
            </div>
          )}
          {settings.show_overall_score && overallAvg !== null && (
            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">المتوسط العام</p>
              <p className="font-extrabold text-brand-600 text-lg">{fmtScore(overallAvg)}</p>
              <p className="text-[10px] text-slate-400">/ 10</p>
            </div>
          )}
          {improvementRate !== null && (
            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">معدل التطور</p>
              <p className={`font-extrabold text-lg ${improvementRate >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {improvementRate >= 0 ? '+' : ''}{fmtScore(improvementRate)}
              </p>
              <p className="text-[10px] text-slate-400">نقطة</p>
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-emerald-600 font-bold">↑ {improved} تحسن</span>
          <span className="text-slate-400 font-bold">= {same} ثابت</span>
          <span className="text-red-500 font-bold">↓ {declined} تراجع</span>
          <span className="text-slate-400">| الإجمالي: {active.length} مؤشر</span>
        </div>
      </div>

      {top5.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h5 className="font-extrabold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <Star size={15} className="text-yellow-500"/> أقوى 5 مؤشرات
          </h5>
          <div className="space-y-2">
            {top5.map((ind, i) => (
              <div key={ind.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-slate-700">{ind.indicator_name}</span>
                <CategoryBadge cat={ind.category}/>
                <TypeBadge type={ind.indicator_type}/>
                <ScoreCircle score={ind.current_score} size="sm"/>
              </div>
            ))}
          </div>
        </div>
      )}

      {mostImproved5.length > 0 && mostImproved5[0].diff > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h5 className="font-extrabold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-emerald-500"/> أكثر 5 مؤشرات تطوراً
          </h5>
          <div className="space-y-2">
            {mostImproved5.filter(ind => ind.diff > 0).map((ind, i) => (
              <div key={ind.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-slate-700">{ind.indicator_name}</span>
                <span className="text-xs text-slate-500">{ind.start_score} ← {ind.current_score}</span>
                <StatusBadge diff={ind.diff}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {remainingDev.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h5 className="font-extrabold text-slate-700 text-sm mb-3">أهم مؤشرات التطوير المتبقية</h5>
          <div className="space-y-2">
            {remainingDev.map((ind, i) => (
              <div key={ind.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-slate-700">{ind.indicator_name}</span>
                <CategoryBadge cat={ind.category}/>
                <ScoreCircle score={ind.current_score} size="sm"/>
                {ind.next_action && <span className="text-xs text-brand-600">← {ind.next_action}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {declinedList.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h5 className="font-extrabold text-red-700 text-sm mb-3">المؤشرات التي تراجعت</h5>
          <div className="space-y-2">
            {declinedList.map(ind => (
              <div key={ind.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-bold text-slate-700">{ind.indicator_name}</span>
                <span className="text-xs text-slate-500">{ind.start_score} → {ind.current_score}</span>
                <StatusBadge diff={calcIndicatorDiff(ind)}/>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
        <h5 className="font-extrabold text-slate-700 text-sm">خلاصة المدرب</h5>
        <textarea value={conclusion} onChange={e => setConclusion(e.target.value)}
          rows={4} placeholder="اكتب خلاصتك ورأيك الفني عن هذا اللاعب في هذا الموسم..."
          className={textareaCls}/>
        <Field label="التوصية الفنية">
          <select value={recommendation} onChange={e => setRecommendation(e.target.value)} className={selectCls}>
            <option value="">— اختر التوصية —</option>
            {RECOMMENDATION_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl">
          ملاحظة: هذا التقرير لأغراض المراجعة الفنية. القرار النهائي يعود للجهاز الفني.
        </p>
      </div>
    </div>
  )
}

// ── COMPARISON VIEW ───────────────────────────────────────────────────

function ComparisonView({
  teamId, season,
}: {
  teamId: string; season: string
}) {
  const [allIndicators, setAllIndicators] = useState<any[]>([])
  const [allPlayers, setAllPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<IndicatorCategory | ''>('')
  const [selectedNames, setSelectedNames] = useState<string[]>([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      technicalEvalService.getTeamAllIndicatorsForComparison(teamId, season),
      technicalEvalService.getPlayersForTeam(teamId),
    ]).then(([inds, players]) => {
      setAllIndicators(inds as any[])
      setAllPlayers(players as any[])
      setLoading(false)
    })
  }, [teamId, season])

  // Unique indicator names available, filtered by category
  const availableNames = useMemo(() => {
    const filtered = selectedCategory
      ? allIndicators.filter(i => i.category === selectedCategory)
      : allIndicators
    return [...new Set(filtered.map((i: any) => i.indicator_name as string))].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [allIndicators, selectedCategory])

  // When category changes, reset selected names
  const handleCategoryChange = (cat: IndicatorCategory | '') => {
    setSelectedCategory(cat)
    setSelectedNames([])
  }

  function toggleName(name: string) {
    setSelectedNames(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name)
      if (prev.length >= 3) return prev
      return [...prev, name]
    })
  }

  // Build comparison table data
  const comparisonRows = useMemo(() => {
    if (!selectedNames.length) return []
    const byPlayer: Record<string, { player: any; indicators: Record<string, any> }> = {}
    allPlayers.forEach(p => { byPlayer[p.id] = { player: p, indicators: {} } })
    allIndicators.forEach((ind: any) => {
      if (selectedNames.includes(ind.indicator_name)) {
        if (!byPlayer[ind.player_id]) return
        // Keep best (highest current_score) if duplicates
        const existing = byPlayer[ind.player_id].indicators[ind.indicator_name]
        if (!existing || ind.current_score > existing.current_score) {
          byPlayer[ind.player_id].indicators[ind.indicator_name] = ind
        }
      }
    })
    return Object.values(byPlayer)
      .filter(d => Object.keys(d.indicators).length > 0)
      .sort((a, b) => a.player.full_name.localeCompare(b.player.full_name, 'ar'))
  }, [allIndicators, allPlayers, selectedNames])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Category filter */}
      <div>
        <p className="text-xs font-bold text-slate-500 mb-2">فلتر حسب التصنيف</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleCategoryChange('')}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
              !selectedCategory ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-600 border-slate-200 hover:border-brand-400'
            }`}>
            الكل
          </button>
          {(Object.keys(CATEGORY_LABELS) as IndicatorCategory[]).map(cat => (
            <button key={cat}
              onClick={() => handleCategoryChange(selectedCategory === cat ? '' : cat)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                selectedCategory === cat
                  ? `${CATEGORY_COLORS[cat]} border-transparent`
                  : 'text-slate-600 border-slate-200 hover:border-brand-400'
              }`}>
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator selector */}
      {availableNames.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">
            اختر حتى 3 مؤشرات للمقارنة
            {selectedNames.length > 0 && (
              <span className="text-brand-600 font-extrabold mr-2">({selectedNames.length}/3 محددة)</span>
            )}
          </p>
          <div className="flex gap-2 flex-wrap max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
            {availableNames.map(name => {
              const isSelected = selectedNames.includes(name)
              const isDisabled = !isSelected && selectedNames.length >= 3
              return (
                <button key={name}
                  onClick={() => !isDisabled && toggleName(name)}
                  disabled={isDisabled}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : isDisabled
                      ? 'text-slate-300 border-slate-100 cursor-not-allowed bg-white'
                      : 'text-slate-600 border-slate-200 hover:border-brand-400 bg-white hover:bg-brand-50'
                  }`}>
                  {isSelected && <span className="ml-1">✓</span>}
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-12 text-center">
          <GitCompare size={32} className="text-slate-300 mb-3"/>
          <p className="font-bold text-slate-500">لا توجد مؤشرات مسجلة في هذا الموسم.</p>
          <p className="text-sm text-slate-400 mt-1">أضف مؤشرات للاعبين أولاً ثم ارجع للمقارنة.</p>
        </div>
      )}

      {/* Clear selection */}
      {selectedNames.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-bold text-slate-500">المؤشرات المحددة:</p>
          {selectedNames.map(name => (
            <span key={name} className="flex items-center gap-1.5 text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">
              {name}
              <button onClick={() => toggleName(name)} className="hover:text-brand-900">
                <X size={11}/>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Comparison table */}
      {selectedNames.length > 0 && comparisonRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-right font-bold min-w-[150px] sticky right-0 bg-slate-50 z-10">اللاعب</th>
                  {selectedNames.map(name => (
                    <th key={name} className="px-3 py-3 text-center font-bold min-w-[160px]">
                      <div>{name}</div>
                      {selectedCategory && (
                        <div className="mt-0.5">
                          <CategoryBadge cat={selectedCategory}/>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonRows.map(({ player, indicators }) => (
                  <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 sticky right-0 bg-white z-10 border-l border-slate-100">
                      <div className="flex items-center gap-2">
                        <Avatar name={player.full_name} src={player.avatar_url} size="sm"/>
                        <span className="font-bold text-slate-700">{player.full_name}</span>
                      </div>
                    </td>
                    {selectedNames.map(name => {
                      const ind = indicators[name]
                      if (!ind) {
                        return (
                          <td key={name} className="px-3 py-3 text-center">
                            <span className="text-slate-300 text-xs">لم يُقيَّم</span>
                          </td>
                        )
                      }
                      const diff = ind.current_score - ind.start_score
                      const sparkVals = [ind.start_score, ...(ind.reviews ?? []).filter((r: any) => !r.deleted_at).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).map((r: any) => r.score)]
                      return (
                        <td key={name} className="px-3 py-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-2">
                              <ScoreCircle score={ind.current_score} size="sm"/>
                              <StatusBadge diff={diff}/>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <span>بداية: {ind.start_score}</span>
                            </div>
                            <ScoreSparkline values={sparkVals}/>
                            <TypeBadge type={ind.indicator_type}/>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedNames.length > 0 && comparisonRows.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <GitCompare size={28} className="mx-auto mb-2"/>
          <p className="text-sm font-bold">لا توجد بيانات للمؤشرات المختارة.</p>
          <p className="text-xs mt-1">قد لا يكون أي لاعب مسجلاً في هذه المؤشرات بعد.</p>
        </div>
      )}
    </div>
  )
}

// ── PLAYER PROFILE VIEW ───────────────────────────────────────────────

type ProfileTab = 'summary' | 'strengths' | 'development' | 'reviews' | 'charts' | 'report'

function PlayerProfileView({
  player, teamId, season, settings, canManage,
  indicators, loading, onBack, onRefresh,
}: {
  player: any; teamId: string; season: string
  settings: EvalSettings; canManage: boolean
  indicators: IndicatorRow[]; loading: boolean
  onBack: () => void; onRefresh: () => void
}) {
  const [profileTab, setProfileTab] = useState<ProfileTab>('summary')
  const [showAddIndicator, setShowAddIndicator] = useState(false)
  const [addReviewTarget, setAddReviewTarget] = useState<IndicatorRow | null>(null)
  const [editTarget, setEditTarget] = useState<IndicatorRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IndicatorRow | null>(null)

  const active = getActiveIndicators(indicators)
  const strengthAvg = calcStrengthAvg(indicators)
  const devAvg = calcDevAvg(indicators)
  const overallAvg = calcOverallAvg(indicators, settings.minimum_indicators_for_overall_score)
  const improvementRate = calcImprovementRate(indicators)
  const lastReview = getLastReviewDate(indicators)
  const mostImproved = getMostImprovedSingle(indicators)
  const mostDeclined = getMostDeclinedSingle(indicators)

  const profileTabs: { key: ProfileTab; label: string }[] = [
    { key: 'summary', label: 'ملخص' },
    { key: 'strengths', label: 'مؤشرات القوة' },
    { key: 'development', label: 'مؤشرات التطوير' },
    { key: 'reviews', label: 'المراجعات' },
    { key: 'charts', label: 'الرسوم البيانية' },
    { key: 'report', label: 'تقرير الموسم' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-bold text-sm">
          <ArrowRight size={16}/> رجوع
        </button>
        <ChevronRight size={14} className="text-slate-300"/>
        <div className="flex items-center gap-3">
          <Avatar name={player.full_name} src={player.avatar_url} size="md"/>
          <div>
            <h2 className="font-extrabold text-slate-800">{player.full_name}</h2>
            <p className="text-xs text-slate-500">الموسم: {season}</p>
          </div>
        </div>
        <div className="flex-1"/>
        {canManage && (
          <button onClick={() => setShowAddIndicator(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700">
            <Plus size={15}/> إضافة مؤشر
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit min-w-full">
          {profileTabs.map(t => (
            <button key={t.key} onClick={() => setProfileTab(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                profileTab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
        </div>
      ) : (
        <>
          {profileTab === 'summary' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-slate-400 mb-2">مؤشرات القوة</p>
                  <p className="text-2xl font-extrabold text-emerald-600">{active.filter(i => i.indicator_type === 'strength').length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-slate-400 mb-2">مؤشرات التطوير</p>
                  <p className="text-2xl font-extrabold text-amber-600">{active.filter(i => i.indicator_type === 'development').length}</p>
                </div>
                {settings.show_strength_average && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-slate-400 mb-2">متوسط مؤشرات القوة</p>
                    <p className="text-2xl font-extrabold text-slate-700">
                      {strengthAvg !== null ? fmtScore(strengthAvg) : <span className="text-base text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] text-slate-400">/ 10</p>
                  </div>
                )}
                {settings.show_development_average && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-slate-400 mb-2">متوسط مؤشرات التطوير</p>
                    <p className="text-2xl font-extrabold text-slate-700">
                      {devAvg !== null ? fmtScore(devAvg) : <span className="text-base text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] text-slate-400">/ 10</p>
                  </div>
                )}
                {settings.show_overall_score && (
                  <div className="bg-white border border-brand-200 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-slate-400 mb-2">المتوسط العام</p>
                    {overallAvg !== null ? (
                      <>
                        <p className="text-2xl font-extrabold text-brand-600">{fmtScore(overallAvg)}</p>
                        <p className="text-[10px] text-slate-400">/ 10</p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 mt-2">لا توجد بيانات كافية</p>
                    )}
                  </div>
                )}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-slate-400 mb-2">معدل التطور</p>
                  {improvementRate !== null ? (
                    <>
                      <p className={`text-2xl font-extrabold ${improvementRate >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {improvementRate >= 0 ? '+' : ''}{fmtScore(improvementRate)}
                      </p>
                      <p className="text-[10px] text-slate-400">نقطة</p>
                    </>
                  ) : <p className="text-base text-slate-300 mt-2">—</p>}
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-[10px] text-slate-400 mb-2">آخر مراجعة</p>
                  <p className="text-sm font-bold text-slate-600">
                    {lastReview ? formatReviewDate(lastReview) : '—'}
                  </p>
                </div>
              </div>

              {(mostImproved || mostDeclined) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {mostImproved && calcIndicatorDiff(mostImproved) !== 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                      <p className="text-xs font-bold text-emerald-600 mb-2">أكثر مؤشر تحسناً</p>
                      <p className="font-extrabold text-slate-800">{mostImproved.indicator_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryBadge cat={mostImproved.category}/>
                        <StatusBadge diff={calcIndicatorDiff(mostImproved)}/>
                      </div>
                    </div>
                  )}
                  {mostDeclined && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                      <p className="text-xs font-bold text-red-600 mb-2">أكثر مؤشر تراجعاً</p>
                      <p className="font-extrabold text-slate-800">{mostDeclined.indicator_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryBadge cat={mostDeclined.category}/>
                        <StatusBadge diff={calcIndicatorDiff(mostDeclined)}/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {active.length === 0 && (
                <div className="flex flex-col items-center py-12 text-center">
                  <ClipboardList size={36} className="text-slate-300 mb-3"/>
                  <p className="font-bold text-slate-500 mb-2">لا توجد مؤشرات مسجلة لهذا اللاعب.</p>
                  {canManage && (
                    <button onClick={() => setShowAddIndicator(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700">
                      <Plus size={15}/> إضافة أول مؤشر
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {profileTab === 'strengths' && (
            <IndicatorsTable
              indicators={indicators} type="strength" canManage={canManage}
              teamId={teamId} settings={settings}
              onAddReview={setAddReviewTarget} onEdit={setEditTarget} onDelete={setDeleteTarget}
              onRefresh={onRefresh}
            />
          )}

          {profileTab === 'development' && (
            <IndicatorsTable
              indicators={indicators} type="development" canManage={canManage}
              teamId={teamId} settings={settings}
              onAddReview={setAddReviewTarget} onEdit={setEditTarget} onDelete={setDeleteTarget}
              onRefresh={onRefresh}
            />
          )}

          {profileTab === 'reviews' && (
            <AllReviewsTab indicators={indicators} canManage={canManage} teamId={teamId} onRefresh={onRefresh}/>
          )}

          {profileTab === 'charts' && <ChartsTab indicators={indicators}/>}

          {profileTab === 'report' && (
            <ReportTab indicators={indicators} player={player} season={season} settings={settings}/>
          )}
        </>
      )}

      {showAddIndicator && (
        <AddIndicatorModal
          teamId={teamId} playerId={player.id} season={season} settings={settings}
          onClose={() => setShowAddIndicator(false)} onSaved={onRefresh}
        />
      )}
      {addReviewTarget && (
        <AddReviewModal
          indicator={addReviewTarget} teamId={teamId} settings={settings}
          onClose={() => setAddReviewTarget(null)}
          onSaved={() => { setAddReviewTarget(null); onRefresh() }}
        />
      )}
      {editTarget && (
        <EditIndicatorModal
          indicator={editTarget} teamId={teamId} settings={settings}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onRefresh() }}
        />
      )}
      {deleteTarget && (
        <DeleteIndicatorModal
          indicator={deleteTarget} teamId={teamId}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── PLAYER LIST VIEW ──────────────────────────────────────────────────

function PlayerListView({
  players, summaries, settings, canManage, onSelectPlayer,
}: {
  players: any[]; summaries: Record<string, any>; settings: EvalSettings
  canManage: boolean; onSelectPlayer: (p: any) => void
}) {
  if (!players.length) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <ClipboardList size={40} className="text-slate-300 mb-3"/>
        <p className="font-bold text-slate-500 mb-1">لا يوجد لاعبون في هذا الفريق</p>
        <p className="text-sm text-slate-400">أضف لاعبين للفريق أولاً</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 text-center font-bold w-8">#</th>
              <th className="px-3 py-3 text-right font-bold min-w-[150px]">اللاعب</th>
              <th className="px-3 py-3 text-center font-bold">مؤشرات القوة</th>
              <th className="px-3 py-3 text-center font-bold">مؤشرات التطوير</th>
              {settings.show_strength_average && <th className="px-3 py-3 text-center font-bold">متوسط القوة</th>}
              {settings.show_development_average && <th className="px-3 py-3 text-center font-bold">متوسط التطوير</th>}
              {settings.show_overall_score && <th className="px-3 py-3 text-center font-bold">المتوسط العام</th>}
              <th className="px-3 py-3 text-center font-bold">معدل التطور</th>
              <th className="px-3 py-3 text-center font-bold">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((p, idx) => {
              const s = summaries[p.id] ?? {}
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                      <span className="font-bold text-slate-700">{p.full_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-bold text-emerald-600">{s.strengthCount ?? 0}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="font-bold text-amber-600">{s.devCount ?? 0}</span>
                  </td>
                  {settings.show_strength_average && (
                    <td className="px-3 py-3 text-center font-bold text-slate-700">
                      {s.strengthAvg != null ? `${fmtScore(s.strengthAvg)}/10` : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  {settings.show_development_average && (
                    <td className="px-3 py-3 text-center font-bold text-slate-700">
                      {s.devAvg != null ? `${fmtScore(s.devAvg)}/10` : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  {settings.show_overall_score && (
                    <td className="px-3 py-3 text-center font-bold text-brand-600">
                      {s.overallAvg != null
                        ? `${fmtScore(s.overallAvg)}/10`
                        : <span className="text-slate-300 text-[10px]">لا توجد بيانات كافية</span>}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center">
                    {s.improvementRate != null ? (
                      <span className={`font-bold ${s.improvementRate >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {s.improvementRate >= 0 ? '+' : ''}{fmtScore(s.improvementRate)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => onSelectPlayer(p)}
                      className="px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 font-bold hover:bg-brand-100 text-[11px] whitespace-nowrap">
                      عرض الملف
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────

type MainTab = 'players' | 'comparison'

export default function TechnicalEvalPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const { user } = useAuth()
  const [myRole, setMyRole] = useState('')
  const [season, setSeason] = useState(getCurrentSeason())
  const [settings, setSettings] = useState<EvalSettings>(DEFAULT_EVAL_SETTINGS)
  const [players, setPlayers] = useState<any[]>([])
  const [teamSummaries, setTeamSummaries] = useState<Record<string, any>>({})
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [playerIndicators, setPlayerIndicators] = useState<IndicatorRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPlayer, setLoadingPlayer] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('players')

  const canManage = canManageEvents(myRole)

  useEffect(() => {
    if (!teamId || !user) return
    import('../../services').then(({ teamService }) => {
      teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    })
  }, [teamId, user])

  const loadList = useCallback(async () => {
    if (!teamId) return
    setLoadingList(true)
    const [ps, settingsData, allInds] = await Promise.all([
      technicalEvalService.getPlayersForTeam(teamId),
      technicalEvalService.getSettings(teamId),
      technicalEvalService.getAllTeamIndicatorSummaries(teamId, season),
    ])
    setPlayers(ps)
    setSettings(settingsData as EvalSettings)

    const byPlayer: Record<string, any[]> = {}
    ;(allInds as any[]).forEach((ind: any) => {
      if (!byPlayer[ind.player_id]) byPlayer[ind.player_id] = []
      byPlayer[ind.player_id].push(ind)
    })

    const summaries: Record<string, any> = {}
    ;(ps as any[]).forEach((p: any) => {
      const inds = byPlayer[p.id] ?? []
      const strengthInds = inds.filter((i: any) => i.indicator_type === 'strength')
      const devInds = inds.filter((i: any) => i.indicator_type === 'development')
      const minCount = (settingsData as any)?.minimum_indicators_for_overall_score ?? 5
      summaries[p.id] = {
        strengthCount: strengthInds.length,
        devCount: devInds.length,
        strengthAvg: strengthInds.length
          ? strengthInds.reduce((s: number, i: any) => s + i.current_score, 0) / strengthInds.length : null,
        devAvg: devInds.length
          ? devInds.reduce((s: number, i: any) => s + i.current_score, 0) / devInds.length : null,
        overallAvg: inds.length >= minCount
          ? inds.reduce((s: number, i: any) => s + i.current_score, 0) / inds.length : null,
        improvementRate: inds.length
          ? inds.reduce((s: number, i: any) => s + (i.current_score - i.start_score), 0) / inds.length : null,
      }
    })
    setTeamSummaries(summaries)
    setLoadingList(false)
  }, [teamId, season])

  useEffect(() => { loadList() }, [loadList])

  const loadPlayerIndicators = useCallback(async () => {
    if (!teamId || !selectedPlayer) return
    setLoadingPlayer(true)
    const data = await technicalEvalService.getPlayerIndicators(teamId, selectedPlayer.id, season)
    setPlayerIndicators(data as IndicatorRow[])
    setLoadingPlayer(false)
  }, [teamId, selectedPlayer, season])

  useEffect(() => { loadPlayerIndicators() }, [loadPlayerIndicators])

  const seasonOptions = getSeasonOptions()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-extrabold text-slate-700 text-lg flex items-center gap-2">
            <BarChart2 size={18} className="text-brand-600"/>
            التقييمات الفنية والتكتيكية
          </h2>
          {!selectedPlayer && (
            <p className="text-xs text-slate-400 mt-0.5">متابعة تطور اللاعبين فنياً وتكتيكياً</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={season} onChange={e => { setSeason(e.target.value); setSelectedPlayer(null) }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400">
            {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {canManage && (
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold">
              <Settings size={15}/>
            </button>
          )}
        </div>
      </div>

      {/* Main tabs (only when not viewing a player profile) */}
      {!selectedPlayer && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button onClick={() => setMainTab('players')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              mainTab === 'players' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <ClipboardList size={14}/> جدول اللاعبين
          </button>
          <button onClick={() => setMainTab('comparison')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              mainTab === 'comparison' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <GitCompare size={14}/> مقارنة اللاعبين
          </button>
        </div>
      )}

      {/* Content */}
      {loadingList ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
        </div>
      ) : selectedPlayer ? (
        <PlayerProfileView
          player={selectedPlayer} teamId={teamId!} season={season}
          settings={settings} canManage={canManage}
          indicators={playerIndicators} loading={loadingPlayer}
          onBack={() => { setSelectedPlayer(null); setPlayerIndicators([]) }}
          onRefresh={loadPlayerIndicators}
        />
      ) : mainTab === 'players' ? (
        <PlayerListView
          players={players} summaries={teamSummaries} settings={settings}
          canManage={canManage} onSelectPlayer={p => setSelectedPlayer(p)}
        />
      ) : (
        <ComparisonView teamId={teamId!} season={season}/>
      )}

      {showSettings && (
        <SettingsModal
          teamId={teamId!} settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={s => { setSettings(s); loadList() }}
        />
      )}
    </div>
  )
}
