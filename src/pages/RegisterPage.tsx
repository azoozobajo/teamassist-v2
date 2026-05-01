import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner } from '../components/ui'
import { UserPlus } from 'lucide-react'

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]     = useState({ name: '', email: '', pass: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.pass) { setError('جميع الحقول مطلوبة'); return }
    if (form.pass !== form.confirm) { setError('كلمتا المرور غير متطابقتين'); return }
    if (form.pass.length < 6)       { setError('كلمة المرور 6 أحرف على الأقل'); return }
    setLoading(true); setError('')
    const { error: err } = await signUp(form.email, form.pass, form.name)
    if (err) { setError(err.message || 'حدث خطأ'); setLoading(false) }
    else navigate('/complete-profile')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: '#F0F4F8' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-3 overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)', boxShadow: '0 6px 20px rgba(29,158,117,0.35)' }}>
            <img src="/logo.png" alt="TA" className="w-11 h-11 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">انضم إلى TeamAssist</h1>
          <p className="text-sm text-slate-500 mt-1">أنشئ حسابك وابدأ مع فريقك</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-7" style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.10)' }}>
          {error && (
            <div className="mb-4">
              <Alert type="error" message={error} onClose={() => setError('')} />
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="form-label">الاسم الكامل <span className="text-red-500">*</span></label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="محمد علي"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="form-label">البريد الإلكتروني <span className="text-red-500">*</span></label>
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="form-label">كلمة المرور <span className="text-red-500">*</span></label>
              <input
                className="form-input"
                type="password"
                value={form.pass}
                onChange={e => set('pass', e.target.value)}
                placeholder="6 أحرف على الأقل"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="form-label">تأكيد كلمة المرور <span className="text-red-500">*</span></label>
              <input
                className="form-input"
                type="password"
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center py-3.5 text-base gap-2 mt-1">
              {loading ? <Spinner size="sm" /> : <><UserPlus size={18} />إنشاء الحساب</>}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          لديك حساب؟{' '}
          <Link to="/login" className="text-brand-600 font-extrabold hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  )
}
