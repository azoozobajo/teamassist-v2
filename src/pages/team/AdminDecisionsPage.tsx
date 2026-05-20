import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, Edit3, FileText, Gavel, Plus, ShieldCheck, Users,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { adminDecisionService, notificationService, teamService } from '../../services'
import { Avatar, EmptyState, FormField, Modal, PageHeader, Spinner, Tabs } from '../../components/ui'
import { canManageTeam, cn, formatDate } from '../../utils/helpers'

type DecisionForm = {
  title: string
  decision_type: string
  target_type: 'specific' | 'all'
  target_user_ids: string[]
  from_date: string
  to_date: string
  notes: string
  is_active: boolean
}

const DECISION_TYPES = [
  { key: 'suspension', label: 'إيقاف', style: 'bg-slate-100 text-slate-700' },
  { key: 'penalty', label: 'عقوبة', style: 'bg-orange-100 text-orange-700' },
  { key: 'national_team', label: 'استدعاء منتخب', style: 'bg-sky-100 text-sky-700' },
  { key: 'emergency', label: 'طارئ', style: 'bg-amber-100 text-amber-700' },
  { key: 'academic', label: 'دراسة', style: 'bg-purple-100 text-purple-700' },
  { key: 'family', label: 'عائلي', style: 'bg-teal-100 text-teal-700' },
  { key: 'death', label: 'حالة وفاة', style: 'bg-stone-100 text-stone-700' },
  { key: 'marriage', label: 'زواج', style: 'bg-pink-100 text-pink-700' },
  { key: 'private_event', label: 'مناسبة خاصة', style: 'bg-fuchsia-100 text-fuchsia-700' },
  { key: 'rest', label: 'راحة', style: 'bg-emerald-100 text-emerald-700' },
  { key: 'other', label: 'أخرى', style: 'bg-slate-100 text-slate-700' },
]

const defaultForm: DecisionForm = {
  title: '',
  decision_type: 'penalty',
  target_type: 'specific',
  target_user_ids: [],
  from_date: '',
  to_date: '',
  notes: '',
  is_active: true,
}

function typeInfo(type: string) {
  return DECISION_TYPES.find(t => t.key === type) || DECISION_TYPES[DECISION_TYPES.length - 1]
}

function isActiveDecision(d: any, today: string) {
  if (d.is_active === false) return false
  return d.from_date <= today && d.to_date >= today
}

export default function AdminDecisionsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [myRole, setMyRole] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [decisions, setDecisions] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<DecisionForm>(defaultForm)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const canManage = canManageTeam(myRole)
  const playerMembers = members.filter(m => m.role === 'player')

  useEffect(() => {
    if (!teamId || !user) return
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    const [role, ds, ms] = await Promise.all([
      teamService.getMyRole(teamId, user.id),
      adminDecisionService.getAll(teamId),
      teamService.getMembers(teamId),
    ])
    setMyRole(role || '')
    setDecisions(ds)
    setMembers(ms.filter((m: any) => m.status === 'active'))
    setLoading(false)
  }

  const tabs = useMemo(() => [
    { key: 'all', label: 'الكل', badge: decisions.length },
    ...DECISION_TYPES.map(t => ({
      key: t.key,
      label: t.label,
      badge: decisions.filter(d => d.decision_type === t.key).length,
    })).filter(t => t.badge > 0 || ['emergency', 'penalty', 'academic', 'national_team', 'suspension'].includes(t.key)),
  ], [decisions])

  const filtered = activeTab === 'all'
    ? decisions
    : decisions.filter(d => d.decision_type === activeTab)

  const summary = DECISION_TYPES.map(t => {
    const list = decisions.filter(d => d.decision_type === t.key)
    return { ...t, total: list.length, active: list.filter(d => isActiveDecision(d, today)).length }
  }).filter(s => s.total > 0 || ['emergency', 'penalty', 'academic', 'national_team'].includes(s.key))

  function targetNames(decision: any) {
    if (decision.target_type === 'all') return 'كل اللاعبين'
    const ids = decision.target_user_ids || []
    if (!ids.length) return 'لا يوجد'
    return ids.map((id: string) => {
      const m = members.find(x => x.user_id === id)
      return m?.profile?.full_name || 'لاعب'
    }).join('، ')
  }

  function openCreate() {
    setEditing(null)
    setForm(defaultForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(decision: any) {
    setEditing(decision)
    setForm({
      title: decision.title || '',
      decision_type: decision.decision_type || 'other',
      target_type: decision.target_type || 'specific',
      target_user_ids: decision.target_user_ids || [],
      from_date: decision.from_date || '',
      to_date: decision.to_date || '',
      notes: decision.notes || '',
      is_active: decision.is_active !== false,
    })
    setError('')
    setShowForm(true)
  }

  function setField(key: keyof DecisionForm, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleTarget(userId: string) {
    setForm(prev => ({
      ...prev,
      target_user_ids: prev.target_user_ids.includes(userId)
        ? prev.target_user_ids.filter(id => id !== userId)
        : [...prev.target_user_ids, userId],
    }))
  }

  async function submit() {
    if (!teamId || !user || !canManage) return
    if (!form.title.trim() || !form.from_date || !form.to_date) {
      setError('اكتب عنوان القرار وحدد الفترة')
      return
    }
    if (form.target_type === 'specific' && form.target_user_ids.length === 0) {
      setError('اختر لاعب واحد على الأقل')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      team_id: teamId,
      title: form.title.trim(),
      decision_type: form.decision_type,
      target_type: form.target_type,
      target_user_ids: form.target_type === 'all' ? [] : form.target_user_ids,
      from_date: form.from_date,
      to_date: form.to_date,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      created_by: editing?.created_by || user.id,
    }
    const result = editing
      ? await adminDecisionService.update(editing.id, payload)
      : await adminDecisionService.create(payload)

    if (result.error) {
      setError(result.error.message || 'تعذر حفظ القرار')
      setSaving(false)
      return
    }

    const info = typeInfo(payload.decision_type)
    if (!editing && payload.is_active) {
      const body = `${info.label} - من ${payload.from_date} إلى ${payload.to_date}`
      if (payload.target_type === 'all') {
        await notificationService.createForTeam(teamId, `قرار إداري: ${payload.title}`, body, 'leave', user.id)
      } else {
        await Promise.all(payload.target_user_ids.map((uid: string) =>
          notificationService.create({
            user_id: uid,
            team_id: teamId,
            title: `قرار إداري: ${payload.title}`,
            body,
            type: 'leave',
            is_read: false,
          })
        ))
      }
    }

    await load()
    setShowForm(false)
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner/></div>

  return (
    <div dir="rtl">
      <PageHeader
        title="القرارات الإدارية"
        subtitle="تقرير وتصنيف القرارات التي تؤثر على حضور اللاعبين وحالتهم"
        action={canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16}/> قرار جديد
          </button>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-box">
          <div className="stat-value">{decisions.length}</div>
          <div className="stat-label">كل القرارات</div>
        </div>
        <div className="stat-box">
          <div className="stat-value text-slate-700">{decisions.filter(d => isActiveDecision(d, today)).length}</div>
          <div className="stat-label">فعالة الآن</div>
        </div>
        <div className="stat-box">
          <div className="stat-value text-orange-600">{decisions.filter(d => d.decision_type === 'penalty').length}</div>
          <div className="stat-label">عقوبات</div>
        </div>
        <div className="stat-box">
          <div className="stat-value text-sky-600">{decisions.filter(d => d.decision_type === 'national_team').length}</div>
          <div className="stat-label">استدعاء منتخب</div>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={17} className="text-brand-600"/>
          <h2 className="font-extrabold text-slate-800">تقسيم التصنيفات</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {summary.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveTab(s.key)}
              className={cn(
                'text-right rounded-xl border border-slate-100 p-3 hover:border-brand-200 hover:bg-brand-50 transition-colors',
                activeTab === s.key && 'border-brand-300 bg-brand-50',
              )}>
              <div className={cn('inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold mb-2', s.style)}>{s.label}</div>
              <div className="text-lg font-extrabold text-slate-900">{s.total}</div>
              <div className="text-[11px] text-slate-400">فعال الآن: {s.active}</div>
            </button>
          ))}
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab}/>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28}/>}
          title="لا توجد قرارات في هذا التصنيف"
          description="عند إضافة قرار إداري سيظهر هنا ويطبق على حضور اللاعب خلال الفترة المحددة."
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map(decision => {
            const info = typeInfo(decision.decision_type)
            const active = isActiveDecision(decision, today)
            return (
              <div key={decision.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', active ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400')}>
                      {decision.decision_type === 'penalty' ? <Gavel size={20}/> : <AlertTriangle size={20}/>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-extrabold text-slate-900">{decision.title}</h3>
                        <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', info.style)}>{info.label}</span>
                        <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', active ? 'bg-slate-700 text-white' : decision.is_active === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}>
                          {active ? 'فعال الآن' : decision.is_active === false ? 'معطل' : 'خارج الفترة'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                        <span className="inline-flex items-center gap-1"><CalendarDays size={13}/> {formatDate(decision.from_date)} إلى {formatDate(decision.to_date)}</span>
                        <span className="inline-flex items-center gap-1"><Users size={13}/> {targetNames(decision)}</span>
                      </div>
                      {decision.notes && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{decision.notes}</p>}
                    </div>
                  </div>
                  {canManage && (
                    <button className="btn btn-ghost text-xs flex-shrink-0" onClick={() => openEdit(decision)}>
                      <Edit3 size={14}/> تعديل
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => !saving && setShowForm(false)} title={editing ? 'تعديل قرار إداري' : 'قرار إداري جديد'} width="max-w-2xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm font-bold">{error}</div>}

          <FormField label="عنوان القرار" required>
            <input className="form-input" value={form.title} onChange={e => setField('title', e.target.value)} placeholder="مثال: إيقاف مباراتين / ظرف طارئ"/>
          </FormField>

          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="نوع القرار" required>
              <select className="form-input" value={form.decision_type} onChange={e => setField('decision_type', e.target.value)}>
                {DECISION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </FormField>
            <FormField label="نطاق المستفيدين" required>
              <select className="form-input" value={form.target_type} onChange={e => setField('target_type', e.target.value as any)}>
                <option value="specific">لاعبون محددون</option>
                <option value="all">كل اللاعبين</option>
              </select>
            </FormField>
          </div>

          {form.target_type === 'specific' && (
            <FormField label="اللاعبون" required>
              <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-2xl divide-y divide-slate-50">
                {playerMembers.map(m => (
                  <label key={m.user_id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={form.target_user_ids.includes(m.user_id)}
                      onChange={() => toggleTarget(m.user_id)}
                    />
                    <Avatar name={m.profile?.full_name || 'لاعب'} src={m.profile?.avatar_url} size="sm"/>
                    <span className="text-sm font-bold text-slate-700">{m.profile?.full_name || 'لاعب'}</span>
                  </label>
                ))}
              </div>
            </FormField>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="من تاريخ" required>
              <input className="form-input" type="date" value={form.from_date} onChange={e => setField('from_date', e.target.value)}/>
            </FormField>
            <FormField label="إلى تاريخ" required>
              <input className="form-input" type="date" min={form.from_date || undefined} value={form.to_date} onChange={e => setField('to_date', e.target.value)}/>
            </FormField>
          </div>

          <FormField label="السبب / التفاصيل">
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="اكتب سبب القرار ليظهر في التقرير وسجل الحضور"/>
          </FormField>

          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)}/>
            القرار فعال ويؤثر على الحضور والنقطة الرمادية
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>إلغاء</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? <Spinner size="sm"/> : null}
              {editing ? 'حفظ التعديل' : 'إضافة القرار'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
