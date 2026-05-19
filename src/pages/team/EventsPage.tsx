import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, MapPin, Clock, Repeat, Trash2, Users, X, Check, Trophy, Edit2, Tag, CalendarDays } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService, notificationService, calendarMarkerService, matchService, attendanceService } from '../../services'
import { Spinner, PageHeader, EmptyState, Modal, FormField, Tabs, AttendanceButton } from '../../components/ui'
import { EVENT_CONFIG, WEEK_DAYS, canManageEvents, formatDate, isEventLocked } from '../../utils/helpers'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { arSA } from 'date-fns/locale'

const EVENT_TYPES = ['training','meeting','camp','assessment','other']
const ATT_GROUPS = ['الكل','اللاعبون فقط','المدربون فقط','اللاعبون والمدربون','الإداريون فقط','مجموعة مخصصة']
const HOME_AWAY_LABEL: Record<string, string> = { home: '🏟️ ملعبنا', away: '🚌 ملعب المنافس', neutral: '⚖️ أرض محايدة' }

const MARKER_COLORS = [
  { label: 'أزرق',   value: '#3B82F6' },
  { label: 'أخضر',   value: '#10B981' },
  { label: 'أحمر',   value: '#EF4444' },
  { label: 'برتقالي',value: '#F97316' },
  { label: 'بنفسجي', value: '#8B5CF6' },
  { label: 'وردي',   value: '#EC4899' },
  { label: 'أصفر',   value: '#F59E0B' },
  { label: 'رمادي',  value: '#6B7280' },
]

export default function EventsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [view, setView] = useState('calendar')
  const [tab, setTab] = useState('upcoming')
  const [calMonth, setCalMonth] = useState(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [showRecurring, setShowRecurring] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [showResult, setShowResult] = useState<any>(null)
  const [resultForm, setResultForm] = useState({ goals_for: '', goals_against: '' })
  const [detailAtts, setDetailAtts] = useState<Record<string, string>>({})
  const [editEvent, setEditEvent] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  // Calendar markers
  const [markers, setMarkers] = useState<any[]>([])
  const [showMarkerModal, setShowMarkerModal] = useState(false)
  const [editMarker, setEditMarker] = useState<any>(null)
  const defaultMarkerForm = { title: '', description: '', color: '#3B82F6', start_date: '', end_date: '' }
  const [markerForm, setMarkerForm] = useState(defaultMarkerForm)
  const setMF = (k: string, v: any) => setMarkerForm(p => ({ ...p, [k]: v }))
  const [markerSaving, setMarkerSaving] = useState(false)

  // Bulk edit
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkSelGroup, setBulkSelGroup] = useState('')
  const [bulkMode, setBulkMode] = useState<'all' | 'range' | 'pick'>('all')
  const [bulkDateFrom, setBulkDateFrom] = useState('')
  const [bulkDateTo, setBulkDateTo] = useState('')
  const [bulkPickedIds, setBulkPickedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'delete' | 'reschedule'>('delete')
  const [bulkNewStartTime, setBulkNewStartTime] = useState('18:00')
  const [bulkNewEndTime, setBulkNewEndTime] = useState('20:00')
  const [bulkSaving, setBulkSaving] = useState(false)

  const defaultForm = {
    title: '', event_type: 'training', start_datetime: '', end_datetime: '',
    location: '', map_url: '', att_group: 'اللاعبون فقط', description: '',
    selectedMembers: [] as string[],
    opponent: '', home_away: 'home', match_category: 'friendly', tournament_name: ''
  }
  const [form, setForm] = useState(defaultForm)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const defaultRecur = {
    title: '', event_type: 'training', days_of_week: [] as number[],
    start_date: '', end_date: '', start_time: '18:00', end_time: '20:00',
    location: '', map_url: '', att_group: 'اللاعبون فقط',
    selectedMembers: [] as string[]
  }
  const [recurForm, setRecurForm] = useState(defaultRecur)
  const setR = (k: string, v: any) => setRecurForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(m => setMembers(m.filter((x: any) => x.role !== 'parent')))
    load()
    loadMarkers()
  }, [teamId, user])

  useEffect(() => {
    if (!showDetail || !user) { setDetailAtts({}); return }
    const ids = (showDetail.events as any[]).map((e: any) => e.id)
    eventService.getAttendanceForEvents(ids, user.id).then(setDetailAtts)
  }, [showDetail, user?.id])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const e = await eventService.getTeamEvents(teamId)
    setEvents(e); setLoading(false)
  }

  async function loadMarkers() {
    if (!teamId) return
    const m = await calendarMarkerService.getAll(teamId)
    setMarkers(m)
  }

  async function addEvent() {
    if (!form.title.trim() || !form.start_datetime || !teamId) return
    setSaving(true)
    const isPlayerOnly = form.event_type === 'training'
    const attGroup = isPlayerOnly ? 'اللاعبون فقط' : form.att_group
    const memberIds = attGroup === 'مجموعة مخصصة' && form.selectedMembers.length > 0
      ? form.selectedMembers : null
    await eventService.createEvent({
      title: form.title, event_type: form.event_type,
      start_datetime: form.start_datetime, end_datetime: form.end_datetime || null,
      location: form.location, map_url: form.map_url,
      att_group: attGroup, description: form.description,
      att_member_ids: memberIds, team_id: teamId, created_by: user!.id,
      ...(form.event_type === 'match' ? {
        opponent: form.opponent || null,
        home_away: form.home_away,
        match_category: form.match_category,
        tournament_name: form.match_category === 'tournament' ? (form.tournament_name || null) : null
      } : {})
    })
    await notificationService.createForTeam(teamId, `موعد جديد: ${form.title}`, formatDate(form.start_datetime), 'event', user!.id)
    await load()
    setShowAdd(false); setForm(defaultForm); setSaving(false)
  }

  async function addRecurring() {
    if (!recurForm.title.trim() || !recurForm.start_date || !recurForm.end_date || recurForm.days_of_week.length === 0 || !teamId) return
    setSaving(true)
    const isPlayerOnly = recurForm.event_type === 'training'
    const attGroup = isPlayerOnly ? 'اللاعبون فقط' : recurForm.att_group
    const memberIds = attGroup === 'مجموعة مخصصة' && recurForm.selectedMembers.length > 0
      ? recurForm.selectedMembers : null
    const payload = { ...recurForm, att_group: attGroup, att_member_ids: memberIds }
    const result = await eventService.createRecurringEvents(payload, user!.id, teamId)
    if (!result.error) {
      await notificationService.createForTeam(teamId, `جدول متكرر: ${recurForm.title}`, '', 'event', user!.id)
      await load()
      setShowRecurring(false); setRecurForm(defaultRecur)
    }
    setSaving(false)
  }

  async function deleteEvent(ev: any, scope?: string) {
    if (ev.recurrence_group_id && scope) {
      await eventService.deleteRecurringEvents(ev.recurrence_group_id, scope as any, ev.start_datetime)
    } else {
      await eventService.deleteEvent(ev.id)
    }
    await load(); setConfirmDelete(null); setShowDetail(null)
  }

  async function setDetailAtt(eventId: string, status: string) {
    if (!user || !teamId) return
    const prev = detailAtts[eventId] ?? ''
    setDetailAtts(p => ({ ...p, [eventId]: status }))
    const { error } = await attendanceService.markSelf(
      teamId, eventId, user.id,
      status as 'present' | 'late' | 'absent',
    )
    if (error) setDetailAtts(p => ({ ...p, [eventId]: prev }))
  }

  function openEdit(ev: any) {
    setEditEvent(ev)
    setEditForm({
      title: ev.title,
      event_type: ev.event_type,
      start_datetime: ev.start_datetime?.slice(0, 16) || '',
      end_datetime: ev.end_datetime?.slice(0, 16) || '',
      location: ev.location || '',
      map_url: ev.map_url || '',
      description: ev.description || '',
      att_group: ev.att_group || 'اللاعبون فقط',
      opponent: ev.opponent || '',
      home_away: ev.home_away || 'home',
      match_category: ev.match_category || 'friendly',
      tournament_name: ev.tournament_name || '',
    })
    setShowDetail(null)
  }

  async function saveEdit() {
    if (!editEvent || !teamId || !user) return
    setSaving(true)
    const isPlayerOnly = editForm.event_type === 'training'
    const attGroup = isPlayerOnly ? 'اللاعبون فقط' : editForm.att_group
    await eventService.updateEvent(editEvent.id, {
      title: editForm.title,
      event_type: editForm.event_type,
      start_datetime: editForm.start_datetime,
      end_datetime: editForm.end_datetime || null,
      location: editForm.location || null,
      map_url: editForm.map_url || null,
      description: editForm.description || null,
      att_group: attGroup,
      ...(editForm.event_type === 'match' ? {
        opponent: editForm.opponent || null,
        home_away: editForm.home_away,
        match_category: editForm.match_category,
        tournament_name: editForm.match_category === 'tournament' ? (editForm.tournament_name || null) : null
      } : {})
    })
    await notificationService.createForTeam(teamId, `تم تعديل الموعد: ${editForm.title}`, editForm.start_datetime, 'event', user.id)
    await load()
    setEditEvent(null); setSaving(false)
  }

  async function saveResult() {
    if (!showResult || resultForm.goals_for === '' || resultForm.goals_against === '') return
    setSaving(true)
    await eventService.updateEvent(showResult.id, {
      goals_for: parseInt(resultForm.goals_for),
      goals_against: parseInt(resultForm.goals_against)
    })
    await load()
    setShowResult(null); setResultForm({ goals_for: '', goals_against: '' }); setSaving(false)
  }

  // ── Marker CRUD ───────────────────────────────────────────────────────
  async function saveMarker() {
    if (!markerForm.title.trim() || !markerForm.start_date || !markerForm.end_date || !teamId) return
    setMarkerSaving(true)
    if (editMarker) {
      await calendarMarkerService.update(editMarker.id, markerForm)
    } else {
      await calendarMarkerService.create({ ...markerForm, team_id: teamId, created_by: user!.id })
    }
    await loadMarkers()
    setEditMarker(null); setMarkerForm(defaultMarkerForm); setMarkerSaving(false)
  }

  async function deleteMarker(id: string) {
    await calendarMarkerService.delete(id)
    await loadMarkers()
  }

  function openEditMarker(m: any) {
    setEditMarker(m)
    setMarkerForm({ title: m.title, description: m.description || '', color: m.color, start_date: m.start_date, end_date: m.end_date })
  }

  // ── Bulk edit ─────────────────────────────────────────────────────────
  const recurGroups = (() => {
    const map: Record<string, { id: string; title: string; events: any[] }> = {}
    events.forEach(e => {
      if (!e.recurrence_group_id) return
      if (!map[e.recurrence_group_id]) map[e.recurrence_group_id] = { id: e.recurrence_group_id, title: e.title, events: [] }
      map[e.recurrence_group_id].events.push(e)
    })
    return Object.values(map)
  })()

  const bulkGroupEvents = recurGroups.find(g => g.id === bulkSelGroup)?.events || []

  const bulkTargetEvents = (() => {
    if (!bulkSelGroup) return []
    const grpEvs = bulkGroupEvents
    if (bulkMode === 'all') return grpEvs
    if (bulkMode === 'range') return grpEvs.filter(e =>
      (!bulkDateFrom || e.start_datetime.slice(0, 10) >= bulkDateFrom) &&
      (!bulkDateTo   || e.start_datetime.slice(0, 10) <= bulkDateTo)
    )
    if (bulkMode === 'pick') return grpEvs.filter(e => bulkPickedIds.has(e.id))
    return []
  })()

  async function applyBulkEdit() {
    if (!bulkTargetEvents.length) return
    setBulkSaving(true)
    const ids = bulkTargetEvents.map((e: any) => e.id)
    if (bulkAction === 'delete') {
      await eventService.bulkDeleteEvents(ids)
    } else {
      await eventService.bulkUpdateEventTimes(ids, bulkNewStartTime, bulkNewEndTime)
    }
    await load()
    setShowBulkEdit(false)
    setBulkSelGroup(''); setBulkMode('all'); setBulkDateFrom(''); setBulkDateTo('')
    setBulkPickedIds(new Set()); setBulkAction('delete')
    setBulkSaving(false)
  }

  const toggleDay = (d: number) =>
    setR('days_of_week', recurForm.days_of_week.includes(d)
      ? recurForm.days_of_week.filter(x => x !== d)
      : [...recurForm.days_of_week, d])

  const toggleMember = (uid: string, which: 'form' | 'recur') => {
    if (which === 'form') {
      setF('selectedMembers', form.selectedMembers.includes(uid)
        ? form.selectedMembers.filter(x => x !== uid)
        : [...form.selectedMembers, uid])
    } else {
      setR('selectedMembers', recurForm.selectedMembers.includes(uid)
        ? recurForm.selectedMembers.filter(x => x !== uid)
        : [...recurForm.selectedMembers, uid])
    }
  }

  async function openMatchEvent(e: any) {
    const match = await matchService.getByEventId(e.id)
    if (match?.id) navigate(`/team/${teamId}/matches/${match.id}`)
    else navigate(`/team/${teamId}/matches`)
  }

  const canManage = canManageEvents(myRole)
  const isParent = myRole === 'parent'
  const now = new Date()

  // Visibility: training/match are player-only unless explicitly targeted via att_member_ids
  const ROLE_GROUPS: Record<string, string[]> = {
    'اللاعبون فقط': ['player'],
    'المدربون فقط': ['head_coach','assistant_coach'],
    'اللاعبون والمدربون': ['player','head_coach','assistant_coach'],
    'الإداريون فقط': ['administrator','owner'],
  }
  function isEventVisible(e: any): boolean {
    if (canManage) return true
    // Training and matches are players-only by default
    if ((e.event_type === 'training' || e.event_type === 'match') && !e.att_member_ids?.length) {
      return myRole === 'player'
    }
    if (e.att_member_ids?.length > 0) return e.att_member_ids.includes(user?.id)
    const allowedRoles = ROLE_GROUPS[e.att_group]
    if (allowedRoles) return allowedRoles.includes(myRole)
    return true
  }
  const visibleEvents = isParent
    ? events.filter(e => e.event_type === 'match')
    : events.filter(isEventVisible)
  const upcoming = visibleEvents.filter(e => new Date(e.start_datetime) >= now)
  const past = visibleEvents.filter(e => new Date(e.start_datetime) < now).reverse()
  const list = tab === 'upcoming' ? upcoming : past

  const monthDays = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDayOfWeek = getDay(startOfMonth(calMonth))
  const eventsOnDay = (day: Date) => visibleEvents.filter(e => isSameDay(parseISO(e.start_datetime), day))
  const markersOnDay = (day: Date) => markers.filter(m => {
    const d = format(day, 'yyyy-MM-dd')
    return d >= m.start_date && d <= m.end_date
  })
  const arDays = ['أح','إث','ثل','أر','خم','جم','سب']

  const MemberPicker = ({ which }: { which: 'form' | 'recur' }) => {
    const selected = which === 'form' ? form.selectedMembers : recurForm.selectedMembers
    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
        <div className="p-2 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>اختر الأعضاء ({selected.length} محدد)</span>
          {selected.length > 0 && (
            <button onClick={() => which === 'form' ? setF('selectedMembers', []) : setR('selectedMembers', [])}
              className="text-red-500 hover:text-red-700 text-xs">مسح الكل</button>
          )}
        </div>
        {members.map(m => {
          const isSelected = selected.includes(m.user_id)
          return (
            <div key={m.id} onClick={() => toggleMember(m.user_id, which)}
              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                {isSelected && <Check size={11} className="text-white"/>}
              </div>
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {m.profile?.full_name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.profile?.full_name}</div>
                <div className="text-xs text-slate-400">{m.role}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const EventTypeSelector = ({ val, onChange }: { val: string; onChange: (v: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {EVENT_TYPES.map(t => {
        const c = EVENT_CONFIG[t as keyof typeof EVENT_CONFIG]
        return (
          <button key={t} type="button" onClick={() => onChange(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${val === t ? 'text-white' : 'border-slate-200 bg-white text-slate-600'}`}
            style={val === t ? { background: c.color, borderColor: c.color } : {}}>
            {c.icon} {c.label}
          </button>
        )
      })}
    </div>
  )

  // Att group selector — hidden for training/match (forced to players only)
  const AttGroupField = ({ type, val, onChange, selectedMembers, onMemberToggle }: {
    type: string; val: string; onChange: (v: string) => void; selectedMembers: string[]
    onMemberToggle: (uid: string) => void
  }) => {
    if (type === 'training' || type === 'assessment') {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700 flex items-center gap-1.5">
          <Users size={12}/>
          التمارين والاختبارات تظهر للاعبين فقط بشكل تلقائي
        </div>
      )
    }
    return (
      <>
        <FormField label="من يسجل الحضور؟">
          <select className="form-input" value={val} onChange={e => onChange(e.target.value)}>
            {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
          </select>
        </FormField>
        {val === 'مجموعة مخصصة' && (
          <FormField label="الأعضاء المدعوون">
            <MemberPicker which={type === 'form' as any ? 'form' : 'recur'}/>
            {selectedMembers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠️ اختر عضواً واحداً على الأقل</p>
            )}
          </FormField>
        )}
      </>
    )
  }

  // Match result badge
  const ResultBadge = ({ e }: { e: any }) => {
    if (e.goals_for === null || e.goals_for === undefined) return null
    const win = e.goals_for > e.goals_against
    const draw = e.goals_for === e.goals_against
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold ${
        win ? 'bg-emerald-100 text-emerald-700' : draw ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
      }`}>
        {win ? '🏆 فوز' : draw ? '🤝 تعادل' : '❌ خسارة'} · {e.goals_for}-{e.goals_against}
      </span>
    )
  }

  return (
    <div>
      <PageHeader title="المواعيد"
        action={canManage && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowMarkerModal(true)}>
              <Tag size={13}/> علامات
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBulkEdit(true)}>
              <Edit2 size={13}/> تعديل مكررة
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRecurring(true)}>
              <Repeat size={13}/> متكرر
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={13}/> موعد
            </button>
          </div>
        )}/>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        {[['calendar','📅 تقويم'],['list','📋 قائمة']].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>
        ))}
      </div>

      {/* Marker legend (if any visible in current month) */}
      {markers.length > 0 && view === 'calendar' && (() => {
        const monthStart = format(startOfMonth(calMonth), 'yyyy-MM-dd')
        const monthEnd   = format(endOfMonth(calMonth), 'yyyy-MM-dd')
        const visible = markers.filter(m => m.start_date <= monthEnd && m.end_date >= monthStart)
        if (!visible.length) return null
        return (
          <div className="flex flex-wrap gap-2 mb-3">
            {visible.map(m => (
              <span key={m.id} className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full"
                style={{ background: m.color + '22', color: m.color, border: `1px solid ${m.color}55` }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: m.color }}/>
                {m.title}
              </span>
            ))}
          </div>
        )
      })()}

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {/* ── CALENDAR VIEW ── */}
          {view === 'calendar' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()-1))} className="btn btn-ghost btn-sm px-2">‹</button>
                <span className="font-bold text-sm">{format(calMonth,'MMMM yyyy',{locale:arSA})}</span>
                <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth()+1))} className="btn btn-ghost btn-sm px-2">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {arDays.map(d => <div key={d} className="text-center text-xs font-bold text-slate-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(firstDayOfWeek).fill(null).map((_,i) => <div key={`e${i}`}/>)}
                {monthDays.map(day => {
                  const dayEvs = eventsOnDay(day)
                  const dayMarkers = markersOnDay(day)
                  const isToday = isSameDay(day, now)
                  return (
                    <div key={day.toISOString()}
                      className={`min-h-[56px] rounded-xl p-1 cursor-pointer transition-colors ${isToday ? 'bg-brand-50 ring-1 ring-brand-400' : dayEvs.length ? 'hover:bg-slate-50' : ''}`}
                      onClick={() => (dayEvs.length || dayMarkers.length) && setShowDetail({ date: day, events: dayEvs, markers: dayMarkers })}>
                      {/* Marker bars */}
                      {dayMarkers.length > 0 && (
                        <div className="flex flex-col gap-px mb-0.5 -mx-1 px-0.5">
                          {dayMarkers.slice(0, 2).map(m => (
                            <div key={m.id} className="h-1 rounded-sm" style={{ background: m.color }} title={m.title}/>
                          ))}
                        </div>
                      )}
                      <div className={`text-xs font-bold mb-0.5 text-center ${isToday ? 'text-brand-600' : 'text-slate-600'}`}>
                        {day.getDate()}
                      </div>
                      {dayEvs.slice(0,2).map(e => {
                        const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
                        return <div key={e.id} className="text-center text-base leading-none" title={e.title}>{c.icon}</div>
                      })}
                      {dayEvs.length > 2 && <div className="text-xs text-center text-slate-400">+{dayEvs.length-2}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {view === 'list' && (
            <>
              <Tabs tabs={[{key:'upcoming',label:`القادمة (${upcoming.length})`},{key:'past',label:`السابقة (${past.length})`}]} active={tab} onChange={setTab}/>
              {list.length === 0
                ? <div className="card"><EmptyState title="لا توجد أحداث"/></div>
                : <div className="space-y-3">
                    {list.map(e => {
                      const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
                      const isPast = new Date(e.start_datetime) < now
                      const hasResult = e.goals_for !== null && e.goals_for !== undefined
                      return (
                        <div key={e.id} className={`card mb-0 border-r-4 ${c.borderClass} cursor-pointer hover:shadow-md transition-all`}
                          onClick={() => e.event_type === 'match' ? openMatchEvent(e) : setShowDetail({ date: parseISO(e.start_datetime), events: [e], markers: [] })}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl flex-shrink-0">{c.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm truncate">{e.title}</span>
                                {e.recurrence_group_id && <Repeat size={11} className="text-slate-400 flex-shrink-0"/>}
                                {isEventLocked(e.start_datetime) && <span className="badge badge-red text-xs">مغلق</span>}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock size={10}/> {formatDate(e.start_datetime)} · {e.start_datetime.slice(11,16)}
                              </div>
                              {e.location && (
                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                  <MapPin size={10}/> {e.location}
                                  {e.map_url && <a href={e.map_url} target="_blank" rel="noreferrer" className="text-blue-500 underline mr-1" onClick={ev => ev.stopPropagation()}>خريطة</a>}
                                </div>
                              )}
                              {e.event_type === 'match' && e.opponent && (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className="text-xs text-slate-600 font-bold">ضد: {e.opponent}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="text-xs text-slate-500">{HOME_AWAY_LABEL[e.home_away] || e.home_away}</span>
                                  {e.tournament_name && (
                                    <>
                                      <span className="text-slate-300">·</span>
                                      <span className="text-xs text-blue-600">🏆 {e.tournament_name}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {e.event_type === 'match' && <div className="mt-1"><ResultBadge e={e}/></div>}
                              <div className="flex items-center gap-2 mt-1.5">
                                {canManage && e.event_type !== 'match' && (
                                  <button onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                                    className="text-xs text-blue-500 font-bold flex items-center gap-1 hover:text-blue-700 transition-colors">
                                    <Edit2 size={11}/> تعديل
                                  </button>
                                )}
                                {e.event_type === 'match' && (
                                  <button onClick={ev => { ev.stopPropagation(); openMatchEvent(e) }}
                                    className="text-xs text-brand-600 font-bold flex items-center gap-1 hover:text-brand-800 transition-colors">
                                    <Trophy size={11}/> تفاصيل المباراة
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                <span className="badge text-xs" style={{background:c.bg,color:c.color}}>{c.label}</span>
                                {e.att_member_ids?.length > 0
                                  ? <span className="badge badge-blue text-xs"><Users size={9}/> {e.att_member_ids.length} محدد</span>
                                  : e.att_group && <span className="badge badge-gray text-xs">{e.att_group}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>}
            </>
          )}
        </>
      )}

      {/* ── Day detail modal ── */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)}
        title={showDetail ? format(showDetail.date,'EEEE d MMMM yyyy',{locale:arSA}) : ''}>
        {/* Marker info in day detail */}
        {showDetail?.markers?.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {showDetail.markers.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
                style={{ background: m.color + '18', color: m.color, border: `1px solid ${m.color}44` }}>
                <Tag size={11}/>
                <span>{m.title}</span>
                {m.description && <span className="font-normal opacity-70">— {m.description}</span>}
                <span className="font-normal opacity-60 mr-auto">{m.start_date} ← {m.end_date}</span>
              </div>
            ))}
          </div>
        )}
        {showDetail?.events.map((e: any) => {
          const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
          const isPast = new Date(e.start_datetime) < now
          const hasResult = e.goals_for !== null && e.goals_for !== undefined
          return (
            <div key={e.id} className={`card border-r-4 ${c.borderClass} mb-3`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{c.icon}</span>
                    <span className="font-bold">{e.title}</span>
                    {e.recurrence_group_id && <Repeat size={12} className="text-slate-400"/>}
                  </div>
                  <div className="text-xs text-slate-500">{e.start_datetime.slice(11,16)}{e.end_datetime ? ` — ${e.end_datetime.slice(11,16)}` : ''}</div>
                  {e.location && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <MapPin size={10}/> {e.location}
                      {e.map_url && <a href={e.map_url} target="_blank" rel="noreferrer" className="text-blue-500 underline mr-1">خريطة</a>}
                    </div>
                  )}
                  {e.event_type === 'match' && (
                    <div className="mt-2">
                      <button
                        onClick={() => { setShowDetail(null); openMatchEvent(e) }}
                        className="btn btn-primary btn-sm w-full justify-center">
                        <Trophy size={12}/> عرض تفاصيل المباراة
                      </button>
                    </div>
                  )}
                  {e.att_member_ids?.length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Users size={10}/> هذا الموعد لـ {e.att_member_ids.length} عضو محدد
                    </div>
                  )}
                  {!e.att_member_ids && e.att_group && <div className="text-xs text-slate-400 mt-1">الحضور: {e.att_group}</div>}
                </div>
                {canManage && e.event_type !== 'match' && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(e)} className="text-slate-400 hover:text-blue-500 p-1 flex-shrink-0">
                      <Edit2 size={14}/>
                    </button>
                    <button onClick={() => setConfirmDelete(e)} className="text-slate-400 hover:text-red-500 p-1 flex-shrink-0">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 mt-3">
                <p className="text-xs font-bold text-slate-500 mb-2">هل ستحضر؟</p>
                <AttendanceButton
                  status={detailAtts[e.id] ?? ''}
                  locked={isEventLocked(e.start_datetime)}
                  hideUncertain
                  onSelect={s => setDetailAtt(e.id, s)}
                />
              </div>
            </div>
          )
        })}
        {showDetail?.events.length === 0 && showDetail?.markers?.length > 0 && (
          <div className="text-center py-6 text-slate-400 text-sm">لا توجد مواعيد في هذا اليوم</div>
        )}
      </Modal>

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="حذف الموعد">
          <p className="text-sm text-slate-600 mb-4">هل تريد حذف "{confirmDelete.title}"؟</p>
          {confirmDelete.recurrence_group_id ? (
            <div className="space-y-2">
              <button onClick={() => deleteEvent(confirmDelete,'all')} className="btn btn-danger w-full justify-center">حذف كل المواعيد المتكررة</button>
              <button onClick={() => deleteEvent(confirmDelete,'future')} className="btn btn-ghost w-full justify-center text-amber-600 border-amber-200">حذف هذا وما بعده</button>
              <button onClick={() => deleteEvent(confirmDelete)} className="btn btn-ghost w-full justify-center">حذف هذا فقط</button>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost w-full justify-center">إلغاء</button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>إلغاء</button>
              <button className="btn btn-danger" onClick={() => deleteEvent(confirmDelete)}>حذف</button>
            </div>
          )}
        </Modal>
      )}

      {/* ── ADD SINGLE EVENT MODAL ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة موعد جديد" width="max-w-lg">
        <FormField label="العنوان" required>
          <input className="form-input" value={form.title} onChange={e => setF('title',e.target.value)} placeholder="تدريب أسبوعي"/>
        </FormField>
        <FormField label="النوع">
          <EventTypeSelector val={form.event_type} onChange={v => {
            setF('event_type', v)
            if (v === 'training' || v === 'match') setF('att_group', 'اللاعبون فقط')
          }}/>
        </FormField>


        <div className="grid grid-cols-2 gap-3">
          <FormField label="البداية" required>
            <input className="form-input" type="datetime-local" value={form.start_datetime} onChange={e => setF('start_datetime',e.target.value)}/>
          </FormField>
          <FormField label="النهاية">
            <input className="form-input" type="datetime-local" value={form.end_datetime} onChange={e => setF('end_datetime',e.target.value)}/>
          </FormField>
        </div>
        <FormField label="الموقع">
          <input className="form-input" value={form.location} onChange={e => setF('location',e.target.value)} placeholder="الملعب الرئيسي"/>
        </FormField>
        <FormField label="رابط Google Maps">
          <input className="form-input" value={form.map_url} onChange={e => setF('map_url',e.target.value)} placeholder="https://maps.google.com/..."/>
        </FormField>
        <AttGroupField
          type={form.event_type} val={form.att_group} onChange={v => setF('att_group', v)}
          selectedMembers={form.selectedMembers} onMemberToggle={uid => toggleMember(uid, 'form')}
        />
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addEvent}
            disabled={saving || (form.att_group==='مجموعة مخصصة' && form.selectedMembers.length===0 && form.event_type !== 'training' && form.event_type !== 'match')}>
            {saving ? <Spinner size="sm"/> : 'إضافة'}
          </button>
        </div>
      </Modal>

      {/* ── ADD RECURRING MODAL ── */}
      <Modal open={showRecurring} onClose={() => setShowRecurring(false)} title="إضافة جدول متكرر" width="max-w-lg">
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-4 text-xs text-brand-700">
          <Repeat size={12} className="inline ml-1"/>
          مثلاً: تدريب كل ثلاثاء وخميس من سبتمبر حتى مايو
        </div>
        <FormField label="العنوان" required>
          <input className="form-input" value={recurForm.title} onChange={e => setR('title',e.target.value)} placeholder="تدريب أسبوعي"/>
        </FormField>
        <FormField label="النوع">
          <EventTypeSelector val={recurForm.event_type} onChange={v => {
            setR('event_type', v)
            if (v === 'training' || v === 'match') setR('att_group', 'اللاعبون فقط')
          }}/>
        </FormField>
        <FormField label="أيام التكرار" required>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((d,i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${recurForm.days_of_week.includes(i) ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {d}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ" required>
            <input className="form-input" type="date" value={recurForm.start_date} onChange={e => setR('start_date',e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ" required>
            <input className="form-input" type="date" value={recurForm.end_date} onChange={e => setR('end_date',e.target.value)}/>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="وقت البداية">
            <input className="form-input" type="time" value={recurForm.start_time} onChange={e => setR('start_time',e.target.value)}/>
          </FormField>
          <FormField label="وقت النهاية">
            <input className="form-input" type="time" value={recurForm.end_time} onChange={e => setR('end_time',e.target.value)}/>
          </FormField>
        </div>
        <FormField label="الموقع">
          <input className="form-input" value={recurForm.location} onChange={e => setR('location',e.target.value)} placeholder="الملعب الرئيسي"/>
        </FormField>
        <FormField label="رابط Google Maps">
          <input className="form-input" value={recurForm.map_url} onChange={e => setR('map_url',e.target.value)} placeholder="https://maps.google.com/..."/>
        </FormField>
        <AttGroupField
          type={recurForm.event_type} val={recurForm.att_group} onChange={v => setR('att_group', v)}
          selectedMembers={recurForm.selectedMembers} onMemberToggle={uid => toggleMember(uid, 'recur')}
        />
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowRecurring(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addRecurring}
            disabled={saving || recurForm.days_of_week.length===0 || (recurForm.att_group==='مجموعة مخصصة' && recurForm.selectedMembers.length===0 && recurForm.event_type !== 'training' && recurForm.event_type !== 'match')}>
            {saving ? <Spinner size="sm"/> : <><Repeat size={13}/> إنشاء الجدول</>}
          </button>
        </div>
      </Modal>

      {/* ── RESULT ENTRY MODAL ── */}
      <Modal open={!!showResult} onClose={() => setShowResult(null)} title="تسجيل نتيجة المباراة">
        {showResult && (
          <div>
            <div className="bg-slate-50 rounded-xl p-3 mb-5 text-center">
              <div className="font-bold text-sm text-slate-800">
                {showResult.title}{showResult.opponent ? ` · ضد ${showResult.opponent}` : ''}
              </div>
              <div className="text-xs text-slate-400 mt-1">{formatDate(showResult.start_datetime)}</div>
              {showResult.tournament_name && (
                <div className="text-xs text-blue-600 mt-1">🏆 {showResult.tournament_name}</div>
              )}
            </div>
            <div className="flex items-center gap-4 justify-center mb-6">
              <div className="text-center">
                <p className="text-xs text-slate-500 font-bold mb-2">فريقنا</p>
                <input type="number" min="0" max="99"
                  className="form-input w-20 text-center text-3xl font-extrabold p-2"
                  value={resultForm.goals_for}
                  onChange={e => setResultForm(p => ({...p, goals_for: e.target.value}))}
                  placeholder="0"/>
              </div>
              <div className="text-3xl font-extrabold text-slate-300 mt-6">—</div>
              <div className="text-center">
                <p className="text-xs text-slate-500 font-bold mb-2">{showResult.opponent || 'المنافس'}</p>
                <input type="number" min="0" max="99"
                  className="form-input w-20 text-center text-3xl font-extrabold p-2"
                  value={resultForm.goals_against}
                  onChange={e => setResultForm(p => ({...p, goals_against: e.target.value}))}
                  placeholder="0"/>
              </div>
            </div>
            {resultForm.goals_for !== '' && resultForm.goals_against !== '' && (
              <div className={`text-center text-sm font-extrabold mb-4 py-2 rounded-xl ${
                parseInt(resultForm.goals_for) > parseInt(resultForm.goals_against)
                  ? 'bg-emerald-50 text-emerald-700'
                  : parseInt(resultForm.goals_for) < parseInt(resultForm.goals_against)
                  ? 'bg-red-50 text-red-600'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {parseInt(resultForm.goals_for) > parseInt(resultForm.goals_against) ? '🏆 فوز!' :
                 parseInt(resultForm.goals_for) < parseInt(resultForm.goals_against) ? '❌ خسارة' : '🤝 تعادل'}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setShowResult(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveResult}
                disabled={saving || resultForm.goals_for === '' || resultForm.goals_against === ''}>
                {saving ? <Spinner size="sm"/> : '💾 حفظ النتيجة'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── EDIT EVENT MODAL ── */}
      <Modal open={!!editEvent} onClose={() => setEditEvent(null)} title={`تعديل: ${editEvent?.title || ''}`} width="max-w-lg">
        {editEvent && (
          <>
            <FormField label="العنوان" required>
              <input className="form-input" value={editForm.title} onChange={e => setEditForm((p: any) => ({ ...p, title: e.target.value }))}/>
            </FormField>
            <FormField label="النوع">
              <EventTypeSelector val={editForm.event_type} onChange={v => setEditForm((p: any) => ({
                ...p, event_type: v,
                att_group: v === 'training' ? 'اللاعبون فقط' : p.att_group
              }))}/>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="البداية" required>
                <input className="form-input" type="datetime-local" value={editForm.start_datetime} onChange={e => setEditForm((p: any) => ({ ...p, start_datetime: e.target.value }))}/>
              </FormField>
              <FormField label="النهاية">
                <input className="form-input" type="datetime-local" value={editForm.end_datetime} onChange={e => setEditForm((p: any) => ({ ...p, end_datetime: e.target.value }))}/>
              </FormField>
            </div>
            <FormField label="الموقع">
              <input className="form-input" value={editForm.location} onChange={e => setEditForm((p: any) => ({ ...p, location: e.target.value }))}/>
            </FormField>
            <FormField label="رابط خريطة">
              <input className="form-input" value={editForm.map_url} onChange={e => setEditForm((p: any) => ({ ...p, map_url: e.target.value }))} placeholder="https://maps.google.com/..."/>
            </FormField>
            {editForm.event_type !== 'training' ? (
              <FormField label="من يسجل الحضور؟">
                <select className="form-input" value={editForm.att_group} onChange={e => setEditForm((p: any) => ({ ...p, att_group: e.target.value }))}>
                  {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
                </select>
              </FormField>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700 flex items-center gap-1.5">
                <Users size={12}/>
                التمارين تظهر للاعبين فقط بشكل تلقائي
              </div>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setEditEvent(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !editForm.title.trim()}>
                {saving ? <Spinner size="sm"/> : <><Edit2 size={13}/> حفظ التعديلات</>}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR MARKERS MODAL                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal open={showMarkerModal} onClose={() => { setShowMarkerModal(false); setEditMarker(null); setMarkerForm(defaultMarkerForm) }}
        title="علامات التقويم" width="max-w-lg">
        {/* Existing markers list */}
        {markers.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-bold text-slate-500">العلامات الحالية</p>
            {markers.map(m => (
              <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: m.color }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-800">{m.title}</div>
                  <div className="text-xs text-slate-400">{m.start_date} ← {m.end_date}{m.description ? ` · ${m.description}` : ''}</div>
                </div>
                <button onClick={() => openEditMarker(m)} className="text-slate-400 hover:text-blue-500 p-1">
                  <Edit2 size={13}/>
                </button>
                <button onClick={() => deleteMarker(m.id)} className="text-slate-400 hover:text-red-500 p-1">
                  <Trash2 size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit form */}
        <div className={`${markers.length > 0 ? 'border-t border-slate-100 pt-4' : ''}`}>
          <p className="text-xs font-bold text-slate-500 mb-3">{editMarker ? 'تعديل العلامة' : 'إضافة علامة جديدة'}</p>
          <FormField label="الاسم" required>
            <input className="form-input" value={markerForm.title} onChange={e => setMF('title', e.target.value)}
              placeholder="رمضان، اختبارات، إجازة صيفية..."/>
          </FormField>
          <FormField label="وصف (اختياري)">
            <input className="form-input" value={markerForm.description} onChange={e => setMF('description', e.target.value)}
              placeholder="تفاصيل إضافية..."/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ" required>
              <input className="form-input" type="date" value={markerForm.start_date} onChange={e => setMF('start_date', e.target.value)}/>
            </FormField>
            <FormField label="إلى تاريخ" required>
              <input className="form-input" type="date" value={markerForm.end_date} onChange={e => setMF('end_date', e.target.value)}/>
            </FormField>
          </div>
          <FormField label="اللون">
            <div className="flex flex-wrap gap-2">
              {MARKER_COLORS.map(c => (
                <button key={c.value} type="button" title={c.label}
                  onClick={() => setMF('color', c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${markerForm.color === c.value ? 'scale-125 border-slate-800' : 'border-transparent hover:scale-110'}`}
                  style={{ background: c.value }}/>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
                <div className="w-5 h-5 rounded-full border border-slate-300" style={{ background: markerForm.color }}/>
                <input type="color" value={markerForm.color} onChange={e => setMF('color', e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0 opacity-0 absolute"/>
                مخصص
              </div>
            </div>
          </FormField>
          <div className="flex gap-2 justify-end mt-4">
            {editMarker && (
              <button className="btn btn-ghost text-slate-500" onClick={() => { setEditMarker(null); setMarkerForm(defaultMarkerForm) }}>
                إلغاء التعديل
              </button>
            )}
            <button className="btn btn-primary" onClick={saveMarker}
              disabled={markerSaving || !markerForm.title.trim() || !markerForm.start_date || !markerForm.end_date}>
              {markerSaving ? <Spinner size="sm"/> : editMarker ? <><Check size={13}/> حفظ</> : <><Plus size={13}/> إضافة</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* BULK EDIT RECURRING MODAL                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal open={showBulkEdit} onClose={() => setShowBulkEdit(false)} title="تعديل المواعيد المتكررة" width="max-w-lg">
        {recurGroups.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Repeat size={32} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">لا توجد مواعيد متكررة حالياً</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1: Select group */}
            <FormField label="اختر مجموعة المواعيد المتكررة">
              <select className="form-input" value={bulkSelGroup} onChange={e => {
                setBulkSelGroup(e.target.value)
                setBulkPickedIds(new Set())
              }}>
                <option value="">— اختر مجموعة —</option>
                {recurGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.title} ({g.events.length} موعد)</option>
                ))}
              </select>
            </FormField>

            {bulkSelGroup && (
              <>
                {/* Step 2: Select scope */}
                <FormField label="النطاق">
                  <div className="flex gap-2">
                    {([['all','الكل'],['range','نطاق تاريخ'],['pick','اختيار يدوي']] as const).map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setBulkMode(v)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${bulkMode === v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>{l}</button>
                    ))}
                  </div>
                </FormField>

                {bulkMode === 'range' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="من تاريخ">
                      <input className="form-input" type="date" value={bulkDateFrom} onChange={e => setBulkDateFrom(e.target.value)}/>
                    </FormField>
                    <FormField label="إلى تاريخ">
                      <input className="form-input" type="date" value={bulkDateTo} onChange={e => setBulkDateTo(e.target.value)}/>
                    </FormField>
                  </div>
                )}

                {bulkMode === 'pick' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <div className="p-2 bg-slate-50 text-xs text-slate-500 flex items-center justify-between sticky top-0">
                      <span>{bulkPickedIds.size} محدد من {bulkGroupEvents.length}</span>
                      <div className="flex gap-2">
                        <button className="text-brand-600 font-bold" onClick={() => setBulkPickedIds(new Set(bulkGroupEvents.map((e: any) => e.id)))}>
                          تحديد الكل
                        </button>
                        <button className="text-red-500" onClick={() => setBulkPickedIds(new Set())}>مسح</button>
                      </div>
                    </div>
                    {bulkGroupEvents.sort((a: any, b: any) => a.start_datetime.localeCompare(b.start_datetime)).map((e: any) => {
                      const picked = bulkPickedIds.has(e.id)
                      return (
                        <div key={e.id} onClick={() => setBulkPickedIds(prev => {
                          const next = new Set(prev)
                          picked ? next.delete(e.id) : next.add(e.id)
                          return next
                        })} className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 ${picked ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${picked ? 'bg-brand-500 border-brand-500' : 'border-slate-300'}`}>
                            {picked && <Check size={11} className="text-white"/>}
                          </div>
                          <span className="text-sm font-medium">{formatDate(e.start_datetime)}</span>
                          <span className="text-xs text-slate-400">{e.start_datetime.slice(11,16)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Target count summary */}
                <div className="bg-slate-50 rounded-xl p-2.5 text-xs text-slate-600">
                  <span className="font-bold">{bulkTargetEvents.length}</span> موعد سيتأثر
                </div>

                {/* Step 3: Action */}
                <FormField label="الإجراء">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setBulkAction('delete')}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${bulkAction === 'delete' ? 'bg-red-500 text-white border-red-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                      🗑️ حذف المواعيد
                    </button>
                    <button type="button" onClick={() => setBulkAction('reschedule')}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${bulkAction === 'reschedule' ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                      🕐 تغيير الوقت
                    </button>
                  </div>
                </FormField>

                {bulkAction === 'reschedule' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="وقت البداية الجديد">
                      <input className="form-input" type="time" value={bulkNewStartTime} onChange={e => setBulkNewStartTime(e.target.value)}/>
                    </FormField>
                    <FormField label="وقت النهاية الجديد">
                      <input className="form-input" type="time" value={bulkNewEndTime} onChange={e => setBulkNewEndTime(e.target.value)}/>
                    </FormField>
                  </div>
                )}

                {bulkAction === 'delete' && bulkTargetEvents.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-xs text-red-700">
                    ⚠️ سيتم حذف {bulkTargetEvents.length} موعد بشكل نهائي ولا يمكن التراجع
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button className="btn btn-ghost" onClick={() => setShowBulkEdit(false)}>إلغاء</button>
                  <button
                    onClick={applyBulkEdit}
                    disabled={bulkSaving || bulkTargetEvents.length === 0}
                    className={`btn ${bulkAction === 'delete' ? 'btn-danger' : 'btn-primary'}`}>
                    {bulkSaving ? <Spinner size="sm"/> : bulkAction === 'delete' ? `حذف ${bulkTargetEvents.length} موعد` : `تحديث ${bulkTargetEvents.length} موعد`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
