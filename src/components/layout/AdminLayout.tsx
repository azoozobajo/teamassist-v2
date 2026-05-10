import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { BarChart2, Users, Shield, LogOut, Menu, X, Home, Settings, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { adminService } from '../../services'
import { cn } from '../../utils/helpers'

const nav = [
  { to: '/admin',        icon: BarChart2, label: 'الإحصائيات',   exact: true },
  { to: '/admin/teams',  icon: Shield,    label: 'الفرق' },
  { to: '/admin/users',  icon: Users,     label: 'المستخدمون' },
]

export default function AdminLayout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) return
    adminService.isPlatformAdmin(user.id).then(v => {
      setIsAdmin(v)
      if (!v) navigate('/', { replace: true })
    })
  }, [user])

  if (isAdmin === null) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full"/>
    </div>
  )
  if (!isAdmin) return null

  const NavItem = ({ to, icon: Icon, label, exact }: any) => (
    <NavLink to={to} end={exact}
      onClick={() => setOpen(false)}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all select-none cursor-pointer',
        isActive
          ? 'bg-emerald-600 text-white font-bold'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      )}>
      <Icon size={17} className="flex-shrink-0" />
      <span>{label}</span>
      {!open && <ChevronRight size={14} className="mr-auto opacity-40"/>}
    </NavLink>
  )

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-white"/>
        </div>
        <div>
          <div className="text-white font-bold text-sm">TeamAssist</div>
          <div className="text-emerald-400 text-xs font-bold">لوحة الإدارة</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        <p className="text-[10px] text-slate-600 font-extrabold px-3 pb-1 pt-2 tracking-widest uppercase">القائمة الرئيسية</p>
        {nav.map(n => <NavItem key={n.to} {...n}/>)}

        <p className="text-[10px] text-slate-600 font-extrabold px-3 pb-1 pt-4 tracking-widest uppercase">نظام المستخدمين</p>
        <button onClick={() => { navigate('/'); setOpen(false) }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-white w-full transition-all">
          <Home size={17}/><span>العودة للتطبيق</span>
        </button>
      </div>

      {/* User */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-emerald-800 flex items-center justify-center text-emerald-200 text-xs font-bold">
            {profile?.full_name?.[0] || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{profile?.full_name}</div>
            <div className="text-emerald-400 text-[10px]">Platform Admin</div>
          </div>
        </div>
        <button onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-red-400 hover:bg-red-900/30 text-xs transition-all">
          <LogOut size={14}/> تسجيل الخروج
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-slate-950" dir="rtl">
      {/* Desktop sidebar */}
      <div className="hidden md:block w-56 flex-shrink-0 fixed right-0 inset-y-0">
        <SidebarContent/>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden" dir="rtl">
          <div className="fixed inset-0 bg-black/70" onClick={() => setOpen(false)}/>
          <div className="relative w-56 mr-auto">
            <SidebarContent/>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 md:mr-56 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={20}/>
          </button>
          <div className="text-white font-bold text-sm">TeamAssist Admin</div>
          <div className="mr-auto">
            <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">Admin</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 text-white">
          <Outlet/>
        </main>
      </div>
    </div>
  )
}
