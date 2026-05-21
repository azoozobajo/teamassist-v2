import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import {
  Home, Users, Calendar, CheckSquare, MessageCircle, Bell, Swords, Star as StarIcon,
  DollarSign, FileText, Mail, Settings, Star,
  Umbrella, Trophy, LogOut, Menu, ChevronDown, Shield, UserCircle,
  Plus, LogIn, Archive, Baby, BookOpen, Stethoscope, Ruler, Inbox, ClipboardList, Gavel, Search, GraduationCap, BriefcaseBusiness, Dumbbell
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui'
import { supabase } from '../../lib/supabase'
import { teamService, notificationService, dmService, adminService, mailService } from '../../services'
import { cn, ROLE_LABELS, canManageTeam, canManageEvents, canViewReports, canManageFinance, canManageContracts, canViewScouting, canViewEducation, canViewTraining, isParent } from '../../utils/helpers'

export default function AppLayout() {
  const { user, profile, signOut } = useAuth()
  const { teamId } = useParams()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [myTeams, setMyTeams] = useState<any[]>([])
  const [archivedTeams, setArchivedTeams] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [unreadN, setUnreadN] = useState(0)
  const [teamNotifs, setTeamNotifs] = useState<any[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [unreadDM, setUnreadDM] = useState(0)
  const [unreadMail, setUnreadMail] = useState(0)
  const [teamName, setTeamName] = useState('')
  const [showLeave, setShowLeave] = useState(false)
  const [leavePassword, setLeavePassword] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isFrozen, setIsFrozen] = useState(false)

  useEffect(() => {
    if (!user) return
    teamService.getMyTeams(user.id).then(setMyTeams)
    teamService.getMyArchivedTeams(user.id).then(setArchivedTeams)
    adminService.isPlatformAdmin(user.id).then(setIsPlatformAdmin)
  }, [user])

  useEffect(() => {
    if (!teamId || !user) {
      setTeamNotifs([])
      setUnreadN(0)
      return
    }
    setIsFrozen(false)
    setShowNotif(false)
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getTeam(teamId).then(t => setTeamName(t?.name || ''))
    dmService.getConversations(teamId, user.id).then(convs =>
      setUnreadDM(convs.reduce((s: number, c: any) => s + c.unread, 0)))
    const refreshTeamNotifs = () => notificationService.getForTeam(teamId, user.id).then(ns => {
      setTeamNotifs(ns)
      setUnreadN(ns.filter((n: any) => !n.is_read).length)
    })
    refreshTeamNotifs()
    const notifChannel = supabase.channel(`layout-notifications:${teamId}:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const row = payload.new || payload.old
        if (!row?.team_id || row.team_id === teamId) refreshTeamNotifs()
      })
      .subscribe()
    // Check if this member is frozen
    supabase.from('team_members')
      .select('is_frozen')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => setIsFrozen(data?.is_frozen ?? false))
    return () => { notifChannel.unsubscribe() }
  }, [teamId, user])

  useEffect(() => {
    if (!teamId || !user) { setUnreadMail(0); return }
    const refreshUnreadMail = () => mailService.getUnreadCount(teamId, user.id).then(setUnreadMail)
    refreshUnreadMail()
    window.addEventListener('mail:updated', refreshUnreadMail)
    const channel = supabase.channel(`layout-mail:${teamId}:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'internal_mail',
        filter: `team_id=eq.${teamId}`,
      }, (payload: any) => {
        const row = payload.new || payload.old
        if (row?.receiver_id === user.id) refreshUnreadMail()
      })
      .subscribe()
    return () => {
      window.removeEventListener('mail:updated', refreshUnreadMail)
      channel.unsubscribe()
    }
  }, [teamId, user])

  async function handleLeave() {
    if (!teamId || !user || !leavePassword.trim()) return
    setLeaving(true); setLeaveError('')
    const { error } = await supabase.auth.signInWithPassword({ email: user.email!, password: leavePassword })
    if (error) { setLeaveError('كلمة المرور غير صحيحة'); setLeaving(false); return }
    await teamService.leaveSelf(teamId, user.id)
    setShowLeave(false); setLeavePassword('')
    teamService.getMyTeams(user.id).then(setMyTeams)
    navigate('/')
    setLeaving(false)
  }

  function markRead(n: any) {
    notificationService.markRead(n.id)
    setTeamNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    if (!n.is_read) setUnreadN(prev => Math.max(0, prev - 1))
    if (n.link) {
      navigate(n.link)
      setShowNotif(false)
    }
  }

  function markAllTeamRead() {
    if (!teamId || !user) return
    notificationService.markAllReadForTeam(teamId, user.id)
    setTeamNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadN(0)
  }

  const parent    = isParent(myRole)
  const canAdmin  = canManageTeam(myRole)
  const canFinance = canManageFinance(myRole)
  const canReports = canViewReports(myRole)

  const allTeamNav = [
    { to: `/team/${teamId}`,              icon: Home,          label: 'لوحة الفريق',       exact: true },
    { to: `/team/${teamId}/members`,      icon: Users,         label: 'الأعضاء' },
    { to: `/team/${teamId}/events`,       icon: Calendar,      label: 'المواعيد' },
    { to: `/team/${teamId}/matches`,      icon: Trophy,        label: 'المباريات' },
    { to: `/team/${teamId}/attendance`,   icon: CheckSquare,   label: 'الحضور',             coachOnly: true },
    { to: `/team/${teamId}/leaves`,       icon: Umbrella,      label: 'الإجازات',           parentHide: true },
    { to: `/team/${teamId}/admin-decisions`, icon: Gavel,      label: 'القرارات الإدارية',   adminOnly: true },
    { to: `/team/${teamId}/education`,   icon: GraduationCap, label: 'التعليم',            educationNav: true },
    { to: `/team/${teamId}/players`,      icon: Trophy,        label: 'اللاعبون',           coachOnly: true },
    { to: `/team/${teamId}/scouting`,     icon: Search,        label: 'قسم الكشافين',       scoutingNav: true },
    { to: `/team/${teamId}/training`,     icon: Dumbbell,      label: 'الخطة التدريبية',    trainingNav: true },
    { to: `/team/${teamId}/measurements`, icon: Ruler,         label: 'القياسات والمتابعة', coachOnly: true },
    { to: `/team/${teamId}/points`,       icon: Star,          label: 'النقاط' },
    { to: `/team/${teamId}/chat`,         icon: MessageCircle, label: 'التواصل الداخلي',   badge: unreadDM },
    { to: `/team/${teamId}/announcements`,icon: Bell,          label: 'الإعلانات' },
    { to: `/team/${teamId}/finance`,      icon: DollarSign,    label: 'المالية' },
    { to: `/team/${teamId}/contracts`,    icon: BriefcaseBusiness, label: 'العقود', contractsOnly: true },
    { to: `/team/${teamId}/reports`,      icon: Shield,        label: 'التقارير',           requireReports: true },
    { to: `/team/${teamId}/seasonal`,     icon: FileText,      label: 'تقرير الموسم',      parentHide: true },
    { to: `/team/${teamId}/best-player`,  icon: StarIcon,      label: 'أفضل لاعب',         parentHide: true },
    { to: `/team/${teamId}/invite`,       icon: Mail,          label: 'الدعوات',            adminOnly: true },
    { to: `/team/${teamId}/my-child`,      icon: Baby,          label: 'ابني في الفريق',    parentOnly: true },
    { to: `/team/${teamId}/regulations`,  icon: BookOpen,      label: 'اللوائح والأنظمة' },
    { to: `/team/${teamId}/medical`,      icon: Stethoscope,   label: 'التقارير الطبية',   medicalNav: true },
    { to: `/team/${teamId}/sport-profile`, icon: ClipboardList, label: 'الملف الرياضي',    playerOnly: true },
    { to: `/team/${teamId}/permissions`,  icon: Shield,        label: 'الصلاحيات',         ownerOnly: true, hiddenNav: true },
    { to: `/team/${teamId}/settings`,     icon: Settings,      label: 'الإعدادات',          adminOnly: true },
  ]

  const teamNav = teamId ? allTeamNav.filter(n => {
    if ((n as any).hiddenNav) return false
    if ((n as any).playerOnly && myRole !== 'player') return false
    if ((n as any).parentOnly && !parent) return false
    if (parent && (n as any).parentHide) return false
    if ((n as any).adminOnly && !canAdmin) return false
    if ((n as any).contractsOnly && !canManageContracts(myRole)) return false
    if ((n as any).ownerOnly && myRole !== 'owner') return false
    if ((n as any).coachOnly && !canManageEvents(myRole)) return false
    if ((n as any).requireReports && !canReports) return false
    if ((n as any).scoutingNav && !canViewScouting(myRole)) return false
    if ((n as any).educationNav && !canViewEducation(myRole)) return false
    if ((n as any).trainingNav && !canViewTraining(myRole)) return false
    // Medical nav: show for admin, medical role, or players (they submit their own)
    if ((n as any).medicalNav && !canAdmin && myRole !== 'medical' && myRole !== 'player') return false
    return true
  }) : []

  /* ── Re-usable nav link ── */
  const NavItem = ({ to, icon: Icon, label, badge, exact }: any) => (
    <NavLink to={to} end={exact}
      onClick={() => setOpen(false)}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl cursor-pointer transition-all select-none',
        isActive
          ? 'bg-brand-50 text-brand-700 font-bold'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      )}>
      <Icon size={17} className="flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )

  const SectionLabel = ({ label }: { label: string }) => (
    <p className="text-[11px] font-extrabold text-slate-400 px-3 pt-4 pb-1.5 tracking-widest uppercase select-none">
      {label}
    </p>
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-l border-slate-100" style={{ boxShadow: '2px 0 12px rgba(15,23,42,0.04)' }}>

      {/* ── Logo ── */}
      <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.08)' }}>
          <img src="/logo.png" alt="TA"
            className="w-9 h-9 object-contain"
            onError={e => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
              const parent = t.parentElement
              if (parent && !parent.querySelector('span')) {
                const s = document.createElement('span')
                s.className = 'text-brand-700 font-extrabold text-sm'
                s.textContent = 'TA'
                parent.appendChild(s)
              }
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-sm text-slate-900 truncate">TeamAssist</div>
          <div className="text-xs text-slate-400 truncate max-w-[140px]">
            {teamName || 'إدارة الفرق الرياضية'}
          </div>
        </div>
      </div>

      {/* ── Nav (scrollable) ── */}
      <div className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5">

        {/* ── Team pages ── */}
        {teamNav.length > 0 && (
          <>
            <SectionLabel label="الفريق الحالي" />
            {teamNav.map(n => <NavItem key={n.to} {...n} />)}
          </>
        )}

        {/* ── No team in sidebar ── */}
        {!teamId && myTeams.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-slate-400 leading-relaxed">لم تنضم لأي فريق بعد</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-100 px-3 py-3 flex-shrink-0 space-y-2">
        {isPlatformAdmin && (
          <button onClick={() => { navigate('/admin'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors border border-emerald-200">
            <Shield size={13}/> لوحة إدارة المنصة
          </button>
        )}
        {teamId && myRole && myRole !== 'owner' && (
          <button onClick={() => { setShowLeave(true); setLeavePassword(''); setLeaveError('') }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors">
            <LogOut size={13}/> مغادرة الفريق
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{profile?.full_name}</div>
            <div className="text-xs text-slate-400">{myRole ? ROLE_LABELS[myRole] || myRole : 'عضو'}</div>
          </div>
          <button onClick={signOut} title="خروج"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )

  /* ── Mobile bottom nav ── */
  const isCoachRole = canManageEvents(myRole)
  const mobileNavItems = teamId ? [
    { to: `/team/${teamId}`,            icon: Home,          label: 'الفريق',    exact: true },
    { to: `/team/${teamId}/events`,     icon: Calendar,      label: 'المواعيد' },
    isCoachRole
      ? { to: `/team/${teamId}/attendance`, icon: CheckSquare,   label: 'الحضور' }
      : { to: `/team/${teamId}/announcements`, icon: Bell,       label: 'الإعلانات' },
    { to: `/team/${teamId}/chat`,       icon: MessageCircle, label: 'التواصل',   badge: unreadDM },
    { to: '/',                          icon: Home,          label: 'رئيسي',     exact: true, isHome: true },
  ] : [
    { to: '/',        icon: Home,       label: 'الرئيسية', exact: true },
    { to: '/profile', icon: UserCircle, label: 'حسابي' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F0F4F8' }}>

      {/* Desktop sidebar — fixed right, dvh fixes iOS Safari viewport chrome */}
      <div className="hidden lg:flex w-64 flex-shrink-0 fixed top-0 right-0 z-30" style={{ height: '100dvh' }}>
        <div className="w-full h-full">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-0 right-0 h-full w-72 shadow-2xl animate-slide">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">

        {/* ── Top Header ── */}
        <header className="h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-3 sticky top-0 z-40 flex-shrink-0"
          style={{ boxShadow: '0 1px 8px rgba(15,23,42,0.06)' }}>

          <button className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors" onClick={() => setOpen(true)}>
            <Menu size={20} className="text-slate-600" />
          </button>

          {/* ── Team Switcher Dropdown ── */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setSwitcherOpen(o => !o)}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors max-w-full',
                !teamId && myTeams.length === 0 && 'border border-dashed border-slate-300'
              )}>

              {/* Team icon / placeholder */}
              {teamId || myTeams.length > 0 ? (
                <div className="w-7 h-7 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                  {(() => {
                    const cur = myTeams.find((t: any) => t.id === teamId)
                    return cur?.logo_url
                      ? <img src={cur.logo_url} className="w-full h-full object-cover" alt="" />
                      : (teamName?.[0] || myTeams[0]?.name?.[0] || '؟')
                  })()}
                </div>
              ) : (
                <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Users size={14} className="text-slate-400" />
                </div>
              )}

              <div className="hidden sm:flex flex-col items-start min-w-0">
                <span className={cn(
                  'text-sm font-bold truncate max-w-[160px] leading-tight',
                  teamId ? 'text-slate-700' : 'text-slate-400'
                )}>
                  {teamId
                    ? (teamName || 'الفريق')
                    : myTeams.length > 0
                      ? 'اختر فريقاً'
                      : 'لا يوجد فريق'}
                </span>
                {teamId && myRole && (
                  <span className="text-[11px] text-slate-400 leading-tight">{ROLE_LABELS[myRole] || myRole}</span>
                )}
              </div>
              <ChevronDown size={13} className={cn('text-slate-400 flex-shrink-0 transition-transform', switcherOpen && 'rotate-180')} />
            </button>

            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute top-full mt-2 right-0 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden" style={{ animation: 'scaleIn .12s ease' }}>

                  {/* Active teams */}
                  {myTeams.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-extrabold text-slate-400 px-4 pt-3 pb-1 tracking-widest uppercase">
                        فرقي النشطة ({myTeams.length})
                      </p>
                      {myTeams.map((t: any) => (
                        <button key={t.id}
                          onClick={() => { navigate(`/team/${t.id}`); setSwitcherOpen(false) }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-right',
                            teamId === t.id ? 'bg-brand-50' : ''
                          )}>
                          <div className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden',
                            teamId === t.id ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'
                          )}>
                            {t.logo_url
                              ? <img src={t.logo_url} className="w-full h-full object-cover" alt="" />
                              : t.name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={cn('font-bold truncate text-sm', teamId === t.id ? 'text-brand-700' : 'text-slate-800')}>
                              {t.name}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              <span className="text-xs text-slate-400">{ROLE_LABELS[t.myRole] || t.myRole}</span>
                              {t.sport_type && <span className="text-slate-300">·</span>}
                              {t.sport_type && <span className="text-xs text-slate-500">{t.sport_type}</span>}
                              {t.age_category && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1 font-bold">{t.age_category}</span>}
                            </div>
                          </div>
                          {teamId === t.id && (
                            <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-5 text-center">
                      <p className="text-sm text-slate-500 font-bold mb-1">لم تنضم لأي فريق بعد</p>
                      <p className="text-xs text-slate-400">أنشئ فريقاً أو انضم برمز الدعوة</p>
                    </div>
                  )}

                  {/* Archived teams */}
                  {archivedTeams.length > 0 && (
                    <div className="border-t border-slate-100">
                      <p className="text-[11px] font-extrabold text-slate-400 px-4 pt-3 pb-1 tracking-widest uppercase">
                        الأرشيف
                      </p>
                      {archivedTeams.map((t: any) => (
                        <button key={t.id}
                          onClick={() => { navigate(`/archive/${t.id}`); setSwitcherOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-right">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-400 flex-shrink-0 overflow-hidden grayscale">
                            {t.logo_url
                              ? <img src={t.logo_url} className="w-full h-full object-cover" alt="" />
                              : t.name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate text-sm text-slate-500">{t.name}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-1">
                              <Archive size={10} />
                              <span>أرشيف{t.removedAt ? ` · ${new Date(t.removedAt).toLocaleDateString('ar-SA')}` : ''}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="border-t border-slate-100 p-2 grid grid-cols-2 gap-1">
                    <button onClick={() => { navigate('/create-team'); setSwitcherOpen(false) }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-brand-700 hover:bg-brand-50 transition-colors border border-brand-100">
                      <Plus size={13} /> فريق جديد
                    </button>
                    <button onClick={() => { navigate('/join-team'); setSwitcherOpen(false) }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors border border-slate-200">
                      <LogIn size={13} /> انضمام
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Home */}
          <NavLink to="/" end
            className={({ isActive }) => cn(
              'p-2 rounded-xl hover:bg-slate-100 transition-colors',
              isActive ? 'text-brand-600 bg-brand-50' : 'text-slate-500'
            )}>
            <Home size={19} />
          </NavLink>

          {/* Notifications — team-scoped dropdown, only visible when inside a team */}
          {teamId && (
            <div className="relative">
              <button
                onClick={() => setShowNotif(o => !o)}
                className={cn(
                  'relative p-2 rounded-xl hover:bg-slate-100 transition-colors',
                  showNotif ? 'text-brand-600 bg-brand-50' : 'text-slate-500'
                )}>
                <Bell size={19} />
                {unreadN > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {unreadN > 9 ? '9+' : unreadN}
                  </span>
                )}
              </button>

              {showNotif && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
                  <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden"
                    dir="rtl" style={{ animation: 'scaleIn .12s ease' }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <span className="font-bold text-sm text-slate-800">الإشعارات</span>
                      {unreadN > 0 && (
                        <button onClick={markAllTeamRead}
                          className="text-xs text-brand-600 font-bold hover:underline border-none bg-transparent cursor-pointer p-0">
                          تحديد الكل كمقروء
                        </button>
                      )}
                    </div>
                    <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-50">
                      {teamNotifs.length === 0 ? (
                        <div className="py-10 text-center">
                          <Bell size={26} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-sm text-slate-400">لا توجد إشعارات</p>
                        </div>
                      ) : teamNotifs.map((n: any) => (
                        <button key={n.id}
                          onClick={() => markRead(n)}
                          className={cn(
                            'w-full text-right px-4 py-3 hover:bg-slate-50 transition-colors border-none cursor-pointer',
                            !n.is_read ? 'bg-brand-50/40' : 'bg-white'
                          )}>
                          <div className="flex items-start gap-2.5">
                            <div className="flex-shrink-0 mt-1.5">
                              <span className={cn(
                                'block w-2 h-2 rounded-full',
                                n.is_read ? 'bg-transparent' : 'bg-brand-500'
                              )} />
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <div className="text-sm font-bold text-slate-800 leading-tight">{n.title}</div>
                              {n.body && <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>}
                              <div className="text-[10px] text-slate-400 mt-1">
                                {new Date(n.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(n.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mail inbox — all team members */}
          {teamId && (
            <NavLink to={`/team/${teamId}/mail`}
              className={({ isActive }) => cn(
                'relative p-2 rounded-xl hover:bg-slate-100 transition-colors',
                isActive ? 'text-brand-600 bg-brand-50' : 'text-slate-500'
              )}>
              <Inbox size={19} />
              {unreadMail > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {unreadMail > 9 ? '9+' : unreadMail}
                </span>
              )}
            </NavLink>
          )}

          {/* Profile */}
          <NavLink to="/profile"
            className={({ isActive }) => cn(
              'p-1 rounded-xl transition-colors',
              isActive ? 'ring-2 ring-brand-400 ring-offset-1' : ''
            )}>
            <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="sm" />
          </NavLink>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-6">
          <div className="max-w-5xl mx-auto p-4 lg:p-6">
            {isFrozen && teamId ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-full bg-cyan-100 flex items-center justify-center mb-5">
                  <span className="text-4xl">❄️</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-700 mb-2">عضويتك مجمّدة</h2>
                <p className="text-slate-500 text-sm max-w-xs">
                  تم تجميد عضويتك في هذا الفريق مؤقتاً. تواصل مع مسؤول الفريق لمعرفة السبب أو لرفع التجميد.
                </p>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>

        {/* ── Mobile Bottom Nav ── */}
        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-100"
          style={{ boxShadow: '0 -4px 20px rgba(15,23,42,0.08)' }}>
          <div className="flex justify-around items-stretch px-1 py-1 pb-safe">
            {mobileNavItems.map(({ to, icon: Icon, label, badge, exact }: any) => (
              <NavLink key={to + label} to={to} end={exact}
                className={({ isActive }) => cn(
                  'flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl flex-1 text-[11px] font-bold transition-all',
                  isActive ? 'text-brand-600 bg-brand-50' : 'text-slate-400 hover:text-slate-600'
                )}>
                <span className="relative">
                  <Icon size={21} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      {/* ── Leave Team Modal ── */}
      {showLeave && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <LogOut size={22} className="text-red-500"/>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">مغادرة الفريق</h3>
                <p className="text-xs text-slate-400">{teamName}</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
              ⚠️ <strong>تحذير:</strong> بعد المغادرة لن تتمكن من العودة للفريق إلا إذا أرسل لك مدير الفريق دعوة جديدة.
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">أدخل كلمة المرور للتأكيد</label>
              <input type="password" className="form-input w-full"
                value={leavePassword} onChange={e => { setLeavePassword(e.target.value); setLeaveError('') }}
                placeholder="كلمة المرور"
                onKeyDown={e => e.key === 'Enter' && handleLeave()}/>
              {leaveError && <p className="text-xs text-red-500 mt-1.5">{leaveError}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1 justify-center"
                onClick={() => { setShowLeave(false); setLeavePassword(''); setLeaveError('') }}>
                إلغاء
              </button>
              <button onClick={handleLeave} disabled={leaving || !leavePassword.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {leaving ? '...' : 'مغادرة الفريق'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
