import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner, ImageUpload, FormField } from '../components/ui'
import { Camera } from 'lucide-react'

export default function CompleteProfilePage() {
  const { profile, updateProfile, user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    first_name: '', last_name: '', father_name: '',
    phone: '', date_of_birth: '', gender: '',
    avatar_url: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.phone || !form.date_of_birth || !form.gender) {
      setError('يرجى إكمال الحقول المطلوبة'); return
    }
    setLoading(true)
    const fullName = [form.first_name, form.father_name, form.last_name].filter(Boolean).join(' ')
    const { error: err } = await updateProfile({
      ...form, full_name: fullName, profile_complete: true
    })
    if (err) { setError('حدث خطأ في الحفظ'); setLoading(false) }
    else navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.4C17.25 22.15 21 17.25 21 12V7l-9-5z"/></svg>
          </div>
          <h1 className="text-xl font-bold">استكمال المعلومات</h1>
          <p className="text-sm text-slate-400 mt-1">يرجى إكمال بياناتك الشخصية للمتابعة</p>
        </div>
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <form onSubmit={submit} className="space-y-0">
          {/* Avatar */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden">
                {form.avatar_url ? <img src={form.avatar_url} className="w-full h-full object-cover"/> :
                  <Camera size={32} className="text-brand-400"/>}
              </div>
              <label className="absolute bottom-0 right-0 w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center cursor-pointer shadow">
                <Camera size={13} className="text-white"/>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = ev => set('avatar_url', ev.target?.result as string); r.readAsDataURL(f)
                }}/>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الاسم الأول *">
              <input className="form-input" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="محمد"/>
            </FormField>
            <FormField label="اسم الأب">
              <input className="form-input" value={form.father_name} onChange={e => set('father_name', e.target.value)} placeholder="عبدالله"/>
            </FormField>
          </div>
          <FormField label="اسم العائلة *">
            <input className="form-input" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="الأحمد"/>
          </FormField>
          <FormField label="رقم الجوال *">
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+966 5xxxxxxxx"/>
          </FormField>
          <FormField label="البريد الإلكتروني">
            <input className="form-input bg-slate-50" value={user?.email || ''} disabled/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ الميلاد *">
              <input className="form-input" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)}/>
            </FormField>
            <FormField label="الجنس *">
              <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">اختر...</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </FormField>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center py-3 mt-4">
            {loading ? <Spinner size="sm"/> : 'حفظ ومتابعة'}
          </button>
        </form>
      </div>
    </div>
  )
}