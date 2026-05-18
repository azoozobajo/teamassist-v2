import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, leaveService, monthlyStarService, permissionService } from '../../services'
import { Spinner, AttendanceButton, Modal, FormField } from '../../components/ui'
import { formatDate, EVENT_CONFIG, canManageTeam, canManageEvents, isEventLocked, ROLE_LABELS } from '../../utils/helpers'
import { Copy, CheckCircle, Users, Calendar, Umbrella, ChevronLeft, ChevronRight, TrendingUp, Swords, Star, ClipboardList } from 'lucide-react'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

const ROLE_GROUPS_EVENT: Record<string, string[]> = {
  'اللاعبون فقط': ['player'],
  'المدربون فقط': ['head_coach', 'assistant_coach'],
  'اللاعبون والمدربون': ['player', 'head_coach', 'assistant_coach'],
  'الإداريون فقط': ['administrator', 'owner'],
}

export default function TeamDashboard() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam]         = useState<any>(null)
  const [members, setMembers]   = useState<any[]>([])
  const [events, setEvents]     = useState<any[]>([])
  const [weekEvents, setWeekEvents] = useState<any[]>([])
  const [matchResults, setMatchResults] = useState<any[]>([])
  const [leaves, setLeaves]     = useState<any[]>([])
  const [myRole, setMyRole]     = useState('')
  const [myPerms, setMyPerms]   = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [attStats, setAttStats] = useState({ present: 0, absent: 0, uncertain: 0, late: 0, total: 0 })
  const [weekAtts, setWeekAtts] = useState<Record<string, string>>({})
  const [evIdx, setEvIdx]       = useState(0)
  const [trackerSummary, setTrackerSummary] = useState<Record<string, Record<string, number>>>({})

  // Monthly star
  const [monthlyStar, setMonthlyStar] = useState<any>(undefined)
  const [showStarModal, setShowStarModal] = useState(false)
  const [starForm, setStarForm] = useState({ userId: '', note: '' })
  const [starSaving, setStarSaving] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return

    async function load() {
      const [t, m, e, r, l, mr, we, myAttRecords, star, perms] = await Promise.all([
        teamService.getTeam(teamId!),
        teamService.getMembers(teamId!),
        eventService.getUpcomingEvents(teamId!, 14),
        teamService.getMyRole(teamId!, user!.id),
        leaveService.getAll(teamId!),
        eventService.getMatchResults(teamId!),
        eventService.getWeekEvents(teamId!),
        eventService.getMyAttendance(teamId!, user!.id),
        monthlyStarService.getCurrent(teamId!),
        permissionService.getUserPermissions(teamId!, user!.id),
      ])

      setTeam(t); setMembers(m); setMyRole(r || ''); setLeaves(l)
      setMatchResults(mr); setWeekEvents(we)
      setMonthlyStar(star ?? null)
      setMyPerms(perms as string[])
      setEvents(e as any[])

      const role = r || ''

      // Determine which events the current user should attend.
      // Match and training are always player-only regardless of stored att_group.
      const isVisible = (ev: any): boolean => {
        if (ev.att_member_ids?.length > 0) return ev.att_member_ids.includes(user!.id)
        if (ev.event_type === 'match' || ev.event_type === 'training') return role === 'player'
        const allowedRoles = ROLE_GROUPS_EVENT[ev.att_group]
        if (allowedRoles) return allowedRoles.includes(role)
        return true // 'الكل' or unknown group → everyone
      }
      const myWeekEvs = (we as any[]).filter(isVisible)

      // Auto-set attendance only for user's 7-day events
      const attMap: Record<string, string> = {}
      ;(myAttRecords as any[]).forEach((a: any) => { attMap[a.event_id] = a.status })

      const noAtt = myWeekEvs.filter((ev: any) => !attMap[ev.id])
      if (noAtt.length > 0) {
        noAtt.forEach((ev: any) => { attMap[ev.id] = 'present' })
        noAtt.forEach((ev: any) => {
          eventService.setAttendance({ event_id: ev.id, team_id: teamId, user_id: user!.id, status: 'present' })
        })
      }
      setWeekAtts(attMap)

      if (myWeekEvs.length) {
        setNextEvent(myWeekEvs[0])
        eventService.getAttendance(myWeekEvs[0].id).then(att => {
          setAttStats({
            present:   att.filter((a: any) => a.status === 'present').length,
            absent:    att.filter((a: any) => a.status === 'absent').length,
            uncertain: att.filter((a: any) => a.status === 'uncertain').length,
            late:      att.filter((a: any) => a.status === 'late').length,
            total:     att.length,
          })
        })
      }

      // Load tracker summary only for managers / those with attendance permissions
      const canTrack = canManageEvents(role)
        || (perms as string[]).includes('view_attendance')
        || (perms as string[]).includes('manage_attendance')
      if (canTrack) {
        const evIds = (e as any[]).map((ev: any) => ev.id)
        if (evIds.length > 0) {
          const summary = await eventService.getAttendanceSummary(teamId!, evIds)
          setTrackerSummary(summary)
        }
      }

      setLoading(false)
    }

    load()
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
    if (error) setWeekAtts(p => ({ ...p, [eventId]: prev }))
  }

  async function saveMonthlyStar(announceNow: boolean) {
    if (!starForm.userId || !teamId || !user) return
    setStarSaving(true)
    const now = new Date()
    const { data } = await monthlyStarService.set(teamId, starForm.userId, now.getMonth() + 1, now.getFullYear(), starForm.note, user.id, announceNow)
    if (data) setMonthlyStar(data)
    setShowStarModal(false); setStarSaving(false)
  }

  async function announceMonthlyStar() {
    if (!monthlyStar?.id) return
    await monthlyStarService.announce(monthlyStar.id)
    setMonthlyStar((p: any) => ({ ...p, announced_at: new Date().toISOString() }))
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!team)   return <div className="card text-center py-10 text-slate-400">الفريق غير موجود</div>

  // ── Computed ──
  // Filter by att_group / att_member_ids. Match and training are player-only regardless of stored att_group.
  function isEventForMe(ev: any): boolean {
    if (ev.att_member_ids?.length > 0) return ev.att_member_ids.includes(user?.id)
    if (ev.event_type === 'match' || ev.event_type === 'training') return myRole === 'player'
    const allowedRoles = ROLE_GROUPS_EVENT[ev.att_group]
    if (allowedRoles) return allowedRoles.includes(myRole)
    return true
  }
  // Carousel shows only the user's events for the next 7 days
  const myWeekEvents = weekEvents.filter(isEventForMe)
  const myWeekCount  = myWeekEvents.length

  const pending    = leaves.filter(l => l.status === 'pending')
  const isAdmin    = canManageTeam(myRole)
  const canTrackAttendance = canManageEvents(myRole)
    || myPerms.includes('view_attendance')
    || myPerms.includes('manage_attendance')
  const now        = new Date()
  const isRevealed = monthlyStar?.announced_at && new Date(monthlyStar.announced_at) <= now
  const monthName  = MONTHS[now.getMonth()]

  // Carousel: user's events for the next 7 days only
  const carouselEvs = myWeekEvents
  const curEv       = carouselEvs[evIdx] || null
  const curCfg      = curEv ? (EVENT_CONFIG[curEv.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other) : null
  const curLocked   = curEv ? isEventLocked(curEv.start_datetime) : false
  const isFirstEv   = curEv?.id === nextEvent?.id

  return (
    <div className="animate-fade space-y-4">

      {/* ── Team Hero + Monthly Star ── */}
      <div className="hero-card">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 left-4 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />

        <div className="relative flex items-stretch gap-0">

          {/* RIGHT (first in RTL): Team info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold truncate leading-tight">{team.name}</h1>
            <p className="text-sm text-white/80 mt-0.5">
              {team.sport_type} · {team.age_category}{team.city ? ` · ${team.city}` : ''}
            </p>
            {myRole && (
              <span className="inline-block mt-2 bg-white/25 rounded-xl px-2.5 py-1 text-xs font-bold">
                {ROLE_LABELS[myRole] || myRole}
              </span>
            )}
            {isAdmin && team.invite_code && (
              <button onClick={copyCode}
                className="flex items-center gap-2 mt-2.5 bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-sm transition-colors border-none cursor-pointer">
                {copied ? <CheckCircle size={14}/> : <Copy size={14}/>}
                <span className="font-mono tracking-wider text-sm">{team.invite_code}</span>
                <span className="text-xs opacity-70">{copied ? '✓ تم النسخ' : 'نسخ'}</span>
              </button>
            )}
          </div>

          {/* LEFT (second in RTL): Monthly Star section */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center pr-1 pl-4 border-r border-white/20 mr-4"
            style={{ minWidth: 120 }}>
            {isRevealed && monthlyStar ? (
              <>
                <div className="text-[10px] text-amber-200 font-extrabold mb-1.5 flex items-center gap-0.5">
                  <Star size={9} fill="currentColor"/> نجم الشهر
                </div>
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-300/60 bg-white/20 flex items-center justify-center flex-shrink-0">
                  {monthlyStar.player?.avatar_url
                    ? <img src={monthlyStar.player.avatar_url} className="w-full h-full object-cover" alt=""/>
                    : <span className="text-2xl font-extrabold text-white">{monthlyStar.player?.full_name?.[0]}</span>}
                </div>
                <div className="text-white text-[12px] font-extrabold text-center mt-1.5 leading-tight max-w-[110px] line-clamp-1">
                  {monthlyStar.player?.full_name}
                </div>
                <span className="mt-1 bg-amber-400/30 text-amber-200 rounded-lg px-1.5 py-0.5 text-[10px] font-bold">
                  نجم {monthName}
                </span>
                {isAdmin && (
                  <button onClick={() => { setStarForm({ userId: monthlyStar.user_id, note: monthlyStar.note || '' }); setShowStarModal(true) }}
                    className="mt-1.5 text-[10px] text-white/60 hover:text-white border-none bg-transparent cursor-pointer underline">
                    تعديل
                  </button>
                )}
              </>
            ) : monthlyStar && !isRevealed ? (
              <>
                <div className="text-[10px] text-white/60 font-bold mb-1.5">⭐ نجم {monthName}</div>
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-extrabold text-white/40 animate-pulse">?</div>
                <div className="text-[10px] text-white/50 mt-1.5 text-center">سيُعلن قريباً</div>
                {isAdmin && (
                  <div className="flex flex-col gap-1 mt-2 w-full">
                    <button onClick={announceMonthlyStar}
                      className="text-[10px] bg-amber-400 text-white rounded-lg px-2 py-1 border-none cursor-pointer font-bold w-full">
                      ⭐ أعلن
                    </button>
                    <button onClick={() => { setStarForm({ userId: monthlyStar?.user_id || '', note: monthlyStar?.note || '' }); setShowStarModal(true) }}
                      className="text-[10px] bg-white/20 text-white rounded-lg px-2 py-1 border-none cursor-pointer w-full">
                      تعديل
                    </button>
                  </div>
                )}
              </>
            ) : isAdmin ? (
              <>
                <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mb-1.5">
                  <Star size={24} className="text-amber-300/70"/>
                </div>
                <button onClick={() => { setStarForm({ userId: '', note: '' }); setShowStarModal(true) }}
                  className="text-[10px] bg-amber-400/80 hover:bg-amber-400 text-white rounded-lg px-2 py-1.5 border-none cursor-pointer font-bold text-center leading-tight w-full">
                  اختر نجم<br/>{monthName}
                </button>
              </>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white/25 flex items-center justify-center text-2xl font-extrabold overflow-hidden border-2 border-white/30">
                {team.logo_url
                  ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.name}/>
                  : team.name[0]}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-2xl border border-slate-100 p-3 text-center cursor-pointer hover:border-blue-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/members`)}>
          <div className="text-xl font-extrabold text-blue-600">{members.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-bold flex items-center justify-center gap-1">
            <Users size={10}/> الأعضاء
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-3 text-center cursor-pointer hover:border-brand-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/attendance`)}>
          <div className="text-xl font-extrabold text-brand-600">
            {attStats.total ? `${Math.round(attStats.present / attStats.total * 100)}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-bold flex items-center justify-center gap-1">
            <TrendingUp size={10}/> حضور آخر موعد
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-3 text-center cursor-pointer hover:border-purple-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/events`)}>
          <div className="text-xl font-extrabold text-purple-600">{myWeekCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-bold flex items-center justify-center gap-1">
            <Calendar size={10}/> مواعيدي 7 أيام
          </div>
        </div>
        <div className={`rounded-2xl border p-3 text-center cursor-pointer transition-all ${
            pending.length > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-white border-slate-100 hover:border-slate-200'
          }`}
          onClick={() => navigate(`/team/${teamId}/leaves`)}>
          <div className={`text-xl font-extrabold ${pending.length > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
            {pending.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-bold flex items-center justify-center gap-1">
            <Umbrella size={10}/> طلبات إجازة
          </div>
        </div>
      </div>

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

      {/* ── Section 1: التحضير السريع (user's events only) ── */}
      {carouselEvs.length > 0 ? (
        <div className="card p-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-brand-600"/>
              <span className="font-extrabold text-slate-800 text-sm">التحضير السريع</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-mono">{evIdx + 1}/{carouselEvs.length}</span>
              <button
                onClick={() => setEvIdx(i => Math.max(0, i - 1))}
                disabled={evIdx === 0}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 border-none cursor-pointer transition-colors">
                <ChevronRight size={14} className="text-slate-600"/>
              </button>
              <button
                onClick={() => setEvIdx(i => Math.min(carouselEvs.length - 1, i + 1))}
                disabled={evIdx === carouselEvs.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 border-none cursor-pointer transition-colors">
                <ChevronLeft size={14} className="text-slate-600"/>
              </button>
            </div>
          </div>

          {curEv && curCfg && (
            <div className="p-4">
              {/* Event info */}
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl flex-shrink-0">{curCfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-base text-slate-900 truncate">{curEv.title}</span>
                    {curLocked && <span className="badge badge-red text-xs">مغلق</span>}
                    <span className="badge mr-auto text-xs" style={{ background: curCfg.bg, color: curCfg.color }}>{curCfg.label}</span>
                  </div>
                  {curEv.event_type === 'match' && curEv.opponent && (
                    <div className="text-xs text-slate-500 mt-0.5 font-medium">⚔️ ضد: {curEv.opponent}</div>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                    <Calendar size={12} className="flex-shrink-0"/>
                    <span>{formatDate(curEv.start_datetime)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-bold text-slate-700">{curEv.start_datetime.slice(11, 16)}</span>
                    {curEv.location && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="truncate max-w-[100px] text-slate-400">{curEv.location}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Attendance stats — first event only */}
              {isFirstEv && attStats.total > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'غائب',      val: attStats.absent,    bg: 'bg-red-50',     color: 'text-red-500',     border: 'border-red-100'     },
                    { label: 'غير متأكد', val: attStats.uncertain, bg: 'bg-amber-50',   color: 'text-amber-600',   border: 'border-amber-100'   },
                    { label: 'متأخر',     val: attStats.late,      bg: 'bg-orange-50',  color: 'text-orange-500',  border: 'border-orange-100'  },
                    { label: 'حاضر',      val: attStats.present,   bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-2.5 text-center`}>
                      <div className={`text-xl font-extrabold leading-none ${s.color}`}>{s.val}</div>
                      <div className={`text-[11px] mt-1 font-bold ${s.color} opacity-80`}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Attendance button */}
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-bold text-slate-500 mb-2.5">هل ستحضر هذا الموعد؟</p>
                <AttendanceButton
                  status={weekAtts[curEv.id] ?? ''}
                  locked={curLocked}
                  onSelect={s => setAttendance(curEv.id, s)}
                />
              </div>

              {/* Dots navigation */}
              {carouselEvs.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {carouselEvs.map((_, i) => (
                    <button key={i} onClick={() => setEvIdx(i)}
                      className={`rounded-full border-none cursor-pointer transition-all ${
                        i === evIdx
                          ? 'w-5 h-2 bg-brand-500'
                          : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                      }`}/>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-6">
          <Calendar size={28} className="text-slate-300 mx-auto mb-2"/>
          <p className="text-sm font-bold text-slate-500">لا يوجد لديك أي موعد خلال الأسبوع القادم</p>
          <p className="text-xs text-slate-400 mt-1">ستظهر هنا المواعيد التي تخصّك فور إضافتها</p>
          {isAdmin && (
            <button onClick={() => navigate(`/team/${teamId}/events`)}
              className="btn btn-ghost btn-sm mt-3">إضافة موعد</button>
          )}
        </div>
      )}

      {/* ── Section 2: متابعة حضور الفريق (managers / view_attendance permission) ── */}
      {canTrackAttendance && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-brand-600"/>
              <span className="font-extrabold text-slate-800 text-sm">متابعة حضور الفريق</span>
            </div>
            <button
              onClick={() => navigate(`/team/${teamId}/attendance`)}
              className="text-xs text-brand-600 font-bold bg-transparent border-none cursor-pointer hover:underline">
              عرض الكل
            </button>
          </div>

          {/* Legend row */}
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold">
            <span className="flex-1 text-slate-400">الموعد</span>
            <span className="w-7 text-center text-emerald-600">✓</span>
            <span className="w-7 text-center text-orange-500">⏱</span>
            <span className="w-7 text-center text-amber-600">?</span>
            <span className="w-7 text-center text-red-500">✗</span>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm px-4">
              لا توجد مواعيد قادمة للفريق
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {events.slice(0, 6).map(ev => {
                const cfg    = EVENT_CONFIG[ev.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
                const counts = trackerSummary[ev.id] || {}
                const total  = Object.values(counts).reduce((s: number, n: any) => s + n, 0)
                return (
                  <button key={ev.id}
                    onClick={() => navigate(`/team/${teamId}/attendance`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-right">
                    <span className="text-lg flex-shrink-0">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{ev.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDate(ev.start_datetime)} · {ev.start_datetime.slice(11, 16)}
                      </div>
                    </div>
                    {total > 0 ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="w-7 text-center py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-black">{counts.present || 0}</span>
                        <span className="w-7 text-center py-0.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-black">{counts.late || 0}</span>
                        <span className="w-7 text-center py-0.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-black">{counts.uncertain || 0}</span>
                        <span className="w-7 text-center py-0.5 bg-red-50 text-red-600 rounded-lg text-xs font-black">{counts.absent || 0}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-300 flex-shrink-0 font-bold">لم يُسجّل</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {events.length > 6 && (
            <div className="px-4 py-2.5 border-t border-slate-100">
              <button
                onClick={() => navigate(`/team/${teamId}/attendance`)}
                className="w-full text-xs text-brand-600 font-bold bg-transparent border-none cursor-pointer text-center hover:underline">
                عرض جميع المواعيد ({events.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly Star Admin Modal ── */}
      <Modal open={showStarModal} onClose={() => setShowStarModal(false)} title={`نجم شهر ${monthName}`}>
        <FormField label="اختر اللاعب">
          <select className="form-input" value={starForm.userId}
            onChange={e => setStarForm(p => ({ ...p, userId: e.target.value }))}>
            <option value="">-- اختر عضواً --</option>
            {members.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="ملاحظة (اختياري)">
          <input className="form-input" value={starForm.note}
            onChange={e => setStarForm(p => ({ ...p, note: e.target.value }))}
            placeholder="أفضل مدافع، قائد الفريق..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4 flex-wrap">
          <button className="btn btn-ghost" onClick={() => setShowStarModal(false)}>إلغاء</button>
          <button className="btn btn-sm py-2 px-4"
            style={{ background: '#d97706', color: '#fff', border: 'none' }}
            onClick={() => saveMonthlyStar(false)}
            disabled={!starForm.userId || starSaving}>
            {starSaving ? <Spinner size="sm"/> : 'احفظ (سري)'}
          </button>
          <button className="btn btn-sm py-2 px-4"
            style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
            onClick={() => saveMonthlyStar(true)}
            disabled={!starForm.userId || starSaving}>
            {starSaving ? <Spinner size="sm"/> : '⭐ أعلن الآن'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
