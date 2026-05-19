import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner, PageHeader, FormField } from '../components/ui'
import { Camera, Save, User } from 'lucide-react'

export default function ProfilePage() {
  const { profile, user, updateProfile } = useAuth()
  const [form, setForm] = useState({
    first_name:   profile?.first_name   || '',
    last_name:    profile?.last_name    || '',
    father_name:  profile?.father_name  || '',
    phone:        profile?.phone        || '',
    email:        profile?.email        || user?.email || '',
    date_of_birth:profile?.date_of_birth|| '',
    gender:       profile?.gender       || '',
    avatar_url:   profile?.avatar_url   || '',
  })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess(false)
    const fullName = [form.first_name, form.father_name, form.last_name].filter(Boolean).join(' ')
    const { error: err } = await updateProfile({ ...form, full_name: fullName })
    if (err) setError('حدث خطأ في الحفظ')
    else     setSuccess(true)
    setSaving(false)
  }

  const initials = profile?.full_name?.slice(0, 2) || 'U'

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader title="الملف الشخصي" subtitle="إدارة معلوماتك الشخصية" />

      {/* Avatar card */}
      <div className="hero-card mb-4">
        <div className="flex items-center gap-4">
          {/* Avatar with camera button */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-3xl overflow-hidden border-4 border-white/40"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
              {form.avatar_url
                ? <img src={form.avatar_url} className="w-full h-full object-cover" alt="avatar" />
                : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-extrabold bg-white/20">
                    {initials}
                  </div>
                )
              }
            </div>
            <label className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-2xl flex items-center justify-center cursor-pointer border-2 border-white"
              style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
              <Camera size={14} className="text-white" />
              <input type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader()
                  r.onload = ev => set('avatar_url', ev.target?.result as string)
                  r.readAsDataURL(f)
                }}
              />
            </label>
          </div>

          {/* Info */}
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold truncate">{profile?.full_name || 'مستخدم جديد'}</h2>
            <p className="text-sm text-white/75 mt-0.5 truncate">{user?.email}</p>
            <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-xl px-2.5 py-1 mt-2 text-xs font-bold">
              <User size={12} />
              عضو نشط
            </div>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="card">
        {success && (
          <div className="mb-4">
            <Alert type="success" message="✓ تم حفظ التغييرات بنجاح" />
          </div>
        )}
        {error && (
          <div className="mb-4">
            <Alert type="error" message={error} onClose={() => setError('')} />
          </div>
        )}

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الاسم الأول">
              <input className="form-input" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="محمد" />
            </FormField>
            <FormField label="اسم الأب">
              <input className="form-input" value={form.father_name} onChange={e => set('father_name', e.target.value)} placeholder="علي" />
            </FormField>
          </div>

          <FormField label="اسم العائلة">
            <input className="form-input" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="الأحمد" />
          </FormField>

          <FormField label="رقم الجوال">
            <input className="form-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="05xxxxxxxx" />
          </FormField>

          <FormField label="البريد الإلكتروني">
            <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@email.com" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ الميلاد">
              <input className="form-input" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </FormField>
            <FormField label="الجنس">
              <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">اختر...</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </FormField>
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary w-full justify-center py-3 gap-2">
            {saving ? <Spinner size="sm" /> : <><Save size={17} />حفظ التغييرات</>}
          </button>
        </form>
      </div>
    </div>
  )
}
