import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner, PageHeader, FormField } from '../components/ui'
import { Camera } from 'lucide-react'

export default function ProfilePage() {
  const { profile, user, updateProfile } = useAuth()
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    father_name: profile?.father_name || '',
    phone: profile?.phone || '',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
    avatar_url: profile?.avatar_url || ''
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess(false)
    const fullName = [form.first_name, form.father_name, form.last_name].filter(Boolean).join(' ')
    const { error: err } = await updateProfile({ ...form, full_name: fullName })
    if (err) setError('حدث خطأ في الحفظ')
    else setSuccess(true)
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader title="الملف الشخصي"/>
      <div className="card flex items-center gap-4 mb-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600">
            {form.avatar_url ? <img src={form.avatar_url} className="w-full h-full object-cover"/> : (profile?.full_name?.[0] || 'U')}
          </div>
          <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center cursor-pointer shadow">
            <Camera size={13} className="text-white"/>
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader(); r.onload = ev => set('avatar_url', ev.target?.result as string); r.readAsDataURL(f)
            }}/>
          </label>
        </div>
        <div>
          <div className="font-bold text-base">{profile?.full_name}</div>
          <div className="text-sm text-slate-400">{user?.email}</div>
        </div>
      </div>
      <div className="card">
        {success && <div className="mb-4"><Alert type="success" message="تم حفظ التغييرات بنجاح"/></div>}
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <form onSubmit={save} className="space-y-0">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الاسم الأول"><input className="form-input" value={form.first_name} onChange={e => set('first_name', e.target.value)}/></FormField>
            <FormField label="اسم الأب"><input className="form-input" value={form.father_name} onChange={e => set('father_name', e.target.value)}/></FormField>
          </div>
          <FormField label="اسم العائلة"><input className="form-input" value={form.last_name} onChange={e => set('last_name', e.target.value)}/></FormField>
          <FormField label="رقم الجوال"><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)}/></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ الميلاد"><input className="form-input" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}/></FormField>
            <FormField label="الجنس">
              <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">اختر</option><option value="male">ذكر</option><option value="female">أنثى</option>
              </select>
            </FormField>
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary mt-2">
            {saving ? <Spinner size="sm"/> : 'حفظ التغييرات'}
          </button>
        </form>
      </div>
    </div>
  )
}