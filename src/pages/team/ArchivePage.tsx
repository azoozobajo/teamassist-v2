import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Archive, Calendar, MapPin, Shield, UserX } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService } from '../../services'
import { Spinner } from '../../components/ui'
import { ROLE_LABELS } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

export default function ArchivePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam] = useState<any>(null)
  const [membership, setMembership] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getTeam(teamId),
      supabase.from('team_members')
        .select('role, joined_at, removed_at')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .neq('status', 'active')
        .single()
    ]).then(([t, { data: mem }]) => {
      setTeam(t)
      setMembership(mem)
      setLoading(false)
    })
  }, [teamId, user])

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  )

  if (!team) return (
    <div className="card text-center py-16">
      <p className="font-bold text-slate-500">الفريق غير موجود</p>
    </div>
  )

  return (
    <div className="animate-fade space-y-5 max-w-lg mx-auto">

      {/* Archive banner */}
      <div className="rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 p-5 text-center">
        <div className="w-14 h-14 bg-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-3">
          <Archive size={26} className="text-slate-500" />
        </div>
        <p className="font-extrabold text-slate-700 text-base">هذا الفريق في الأرشيف</p>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          لقد تم إزالتك من هذا الفريق. يمكنك الاطلاع على معلوماته الأساسية فقط، ولا تستطيع مشاهدة أي تحديثات جديدة.
        </p>
      </div>

      {/* Team card */}
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center text-2xl font-extrabold text-slate-500 flex-shrink-0 overflow-hidden grayscale">
            {team.logo_url
              ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.name} />
              : team.name?.[0]}
          </div>
          <div>
            <h2 className="font-extrabold text-slate-800 text-lg">{team.name}</h2>
            {team.sport_type && (
              <p className="text-sm text-slate-500 mt-0.5">{team.sport_type}</p>
            )}
          </div>
        </div>

        <div className="space-y-2.5">
          {team.city && (
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <MapPin size={15} className="text-slate-400" />
              </div>
              <span>{team.city}</span>
            </div>
          )}
          {membership?.role && (
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield size={15} className="text-slate-400" />
              </div>
              <span>كان دورك: <span className="font-bold">{ROLE_LABELS[membership.role] || membership.role}</span></span>
            </div>
          )}
          {membership?.joined_at && (
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Calendar size={15} className="text-slate-400" />
              </div>
              <span>انضممت: {new Date(membership.joined_at).toLocaleDateString('ar-SA')}</span>
            </div>
          )}
          {membership?.removed_at && (
            <div className="flex items-center gap-2.5 text-sm text-red-600">
              <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <UserX size={15} className="text-red-400" />
              </div>
              <span>تاريخ الإزالة: {new Date(membership.removed_at).toLocaleDateString('ar-SA')}</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        className="btn btn-ghost w-full">
        العودة للصفحة الرئيسية
      </button>
    </div>
  )
}
