import { CalendarDays, Clock3, UserCheck, UserX } from 'lucide-react'
import DashboardCard from './DashboardCard'

export default function CoachSummary({ summary }: { summary: any }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <DashboardCard title="تدريبات اليوم" value={summary.trainingsToday} hint="جلسات مجدولة" icon={<CalendarDays size={20} />} tone="blue" />
      <DashboardCard title="متوقع حضورهم" value={summary.expectedPlayers} hint="لاعب جاهز" icon={<UserCheck size={20} />} tone="emerald" />
      <DashboardCard title="الغائبون" value={summary.absentPlayers} hint="اعتذار مؤكد" icon={<UserX size={20} />} tone="red" />
      <DashboardCard title="لم يردوا" value={summary.pendingPlayers} hint="يحتاج متابعة" icon={<Clock3 size={20} />} tone="orange" />
    </div>
  )
}
