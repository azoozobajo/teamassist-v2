import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, leaveService, monthlyStarService, notificationService, pointsService, bestPlayerService } from '../../services'
import { Spinner, AttendanceButton, Modal, FormField } from '../../components/ui'
import { formatDate, EVENT_CONFIG, canManageTeam, isEventLocked, ROLE_LABELS, isParent } from '../../utils/helpers'
import { Copy, CheckCircle, Users, Calendar, Umbrella, ChevronLeft, TrendingUp, Swords, Star } from 'lucide-react'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export default function TeamDashboard() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam]         = useState<any>(null)
  const [members, setMembers]   = useState<any[]>([])
  const [weekEvents, setWeekEvents] = useState<any[]>([])
  const [matchResults, setMatchResults] = useState<any[]>([])
  const [leaves, setLeaves]     = useState<any[]>([])
  const [myRole, setMyRole]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [attStats, setAttStats] = useState({ present: 0, absent: 0, uncertain: 0, late: 0, total: 0 })
  const [weekAtts, setWeekAtts] = useState<Record<string, string>>({})

  // Monthly star
  const [monthlyStar, setMonthlyStar] = useState<any>(undefined)
  const [starHistory, setStarHistory] = useState<any[]>([])
  const [showStarHistory, setShowStarHistory] = useState(false)
  const [showStarModal, setShowStarModal] = useState(false)
  const [starForm, setStarForm] = useState({ userId: '', label: '', note: '', congratsMsg: '', announceAt: '', points: '0' })
  const [announceMode, setAnnounceMode] = useState<'immediate' | 'scheduled'>('immediate')
  const [starSaving, setStarSaving] = useState(false)
  const autoAnnounceDone = useRef(false)
  const [openPollsCount, setOpenPollsCount] = useState(0)
  const [myVotedPolls, setMyVotedPolls] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getTeam(teamId),
      teamService.getMembers(teamId),
      eventService.getUpcomingEvents(teamId, 5),
      teamService.getMyRole(teamId, user.id),
      leaveService.getAll(teamId),
      eventService.getMatchResults(teamId),
      eventService.getWeekEvents(teamId),
      eventService.getMyAttendance(teamId, user.id),
      monthlyStarService.getCurrent(teamId),
      monthlyStarService.getHistory(teamId),
    ]).then(([t, m, e, r, l, mr, we, myAttRecords, star, hist]) => {
      setTeam(t); setMembers(m); setMyRole(r || ''); setLeaves(l)
      setMatchResults(mr); setWeekEvents(we)
      setMonthlyStar(star ?? null)
      setStarHistory(hist ?? [])

      // Load open best-player polls for reminder (non-parent/non-guest only)
      if (r && r !== 'parent' && r !== 'guest') {
        bestPlayerService.getOpenPollsForTeam(teamId!).then(async polls => {
          setOpenPollsCount(polls.length)
          if (polls.length > 0 && user) {
            const voted = new Set<string>()
            await Promise.all(polls.map(async (p: any) => {
              const v = await bestPlayerService.getMyVote(p.id, user.id)
              if (v) voted.add(p.id)
            }))
            setMyVotedPolls(voted)
          }
        })
      }

      const attMap: Record<string, string> = {}
      ;(myAttRecords as any[]).forEach((a: any) => { attMap[a.event_id] = a.status })

      // Auto-present: week events with no attendance default to 'present'
      const allAutoEvs = [...(we as any[]), ...(e.length && !(we as any[]).find((w: any) => w.id === e[0].id) ? [e[0]] : [])]
      const noAtt = allAutoEvs.filter((ev: any) => !attMap[ev.id])
      if (noAtt.length > 0) {
        noAtt.forEach((ev: any) => { attMap[ev.id] = 'present' })
        noAtt.forEach((ev: any) => {
          eventService.setAttendance({ event_id: ev.id, team_id: teamId, user_id: user.id, status: 'present' })
        })
      }
      setWeekAtts(attMap)

      if (e.length) {
        setNextEvent(e[0])
        eventService.getAttendance(e[0].id).then(att => {
          setAttStats({
            present:   att.filter((a: any) => a.status === 'present').length,
            absent:    att.filter((a: any) => a.status === 'absent').length,
            uncertain: att.filter((a: any) => a.status === 'uncertain').length,
            late:      att.filter((a: any) => a.status === 'late').length,
            total:     att.length,
          })
        })
      }
      setLoading(false)
    })
  }, [teamId, user])

  const matchStats = useMemo(() => {
    const wins   = matchResults.filter(m => m.goals_for > m.goals_against).length
    const draws  = matchResults.filter(m => m.goals_for === m.goals_against).length
    const losses = matchResults.filter(m => m.goals_for < m.goals_against).length
    return { wins, draws, losses, total: matchResults.length }
  }, [matchResults])

  const copyCode = () => {
    navigator.clipboard?.writeText(team.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function setAttendance(eventId: string, status: string) {
    if (!user || !teamId) return
    const prev = weekAtts[eventId] ?? ''
    setWeekAtts(p => ({ ...p, [eventId]: status }))
    const { error } = await eventService.setAttendance({
      event_id: eventId, team_id: teamId, user_id: user.id, status
    })
    if (error) {
      setWeekAtts(p => ({ ...p, [eventId]: prev }))
    } else if (status === 'present' || status === 'late') {
      // Auto-points for self-attendance confirmation
      const ev = [...weekEvents, ...(nextEvent ? [nextEvent] : [])].find((e: any) => e.id === eventId)
      if (ev) pointsService.addAutoAttendancePoints(teamId, user.id, ev.event_type, eventId)
    }
  }

  useEffect(() => {
    if (!monthlyStar || monthlyStar.announced_at || autoAnnounceDone.current || !teamId || !user) return
    if (monthlyStar.announce_at && new Date(monthlyStar.announce_at) <= new Date()) {
      autoAnnounceDone.current = true
      monthlyStarService.announce(monthlyStar.id, teamId, monthlyStar.user_id).then(() => {
        setMonthlyStar((p: any) => ({ ...p, announced_at: new Date().toISOString() }))
        const name = monthlyStar.player?.full_name || ''
        const msg = monthlyStar.congrats_msg || `🌟 تهانينا لـ ${name} على حصوله على جائزة نجم الشهر! أداء رائع ويستحق التقدير 👏`
        notificationService.createForTeam(teamId, `⭐ نجم الشهر: ${name}`, msg, 'star', user.id)
      })
    }
  }, [monthlyStar?.id])

  async function saveMonthlyStar(announceNow: boolean) {
    if (!starForm.userId || !teamId || !user) return
    setStarSaving(true)
    const nowD = new Date()
    const isImmediate = announceNow || (!!starForm.announceAt && new Date(starForm.announceAt) <= nowD)
    const pts = parseInt(starForm.points) || 0
    const { data } = await monthlyStarService.set(teamId, starForm.userId, nowD.getMonth() + 1, nowD.getFullYear(), {
      label: starForm.label,
      note: starForm.note,
      congratsMsg: starForm.congratsMsg,
      announceAt: starForm.announceAt || null,
      announcedAt: isImmediate ? nowD.toISOString() : null,
      createdBy: user.id,
      pointsAwarded: pts,
    })
    if (data) {
      setMonthlyStar(data)
      if (isImmediate && data.player) {
        const name = data.player.full_name || ''
        const msg = starForm.congratsMsg || `🌟 تهانينا لـ ${name} على حصوله على جائزة نجم الشهر! أداء رائع ويستحق التقدير 👏`
        await notificationService.createForTeam(teamId, `⭐ نجم الشهر: ${name}`, msg, 'star', user.id)
        if (pts > 0) {
          await pointsService.addPoints([{
            team_id: teamId, user_id: starForm.userId, points: pts,
            category: 'مكافأة', reason: starForm.label || 'نجم الشهر', is_auto: false, created_by: user.id
          }])
        }
      }
    }
    setShowStarModal(false); setStarSaving(false)
  }

  async function announceMonthlyStar() {
    if (!monthlyStar?.id || !teamId || !user) return
    await monthlyStarService.announce(monthlyStar.id, teamId, monthlyStar.user_id)
    setMonthlyStar((p: any) => ({ ...p, announced_at: new Date().toISOString() }))
    const name = monthlyStar.player?.full_name || ''
    const msg = monthlyStar.congrats_msg || `🌟 تهانينا لـ ${name} على حصوله على جائزة نجم الشهر! أداء رائع ويستحق التقدير 👏`
    await notificationService.createForTeam(teamId, `⭐ نجم الشهر: ${name}`, msg, 'star', user.id)
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!team)   return <div className="card text-center py-10 text-slate-400">الفريق غير موجود</div>

  const pending  = leaves.filter(l => l.status === 'pending')
  const isAdmin  = canManageTeam(myRole)
  const amParent = isParent(myRole)
  const cfg      = nextEvent ? EVENT_CONFIG[nextEvent.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other : null
  const locked   = nextEvent ? isEventLocked(nextEvent.start_datetime) : false
  const attPct   = attStats.total ? Math.round(attStats.present / attStats.total * 100) : 0
  const weekList = weekEvents.filter(e => e.id !== nextEvent?.id)
  const now      = new Date()
  const isRevealed = monthlyStar && (
    (monthlyStar.announced_at && new Date(monthlyStar.announced_at) <= now) ||
    (monthlyStar.announce_at && new Date(monthlyStar.announce_at) <= now)
  )

  // For parents: only show attendance on meetings where they are named
  const parentCanAttend = (evt: any) => {
    if (!amParent) return true
    if (evt.event_type !== 'meeting') return false
    if (!evt.att_member_ids?.length) return true
    return (evt.att_member_ids as string[]).includes(user?.id || '')
  }

  // Relevant 7-day events for this member (used for the stat counter)
  const myWeekEvents = weekEvents.filter(e => amParent ? parentCanAttend(e) : true)

  return (
    <div className="animate-fade space-y-4">

      {/* ── Team Hero ── */}
      <div className="hero-card">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 left-4 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/25 flex items-center justify-center text-3xl font-extrabold overflow-hidden flex-shrink-0 border-2 border-white/30">
            {team.logo_url
              ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.name} />
              : team.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold truncate leading-tight">{team.name}</h1>
            <p className="text-sm text-white/80 mt-0.5">
              {team.sport_type} · {team.age_category} {team.city ? `· ${team.city}` : ''}
            </p>
            {myRole && (
              <span className="inline-block mt-2 bg-white/25 rounded-xl px-2.5 py-1 text-xs font-bold">
                {ROLE_LABELS[myRole] || myRole}
              </span>
            )}
            {isAdmin && team.invite_code && (
              <button onClick={copyCode}
                className="flex items-center gap-2 mt-3 bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-sm transition-colors border-none cursor-pointer">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                <span className="font-mono tracking-wider text-sm">{team.invite_code}</span>
                <span className="text-xs opacity-70">{copied ? '✓ تم النسخ' : 'نسخ'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-box cursor-pointer hover:border-blue-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/members`)}>
          <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Users size={20} className="text-blue-600" />
          </div>
          <div className="stat-value text-blue-600">{members.length}</div>
          <div className="stat-label">الأعضاء</div>
        </div>
        <div className="stat-box cursor-pointer hover:border-purple-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/events`)}>
          <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Calendar size={20} className="text-purple-600" />
          </div>
          <div className="stat-value text-purple-600">{myWeekEvents.length}</div>
          <div className="stat-label">مواعيد 7 أيام</div>
        </div>
        <div className="stat-box cursor-pointer hover:border-brand-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/attendance`)}>
          <div className="w-10 h-10 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <TrendingUp size={20} className="text-brand-600" />
          </div>
          <div className="stat-value text-brand-600">
            {attStats.total ? `${attPct}%` : '—'}
          </div>
          <div className="stat-label">حضور آخر موعد</div>
        </div>
        <div className={`stat-box cursor-pointer transition-all ${
            pending.length > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'hover:border-slate-200'
          }`}
          onClick={() => navigate(`/team/${teamId}/leaves`)}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2 ${
            pending.length > 0 ? 'bg-amber-200' : 'bg-slate-100'}`}>
            <Umbrella size={20} className={pending.length > 0 ? 'text-amber-700' : 'text-slate-500'} />
          </div>
          <div className={`stat-value ${pending.length > 0 ? 'text-amber-600' : ''}`}>{pending.length}</div>
          <div className="stat-label">طلبات إجازة</div>
        </div>
      </div>

      {/* ── Best Player Poll Reminder ── */}
      {openPollsCount > 0 && !amParent && (() => {
        const unvoted = openPollsCount - myVotedPolls.size
        return (
          <button onClick={() => navigate(`/team/${teamId}/best-player`)}
            className="w-full card flex items-center gap-3 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-2xl bg-amber-200 flex items-center justify-center text-xl flex-shrink-0">⭐</div>
            <div className="flex-1 min-w-0 text-right">
              <div className="font-extrabold text-sm text-amber-800">
                {unvoted > 0 ? `لم تصوّت بعد في ${unvoted} تصويت` : 'التصويتات المفتوحة'}
              </div>
              <div className="text-xs text-amber-600">{openPollsCount} تصويت مفتوح لأفضل لاعب · اضغط للتصويت</div>
            </div>
            {unvoted > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex-shrink-0">{unvoted}</span>
            )}
          </button>
        )
      })()}

      {/* ── Monthly Star Widget ── */}
      {monthlyStar !== undefined && (
        <div>
          {/* History toggle */}
          {showStarHistory && starHistory.length > 0 && (
            <div className="card mb-2 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">النجوم السابقون</span>
                <button onClick={() => setShowStarHistory(false)} className="text-xs text-slate-400 hover:text-slate-600">إخفاء ▲</button>
              </div>
              {starHistory.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-sm font-extrabold text-amber-700 overflow-hidden flex-shrink-0">
                    {s.player?.avatar_url ? <img src={s.player.avatar_url} className="w-full h-full object-cover" alt=""/> : s.player?.full_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-700 truncate">{s.player?.full_name}</div>
                    {s.label && <div className="text-xs text-slate-400 truncate">{s.label}</div>}
                  </div>
                  <div className="text-xs text-amber-600 font-bold flex-shrink-0">{MONTHS[s.month - 1]} {s.year}</div>
                </div>
              ))}
            </div>
          )}

          {/* No star yet */}
          {!monthlyStar ? (
            isAdmin ? (
              <button onClick={() => { setStarForm({ userId: '', label: '', note: '', congratsMsg: '', announceAt: '', points: '0' }); setShowStarModal(true) }}
                className="w-full flex flex-col items-center py-5 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
                <Star size={24} className="text-amber-400 mb-1" />
                <p className="text-sm font-bold text-amber-600">اختر نجم الشهر</p>
              </button>
            ) : (
              <div className="card text-center py-4">
                <div className="w-14 h-14 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-2xl text-slate-300">⭐</div>
                <p className="text-xs text-slate-400 mt-2 font-bold">لم يُختر نجم هذا الشهر بعد</p>
              </div>
            )
          ) : isRevealed ? (
            /* ── Revealed: premium gold card ── */
            <div className="relative overflow-hidden rounded-3xl" style={{ background: 'linear-gradient(135deg,#78350f 0%,#92400e 25%,#b45309 55%,#d97706 80%,#f59e0b 100%)', boxShadow: '0 8px 32px rgba(180,83,9,0.4)' }}>
              {/* Sparkle decorations */}
              <span className="absolute top-3 right-5 text-xl pointer-events-none animate-bounce" style={{ animationDelay: '0.1s' }}>⭐</span>
              <span className="absolute top-10 left-5 text-sm pointer-events-none animate-bounce" style={{ animationDelay: '0.5s' }}>✨</span>
              <span className="absolute bottom-5 right-10 text-base pointer-events-none animate-bounce" style={{ animationDelay: '0.8s' }}>⭐</span>
              <span className="absolute bottom-3 left-8 text-sm pointer-events-none animate-bounce" style={{ animationDelay: '0.3s' }}>✨</span>

              <div className="relative px-5 pt-4 pb-5 text-center">
                {/* Top row */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-amber-200 font-extrabold text-xs uppercase tracking-widest">⭐ نجم الشهر</span>
                  <div className="flex gap-2">
                    {starHistory.length > 0 && (
                      <button onClick={() => setShowStarHistory(p => !p)}
                        className="text-xs text-amber-200 hover:text-white font-bold transition-colors">🏅 السابقون</button>
                    )}
                    {isAdmin && (
                      <button onClick={() => { setStarForm({ userId: monthlyStar.user_id, label: monthlyStar.label || '', note: monthlyStar.note || '', congratsMsg: monthlyStar.congrats_msg || '', announceAt: monthlyStar.announce_at?.slice(0,16) || '', points: String(monthlyStar.points_awarded || 0) }); setShowStarModal(true) }}
                        className="text-xs text-amber-200 hover:text-white font-bold transition-colors">تعديل</button>
                    )}
                  </div>
                </div>

                {/* Avatar with glow ring */}
                <div className="relative w-24 h-24 mx-auto mb-3">
                  <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'rgba(251,191,36,0.7)' }}/>
                  <div className="relative w-full h-full rounded-full border-4 border-amber-300 overflow-hidden shadow-2xl bg-amber-200 flex items-center justify-center text-3xl font-extrabold text-amber-800">
                    {monthlyStar.player?.avatar_url
                      ? <img src={monthlyStar.player.avatar_url} className="w-full h-full object-cover" alt=""/>
                      : monthlyStar.player?.full_name?.[0]}
                  </div>
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">👑</span>
                </div>

                {/* Label */}
                {monthlyStar.label && (
                  <div className="text-amber-200 text-xs font-bold mb-1">{monthlyStar.label}</div>
                )}
                {/* Name */}
                <div className="text-white font-extrabold text-2xl leading-tight drop-shadow-md">
                  {monthlyStar.player?.full_name}
                </div>
                {/* Note */}
                {monthlyStar.note && (
                  <div className="text-amber-200 text-sm mt-1">{monthlyStar.note}</div>
                )}
                {/* Points badge */}
                {monthlyStar.points_awarded > 0 && (
                  <div className="inline-flex items-center gap-1 mt-2 bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                    🏆 +{monthlyStar.points_awarded} نقطة
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Pending reveal ── */
            <div className="relative overflow-hidden rounded-3xl" style={{ background: 'linear-gradient(135deg,#1e293b,#334155)', boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}>
              <div className="px-5 pt-4 pb-5 text-center">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-400 font-extrabold text-xs uppercase tracking-widest">⭐ نجم الشهر</span>
                  <div className="flex gap-2">
                    {starHistory.length > 0 && (
                      <button onClick={() => setShowStarHistory(p => !p)}
                        className="text-xs text-slate-400 hover:text-slate-200 font-bold transition-colors">🏅 السابقون</button>
                    )}
                    {isAdmin && (
                      <div className="flex gap-2">
                        {!monthlyStar.announced_at && (
                          <button onClick={announceMonthlyStar}
                            className="text-xs text-amber-400 hover:text-amber-300 font-bold transition-colors">⭐ أعلن</button>
                        )}
                        <button onClick={() => { setStarForm({ userId: monthlyStar.user_id, label: monthlyStar.label || '', note: monthlyStar.note || '', congratsMsg: monthlyStar.congrats_msg || '', announceAt: monthlyStar.announce_at?.slice(0,16) || '', points: String(monthlyStar.points_awarded || 0) }); setShowStarModal(true) }}
                          className="text-xs text-slate-400 hover:text-white font-bold transition-colors">تعديل</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-20 h-20 rounded-full bg-slate-700/80 mx-auto flex items-center justify-center text-4xl text-slate-400 animate-pulse mb-3 border-4 border-slate-600">?</div>
                {monthlyStar.label && <div className="text-amber-400 font-bold text-sm mb-1">{monthlyStar.label}</div>}
                <div className="text-slate-300 text-sm font-bold">سيتم الإعلان قريباً...</div>
                {monthlyStar.announce_at && (
                  <div className="text-slate-500 text-xs mt-1">
                    📅 {new Date(monthlyStar.announce_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Match Results Widget ── */}
      {matchStats.total > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Swords size={16} className="text-blue-600"/>
            </div>
            <h3 className="font-extrabold text-slate-800">نتائج المباريات</h3>
            <span className="badge badge-gray text-xs mr-auto">{matchStats.total} مباراة</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-emerald-600">{matchStats.wins}</div>
              <div className="text-xs font-bold text-emerald-500 mt-0.5">🏆 فوز</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{matchStats.draws}</div>
              <div className="text-xs font-bold text-amber-500 mt-0.5">🤝 تعادل</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-red-500">{matchStats.losses}</div>
              <div className="text-xs font-bold text-red-400 mt-0.5">❌ خسارة</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>نسبة الفوز</span>
              <span>{Math.round(matchStats.wins / matchStats.total * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.round(matchStats.wins / matchStats.total * 100)}%` }}/>
            </div>
          </div>
        </div>
      )}

      {/* ── Next Event ── */}
      {nextEvent && (
        <div className={`card border-r-4 ${cfg?.borderClass || 'border-brand-500'}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="text-3xl flex-shrink-0">{cfg?.icon}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-base text-slate-900 truncate">{nextEvent.title}</span>
                  {locked && <span className="badge badge-red">مغلق</span>}
                </div>
                {nextEvent.event_type === 'match' && nextEvent.opponent && (
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">⚔️ ضد: {nextEvent.opponent}</div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                  <Calendar size={13} className="flex-shrink-0" />
                  <span>{formatDate(nextEvent.start_datetime)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-bold text-slate-700">{nextEvent.start_datetime.slice(11, 16)}</span>
                </div>
              </div>
            </div>
            <span className="badge flex-shrink-0 py-1.5 px-3" style={{ background: cfg?.bg, color: cfg?.color }}>
              {cfg?.label}
            </span>
          </div>

          {attStats.total > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'حاضر',      val: attStats.present,   bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100' },
                { label: 'متأخر',     val: attStats.late,      bg: 'bg-orange-50',  color: 'text-orange-500',  border: 'border-orange-100'  },
                { label: 'غير متأكد', val: attStats.uncertain, bg: 'bg-amber-50',   color: 'text-amber-600',   border: 'border-amber-100'   },
                { label: 'غائب',      val: attStats.absent,    bg: 'bg-red-50',     color: 'text-red-500',     border: 'border-red-100'     },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-2.5 text-center`}>
                  <div className={`text-xl font-extrabold leading-none ${s.color}`}>{s.val}</div>
                  <div className={`text-[11px] mt-1 font-bold ${s.color} opacity-80`}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {parentCanAttend(nextEvent) && (
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-sm font-bold text-slate-600 mb-2.5">هل ستحضر هذا الموعد؟</p>
              <AttendanceButton
                status={weekAtts[nextEvent.id] ?? ''}
                locked={locked}
                onSelect={s => setAttendance(nextEvent.id, s)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 7-day events with attendance buttons ── */}
      {weekList.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-slate-800">📅 مواعيد الأسبوع القادم</h3>
            <button onClick={() => navigate(`/team/${teamId}/events`)}
              className="flex items-center gap-1 text-sm text-brand-600 font-bold hover:text-brand-700">
              عرض الكل <ChevronLeft size={15} />
            </button>
          </div>
          <div className="space-y-3">
            {weekList.map(e => {
              const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
              const evLocked = isEventLocked(e.start_datetime)
              const myStatus = weekAtts[e.id] ?? ''
              return (
                <div key={e.id} className={`card mb-0 border-r-4 ${c.borderClass}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 truncate">{e.title}</span>
                        {evLocked && <span className="badge badge-red text-xs">مغلق</span>}
                      </div>
                      {e.event_type === 'match' && e.opponent && (
                        <div className="text-xs text-slate-500 mt-0.5">⚔️ ضد: {e.opponent}</div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <Calendar size={11} className="flex-shrink-0"/>
                        <span>{formatDate(e.start_datetime)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold text-slate-600">{e.start_datetime.slice(11, 16)}</span>
                        {e.location && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="truncate max-w-[100px]">{e.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="badge text-xs flex-shrink-0" style={{ background: c.bg, color: c.color }}>
                      {c.label}
                    </span>
                  </div>

                  {parentCanAttend(e) && (
                    <div className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-xs font-bold text-slate-500 mb-2">هل ستحضر؟</p>
                      <AttendanceButton
                        status={myStatus}
                        locked={evLocked}
                        onSelect={s => setAttendance(e.id, s)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Monthly Star Admin Modal ── */}
      <Modal open={showStarModal} onClose={() => setShowStarModal(false)} title="نجم الشهر">
        <FormField label="التسمية" required>
          <input className="form-input font-bold" value={starForm.label}
            onChange={e => setStarForm(p => ({ ...p, label: e.target.value }))}
            placeholder="مثال: نجم شهر مايو"/>
        </FormField>
        <FormField label="اختر اللاعب" required>
          <select className="form-input" value={starForm.userId}
            onChange={e => setStarForm(p => ({ ...p, userId: e.target.value }))}>
            <option value="">-- اختر لاعباً --</option>
            {members.filter((m: any) => m.role === 'player').map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="وصف الإنجاز (اختياري)">
          <input className="form-input" value={starForm.note}
            onChange={e => setStarForm(p => ({ ...p, note: e.target.value }))}
            placeholder="أفضل مدافع، أكثر لاعب مجتهد..."/>
        </FormField>
        <FormField label="رسالة التهنئة (اختياري)">
          <textarea className="form-input" rows={2} value={starForm.congratsMsg}
            onChange={e => setStarForm(p => ({ ...p, congratsMsg: e.target.value }))}
            placeholder="ستُولَّد رسالة تلقائية إذا تركت فارغة..."/>
        </FormField>
        <FormField label="مكافأة نقاط (اختياري)">
          <div className="flex items-center gap-2">
            <input className="form-input" type="number" min="0" value={starForm.points}
              onChange={e => setStarForm(p => ({ ...p, points: e.target.value }))}
              placeholder="0"/>
            <span className="text-sm text-slate-500 whitespace-nowrap">نقطة تُضاف فور الإعلان</span>
          </div>
        </FormField>

        {/* Announce mode toggle */}
        <div className="flex gap-2 mb-1 mt-1">
          {(['immediate','scheduled'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => setAnnounceMode(mode)}
              className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
                announceMode === mode
                  ? mode === 'immediate' ? 'bg-amber-500 text-white border-amber-500' : 'bg-blue-500 text-white border-blue-500'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {mode === 'immediate' ? '⭐ أعلن مباشرة' : '📅 حدد تاريخ الإعلان'}
            </button>
          ))}
        </div>
        {announceMode === 'scheduled' && (
          <div className="mb-1">
            <input className="form-input" type="datetime-local" value={starForm.announceAt}
              onChange={e => setStarForm(p => ({ ...p, announceAt: e.target.value }))}/>
            <p className="text-xs text-slate-400 mt-1">يظهر "قريباً" للجميع ويُرسَل الإشعار تلقائياً عند الوصول للتاريخ المحدد</p>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowStarModal(false)}>إلغاء</button>
          <button className="btn btn-sm py-2 px-5"
            style={{ background: announceMode === 'immediate' ? '#f59e0b' : '#3b82f6', color: '#fff', border: 'none' }}
            onClick={() => saveMonthlyStar(announceMode === 'immediate')}
            disabled={!starForm.userId || !starForm.label.trim() || (announceMode === 'scheduled' && !starForm.announceAt) || starSaving}>
            {starSaving ? <Spinner size="sm"/> : announceMode === 'immediate' ? '⭐ أعلن الآن' : '📅 احفظ مجدول'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
