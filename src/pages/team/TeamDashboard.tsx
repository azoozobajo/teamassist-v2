import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, leaveService, monthlyStarService } from '../../services'
import { Spinner, AttendanceButton, Modal, FormField } from '../../components/ui'
import { formatDate, EVENT_CONFIG, canManageTeam, isEventLocked, ROLE_LABELS } from '../../utils/helpers'
import { Copy, CheckCircle, Users, Calendar, Umbrella, ChevronLeft, TrendingUp, Swords, Star } from 'lucide-react'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

export default function TeamDashboard() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [team, setTeam]         = useState<any>(null)
  const [members, setMembers]   = useState<any[]>([])
  const [events, setEvents]     = useState<any[]>([])
  const [weekEvents, setWeekEvents] = useState<any[]>([])
  const [matchResults, setMatchResults] = useState<any[]>([])
  const [leaves, setLeaves]     = useState<any[]>([])
  const [myRole, setMyRole]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [attStats, setAttStats] = useState({ present: 0, absent: 0, uncertain: 0, late: 0, total: 0 })
  const [weekAtts, setWeekAtts] = useState<Record<string, string>>({})

  // Monthly star
  const [monthlyStar, setMonthlyStar] = useState<any>(undefined)
  const [showStarModal, setShowStarModal] = useState(false)
  const [starForm, setStarForm] = useState({ userId: '', note: '' })
  const [starSaving, setStarSaving] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getTeam(teamId),
      teamService.getMembers(teamId),
      eventService.getUpcomingEvents(teamId, 5),
      teamService.getMyRole(teamId, user.id),
      leaveService.getAll(teamId),
      eventService.getMatchResults(teamId),
      eventService.getWeekEvents(teamId),
      eventService.getMyAttendance(teamId, user.id),
      monthlyStarService.getCurrent(teamId),
    ]).then(([t, m, e, r, l, mr, we, myAttRecords, star]) => {
      setTeam(t); setMembers(m); setEvents(e); setMyRole(r || ''); setLeaves(l)
      setMatchResults(mr); setWeekEvents(we)
      setMonthlyStar(star ?? null)

      const attMap: Record<string, string> = {}
      ;(myAttRecords as any[]).forEach((a: any) => { attMap[a.event_id] = a.status })

      // Auto-present: week events with no attendance default to 'present'
      const allAutoEvs = [...(we as any[]), ...(e.length && !(we as any[]).find((w: any) => w.id === e[0].id) ? [e[0]] : [])]
      const noAtt = allAutoEvs.filter((ev: any) => !attMap[ev.id])
      if (noAtt.length > 0) {
        noAtt.forEach((ev: any) => { attMap[ev.id] = 'present' })
        noAtt.forEach((ev: any) => {
          eventService.setAttendance({ event_id: ev.id, team_id: teamId, user_id: user.id, status: 'present' })
        })
      }
      setWeekAtts(attMap)

      if (e.length) {
        setNextEvent(e[0])
        eventService.getAttendance(e[0].id).then(att => {
          setAttStats({
            present:   att.filter((a: any) => a.status === 'present').length,
            absent:    att.filter((a: any) => a.status === 'absent').length,
            uncertain: att.filter((a: any) => a.status === 'uncertain').length,
            late:      att.filter((a: any) => a.status === 'late').length,
            total:     att.length,
          })
        })
      }
      setLoading(false)
    })
  }, [teamId, user])

  const matchStats = useMemo(() => {
    const wins   = matchResults.filter(m => m.goals_for > m.goals_against).length
    const draws  = matchResults.filter(m => m.goals_for === m.goals_against).length
    const losses = matchResults.filter(m => m.goals_for < m.goals_against).length
    return { wins, draws, losses, total: matchResults.length }
  }, [matchResults])

  const copyCode = () => {
    navigator.clipboard?.writeText(team.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function setAttendance(eventId: string, status: string) {
    if (!user || !teamId) return
    const prev = weekAtts[eventId] ?? ''
    setWeekAtts(p => ({ ...p, [eventId]: status }))
    const { error } = await eventService.setAttendance({
      event_id: eventId, team_id: teamId, user_id: user.id, status
    })
    if (error) setWeekAtts(p => ({ ...p, [eventId]: prev }))
  }

  async function saveMonthlyStar(announceNow: boolean) {
    if (!starForm.userId || !teamId || !user) return
    setStarSaving(true)
    const now = new Date()
    const { data } = await monthlyStarService.set(teamId, starForm.userId, now.getMonth() + 1, now.getFullYear(), starForm.note, user.id, announceNow)
    if (data) setMonthlyStar(data)
    setShowStarModal(false); setStarSaving(false)
  }

  async function announceMonthlyStar() {
    if (!monthlyStar?.id) return
    await monthlyStarService.announce(monthlyStar.id)
    setMonthlyStar((p: any) => ({ ...p, announced_at: new Date().toISOString() }))
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!team)   return <div className="card text-center py-10 text-slate-400">الفريق غير موجود</div>

  const pending  = leaves.filter(l => l.status === 'pending')
  const isAdmin  = canManageTeam(myRole)
  const cfg      = nextEvent ? EVENT_CONFIG[nextEvent.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other : null
  const locked   = nextEvent ? isEventLocked(nextEvent.start_datetime) : false
  const attPct   = attStats.total ? Math.round(attStats.present / attStats.total * 100) : 0
  const weekList = weekEvents.filter(e => e.id !== nextEvent?.id)
  const now      = new Date()
  const isRevealed = monthlyStar?.announced_at && new Date(monthlyStar.announced_at) <= now
  const monthName  = MONTHS[now.getMonth()]

  return (
    <div className="animate-fade space-y-4">

      {/* ── Team Hero ── */}
      <div className="hero-card">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 left-4 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/25 flex items-center justify-center text-3xl font-extrabold overflow-hidden flex-shrink-0 border-2 border-white/30">
            {team.logo_url
              ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.name} />
              : team.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold truncate leading-tight">{team.name}</h1>
            <p className="text-sm text-white/80 mt-0.5">
              {team.sport_type} · {team.age_category} {team.city ? `· ${team.city}` : ''}
            </p>
            {myRole && (
              <span className="inline-block mt-2 bg-white/25 rounded-xl px-2.5 py-1 text-xs font-bold">
                {ROLE_LABELS[myRole] || myRole}
              </span>
            )}
            {isAdmin && team.invite_code && (
              <button onClick={copyCode}
                className="flex items-center gap-2 mt-3 bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-sm transition-colors border-none cursor-pointer">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                <span className="font-mono tracking-wider text-sm">{team.invite_code}</span>
                <span className="text-xs opacity-70">{copied ? '✓ تم النسخ' : 'نسخ'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-box cursor-pointer hover:border-blue-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/members`)}>
          <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Users size={20} className="text-blue-600" />
          </div>
          <div className="stat-value text-blue-600">{members.length}</div>
          <div className="stat-label">الأعضاء</div>
        </div>
        <div className="stat-box cursor-pointer hover:border-purple-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/events`)}>
          <div className="w-10 h-10 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Calendar size={20} className="text-purple-600" />
          </div>
          <div className="stat-value text-purple-600">{events.length}</div>
          <div className="stat-label">مواعيد قادمة</div>
        </div>
        <div className="stat-box cursor-pointer hover:border-brand-200 transition-all"
          onClick={() => navigate(`/team/${teamId}/attendance`)}>
          <div className="w-10 h-10 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <TrendingUp size={20} className="text-brand-600" />
          </div>
          <div className="stat-value text-brand-600">
            {attStats.total ? `${attPct}%` : '—'}
          </div>
          <div className="stat-label">حضور آخر موعد</div>
        </div>
        <div className={`stat-box cursor-pointer transition-all ${
            pending.length > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'hover:border-slate-200'
          }`}
          onClick={() => navigate(`/team/${teamId}/leaves`)}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2 ${
            pending.length > 0 ? 'bg-amber-200' : 'bg-slate-100'}`}>
            <Umbrella size={20} className={pending.length > 0 ? 'text-amber-700' : 'text-slate-500'} />
          </div>
          <div className={`stat-value ${pending.length > 0 ? 'text-amber-600' : ''}`}>{pending.length}</div>
          <div className="stat-label">طلبات إجازة</div>
        </div>
      </div>

      {/* ── Monthly Star Widget ── */}
      {(isAdmin || monthlyStar) && monthlyStar !== undefined && (
        <div className={`card ${isRevealed ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <Star size={18} className={isRevealed ? 'text-amber-500' : 'text-slate-400'} fill={isRevealed ? 'currentColor' : 'none'} />
            <h3 className={`font-extrabold ${isRevealed ? 'text-amber-800' : 'text-slate-700'}`}>
              نجم شهر {monthName}
            </h3>
          </div>

          {isRevealed ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-200 flex items-center justify-center text-2xl font-extrabold overflow-hidden border-2 border-amber-300 flex-shrink-0">
                {monthlyStar.player?.avatar_url
                  ? <img src={monthlyStar.player.avatar_url} className="w-full h-full object-cover" alt="" />
                  : <span>{monthlyStar.player?.full_name?.[0]}</span>}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-xl text-amber-900">{monthlyStar.player?.full_name}</div>
                {monthlyStar.note && <div className="text-xs text-amber-700 mt-0.5">{monthlyStar.note}</div>}
              </div>
              {isAdmin && (
                <button onClick={() => { setStarForm({ userId: monthlyStar.user_id, note: monthlyStar.note || '' }); setShowStarModal(true) }}
                  className="btn btn-ghost btn-sm text-xs flex-shrink-0">تعديل</button>
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <div className="w-16 h-16 rounded-full bg-slate-200 mx-auto flex items-center justify-center text-3xl font-extrabold text-slate-400 animate-pulse">?</div>
              <p className="text-xs text-slate-400 mt-2">سيتم الإعلان قريباً...</p>
              {isAdmin && (
                <div className="flex gap-2 justify-center mt-3">
                  {monthlyStar && !monthlyStar.announced_at && (
                    <button onClick={announceMonthlyStar}
                      className="btn btn-sm text-xs" style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>
                      ⭐ أعلن الآن
                    </button>
                  )}
                  <button onClick={() => { setStarForm({ userId: monthlyStar?.user_id || '', note: monthlyStar?.note || '' }); setShowStarModal(true) }}
                    className="btn btn-ghost btn-sm text-xs">
                    {monthlyStar ? 'تعديل' : 'اختر النجم'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin: show "choose star" button when no star set yet */}
      {isAdmin && !monthlyStar && monthlyStar !== undefined && (
        <button onClick={() => { setStarForm({ userId: '', note: '' }); setShowStarModal(true) }}
          className="card w-full text-center py-4 border-dashed border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
          <Star size={20} className="text-amber-400 mx-auto mb-1" />
          <p className="text-sm font-bold text-amber-600">اختر نجم شهر {monthName}</p>
        </button>
      )}

      {/* ── Match Results Widget ── */}
      {matchStats.total > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Swords size={16} className="text-blue-600"/>
            </div>
            <h3 className="font-extrabold text-slate-800">نتائج المباريات</h3>
            <span className="badge badge-gray text-xs mr-auto">{matchStats.total} مباراة</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-emerald-600">{matchStats.wins}</div>
              <div className="text-xs font-bold text-emerald-500 mt-0.5">🏆 فوز</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{matchStats.draws}</div>
              <div className="text-xs font-bold text-amber-500 mt-0.5">🤝 تعادل</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
              <div className="text-2xl font-extrabold text-red-500">{matchStats.losses}</div>
              <div className="text-xs font-bold text-red-400 mt-0.5">❌ خسارة</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>نسبة الفوز</span>
              <span>{Math.round(matchStats.wins / matchStats.total * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.round(matchStats.wins / matchStats.total * 100)}%` }}/>
            </div>
          </div>
        </div>
      )}

      {/* ── Next Event ── */}
      {nextEvent && (
        <div className={`card border-r-4 ${cfg?.borderClass || 'border-brand-500'}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="text-3xl flex-shrink-0">{cfg?.icon}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-base text-slate-900 truncate">{nextEvent.title}</span>
                  {locked && <span className="badge badge-red">مغلق</span>}
                </div>
                {nextEvent.event_type === 'match' && nextEvent.opponent && (
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">⚔️ ضد: {nextEvent.opponent}</div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                  <Calendar size={13} className="flex-shrink-0" />
                  <span>{formatDate(nextEvent.start_datetime)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-bold text-slate-700">{nextEvent.start_datetime.slice(11, 16)}</span>
                </div>
              </div>
            </div>
            <span className="badge flex-shrink-0 py-1.5 px-3" style={{ background: cfg?.bg, color: cfg?.color }}>
              {cfg?.label}
            </span>
          </div>

          {attStats.total > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'حاضر',      val: attStats.present,   bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-100' },
                { label: 'متأخر',     val: attStats.late,      bg: 'bg-orange-50',  color: 'text-orange-500',  border: 'border-orange-100'  },
                { label: 'غير متأكد', val: attStats.uncertain, bg: 'bg-amber-50',   color: 'text-amber-600',   border: 'border-amber-100'   },
                { label: 'غائب',      val: attStats.absent,    bg: 'bg-red-50',     color: 'text-red-500',     border: 'border-red-100'     },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-2.5 text-center`}>
                  <div className={`text-xl font-extrabold leading-none ${s.color}`}>{s.val}</div>
                  <div className={`text-[11px] mt-1 font-bold ${s.color} opacity-80`}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-50 rounded-2xl p-3">
            <p className="text-sm font-bold text-slate-600 mb-2.5">هل ستحضر هذا الموعد؟</p>
            <AttendanceButton
              status={weekAtts[nextEvent.id] ?? ''}
              locked={locked}
              onSelect={s => setAttendance(nextEvent.id, s)}
            />
          </div>
        </div>
      )}

      {/* ── 7-day events with attendance buttons ── */}
      {weekList.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-slate-800">📅 مواعيد الأسبوع القادم</h3>
            <button onClick={() => navigate(`/team/${teamId}/events`)}
              className="flex items-center gap-1 text-sm text-brand-600 font-bold hover:text-brand-700">
              عرض الكل <ChevronLeft size={15} />
            </button>
          </div>
          <div className="space-y-3">
            {weekList.map(e => {
              const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
              const evLocked = isEventLocked(e.start_datetime)
              const myStatus = weekAtts[e.id] ?? ''
              return (
                <div key={e.id} className={`card mb-0 border-r-4 ${c.borderClass}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 truncate">{e.title}</span>
                        {evLocked && <span className="badge badge-red text-xs">مغلق</span>}
                      </div>
                      {e.event_type === 'match' && e.opponent && (
                        <div className="text-xs text-slate-500 mt-0.5">⚔️ ضد: {e.opponent}</div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <Calendar size={11} className="flex-shrink-0"/>
                        <span>{formatDate(e.start_datetime)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold text-slate-600">{e.start_datetime.slice(11, 16)}</span>
                        {e.location && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="truncate max-w-[100px]">{e.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="badge text-xs flex-shrink-0" style={{ background: c.bg, color: c.color }}>
                      {c.label}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5">
                    <p className="text-xs font-bold text-slate-500 mb-2">هل ستحضر؟</p>
                    <AttendanceButton
                      status={myStatus}
                      locked={evLocked}
                      onSelect={s => setAttendance(e.id, s)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Monthly Star Admin Modal ── */}
      <Modal open={showStarModal} onClose={() => setShowStarModal(false)} title={`نجم شهر ${monthName}`}>
        <FormField label="اختر اللاعب">
          <select className="form-input" value={starForm.userId}
            onChange={e => setStarForm(p => ({ ...p, userId: e.target.value }))}>
            <option value="">-- اختر عضواً --</option>
            {members.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="ملاحظة (اختياري)">
          <input className="form-input" value={starForm.note}
            onChange={e => setStarForm(p => ({ ...p, note: e.target.value }))}
            placeholder="أفضل مدافع، قائد الفريق..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4 flex-wrap">
          <button className="btn btn-ghost" onClick={() => setShowStarModal(false)}>إلغاء</button>
          <button className="btn btn-sm py-2 px-4"
            style={{ background: '#d97706', color: '#fff', border: 'none' }}
            onClick={() => saveMonthlyStar(false)}
            disabled={!starForm.userId || starSaving}>
            {starSaving ? <Spinner size="sm"/> : 'احفظ (سري)'}
          </button>
          <button className="btn btn-sm py-2 px-4"
            style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
            onClick={() => saveMonthlyStar(true)}
            disabled={!starForm.userId || starSaving}>
            {starSaving ? <Spinner size="sm"/> : '⭐ أعلن الآن'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
