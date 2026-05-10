import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { teamService, inviteService } from '../services'
import { Alert, Spinner, PageHeader } from '../components/ui'
import { Search, Shield, CheckCircle, Mail, Link } from 'lucide-react'
import { ROLE_LABELS } from '../utils/helpers'
import { supabase } from '../lib/supabase'

export default function JoinTeamPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [code, setCode] = useState(params.get('code') || '')
  const [team, setTeam] = useState<any>(null)
  const [invite, setInvite] = useState<any>(null)   // for token-based invites
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [done, setDone] = useState(false)
  const [doneType, setDoneType] = useState<'request' | 'joined'>('request')
  const [joinedTeamId, setJoinedTeamId] = useState('')
  const [error, setError] = useState('')

  // Auto-resolve invite token from URL on mount
  useEffect(() => {
    const token = params.get('invite')
    if (!token) return
    setLoading(true)
    inviteService.getByToken(token).then(inv => {
      if (!inv) setError('الدعوة غير موجودة أو تم استخدامها من قبل')
      else setInvite({ ...inv, token })
      setLoading(false)
    })
  }, [])

  async function searchByCode() {
    if (!code.trim()) return
    setLoading(true); setError(''); setTeam(null); setInvite(null)
    const t = await teamService.getByInviteCode(code.trim())
    if (!t) setError('لم يتم العثور على فريق بهذا الكود، أو الكود غير مفعّل')
    else setTeam(t)
    setLoading(false)
  }

  // Join via code — ALWAYS creates a join request (admin approves + assigns role)
  async function joinByCode() {
    if (!team || !user) return
    setJoining(true); setError('')
    const existingRole = await teamService.getMyRole(team.id, user.id)
    if (existingRole) { setError('أنت عضو في هذا الفريق بالفعل'); setJoining(false); return }
    await teamService.joinTeamByCode(team.id, user.id)
    // Notify admins
    const name = profile?.full_name || user.email || 'شخص ما'
    await teamService.notifyAdminsJoinRequest(team.id, name)
    setDoneType('request')
    setJoinedTeamId(team.id)
    setDone(true); setJoining(false)
  }

  // Accept invite via token — adds directly with pre-set role
  async function acceptInvite() {
    if (!invite || !user) return
    setJoining(true); setError('')
    const name = profile?.full_name || user.email || 'شخص ما'
    const result = await inviteService.acceptByToken(invite.token, user.id, name)
    if (result.error) { setError(result.error); setJoining(false); return }
    setDoneType('joined')
    setJoinedTeamId(result.teamId)
    setDone(true); setJoining(false)
  }

  if (done) return (
    <div className="max-w-sm mx-auto text-center py-16 px-4">
      <CheckCircle size={60} className="text-brand-500 mx-auto mb-4"/>
      <h2 className="text-xl font-bold mb-2">
        {doneType === 'request' ? 'تم إرسال طلب الانضمام ✅' : 'تم الانضمام بنجاح! 🎉'}
      </h2>
      <p className="text-slate-500 text-sm mb-6">
        {doneType === 'request'
          ? 'سيراجع مسؤول الفريق طلبك ويحدد دورك — ستصلك إشعار عند القبول'
          : 'مرحباً بك في الفريق! يمكنك الآن الوصول لكل صفحاته'}
      </p>
      <button onClick={() => navigate(doneType === 'joined' ? `/team/${joinedTeamId}` : '/')} className="btn btn-primary w-full justify-center">
        {doneType === 'joined' ? 'الذهاب للفريق' : 'العودة للرئيسية'}
      </button>
    </div>
  )

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="الانضمام لفريق" back={() => navigate('/')}/>

      {/* ── Invite token flow ── */}
      {loading && (
        <div className="card flex items-center justify-center py-10">
          <Spinner/>
        </div>
      )}

      {invite && !loading && (
        <div className="card">
          {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-700 overflow-hidden flex-shrink-0">
              {invite.team_logo
                ? <img src={invite.team_logo} className="w-full h-full object-cover" alt=""/>
                : invite.team_name?.[0]}
            </div>
            <div>
              <div className="font-extrabold text-slate-900">{invite.team_name}</div>
              <div className="text-sm text-slate-500">{invite.sport_type}</div>
              <div className="flex items-center gap-1 mt-1">
                <Mail size={12} className="text-brand-500"/>
                <span className="text-xs text-brand-600 font-semibold">
                  دعوة شخصية — سينضم كـ {ROLE_LABELS[invite.role] || invite.role}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-4 text-xs text-brand-700">
            ✅ هذه دعوة شخصية — ستُضاف مباشرة بدون انتظار الموافقة
          </div>
          <button onClick={acceptInvite} disabled={joining} className="btn btn-primary w-full justify-center">
            {joining ? <Spinner size="sm"/> : `قبول الدعوة والانضمام كـ ${ROLE_LABELS[invite.role] || invite.role}`}
          </button>
        </div>
      )}

      {/* ── Code flow ── */}
      {!invite && !loading && (
        <div className="card">
          {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
          <p className="text-sm text-slate-500 mb-4">أدخل كود الدعوة الذي أرسله لك مسؤول الفريق</p>
          <div className="flex gap-2 mb-5">
            <input className="form-input flex-1 font-mono tracking-widest text-lg uppercase"
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="مثال: ABC12345"
              onKeyDown={e => e.key === 'Enter' && searchByCode()}/>
            <button onClick={searchByCode} disabled={loading} className="btn btn-primary px-4">
              {loading ? <Spinner size="sm"/> : <Search size={16}/>}
            </button>
          </div>

          {team && (
            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-700 overflow-hidden">
                  {team.logo_url ? <img src={team.logo_url} className="w-full h-full object-cover" alt=""/> : team.name[0]}
                </div>
                <div>
                  <div className="font-bold text-base">{team.name}</div>
                  <div className="text-sm text-slate-500">{team.sport_type} · {team.city}</div>
                  <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <Shield size={11}/> سيراجع المسؤول طلبك ويحدد دورك
                  </div>
                </div>
              </div>
              <button onClick={joinByCode} disabled={joining} className="btn btn-primary w-full justify-center">
                {joining ? <Spinner size="sm"/> : 'إرسال طلب الانضمام'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
