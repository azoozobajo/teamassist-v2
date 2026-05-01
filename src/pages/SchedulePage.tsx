import { CalendarDays, MapPin, Plus } from 'lucide-react'
import DashboardCard from '../components/sports/DashboardCard'
import { scheduleEvents } from '../data/sportsAppData'

export default function SchedulePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">الجدول</h1>
          <p className="text-[16px] font-bold text-slate-500">التدريبات والمباريات القادمة</p>
        </div>
        <button className="flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-[16px] font-extrabold text-white">
          <Plus size={20} />
          جديد
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {scheduleEvents.map((event) => (
          <DashboardCard key={event.id} title={event.title} icon={<CalendarDays size={21} />} tone={event.kind === 'match' ? 'blue' : 'emerald'}>
            <p className="text-[16px] font-extrabold text-slate-700">{event.date} - {event.time}</p>
            <p className="mt-3 flex items-center gap-2 text-[16px] text-slate-500"><MapPin size={18} /> {event.location}</p>
            <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[15px] font-extrabold text-slate-700">
              {event.kind === 'match' ? 'مباراة' : 'تدريب'}
            </span>
          </DashboardCard>
        ))}
      </div>
    </div>
  )
}
