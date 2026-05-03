import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, leaveService, monthlyStarService, notificationService, pointsService, bestPlayerService } from '../../services'
import { Spinner, AttendanceButton, Modal, FormField } from '../../components/ui'
import { formatEventDate, EVENT_CONFIG, canManageTeam, isEventLocked, ROLE_LABELS, isParent } from '../../utils/helpers'
import { Copy, CheckCircle, Users, Calendar, Umbrella, ChevronLeft, ChevronRight, TrendingUp, Swords } from 'lucide-react'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function computeStats(att: any[]) {
  return {
    present:   att.filter(a => a.status === 'present').length,
    absent:    att.filter(a => a.status === 'absent').length,
    uncertain: att.filter(a => a.status === 'uncertain').length,
    late:      att.filter(a => a.status === 'late').length,
    total:     att.length,
  }
}

export default function TeamDashboard() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [team, setTeam]           = useState<any>(null)
  const [members, setMembers]     = useState<any[]>([])
  const [weekEvents, setWeekEvents] = useState<any[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [carouselStatsMap, setCarouselStatsMap] = useState<Record<string, ReturnType<typeof computeStats>>>({})
  const [matchResults, setMatchResults] = useState<any[]>([])
  const [leaves, setLeaves]       = useState<any[]>([])
  const [myRole, setMyRole]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [copied, setCopied]       = useState(false)
  const [weekAtts, setWeekAtts]   = useState<Record<string, string>>({})

  // Monthly star
  const [monthlyStar, setMonthlyStar]     = useState<any>(undefined)
  const [starHistory, setStarHistory]     = useState<any[]>([])
  const [showStarHistory, setShowStarHistory] = useState(false)
  const [showStarModal, setShowStarModal] = useState(false)
  const [starForm, setStarForm]   = useState({ userId: '', label: '', note: '', congratsMsg: '', announceAt: '', points: '0' })
  const [announceMode, setAnnounceMode]   = useState<'immediate' | 'scheduled'>('immediate')
  const [starSaving, setStarSaving]       = useState(false)
  const autoAnnounceDone = useRef(false)

  const [openPollsCount, setOpenPollsCount] = useState(0)
  const [myVotedPolls, setMyVotedPolls]   = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getTeam(teamId),
      teamService.getMembers(teamId),
      eventService.getUpcomingEvents(teamId, 10),
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
      setUpcomingEvents(e as any[])
      setMonthlyStar(star ?? null)
      setStarHistory(hist ?? [])

      // Open best-player polls (all members)
      bestPlayerService.getOpenPollsForTeam(teamId!).then(async polls => {
        setOpenPollsCount(polls.length)
        if (polls.length > 0 && user && r === 'player') {
          const voted = new Set<string>()
          await Promise.all(polls.map(async (p: any) => {
            const v = await bestPlayerService.getMyVote(p.id, user.id)
            if (v) voted.add(p.id)
          }))
          setMyVotedPolls(voted)
        }
      })

      const attMap: Record<string, string> = {}
      ;(myAttRecords as any[]).forEach((a: any) => { attMap[a.event_id] = a.status })

      // Auto-present: upcoming + week events with no attendance
      const allAutoEvs = [
        ...(we as any[]),
        ...(e as any[]).filter((ev: any) => !(we as any[]).find((w: any) => w.id === ev.id)),
      ]
      const noAtt = allAutoEvs.filter((ev: any) => !attMap[ev.id])
      if (noAtt.length > 0) {
        noAtt.forEach((ev: any) => { attMap[ev.id] = 'present' })
        noAtt.forEach((ev: any) => {
          eventService.setAttendance({ event_id: ev.id, team_id: teamId, user_id: user.id, status: 'present' })
        })
      }
      setWeekAtts(attMap)
      setLoading(false)

      // Load attendance stats for all upcoming events in background
      if ((e as any[]).length) {
        Promise.all((e as any[]).map((ev: any) => eventService.getAttendance(ev.id))).then(statsArr => {
          const map: Record<string, ReturnType<typeof computeStats>> = {}
          ;(e as any[]).forEach((ev: any, i: number) => { map[ev.id] = computeStats(statsArr[i] as any[]) })
          setCarouselStatsMap(map)
        })
      }
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
      const ev = [...upcomingEvents, ...weekEvents].find((e: any) => e.id === eventId)
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
      label: starForm.label, note: starForm.note, congratsMsg: starForm.congratsMsg,
      announceAt: starForm.announceAt || null,
      announcedAt: isImmediate ? nowD.toISOString() : null,
      createdBy: user.id, pointsAwarded: pts,
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
  const now      = new Date()

  const isRevealed = monthlyStar && (
    (monthlyStar.announced_at && new Date(monthlyStar.announced_at) <= now) ||
    (monthlyStar.announce_at  && new Date(monthlyStar.announce_at)  <= now)
  )

  const canAttend = (evt: any) => {
    if (!isAdmin && !amParent) return true
    if (evt.event_type !== 'meeting') return false
    if (!evt.att_member_ids?.length) return true
    return (evt.att_member_ids as string[]).includes(user?.id || '')
  }

  const myWeekEvents = weekEvents.filter(e => canAttend(e))

  // Stats grid: attendance % for first upcoming event
  const firstStats = upcomingEvents.length > 0 ? carouselStatsMap[upcomingEvents[0].id] : null
  const attPct = firstStats?.total ? Math.round(firstStats.present / firstStats.total * 100) : 0

  // Carousel: events requiring attendance come first, then by date
  const carouselEvents = [...upcomingEvents].sort((a, b) => {
    const ap = canAttend(a) ? 0 : 1
    const bp = canAttend(b) ? 0 : 1
    if (ap !== bp) return ap - bp
    return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  })

  const safeIdx = Math.min(carouselIdx, Math.max(0, carouselEvents.length - 1))
  const carouselEvent  = carouselEvents[safeIdx] ?? null
  const carouselStats  = carouselEvent ? (carouselStatsMap[carouselEvent.id] ?? null) : null
  const carouselCfg    = carouselEvent ? (EVENT_CONFIG[carouselEvent.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other) : null
  const carouselLocked = carouselEvent ? isEventLocked(carouselEvent.start_datetime) : false

  function navigateCarousel(dir: number) {
    const newIdx = safeIdx + dir
    if (newIdx < 0 || newIdx >= carouselEvents.length) return
    setCarouselIdx(newIdx)
  }

  return (
    <div className="animate-fade space-y-4">

      {/* ── Team Hero + Monthly Star ── */}
      <div className="hero-card">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 left-4 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />

        <div className="relative flex items-start gap-3">

          {/* Team logo */}
          <div className="w-14 h-14 rounded-2xl bg-white/25 flex items-center justify-center text-2xl font-extrabold overflow-hidden flex-shrink-0 border-2 border-white/30">
            {team.logo_url
              ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.name} />
              : team.name[0]}
          </div>

          {/* Team info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold truncate leading-tight">{team.name}</h1>
            <p className="text-xs text-white/80 mt-0.5 truncate">
              {team.sport_type} · {team.age_category}{team.city ? ` · ${team.city}` : ''}
            </p>
            {myRole && (
              <span className="inline-block mt-1.5 bg-white/25 rounded-xl px-2 py-0.5 text-xs font-bold">
                {ROLE_LABELS[myRole] || myRole}
              </span>
            )}
            {isAdmin && team.invite_code && (
              <button onClick={copyCode}
                className="flex items-center gap-1.5 mt-2 bg-white/20 hover:bg-white/30 rounded-xl px-2.5 py-1 text-xs transition-colors border-none cursor-pointer">
                {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                <span className="font-mono tracking-wider text-xs">{team.invite_code}</span>
                <span className="text-[10px] opacity-70">{copied ? '✓' : 'نسخ'}</span>
              </button>
            )}
          </div>

          {/* Divider */}
          {monthlyStar !== undefined && (
            <div className="w-px self-stretch bg-white/20 flex-shrink-0 mx-0.5" />
          )}

          {/* ── Monthly Star compact (inside hero) ── */}
          {monthlyStar !== undefined && (
            <div className="flex-shrink-0 w-[108px] flex flex-col items-center text-center gap-1">

              {/* Title row */}
              <div className="flex items-center justify-between w-full gap-1">
                <span className="text-[10px] font-extrabold text-amber-300/90 leading-none">👑 نجم الشهر</span>
                <div className="flex gap-1.5 flex-shrink-0">
                  {starHistory.length > 0 && (
                    <button onClick={() => setShowStarHistory(p => !p)}
                      className="text-[10px] text-white/50 hover:text-white/90 transition-colors leading-none">🏅</button>
                  )}
                  {isAdmin && monthlyStar && !monthlyStar.announced_at && (
                    <button onClick={announceMonthlyStar}
                      className="text-[10px] text-amber-300 hover:text-white transition-colors font-bold leading-none">أعلن</button>
                  )}
                </div>
              </div>

              {!monthlyStar ? (
                isAdmin ? (
                  <button
                    onClick={() => { setStarForm({ userId: '', label: '', note: '', congratsMsg: '', announceAt: '', points: '0' }); setShowStarModal(true) }}
                    className="flex flex-col items-center gap-1 opacity-50 hover:opacity-90 transition-all active:scale-95 w-full pt-0.5">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-xl text-white/30">⭐</div>
                    <span className="text-white/50 text-[10px] font-bold">اختر نجم الشهر</span>
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-1 opacity-40 pt-0.5">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl text-white/30">⭐</div>
                    <span className="text-white/40 text-[10px]">لم يُختر بعد</span>
                  </div>
                )
              ) : isRevealed ? (
                <div
                  className={`flex flex-col items-center gap-0.5 w-full ${isAdmin ? 'cursor-pointer hover:scale-105 active:scale-95 transition-transform' : ''}`}
                  onClick={isAdmin ? () => {
                    setStarForm({ userId: monthlyStar.user_id, label: monthlyStar.label || '', note: monthlyStar.note || '', congratsMsg: monthlyStar.congrats_msg || '', announceAt: monthlyStar.announce_at?.slice(0,16) || '', points: String(monthlyStar.points_awarded || 0) })
                    setShowStarModal(true)
                  } : undefined}>
                  {/* Gold gradient ring avatar */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f59e0b, #fde68a, #d97706, #f59e0b)',
                    padding: '2.5px', borderRadius: '50%',
                    boxShadow: '0 0 14px rgba(245,158,11,0.6), 0 0 28px rgba(245,158,11,0.2)',
                  }} className="w-14 h-14 flex-shrink-0">
                    <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-lg font-extrabold text-white bg-amber-900/50">
                      {monthlyStar.player?.avatar_url
                        ? <img src={monthlyStar.player.avatar_url} className="w-full h-full object-cover" alt=""/>
                        : monthlyStar.player?.full_name?.[0]}
                    </div>
                  </div>
                  <div className="text-white font-extrabold text-[11px] leading-tight truncate w-full mt-0.5">
                    {monthlyStar.player?.full_name}
                  </div>
                  {monthlyStar.label && (
                    <div className="text-amber-300 text-[9px] truncate w-full">{monthlyStar.label}</div>
                  )}
                  {(monthlyStar.points_awarded ?? 0) > 0 && (
                    <div className="bg-white/15 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5">
                      +{monthlyStar.points_awarded} نقطة
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-0.5 w-full pt-0.5">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white/40 animate-pulse border border-white/20">?</div>
                  {monthlyStar.label && (
                    <div className="text-amber-300/80 text-[9px] font-bold truncate w-full">{monthlyStar.label}</div>
                  )}
                  <div className="text-white/40 text-[9px]">قريباً...</div>
                  {isAdmin && !monthlyStar.announced_at && (
                    <button onClick={announceMonthlyStar}
                      className="text-[9px] text-amber-300 hover:text-white font-bold transition-colors mt-0.5">
                      أعلن ⭐
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Star History (collapsible below hero) ── */}
      {showStarHistory && starHistory.length > 0 && (
        <div className="card space-y-2">
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
          <div className="stat-value text-brand-600">{firstStats?.total ? `${attPct}%` : '—'}</div>
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
      {openPollsCount > 0 && (() => {
        const isPlayer = myRole === 'player'
        const unvoted = isPlayer ? openPollsCount - myVotedPolls.size : 0
        const title = isPlayer
          ? (unvoted > 0 ? 'صوّت قبل انتهاء مدة التصويت ⏱' : 'شاركت في جميع التصويتات ✅')
          : amParent
            ? 'تصويت أفضل لاعب جارٍ'
            : `${openPollsCount} تصويت مفتوح لأفضل لاعب`
        const sub = isPlayer
          ? `${openPollsCount} تصويت مفتوح · اضغط للتصويت`
          : amParent
            ? `${openPollsCount} تصويت · التصويت مخصص للاعبين`
            : 'اضغط للاطلاع على التصويتات وإدارتها'
        return (
          <button onClick={() => navigate(`/team/${teamId}/best-player`)}
            className="w-full card flex items-center gap-3 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-2xl bg-amber-200 flex items-center justify-center text-xl flex-shrink-0">⭐</div>
            <div className="flex-1 min-w-0 text-right">
              <div className="font-extrabold text-sm text-amber-800">{title}</div>
              <div className="text-xs text-amber-600">{sub}</div>
            </div>
            {unvoted > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex-shrink-0">{unvoted}</span>
            )}
          </button>
        )
      })()}

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

      {/* ── Event Carousel ── */}
      {carouselEvents.length > 0 && (
        <div className="card">

          {/* Header with navigation */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-800 text-sm">📅 المواعيد القادمة</h3>
              {carouselEvents.length > 1 && (
                <span className="badge badge-gray text-xs">{safeIdx + 1} / {carouselEvents.length}</span>
              )}
            </div>
            {carouselEvents.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigateCarousel(-1)}
                  disabled={safeIdx === 0}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center disabled:opacity-25 hover:bg-slate-200 active:scale-90 transition-all">
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
                <button
                  onClick={() => navigateCarousel(1)}
                  disabled={safeIdx >= carouselEvents.length - 1}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center disabled:opacity-25 hover:bg-slate-200 active:scale-90 transition-all">
                  <ChevronLeft size={16} className="text-slate-600" />
                </button>
              </div>
            )}
          </div>

          {/* Event details */}
          {carouselEvent && carouselCfg && (
            <div className={`border-r-4 ${carouselCfg.borderClass} pr-3`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 mt-0.5">
                  <span className="text-2xl leading-none">{carouselCfg.icon}</span>
                  <span className="text-[9px] font-bold text-slate-400 leading-none">{carouselCfg.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-slate-900 truncate">{carouselEvent.title}</span>
                    {carouselLocked && <span className="badge badge-red text-xs">مغلق</span>}
                    {canAttend(carouselEvent) && (
                      <span className="text-[10px] bg-brand-50 text-brand-600 font-bold px-1.5 py-0.5 rounded-lg">يتطلب تحضير</span>
                    )}
                  </div>
                  {carouselEvent.event_type === 'match' && carouselEvent.opponent && (
                    <div className="text-xs text-slate-500 mt-0.5">⚔️ ضد: {carouselEvent.opponent}</div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <Calendar size={11} className="flex-shrink-0" />
                    <span>{formatEventDate(carouselEvent.start_datetime)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-bold text-slate-700">{carouselEvent.start_datetime.slice(11, 16)}</span>
                    {carouselEvent.location && (
                      <><span className="text-slate-300">·</span>
                      <span className="truncate max-w-[80px]">{carouselEvent.location}</span></>
                    )}
                  </div>
                </div>
                <span className="badge flex-shrink-0 py-1 px-2.5 text-xs" style={{ background: carouselCfg.bg, color: carouselCfg.color }}>
                  {carouselCfg.label}
                </span>
              </div>

              {/* Coach note */}
              {carouselEvent.description && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-3 flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">📝</span>
                  <p className="text-xs text-amber-800 leading-relaxed">{carouselEvent.description}</p>
                </div>
              )}

              {/* Attendance stats — admin only */}
              {isAdmin && carouselStats && carouselStats.total > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {[
                    { label: 'حاضر',      val: carouselStats.present,   bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100' },
                    { label: 'متأخر',     val: carouselStats.late,      bg: 'bg-orange-50',  color: 'text-orange-500',  border: 'border-orange-100'  },
                    { label: 'غير متأكد', val: carouselStats.uncertain, bg: 'bg-amber-50',   color: 'text-amber-600',   border: 'border-amber-100'   },
                    { label: 'غائب',      val: carouselStats.absent,    bg: 'bg-red-50',     color: 'text-red-500',     border: 'border-red-100'     },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-2 text-center`}>
                      <div className={`text-lg font-extrabold leading-none ${s.color}`}>{s.val}</div>
                      <div className={`text-[10px] mt-0.5 font-bold ${s.color} opacity-80`}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Attendance button */}
              {canAttend(carouselEvent) && (
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-bold text-slate-600 mb-2">هل ستحضر هذا الموعد؟</p>
                  <AttendanceButton
                    status={weekAtts[carouselEvent.id] ?? ''}
                    locked={carouselLocked}
                    onSelect={s => setAttendance(carouselEvent.id, s)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Dot indicators */}
          {carouselEvents.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-3">
              {carouselEvents.map((_, i) => (
                <button key={i} onClick={() => setCarouselIdx(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === safeIdx
                      ? 'w-5 h-1.5 bg-brand-500'
                      : 'w-1.5 h-1.5 bg-slate-200 hover:bg-slate-300'
                  }`}/>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center mt-2.5 font-medium">تحضير المواعيد القريبة القادمة</p>
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
