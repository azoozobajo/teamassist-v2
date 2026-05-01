import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, inviteService, notificationService } from '../../services'
import { Spinner, PageHeader, SearchBox, Avatar, Modal, FormField, ConfirmDialog, EmptyState, Tabs } from '../../components/ui'
import { ROLE_LABELS, canManageTeam, formatDate } from '../../utils/helpers'

const ALL_ROLES = ['owner','head_coach','assistant_coach','player','administrator','media','medical','parent','guest']

export default function MembersPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('members')
  const [editMember, setEditMember] = useState<any>(null)
  const [editRole, setEditRole] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<any>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'player' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [m, r] = await Promise.all([
      teamService.getMembers(teamId),
      teamService.getJoinRequests(teamId)
    ])
    setMembers(m); setRequests(r); setLoading(false)
  }

  async function saveRole() {
    if (!editMember) return
    setSaving(true)
    const posLabel = (document.getElementById('edit-pos-label') as HTMLInputElement)?.value || ''
    await teamService.updateMemberRole(editMember.id, editRole)
    setMembers(m => m.map(x => x.id === editMember.id ? { ...x, role: editRole, position_label: posLabel } : x))
    setEditMember(null); setSaving(false)
  }

  async function removeMember() {
    if (!confirmRemove) return
    await teamService.removeMember(confirmRemove.id)
    setMembers(m => m.filter(x => x.id !== confirmRemove.id))
    setConfirmRemove(null)
  }

  async function reviewRequest(req: any, status: 'approved' | 'rejected') {
    if (!teamId || !user) return
    await teamService.reviewJoinRequest(req.id, status, teamId, req.user_id, user.id)
    if (status === 'approved') {
      await notificationService.create({
        user_id: req.user_id, team_id: teamId,
        title: 'تمت الموافقة على طلب انضمامك', body: 'مرحباً بك في الفريق!',
        type: 'general', is_read: false
      })
    }
    await load()
  }

  async function sendInvite() {
    if (!inviteForm.email.trim() || !teamId || !user) return
    setSaving(true)
    await inviteService.create({ ...inviteForm, team_id: teamId, invited_by: user.id })
    setShowInvite(false); setInviteForm({ email: '', role: 'player' }); setSaving(false)
  }

  const isAdmin = canManageTeam(myRole)
  const visibleMembers = members.filter(m => isAdmin || (m.role !== 'parent' && m.is_visible !== false))
  const filtered = visibleMembers.filter(m => m.profile?.full_name?.includes(q))
  const roleColor: Record<string, string> = {
    owner:'bg-emerald-100 text-emerald-800', head_coach:'bg-blue-100 text-blue-800',
    assistant_coach:'bg-sky-100 text-sky-800', player:'bg-slate-100 text-slate-600',
    administrator:'bg-purple-100 text-purple-800', media:'bg-amber-100 text-amber-700',
    medical:'bg-red-100 text-red-700', parent:'bg-pink-100 text-pink-700', guest:'bg-gray-100 text-gray-500'
  }

  return (
    <div>
      <PageHeader title={`الأعضاء (${visibleMembers.length})`}
        action={isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
            <UserPlus size={14}/> دعوة
          </button>
        )} />
      <Tabs
        tabs={[
          { key:'members', label:`الأعضاء (${visibleMembers.length})` },
          ...(isAdmin ? [{ key:'requests', label:'طلبات الانضمام', badge: requests.length }] : [])
        ]}
        active={tab} onChange={setTab} />

      {tab === 'members' && (
        <>
          <SearchBox placeholder="ابحث عن عضو..." value={q} onChange={setQ} />
          {loading ? <div className="flex justify-center py-10"><Spinner/></div>
            : filtered.length === 0 ? <div className="card"><EmptyState title="لا يوجد أعضاء"/></div>
            : <div className="card p-0 overflow-hidden divide-y divide-slate-50">
                {filtered.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors">
                    <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="md"/>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm text-slate-800 truncate">{m.profile?.full_name || 'مجهول'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`badge text-xs ${roleColor[m.role] || 'bg-slate-100 text-slate-600'}`}>
                          {ROLE_LABELS[m.role] || m.role}
                        </span>
                        {m.position_label && (
                          <span className="text-xs text-slate-400">{m.position_label}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {m.profile?.phone && (
                        <span className="text-xs text-slate-400 hidden sm:inline">{m.profile.phone}</span>
                      )}
                      {isAdmin && m.user_id !== user?.id && (
                        <>
                          <button onClick={() => { setEditMember(m); setEditRole(m.role) }}
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
                ))}
              </div>}
        </>
      )}

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
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <span>⏳</span> {formatDate(r.created_at)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewRequest(r,'approved')}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl border-none cursor-pointer hover:bg-emerald-600 active:scale-95 transition-all">
                        <CheckCircle size={13}/> قبول
                      </button>
                      <button onClick={() => reviewRequest(r,'rejected')}
                        className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 cursor-pointer hover:bg-red-100 transition-all">
                        <XCircle size={13}/> رفض
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
      )}

      <Modal open={!!editMember} onClose={() => setEditMember(null)} title={`تعديل دور — ${editMember?.profile?.full_name}`}>
        <div className="mb-4">
          <label className="form-label">وصف إضافي (اختياري)</label>
          <input className="form-input" id="edit-pos-label" placeholder="مثال: كابتن الفريق، مدرب الحراس..." defaultValue={editMember?.position_label || ''}/>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {ALL_ROLES.map(r => (
            <button key={r} onClick={() => setEditRole(r)}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${editRole===r ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
              {ROLE_LABELS[r] || r}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setEditMember(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveRole} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button>
        </div>
      </Modal>

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
            {ALL_ROLES.filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
    </div>
  )
}
