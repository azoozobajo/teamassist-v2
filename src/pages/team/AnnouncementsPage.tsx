import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { announcementService, teamService, notificationService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState } from '../../components/ui'
import { formatTimeAgo, canManageTeam } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

export default function AnnouncementsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [anns, setAnns] = useState<any[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showPoll, setShowPoll] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', announcement_type: 'general' })
  const [pollForm, setPollForm] = useState({ title: '', options: ['', ''], poll_limit: 1 })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()

    // Realtime for new announcements
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
    // Load votes for polls
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
    await announcementService.create({ ...form, team_id: teamId, is_poll: false, created_by: user.id })
    await notificationService.createForTeam(teamId, `إعلان: ${form.title}`, form.content, 'announcement', user.id)
    await load(); setShowAdd(false); setForm({ title: '', content: '', announcement_type: 'general' }); setSaving(false)
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
    // Update local vote counts
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
  const typeStyle: Record<string, string> = {
    general: 'bg-slate-100 text-slate-600', reminder: 'bg-blue-100 text-blue-700',
    news: 'bg-emerald-100 text-emerald-700', update: 'bg-amber-100 text-amber-700', poll: 'bg-purple-100 text-purple-700'
  }
  const typeLabel: Record<string, string> = {
    general: 'عام', reminder: 'تذكير', news: 'خبر', update: 'تحديث', poll: 'تصويت'
  }

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
        : anns.length === 0 ? <div className="card"><EmptyState title="لا توجد إعلانات"/></div>
        : <div className="space-y-3">
            {anns.map(a => (
              <div key={a.id} className="card mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`badge ${typeStyle[a.announcement_type] || 'bg-slate-100 text-slate-600'}`}>
                    {typeLabel[a.announcement_type] || a.announcement_type}
                  </span>
                  <span className="text-xs text-slate-400">{formatTimeAgo(a.created_at)}</span>
                  {isAdmin && (
                    <button onClick={() => deleteAnn(a.id)} className="mr-auto text-slate-300 hover:text-red-500 p-1">
                      <Trash2 size={13}/>
                    </button>
                  )}
                </div>
                <div className="font-bold text-sm mb-1">{a.title}</div>
                {a.content && <div className="text-xs text-slate-500 leading-relaxed mb-3">{a.content}</div>}

                {/* Poll */}
                {a.is_poll && a.poll_options && (
                  <div className="space-y-2">
                    {a.poll_options.map((opt: any, i: number) => {
                      const total = a.poll_options.reduce((s: number, o: any) => s + (o.votes || 0), 0)
                      const pct = total ? Math.round((opt.votes || 0) / total * 100) : 0
                      const voted = (userVotes[a.id] || []).includes(i)
                      return (
                        <div key={i} onClick={() => vote(a.id, i, a.poll_options, a.poll_limit || 1)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all ${voted ? 'border-brand-400 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`font-medium ${voted ? 'text-brand-700' : ''}`}>{opt.text}</span>
                            <span className="text-slate-400">{opt.votes || 0} · {pct}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                      )
                    })}
                    <div className="text-xs text-slate-400">
                      الاختيار: {a.poll_limit === 0 ? 'غير محدود' : a.poll_limit === 1 ? 'واحد فقط' : `حتى ${a.poll_limit}`}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <div className="w-5 h-5 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {a.profile?.full_name?.[0] || '?'}
                  </div>
                  <span className="text-xs text-slate-400">{a.profile?.full_name}</span>
                </div>
              </div>
            ))}
          </div>}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إعلان جديد">
        <FormField label="العنوان" required><input className="form-input" value={form.title} onChange={e => set('title', e.target.value)}/></FormField>
        <FormField label="النوع">
          <select className="form-input" value={form.announcement_type} onChange={e => set('announcement_type', e.target.value)}>
            <option value="general">عام</option><option value="reminder">تذكير</option>
            <option value="news">خبر</option><option value="update">تحديث</option>
          </select>
        </FormField>
        <FormField label="المحتوى"><textarea className="form-input" rows={3} value={form.content} onChange={e => set('content', e.target.value)}/></FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addAnn} disabled={saving}>{saving ? <Spinner size="sm"/> : 'نشر'}</button>
        </div>
      </Modal>

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
          <button className="btn btn-primary" onClick={addPoll} disabled={saving}>{saving ? <Spinner size="sm"/> : 'نشر التصويت'}</button>
        </div>
      </Modal>
    </div>
  )
}
