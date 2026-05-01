import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService } from '../../services'
import { Spinner, PageHeader, AttendanceButton, Modal, FormField, Avatar } from '../../components/ui'
import { ATT_CONFIG, EVENT_CONFIG, formatDate, canManageEvents, isEventLocked } from '../../utils/helpers'

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
  const [expandedSection, setExpandedSection] = useState<string | null>('present')

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
      <div className="grid md:grid-cols-[200px_1fr] gap-4">
        {/* Event selector */}
        <div>
          <p className="text-xs font-bold text-slate-400 mb-2">اختر حدثاً</p>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {events.map(e => {
              const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
              const lk = isEventLocked(e.start_datetime)
              return (
                <button key={e.id} onClick={() => selectEvent(e)}
                  className={`w-full text-right px-3 py-2.5 rounded-xl border text-xs transition-colors ${selEv?.id === e.id ? 'bg-brand-50 border-brand-400 font-bold text-brand-800' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                  <div className="flex items-center gap-1.5">
                    <span>{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-bold">{e.title}</div>
                      <div className="text-slate-400 mt-0.5">{formatDate(e.start_datetime)}</div>
                    </div>
                    {lk && <Lock size={10} className="text-slate-400 flex-shrink-0" />}
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
              {/* Summary card */}
              <div className="card bg-brand-50 border-brand-200 mb-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-sm text-brand-800">{selEv.title}</div>
                    <div className="text-xs text-brand-600 mt-0.5">{selEv.att_group || 'الكل'}</div>
                  </div>
                  {locked && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                      <Lock size={10} /> مغلق
                    </div>
                  )}
                </div>
                {/* Stats bar */}
                {total > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label:'حاضر',      n: present.length,   pct: Math.round(present.length/total*100),   color:'text-emerald-700', bg:'bg-white' },
                      { label:'متأخر',     n: late.length,      pct: Math.round(late.length/total*100),      color:'text-orange-600',  bg:'bg-white' },
                      { label:'غير متأكد', n: uncertain.length, pct: Math.round(uncertain.length/total*100), color:'text-amber-700',   bg:'bg-white' },
                      { label:'غائب',      n: absent.length,    pct: Math.round(absent.length/total*100),    color:'text-red-700',     bg:'bg-white' },
                    ].map(s => (
                      <div key={s.label} className={`${s.bg} rounded-xl p-2 text-center shadow-sm`}>
                        <div className={`text-lg font-bold ${s.color}`}>{s.pct}%</div>
                        <div className={`text-xs font-medium ${s.color}`}>{s.label}</div>
                        <div className="text-xs text-slate-400">({s.n})</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {attLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
                <div className="space-y-3">
                  {sections.map(sec => (
                    <div key={sec.key} className={`rounded-2xl ${sec.bg} p-3`}>
                      {/* Collapsible header */}
                      <button
                        className="w-full flex items-center justify-between text-left"
                        onClick={() => setExpandedSection(expandedSection === sec.key ? null : sec.key)}>
                        <div className={`text-xs font-bold ${sec.tc}`}>
                          {sec.icon} {sec.label} ({sec.list.length})
                        </div>
                        {expandedSection === sec.key
                          ? <ChevronUp size={14} className={sec.tc} />
                          : <ChevronDown size={14} className={sec.tc} />}
                      </button>
                      {expandedSection === sec.key && (
                        sec.list.length === 0
                          ? <div className="text-xs text-slate-400 text-center py-2 mt-1">لا يوجد</div>
                          : <AvatarSection members={sec.list} />
                      )}
                    </div>
                  ))}

                  {/* Not recorded */}
                  {notRecorded.length > 0 && (
                    <div className="card">
                      <div className="text-xs font-bold text-slate-400 mb-2">
                        لم يُسجّل بعد ({notRecorded.length})
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
            <div className="card text-center text-slate-400 py-8 text-sm">اختر حدثاً من القائمة</div>
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
