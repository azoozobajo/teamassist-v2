import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Shield, Save, Check, Users, Link, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, permissionService } from '../../services'
import { Spinner, PageHeader, EmptyState, Avatar } from '../../components/ui'
import { PERMISSIONS } from '../../utils/helpers'

export default function PermissionsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [parentMembers, setParentMembers] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageTab, setPageTab] = useState<'permissions' | 'parents'>('permissions')

  // Permissions tab state
  const [selMember, setSelMember] = useState<any>(null)
  const [selPerms, setSelPerms] = useState<string[]>([])
  const [selRole, setSelRole] = useState('')
  const [allPerms, setAllPerms] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Parent tab state
  const [selParent, setSelParent] = useState<any>(null)
  const [parentLinkedPlayer, setParentLinkedPlayer] = useState('')
  const [parentDMContacts, setParentDMContacts] = useState<string[]>([])
  const [parentSaving, setParentSaving] = useState(false)
  const [parentSaved, setParentSaved] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [mems, teamPerms, parents] = await Promise.all([
      teamService.getMembers(teamId),
      permissionService.getTeamPermissions(teamId),
      teamService.getParentMembers(teamId)
    ])
    const grouped: Record<string, string[]> = {}
    teamPerms.forEach((p: any) => {
      if (!grouped[p.user_id]) grouped[p.user_id] = []
      grouped[p.user_id].push(p.permission)
    })
    setAllPerms(grouped)
    setMembers(mems.filter((m: any) => m.role !== 'owner'))
    setPlayers(mems.filter((m: any) => m.role === 'player'))
    setParentMembers(parents)
    setLoading(false)
  }

  function selectMember(m: any) {
    setSelMember(m)
    setSelPerms(allPerms[m.user_id] || [])
    setSelRole(m.role)
    setSaved(false)
  }

  function togglePerm(key: string) {
    setSelPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
    setSaved(false)
  }

  async function savePerms() {
    if (!selMember || !teamId || !user) return
    setSaving(true)
    const tasks: Promise<any>[] = [
      permissionService.setUserPermissions(teamId, selMember.user_id, selPerms, user.id)
    ]
    if (selRole !== selMember.role) {
      tasks.push(teamService.updateMemberRole(selMember.id, selRole))
    }
    await Promise.all(tasks)
    setAllPerms(prev => ({ ...prev, [selMember.user_id]: selPerms }))
    setMembers(prev => prev.map(m => m.id === selMember.id ? { ...m, role: selRole } : m))
    setSelMember((prev: any) => ({ ...prev, role: selRole }))
    setSaving(false); setSaved(true)
  }

  function selectParent(p: any) {
    setSelParent(p)
    setParentLinkedPlayer(p.linked_player?.id || '')
    const dmPerms = (allPerms[p.user_id] || [])
      .filter((x: string) => x.startsWith('parent_dm:'))
      .map((x: string) => x.replace('parent_dm:', ''))
    setParentDMContacts(dmPerms)
    setParentSaved(false)
  }

  function toggleDMContact(uid: string) {
    setParentDMContacts(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
    setParentSaved(false)
  }

  async function saveParent() {
    if (!selParent || !teamId || !user) return
    setParentSaving(true)
    await Promise.all([
      teamService.setLinkedPlayer(selParent.id, parentLinkedPlayer || null),
      permissionService.setUserPermissions(
        teamId, selParent.user_id,
        parentDMContacts.map(uid => `parent_dm:${uid}`),
        user.id
      )
    ])
    // Refresh parent list to show updated linked player
    const updated = await teamService.getParentMembers(teamId)
    setParentMembers(updated)
    const updatedParent = updated.find((p: any) => p.id === selParent.id)
    if (updatedParent) { setSelParent(updatedParent) }
    const newGrouped = { ...allPerms }
    newGrouped[selParent.user_id] = parentDMContacts.map(uid => `parent_dm:${uid}`)
    setAllPerms(newGrouped)
    setParentSaving(false); setParentSaved(true)
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
    { label: '﷼ المالية', keys: ['manage_finance_add','manage_finance_pay','view_team_expenses','manage_team_expenses'] },
    { label: '🏥 الطبي', keys: ['view_medical','manage_medical'] },
    { label: '📢 الإعلانات', keys: ['make_announcements'] },
    { label: '🔒 الإدارة', keys: ['manage_permissions'] },
  ]

  const nonParentMembers = members.filter(m => m.role !== 'parent')

  return (
    <div>
      <PageHeader title="الصلاحيات" subtitle="حدد صلاحيات كل عضو بشكل مخصص"/>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
        <Shield size={12} className="inline ml-1"/>
        الصلاحيات تُمنح بالاسم — كل عضو جديد بدون صلاحيات تلقائياً. مالك الفريق يملك كل الصلاحيات دائماً.
      </div>

      {/* Page tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setPageTab('permissions')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${pageTab === 'permissions' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          <Shield size={14}/> صلاحيات الأعضاء
        </button>
        <button onClick={() => setPageTab('parents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${pageTab === 'parents' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
          <Users size={14}/> أولياء الأمور
          {parentMembers.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-extrabold ${pageTab === 'parents' ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'}`}>
              {parentMembers.length}
            </span>
          )}
        </button>
      </div>

      {/* ── PERMISSIONS TAB ── */}
      {pageTab === 'permissions' && (
        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          <div>
            <p className="text-xs font-bold text-slate-400 mb-2">الأعضاء</p>
            {loading ? <Spinner/> : (
              <div className="space-y-1.5">
                {members.map(m => {
                  const count = (allPerms[m.user_id] || []).filter((p: string) => !p.startsWith('parent_dm:')).length
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

                {/* Role selector */}
                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-500 mb-2">تغيير المنصب</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['head_coach','assistant_coach','player','administrator','media','medical','parent','guest'].map(r => (
                      <button key={r} onClick={() => { setSelRole(r); setSaved(false) }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${selRole === r ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {({'head_coach':'مدرب رئيسي','assistant_coach':'مدرب مساعد','player':'لاعب','administrator':'إداري','media':'إعلامي','medical':'طبي','parent':'ولي أمر','guest':'ضيف'} as any)[r]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <button onClick={() => { setSelPerms(PERMISSIONS.map(p => p.key)); setSaved(false) }}
                    className="btn btn-ghost btn-sm text-xs">تحديد الكل</button>
                  <button onClick={() => { setSelPerms([]); setSaved(false) }}
                    className="btn btn-ghost btn-sm text-xs text-red-500 border-red-200">مسح الكل</button>
                  <span className="text-xs text-slate-400 flex items-center">{selPerms.length} صلاحية محددة</span>
                </div>

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
      )}

      {/* ── PARENTS TAB ── */}
      {pageTab === 'parents' && (
        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          {/* Parents list */}
          <div>
            <p className="text-xs font-bold text-slate-400 mb-2">أولياء الأمور ({parentMembers.length})</p>
            {loading ? <Spinner/> : (
              <div className="space-y-1.5">
                {parentMembers.length === 0
                  ? <div className="card text-center py-8 text-slate-400 text-xs">لا يوجد أولياء أمور في الفريق</div>
                  : parentMembers.map(p => (
                    <button key={p.id} onClick={() => selectParent(p)}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${selParent?.id === p.id ? 'bg-brand-50 border-brand-400' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                      <Avatar name={p.profile?.full_name || '?'} src={p.profile?.avatar_url} size="sm"/>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{p.profile?.full_name}</div>
                        {p.linked_player
                          ? <div className="text-xs text-brand-600 flex items-center gap-1"><Link size={9}/> {p.linked_player.full_name}</div>
                          : <div className="text-xs text-amber-500">غير مرتبط بلاعب</div>
                        }
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Parent settings panel */}
          <div>
            {!selParent ? (
              <div className="card text-center py-12 text-slate-400">
                <Users size={28} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">اختر ولي أمر لإدارة إعداداته</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header card */}
                <div className="card flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={selParent.profile?.full_name || '?'} src={selParent.profile?.avatar_url} size="md"/>
                    <div>
                      <div className="font-bold text-sm">{selParent.profile?.full_name}</div>
                      <div className="text-xs text-slate-400">ولي أمر</div>
                    </div>
                  </div>
                  <button onClick={saveParent} disabled={parentSaving}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border-none cursor-pointer transition-all ${parentSaved ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                    {parentSaving ? <Spinner size="sm"/> : parentSaved ? <><Check size={14}/> محفوظ</> : <><Save size={14}/> حفظ</>}
                  </button>
                </div>

                {/* Linked player */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <Link size={15} className="text-brand-500"/>
                    <span className="font-bold text-sm text-slate-700">الابن / البنت المرتبط/ة</span>
                  </div>
                  <select className="form-input" value={parentLinkedPlayer}
                    onChange={e => { setParentLinkedPlayer(e.target.value); setParentSaved(false) }}>
                    <option value="">— غير محدد —</option>
                    {players.map(pl => (
                      <option key={pl.user_id} value={pl.user_id}>{pl.profile?.full_name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-2">ولي الأمر سيرى بيانات الحضور والنقاط والمالية لهذا اللاعب فقط</p>
                </div>

                {/* Allowed DM contacts */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={15} className="text-brand-500"/>
                    <span className="font-bold text-sm text-slate-700">جهات التواصل المسموح بها (رسائل خاصة)</span>
                    <span className="text-xs text-slate-400 mr-auto">{parentDMContacts.length} محدد</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">اختر الأعضاء الذين يُسمح لولي الأمر بمراسلتهم مباشرة</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {nonParentMembers.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">لا يوجد أعضاء</p>
                      : nonParentMembers.map(m => {
                          const active = parentDMContacts.includes(m.user_id)
                          return (
                            <label key={m.id} onClick={() => toggleDMContact(m.user_id)}
                              className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200'}`}>
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                {active && <Check size={11} className="text-white"/>}
                              </div>
                              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {m.profile?.full_name?.[0] || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs font-bold truncate ${active ? 'text-emerald-800' : 'text-slate-700'}`}>
                                  {m.profile?.full_name}
                                </div>
                                <div className="text-xs text-slate-400">{m.role}</div>
                              </div>
                            </label>
                          )
                        })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
