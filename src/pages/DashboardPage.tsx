import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LogIn, Shield, Calendar, CheckSquare, DollarSign } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { teamService, eventService, financeService } from '../services'
import { Spinner, EmptyState, AttendanceButton, Avatar } from '../components/ui'
import { formatDate, EVENT_CONFIG, isEventLocked } from '../utils/helpers'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nextEvents, setNextEvents] = useState<{ team: any; event: any; myAtt: string }[]>([])
  const [myStats, setMyStats] = useState({ matchAttPct: 0, trainingAttPct: 0, matchTotal: 0, trainingTotal: 0, teamCount: 0, upcomingCount: 0, unpaidCount: 0 })

  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: arSA })

  useEffect(() => {
    if (!user) return
    teamService.getMyTeams(user.id).then(async ts => {
      setTeams(ts)
      let matchTotal = 0, matchPresent = 0
      let trainingTotal = 0, trainingPresent = 0
      let upcomingThisMonth = 0, unpaidCount = 0
      const evData: any[] = []

      for (const t of ts) {
        // Next event for quick attendance
        const next = await eventService.getNextEvent(t.id)
        if (next) {
          const att = await eventService.getAttendance(next.id)
          const myAtt = att.find((a: any) => a.user_id === user.id)
          evData.push({ team: t, event: next, myAtt: myAtt?.status || 'present' })
        }
        // Upcoming this month
        const allEvs = await eventService.getTeamEvents(t.id)
        const now = new Date()
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        upcomingThisMonth += allEvs.filter(e =>
          new Date(e.start_datetime) >= now && new Date(e.start_datetime) <= monthEnd
        ).length
        // Split attendance: matches vs trainings
        const myAtt = await eventService.getMyAttendance(t.id, user.id)
        myAtt.forEach((a: any) => {
          const ev = allEvs.find((e: any) => e.id === a.event_id)
          const isPresent = a.status === 'present' || a.status === 'late'
          if (ev?.event_type === 'match') {
            matchTotal++
            if (isPresent) matchPresent++
          } else if (ev?.event_type === 'training') {
            trainingTotal++
            if (isPresent) trainingPresent++
          }
        })
        // Finance
        try {
          const fin = await financeService.getPlayerFinance(t.id, user.id)
          fin.obligations.forEach((o: any) => {
            const paid = fin.payments.find((p: any) => p.obligation_id === o.id)
            if (!paid || paid.paid_amount < o.amount) unpaidCount++
          })
        } catch {}
      }

      setNextEvents(evData)
      setMyStats({
        matchAttPct: matchTotal ? Math.round(matchPresent / matchTotal * 100) : 0,
        trainingAttPct: trainingTotal ? Math.round(trainingPresent / trainingTotal * 100) : 0,
        matchTotal, trainingTotal,
        teamCount: ts.length,
        upcomingCount: upcomingThisMonth,
        unpaidCount
      })
      setLoading(false)
    })
  }, [user])

  async function setAttendance(teamId: string, eventId: string, status: string, idx: number) {
    if (!user) return
    await eventService.setAttendance({ event_id: eventId, team_id: teamId, user_id: user.id, status })
    setNextEvents(prev => prev.map((e, i) => i === idx ? { ...e, myAtt: status } : e))
  }

  const roleColor: Record<string, string> = {
    owner: 'bg-emerald-100 text-emerald-800', head_coach: 'bg-blue-100 text-blue-800',
    player: 'bg-slate-100 text-slate-600', administrator: 'bg-purple-100 text-purple-800',
    assistant_coach: 'bg-sky-100 text-sky-800'
  }
  const roleLabel: Record<string, string> = {
    owner: 'مالك', head_coach: 'مدرب رئيسي', player: 'لاعب',
    administrator: 'إداري', assistant_coach: 'مساعد مدرب'
  }

  return (
    <div>
      {/* Welcome hero */}
      <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 mb-5 text-white">
        <div className="flex items-center gap-4">
          <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="lg"
            className="ring-4 ring-white/30 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-75">مرحباً بك</p>
            <h1 className="text-xl font-bold truncate">{profile?.full_name}</h1>
          </div>
        </div>
      </div>

      {/* Personal Stats */}
      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="stat-box">
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">🏆</span>
              <span className="text-xs text-slate-400">{myStats.matchTotal} مباراة</span>
            </div>
            <div className="stat-value text-blue-600">{myStats.matchAttPct}%</div>
            <div className="stat-label">حضور المباريات</div>
          </div>
          <div className="stat-box">
            <div className="flex items-center justify-between mb-1">
              <span className="text-lg">⚽</span>
              <span className="text-xs text-slate-400">{myStats.trainingTotal} تدريب</span>
            </div>
            <div className="stat-value text-brand-600">{myStats.trainingAttPct}%</div>
            <div className="stat-label">حضور التدريبات</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{myStats.upcomingCount}</div>
            <div className="stat-label">مواعيد {monthLabel}</div>
          </div>
          <div className="stat-box">
            <div className={`stat-value ${myStats.unpaidCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {myStats.unpaidCount}
            </div>
            <div className="stat-label">مستحقات غير مدفوعة</div>
          </div>
        </div>
      )}

      {/* Quick Attendance - next upcoming events */}
      {nextEvents.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Calendar size={15} className="text-brand-500" />
            أقرب موعد — سجّل حضورك
          </h2>
          {nextEvents.map((item, i) => {
            const cfg = EVENT_CONFIG[item.event.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
            const locked = isEventLocked(item.event.start_datetime)
            return (
              <div key={i} className={`card mb-3 border-r-4 ${cfg.borderClass}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{cfg.icon}</span>
                      <span className="font-bold text-sm">{item.event.title}</span>
                      {locked && <span className="badge badge-red text-xs">مغلق</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(item.event.start_datetime)} · {item.event.start_datetime.slice(11, 16)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{item.team.name}</div>
                  </div>
                  <span className="badge flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-2">حالتك في هذا الموعد:</p>
                  <AttendanceButton status={item.myAtt} locked={locked}
                    onSelect={s => setAttendance(item.team.id, item.event.id, s, i)} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button onClick={() => navigate('/create-team')} className="card-hover flex items-center gap-3 mb-0">
          <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Plus size={20} className="text-brand-600" />
          </div>
          <div className="text-right">
            <div className="font-bold text-sm">إنشاء فريق</div>
            <div className="text-xs text-slate-400">فريق جديد</div>
          </div>
        </button>
        <button onClick={() => navigate('/join-team')} className="card-hover flex items-center gap-3 mb-0">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <LogIn size={20} className="text-blue-600" />
          </div>
          <div className="text-right">
            <div className="font-bold text-sm">الانضمام</div>
            <div className="text-xs text-slate-400">بكود الدعوة</div>
          </div>
        </button>
      </div>

      {/* Teams list */}
      <h2 className="text-sm font-bold text-slate-700 mb-3">فرقي ({teams.length})</h2>
      {loading ? <div className="flex justify-center py-10"><Spinner /></div>
        : teams.length === 0
          ? <div className="card"><EmptyState icon={<Shield size={28} />} title="لا توجد فرق" description="أنشئ فريقاً أو انضم لفريق موجود" /></div>
          : <div className="space-y-3">
              {teams.map((t: any) => (
                <div key={t.id} onClick={() => navigate(`/team/${t.id}`)} className="card-hover flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-600">
                    {t.logo_url ? <img src={t.logo_url} className="w-full h-full object-cover" /> : t.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.sport_type} · {t.city || '—'}</div>
                  </div>
                  <span className={`badge ${roleColor[t.myRole] || 'bg-slate-100 text-slate-600'}`}>
                    {roleLabel[t.myRole] || t.myRole}
                  </span>
                </div>
              ))}
            </div>}
    </div>
  )
}
