import { Activity, UserRound } from 'lucide-react'
import { cn } from '../../utils/helpers'
import type { AttendanceStatus } from '../../data/sportsAppData'

const statusStyle: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  pending: 'bg-orange-100 text-orange-700',
}

const statusLabel: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'معتذر',
  pending: 'لم يرد',
}

export default function PlayerCard({ player }: { player: any }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 text-lg font-extrabold text-white">
          {player.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-extrabold text-slate-950">{player.name}</h3>
              <p className="text-[15px] font-bold text-slate-500">{player.age} سنة - {player.position}</p>
            </div>
            <span className={cn('rounded-full px-3 py-1 text-[14px] font-extrabold', statusStyle[player.status as AttendanceStatus])}>
              {statusLabel[player.status as AttendanceStatus]}
            </span>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[15px] font-bold text-slate-600">
              <span>نسبة الحضور</span>
              <span>{player.attendance}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-blue-500" style={{ width: `${player.attendance}%` }} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[15px] text-slate-500">
            <Activity size={16} />
            {player.lastActivity}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="rounded-2xl bg-emerald-50 px-3 py-3 text-[16px] font-extrabold text-emerald-700 transition active:scale-[0.98]">
          تسجيل حضور
        </button>
        <button className="rounded-2xl bg-slate-50 px-3 py-3 text-[16px] font-extrabold text-slate-700 transition active:scale-[0.98]">
          <span className="inline-flex items-center gap-1"><UserRound size={17} /> الملف</span>
        </button>
      </div>
    </article>
  )
}
