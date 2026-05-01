import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { teamService } from '../services'
import { Alert, Spinner, PageHeader } from '../components/ui'
import { Search, Shield, CheckCircle } from 'lucide-react'

export default function JoinTeamPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') || '')
  const [team, setTeam] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function search() {
    if (!code.trim()) return
    setLoading(true); setError(''); setTeam(null)
    const t = await teamService.getByInviteCode(code)
    if (!t) setError('لم يتم العثور على فريق بهذا الكود، أو الكود غير مفعّل')
    else setTeam(t)
    setLoading(false)
  }

  async function join() {
    if (!team || !user) return
    setJoining(true)
    // Check if already member
    const role = await teamService.getMyRole(team.id, user.id)
    if (role) { setError('أنت عضو في هذا الفريق بالفعل'); setJoining(false); return }
    await teamService.joinTeamByCode(team.id, user.id, team.require_approval)
    setDone(true); setJoining(false)
  }

  if (done) return (
    <div className="max-w-sm mx-auto text-center py-16">
      <CheckCircle size={56} className="text-brand-500 mx-auto mb-4"/>
      <h2 className="text-xl font-bold mb-2">
        {team.require_approval ? 'تم إرسال طلب الانضمام' : 'تم الانضمام بنجاح!'}
      </h2>
      <p className="text-slate-400 text-sm mb-6">
        {team.require_approval ? 'سيتم إشعارك عند قبول طلبك من مسؤول الفريق' : `مرحباً بك في ${team.name}`}
      </p>
      <button onClick={() => navigate(team.require_approval ? '/' : `/team/${team.id}`)} className="btn btn-primary">
        {team.require_approval ? 'العودة للرئيسية' : 'الذهاب للفريق'}
      </button>
    </div>
  )

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="الانضمام لفريق" subtitle="أدخل كود الدعوة للانضمام" back={() => navigate('/')}/>
      <div className="card">
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <div className="flex gap-2 mb-5">
          <input className="form-input flex-1" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="أدخل كود الدعوة" onKeyDown={e => e.key === 'Enter' && search()}/>
          <button onClick={search} disabled={loading} className="btn btn-primary px-4">
            {loading ? <Spinner size="sm"/> : <Search size={16}/>}
          </button>
        </div>
        {team && (
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600 overflow-hidden">
                {team.logo_url ? <img src={team.logo_url} className="w-full h-full object-cover"/> : team.name[0]}
              </div>
              <div>
                <div className="font-bold text-base">{team.name}</div>
                <div className="text-sm text-slate-500">{team.sport_type} · {team.city}</div>
                {team.require_approval && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <Shield size={11}/> يتطلب موافقة المسؤول
                  </div>
                )}
              </div>
            </div>
            <button onClick={join} disabled={joining} className="btn btn-primary w-full justify-center">
              {joining ? <Spinner size="sm"/> : team.require_approval ? 'إرسال طلب انضمام' : 'انضمام للفريق'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}