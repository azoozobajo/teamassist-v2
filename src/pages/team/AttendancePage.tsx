import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Lock, Search, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService, pointsService, attendanceService } from '../../services'
import { Spinner, PageHeader, AttendanceButton, Modal, FormField, Avatar } from '../../components/ui'
import { EVENT_CONFIG, formatDate, canManageEvents, isEventLocked } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

const STATUS_CHIPS = [
  { key: 'present',   label: 'حاضر',      cls: 'bg-emerald-100 text-emerald-700' },
  { key: 'late',      label: 'متأخر',     cls: 'bg-orange-100 text-orange-700' },
  { key: 'absent',    label: 'غائب',      cls: 'bg-red-100 text-red-600' },
  { key: 'excused',   label: 'بعذر',      cls: 'bg-slate-100 text-slate-600' },
  { key: 'uncertain', label: 'غير متأكد', cls: 'bg-amber-100 text-amber-700' },
]

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  present:   { label: 'حاضر',      cls: 'bg-emerald-100 text-emerald-700' },
  uncertain: { label: 'غير متأكد', cls: 'bg-amber-100 text-amber-700' },
  absent:    { label: 'غائب',      cls: 'bg-red-100 text-red-600' },
  late:      { label: 'متأخر',     cls: 'bg-orange-100 text-orange-700' },
  excused:   { label: 'بعذر',      cls: 'bg-slate-100 text-slate-600' },
}

const SECTIONS = [
  { key: 'present',   label: 'الحاضرون',       bg: 'bg-emerald-50', tc: 'text-emerald-700', icon: '✓' },
  { key: 'late',      label: 'المتأخرون',       bg: 'bg-orange-50',  tc: 'text-orange-700',  icon: '⏱' },
  { key: 'excused',   label: 'غياب بعذر',       bg: 'bg-slate-50',   tc: 'text-slate-600',   icon: '📋' },
  { key: 'uncertain', label: 'غير متأكدون',     bg: 'bg-amber-50',   tc: 'text-amber-700',   icon: '?' },
  { key: 'absent',    label: 'الغائبون',        bg: 'bg-red-50',     tc: 'text-red-700',     icon: '✗' },
]

const EVENT_TYPE_TRIGGER: Record<string, string> = {
  training: 'حضور التدريب',
  match:    'حضور المباراة',
  meeting:  'حضور الاجتماع',
  camp:     'حضور المعسكر',
}

const REPORT_EVENT_TYPES = [
  { key: 'all', label: 'كل المواعيد' },
  { key: 'match', label: 'المباريات' },
  { key: 'training', label: 'التمارين' },
  { key: 'camp', label: 'المعسكرات' },
  { key: 'meeting', label: 'الاجتماعات' },
  { key: 'other', label: 'أخرى' },
]

type ReportSortKey = 'name' | 'events' | 'present' | 'late' | 'avgLate' | 'absent' | 'excused' | 'generalRate' | 'effectiveRate'
type SortDir = 'asc' | 'desc'

// ── Streak helpers ─────────────────────────────────────────────────────────
function calcStreak(records: any[]): number {
  const sorted = [...records]
    .filter(a => a.event?.start_datetime)
    .sort((a, b) =>
      new Date(a.event.start_datetime).getTime() - new Date(b.event.start_datetime).getTime()
    )
  let streak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i].status
    if (s === 'present' || s === 'late') streak++
    else if (s === 'excused') continue   // excused: skip, doesn't break streak
    else break                           // absent / uncertain: breaks streak
  }
  return streak
}

async function awardStreakBonus(
  teamId: string, userId: string, eventId: string,
  streak: number, settings: any[]
) {
  const milestones = [
    { count: 3,  trigger: 'سلسلة 3' },
    { count: 5,  trigger: 'سلسلة 5' },
    { count: 10, trigger: 'سلسلة 10' },
  ]
  for (const { count, trigger } of milestones) {
    if (streak === count) {
      const s = settings.find(x => x.event_trigger === trigger && x.is_active)
      if (s && s.points > 0) {
        await pointsService.awardStreakPoints(teamId, userId, eventId, s.points, `🔥 سلسلة ${count} حصص متتالية`)
      }
      return
    }
  }
  // Every 5 sessions after 10 (15, 20, 25 …)
  if (streak > 10 && (streak - 10) % 5 === 0) {
    const s = settings.find(x => x.event_trigger === 'سلسلة كل 5' && x.is_active)
    if (s && s.points > 0) {
      await pointsService.awardStreakPoints(teamId, userId, eventId, s.points, `🔥 سلسلة ${streak} حصص متتالية`)
    }
  }
}

export default function AttendancePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [events, setEvents]   = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole]   = useState('')
  const [loading, setLoading] = useState(true)
  // { [eventId]: { present: N, absent: N, ... } }
  const [summary, setSummary] = useState<Record<string, Record<string, number>>>({})
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([])
  const [matchLineups, setMatchLineups] = useState<any[]>([])
  const [matchEventMap, setMatchEventMap] = useState<Record<string, string>>({})

  // Tabs: upcoming / past / report
  const [tab, setTab] = useState<'upcoming' | 'past' | 'report'>('upcoming')

  // Filters
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [filterMemberId, setFilterMemberId] = useState('')
  const [reportEventType, setReportEventType] = useState('all')
  const [reportSortKey, setReportSortKey] = useState<ReportSortKey>('events')
  const [reportSortDir, setReportSortDir] = useState<SortDir>('desc')
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

  // Excused absence modal
  const [showExcused, setShowExcused]         = useState<any>(null)
  const [excusedReason, setExcusedReason]     = useState('')

  // Auto-point settings
  const [autoSettings, setAutoSettings] = useState<any[]>([])

  // ── Load on mount ──
  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      eventService.getTeamEvents(teamId),
      teamService.getMembers(teamId),
      teamService.getMyRole(teamId, user.id),
      fetchSummary(teamId),
      fetchAttendanceRecords(teamId),
      pointsService.getAutoSettings(teamId),
      supabase.from('match_lineup').select('match_id, players').eq('team_id', teamId),
      supabase.from('matches').select('id, event_id').eq('team_id', teamId),
    ]).then(([evs, mems, role, sum, attRecords, autoS, lineupRes, matchRes]) => {
      setEvents(evs); setMembers(mems); setMyRole(role || ''); setSummary(sum)
      setAttendanceRecords(attRecords)
      setAutoSettings(autoS)
      setMatchLineups(lineupRes.data ?? [])
      const nextMatchEventMap: Record<string, string> = {}
      ;(matchRes.data ?? []).forEach((m: any) => { if (m.event_id) nextMatchEventMap[m.id] = m.event_id })
      setMatchEventMap(nextMatchEventMap)
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

  async function fetchAttendanceRecords(tid: string) {
    const { data } = await supabase
      .from('attendance')
      .select('event_id, user_id, status, late_minutes, absence_type, locked_by_source, source_type')
      .eq('team_id', tid)
    return data ?? []
  }

  function refreshSummary(eventId: string, att: any[]) {
    const counts: Record<string, number> = {}
    att.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1 })
    setSummary(prev => ({ ...prev, [eventId]: counts }))
    setAttendanceRecords(prev => {
      const next = prev.filter(r => r.event_id !== eventId)
      return [
        ...next,
        ...att.map(r => ({
          event_id: r.event_id,
          user_id: r.user_id,
          status: r.status,
          late_minutes: r.late_minutes,
          absence_type: r.absence_type,
          locked_by_source: r.locked_by_source,
          source_type: r.source_type,
        })),
      ]
    })
  }

  async function openEvent(ev: any) {
    setModalEv(ev); setModalLoading(true)
    const a = await eventService.getAttendance(ev.id)
    setModalAtt(a); setModalLoading(false)
  }

  async function setStatus(userId: string, status: string, extra?: any) {
    if (!modalEv || !teamId || !user) return

    const prevRecord = modalAtt.find(a => a.user_id === userId)
    const prevStatus = prevRecord?.status
    const wasPresent = prevStatus === 'present' || prevStatus === 'late'
    const isNowPresent = status === 'present' || status === 'late'

    // تحقق: هل يمكن للمدرب تغيير هذا السجل؟
    if (prevRecord) {
      const check = attendanceService.canCoachOverride(prevRecord)
      if (!check.allowed && status === 'absent') {
        alert(`لا يمكن التغيير إلى غائب بدون عذر — ${check.reason}`)
        return
      }
    }

    await attendanceService.markByCoach(
      teamId, modalEv.id, userId,
      status as 'present' | 'late' | 'absent' | 'excused',
      user.id,
      extra,
    )

    // ── Auto-points ──
    if (isNowPresent && !wasPresent) {
      // Award attendance points
      const trigger = EVENT_TYPE_TRIGGER[modalEv.event_type as string]
      if (trigger) {
        const setting = autoSettings.find(s => s.event_trigger === trigger && s.is_active)
        if (setting && setting.points > 0) {
          await pointsService.awardAttendancePoints(teamId, userId, modalEv.id, setting.points, trigger)
        }
      }
      // Award streak bonus — fetch full history first (includes the updated record)
      const allAtt = await eventService.getMyAttendance(teamId, userId)
      const streak = calcStreak(allAtt)
      if (streak >= 3) {
        await awardStreakBonus(teamId, userId, modalEv.id, streak, autoSettings)
      }
    } else if (!isNowPresent && wasPresent) {
      // Revoke attendance + streak points when changed away from present/late
      await pointsService.revokeAttendancePoints(teamId, userId, modalEv.id)
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

  async function saveExcused() {
    if (!showExcused) return
    await setStatus(showExcused.user_id, 'excused', { excuse_reason: excusedReason })
    setShowExcused(null); setExcusedReason('')
  }

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setFilterMemberId(''); setMemberAttMap({}); setReportEventType('all')
  }

  const isCoach = canManageEvents(myRole)
  const hasFilters = tab === 'report'
    ? !!(dateFrom || dateTo || reportEventType !== 'all')
    : !!(dateFrom || dateTo || filterMemberId)

  // ── Split events into upcoming / past ──
  const now = new Date()
  const upcomingBase = events.filter(e => new Date(e.start_datetime) >= now)
  const pastBase     = [...events.filter(e => new Date(e.start_datetime) < now)].reverse()
  const base         = tab === 'upcoming' ? upcomingBase : tab === 'past' ? pastBase : []

  // ── Apply date range + member filters ──
  const filtered = base.filter(e => {
    if (dateFrom && new Date(e.start_datetime) < new Date(dateFrom)) return false
    if (dateTo   && new Date(e.start_datetime) > new Date(dateTo + 'T23:59:59')) return false
    if (filterMemberId && !memberAttMap[e.id]) return false
    return true
  })

  // For match and training events, only players are eligible for attendance
  const ELIGIBLE_ROLE_GROUPS: Record<string, string[]> = {
    'اللاعبون فقط':         ['player'],
    'المدربون فقط':         ['head_coach', 'assistant_coach'],
    'اللاعبون والمدربون':  ['player', 'head_coach', 'assistant_coach'],
    'الإداريون فقط':       ['administrator', 'owner'],
  }
  function getEligibleMembers(event: any): any[] {
    if (!event) return members
    if (event.att_member_ids?.length > 0)
      return members.filter(m => event.att_member_ids.includes(m.user_id))
    if (event.event_type === 'match' || event.event_type === 'training')
      return members.filter(m => m.role === 'player')
    const roles = ELIGIBLE_ROLE_GROUPS[event.att_group]
    if (roles) return members.filter(m => roles.includes(m.role))
    return members
  }

  const reportEvents = useMemo(() => {
    return events.filter(e => {
      if (reportEventType !== 'all' && e.event_type !== reportEventType) return false
      if (dateFrom && new Date(e.start_datetime) < new Date(dateFrom)) return false
      if (dateTo && new Date(e.start_datetime) > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [events, reportEventType, dateFrom, dateTo])

  const reportRows = useMemo(() => {
    const attMap = new Map<string, any>()
    attendanceRecords.forEach(r => {
      attMap.set(`${r.event_id}:${r.user_id}`, r)
    })
    const lineupMap = new Map<string, Record<string, string>>()
    matchLineups.forEach((lineup: any) => {
      const players: Record<string, string> = {}
      ;(lineup.players ?? []).forEach((p: any) => { players[p.user_id] = p.role })
      lineupMap.set(matchEventMap[lineup.match_id] || lineup.match_id, players)
    })

    const rows = members
      .filter(m => m.role === 'player')
      .map(m => {
        let eventCount = 0
        let present = 0
        let late = 0
        let absent = 0
        let excused = 0
        let lateTotal = 0

        reportEvents.forEach(e => {
          const record = attMap.get(`${e.id}:${m.user_id}`)
          let eligible = getEligibleMembers(e).some(em => em.user_id === m.user_id)
          if (e.event_type === 'match') {
            const role = lineupMap.get(e.id)?.[m.user_id]
            eligible = role === 'starter' || role === 'sub'
              || (record?.status === 'excused' && record?.locked_by_source)
          }
          if (!eligible) return

          eventCount += 1

          if (!record) { absent++; return }

          if (record.status === 'present') present++
          else if (record.status === 'late') {
            present++; late++
            lateTotal += Number(record.late_minutes) || 0
          }
          else if (record.status === 'excused') excused++
          else { absent++ } // absent + uncertain القديم
        })

        const denominator    = eventCount - excused
        const generalRate    = eventCount > 0 ? Math.round((present / eventCount) * 100) : 0
        const effectiveRate  = denominator > 0 ? Math.round((present / denominator) * 100) : 0

        return {
          userId: m.user_id,
          name: m.profile?.full_name || '',
          avatarUrl: m.profile?.avatar_url,
          events: eventCount,
          present,
          late,
          avgLate: late > 0 ? Math.round(lateTotal / late) : 0,
          absent,
          excused,
          generalRate,
          effectiveRate,
        }
      })

    return rows.sort((a, b) => {
      const aVal = (a as any)[reportSortKey]
      const bVal = (b as any)[reportSortKey]
      const result = typeof aVal === 'string'
        ? aVal.localeCompare(String(bVal), 'ar')
        : Number(aVal) - Number(bVal)
      return reportSortDir === 'asc' ? result : -result
    })
  }, [attendanceRecords, members, reportEvents, reportSortKey, reportSortDir, matchLineups, matchEventMap])

  function toggleReportSort(key: ReportSortKey) {
    if (reportSortKey === key) {
      setReportSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
      return
    }
    setReportSortKey(key)
    setReportSortDir(key === 'name' ? 'asc' : 'desc')
  }

  function SortIcon({ sortKey }: { sortKey: ReportSortKey }) {
    if (reportSortKey !== sortKey) {
      return <ChevronDown size={14} className="text-slate-300" />
    }
    return reportSortDir === 'asc'
      ? <ChevronUp size={14} className="text-brand-600" />
      : <ChevronDown size={14} className="text-brand-600" />
  }

  function ReportHeader({ sortKey, children }: { sortKey: ReportSortKey; children: React.ReactNode }) {
    return (
      <th className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={() => toggleReportSort(sortKey)}
          className="inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:text-brand-700"
        >
          {children}
          <SortIcon sortKey={sortKey} />
        </button>
      </th>
    )
  }

  // Modal sections
  const mPresent   = modalAtt.filter(a => a.status === 'present')
  const mLate      = modalAtt.filter(a => a.status === 'late')
  const mAbsent    = modalAtt.filter(a => a.status === 'absent')
  const mExcused   = modalAtt.filter(a => a.status === 'excused')
  const eligibleMembers = getEligibleMembers(modalEv)
  const mNotRec    = eligibleMembers.filter(m => !modalAtt.find(a => a.user_id === m.user_id))
  const mLists: Record<string, any[]> = { present: mPresent, late: mLate, excused: mExcused, absent: mAbsent }

  const EXCUSE_SOURCE_LABEL: Record<string, string> = {
    leave: 'إجازة معتمدة', admin_leave: 'إجازة إدارية',
    absence: 'قرار إداري', medical: 'إصابة',
    tournament_suspension: 'إيقاف بطولة',
  }

  function MemberRow({ a, m }: { a?: any; m?: any }) {
    const profile   = a?.profile || m?.profile
    const userId    = a?.user_id  || m?.user_id
    const isLocked  = a?.locked_by_source && a?.status === 'excused'
    const lockLabel = isLocked ? (EXCUSE_SOURCE_LABEL[a.source_type] || 'عذر رسمي') : null
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
          {isLocked && (
            <div className="text-xs text-blue-600 font-bold">🔒 غائب بعذر: {lockLabel}</div>
          )}
          {!isLocked && a?.status === 'excused' && a?.excuse_reason && (
            <div className="text-xs text-slate-500">📋 {a.excuse_reason}</div>
          )}
        </div>
        {isCoach && (
          <AttendanceButton
            status={a?.status || 'present'}
            locked={false}
            compact
            includeExcused={!isLocked}
            hideUncertain
            onSelect={s => {
              if (isLocked && s === 'absent') {
                alert(`لا يمكن التغيير — ${lockLabel}`)
                return
              }
              if (s === 'late')         setShowLate({ user_id: userId, profile })
              else if (s === 'excused') setShowExcused({ user_id: userId, profile })
              else                      setStatus(userId, s)
            }}
          />
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
          { key: 'report',   label: 'كشف الحضور' },
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
        <div className={`grid grid-cols-2 ${tab === 'report' ? 'md:grid-cols-4' : 'md:grid-cols-4'} gap-2 items-end`}>
          {tab === 'report' && (
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">نوع الموعد</label>
              <select className="form-input text-sm py-2"
                value={reportEventType} onChange={e => setReportEventType(e.target.value)}>
                {REPORT_EVENT_TYPES.map(type => (
                  <option key={type.key} value={type.key}>{type.label}</option>
                ))}
              </select>
            </div>
          )}
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
          {tab !== 'report' && (
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
          )}
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
      ) : tab === 'report' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-800">كشف الحضور</h3>
              <p className="text-xs text-slate-400 mt-1">
                {reportEvents.length} موعد داخل الفلاتر الحالية
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
              {reportRows.length} لاعب
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <ReportHeader sortKey="name">اسم اللاعب</ReportHeader>
                  <ReportHeader sortKey="events">المواعيد</ReportHeader>
                  <ReportHeader sortKey="present">حضر</ReportHeader>
                  <ReportHeader sortKey="late">تأخر</ReportHeader>
                  <ReportHeader sortKey="avgLate">متوسط التأخير</ReportHeader>
                  <ReportHeader sortKey="absent">غياب بدون عذر</ReportHeader>
                  <ReportHeader sortKey="excused">غياب بعذر</ReportHeader>
                  <ReportHeader sortKey="generalRate">النسبة العامة</ReportHeader>
                  <ReportHeader sortKey="effectiveRate">النسبة الفعلية</ReportHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(reportRows as any[]).map(row => (
                  <tr key={row.userId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.name || '?'} src={row.avatarUrl} size="sm" />
                        <span className="font-extrabold text-slate-700">{row.name || 'بدون اسم'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-black text-slate-700">{row.events}</td>
                    <td className="px-3 py-3 font-black text-emerald-700">{row.present}</td>
                    <td className="px-3 py-3 font-black text-orange-700">{row.late}</td>
                    <td className="px-3 py-3 font-black text-slate-600">{row.avgLate} د</td>
                    <td className="px-3 py-3 font-black text-red-600">{row.absent}</td>
                    <td className="px-3 py-3 font-black text-blue-600">{row.excused}</td>
                    <td className="px-3 py-3">
                      <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                        row.generalRate >= 80 ? 'bg-emerald-100 text-emerald-700'
                        : row.generalRate >= 60 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>{row.generalRate}%</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                        row.effectiveRate >= 80 ? 'bg-emerald-100 text-emerald-700'
                        : row.effectiveRate >= 60 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>{row.effectiveRate}%</span>
                    </td>
                  </tr>
                ))}
                {reportRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-400">
                      لا يوجد لاعبون لعرضهم
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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

                {/* 5 chips (only when no member filter) */}
                {!filterMemberId && (
                  <div className="grid grid-cols-5 gap-1.5">
                    {STATUS_CHIPS.filter(chip => chip.key !== 'uncertain').map(chip => (
                      <div key={chip.key} className={`${chip.cls} rounded-xl py-2 text-center`}>
                        <div className="text-lg font-black leading-none">{counts[chip.key] || 0}</div>
                        <div className="text-[10px] mt-0.5 font-bold opacity-75 leading-tight">{chip.label}</div>
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
                {SECTIONS.filter(sec => sec.key !== 'uncertain').map(sec => {
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

      {/* ── Excused absence modal ── */}
      <Modal open={!!showExcused} onClose={() => { setShowExcused(null); setExcusedReason('') }}
        title={`غياب بعذر — ${showExcused?.profile?.full_name}`}>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs text-slate-600">
          📋 الغياب بعذر <strong>لا يكسر سلسلة الحضور</strong> ولا يؤثر على نسبة الحضور الفعلية.
        </div>
        <FormField label="سبب الغياب">
          <input className="form-input" value={excusedReason}
            onChange={e => setExcusedReason(e.target.value)}
            placeholder="مرض، ظرف طارئ، رحلة..."
            onKeyDown={e => e.key === 'Enter' && saveExcused()}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowExcused(null); setExcusedReason('') }}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveExcused}>تسجيل الغياب بعذر</button>
        </div>
      </Modal>
    </div>
  )
}
