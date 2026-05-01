import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Shield, Save, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, permissionService } from '../../services'
import { Spinner, PageHeader, EmptyState, Avatar } from '../../components/ui'
import { PERMISSIONS } from '../../utils/helpers'

export default function PermissionsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [selMember, setSelMember] = useState<any>(null)
  const [selPerms, setSelPerms] = useState<string[]>([])
  const [allPerms, setAllPerms] = useState<Record<string, string[]>>({}) // userId -> perms[]
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [mems, teamPerms] = await Promise.all([
      teamService.getMembers(teamId),
      permissionService.getTeamPermissions(teamId)
    ])
    // Group permissions by user
    const grouped: Record<string, string[]> = {}
    teamPerms.forEach((p: any) => {
      if (!grouped[p.user_id]) grouped[p.user_id] = []
      grouped[p.user_id].push(p.permission)
    })
    setAllPerms(grouped)
    // Only non-owner members
    setMembers(mems.filter((m: any) => m.role !== 'owner'))
    setLoading(false)
  }

  function selectMember(m: any) {
    setSelMember(m)
    setSelPerms(allPerms[m.user_id] || [])
    setSaved(false)
  }

  function togglePerm(key: string) {
    setSelPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
    setSaved(false)
  }

  async function savePerms() {
    if (!selMember || !teamId || !user) return
    setSaving(true)
    await permissionService.setUserPermissions(teamId, selMember.user_id, selPerms, user.id)
    setAllPerms(prev => ({ ...prev, [selMember.user_id]: selPerms }))
    setSaving(false); setSaved(true)
  }

  if (myRole !== 'owner') {
    return (
      <div className="card text-center py-12">
        <Shield size={40} className="text-slate-300 mx-auto mb-3"/>
        <p className="text-slate-500 font-bold">وصول محظور</p>
        <p className="text-xs text-slate-400 mt-1">فقط مالك الفريق يمكنه إدارة الصلاحيات</p>
      </div>
    )
  }

  const PERM_GROUPS = [
    { label: '👥 الأعضاء والمواعيد', keys: ['invite_members','add_training','add_matches','add_tournaments'] },
    { label: '✅ الحضور والإجازات', keys: ['view_attendance','manage_attendance','manage_leaves'] },
    { label: '📊 التقارير', keys: ['view_reports','add_reports'] },
    { label: '⭐ النقاط', keys: ['grant_points','manage_points_system'] },
    { label: '﷼ المالية', keys: ['manage_finance_add','manage_finance_pay'] },
    { label: '📢 الإعلانات', keys: ['make_announcements'] },
    { label: '🔒 الإدارة', keys: ['manage_permissions'] },
  ]

  return (
    <div>
      <PageHeader title="الصلاحيات" subtitle="حدد صلاحيات كل عضو بشكل مخصص"/>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
        <Shield size={12} className="inline ml-1"/>
        الصلاحيات تُمنح بالاسم — كل عضو جديد بدون صلاحيات تلقائياً. مالك الفريق يملك كل الصلاحيات دائماً.
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        {/* Members list */}
        <div>
          <p className="text-xs font-bold text-slate-400 mb-2">الأعضاء</p>
          {loading ? <Spinner/> : (
            <div className="space-y-1.5">
              {members.map(m => {
                const count = (allPerms[m.user_id] || []).length
                return (
                  <button key={m.id} onClick={() => selectMember(m)}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${selMember?.id === m.id ? 'bg-brand-50 border-brand-400' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                    <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm"/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{m.profile?.full_name}</div>
                      <div className="text-xs text-slate-400">{m.role}</div>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
              {members.length === 0 && <EmptyState title="لا يوجد أعضاء"/>}
            </div>
          )}
        </div>

        {/* Permissions panel */}
        <div>
          {!selMember ? (
            <div className="card text-center py-12 text-slate-400">
              <Shield size={28} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">اختر عضواً لتعديل صلاحياته</p>
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={selMember.profile?.full_name || '?'} src={selMember.profile?.avatar_url} size="md"/>
                  <div>
                    <div className="font-bold text-sm">{selMember.profile?.full_name}</div>
                    <div className="text-xs text-slate-400">{selMember.role}</div>
                  </div>
                </div>
                <button onClick={savePerms} disabled={saving}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border-none cursor-pointer transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                  {saving ? <Spinner size="sm"/> : saved ? <><Check size={14}/> محفوظ</> : <><Save size={14}/> حفظ</>}
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mb-4">
                <button onClick={() => { setSelPerms(PERMISSIONS.map(p => p.key)); setSaved(false) }}
                  className="btn btn-ghost btn-sm text-xs">تحديد الكل</button>
                <button onClick={() => { setSelPerms([]); setSaved(false) }}
                  className="btn btn-ghost btn-sm text-xs text-red-500 border-red-200">مسح الكل</button>
                <span className="text-xs text-slate-400 flex items-center">{selPerms.length} صلاحية محددة</span>
              </div>

              {/* Permission groups */}
              <div className="space-y-4">
                {PERM_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-xs font-bold text-slate-500 mb-2">{group.label}</div>
                    <div className="space-y-1.5">
                      {group.keys.map(key => {
                        const perm = PERMISSIONS.find(p => p.key === key)
                        if (!perm) return null
                        const active = selPerms.includes(key)
                        return (
                          <label key={key} onClick={() => togglePerm(key)}
                            className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200'}`}>
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                              {active && <Check size={11} className="text-white"/>}
                            </div>
                            <span className={`text-sm ${active ? 'font-bold text-emerald-800' : 'text-slate-600'}`}>
                              {perm.label}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
