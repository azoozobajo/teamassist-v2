import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Mail, Plus, Copy, CheckCircle, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { inviteService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState } from '../../components/ui'
import { ROLE_LABELS, formatDate } from '../../utils/helpers'

export default function InvitePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [invites, setInvites] = useState<any[]>([])
  const [team, setTeam] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'player' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenDone, setRegenDone] = useState(false)

  useEffect(() => {
    if (!teamId) return
    teamService.getTeam(teamId).then(setTeam)
    load()
  }, [teamId])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const i = await inviteService.getAll(teamId)
    setInvites(i); setLoading(false)
  }

  async function sendInvite() {
    if (!form.email.trim() || !teamId || !user) return
    setSaving(true)
    await inviteService.create({ team_id: teamId, email: form.email, role: form.role, invited_by: user.id })
    await load(); setShowAdd(false); setForm({ email: '', role: 'player' }); setSaving(false)
  }

  async function regenCode() {
    if (!teamId) return
    await teamService.regenerateCode(teamId)
    const t = await teamService.getTeam(teamId)
    setTeam(t); setRegenDone(true); setTimeout(() => setRegenDone(false), 2000)
  }

  function copyCode() {
    navigator.clipboard?.writeText(team.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const ALL_ROLES = ['head_coach','assistant_coach','player','administrator','media','medical','parent','guest']

  return (
    <div>
      <PageHeader title="الدعوات"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14}/> دعوة بالبريد</button>}/>

      {/* Invite Code */}
      {team && (
        <div className="card bg-brand-50 border-brand-200 mb-5">
          <div className="font-bold text-sm text-brand-800 mb-1">كود الدعوة</div>
          <div className="text-xs text-slate-500 mb-3">شارك هذا الكود مع من تريد دعوته للانضمام</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border border-brand-200 rounded-xl px-4 py-2.5 font-mono font-bold tracking-widest text-brand-700 text-lg">
              {team.invite_code}
            </div>
            <button onClick={copyCode} className="btn btn-ghost btn-sm gap-1">
              {copied ? <CheckCircle size={14} className="text-emerald-500"/> : <Copy size={14}/>}
              {copied ? 'تم' : 'نسخ'}
            </button>
            <button onClick={regenCode} className="btn btn-ghost btn-sm" title="تجديد الكود">
              <RefreshCw size={14} className={regenDone ? 'text-brand-500' : ''}/>
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {team.require_approval ? '⚠️ يتطلب موافقة المسؤول' : '✅ انضمام مباشر'}
          </div>
        </div>
      )}

      {/* Invites list */}
      <div className="font-bold text-sm mb-3">الدعوات المرسلة بالبريد</div>
      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
        : invites.length === 0
          ? <div className="card"><EmptyState icon={<Mail size={24}/>} title="لا توجد دعوات مرسلة" description="أرسل دعوة بالبريد للانضمام المباشر"/></div>
          : <div className="card p-0 divide-y divide-slate-50">
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail size={16}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" dir="ltr">{inv.email}</div>
                    <div className="text-xs text-slate-400">{ROLE_LABELS[inv.role] || inv.role} · {formatDate(inv.created_at)}</div>
                  </div>
                  <span className={`badge ${inv.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {inv.status === 'accepted' ? 'قبل الدعوة' : 'معلق'}
                  </span>
                </div>
              ))}
            </div>}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إرسال دعوة بالبريد">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
          عند تسجيل المدعو بنفس البريد يُضاف تلقائياً للفريق بالدور المحدد
        </div>
        <FormField label="البريد الإلكتروني" required>
          <input className="form-input" type="email" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="example@email.com"/>
        </FormField>
        <FormField label="الدور في الفريق">
          <select className="form-input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={sendInvite} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'إرسال الدعوة'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
