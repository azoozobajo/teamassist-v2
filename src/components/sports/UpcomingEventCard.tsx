import { CalendarClock, MapPin, Shield, Shirt } from 'lucide-react'
import DashboardCard from './DashboardCard'

export function UpcomingTrainingCard({ event }: { event: any }) {
  return (
    <DashboardCard title="التدريب القادم" icon={<CalendarClock size={21} />} tone="emerald" className="bg-gradient-to-br from-white to-emerald-50/70">
      <div className="space-y-3">
        <div>
          <p className="text-xl font-extrabold text-slate-950">{event.title}</p>
          <p className="text-[16px] font-bold text-emerald-700">{event.day} - {event.date} - {event.time}</p>
        </div>
        <div className="flex items-center gap-2 text-[16px] text-slate-600">
          <MapPin size={18} className="text-slate-400" />
          <span>{event.location}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[15px] font-bold text-emerald-700">{event.type}</span>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-[15px] font-bold text-blue-700">{event.notes}</span>
        </div>
      </div>
    </DashboardCard>
  )
}

export function UpcomingMatchCard({ match }: { match: any }) {
  return (
    <DashboardCard title="المباراة القادمة" icon={<Shield size={21} />} tone="blue">
      <div className="space-y-3">
        <p className="text-xl font-extrabold text-slate-950">ضد {match.opponent}</p>
        <p className="text-[16px] font-bold text-blue-700">{match.date} - {match.time}</p>
        <div className="flex items-center gap-2 text-[16px] text-slate-600">
          <MapPin size={18} className="text-slate-400" />
          <span>{match.location}</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-[16px] font-bold text-slate-700">
          <Shirt size={18} className="text-blue-600" />
          {match.kit}
        </div>
      </div>
    </DashboardCard>
  )
}
