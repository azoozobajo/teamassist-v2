import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { teamService } from '../services'
import { Alert, Spinner, PageHeader, FormField, ImageUpload } from '../components/ui'
import { SPORT_TYPES, SAUDI_CITIES, AGE_CATEGORIES } from '../utils/helpers'

export default function CreateTeamPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', sport_type: 'كرة القدم', age_category: 'فريق أول',
    city: 'جدة', description: '', logo_url: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('اسم الفريق مطلوب'); return }
    setLoading(true)
    const { team, error: err } = await teamService.createTeam(form, user!.id)
    if (err) { setError(err.message || 'حدث خطأ'); setLoading(false) }
    else navigate(`/team/${team.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader title="إنشاء فريق جديد" subtitle="أضف فريقك وابدأ الإدارة الاحترافية"
        back={() => navigate('/')} />
      <div className="card">
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <form onSubmit={submit} className="space-y-0">
          <div className="flex justify-center mb-6">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-brand-50 border-2 border-dashed border-brand-300 flex items-center justify-center mx-auto mb-2 overflow-hidden">
                {form.logo_url ? <img src={form.logo_url} className="w-full h-full object-cover"/> :
                  <span className="text-3xl">{form.name[0] || '⚽'}</span>}
              </div>
              <ImageUpload value={form.logo_url} onChange={url => set('logo_url', url)} label="رفع شعار الفريق"/>
            </div>
          </div>
          <FormField label="اسم الفريق" required>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="نادي الأمل الرياضي"/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الرياضة">
              <select className="form-input" value={form.sport_type} onChange={e => set('sport_type', e.target.value)}>
                {SPORT_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="الفئة العمرية">
              <select className="form-input" value={form.age_category} onChange={e => set('age_category', e.target.value)}>
                {AGE_CATEGORIES.map(a => <option key={a}>{a}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="المدينة">
            <select className="form-input" value={form.city} onChange={e => set('city', e.target.value)}>
              {SAUDI_CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="وصف الفريق">
            <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="وصف مختصر عن الفريق..."/>
          </FormField>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/')} className="btn btn-ghost flex-1">إلغاء</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
              {loading ? <Spinner size="sm"/> : 'إنشاء الفريق'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}