import { CalendarDays, Home, MessageCircle, UserRound, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../utils/helpers'

const items = [
  { to: '/dashboard', label: 'الرئيسية', icon: Home },
  { to: '/schedule', label: 'الجدول', icon: CalendarDays },
  { to: '/attendance', label: 'الحضور', icon: UsersRound },
  { to: '/messages', label: 'الرسائل', icon: MessageCircle },
  { to: '/profile', label: 'حسابي', icon: UserRound },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-2 pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-extrabold transition',
              isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 active:bg-slate-50',
            )}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
