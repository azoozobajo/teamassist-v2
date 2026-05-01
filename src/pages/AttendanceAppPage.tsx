import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import AttendanceButton from '../components/sports/AttendanceButton'
import { AttendanceBarChart, AttendancePieChart } from '../components/sports/AttendanceChart'
import DashboardCard from '../components/sports/DashboardCard'
import { attendanceSplit, players, upcomingTraining, weeklyAttendance, type AttendanceStatus, type UserRole } from '../data/sportsAppData'

export default function AttendanceAppPage() {
  const { role } = useOutletContext<{ role: UserRole }>()
  const [status, setStatus] = useState<AttendanceStatus>('pending')

  if (role === 'player') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-slate-950">الحضور</h1>
        <DashboardCard title={upcomingTraining.title} hint={`${upcomingTraining.date} - ${upcomingTraining.time} - ${upcomingTraining.location}`}>
          <div className="mt-4">
            <AttendanceButton status={status} onChange={setStatus} />
          </div>
        </DashboardCard>
        <AttendanceBarChart data={weeklyAttendance} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-slate-950">إدارة الحضور</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <AttendanceBarChart data={weeklyAttendance} />
        <AttendancePieChart data={attendanceSplit} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {players.map((player) => (
          <DashboardCard key={player.id} title={player.name} hint={`${player.position} - ${player.attendance}% حضور`}>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="rounded-2xl bg-emerald-600 px-3 py-3 text-[16px] font-extrabold text-white">حاضر</button>
              <button className="rounded-2xl bg-red-50 px-3 py-3 text-[16px] font-extrabold text-red-600">غائب</button>
            </div>
          </DashboardCard>
        ))}
      </div>
    </div>
  )
}
