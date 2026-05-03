import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus, Edit2, Trash2, CheckCircle, XCircle, Shield, Save, Check, Link, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, inviteService, notificationService, permissionService, levelService, streakService, badgeService } from '../../services'
import { Spinner, PageHeader, SearchBox, Avatar, Modal, FormField, ConfirmDialog, EmptyState, Tabs } from '../../components/ui'
import { ROLE_LABELS, canManageTeam, formatDate, PERMISSIONS } from '../../utils/helpers'

const ALL_ROLES = ['owner','head_coach','assistant_coach','player','administrator','media','medical','parent','guest']
const ROLES_NO_OWNER = ALL_ROLES.filter(r => r !== 'owner')
const ROLE_GROUPS = [
  { label: '👥 الأعضاء والمواعيد', keys: ['invite_members','add_training','add_matches','add_tournaments'] },
  { label: '✅ الحضور والإجازات', keys: ['view_attendance','manage_attendance','manage_leaves'] },
  { label: '📊 التقارير', keys: ['view_reports','add_reports'] },
  { label: '⭐ النقاط', keys: ['grant_points','manage_points_system'] },
  { label: '﷼ المالية', keys: ['manage_finance_add','manage_finance_pay'] },
  { label: '📢 الإعلانات', keys: ['make_announcements'] },
  { label: '🔒 الإدارة', keys: ['manage_permissions'] },
  { label: '💬 التواصل', keys: ['view_parent_chat'] },
]
const roleColor: Record<string, string> = {
  owner:'bg-emerald-100 text-emerald-800', head_coach:'bg-blue-100 text-blue-800',
  assistant_coach:'bg-sky-100 text-sky-800', player:'bg-slate-100 text-slate-600',
  administrator:'bg-purple-100 text-purple-800', media:'bg-amber-100 text-amber-700',
  medical:'bg-red-100 text-red-700', parent:'bg-pink-100 text-pink-700', guest:'bg-gray-100 text-gray-500'
}

export default function MembersPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers]   = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [allPerms, setAllPerms] = useState<Record<string, string[]>>({})
  const [levels, setLevels]         = useState<any[]>([])
  const [teamStreaks, setTeamStreaks] = useState<any[]>([])
  const [teamBadges, setTeamBadges]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('members')

  // Edit member modal
  const [editMember, setEditMember] = useState<any>(null)
  const [editRole, setEditRole] = useState('')
  const [editPosLabel, setEditPosLabel] = useState('')
  const [editLinkedPlayers, setEditLinkedPlayers] = useState<string[]>([]) // for parents
  const [editPerms, setEditPerms] = useState<string[]>([]) // for permissions tab in modal
  const [editSection, setEditSection] = useState<'info' | 'perms'>('info')
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)

  // Inline permissions tab (owner-only HR panel)
  const [permSelMember, setPermSelMember] = useState<any>(null)
  const [permSelPerms, setPermSelPerms] = useState<string[]>([])
  const [permSelRole, setPermSelRole] = useState('')
  const [permSaving, setPermSaving] = useState(false)
  const [permSaved, setPermSaved] = useState(false)

  // Other
  const [confirmRemove, setConfirmRemove] = useState<any>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'player' })
  const [approveReq, setApproveReq] = useState<any>(null)
  const [approveRole, setApproveRole] = useState('player')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    Promise.all([
      levelService.getLevels(teamId),
      streakService.getTeamStreaks(teamId),
      badgeService.getTeamBadges(teamId),
    ]).then(([lv, ts, tb]) => { setLevels(lv); setTeamStreaks(ts); setTeamBadges(tb) })
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [m, r, teamPerms] = await Promise.all([
      teamService.getMembers(teamId),
      teamService.getJoinRequests(teamId),
      permissionService.getTeamPermissions(teamId)
    ])
    const grouped: Record<string, string[]> = {}
    teamPerms.forEach((p: any) => {
      if (!grouped[p.user_id]) grouped[p.user_id] = []
      grouped[p.user_id].push(p.permission)
    })
    setAllPerms(grouped)
    setMembers(m); setRequests(r); setLoading(false)
  }

  // ── Open edit modal ──
  function openEdit(m: any) {
    setEditMember(m)
    setEditRole(m.role)
    setEditPosLabel(m.position_label || '')
    setEditSection('info')
    setEditSaved(false)
    // Linked players (for parents)
    const linkedPerms = (allPerms[m.user_id] || [])
      .filter(p => p.startsWith('linked_player:'))
      .map(p => p.replace('linked_player:', ''))
    // fallback: if linked_player_id set but not in perms yet
    const fallback = m.linked_player_id && !linkedPerms.includes(m.linked_player_id) ? [m.linked_player_id] : []
    setEditLinkedPlayers(linkedPerms.length > 0 ? linkedPerms : fallback)
    // Permissions (non-parent)
    setEditPerms((allPerms[m.user_id] || []).filter(p => !p.startsWith('linked_player:') && !p.startsWith('parent_dm:')))
  }

  // ── Save edit modal ──
  async function saveEdit() {
    if (!editMember || !teamId || !user) return
    setEditSaving(true)
    const tasks: Promise<any>[] = []
    // Role + position
    if (editRole !== editMember.role) tasks.push(teamService.updateMemberRole(editMember.id, editRole))
    if (editPosLabel !== (editMember.position_label || '')) {
      tasks.push(teamService.setLinkedPlayer(editMember.id, editMember.linked_player_id ?? null)) // keep linked_player_id as-is
    }
    // Update position_label separately if exists in service, otherwise just update role
    await supabaseUpdatePosLabel(editMember.id, editPosLabel)
    // Linked players for parents
    if (editRole === 'parent') {
      const existingDM = (allPerms[editMember.user_id] || []).filter(p => p.startsWith('parent_dm:'))
      const newPerms = [
        ...editLinkedPlayers.map(uid => `linked_player:${uid}`),
        ...existingDM
      ]
      tasks.push(permissionService.setUserPermissions(teamId, editMember.user_id, newPerms, user.id))
      // Also keep linked_player_id for first child (backward compat)
      tasks.push(teamService.setLinkedPlayer(editMember.id, editLinkedPlayers[0] ?? null))
    }
    await Promise.all(tasks)
    setAllPerms(prev => {
      const updated = { ...prev }
      if (editRole === 'parent') {
        const existingDM = (prev[editMember.user_id] || []).filter(p => p.startsWith('parent_dm:'))
        updated[editMember.user_id] = [
          ...editLinkedPlayers.map(uid => `linked_player:${uid}`),
          ...existingDM
        ]
      }
      return updated
    })
    setMembers(prev => prev.map(x => x.id === editMember.id ? { ...x, role: editRole, position_label: editPosLabel } : x))
    setEditSaving(false); setEditSaved(true)
    setTimeout(() => { setEditMember(null); setEditSaved(false) }, 800)
  }

  // Helper: update position_label via supabase directly
  async function supabaseUpdatePosLabel(memberId: string, label: string) {
    const { supabase } = await import('../../lib/supabase')
    return supabase.from('team_members').update({ position_label: label }).eq('id', memberId)
  }

  // ── Permissions tab (HR panel) ──
  function selectPermMember(m: any) {
    setPermSelMember(m)
    setPermSelRole(m.role)
    setPermSelPerms((allPerms[m.user_id] || []).filter(p => !p.startsWith('linked_player:') && !p.startsWith('parent_dm:')))
    setPermSaved(false)
  }

  async function savePermMember() {
    if (!permSelMember || !teamId || !user) return
    setPermSaving(true)
    const tasks: Promise<any>[] = []
    if (permSelRole !== permSelMember.role) tasks.push(teamService.updateMemberRole(permSelMember.id, permSelRole))
    // Keep linked_player and parent_dm perms untouched
    const otherPerms = (allPerms[permSelMember.user_id] || []).filter(p => p.startsWith('linked_player:') || p.startsWith('parent_dm:'))
    tasks.push(permissionService.setUserPermissions(teamId, permSelMember.user_id, [...permSelPerms, ...otherPerms], user.id))
    await Promise.all(tasks)
    setAllPerms(prev => ({ ...prev, [permSelMember.user_id]: [...permSelPerms, ...(prev[permSelMember.user_id] || []).filter(p => p.startsWith('linked_player:') || p.startsWith('parent_dm:'))] }))
    setMembers(prev => prev.map(x => x.id === permSelMember.id ? { ...x, role: permSelRole } : x))
    setPermSelMember((prev: any) => ({ ...prev, role: permSelRole }))
    setPermSaving(false); setPermSaved(true)
  }

  async function removeMember() {
    if (!confirmRemove) return
    await teamService.removeMember(confirmRemove.id)
    setMembers(m => m.filter(x => x.id !== confirmRemove.id))
    setConfirmRemove(null)
  }

  async function reviewRequest(req: any, status: 'approved' | 'rejected', role = 'player') {
    if (!teamId || !user) return
    await teamService.reviewJoinRequest(req.id, status, teamId, req.user_id, user.id, role)
    if (status === 'approved') {
      await notificationService.create({
        user_id: req.user_id, team_id: teamId,
        title: 'تمت الموافقة على طلب انضمامك', body: 'مرحباً بك في الفريق!',
        type: 'general', is_read: false
      })
    }
    setApproveReq(null); await load()
  }

  async function sendInvite() {
    if (!inviteForm.email.trim() || !teamId || !user) return
    setSaving(true)
    await inviteService.create({ ...inviteForm, team_id: teamId, invited_by: user.id })
    setShowInvite(false); setInviteForm({ email: '', role: 'player' }); setSaving(false)
  }

  const isAdmin = canManageTeam(myRole)
  const isOwner = myRole === 'owner'
  const visibleMembers = members.filter(m => isAdmin || (m.role !== 'parent' && m.is_visible !== false))
  const filtered = visibleMembers.filter(m => m.profile?.full_name?.includes(q))
  const players = members.filter(m => m.role === 'player')
  const nonOwnerMembers = members.filter(m => m.role !== 'owner')

  const tabs = [
    { key: 'members', label: `الأعضاء (${visibleMembers.length})` },
    ...(isAdmin ? [{ key: 'requests', label: 'طلبات الانضمام', badge: requests.length }] : []),
    ...(isOwner ? [{ key: 'permissions', label: '⚙️ إدارة الصلاحيات' }] : []),
  ]

  return (
    <div>
      <PageHeader title={`الأعضاء (${visibleMembers.length})`}
        action={isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
            <UserPlus size={14}/> دعوة
          </button>
        )} />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ══ MEMBERS TAB ══ */}
      {tab === 'members' && (
        <>
          <SearchBox placeholder="ابحث عن عضو..." value={q} onChange={setQ} />
          {loading ? <div className="flex justify-center py-10"><Spinner/></div>
            : filtered.length === 0 ? <div className="card"><EmptyState title="لا يوجد أعضاء"/></div>
            : <div className="card p-0 overflow-hidden divide-y divide-slate-50">
                {filtered.map(m => {
                  // linked children for parents
                  const linkedIds = (allPerms[m.user_id] || [])
                    .filter(p => p.startsWith('linked_player:'))
                    .map(p => p.replace('linked_player:', ''))
                  const linkedNames = linkedIds
                    .map(uid => members.find(x => x.user_id === uid)?.profile?.full_name)
                    .filter(Boolean)
                  const isPlayer = m.role === 'player'
                  const streak   = isPlayer ? teamStreaks.find(s => s.user_id === m.user_id) : null
                  const earned   = isPlayer ? teamBadges.filter(b => b.user_id === m.user_id) : []
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors">
                      <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="md"/>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-sm text-slate-800 truncate">{m.profile?.full_name || 'مجهول'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`badge text-xs ${roleColor[m.role] || 'bg-slate-100 text-slate-600'}`}>
                            {ROLE_LABELS[m.role] || m.role}
                          </span>
                          {m.position_label && <span className="text-xs text-slate-400">{m.position_label}</span>}
                          {m.role === 'parent' && linkedNames.length > 0 && (
                            <span className="text-xs text-brand-600 flex items-center gap-1">
                              <Link size={9}/> {linkedNames.join(' · ')}
                            </span>
                          )}
                          {/* Streak */}
                          {streak && streak.current_streak >= 2 && (
                            <span className="text-xs font-bold text-orange-500 flex items-center gap-0.5">
                              🔥{streak.current_streak}
                            </span>
                          )}
                        </div>
                        {/* Badges */}
                        {earned.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {earned.slice(0, 5).map((pb: any) => (
                              <span key={pb.id} className="text-base leading-none" title={pb.badge?.name || ''}>
                                {pb.badge?.icon}
                              </span>
                            ))}
                            {earned.length > 5 && (
                              <span className="text-[10px] text-slate-400">+{earned.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isAdmin && m.user_id !== user?.id && (
                          <>
                            <button onClick={() => openEdit(m)}
                              className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                              <Edit2 size={14}/>
                            </button>
                            <button onClick={() => setConfirmRemove(m)}
                              className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                              <Trash2 size={14}/>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>}
        </>
      )}

      {/* ══ JOIN REQUESTS TAB ══ */}
      {tab === 'requests' && (
        requests.length === 0
          ? <div className="card"><EmptyState title="لا توجد طلبات معلقة"/></div>
          : <div className="space-y-3">
              {requests.map(r => (
                <div key={r.id} className="card mb-0 border-r-4 border-amber-400">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.profile?.full_name || '?'} src={r.profile?.avatar_url} size="md"/>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm text-slate-800">{r.profile?.full_name}</div>
                      <div className="text-xs text-slate-400">⏳ {formatDate(r.created_at)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setApproveReq(r); setApproveRole('player') }}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all">
                        <CheckCircle size={13}/> قبول
                      </button>
                      <button onClick={() => reviewRequest(r,'rejected')}
                        className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 hover:bg-red-100 transition-all">
                        <XCircle size={13}/> رفض
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* ══ PERMISSIONS TAB (owner-only HR panel) ══ */}
      {tab === 'permissions' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
            <Shield size={12} className="inline ml-1"/>
            من هنا تتحكم في صلاحيات وأدوار كل عضو في الفريق — المالك يملك كل الصلاحيات دائماً.
          </div>
          <div className="grid md:grid-cols-[220px_1fr] gap-4">
            {/* Members list */}
            <div>
              <p className="text-xs font-bold text-slate-400 mb-2">الأعضاء ({nonOwnerMembers.length})</p>
              {loading ? <Spinner/> : (
                <div className="space-y-1.5">
                  {nonOwnerMembers.map(m => {
                    const count = (allPerms[m.user_id] || []).filter(p => !p.startsWith('linked_player:') && !p.startsWith('parent_dm:')).length
                    return (
                      <button key={m.id} onClick={() => selectPermMember(m)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${permSelMember?.id === m.id ? 'bg-brand-50 border-brand-400' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                        <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm"/>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{m.profile?.full_name}</div>
                          <div className="text-xs text-slate-400">{ROLE_LABELS[m.role] || m.role}</div>
                        </div>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Permissions panel */}
            <div>
              {!permSelMember ? (
                <div className="card text-center py-12 text-slate-400">
                  <Shield size={28} className="mx-auto mb-2 opacity-30"/>
                  <p className="text-sm">اختر عضواً لتعديل دوره وصلاحياته</p>
                </div>
              ) : (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={permSelMember.profile?.full_name || '?'} src={permSelMember.profile?.avatar_url} size="md"/>
                      <div>
                        <div className="font-bold text-sm">{permSelMember.profile?.full_name}</div>
                        <div className="text-xs text-slate-400">{ROLE_LABELS[permSelMember.role] || permSelMember.role}</div>
                      </div>
                    </div>
                    <button onClick={savePermMember} disabled={permSaving}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${permSaved ? 'bg-emerald-500 text-white' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                      {permSaving ? <Spinner size="sm"/> : permSaved ? <><Check size={14}/> محفوظ</> : <><Save size={14}/> حفظ</>}
                    </button>
                  </div>

                  {/* Role */}
                  <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 mb-2">المنصب</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES_NO_OWNER.map(r => (
                        <button key={r} onClick={() => { setPermSelRole(r); setPermSaved(false) }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${permSelRole === r ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                          {ROLE_LABELS[r] || r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => { setPermSelPerms(PERMISSIONS.map(p => p.key)); setPermSaved(false) }}
                      className="btn btn-ghost btn-sm text-xs">تحديد الكل</button>
                    <button onClick={() => { setPermSelPerms([]); setPermSaved(false) }}
                      className="btn btn-ghost btn-sm text-xs text-red-500 border-red-200">مسح الكل</button>
                    <span className="text-xs text-slate-400 flex items-center">{permSelPerms.length} صلاحية</span>
                  </div>
                  <div className="space-y-4">
                    {ROLE_GROUPS.map(group => (
                      <div key={group.label}>
                        <div className="text-xs font-bold text-slate-500 mb-2">{group.label}</div>
                        <div className="space-y-1.5">
                          {group.keys.map(key => {
                            const perm = PERMISSIONS.find(p => p.key === key)
                            if (!perm) return null
                            const active = permSelPerms.includes(key)
                            return (
                              <label key={key} onClick={() => { setPermSelPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]); setPermSaved(false) }}
                                className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200'}`}>
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                  {active && <Check size={11} className="text-white"/>}
                                </div>
                                <span className={`text-sm ${active ? 'font-bold text-emerald-800' : 'text-slate-600'}`}>{perm.label}</span>
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
      )}

      {/* ══ EDIT MEMBER MODAL ══ */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)}
        title={`تعديل — ${editMember?.profile?.full_name}`} width="max-w-lg">
        {editMember && (
          <>
            {/* Section tabs */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setEditSection('info')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${editSection === 'info' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600'}`}>
                👤 المعلومات والدور
              </button>
              <button onClick={() => setEditSection('perms')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${editSection === 'perms' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600'}`}>
                🔑 الصلاحيات
              </button>
            </div>

            {editSection === 'info' && (
              <>
                {/* Role selector */}
                <FormField label="المنصب">
                  <div className="grid grid-cols-3 gap-1.5">
                    {ROLES_NO_OWNER.map(r => (
                      <button key={r} type="button" onClick={() => { setEditRole(r); setEditSaved(false) }}
                        className={`p-2 rounded-xl border text-xs font-bold transition-all ${editRole === r ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {ROLE_LABELS[r] || r}
                      </button>
                    ))}
                  </div>
                </FormField>

                {/* Position label */}
                <FormField label="وصف إضافي (اختياري)">
                  <input className="form-input" value={editPosLabel} onChange={e => { setEditPosLabel(e.target.value); setEditSaved(false) }}
                    placeholder="مثال: كابتن الفريق، مدرب الحراس..."/>
                </FormField>

                {/* Linked children — shown when role is parent */}
                {editRole === 'parent' && (
                  <FormField label="الأبناء المرتبطون">
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 flex items-center justify-between border-b border-slate-100">
                        <span className="flex items-center gap-1.5"><Link size={11}/> ربط بلاعبين ({editLinkedPlayers.length} محدد)</span>
                        {editLinkedPlayers.length > 0 && (
                          <button onClick={() => { setEditLinkedPlayers([]); setEditSaved(false) }} className="text-red-500 text-xs hover:text-red-700">مسح الكل</button>
                        )}
                      </div>
                      {players.length === 0
                        ? <p className="text-xs text-slate-400 text-center py-4">لا يوجد لاعبون في الفريق</p>
                        : players.map(pl => {
                            const active = editLinkedPlayers.includes(pl.user_id)
                            return (
                              <div key={pl.id} onClick={() => {
                                setEditLinkedPlayers(prev => prev.includes(pl.user_id) ? prev.filter(x => x !== pl.user_id) : [...prev, pl.user_id])
                                setEditSaved(false)
                              }} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${active ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                  {active && <Check size={11} className="text-white"/>}
                                </div>
                                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {pl.profile?.full_name?.[0] || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold truncate">{pl.profile?.full_name}</div>
                                  {pl.position_label && <div className="text-xs text-slate-400">{pl.position_label}</div>}
                                </div>
                              </div>
                            )
                          })
                      }
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">ولي الأمر سيرى بيانات الحضور والنقاط لهؤلاء اللاعبين</p>
                  </FormField>
                )}
              </>
            )}

            {editSection === 'perms' && (
              <div className="space-y-3">
                <div className="flex gap-2 mb-1">
                  <button onClick={() => { setEditPerms(PERMISSIONS.map(p => p.key)); setEditSaved(false) }}
                    className="btn btn-ghost btn-sm text-xs">تحديد الكل</button>
                  <button onClick={() => { setEditPerms([]); setEditSaved(false) }}
                    className="btn btn-ghost btn-sm text-xs text-red-500 border-red-200">مسح الكل</button>
                  <span className="text-xs text-slate-400 flex items-center">{editPerms.length} صلاحية</span>
                </div>
                {ROLE_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-xs font-bold text-slate-500 mb-1.5">{group.label}</div>
                    <div className="space-y-1">
                      {group.keys.map(key => {
                        const perm = PERMISSIONS.find(p => p.key === key)
                        if (!perm) return null
                        const active = editPerms.includes(key)
                        return (
                          <label key={key} onClick={() => { setEditPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]); setEditSaved(false) }}
                            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all ${active ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100 hover:border-slate-200'}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                              {active && <Check size={9} className="text-white"/>}
                            </div>
                            <span className={`text-xs ${active ? 'font-bold text-emerald-800' : 'text-slate-600'}`}>{perm.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-slate-100">
              <button className="btn btn-ghost" onClick={() => setEditMember(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? <Spinner size="sm"/> : editSaved ? <><Check size={14}/> تم الحفظ</> : <><Save size={14}/> حفظ التعديلات</>}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ══ INVITE MODAL ══ */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="دعوة عضو جديد">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
          سيُضاف المدعو تلقائياً عند تسجيله بنفس البريد
        </div>
        <FormField label="البريد الإلكتروني" required>
          <input className="form-input" type="email" value={inviteForm.email}
            onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} placeholder="example@email.com"/>
        </FormField>
        <FormField label="الدور">
          <select className="form-input" value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}>
            {ROLES_NO_OWNER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowInvite(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={sendInvite} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmRemove} title="إزالة العضو" danger
        message={`هل تريد إزالة ${confirmRemove?.profile?.full_name} من الفريق؟`}
        onConfirm={removeMember} onCancel={() => setConfirmRemove(null)}/>

      {/* ══ APPROVE REQUEST MODAL ══ */}
      <Modal open={!!approveReq} onClose={() => setApproveReq(null)} title={`قبول — ${approveReq?.profile?.full_name}`}>
        <p className="text-sm text-slate-600 mb-4">اختر دور العضو في الفريق</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {ROLES_NO_OWNER.map(r => (
            <button key={r} onClick={() => setApproveRole(r)}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${approveRole === r ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
              {ROLE_LABELS[r] || r}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setApproveReq(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={() => reviewRequest(approveReq, 'approved', approveRole)}>
            <CheckCircle size={14}/> قبول كـ {ROLE_LABELS[approveRole]}
          </button>
        </div>
      </Modal>
    </div>
  )
}
