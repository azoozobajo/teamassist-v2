import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, leaveService } from '../../services'
import { Spinner, AttendanceButton } from '../../components/ui'
import { formatDate, EVENT_CONFIG, canManageTeam, isEventLocked } from '../../utils/helpers'
import { Copy, CheckCircle, Users, Calendar, Umbrella, CheckSquare } from 'lucide-react'

export default function TeamDashboard() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [myAtt, setMyAtt] = useState('present')
  const [attStats, setAttStats] = useState({ present: 0, absent: 0, uncertain: 0, late: 0, total: 0 })

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getTeam(teamId),
      teamService.getMembers(teamId),
      eventService.getUpcomingEvents(teamId, 5),
      teamService.getMyRole(teamId, user.id),
      leaveService.getAll(teamId),
    ]).then(([t, m, e, r, l]) => {
      setTeam(t); setMembers(m); setEvents(e); setMyRole(r || ''); setLeaves(l)
      if (e.length) {
        setNextEvent(e[0])
        eventService.getAttendance(e[0].id).then(att => {
          const mine = att.find((a: any) => a.user_id === user.id)
          setMyAtt(mine?.status || 'present')
          // Overall stats for next event
          setAttStats({
            present: att.filter((a: any) => a.status === 'present').length,
            absent:  att.filter((a: any) => a.status === 'absent').length,
            uncertain: att.filter((a: any) => a.status === 'uncertain').length,
            late:    att.filter((a: any) => a.status === 'late').length,
            total:   att.length
          })
        })
      }
      setLoading(false)
    })
  }, [teamId, user])

  const copyCode = () => {
    navigator.clipboard?.writeText(team.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function setAttendance(status: string) {
    if (!nextEvent || !user || !teamId) return
    await eventService.setAttendance({ event_id: nextEvent.id, team_id: teamId, user_id: user.id, status })
    setMyAtt(status)
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!team) return <div className="text-center text-slate-400 py-10">الفريق غير موجود</div>

  const pending = leaves.filter(l => l.status === 'pending')
  const isAdmin = canManageTeam(myRole)
  const cfg = nextEvent ? EVENT_CONFIG[nextEvent.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other : null
  const locked = nextEvent ? isEventLocked(nextEvent.start_datetime) : false

  return (
    <div>
      {/* Team Hero */}
      <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 mb-5 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl font-bold overflow-hidden flex-shrink-0">
            {team.logo_url ? <img src={team.logo_url} className="w-full h-full object-cover" /> : team.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold truncate">{team.name}</div>
            <div className="text-sm opacity-80">{team.sport_type} · {team.age_category} · {team.city}</div>
            {isAdmin && (
              <button onClick={copyCode}
                className="flex items-center gap-2 mt-2 bg-white/15 hover:bg-white/25 rounded-xl px-3 py-1.5 text-sm transition-colors border-none cursor-pointer">
                {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                <span className="font-mono tracking-wider">{team.invite_code}</span>
                <span className="text-xs opacity-70">{copied ? 'تم النسخ' : 'نسخ'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Team Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-box cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => navigate(`/team/${teamId}/members`)}>
          <div className="text-2xl mb-1">👥</div>
          <div className="stat-value">{members.length}</div>
          <div className="stat-label">الأعضاء</div>
        </div>
        <div className="stat-box cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => navigate(`/team/${teamId}/events`)}>
          <div className="text-2xl mb-1">📅</div>
          <div className="stat-value">{events.length}</div>
          <div className="stat-label">مواعيد قادمة</div>
        </div>
        <div className="stat-box cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => navigate(`/team/${teamId}/attendance`)}>
          <div className="text-2xl mb-1">✅</div>
          <div className="stat-value text-brand-600">
            {attStats.total ? Math.round(attStats.present / attStats.total * 100) : 0}%
          </div>
          <div className="stat-label">حضور آخر موعد</div>
        </div>
        <div className={`stat-box cursor-pointer transition-colors ${pending.length > 0 ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-100'}`}
          onClick={() => navigate(`/team/${teamId}/leaves`)}>
          <div className="text-2xl mb-1">🏖️</div>
          <div className={`stat-value ${pending.length > 0 ? 'text-amber-600' : ''}`}>{pending.length}</div>
          <div className="stat-label">طلبات إجازة</div>
        </div>
      </div>

      {/* Next Event Attendance */}
      {nextEvent && (
        <div className={`card mb-5 border-r-4 ${cfg?.borderClass || 'border-brand-500'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{cfg?.icon}</span>
                <span className="font-bold text-sm">{nextEvent.title}</span>
                {locked && <span className="badge badge-red text-xs">مغلق</span>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{formatDate(nextEvent.start_datetime)} · {nextEvent.start_datetime.slice(11, 16)}</div>
            </div>
            <span className="badge" style={{ background: cfg?.bg, color: cfg?.color }}>{cfg?.label}</span>
          </div>
          {/* Attendance summary */}
          {attStats.total > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: 'حاضر', val: attStats.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'متأخر', val: attStats.late, color: 'text-orange-500', bg: 'bg-orange-50' },
                { label: 'غير متأكد', val: attStats.uncertain, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'غائب', val: attStats.absent, color: 'text-red-600', bg: 'bg-red-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl p-2 text-center`}>
                  <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                  <div className={`text-xs ${s.color}`}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 mb-2">حالتك:</p>
            <AttendanceButton status={myAtt} locked={locked} onSelect={setAttendance} />
          </div>
        </div>
      )}

      {/* Upcoming events list */}
      {events.length > 1 && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">المواعيد القادمة</h3>
            <button onClick={() => navigate(`/team/${teamId}/events`)} className="text-xs text-brand-600 font-bold">الكل</button>
          </div>
          <div className="space-y-2">
            {events.slice(1).map(e => {
              const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
              return (
                <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span className="text-base">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{e.title}</div>
                    <div className="text-xs text-slate-400">{formatDate(e.start_datetime)} · {e.start_datetime.slice(11, 16)}</div>
                  </div>
                  <span className="badge text-xs" style={{ background: c.bg, color: c.color }}>{c.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
