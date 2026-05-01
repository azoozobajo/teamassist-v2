import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star, Trophy, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { bestPlayerService, eventService, teamService, pointsService } from '../../services'
import { Spinner, PageHeader, EmptyState, Tabs, Modal, FormField } from '../../components/ui'
import { EVENT_CONFIG, formatDate } from '../../utils/helpers'

export default function BestPlayerPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [tab, setTab] = useState('vote')
  const [openPolls, setOpenPolls] = useState<any[]>([])
  const [awards, setAwards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [voteCounts, setVoteCounts] = useState<Record<string, Record<string, number>>>({})
  const [ptsAward, setPtsAward] = useState(10)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    // Get open polls (linked to events where I was present)
    const myAtt = await eventService.getMyAttendance(teamId, user.id)
    const presentEventIds = myAtt
      .filter((a: any) => a.status === 'present' || a.status === 'late')
      .map((a: any) => a.event_id)

    // Get polls
    const polls: any[] = []
    const vts: Record<string, string> = {}
    const counts: Record<string, Record<string, number>> = {}

    for (const evId of presentEventIds.slice(0, 10)) {
      const poll = await bestPlayerService.getPollForEvent(evId)
      if (poll && poll.status === 'open') {
        // Get event details
        const { data: ev } = await (await import('../../lib/supabase')).supabase
          .from('events').select('*').eq('id', evId).single()
        // Get present members for this event
        const att = await eventService.getAttendance(evId)
        const presentMembers = att.filter((a: any) => a.status === 'present' || a.status === 'late')
        polls.push({ ...poll, event: ev, presentMembers })
        // My vote
        const myVote = await bestPlayerService.getMyVote(poll.id, user.id)
        if (myVote) vts[poll.id] = myVote
        // Vote counts
        const allVotes = await bestPlayerService.getVotes(poll.id)
        const cnt: Record<string, number> = {}
        allVotes.forEach((v: any) => { cnt[v.nominee_id] = (cnt[v.nominee_id] || 0) + 1 })
        counts[poll.id] = cnt
      }
    }
    setOpenPolls(polls); setMyVotes(vts); setVoteCounts(counts)

    // Awards history
    const awardsList = await bestPlayerService.getTeamAwards(teamId)
    setAwards(awardsList)
    setLoading(false)
  }

  async function castVote(pollId: string, nomineeId: string) {
    if (!user) return
    await bestPlayerService.vote(pollId, user.id, nomineeId)
    setMyVotes(p => ({ ...p, [pollId]: nomineeId }))
    setVoteCounts(p => {
      const curr = { ...(p[pollId] || {}) }
      // Remove old vote if any
      const old = myVotes[pollId]
      if (old && curr[old]) curr[old]--
      curr[nomineeId] = (curr[nomineeId] || 0) + 1
      return { ...p, [pollId]: curr }
    })
  }

  async function closePoll(poll: any) {
    if (!teamId) return
    setSaving(poll.id)
    const counts = voteCounts[poll.id] || {}
    const maxVotes = Math.max(...Object.values(counts) as number[], 0)
    const winners = Object.entries(counts).filter(([, v]) => v === maxVotes).map(([uid]) => uid)
    if (winners.length === 0) { setSaving(null); return }
    // Award all tied winners
    for (const winnerId of winners) {
      await bestPlayerService.closePoll(poll.id, winnerId, teamId, ptsAward)
    }
    await load(); setSaving(null)
  }

  const isAdmin = myRole === 'owner' || ['head_coach','administrator'].includes(myRole)

  return (
    <div>
      <PageHeader title="⭐ أفضل لاعب"
        action={isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}>
            ⚙️ النقاط المُمنحة
          </button>
        )}/>
      <Tabs tabs={[
        { key:'vote', label:`التصويت (${openPolls.length})` },
        { key:'history', label:'سجل الجوائز' }
      ]} active={tab} onChange={setTab}/>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {tab === 'vote' && (
            openPolls.length === 0
              ? <div className="card"><EmptyState icon={<Star size={24}/>}
                  title="لا توجد تصويتات مفتوحة"
                  description="التصويت يُفتح تلقائياً بعد انتهاء كل موعد"/></div>
              : <div className="space-y-4">
                  {openPolls.map(poll => {
                    const cfg = EVENT_CONFIG[poll.event?.event_type] || EVENT_CONFIG.other
                    const myVote = myVotes[poll.id]
                    const counts = voteCounts[poll.id] || {}
                    const totalVotes = Object.values(counts).reduce((s: number, v: any) => s + v, 0)
                    const maxVotes = Math.max(...Object.values(counts) as number[], 0)
                    return (
                      <div key={poll.id} className="card">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">{cfg.icon}</span>
                          <div>
                            <div className="font-bold text-sm">{poll.event?.title}</div>
                            <div className="text-xs text-slate-400">{formatDate(poll.event?.start_datetime)}</div>
                          </div>
                          <span className="badge badge-gold mr-auto">{totalVotes} صوت</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">من كان أفضل لاعب في هذا الموعد؟ (الحاضرون فقط)</p>
                        <div className="space-y-2">
                          {poll.presentMembers.map((a: any) => {
                            const voteCount = counts[a.user_id] || 0
                            const pct = totalVotes ? Math.round(voteCount / totalVotes * 100) : 0
                            const isVoted = myVote === a.user_id
                            const isLeading = voteCount === maxVotes && maxVotes > 0
                            return (
                              <div key={a.user_id}
                                onClick={() => a.user_id !== user?.id && castVote(poll.id, a.user_id)}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${isVoted ? 'border-yellow-400 bg-yellow-50' : a.user_id === user?.id ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60' : 'border-slate-100 hover:border-slate-200'}`}>
                                <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {a.profile?.full_name?.[0] || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between text-xs mb-0.5">
                                    <span className="font-bold">{a.profile?.full_name} {a.user_id === user?.id ? '(أنت)' : ''}</span>
                                    <span className="text-slate-500">{voteCount} صوت · {pct}%</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${isLeading ? 'bg-yellow-400' : 'bg-slate-300'}`} style={{ width: `${pct}%` }}/>
                                  </div>
                                </div>
                                {isVoted && <Star size={16} className="text-yellow-500 flex-shrink-0 fill-yellow-400"/>}
                                {isLeading && !isVoted && <span className="text-xs text-yellow-600 flex-shrink-0">🏅</span>}
                              </div>
                            )
                          })}
                        </div>
                        {isAdmin && (
                          <button onClick={() => closePoll(poll)} disabled={saving === poll.id}
                            className="btn btn-ghost btn-sm w-full justify-center mt-3 text-amber-600 border-amber-200">
                            {saving === poll.id ? <Spinner size="sm"/> : `إغلاق التصويت ومنح ${ptsAward} نقطة للفائز`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
          )}

          {tab === 'history' && (
            awards.length === 0
              ? <div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا توجد جوائز بعد"/></div>
              : <div className="space-y-3">
                  {awards.map((a: any) => {
                    const cfg = EVENT_CONFIG[a.event?.event_type] || EVENT_CONFIG.other
                    return (
                      <div key={a.id} className="card mb-0 flex items-center gap-3">
                        <div className="text-2xl">🏆</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm">{a.winner?.full_name}</div>
                          <div className="text-xs text-slate-400">{cfg.icon} {a.event?.title} · {formatDate(a.closed_at)}</div>
                        </div>
                        <div className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded-lg font-bold">
                          +{a.points_awarded || 0} نقطة
                        </div>
                      </div>
                    )
                  })}
                </div>
          )}
        </>
      )}

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="إعداد نقاط أفضل لاعب">
        <FormField label="النقاط الممنوحة للفائز">
          <input className="form-input" type="number" min="1" value={ptsAward}
            onChange={e => setPtsAward(parseInt(e.target.value) || 10)}/>
        </FormField>
        <div className="text-xs text-slate-400 mt-2 mb-4">
          عند التعادل يحصل جميع الفائزين على نفس النقاط
        </div>
        <button className="btn btn-primary" onClick={() => setShowSettings(false)}>حفظ</button>
      </Modal>
    </div>
  )
}
