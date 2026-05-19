import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LogIn, Shield, Calendar, DollarSign, Users, ChevronLeft, ChevronRight, MoreVertical, LogOut, Trash2, AlertTriangle, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { teamService, eventService, financeService } from '../services'
import { Spinner, EmptyState, Avatar, Modal } from '../components/ui'
import { formatDate, EVENT_CONFIG, isEventLocked, ROLE_LABELS, cn } from '../utils/helpers'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<any[]>([])
  const [teamIdx, setTeamIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [myStats, setMyStats] = useState({ teamCount: 0, upcomingCount: 0, unpaidCount: 0 })
  const [statsPerTeam, setStatsPerTeam] = useState<any[]>([])
  const [selStatTeam, setSelStatTeam] = useState<string | null>(null)
  const [showTeamMenu, setShowTeamMenu] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: 'leave' | 'delete'; teamId: string; teamName: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Transfer ownership state (for owner wanting to leave)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferMembers, setTransferMembers] = useState<any[]>([])
  const [transferTarget, setTransferTarget] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [showSoloLeave, setShowSoloLeave] = useState(false)

  const monthLabel = format(new Date(), 'MMMM', { locale: arSA })

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  })()

  useEffect(() => {
    if (!user) return
    teamService.getMyTeams(user.id).then(async ts => {
      setTeams(ts)
      let upcomingThisMonth = 0, unpaidCount = 0
      const perTeam: any[] = []

      for (const t of ts) {
        // Upcoming count this month
        const allEvs = await eventService.getTeamEvents(t.id)
        const now = new Date()
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        upcomingThisMonth += allEvs.filter((e: any) =>
          new Date(e.start_datetime) >= now && new Date(e.start_datetime) <= monthEnd
        ).length

        // Per-team attendance stats (uses joined event type)
        const myAtt = await eventService.getMyAttendance(t.id, user.id)
        let mT = 0, mP = 0, mE = 0, trT = 0, trP = 0, trE = 0
        myAtt.forEach((a: any) => {
          const isPresent = a.status === 'present' || a.status === 'late'
          const isExcused = a.status === 'excused'
          if (a.event?.event_type === 'match')     { mT++; if (isPresent) mP++; if (isExcused) mE++ }
          else if (a.event?.event_type === 'training') { trT++; if (isPresent) trP++; if (isExcused) trE++ }
        })
        perTeam.push({
          teamId: t.id, teamName: t.name, myRole: t.myRole, logo_url: t.logo_url,
          matchTotal: mT, matchPresent: mP, matchExcused: mE,
          trainingTotal: trT, trainingPresent: trP, trainingExcused: trE, archived: false
        })

        try {
          const fin = await financeService.getPlayerFinance(t.id, user.id)
          fin.obligations.forEach((o: any) => {
            const paid = fin.payments.find((p: any) => p.obligation_id === o.id)
            if (!paid || paid.paid_amount < o.amount) unpaidCount++
          })
        } catch {}
      }

      // Archived teams stats (requires V4 migration for RLS)
      try {
        const archivedTs = await teamService.getMyArchivedTeams(user.id)
        for (const t of archivedTs) {
          try {
            const myAtt = await eventService.getMyAttendance(t.id, user.id)
            let mT = 0, mP = 0, mE = 0, trT = 0, trP = 0, trE = 0
            myAtt.forEach((a: any) => {
              const isPresent = a.status === 'present' || a.status === 'late'
              const isExcused = a.status === 'excused'
              if (a.event?.event_type === 'match')     { mT++; if (isPresent) mP++; if (isExcused) mE++ }
              else if (a.event?.event_type === 'training') { trT++; if (isPresent) trP++; if (isExcused) trE++ }
            })
            if (mT > 0 || trT > 0)
              perTeam.push({
                teamId: t.id, teamName: t.name, myRole: t.myRole, logo_url: t.logo_url,
                matchTotal: mT, matchPresent: mP, matchExcused: mE,
                trainingTotal: trT, trainingPresent: trP, trainingExcused: trE, archived: true
              })
          } catch {}
        }
      } catch {}

      setStatsPerTeam(perTeam)
      setMyStats({ teamCount: ts.length, upcomingCount: upcomingThisMonth, unpaidCount })
      setLoading(false)
    })
  }, [user])

  async function handleTeamAction() {
    if (!confirmAction || !user) return
    setActionLoading(true)
    if (confirmAction.type === 'leave') {
      await teamService.leaveSelf(confirmAction.teamId, user.id)
    } else {
      // Delete: remove member first, then delete team
      await teamService.leaveSelf(confirmAction.teamId, user.id)
      await teamService.deleteTeam(confirmAction.teamId)
    }
    const removedId = confirmAction.teamId
    setConfirmAction(null)
    setActionLoading(false)
    setTeams(prev => prev.filter(t => t.id !== removedId))
    setTeamIdx(0)
  }

  async function openTransferModal() {
    if (!currentTeam) return
    setShowTeamMenu(false)
    setTransferTarget('')
    const mems = await teamService.getMembers(currentTeam.id)
    const others = mems.filter((m: any) => m.role !== 'owner' && !m.is_frozen)
    if (others.length === 0 && mems.length <= 1) {
      // Owner is the only member — offer to delete the team entirely
      setShowSoloLeave(true)
    } else {
      setTransferMembers(others)
      setShowTransfer(true)
    }
  }

  async function doSoloLeaveDelete() {
    if (!user || !currentTeam) return
    setTransferLoading(true)
    // Remove member first (always succeeds), then try to delete the team
    await teamService.leaveSelf(currentTeam.id, user.id)
    await teamService.deleteTeam(currentTeam.id)
    const removedId = currentTeam.id
    setTransferLoading(false)
    setShowSoloLeave(false)
    setTeams(prev => prev.filter(t => t.id !== removedId))
    setTeamIdx(0)
    navigate('/')
  }

  async function doTransferAndLeave() {
    if (!user || !currentTeam || !transferTarget) return
    setTransferLoading(true)
    await teamService.transferOwnership(currentTeam.id, transferTarget)
    await teamService.leaveSelf(currentTeam.id, user.id)
    const removedId = currentTeam.id
    setTransferLoading(false)
    setShowTransfer(false)
    setTeams(prev => prev.filter(t => t.id !== removedId))
    setTeamIdx(0)
    navigate('/')
  }

  const derivedStats = useMemo(() => {
    const playerTeams = statsPerTeam.filter(s => s.myRole === 'player')
    const rel = selStatTeam ? playerTeams.filter(s => s.teamId === selStatTeam) : playerTeams
    const mT  = rel.reduce((s, r) => s + r.matchTotal, 0)
    const mP  = rel.reduce((s, r) => s + r.matchPresent, 0)
    const mE  = rel.reduce((s, r) => s + (r.matchExcused || 0), 0)
    const trT = rel.reduce((s, r) => s + r.trainingTotal, 0)
    const trP = rel.reduce((s, r) => s + r.trainingPresent, 0)
    const trE = rel.reduce((s, r) => s + (r.trainingExcused || 0), 0)
    const mDenom  = mT  - mE
    const trDenom = trT - trE
    return {
      matchAttPct:    mDenom  > 0 ? Math.round(mP  / mDenom  * 100) : (mT  > 0 ? 100 : 0),
      trainingAttPct: trDenom > 0 ? Math.round(trP / trDenom * 100) : (trT > 0 ? 100 : 0),
      matchExcused: mE, trainingExcused: trE,
      matchTotal: mT, trainingTotal: trT,
      playerTeams
    }
  }, [statsPerTeam, selStatTeam])

  const currentTeam = teams[teamIdx]

  /* ── No teams: show welcome page ── */
  if (!loading && teams.length === 0) {
    return (
      <div className="animate-fade flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        {/* Logo / illustration */}
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)', boxShadow: '0 8px 30px rgba(29,158,117,0.35)' }}>
          <Shield size={44} className="text-white" />
        </div>

        <h1 className="text-2xl font-extrabold text-slate-800 mb-2">
          أهلاً {profile?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-500 text-sm max-w-xs mb-8 leading-relaxed">
          لم تنضم لأي فريق بعد. أنشئ فريقاً جديداً أو انضم لفريق موجود برمز الدعوة.
        </p>

        <div className="w-full max-w-sm space-y-3">
          <button onClick={() => navigate('/create-team')} className="hero-card text-right w-full">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 bg-white -translate-y-8 translate-x-8"/>
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Plus size={28} className="text-white" />
              </div>
              <div className="text-right">
                <div className="font-extrabold text-white text-lg">إنشاء فريق جديد</div>
                <div className="text-white/70 text-sm mt-0.5">أنشئ فريقك وكن المؤسس</div>
              </div>
            </div>
          </button>

          <button onClick={() => navigate('/join-team')}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all shadow-sm">
            <div className="icon-box-blue flex-shrink-0"><LogIn size={22} /></div>
            <div className="text-right flex-1">
              <div className="font-extrabold text-slate-800">الانضمام لفريق موجود</div>
              <div className="text-sm text-slate-400 mt-0.5">أدخل رمز الدعوة</div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade space-y-5">

      {/* ── Hero Greeting ── */}
      <div className="hero-card">
        <div className="absolute -top-8 -left-8 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-6 left-10 w-20 h-20 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="xl"
            className="ring-4 ring-white/40 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/80 font-medium">{greeting} 👋</p>
            <h1 className="text-2xl font-extrabold mt-0.5 truncate leading-tight">{profile?.full_name}</h1>
            {!loading && teams.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 bg-white/20 rounded-xl px-2.5 py-1 text-xs font-bold">
                  <Users size={12} /> {teams.length} فريق
                </span>
                {myStats.upcomingCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-white/20 rounded-xl px-2.5 py-1 text-xs font-bold">
                    <Calendar size={12} /> {myStats.upcomingCount} موعد في {monthLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Team Picker ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        /* Team carousel */
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-box-brand"><Users size={18} /></div>
            <h2 className="text-base font-extrabold text-slate-800">فرقي</h2>
          </div>

          {/* Team card */}
          <div className="relative">
            <div
              onClick={() => navigate(`/team/${currentTeam.id}`)}
              className="hero-card cursor-pointer active:scale-[0.99] transition-transform select-none">
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-10 bg-white -translate-x-16 -translate-y-12"/>
              <div className="relative flex items-center gap-4">
                {/* Team logo */}
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-white/20 flex items-center justify-center text-2xl font-extrabold text-white border-2 border-white/30">
                  {currentTeam.logo_url
                    ? <img src={currentTeam.logo_url} className="w-full h-full object-cover" alt={currentTeam.name} />
                    : currentTeam.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white/70 text-xs font-bold mb-0.5">
                    {ROLE_LABELS[currentTeam.myRole] || currentTeam.myRole}
                  </div>
                  <div className="font-extrabold text-white text-xl leading-tight truncate">{currentTeam.name}</div>
                  <div className="text-white/70 text-sm mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {currentTeam.sport_type && <span>{currentTeam.sport_type}</span>}
                    {currentTeam.age_category && <span className="bg-white/20 rounded-lg px-1.5 py-0.5 text-xs font-bold">{currentTeam.age_category}</span>}
                    {currentTeam.city && <span className="text-white/50">· {currentTeam.city}</span>}
                  </div>
                  {currentTeam.joinedAt && (
                    <div className="text-white/50 text-xs mt-1.5 flex items-center gap-1">
                      <Calendar size={11} />
                      انضممت {new Date(currentTeam.joinedAt).toLocaleDateString('ar-SA')}
                    </div>
                  )}
                </div>
                <ChevronLeft size={22} className="text-white/50 flex-shrink-0" />
              </div>
              {/* Enter button */}
              <div className="relative mt-4 flex items-center justify-between">
                <span className="text-white/60 text-xs font-bold">اضغط للدخول →</span>
                {teams.length > 1 && (
                  <div className="flex gap-1">
                    {teams.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === teamIdx ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation arrows — only if multiple teams */}
            {teams.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setTeamIdx(i => (i + 1) % teams.length) }}
                  className="absolute top-1/2 -left-4 -translate-y-1/2 w-9 h-9 bg-white shadow-card rounded-2xl flex items-center justify-center text-slate-600 hover:bg-brand-50 hover:text-brand-700 transition-colors z-10">
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setTeamIdx(i => (i - 1 + teams.length) % teams.length) }}
                  className="absolute top-1/2 -right-4 -translate-y-1/2 w-9 h-9 bg-white shadow-card rounded-2xl flex items-center justify-center text-slate-600 hover:bg-brand-50 hover:text-brand-700 transition-colors z-10">
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>

          {/* Team quick-action menu (leave / delete) */}
          <div className="relative mt-2 flex justify-end" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setShowTeamMenu(v => !v) }}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white/90 transition-colors px-2 py-1 rounded-lg border border-white/20 hover:border-white/40 bg-transparent cursor-pointer">
              <MoreVertical size={13}/> خيارات الفريق
            </button>
            {showTeamMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-30 overflow-hidden">
                {currentTeam.myRole !== 'owner' && (
                  <button
                    onClick={() => { setShowTeamMenu(false); setConfirmAction({ type: 'leave', teamId: currentTeam.id, teamName: currentTeam.name }) }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer border-none bg-transparent text-right">
                    <LogOut size={15}/> مغادرة الفريق
                  </button>
                )}
                {currentTeam.myRole === 'owner' && (
                  <>
                    <button
                      onClick={() => openTransferModal()}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer border-none bg-transparent text-right">
                      <LogOut size={15}/> الخروج من الفريق
                    </button>
                    <div className="border-t border-slate-100"/>
                    <button
                      onClick={() => { setShowTeamMenu(false); setConfirmAction({ type: 'delete', teamId: currentTeam.id, teamName: currentTeam.name }) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent text-right">
                      <Trash2 size={15}/> حذف الفريق نهائياً
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Small actions below */}
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <button onClick={() => navigate('/create-team')}
              className="card-hover flex items-center gap-2.5 p-3">
              <div className="icon-box-brand flex-shrink-0 w-9 h-9"><Plus size={18} /></div>
              <div className="text-right min-w-0">
                <div className="font-bold text-sm text-slate-800">إنشاء فريق</div>
                <div className="text-xs text-slate-400">فريق جديد</div>
              </div>
            </button>
            <button onClick={() => navigate('/join-team')}
              className="card-hover flex items-center gap-2.5 p-3">
              <div className="icon-box-blue flex-shrink-0 w-9 h-9"><LogIn size={18} /></div>
              <div className="text-right min-w-0">
                <div className="font-bold text-sm text-slate-800">انضمام</div>
                <div className="text-xs text-slate-400">بكود الدعوة</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Player Attendance Stats ── */}
      {!loading && derivedStats.playerTeams.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-box-brand"><span className="text-base leading-none">📊</span></div>
            <h2 className="text-base font-extrabold text-slate-800">إحصائياتي</h2>
            <span className="badge badge-gray text-xs">كلاعب</span>
          </div>

          {/* Team filter chips */}
          {derivedStats.playerTeams.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
              <button
                onClick={() => setSelStatTeam(null)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors',
                  !selStatTeam ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
                )}>
                الكل
              </button>
              {derivedStats.playerTeams.map(t => (
                <button
                  key={t.teamId}
                  onClick={() => setSelStatTeam(t.teamId === selStatTeam ? null : t.teamId)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors',
                    selStatTeam === t.teamId ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
                  )}>
                  {t.logo_url && <img src={t.logo_url} className="w-4 h-4 rounded-full object-cover" alt="" />}
                  {t.teamName}
                  {t.archived && <span className="opacity-60 text-[10px]">📦</span>}
                </button>
              ))}
            </div>
          )}

          {/* Attendance stats with progress bars */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="stat-box">
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <span className="text-xl">🏆</span>
              </div>
              <div className="stat-value text-blue-600">{derivedStats.matchAttPct}%</div>
              <div className="stat-label">حضور المباريات</div>
              <div className="text-[11px] text-slate-400 mt-1">
                {derivedStats.matchTotal} مباراة
                {derivedStats.matchExcused > 0 && <span className="mr-1 text-slate-300">· {derivedStats.matchExcused} بعذر</span>}
              </div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${derivedStats.matchAttPct}%` }} />
              </div>
            </div>
            <div className="stat-box">
              <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <span className="text-xl">⚽</span>
              </div>
              <div className="stat-value text-brand-600">{derivedStats.trainingAttPct}%</div>
              <div className="stat-label">حضور التدريبات</div>
              <div className="text-[11px] text-slate-400 mt-1">
                {derivedStats.trainingTotal} تدريب
                {derivedStats.trainingExcused > 0 && <span className="mr-1 text-slate-300">· {derivedStats.trainingExcused} بعذر</span>}
              </div>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${derivedStats.trainingAttPct}%` }} />
              </div>
            </div>
          </div>

          {/* Quick counters */}
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-box">
              <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Calendar size={20} className="text-purple-600" />
              </div>
              <div className="stat-value text-purple-600">{myStats.upcomingCount}</div>
              <div className="stat-label">مواعيد {monthLabel}</div>
            </div>
            <div className="stat-box">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2 ${
                myStats.unpaidCount > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                <DollarSign size={20} className={myStats.unpaidCount > 0 ? 'text-red-500' : 'text-emerald-600'} />
              </div>
              <div className={`stat-value ${myStats.unpaidCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {myStats.unpaidCount}
              </div>
              <div className="stat-label">
                {myStats.unpaidCount > 0 ? 'مستحقات متأخرة' : 'لا مستحقات'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick counters for non-player roles */}
      {!loading && teams.length > 0 && derivedStats.playerTeams.length === 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-box">
            <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <Calendar size={20} className="text-purple-600" />
            </div>
            <div className="stat-value text-purple-600">{myStats.upcomingCount}</div>
            <div className="stat-label">مواعيد {monthLabel}</div>
          </div>
          <div className="stat-box">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2 ${
              myStats.unpaidCount > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
              <DollarSign size={20} className={myStats.unpaidCount > 0 ? 'text-red-500' : 'text-emerald-600'} />
            </div>
            <div className={`stat-value ${myStats.unpaidCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {myStats.unpaidCount}
            </div>
            <div className="stat-label">
              {myStats.unpaidCount > 0 ? 'مستحقات متأخرة' : 'لا مستحقات'}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Leave / Delete Modal ── */}
      <Modal open={!!confirmAction} onClose={() => !actionLoading && setConfirmAction(null)}
        title={confirmAction?.type === 'delete' ? '🗑️ حذف الفريق نهائياً' : '🚪 الخروج من الفريق'}>
        {confirmAction && (
          <div>
            {confirmAction.type === 'delete' ? (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-bold text-red-700 text-sm mb-1">⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه</p>
                  <p className="text-red-600 text-xs">سيتم حذف فريق <strong>"{confirmAction.teamName}"</strong> بشكل نهائي مع جميع البيانات المرتبطة به:</p>
                  <ul className="text-xs text-red-600 mt-2 space-y-1 list-disc list-inside">
                    <li>جميع الأعضاء سيُخرَجون تلقائياً</li>
                    <li>جميع المواعيد والتدريبات والمباريات</li>
                    <li>سجلات الحضور والنقاط والمالية</li>
                    <li>الرسائل والإعلانات والتقارير</li>
                    <li>الأرشيف الكامل للفريق</li>
                  </ul>
                </div>
                <p className="text-sm text-slate-600">هل أنت متأكد من حذف الفريق نهائياً؟</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-700 mb-3">
                  هل تريد الخروج من فريق <strong>"{confirmAction.teamName}"</strong>؟
                </p>
                <p className="text-xs text-slate-400">يمكنك الانضمام مجدداً برمز الدعوة.</p>
              </div>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <button className="btn btn-ghost" onClick={() => setConfirmAction(null)} disabled={actionLoading}>إلغاء</button>
              <button
                className={`btn ${confirmAction.type === 'delete' ? 'btn-danger' : 'bg-amber-500 text-white hover:bg-amber-600 border-none'}`}
                onClick={handleTeamAction} disabled={actionLoading}>
                {actionLoading ? <Spinner size="sm"/> : confirmAction.type === 'delete' ? 'حذف نهائياً' : 'تأكيد الخروج'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Transfer Ownership & Leave Modal (owner only) ── */}
      <Modal open={showTransfer} onClose={() => !transferLoading && setShowTransfer(false)}
        title="🔄 نقل الإدارة ومغادرة الفريق">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0"/>
              <p className="text-xs text-amber-700">
                بما أنك مؤسس الفريق، يجب عليك تحديد عضو آخر لتسليمه إدارة الفريق قبل المغادرة.
              </p>
            </div>
          </div>

          {transferMembers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">لا يوجد أعضاء آخرون يمكن تسليمهم الإدارة.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">اختر العضو الذي سيتولى إدارة الفريق:</p>
              <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 p-2">
                {transferMembers.map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => setTransferTarget(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-right ${
                      transferTarget === m.id
                        ? 'bg-brand-50 border-brand-400 text-brand-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}>
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                      {(m.display_name || m.name || '?').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{m.display_name || m.name}</div>
                      <div className="text-xs text-slate-400">{m.role}</div>
                    </div>
                    {transferTarget === m.id && <Check size={16} className="text-brand-600 flex-shrink-0"/>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <button className="btn btn-ghost" onClick={() => setShowTransfer(false)} disabled={transferLoading}>إلغاء</button>
            <button
              className="btn bg-amber-500 text-white hover:bg-amber-600 border-none"
              onClick={doTransferAndLeave}
              disabled={!transferTarget || transferLoading || transferMembers.length === 0}>
              {transferLoading ? <Spinner size="sm"/> : 'تسليم الإدارة والمغادرة'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Solo Leave → Delete Team Modal ── */}
      <Modal open={showSoloLeave} onClose={() => !transferLoading && setShowSoloLeave(false)}
        title="🚪 مغادرة وحذف الفريق">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0"/>
              <p className="text-xs text-red-700">
                أنت العضو الوحيد في هذا الفريق. بمغادرتك سيُحذف الفريق نهائياً مع جميع بياناته ولن يظهر لأي أحد.
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            هل تريد حذف فريق <strong>"{currentTeam?.name}"</strong> نهائياً؟
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost" onClick={() => setShowSoloLeave(false)} disabled={transferLoading}>إلغاء</button>
            <button className="btn btn-danger" onClick={doSoloLeaveDelete} disabled={transferLoading}>
              {transferLoading ? <Spinner size="sm"/> : 'حذف الفريق نهائياً'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
