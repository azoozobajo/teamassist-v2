import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, Search, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService, pointsService } from '../../services'
import { Spinner, PageHeader, AttendanceButton, Modal, FormField, Avatar } from '../../components/ui'
import { EVENT_CONFIG, formatDate, canManageEvents, isEventLocked } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

const STATUS_CHIPS = [
  { key: 'present',   label: 'حاضر',      cls: 'bg-emerald-100 text-emerald-700' },
  { key: 'uncertain', label: 'غير متأكد', cls: 'bg-amber-100 text-amber-700' },
  { key: 'absent',    label: 'غائب',      cls: 'bg-red-100 text-red-600' },
  { key: 'late',      label: 'متأخر',     cls: 'bg-orange-100 text-orange-700' },
]

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  present:   { label: 'حاضر',      cls: 'bg-emerald-100 text-emerald-700' },
  uncertain: { label: 'غير متأكد', cls: 'bg-amber-100 text-amber-700' },
  absent:    { label: 'غائب',      cls: 'bg-red-100 text-red-600' },
  late:      { label: 'متأخر',     cls: 'bg-orange-100 text-orange-700' },
}

const SECTIONS = [
  { key: 'present',   label: 'الحاضرون',    bg: 'bg-emerald-50', tc: 'text-emerald-700', icon: '✓' },
  { key: 'late',      label: 'المتأخرون',    bg: 'bg-orange-50',  tc: 'text-orange-700',  icon: '⏱' },
  { key: 'uncertain', label: 'غير متأكدون', bg: 'bg-amber-50',   tc: 'text-amber-700',   icon: '?' },
  { key: 'absent',    label: 'الغائبون',    bg: 'bg-red-50',     tc: 'text-red-700',     icon: '✗' },
]

export default function AttendancePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [events, setEvents]   = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole]   = useState('')
  const [loading, setLoading] = useState(true)
  // { [eventId]: { present: N, absent: N, ... } }
  const [summary, setSummary] = useState<Record<string, Record<string, number>>>({})

  // Tabs: upcoming / past
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  // Filters
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [filterMemberId, setFilterMemberId] = useState('')
  // { [eventId]: status } for selected member
  const [memberAttMap, setMemberAttMap] = useState<Record<string, string>>({})

  // Detail modal
  const [modalEv, setModalEv]           = useState<any>(null)
  const [modalAtt, setModalAtt]         = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const channelRef = useRef<any>(null)

  // Late modal
  const [showLate, setShowLate]       = useState<any>(null)
  const [lateMinutes, setLateMinutes] = useState('')
  const [lateExcuse, setLateExcuse]   = useState('')
  const [hasExcuse, setHasExcuse]     = useState(false)

  // ── Load on mount ──
  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      eventService.getTeamEvents(teamId),
      teamService.getMembers(teamId),
      teamService.getMyRole(teamId, user.id),
      fetchSummary(teamId),
    ]).then(([evs, mems, role, sum]) => {
      setEvents(evs); setMembers(mems); setMyRole(role || ''); setSummary(sum)
      setLoading(false)
    })
  }, [teamId, user])

  // ── Fetch member attendance map when member filter changes ──
  useEffect(() => {
    if (!filterMemberId || !teamId) { setMemberAttMap({}); return }
    supabase.from('attendance').select('event_id, status')
      .eq('team_id', teamId).eq('user_id', filterMemberId)
      .then(({ data }) => {
        const m: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { m[r.event_id] = r.status })
        setMemberAttMap(m)
      })
  }, [filterMemberId, teamId])

  // ── Realtime for open modal ──
  useEffect(() => {
    channelRef.current?.unsubscribe()
    if (!modalEv || !teamId) return
    channelRef.current = supabase.channel(`att:${teamId}:${modalEv.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `team_id=eq.${teamId}` },
        async (payload: any) => {
          const evId = (payload.new as any)?.event_id || (payload.old as any)?.event_id
          if (evId !== modalEv.id) return
          const a = await eventService.getAttendance(modalEv.id)
          setModalAtt(a); refreshSummary(modalEv.id, a)
        }).subscribe()
    return () => { channelRef.current?.unsubscribe() }
  }, [modalEv?.id, teamId])

  async function fetchSummary(tid: string) {
    const { data } = await supabase.from('attendance').select('event_id, status').eq('team_id', tid)
    const s: Record<string, Record<string, number>> = {}
    ;(data ?? []).forEach((r: any) => {
      if (!s[r.event_id]) s[r.event_id] = {}
      s[r.event_id][r.status] = (s[r.event_id][r.status] || 0) + 1
    })
    return s
  }

  function refreshSummary(eventId: string, att: any[]) {
    const counts: Record<string, number> = {}
    att.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
    setSummary(prev => ({ ...prev, [eventId]: counts }))
  }

  async function openEvent(ev: any) {
    setModalEv(ev); setModalLoading(true)
    const a = await eventService.getAttendance(ev.id)
    setModalAtt(a); setModalLoading(false)
  }

  async function setStatus(userId: string, status: string, extra?: any) {
    if (!modalEv || !teamId) return
    await eventService.setAttendance({
      event_id: modalEv.id, team_id: teamId, user_id: userId,
      status, ...extra, updated_at: new Date().toISOString()
    })
    // Auto-award attendance points for present/late
    if (status === 'present' || status === 'late') {
      pointsService.addAutoAttendancePoints(teamId, userId, modalEv.event_type, modalEv.id)
    }
    const updated = await eventService.getAttendance(modalEv.id)
    setModalAtt(updated); refreshSummary(modalEv.id, updated)
    if (filterMemberId === userId) {
      setMemberAttMap(prev => ({ ...prev, [modalEv.id]: status }))
    }
  }

  async function saveLate() {
    if (!showLate) return
    await setStatus(showLate.user_id, 'late', {
      late_minutes: parseInt(lateMinutes) || 0,
      late_excuse: lateExcuse, has_excuse: hasExcuse
    })
    setShowLate(null); setLateMinutes(''); setLateExcuse(''); setHasExcuse(false)
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setFilterMemberId(''); setMemberAttMap({})
  }

  const isCoach = canManageEvents(myRole)
  const hasFilters = !!(dateFrom || dateTo || filterMemberId)

  // ── Split events into upcoming / past ──
  const now = new Date()
  const upcomingBase = events.filter(e => new Date(e.start_datetime) >= now)
  const pastBase     = [...events.filter(e => new Date(e.start_datetime) < now)].reverse()
  const base         = tab === 'upcoming' ? upcomingBase : pastBase

  // ── Apply date range + member filters ──
  const filtered = base.filter(e => {
    if (dateFrom && new Date(e.start_datetime) < new Date(dateFrom)) return false
    if (dateTo   && new Date(e.start_datetime) > new Date(dateTo + 'T23:59:59')) return false
    if (filterMemberId && !memberAttMap[e.id]) return false
    return true
  })

  // Modal sections
  const mPresent   = modalAtt.filter(a => a.status === 'present')
  const mLate      = modalAtt.filter(a => a.status === 'late')
  const mUncertain = modalAtt.filter(a => a.status === 'uncertain')
  const mAbsent    = modalAtt.filter(a => a.status === 'absent')
  const mNotRec    = members.filter(m => !modalAtt.find(a => a.user_id === m.user_id))
  const mLists: Record<string, any[]> = { present: mPresent, late: mLate, uncertain: mUncertain, absent: mAbsent }

  function MemberRow({ a, m }: { a?: any; m?: any }) {
    const profile = a?.profile || m?.profile
    const userId  = a?.user_id  || m?.user_id
    return (
      <div className="flex items-center gap-2 bg-white rounded-xl p-2 border border-slate-50">
        <Avatar name={profile?.full_name || '?'} src={profile?.avatar_url} size="sm"/>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate">{profile?.full_name}</div>
          {a?.status === 'late' && a?.late_minutes > 0 && (
            <div className="text-xs text-orange-600">
              {a.late_minutes} دقيقة {a.has_excuse ? '(بعذر)' : ''}
            </div>
          )}
        </div>
        {isCoach && (
          <AttendanceButton status={a?.status || 'present'} locked={false} compact
            onSelect={s => {
              if (s === 'late') setShowLate({ user_id: userId, profile })
              else setStatus(userId, s)
            }}/>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="سجل الحضور"/>

      {/* ── Tabs: upcoming / past ── */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-2xl w-fit">
        {([
          { key: 'upcoming', label: `القادمة (${upcomingBase.length})` },
          { key: 'past',     label: `السابقة (${pastBase.length})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="card p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">من تاريخ</label>
            <input type="date" className="form-input text-sm py-2"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">إلى تاريخ</label>
            <input type="date" className="form-input text-sm py-2"
              value={dateTo} onChange={e => setDateTo(e.target.value)}/>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">العضو</label>
            <select className="form-input text-sm py-2"
              value={filterMemberId} onChange={e => setFilterMemberId(e.target.value)}>
              <option value="">— كل الأعضاء —</option>
              {members.filter(m => m.role === 'player' || m.role === 'head_coach' || m.role === 'assistant_coach').map(m => (
                <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {hasFilters ? (
              <button onClick={clearFilters}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors w-full justify-center">
                <X size={14}/> مسح الفلتر
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-400 bg-slate-50 w-full justify-center">
                <Search size={14}/> بحث متقدم
              </div>
            )}
          </div>
        </div>
        {filterMemberId && tab === 'upcoming' && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            ⚠ فلتر العضو يظهر نتائج في السابقة فقط حيث تم تسجيل الحضور
          </p>
        )}
      </div>

      {/* ── Events list ── */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg"/></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">{hasFilters ? '🔍' : '📋'}</div>
          <p className="font-bold text-slate-500 text-sm">
            {hasFilters ? 'لا توجد نتائج بهذه المعايير' : tab === 'upcoming' ? 'لا توجد مواعيد قادمة' : 'لا توجد مواعيد سابقة'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => {
            const cfg    = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
            const lk     = isEventLocked(e.start_datetime)
            const counts = summary[e.id] || {}
            const total  = Object.values(counts).reduce((s, n) => s + n, 0)
            const memStatus = filterMemberId ? memberAttMap[e.id] : null

            return (
              <button key={e.id} onClick={() => openEvent(e)}
                className="w-full text-right card p-4 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group active:scale-[0.99]">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm text-slate-800 truncate group-hover:text-brand-700 transition-colors">
                      {e.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatDate(e.start_datetime)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* If member filtered: show their status badge */}
                    {memStatus && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${STATUS_BADGE[memStatus]?.cls || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_BADGE[memStatus]?.label || memStatus}
                      </span>
                    )}
                    {!filterMemberId && total > 0 && (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">
                        {total} مسجّل
                      </span>
                    )}
                    {lk && <Lock size={12} className="text-slate-300"/>}
                  </div>
                </div>

                {/* 4 chips (only when no member filter) */}
                {!filterMemberId && (
                  <div className="grid grid-cols-4 gap-2">
                    {STATUS_CHIPS.map(chip => (
                      <div key={chip.key} className={`${chip.cls} rounded-xl py-2.5 text-center`}>
                        <div className="text-xl font-black leading-none">{counts[chip.key] || 0}</div>
                        <div className="text-xs mt-1 font-bold opacity-75">{chip.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Attendance detail modal ── */}
      <Modal open={!!modalEv} onClose={() => setModalEv(null)} width="max-w-lg"
        title={modalEv ? `${EVENT_CONFIG[modalEv.event_type as keyof typeof EVENT_CONFIG]?.icon || '📋'} ${modalEv.title}` : ''}>
        {modalEv && (
          <>
            <p className="text-xs text-slate-400 -mt-1 mb-4">{formatDate(modalEv.start_datetime)}</p>
            {modalLoading ? (
              <div className="flex justify-center py-10"><Spinner/></div>
            ) : (
              <div className="space-y-3 max-h-[62vh] overflow-y-auto -mx-1 px-1">
                {SECTIONS.map(sec => {
                  const list = mLists[sec.key]
                  if (!list?.length) return null
                  return (
                    <div key={sec.key} className={`rounded-2xl ${sec.bg} p-3`}>
                      <div className={`text-sm font-extrabold ${sec.tc} flex items-center gap-2 mb-2`}>
                        <span>{sec.icon}</span> {sec.label}
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/60">{list.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {list.map((a: any) => <MemberRow key={a.id} a={a}/>)}
                      </div>
                    </div>
                  )
                })}
                {mNotRec.length > 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-3">
                    <div className="text-xs font-extrabold text-slate-400 mb-2">
                      ⏳ لم يُسجّل بعد ({mNotRec.length})
                    </div>
                    <div className="space-y-1.5">
                      {mNotRec.map(m => <MemberRow key={m.id} m={m}/>)}
                    </div>
                  </div>
                )}
                {!modalAtt.length && !mNotRec.length && (
                  <div className="text-center py-10 text-slate-400 text-sm">لم يُسجّل حضور بعد</div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Late modal ── */}
      <Modal open={!!showLate} onClose={() => setShowLate(null)}
        title={`تسجيل تأخر — ${showLate?.profile?.full_name}`}>
        <FormField label="مدة التأخير (دقيقة)">
          <input className="form-input" type="number" value={lateMinutes}
            onChange={e => setLateMinutes(e.target.value)} placeholder="15"/>
        </FormField>
        <div className="flex items-center gap-3 mb-4">
          <input type="checkbox" id="hasExcuse" checked={hasExcuse}
            onChange={e => setHasExcuse(e.target.checked)} className="w-4 h-4 accent-brand-500"/>
          <label htmlFor="hasExcuse" className="text-sm cursor-pointer">التأخير بعذر</label>
        </div>
        {hasExcuse && (
          <FormField label="سبب التأخير">
            <input className="form-input" value={lateExcuse}
              onChange={e => setLateExcuse(e.target.value)} placeholder="اذكر السبب..."/>
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
