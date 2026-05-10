import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService } from '../../services'
import { Spinner, PageHeader, Alert, FormField, ImageUpload } from '../../components/ui'
import { SPORT_TYPES, SAUDI_CITIES, AGE_CATEGORIES, RIYAL } from '../../utils/helpers'

function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-xl">
      <div>
        <div className="font-bold text-sm">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      <div className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)}/>
        <div className="w-11 h-6 bg-slate-200 peer-checked:bg-brand-500 rounded-full transition-colors peer-focus:ring-2 peer-focus:ring-brand-300"/>
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}/>
      </div>
    </label>
  )
}

export default function TeamSettingsPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId) return
    teamService.getTeam(teamId).then(t => { setForm(t || {}); setLoading(false) })
  }, [teamId])

  async function save(e?: React.FormEvent) {
    e?.preventDefault(); setSaving(true); setError(''); setSuccess(false)
    const safeFields: Record<string, any> = {
      name: form.name,
      sport_type: form.sport_type,
      age_category: form.age_category,
      city: form.city,
      description: form.description,
      logo_url: form.logo_url,
      invite_code_enabled: form.invite_code_enabled,
      require_approval: form.require_approval,
      subscriptions_enabled: form.subscriptions_enabled ?? false,
      subscription_fee: form.subscription_fee ?? null,
    }
    const { error: err } = await teamService.updateTeam(teamId!, safeFields)
    if (err) setError('حدث خطأ في الحفظ')
    else setSuccess(true)
    setSaving(false); setTimeout(() => setSuccess(false), 3000)
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner/></div>

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader title="إعدادات الفريق" back={() => navigate(`/team/${teamId}`)}/>

      {success && <div className="mb-4"><Alert type="success" message="تم حفظ التغييرات بنجاح"/></div>}
      {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}

      {/* Team Logo */}
      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">شعار الفريق</div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-brand-100 flex items-center justify-center text-3xl font-bold text-brand-600 overflow-hidden flex-shrink-0">
            {form.logo_url ? <img src={form.logo_url} className="w-full h-full object-cover"/> : form.name?.[0]}
          </div>
          <div>
            <ImageUpload value={form.logo_url} onChange={url => set('logo_url', url)} label="تغيير الشعار"/>
            <p className="text-xs text-slate-400 mt-1">يُفضّل صورة مربعة بدقة عالية</p>
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">معلومات الفريق</div>
        <form onSubmit={save} className="space-y-0">
          <FormField label="اسم الفريق" required>
            <input className="form-input" value={form.name || ''} onChange={e => set('name', e.target.value)}/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الرياضة">
              <select className="form-input" value={form.sport_type || ''} onChange={e => set('sport_type', e.target.value)}>
                {SPORT_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="الفئة العمرية">
              <select className="form-input" value={form.age_category || ''} onChange={e => set('age_category', e.target.value)}>
                {AGE_CATEGORIES.map(a => <option key={a}>{a}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="المدينة">
            <select className="form-input" value={form.city || ''} onChange={e => set('city', e.target.value)}>
              {SAUDI_CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="وصف الفريق">
            <textarea className="form-input" rows={3} value={form.description || ''} onChange={e => set('description', e.target.value)}/>
          </FormField>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Spinner size="sm"/> : 'حفظ التغييرات'}
          </button>
        </form>
      </div>

      {/* Invite Settings */}
      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">إعدادات الانضمام</div>
        <div className="space-y-3">
          <Toggle
            checked={form.invite_code_enabled ?? true}
            onChange={v => set('invite_code_enabled', v)}
            label="تفعيل كود الدعوة"
            sub="السماح بالانضمام عبر الكود"/>
          <Toggle
            checked={form.require_approval ?? false}
            onChange={v => set('require_approval', v)}
            label="موافقة قبل الانضمام"
            sub="طلبات الانضمام تحتاج موافقة المسؤول"/>
        </div>
        <button onClick={() => save()} disabled={saving} className="btn btn-primary mt-4">
          {saving ? <Spinner size="sm"/> : 'حفظ إعدادات الانضمام'}
        </button>
      </div>

      {/* Subscription Settings */}
      <div className="card">
        <div className="font-bold text-sm mb-1">نظام الاشتراكات الشهرية</div>
        <p className="text-xs text-slate-400 mb-4">فعّل هذا الخيار إذا كان فريقك يتطلب رسوم اشتراك شهرية من اللاعبين</p>
        <div className="space-y-3 mb-4">
          <Toggle
            checked={form.subscriptions_enabled ?? false}
            onChange={v => set('subscriptions_enabled', v)}
            label="تفعيل نظام الاشتراكات"
            sub="إدارة اشتراكات اللاعبين وتتبع تواريخ الانتهاء"/>
        </div>

        {(form.subscriptions_enabled) && (
          <FormField label={`قيمة الاشتراك الشهري (${RIYAL})`}>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={form.subscription_fee ?? ''}
              onChange={e => set('subscription_fee', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="مثال: 300"/>
            <p className="text-xs text-slate-400 mt-1">
              تُستخدم هذه القيمة تلقائياً عند تجديد اشتراك أي لاعب من صفحة المالية
            </p>
          </FormField>
        )}

        <button onClick={() => save()} disabled={saving} className="btn btn-primary mt-3">
          {saving ? <Spinner size="sm"/> : 'حفظ إعدادات الاشتراك'}
        </button>
      </div>
    </div>
  )
}
