import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import {
  Home, Users, Calendar, CheckSquare, MessageCircle, Bell, Swords, Star as StarIcon,
  DollarSign, FileText, Mail, Settings, Star,
  Umbrella, Trophy, LogOut, Menu, ChevronDown, Shield, UserCircle,
  Plus, LogIn, Archive
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui'
import { teamService, notificationService, dmService } from '../../services'
import { cn, ROLE_LABELS, canManageTeam, canManageEvents, canViewReports, canManageFinance, isParent } from '../../utils/helpers'

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
  const [unreadDM, setUnreadDM] = useState(0)
  const [teamName, setTeamName] = useState('')
  const [teamsOpen, setTeamsOpen] = useState(true)

  useEffect(() => {
    if (!user) return
    teamService.getMyTeams(user.id).then(setMyTeams)
    teamService.getMyArchivedTeams(user.id).then(setArchivedTeams)
    notificationService.getAll(user.id).then(ns =>
      setUnreadN(ns.filter((n: any) => !n.is_read).length))
  }, [user])

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getTeam(teamId).then(t => setTeamName(t?.name || ''))
    dmService.getConversations(teamId, user.id).then(convs =>
      setUnreadDM(convs.reduce((s: number, c: any) => s + c.unread, 0)))
  }, [teamId, user])

  const parent    = isParent(myRole)
  const canAdmin  = canManageTeam(myRole)
  const canFinance = canManageFinance(myRole)
  const canReports = canViewReports(myRole)

  const allTeamNav = [
    { to: `/team/${teamId}`,              icon: Home,          label: 'لوحة الفريق',       exact: true },
    { to: `/team/${teamId}/members`,      icon: Users,         label: 'الأعضاء',            parentHide: true },
    { to: `/team/${teamId}/events`,       icon: Calendar,      label: 'المواعيد' },
    { to: `/team/${teamId}/attendance`,   icon: CheckSquare,   label: 'الحضور',             coachOnly: true },
    { to: `/team/${teamId}/leaves`,       icon: Umbrella,      label: 'الإجازات',           parentHide: true },
    { to: `/team/${teamId}/players`,      icon: Trophy,        label: 'بطاقات اللاعبين',   parentHide: true },
    { to: `/team/${teamId}/points`,       icon: Star,          label: 'النقاط',             parentHide: true },
    { to: `/team/${teamId}/chat`,         icon: MessageCircle, label: 'التواصل الداخلي',   badge: unreadDM, parentHide: true },
    { to: `/team/${teamId}/announcements`,icon: Bell,          label: 'الإعلانات',          parentHide: true },
    { to: `/team/${teamId}/finance`,      icon: DollarSign,    label: 'المالية',            parentHide: true },
    { to: `/team/${teamId}/reports`,      icon: Shield,        label: 'التقارير',           requireReports: true },
    { to: `/team/${teamId}/seasonal`,     icon: FileText,      label: 'تقرير الموسم',      parentHide: true },
    { to: `/team/${teamId}/best-player`,  icon: StarIcon,      label: 'أفضل لاعب',         parentHide: true },
    { to: `/team/${teamId}/invite`,       icon: Mail,          label: 'الدعوات',            adminOnly: true },
    { to: `/team/${teamId}/permissions`,  icon: Shield,        label: 'الصلاحيات',         ownerOnly: true },
    { to: `/team/${teamId}/settings`,     icon: Settings,      label: 'الإعدادات',          adminOnly: true },
  ]

  const teamNav = teamId ? allTeamNav.filter(n => {
    if (parent && (n as any).parentHide) return false
    if ((n as any).adminOnly && !canAdmin) return false
    if ((n as any).ownerOnly && myRole !== 'owner') return false
    if ((n as any).coachOnly && !canManageEvents(myRole)) return false
    if ((n as any).requireReports && !canReports) return false
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
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)', boxShadow: '0 3px 10px rgba(29,158,117,0.35)' }}>
          <img src="/logo.png" alt="TA"
            className="w-7 h-7 object-contain"
            onError={e => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
              const parent = t.parentElement
              if (parent && !parent.querySelector('span')) {
                const s = document.createElement('span')
                s.className = 'text-white font-extrabold text-sm'
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

        {/* ── Teams list ── */}
        {myTeams.length > 0 && (
          <div>
            <button onClick={() => setTeamsOpen(o => !o)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl w-full text-slate-500 hover:bg-slate-50 transition-all mt-1 select-none">
              <Users size={17} />
              <span className="flex-1 text-right font-bold">فرقي ({myTeams.length})</span>
              <ChevronDown size={13} className={cn('transition-transform flex-shrink-0', teamsOpen && 'rotate-180')} />
            </button>
            {teamsOpen && myTeams.map((t: any) => (
              <button key={t.id}
                onClick={() => { navigate(`/team/${t.id}`); setOpen(false) }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm rounded-xl w-full text-right transition-all',
                  teamId === t.id
                    ? 'bg-brand-50 text-brand-700 font-bold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                )}>
                <div className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden',
                  teamId === t.id ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'
                )}>
                  {t.logo_url
                    ? <img src={t.logo_url} className="w-full h-full object-cover" />
                    : t.name[0]}
                </div>
                <span className="flex-1 truncate text-right">{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Team pages ── */}
        {teamNav.length > 0 && (
          <>
            <SectionLabel label="الفريق الحالي" />
            {teamNav.map(n => <NavItem key={n.to} {...n} />)}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-100 px-3 py-3 flex-shrink-0">
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
    { to: '/',              icon: Home,        label: 'الرئيسية', exact: true },
    { to: '/notifications', icon: Bell,        label: 'إشعارات',  badge: unreadN },
    { to: '/profile',       icon: UserCircle,  label: 'حسابي' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F0F4F8' }}>

      {/* Desktop sidebar — fixed right */}
      <div className="hidden lg:flex w-64 flex-shrink-0 fixed top-0 right-0 h-screen z-30">
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

          {/* Team Switcher */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setSwitcherOpen(o => !o)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors max-w-full">
              <div className="w-7 h-7 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                {(() => {
                  const cur = myTeams.find((t: any) => t.id === teamId)
                  return cur?.logo_url
                    ? <img src={cur.logo_url} className="w-full h-full object-cover" alt="" />
                    : (teamName?.[0] || 'T')
                })()}
              </div>
              <div className="hidden sm:flex flex-col items-start min-w-0">
                <span className="text-sm font-bold text-slate-700 truncate max-w-[160px] leading-tight">
                  {teamName || 'TeamAssist'}
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
                <div className="absolute top-full mt-2 right-0 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-scale-in">

                  {/* Active teams */}
                  {myTeams.length > 0 && (
                    <div>
                      <p className="text-[11px] font-extrabold text-slate-400 px-4 pt-3 pb-1 tracking-widest uppercase">
                        فرقي النشطة
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
                            <div className="text-xs text-slate-400">{ROLE_LABELS[t.myRole] || t.myRole}</div>
                          </div>
                          {teamId === t.id && (
                            <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
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
                              <span>
                                أرشيف
                                {t.removedAt ? ` · ${new Date(t.removedAt).toLocaleDateString('ar-SA')}` : ''}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="border-t border-slate-100 p-2 grid grid-cols-2 gap-1">
                    <button onClick={() => { navigate('/create-team'); setSwitcherOpen(false) }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-brand-700 hover:bg-brand-50 transition-colors">
                      <Plus size={13} /> فريق جديد
                    </button>
                    <button onClick={() => { navigate('/join-team'); setSwitcherOpen(false) }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
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

          {/* Notifications */}
          <NavLink to="/notifications"
            className={({ isActive }) => cn(
              'relative p-2 rounded-xl hover:bg-slate-100 transition-colors',
              isActive ? 'text-brand-600 bg-brand-50' : 'text-slate-500'
            )}>
            <Bell size={19} />
            {unreadN > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {unreadN > 9 ? '9+' : unreadN}
              </span>
            )}
          </NavLink>

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
            <Outlet />
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
    </div>
  )
}
