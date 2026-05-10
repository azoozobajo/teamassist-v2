import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Mail, Plus, Copy, CheckCircle, RefreshCw, Link, Trash2, UserCheck, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { inviteService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState } from '../../components/ui'
import { ROLE_LABELS, formatDate } from '../../utils/helpers'

const ALL_ROLES = ['head_coach','assistant_coach','player','administrator','media','medical','parent','guest']

function getInviteLink(token: string) {
  return `${window.location.origin}/join-team?invite=${token}`
}

export default function InvitePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [invites, setInvites] = useState<any[]>([])
  const [team, setTeam] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'player' })
  const [saving, setSaving] = useState(false)
  const [savedInvite, setSavedInvite] = useState<any>(null)  // last created invite (to show link)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState('')
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
    const { data, error, token } = await inviteService.create(teamId, form.email, form.role, user.id)
    if (!error && token) {
      setSavedInvite({ email: form.email, role: form.role, token })
    }
    await load(); setShowAdd(false); setForm({ email: '', role: 'player' }); setSaving(false)
  }

  async function cancelInvite(id: string) {
    await inviteService.cancelInvite(id)
    setInvites(prev => prev.filter(i => i.id !== id))
  }

  async function regenCode() {
    if (!teamId) return
    await teamService.regenerateCode(teamId)
    const t = await teamService.getTeam(teamId)
    setTeam(t); setRegenDone(true); setTimeout(() => setRegenDone(false), 2000)
  }

  function copyCode() {
    if (!team?.invite_code) return
    navigator.clipboard?.writeText(team.invite_code)
    setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000)
  }

  function copyLink(token: string) {
    navigator.clipboard?.writeText(getInviteLink(token))
    setCopiedLink(token); setTimeout(() => setCopiedLink(''), 2000)
  }

  const pending = invites.filter(i => i.status === 'pending')
  const accepted = invites.filter(i => i.status === 'accepted')

  return (
    <div>
      <PageHeader title="الدعوات"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={14}/> دعوة بالبريد
          </button>
        }/>

      {/* ── Newly created invite link ── */}
      {savedInvite && (
        <div className="card bg-emerald-50 border-emerald-300 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-emerald-600"/>
            <span className="font-bold text-emerald-800 text-sm">تم إنشاء الدعوة لـ {savedInvite.email}</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">انسخ الرابط وأرسله للشخص عبر واتساب أو البريد — سينضم مباشرة كـ <strong>{ROLE_LABELS[savedInvite.role]}</strong></p>
          <div className="bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 break-all mb-2">
            {getInviteLink(savedInvite.token)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => copyLink(savedInvite.token)} className="btn btn-sm btn-ghost flex-1 gap-1">
              {copiedLink === savedInvite.token ? <CheckCircle size={13} className="text-emerald-500"/> : <Copy size={13}/>}
              {copiedLink === savedInvite.token ? 'تم النسخ!' : 'نسخ الرابط'}
            </button>
            <button onClick={() => setSavedInvite(null)} className="btn btn-sm btn-ghost text-slate-400">✕</button>
          </div>
        </div>
      )}

      {/* ── Invite Code ── */}
      {team && (
        <div className="card bg-brand-50 border-brand-200 mb-5">
          <div className="font-bold text-sm text-brand-800 mb-1">📋 كود الدعوة العام</div>
          <div className="text-xs text-slate-500 mb-3">
            شارك هذا الكود — الشخص يدخله في التطبيق ثم يُرسَل طلب انضمام لك لتوافق وتحدد دوره
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border border-brand-200 rounded-xl px-4 py-2.5 font-mono font-bold tracking-[6px] text-brand-700 text-xl text-center">
              {team.invite_code}
            </div>
            <button onClick={copyCode} className="btn btn-ghost btn-sm gap-1">
              {copiedCode ? <CheckCircle size={14} className="text-emerald-500"/> : <Copy size={14}/>}
              {copiedCode ? 'تم' : 'نسخ'}
            </button>
            <button onClick={regenCode} title="تجديد الكود" className="btn btn-ghost btn-sm">
              <RefreshCw size={14} className={regenDone ? 'text-brand-500 animate-spin' : ''}/>
            </button>
          </div>
          <div className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            ⚠️ الانضمام بالكود يُنشئ طلب انضمام — ستوافق وتحدد الدور من صفحة الأعضاء
          </div>
        </div>
      )}

      {/* ── Pending invites ── */}
      <div className="font-bold text-sm mb-3 flex items-center gap-2">
        <Clock size={15} className="text-amber-500"/>
        الدعوات المعلقة ({pending.length})
      </div>
      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
        : pending.length === 0
          ? <div className="card mb-4"><EmptyState icon={<Mail size={24}/>} title="لا توجد دعوات معلقة" description="أرسل دعوة بالبريد للانضمام المباشر بدور محدد"/></div>
          : <div className="card p-0 divide-y divide-slate-50 mb-5">
              {pending.map(inv => (
                <div key={inv.id} className="flex items-start gap-3 p-3">
                  <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail size={16}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800" dir="ltr">{inv.email}</div>
                    <div className="text-xs text-slate-400 mb-2">
                      {ROLE_LABELS[inv.role] || inv.role} · {formatDate(inv.created_at)}
                    </div>
                    {/* Invite link with copy */}
                    {inv.token && (
                      <button onClick={() => copyLink(inv.token)}
                        className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 transition-colors">
                        {copiedLink === inv.token
                          ? <><CheckCircle size={12} className="text-emerald-500"/> تم نسخ الرابط!</>
                          : <><Link size={12}/> نسخ رابط الدعوة</>}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="badge bg-amber-100 text-amber-700">معلقة</span>
                    <button onClick={() => cancelInvite(inv.id)}
                      title="إلغاء الدعوة"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>}

      {/* ── Accepted invites ── */}
      {accepted.length > 0 && (
        <>
          <div className="font-bold text-sm mb-3 flex items-center gap-2">
            <UserCheck size={15} className="text-emerald-500"/>
            الدعوات المقبولة ({accepted.length})
          </div>
          <div className="card p-0 divide-y divide-slate-50">
            {accepted.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={16}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800" dir="ltr">{inv.email}</div>
                  <div className="text-xs text-slate-400">{ROLE_LABELS[inv.role] || inv.role} · {formatDate(inv.created_at)}</div>
                </div>
                <span className="badge bg-emerald-100 text-emerald-700">قبل الدعوة</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Create invite modal ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إرسال دعوة بالبريد">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
          <strong>كيف تعمل:</strong> ستحصل على رابط انسخه وأرسله للشخص عبر واتساب أو بريده — عند فتحه سينضم مباشرة بالدور الذي تختاره أنت الآن.
        </div>
        <FormField label="البريد الإلكتروني" required>
          <input className="form-input" type="email" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="example@email.com" dir="ltr"/>
        </FormField>
        <FormField label="الدور في الفريق">
          <div className="grid grid-cols-2 gap-2">
            {ALL_ROLES.map(r => (
              <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-right ${
                  form.role === r ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={sendInvite} disabled={saving || !form.email.trim()}>
            {saving ? <Spinner size="sm"/> : <><Plus size={14}/> إنشاء الدعوة</>}
          </button>
        </div>
      </Modal>
    </div>
  )
}
