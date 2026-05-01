import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Alert, Spinner } from '../components/ui'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !pass) { setError('أدخل البريد وكلمة المرور'); return }
    setLoading(true); setError('')
    const { error: err } = await signIn(email, pass)
    if (err) { setError('البريد أو كلمة المرور غير صحيحة'); setLoading(false) }
    else navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 via-brand-600 to-brand-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="TeamAssist" className="w-20 h-20 rounded-2xl object-contain bg-black p-2 shadow-lg"/>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">TeamAssist</h1>
          <p className="text-sm text-slate-400 mt-1">نظام إدارة الفرق الرياضية</p>
        </div>
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="form-label">البريد الإلكتروني</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
          </div>
          <div>
            <label className="form-label">كلمة المرور</label>
            <div className="relative">
              <input className="form-input pl-10" type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPass(s => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center py-3 text-base">
            {loading ? <Spinner size="sm"/> : 'تسجيل الدخول'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-400 mt-5">
          ليس لديك حساب?{' '}
          <Link to="/register" className="text-brand-600 font-bold hover:underline">إنشاء حساب</Link>
        </p>
      </div>
    </div>
  )
}
