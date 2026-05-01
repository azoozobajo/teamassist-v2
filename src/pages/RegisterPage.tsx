import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner } from '../components/ui'

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', pass: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.pass) { setError('جميع الحقول مطلوبة'); return }
    if (form.pass !== form.confirm) { setError('كلمات المرور غير متطابقة'); return }
    if (form.pass.length < 6) { setError('كلمة المرور 6 أحرف على الأقل'); return }
    setLoading(true); setError('')
    const { error: err } = await signUp(form.email, form.pass, form.name)
    if (err) { setError(err.message || 'حدث خطأ'); setLoading(false) }
    else navigate('/complete-profile')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 via-brand-600 to-brand-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.4C17.25 22.15 21 17.25 21 12V7l-9-5z"/></svg>
          </div>
          <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
        </div>
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <form onSubmit={submit} className="space-y-3">
          <div><label className="form-label">الاسم الكامل *</label><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="الاسم الكامل"/></div>
          <div><label className="form-label">البريد الإلكتروني *</label><input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)}/></div>
          <div><label className="form-label">كلمة المرور *</label><input className="form-input" type="password" value={form.pass} onChange={e => set('pass', e.target.value)}/></div>
          <div><label className="form-label">تأكيد كلمة المرور *</label><input className="form-input" type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)}/></div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center py-3 mt-2">
            {loading ? <Spinner size="sm"/> : 'إنشاء الحساب'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-400 mt-4">
          لديك حساب؟ <Link to="/login" className="text-brand-600 font-bold hover:underline">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  )
}