import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService } from '../../services'
import { Spinner, PageHeader, AttendanceButton, Modal, FormField, Avatar } from '../../components/ui'
import { ATT_CONFIG, EVENT_CONFIG, formatDate, canManageEvents, isEventLocked } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

export default function AttendancePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  const [selEv, setSelEv] = useState<any>(null)
  const [attendance, setAtt] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [attLoading, setAttLoading] = useState(false)
  const [myRole, setMyRole] = useState('')
  const [showLate, setShowLate] = useState<any>(null)
  const [lateMinutes, setLateMinutes] = useState('')
  const [lateExcuse, setLateExcuse] = useState('')
  const [hasExcuse, setHasExcuse] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['present', 'late', 'uncertain', 'absent'])
  )
  const toggleSection = (key: string) =>
    setExpandedSections(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      eventService.getTeamEvents(teamId),
      teamService.getMembers(teamId),
      teamService.getMyRole(teamId, user.id)
    ]).then(([evs, mems, role]) => {
      setEvents(evs); setMembers(mems); setMyRole(role || '')
      if (evs.length) selectEvent(evs[0])
      else setLoading(false)
    })
  }, [teamId, user])

  useEffect(() => {
    if (!selEv || !teamId) return
    // Filter by team_id (reliable for INSERTs); client-side check narrows to selected event
    const ch = supabase.channel(`att:${teamId}:${selEv.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'attendance',
        filter: `team_id=eq.${teamId}`
      }, async (payload: any) => {
        const evId = (payload.new as any)?.event_id || (payload.old as any)?.event_id
        if (evId === selEv.id) {
          const a = await eventService.getAttendance(selEv.id)
          setAtt(a)
        }
      }).subscribe()
    // Polling fallback every 8s in case realtime misses UPDATE events
    const poll = setInterval(async () => {
      const a = await eventService.getAttendance(selEv.id)
      setAtt(a)
    }, 8000)
    return () => { ch.unsubscribe(); clearInterval(poll) }
  }, [selEv?.id, teamId])

  async function selectEvent(ev: any) {
    setSelEv(ev); setAttLoading(true)
    const a = await eventService.getAttendance(ev.id)
    setAtt(a); setAttLoading(false); setLoading(false)
  }

  async function setStatus(userId: string, status: string, extra?: any) {
    if (!selEv || !teamId) return
    await eventService.setAttendance({
      event_id: selEv.id, team_id: teamId, user_id: userId,
      status, ...extra, updated_at: new Date().toISOString()
    })
    const updated = await eventService.getAttendance(selEv.id)
    setAtt(updated)
  }

  async function saveLate() {
    if (!showLate) return
    await setStatus(showLate.user_id, 'late', {
      late_minutes: parseInt(lateMinutes) || 0,
      late_excuse: lateExcuse, has_excuse: hasExcuse
    })
    setShowLate(null); setLateMinutes(''); setLateExcuse(''); setHasExcuse(false)
  }

  const isCoach = canManageEvents(myRole)
  const locked = selEv ? isEventLocked(selEv.start_datetime) : false
  const present   = attendance.filter(a => a.status === 'present')
  const late      = attendance.filter(a => a.status === 'late')
  const uncertain = attendance.filter(a => a.status === 'uncertain')
  const absent   = attendance.filter(a => a.status === 'absent')
  const total   = attendance.length
  const notRecorded = members.filter(m => !attendance.find(a => a.user_id === m.user_id))

  const sections = [
    { key:'present',   label:'الحاضرون',    list: present,   bg:'bg-emerald-50', tc:'text-emerald-700', icon:'✓' },
    { key:'late',     label:'المتأخرون',    list: late,      bg:'bg-orange-50',  tc:'text-orange-700',  icon:'⏱' },
    { key:'uncertain',label:'غير متأكدون', list: uncertain, bg:'bg-amber-50',   tc:'text-amber-700',   icon:'?' },
    { key:'absent',   label:'الغائبون',     list: absent,    bg:'bg-red-50',     tc:'text-red-700',     icon:'✗' },
  ]

  const AvatarSection = ({ members: list }: { members: any[] }) => (
    <div className="space-y-1.5 mt-2">
      {list.map((a: any) => {
        const m = members.find(x => x.user_id === a.user_id)
        return (
          <div key={a.id} className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm">
            <Avatar name={a.profile?.full_name || '?'} src={a.profile?.avatar_url} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{a.profile?.full_name}</div>
              {a.status === 'late' && (
                <div className="text-xs text-orange-600">
                  {a.late_minutes > 0 && `${a.late_minutes} دقيقة `}
                  {a.has_excuse ? '(بعذر)' : a.late_minutes > 0 ? '(بدون عذر)' : ''}
                </div>
              )}
            </div>
            {isCoach && (
              <AttendanceButton status={a.status} locked={false} compact
                onSelect={s => { if (s === 'late') setShowLate(a); else setStatus(a.user_id, s) }} />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div>
      <PageHeader title="سجل الحضور" />
      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        {/* Event selector */}
        <div>
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">اختر حدثاً</p>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {events.map(e => {
              const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
              const lk = isEventLocked(e.start_datetime)
              return (
                <button key={e.id} onClick={() => selectEvent(e)}
                  className={`w-full text-right px-3 py-2.5 rounded-2xl border text-xs transition-all ${
                    selEv?.id === e.id
                      ? 'bg-brand-50 border-brand-300 font-extrabold text-brand-800 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-brand-200 hover:bg-brand-50/30'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-bold">{e.title}</div>
                      <div className="text-slate-400 mt-0.5">{formatDate(e.start_datetime)}</div>
                    </div>
                    {lk && <Lock size={10} className="text-slate-300 flex-shrink-0" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail */}
        <div>
          {selEv && (
            <>
              {/* Summary hero card */}
              <div className="hero-card mb-4">
                <div className="absolute top-0 left-0 w-32 h-32 rounded-full opacity-10 bg-white -translate-x-12 -translate-y-10"/>
                <div className="relative">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-extrabold text-white text-base">{selEv.title}</div>
                      <div className="text-white/70 text-xs mt-0.5">
                        {EVENT_CONFIG[selEv.event_type as keyof typeof EVENT_CONFIG]?.label || selEv.event_type}
                        {selEv.att_group ? ` · ${selEv.att_group}` : ''}
                      </div>
                    </div>
                    {locked && (
                      <div className="flex items-center gap-1 text-xs text-white/80 bg-white/15 px-2.5 py-1.5 rounded-xl">
                        <Lock size={11} /> مغلق
                      </div>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label:'حاضر', n: present.length, pct: Math.round(present.length/total*100), bg:'bg-emerald-500/30' },
                        { label:'متأخر', n: late.length, pct: Math.round(late.length/total*100), bg:'bg-orange-500/30' },
                        { label:'غير متأكد', n: uncertain.length, pct: Math.round(uncertain.length/total*100), bg:'bg-amber-400/30' },
                        { label:'غائب', n: absent.length, pct: Math.round(absent.length/total*100), bg:'bg-red-500/30' },
                      ].map(s => (
                        <div key={s.label} className={`${s.bg} rounded-2xl p-2.5 text-center`}>
                          <div className="text-white text-xl font-extrabold leading-none">{s.pct}%</div>
                          <div className="text-white/80 text-xs mt-1">{s.label}</div>
                          <div className="text-white/60 text-xs">({s.n})</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {attLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
                <div className="space-y-3">
                  {sections.map(sec => (
                    <div key={sec.key} className={`rounded-2xl ${sec.bg} p-3`}>
                      {/* Collapsible header */}
                      <button
                        className="w-full flex items-center justify-between"
                        onClick={() => toggleSection(sec.key)}>
                        <div className={`text-sm font-extrabold ${sec.tc} flex items-center gap-2`}>
                          <span className="text-base">{sec.icon}</span>
                          {sec.label}
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/60">{sec.list.length}</span>
                        </div>
                        {expandedSections.has(sec.key)
                          ? <ChevronUp size={15} className={sec.tc} />
                          : <ChevronDown size={15} className={sec.tc} />}
                      </button>
                      {expandedSections.has(sec.key) && (
                        sec.list.length === 0
                          ? <div className="text-xs text-slate-400 text-center py-3 mt-1">لا يوجد</div>
                          : <AvatarSection members={sec.list} />
                      )}
                    </div>
                  ))}

                  {/* Not recorded */}
                  {notRecorded.length > 0 && (
                    <div className="card border-dashed border-slate-200">
                      <div className="text-xs font-extrabold text-slate-400 mb-2 flex items-center gap-1.5">
                        <span>⏳</span> لم يُسجّل بعد ({notRecorded.length})
                      </div>
                      <div className="space-y-1.5">
                        {notRecorded.map(m => (
                          <div key={m.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
                            <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm" />
                            <div className="flex-1 text-xs font-bold">{m.profile?.full_name}</div>
                            {(isCoach || (!locked && m.user_id === user?.id)) && (
                              <AttendanceButton status="present" compact locked={false}
                                onSelect={s => {
                                  if (s === 'late') setShowLate({ user_id: m.user_id, profile: m.profile })
                                  else setStatus(m.user_id, s)
                                }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {!selEv && !loading && (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-bold text-slate-500 text-sm">اختر حدثاً لعرض الحضور</p>
            </div>
          )}
          {loading && <div className="flex justify-center py-10"><Spinner /></div>}
        </div>
      </div>

      {/* Late Modal */}
      <Modal open={!!showLate} onClose={() => setShowLate(null)}
        title={`تسجيل تأخر — ${showLate?.profile?.full_name}`}>
        <FormField label="مدة التأخير (دقيقة)">
          <input className="form-input" type="number" value={lateMinutes}
            onChange={e => setLateMinutes(e.target.value)} placeholder="15" />
        </FormField>
        <div className="flex items-center gap-3 mb-4">
          <input type="checkbox" id="hasExcuse" checked={hasExcuse}
            onChange={e => setHasExcuse(e.target.checked)} className="w-4 h-4 accent-brand-500" />
          <label htmlFor="hasExcuse" className="text-sm cursor-pointer">التأخير بعذر</label>
        </div>
        {hasExcuse && (
          <FormField label="سبب التأخير">
            <input className="form-input" value={lateExcuse}
              onChange={e => setLateExcuse(e.target.value)} placeholder="اذكر السبب..." />
          </FormField>
        )}
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setShowLate(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveLate}>حفظ</button>
        </div>
      </Modal>
    </div>
  )
}
