import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, Trophy, Check, Plus, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { bestPlayerService, eventService, teamService } from '../../services'
import { Spinner, PageHeader, EmptyState, Tabs, Modal, FormField } from '../../components/ui'
import { EVENT_CONFIG, formatDate, formatEventDate } from '../../utils/helpers'

function timeLeft(closesAt: string | null) {
  if (!closesAt) return null
  const diff = new Date(closesAt).getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}س ${m}د`
}

function isExpired(closesAt: string | null) {
  if (!closesAt) return false
  return new Date(closesAt).getTime() <= Date.now()
}

export default function BestPlayerPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [tab, setTab] = useState('vote')
  const [openPolls, setOpenPolls] = useState<any[]>([])
  const [expiredPolls, setExpiredPolls] = useState<any[]>([])
  const [awards, setAwards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [myVotes, setMyVotes] = useState<Record<string, Set<string>>>({})
  const [voteCounts, setVoteCounts] = useState<Record<string, Record<string, number>>>({})
  const [maxVotes, setMaxVotes] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsMaxVotes, setSettingsMaxVotes] = useState(1)
  const [ptsAward, setPtsAward] = useState(10)
  const [saving, setSaving] = useState<string | null>(null)
  const [voting, setVoting] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)

  // Close poll modal
  const [closeModal, setCloseModal] = useState<{ poll: any; announce: boolean } | null>(null)

  // Create poll modal (admin manual)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ eventId: '', closesAt: '' })
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getMyRole(teamId, user.id),
      teamService.getTeam(teamId),
    ]).then(([role, team]) => {
      const r = role || ''
      setMyRole(r)
      const mv = team?.best_player_max_votes ?? 1
      setMaxVotes(mv)
      setSettingsMaxVotes(mv)
      load(r)
    })
  }, [teamId, user])

  async function load(role: string) {
    if (!teamId || !user) return
    setLoading(true)

    if (role !== 'parent' && role !== 'guest') {
      const recent = await eventService.getRecentPastEvents(teamId, ['training', 'match'], 72)
      await Promise.all(recent.map(ev => bestPlayerService.ensurePoll(ev.id, teamId, ev.start_datetime)))
    }

    const allPolls = await bestPlayerService.getAllOpenPollsForTeam(teamId)
    const now = Date.now()

    const active: any[] = []
    const expired: any[] = []
    allPolls.forEach((p: any) => {
      if (!p.closes_at || new Date(p.closes_at).getTime() > now) active.push(p)
      else expired.push(p)
    })

    const vts: Record<string, Set<string>> = {}
    const counts: Record<string, Record<string, number>> = {}

    const processPolls = async (polls: any[]) => {
      const result: any[] = []
      await Promise.all(polls.map(async (poll: any) => {
        const [att, myVotesList, allVotes] = await Promise.all([
          eventService.getAttendance(poll.event_id),
          role === 'player' ? bestPlayerService.getMyVotes(poll.id, user.id) : Promise.resolve([]),
          bestPlayerService.getVotes(poll.id),
        ])
        const presentMembers = att.filter((a: any) => a.status === 'present' || a.status === 'late')
        result.push({ ...poll, presentMembers })
        vts[poll.id] = new Set(myVotesList as string[])
        const cnt: Record<string, number> = {}
        allVotes.forEach((v: any) => { cnt[v.nominee_id] = (cnt[v.nominee_id] || 0) + 1 })
        counts[poll.id] = cnt
      }))
      return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    const [activeProcessed, expiredProcessed] = await Promise.all([
      processPolls(active),
      processPolls(expired),
    ])

    setOpenPolls(activeProcessed)
    setExpiredPolls(expiredProcessed)
    setMyVotes(vts)
    setVoteCounts(counts)

    const awardsList = await bestPlayerService.getAllAwards(teamId)
    setAwards(awardsList)
    setLoading(false)
  }

  async function toggleVote(pollId: string, nomineeId: string) {
    if (!user || voting) return
    const current = myVotes[pollId] ?? new Set<string>()
    const alreadyVoted = current.has(nomineeId)
    setVoteError(null)
    setVoting(nomineeId)

    if (alreadyVoted) {
      const err = await bestPlayerService.removeVote(pollId, user.id, nomineeId)
      if (err) { setVoteError('فشل إلغاء التصويت، حاول مجدداً'); setVoting(null); return }
      setMyVotes(p => { const next = new Set(p[pollId]); next.delete(nomineeId); return { ...p, [pollId]: next } })
      setVoteCounts(p => { const cnt = { ...(p[pollId] || {}) }; if (cnt[nomineeId]) cnt[nomineeId]--; return { ...p, [pollId]: cnt } })
    } else {
      if (current.size >= maxVotes) { setVoting(null); return }
      const err = await bestPlayerService.vote(pollId, user.id, nomineeId)
      if (err) { setVoteError('فشل التصويت، تأكد من اتصالك وحاول مجدداً'); setVoting(null); return }
      setMyVotes(p => { const next = new Set(p[pollId]); next.add(nomineeId); return { ...p, [pollId]: next } })
      setVoteCounts(p => { const cnt = { ...(p[pollId] || {}) }; cnt[nomineeId] = (cnt[nomineeId] || 0) + 1; return { ...p, [pollId]: cnt } })
    }
    setVoting(null)
  }

  async function confirmClose(poll: any, announce: boolean) {
    if (!teamId || !user) return
    setSaving(poll.id)
    setCloseModal(null)
    const counts = voteCounts[poll.id] || {}
    const maxVoteCount = Math.max(...(Object.values(counts) as number[]), 0)
    const winners = Object.entries(counts).filter(([, v]) => v === maxVoteCount).map(([uid]) => uid)
    if (winners.length === 0) { setSaving(null); return }
    for (const winnerId of winners) {
      await bestPlayerService.closePoll(poll.id, winnerId, teamId, ptsAward, announce)
    }
    if (announce) {
      await bestPlayerService.announceResult(poll.id, teamId, user.id)
    }
    await load(myRole)
    setSaving(null)
  }

  async function loadRecentEvents() {
    if (!teamId) return
    const evs = await eventService.getRecentPastEvents(teamId, ['training', 'match'], 7 * 24)
    setRecentEvents(evs)
  }

  async function createManualPoll() {
    if (!teamId || !createForm.eventId || !createForm.closesAt) return
    setCreating(true)
    await bestPlayerService.createPoll({
      team_id: teamId,
      event_id: createForm.eventId,
      closes_at: new Date(createForm.closesAt).toISOString(),
    })
    setShowCreateModal(false)
    setCreateForm({ eventId: '', closesAt: '' })
    await load(myRole)
    setCreating(false)
  }

  async function saveSettings() {
    if (!teamId) return
    await teamService.updateTeam(teamId, { best_player_max_votes: settingsMaxVotes })
    setMaxVotes(settingsMaxVotes)
    setShowSettings(false)
  }

  const isAdmin = ['owner', 'head_coach', 'administrator'].includes(myRole)
  const canVote = myRole === 'player'
  const canSeeResults = canVote || isAdmin

  function renderPollCard(poll: any, expired = false) {
    const cfg = EVENT_CONFIG[poll.event?.event_type] || EVENT_CONFIG.other
    const counts = voteCounts[poll.id] || {}
    const totalVotes = Object.values(counts).reduce((s: number, v: any) => s + v, 0)
    const maxVoteCount = Math.max(...(Object.values(counts) as number[]), 0)
    const remaining = timeLeft(poll.closes_at)
    const myVotedSet = myVotes[poll.id] ?? new Set()
    const myVotedCount = myVotedSet.size
    const atMax = myVotedCount >= maxVotes

    return (
      <div key={poll.id} className="card">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <span className="text-2xl leading-none">{cfg.icon}</span>
            <span className="text-[9px] font-bold text-slate-400 leading-none">{cfg.label}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm truncate">{poll.event?.title}</div>
            <div className="text-xs text-slate-400">{formatEventDate(poll.event?.start_datetime)}</div>
          </div>
          {canSeeResults && (
            <span className="badge badge-gold text-xs">{totalVotes} صوت</span>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          {expired
            ? <span className="text-xs text-red-500 font-bold">⏰ انتهى وقت التصويت</span>
            : remaining
              ? <span className="text-xs text-amber-600 font-bold">⏱ {remaining} متبقية</span>
              : <span className="text-xs text-slate-400 font-bold">انتهت مدة التصويت</span>}
          {canVote && !expired && remaining && (
            <span className={`text-xs font-bold ${atMax ? 'text-brand-600' : 'text-slate-400'}`}>
              صوّتَ لـ {myVotedCount}/{maxVotes}
            </span>
          )}
          {!canVote && !isAdmin && (
            <span className="text-xs text-slate-400">التصويت للاعبين فقط</span>
          )}
        </div>

        {poll.presentMembers.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-3">لم يُسجَّل حضور لهذا الموعد</div>
        ) : (
          <div className="space-y-2">
            {poll.presentMembers
              .filter((a: any) => a.user_id !== user?.id)
              .map((a: any) => {
                const voteCount = counts[a.user_id] || 0
                const pct = totalVotes ? Math.round(voteCount / totalVotes * 100) : 0
                const isMyVote = myVotedSet.has(a.user_id)
                const isLeading = voteCount === maxVoteCount && maxVoteCount > 0
                const canTap = canVote && !expired && !!remaining && (isMyVote || !atMax)

                return (
                  <div key={a.user_id}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                      isMyVote
                        ? 'border-brand-400 bg-brand-50'
                        : canTap
                          ? 'border-slate-100 hover:border-slate-200'
                          : 'border-slate-50 bg-slate-50/50 opacity-70'
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0 overflow-hidden transition-all ${
                      isMyVote ? 'bg-brand-500 text-white shadow-md ring-2 ring-brand-300 ring-offset-1' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {a.profile?.avatar_url
                        ? <img src={a.profile.avatar_url} className="w-full h-full object-cover" alt=""/>
                        : a.profile?.full_name?.[0] || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-bold truncate ${isMyVote ? 'text-brand-800' : 'text-slate-800'}`}>
                          {a.profile?.full_name}
                        </span>
                        {canSeeResults && (
                          <span className="text-xs text-slate-400 flex-shrink-0 mr-1">
                            {voteCount} {isLeading ? '👑' : ''}
                          </span>
                        )}
                      </div>
                      {canSeeResults && (
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            isMyVote ? 'bg-brand-400' : isLeading ? 'bg-yellow-400' : 'bg-slate-200'
                          }`} style={{ width: `${pct}%` }}/>
                        </div>
                      )}
                    </div>

                    {canVote && !expired && remaining && (
                      <button
                        onClick={() => toggleVote(poll.id, a.user_id)}
                        disabled={voting === a.user_id || (!isMyVote && atMax)}
                        className={`flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all font-extrabold text-sm shadow-sm active:scale-95 ${
                          isMyVote
                            ? 'bg-brand-500 text-white shadow-brand-200'
                            : atMax
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : 'bg-slate-100 text-slate-500 hover:bg-brand-100 hover:text-brand-600 cursor-pointer'
                        }`}>
                        {voting === a.user_id
                          ? <Spinner size="sm"/>
                          : isMyVote
                            ? <Check size={18}/>
                            : <Star size={16}/>}
                      </button>
                    )}
                  </div>
                )
              })}
          </div>
        )}

        {isAdmin && expired && (
          <div className="mt-4 space-y-2">
            <button onClick={() => setCloseModal({ poll, announce: true })} disabled={saving === poll.id}
              className="btn btn-primary w-full justify-center text-sm">
              {saving === poll.id ? <Spinner size="sm"/> : `🏆 إغلاق مع إعلان النتيجة (+${ptsAward} نقطة)`}
            </button>
            <button onClick={() => setCloseModal({ poll, announce: false })} disabled={saving === poll.id}
              className="btn btn-ghost btn-sm w-full justify-center text-slate-500 border-slate-200">
              إغلاق بدون إعلان
            </button>
          </div>
        )}

        {isAdmin && !expired && remaining && (
          <button onClick={() => setCloseModal({ poll, announce: true })} disabled={saving === poll.id}
            className="btn btn-ghost btn-sm w-full justify-center mt-4 text-amber-600 border-amber-200 hover:bg-amber-50">
            {saving === poll.id ? <Spinner size="sm"/> : `إغلاق ومنح ${ptsAward} نقطة للفائز`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="⭐ أفضل لاعب"
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <button className="btn btn-ghost btn-sm" onClick={() => { loadRecentEvents(); setShowCreateModal(true) }}>
                <Plus size={16}/> إنشاء تصويت
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}>
                ⚙️ الإعدادات
              </button>
            )}
          </div>
        }/>

      <Tabs tabs={[
        { key:'vote', label:`التصويت (${openPolls.length + expiredPolls.length})` },
        { key:'history', label:'سجل الجوائز' }
      ]} active={tab} onChange={setTab}/>

      {voteError && (
        <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
          <span>{voteError}</span>
          <button onClick={() => setVoteError(null)}><X size={14}/></button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {tab === 'vote' && (
            openPolls.length === 0 && expiredPolls.length === 0
              ? <div className="card"><EmptyState icon={<Star size={24}/>}
                  title="لا توجد تصويتات مفتوحة"
                  description="التصويت يُفتح تلقائياً بعد انتهاء كل تمرين أو مباراة ويبقى مفتوحاً 48 ساعة"/></div>
              : <div className="space-y-4">
                  {openPolls.map(poll => renderPollCard(poll, false))}

                  {expiredPolls.length > 0 && isAdmin && (
                    <>
                      <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1 pt-2">
                        انتهت مدة التصويت — بانتظار الإغلاق
                      </div>
                      {expiredPolls.map(poll => renderPollCard(poll, true))}
                    </>
                  )}
                </div>
          )}

          {tab === 'history' && (
            awards.length === 0
              ? <div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا توجد جوائز بعد"/></div>
              : <div className="space-y-3">
                  {awards.map((a: any) => (
                    <div key={a.id} className="card mb-0 flex items-center gap-3">
                      <div className="text-2xl">{a.type === 'star' ? '⭐' : '🏆'}</div>
                      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden">
                        {a.player?.avatar_url
                          ? <img src={a.player.avatar_url} className="w-full h-full object-cover" alt=""/>
                          : a.player?.full_name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{a.player?.full_name}</div>
                        <div className="text-xs text-slate-400 truncate">{a.awardName} · {formatDate(a.date)}</div>
                      </div>
                      {a.points > 0 && (
                        <div className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded-lg font-bold flex-shrink-0">
                          +{a.points} نقطة
                        </div>
                      )}
                    </div>
                  ))}
                </div>
          )}
        </>
      )}

      {/* Confirm close modal */}
      <Modal open={!!closeModal} onClose={() => setCloseModal(null)} title="إغلاق التصويت">
        {closeModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {closeModal.announce
                ? 'سيتم منح النقاط للفائز وإرسال إشعار لجميع أعضاء الفريق بالنتيجة.'
                : 'سيتم إغلاق التصويت بهدوء دون إشعار أي عضو.'}
            </p>
            <FormField label="النقاط الممنوحة للفائز">
              <input className="form-input" type="number" min="0" value={ptsAward}
                onChange={e => setPtsAward(parseInt(e.target.value) || 0)}/>
            </FormField>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setCloseModal(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={() => confirmClose(closeModal.poll, closeModal.announce)}>
                {closeModal.announce ? '🏆 إغلاق مع إعلان' : 'إغلاق بهدوء'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create poll modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="إنشاء تصويت جديد">
        <FormField label="الحدث">
          <select className="form-input" value={createForm.eventId}
            onChange={e => setCreateForm(p => ({ ...p, eventId: e.target.value }))}>
            <option value="">-- اختر حدثاً --</option>
            {recentEvents.map((ev: any) => (
              <option key={ev.id} value={ev.id}>{ev.title} ({formatDate(ev.start_datetime)})</option>
            ))}
          </select>
        </FormField>
        <FormField label="تاريخ ووقت انتهاء التصويت">
          <input className="form-input" type="datetime-local" value={createForm.closesAt}
            onChange={e => setCreateForm(p => ({ ...p, closesAt: e.target.value }))}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>إلغاء</button>
          <button className="btn btn-primary" disabled={creating || !createForm.eventId || !createForm.closesAt}
            onClick={createManualPoll}>
            {creating ? <Spinner size="sm"/> : 'إنشاء'}
          </button>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="⚙️ إعدادات أفضل لاعب">
        <FormField label="النقاط الممنوحة للفائز">
          <input className="form-input" type="number" min="1" value={ptsAward}
            onChange={e => setPtsAward(parseInt(e.target.value) || 10)}/>
        </FormField>
        <FormField label="الحد الأقصى للأصوات لكل لاعب">
          <div className="flex gap-2">
            {[1, 2, 3].map(n => (
              <button key={n} type="button"
                onClick={() => setSettingsMaxVotes(n)}
                className={`flex-1 py-3 rounded-2xl border-2 text-sm font-extrabold transition-all ${
                  settingsMaxVotes === n
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {n === 1 ? '1 صوت' : n === 2 ? '2 أصوات' : '3 أصوات'}
              </button>
            ))}
          </div>
        </FormField>
        <div className="text-xs text-slate-400 mt-1 mb-4">
          تُطبَّق على التصويتات الجديدة · لا يمكن التصويت لنفس اللاعب مرتين · عند التعادل يحصل الجميع على النقاط
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveSettings}>حفظ</button>
        </div>
      </Modal>
    </div>
  )
}
