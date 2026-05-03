import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner } from '../components/ui'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function LoginPage() {
  const { signIn }  = useAuth()
  const navigate    = useNavigate()
  const [email, setEmail]       = useState('')
  const [pass, setPass]         = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !pass) { setError('أدخل البريد وكلمة المرور'); return }
    setLoading(true); setError('')
    const { error: err } = await signIn(email, pass)
    if (err) { setError('البريد أو كلمة المرور غير صحيحة'); setLoading(false) }
    else navigate('/')
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F4F8' }}>

      {/* ── Left panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#064e3b 0%,#0f766e 40%,#1D9E75 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute top-10 right-10 w-48 h-48 bg-white/10 rounded-full" />
        <div className="absolute bottom-20 left-5 w-64 h-64 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full" />

        <div className="relative text-white text-center px-12 max-w-md">
          <div className="w-24 h-24 rounded-3xl bg-white flex items-center justify-center mx-auto mb-6 overflow-hidden"
            style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.25), 0 0 0 2px rgba(255,255,255,0.3)' }}>
            <img src="/logo.png" alt="TA" className="w-16 h-16 object-contain"
              onError={e => {
                const t = e.target as HTMLImageElement
                t.style.display = 'none'
              }}
            />
          </div>
          <h1 className="text-4xl font-extrabold mb-3">TeamAssist</h1>
          <p className="text-white/80 text-lg leading-relaxed">
            المنصة المتكاملة لإدارة الفرق الرياضية والتواصل بين اللاعبين والمدربين
          </p>
          <div className="flex justify-center gap-4 mt-8">
            {['الحضور', 'التدريبات', 'المباريات', 'التقارير'].map(f => (
              <div key={f} className="bg-white/15 rounded-2xl px-3 py-2 text-sm font-bold backdrop-blur-sm">
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Logo (mobile only) */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center mx-auto mb-3 overflow-hidden"
              style={{ boxShadow: '0 6px 20px rgba(15,23,42,0.14), 0 0 0 1.5px rgba(15,23,42,0.06)' }}>
              <img src="/logo.png" alt="TA" className="w-12 h-12 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">TeamAssist</h1>
            <p className="text-sm text-slate-500 mt-1">نظام إدارة الفرق الرياضية</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl p-7" style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.10)' }}>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">مرحباً بعودتك 👋</h2>
            <p className="text-sm text-slate-500 mb-6">سجّل دخولك للمتابعة</p>

            {error && (
              <div className="mb-4">
                <Alert type="error" message={error} onClose={() => setError('')} />
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="form-label">البريد الإلكتروني</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="form-label">كلمة المرور</label>
                <div className="relative">
                  <input
                    className="form-input pl-11"
                    type={showPass ? 'text' : 'password'}
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full justify-center py-3.5 text-base gap-2 mt-2">
                {loading ? <Spinner size="sm" /> : <><LogIn size={18} />تسجيل الدخول</>}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 mt-5">
            ليس لديك حساب؟{' '}
            <Link to="/register" className="text-brand-600 font-extrabold hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
