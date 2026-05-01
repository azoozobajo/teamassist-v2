import { Check, X } from 'lucide-react'
import { cn } from '../../utils/helpers'
import type { AttendanceStatus } from '../../data/sportsAppData'

export default function AttendanceButton({
  status,
  onChange,
}: {
  status: AttendanceStatus
  onChange: (status: AttendanceStatus) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        onClick={() => onChange('present')}
        className={cn(
          'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[17px] font-extrabold shadow-sm transition-all active:scale-[0.98]',
          status === 'present' ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
        )}
      >
        <Check size={22} />
        سأحضر
      </button>
      <button
        onClick={() => onChange('absent')}
        className={cn(
          'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[17px] font-extrabold shadow-sm transition-all active:scale-[0.98]',
          status === 'absent' ? 'bg-red-600 text-white shadow-red-200' : 'bg-white text-red-600 ring-1 ring-red-100 hover:bg-red-50',
        )}
      >
        <X size={22} />
        لن أحضر
      </button>
    </div>
  )
}
