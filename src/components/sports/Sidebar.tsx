import { useEffect, useState } from 'react'
import {
  Bell,
  CalendarDays,
  FileText,
  Home,
  Mail,
  MessageCircle,
  PlusCircle,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  Trophy,
  UserPlus,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService } from '../../services'
import { cn } from '../../utils/helpers'

const appItems = [
  { to: '/dashboard', label: 'لوحة التحكم', icon: Home },
  { to: '/schedule', label: 'الجدول', icon: CalendarDays },
  { to: '/attendance', label: 'الحضور', icon: ShieldCheck },
  { to: '/players', label: 'اللاعبون', icon: UsersRound },
  { to: '/messages', label: 'الرسائل', icon: MessageCircle },
  { to: '/profile', label: 'الملف الشخصي', icon: UserRound },
]

function NavRow({ to, label, icon: Icon, onNavigate }: any) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[16px] font-extrabold transition',
        isActive ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50',
      )}
    >
      <Icon size={21} />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [teams, setTeams] = useState<any[]>([])

  useEffect(() => {
    if (!user) {
      setTeams([])
      return
    }
    teamService.getMyTeams(user.id).then(setTeams)
  }, [user])

  const teamItems = teamId ? [
    { to: `/team/${teamId}`, label: 'مركز الفريق', icon: Home },
    { to: `/team/${teamId}/members`, label: 'الأعضاء', icon: UsersRound },
    { to: `/team/${teamId}/events`, label: 'المواعيد', icon: CalendarDays },
    { to: `/team/${teamId}/matches`, label: 'المباريات', icon: Trophy },
    { to: `/team/${teamId}/attendance`, label: 'حضور الفريق', icon: ShieldCheck },
    { to: `/team/${teamId}/leaves`, label: 'الإجازات', icon: FileText },
    { to: `/team/${teamId}/players`, label: 'بطاقات اللاعبين', icon: Trophy },
    { to: `/team/${teamId}/points`, label: 'النقاط', icon: Star },
    { to: `/team/${teamId}/chat`, label: 'الشات', icon: MessageCircle },
    { to: `/team/${teamId}/dm`, label: 'رسائل خاصة', icon: Shield },
    { to: `/team/${teamId}/announcements`, label: 'الإعلانات', icon: Bell },
    { to: `/team/${teamId}/finance`, label: 'المالية', icon: Wallet },
    { to: `/team/${teamId}/reports`, label: 'التقارير', icon: FileText },
    { to: `/team/${teamId}/seasonal`, label: 'تقرير الموسم', icon: FileText },
    { to: `/team/${teamId}/best-player`, label: 'أفضل لاعب', icon: Star },
    { to: `/team/${teamId}/invite`, label: 'الدعوات', icon: Mail },
    { to: `/team/${teamId}/permissions`, label: 'الصلاحيات', icon: Shield },
    { to: `/team/${teamId}/settings`, label: 'الإعدادات', icon: Settings },
  ] : []

  return (
    <div className="flex min-h-full flex-col bg-white p-4">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 font-black text-white shadow-lg shadow-emerald-100">
          TA
        </div>
        <div>
          <p className="text-lg font-black text-slate-950">TeamAssist</p>
          <p className="text-[15px] font-bold text-slate-500">إدارة اللاعب والمدرب</p>
        </div>
      </div>

      <nav className="space-y-2">
        <p className="px-2 text-[13px] font-black text-slate-400">التطبيق</p>
        {appItems.map((item) => <NavRow key={item.to} {...item} onNavigate={onNavigate} />)}

        <div className="pt-3">
          <p className="px-2 text-[13px] font-black text-slate-400">إدارة الحساب والفريق</p>
          <NavRow to="/create-team" label="إنشاء فريق" icon={PlusCircle} onNavigate={onNavigate} />
          <NavRow to="/join-team" label="الانضمام لفريق" icon={UserPlus} onNavigate={onNavigate} />
          <NavRow to="/notifications" label="الإشعارات" icon={Bell} onNavigate={onNavigate} />
        </div>

        {teams.length > 0 && (
          <div className="pt-3">
            <p className="px-2 text-[13px] font-black text-slate-400">فرقي</p>
            {teams.map((team) => (
              <NavLink
                key={team.id}
                to={`/team/${team.id}`}
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  'mt-2 flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[16px] font-extrabold transition',
                  isActive ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 text-sm font-black text-emerald-700">
                  {team.logo_url ? <img src={team.logo_url} className="h-full w-full object-cover" /> : team.name?.[0]}
                </span>
                <span className="truncate">{team.name}</span>
              </NavLink>
            ))}
          </div>
        )}

        {teamItems.length > 0 && (
          <div className="pt-3">
            <p className="px-2 text-[13px] font-black text-slate-400">خصائص الفريق</p>
            {teamItems.map((item) => <NavRow key={item.to} {...item} onNavigate={onNavigate} />)}
          </div>
        )}
      </nav>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <p className="text-[16px] font-extrabold text-slate-900">جاهز للتدريب؟</p>
        <p className="mt-1 text-[15px] leading-6 text-slate-500">موعد، حضور، رسالة. كل شيء قريب وواضح.</p>
      </div>
    </div>
  )
}

export default function Sidebar() {
  return (
    <aside className="fixed right-0 top-0 z-30 hidden h-screen w-72 overflow-y-auto border-l border-slate-200 bg-white lg:block">
      <SidebarContent />
    </aside>
  )
}
