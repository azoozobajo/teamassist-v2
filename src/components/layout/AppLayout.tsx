import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom'
import {
  Home, Users, Calendar, CheckSquare, MessageCircle, Bell, Swords,
  DollarSign, FileText, Mail, Settings, Star, Lock,
  Umbrella, Trophy, LogOut, Menu, ChevronDown, Shield
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Avatar } from '../ui'
import { teamService, notificationService, dmService } from '../../services'
import { cn, ROLE_LABELS, canManageTeam, canViewReports, canManageFinance, isParent } from '../../utils/helpers'

export default function AppLayout() {
  const { user, profile, signOut } = useAuth()
  const { teamId } = useParams()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [myTeams, setMyTeams] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [unreadN, setUnreadN] = useState(0)
  const [unreadDM, setUnreadDM] = useState(0)
  const [teamName, setTeamName] = useState('')
  const [teamsOpen, setTeamsOpen] = useState(true)

  useEffect(() => {
    if (!user) return
    teamService.getMyTeams(user.id).then(setMyTeams)
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

  const parent = isParent(myRole)
  const canAdmin = canManageTeam(myRole)
  const canFinance = canManageFinance(myRole)
  const canReports = canViewReports(myRole)

  const allTeamNav = [
    { to: `/team/${teamId}`, icon: Home, label: 'لوحة الفريق', exact: true, always: true },
    { to: `/team/${teamId}/members`, icon: Users, label: 'الأعضاء', parentHide: true },
    { to: `/team/${teamId}/events`, icon: Calendar, label: 'المواعيد', always: true },
    { to: `/team/${teamId}/matches`, icon: Swords, label: 'المباريات', always: true },
    { to: `/team/${teamId}/attendance`, icon: CheckSquare, label: 'الحضور', parentHide: true },
    { to: `/team/${teamId}/leaves`, icon: Umbrella, label: 'الإجازات', parentHide: true },
    { to: `/team/${teamId}/players`, icon: Trophy, label: 'بطاقات اللاعبين', parentHide: true },
    { to: `/team/${teamId}/points`, icon: Star, label: 'النقاط', parentHide: true },
    { to: `/team/${teamId}/chat`, icon: MessageCircle, label: 'الشات', parentHide: true },
    { to: `/team/${teamId}/dm`, icon: Lock, label: 'رسائل خاصة', badge: unreadDM, parentHide: true },
    { to: `/team/${teamId}/announcements`, icon: Bell, label: 'الإعلانات', parentHide: true },
    { to: `/team/${teamId}/finance`, icon: DollarSign, label: 'المالية', requireFinance: true },
    { to: `/team/${teamId}/reports`, icon: Shield, label: 'التقارير', requireReports: true },
    { to: `/team/${teamId}/seasonal`, icon: FileText, label: 'تقرير الموسم', parentHide: true },
    { to: `/team/${teamId}/invite`, icon: Mail, label: 'الدعوات', adminOnly: true },
    { to: `/team/${teamId}/settings`, icon: Settings, label: 'الإعدادات', adminOnly: true },
  ]

  const teamNav = teamId ? allTeamNav.filter(n => {
    if (parent && n.parentHide) return false
    if (n.adminOnly && !canAdmin) return false
    if (n.requireFinance && !canFinance) return false
    if (n.requireReports && !canReports) return false
    return true
  }) : []

  const NavItem = ({ to, icon: Icon, label, badge, exact }: any) => (
    <NavLink to={to} end={exact}
      onClick={() => setOpen(false)}
      className={({ isActive }) => cn(
        'flex items-center gap-2 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all select-none',
        isActive
          ? 'bg-emerald-50 text-emerald-800 font-bold'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      )}>
      <Icon size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-l border-slate-100 shadow-sm">
      {/* Logo */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
        <img src="/logo.png" alt="TeamAssist" className="w-9 h-9 rounded-xl object-contain bg-black p-0.5"/>
        <div>
          <div className="font-bold text-sm">TeamAssist</div>
          <div className="text-xs text-slate-400 truncate max-w-[120px]">{teamName || 'إدارة الفرق'}</div>
        </div>
      </div>

      {/* Nav — scrollable area */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <p className="text-xs font-bold text-slate-400 px-2 py-1">الرئيسية</p>
        <NavItem to="/" icon={Home} label="البداية" exact />
        <NavLink to="/notifications" onClick={() => setOpen(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-2 px-3 py-2 text-xs rounded-xl cursor-pointer transition-all',
            isActive ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-500 hover:bg-slate-50'
          )}>
          <Bell size={14} />
          <span className="flex-1">الإشعارات</span>
          {unreadN > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">{unreadN}</span>}
        </NavLink>

        {/* Teams list */}
        {myTeams.length > 0 && (
          <div>
            <button onClick={() => setTeamsOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-xl w-full text-slate-500 hover:bg-slate-50 transition-all">
              <Users size={14} />
              <span className="flex-1 text-right">فرقي ({myTeams.length})</span>
              <ChevronDown size={12} className={cn('transition-transform flex-shrink-0', teamsOpen && 'rotate-180')} />
            </button>
            {teamsOpen && myTeams.map((t: any) => (
              <button key={t.id}
                onClick={() => { navigate(`/team/${t.id}`); setOpen(false) }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl w-full text-right mr-2 transition-all',
                  teamId === t.id ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-500 hover:bg-slate-50'
                )}>
                <div className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {t.name[0]}
                </div>
                <span className="flex-1 truncate">{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Team pages */}
        {teamNav.length > 0 && (
          <>
            <p className="text-xs font-bold text-slate-400 px-2 py-1 mt-2">الفريق الحالي</p>
            {teamNav.map(n => <NavItem key={n.to} {...n} />)}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 p-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate">{profile?.full_name}</div>
            <div className="text-xs text-slate-400">{myRole ? ROLE_LABELS[myRole] || myRole : 'عضو'}</div>
          </div>
          <button onClick={signOut} title="خروج"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar - fixed, no scroll */}
      <div className="hidden lg:flex w-56 flex-shrink-0 fixed top-0 right-0 h-screen z-30">
        <div className="w-full h-full">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-0 right-0 h-full w-60 shadow-2xl animate-slide">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:mr-56">
        <header className="h-14 bg-white border-b border-slate-100 flex items-center px-4 gap-3 sticky top-0 z-40 flex-shrink-0">
          <button className="lg:hidden p-1.5 rounded-xl hover:bg-slate-100 transition-colors" onClick={() => setOpen(true)}>
            <Menu size={18} className="text-slate-500" />
          </button>
          <div className="flex-1" />
          <NavLink to="/notifications" className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <Bell size={18} />
            {unreadN > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadN > 9 ? '9+' : unreadN}
              </span>
            )}
          </NavLink>
          <NavLink to="/profile">
            <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="sm" />
          </NavLink>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
