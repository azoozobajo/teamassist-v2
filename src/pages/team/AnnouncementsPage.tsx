import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { announcementService, teamService, notificationService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState } from '../../components/ui'
import { formatTimeAgo, canManageTeam, ROLE_LABELS } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

// ── فئات الجمهور المستهدف ──
const AUDIENCE_OPTIONS = [
  { value: 'player',           label: 'اللاعبون',          icon: '⚽' },
  { value: 'head_coach',       label: 'المدرب الرئيسي',    icon: '🎯' },
  { value: 'assistant_coach',  label: 'مدرب مساعد',        icon: '🏃' },
  { value: 'goalkeeper_coach', label: 'مدرب الحراس',       icon: '🥅' },
  { value: 'fitness_coach',    label: 'المعد البدني',       icon: '💪' },
  { value: 'medical',          label: 'الطاقم الطبي',      icon: '🏥' },
  { value: 'administrator',    label: 'الإدارة',            icon: '⚙️' },
  { value: 'parent',           label: 'أولياء الأمور',     icon: '👨‍👩‍👦' },
]

export default function AnnouncementsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [anns, setAnns]         = useState<any[]>([])
  const [members, setMembers]   = useState<any[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, number[]>>({})
  const [loading, setLoading]   = useState(true)
  const [myRole, setMyRole]     = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [showPoll, setShowPoll] = useState(false)
  const [form, setForm] = useState({
    title: '', content: '', announcement_type: 'general', target_roles: [] as string[]
  })
  const [pollForm, setPollForm] = useState({ title: '', options: ['', ''], poll_limit: 1 })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  function toggleRole(role: string) {
    setForm(p => ({
      ...p,
      target_roles: p.target_roles.includes(role)
        ? p.target_roles.filter(r => r !== role)
        : [...p.target_roles, role]
    }))
  }

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    load()

    const ch = supabase.channel(`ann:${teamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements', filter: `team_id=eq.${teamId}` },
        () => load())
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    const a = await announcementService.getAll(teamId)
    setAnns(a)
    const votes: Record<string, number[]> = {}
    for (const ann of a) {
      if (ann.is_poll) {
        const v = await announcementService.getVotes(ann.id, user.id)
        votes[ann.id] = v
      }
    }
    setUserVotes(votes)
    setLoading(false)
  }

  async function addAnn() {
    if (!form.title.trim() || !teamId || !user) return
    setSaving(true)

    const targetRoles = form.target_roles
    await announcementService.create({
      title: form.title,
      content: form.content,
      announcement_type: form.announcement_type,
      target_roles: targetRoles.length > 0 ? targetRoles : null,
      team_id: teamId, is_poll: false, created_by: user.id
    })

    // Send notifications only to targeted members
    const targetMembers = targetRoles.length === 0
      ? members
      : members.filter(m => targetRoles.includes(m.role))

    const notifInserts = targetMembers
      .filter(m => m.user_id !== user.id)
      .map(m => ({
        user_id: m.user_id,
        title: `إعلان: ${form.title}`,
        body: form.content || '',
        type: 'announcement',
        team_id: teamId,
        is_read: false,
      }))
    if (notifInserts.length > 0) {
      await supabase.from('notifications').insert(notifInserts)
    }

    await load()
    setShowAdd(false)
    setForm({ title: '', content: '', announcement_type: 'general', target_roles: [] })
    setSaving(false)
  }

  async function addPoll() {
    if (!pollForm.title.trim() || !teamId || !user) return
    const opts = pollForm.options.filter(o => o.trim()).map((text, i) => ({ id: String(i), text, votes: 0 }))
    if (opts.length < 2) return
    setSaving(true)
    await announcementService.create({
      title: pollForm.title, content: '', announcement_type: 'poll',
      team_id: teamId, is_poll: true, poll_options: opts,
      poll_limit: pollForm.poll_limit, created_by: user.id
    })
    await notificationService.createForTeam(teamId, `تصويت جديد: ${pollForm.title}`, '', 'poll', user.id)
    await load(); setShowPoll(false)
    setPollForm({ title: '', options: ['', ''], poll_limit: 1 }); setSaving(false)
  }

  async function vote(annId: string, optIdx: number, opts: any[], limit: number) {
    if (!user) return
    const myV = userVotes[annId] || []
    let newV: number[]
    if (myV.includes(optIdx)) {
      newV = myV.filter(v => v !== optIdx)
    } else {
      if (limit === 1) newV = [optIdx]
      else if (limit > 0 && myV.length >= limit) return
      else newV = [...myV, optIdx]
    }
    await announcementService.vote(annId, user.id, optIdx)
    setUserVotes(p => ({ ...p, [annId]: newV }))
    setAnns(prev => prev.map(a => {
      if (a.id !== annId) return a
      const newOpts = a.poll_options.map((o: any, i: number) => ({
        ...o, votes: i === optIdx ? (myV.includes(optIdx) ? o.votes - 1 : o.votes + 1) : o.votes
      }))
      return { ...a, poll_options: newOpts }
    }))
  }

  async function deleteAnn(id: string) {
    await announcementService.delete(id)
    setAnns(p => p.filter(a => a.id !== id))
  }

  const isAdmin = canManageTeam(myRole)

  // Filter visible announcements by target_roles
  const visibleAnns = anns.filter(a => {
    if (isAdmin) return true
    if (!a.target_roles || a.target_roles.length === 0) return true
    return a.target_roles.includes(myRole)
  })

  const typeStyle: Record<string, string> = {
    general: 'bg-slate-100 text-slate-600', reminder: 'bg-blue-100 text-blue-700',
    news: 'bg-emerald-100 text-emerald-700', update: 'bg-amber-100 text-amber-700', poll: 'bg-purple-100 text-purple-700'
  }
  const typeLabel: Record<string, string> = {
    general: 'عام', reminder: 'تذكير', news: 'خبر', update: 'تحديث', poll: 'تصويت'
  }
  const typeIcon: Record<string, string> = {
    general: '📢', reminder: '🔔', news: '📰', update: '🔄', poll: '🗳️'
  }
  const typeBorder: Record<string, string> = {
    general: 'border-r-4 border-slate-300', reminder: 'border-r-4 border-blue-400',
    news: 'border-r-4 border-emerald-400', update: 'border-r-4 border-amber-400', poll: 'border-r-4 border-purple-400'
  }

  const audienceLabel = (roles: string[]) =>
    roles.map(r => AUDIENCE_OPTIONS.find(o => o.value === r)?.label || ROLE_LABELS[r] || r).join('، ')

  return (
    <div>
      <PageHeader title="الإعلانات"
        action={isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPoll(true)}>🗳️ تصويت</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14}/> إعلان</button>
          </div>
        )}/>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : visibleAnns.length === 0 ? (
          <div className="card">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-4 text-3xl">📢</div>
              <p className="font-extrabold text-slate-600 text-base">لا توجد إعلانات</p>
              <p className="text-sm text-slate-400 mt-1">ستظهر هنا الإعلانات والتصويتات</p>
            </div>
          </div>
        )
        : <div className="space-y-3">
            {visibleAnns.map(a => (
              <div key={a.id} className={`card mb-0 ${typeBorder[a.announcement_type] || 'border-r-4 border-slate-300'}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
                    a.announcement_type === 'news' ? 'bg-emerald-50' :
                    a.announcement_type === 'reminder' ? 'bg-blue-50' :
                    a.announcement_type === 'update' ? 'bg-amber-50' :
                    a.is_poll ? 'bg-purple-50' : 'bg-slate-50'
                  }`}>
                    {typeIcon[a.announcement_type] || '📢'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`badge ${typeStyle[a.announcement_type] || 'bg-slate-100 text-slate-600'}`}>
                        {typeLabel[a.announcement_type] || a.announcement_type}
                      </span>
                      {/* Target badge */}
                      {a.target_roles && a.target_roles.length > 0 && (
                        <span className="badge bg-indigo-50 text-indigo-600 flex items-center gap-0.5 text-[11px]">
                          <Users size={9}/> {audienceLabel(a.target_roles)}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{formatTimeAgo(a.created_at)}</span>
                    </div>
                    <div className="font-extrabold text-sm text-slate-800">{a.title}</div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => deleteAnn(a.id)} className="text-slate-200 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0">
                      <Trash2 size={14}/>
                    </button>
                  )}
                </div>

                {a.content && <div className="text-sm text-slate-600 leading-relaxed mb-3 mr-13">{a.content}</div>}

                {/* Poll */}
                {a.is_poll && a.poll_options && (
                  <div className="space-y-2 mb-3">
                    {a.poll_options.map((opt: any, i: number) => {
                      const total = a.poll_options.reduce((s: number, o: any) => s + (o.votes || 0), 0)
                      const pct = total ? Math.round((opt.votes || 0) / total * 100) : 0
                      const voted = (userVotes[a.id] || []).includes(i)
                      return (
                        <div key={i} onClick={() => vote(a.id, i, a.poll_options, a.poll_limit || 1)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${voted ? 'border-brand-400 bg-brand-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className={`font-bold ${voted ? 'text-brand-700' : 'text-slate-700'}`}>{opt.text}</span>
                            <span className={`text-xs font-bold ${voted ? 'text-brand-500' : 'text-slate-400'}`}>{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${voted ? 'bg-brand-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }}/>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">{opt.votes || 0} صوت</div>
                        </div>
                      )
                    })}
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      🗳️ الاختيار المسموح: {a.poll_limit === 0 ? 'غير محدود' : a.poll_limit === 1 ? 'واحد فقط' : `حتى ${a.poll_limit}`}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                  <div className="w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {a.profile?.full_name?.[0] || '?'}
                  </div>
                  <span className="text-xs text-slate-400">{a.profile?.full_name}</span>
                </div>
              </div>
            ))}
          </div>}

      {/* ── Add Announcement Modal ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إعلان جديد">
        <FormField label="العنوان" required>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)}/>
        </FormField>
        <FormField label="النوع">
          <select className="form-input" value={form.announcement_type} onChange={e => set('announcement_type', e.target.value)}>
            <option value="general">عام</option>
            <option value="reminder">تذكير</option>
            <option value="news">خبر</option>
            <option value="update">تحديث</option>
          </select>
        </FormField>
        <FormField label="المحتوى">
          <textarea className="form-input" rows={3} value={form.content} onChange={e => set('content', e.target.value)}/>
        </FormField>

        {/* ── Target Audience ── */}
        <div className="form-group">
          <label className="form-label flex items-center gap-1.5">
            <Users size={13} className="text-slate-400"/> الجمهور المستهدف
          </label>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 mb-2">
              {form.target_roles.length === 0 ? '📢 سيصل لجميع الأعضاء' : `✅ سيصل لـ: ${audienceLabel(form.target_roles)}`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map(opt => {
                const active = form.target_roles.includes(opt.value)
                return (
                  <button key={opt.value} type="button"
                    onClick={() => toggleRole(opt.value)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      active
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>
                    <span>{opt.icon}</span> {opt.label}
                  </button>
                )
              })}
            </div>
            {form.target_roles.length > 0 && (
              <button type="button"
                onClick={() => set('target_roles', [])}
                className="text-[11px] text-red-400 hover:text-red-600 mt-2 border-none bg-transparent cursor-pointer underline">
                إلغاء التحديد — إرسال للجميع
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addAnn} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'نشر'}
          </button>
        </div>
      </Modal>

      {/* ── Poll Modal ── */}
      <Modal open={showPoll} onClose={() => setShowPoll(false)} title="إنشاء تصويت">
        <FormField label="السؤال" required>
          <input className="form-input" value={pollForm.title} onChange={e => setPollForm(p => ({ ...p, title: e.target.value }))}/>
        </FormField>
        <div className="form-group">
          <label className="form-label">الخيارات</label>
          {pollForm.options.map((opt, i) => (
            <input key={i} className="form-input mb-2" value={opt} placeholder={`الخيار ${i + 1}`}
              onChange={e => { const o = [...pollForm.options]; o[i] = e.target.value; setPollForm(p => ({ ...p, options: o })) }}/>
          ))}
          {pollForm.options.length < 10 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setPollForm(p => ({ ...p, options: [...p.options, ''] }))}>
              + إضافة خيار
            </button>
          )}
        </div>
        <FormField label="عدد الاختيارات المسموح بها">
          <select className="form-input" value={pollForm.poll_limit} onChange={e => setPollForm(p => ({ ...p, poll_limit: Number(e.target.value) }))}>
            <option value={1}>خيار واحد فقط</option>
            <option value={0}>غير محدود</option>
            <option value={2}>حتى 2</option>
            <option value={3}>حتى 3</option>
          </select>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowPoll(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addPoll} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'نشر التصويت'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
