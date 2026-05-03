import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, MapPin, Clock, Repeat, Trash2, Users, X, Check, Trophy, Edit2, Flag, Settings, ChevronDown } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService, notificationService, occasionsService } from '../../services'
import { Spinner, PageHeader, EmptyState, Modal, FormField, Tabs, AttendanceButton } from '../../components/ui'
import { EVENT_CONFIG, WEEK_DAYS, canManageEvents, formatDate, formatEventDate, isEventLocked } from '../../utils/helpers'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { arSA } from 'date-fns/locale'

const EVENT_TYPES = ['training','match','meeting','camp','other']
const ATT_GROUPS = ['الكل','اللاعبون فقط','المدربون فقط','اللاعبون والمدربون','الإداريون فقط','مجموعة مخصصة']
const HOME_AWAY_LABEL: Record<string, string> = { home: '🏟️ ملعبنا', away: '🚌 ملعب المنافس', neutral: '⚖️ أرض محايدة' }

// Types where "الكل" doesn't make sense — players are the default audience
const PLAYER_FOCUSED_TYPES = new Set(['training', 'match', 'camp'])
const getAttGroups = (eventType: string) =>
  PLAYER_FOCUSED_TYPES.has(eventType) ? ATT_GROUPS.filter(g => g !== 'الكل') : ATT_GROUPS
const getDefaultAttGroup = (eventType: string) =>
  PLAYER_FOCUSED_TYPES.has(eventType) ? 'اللاعبون فقط' : 'الكل'

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
  const [showAddChoice, setShowAddChoice] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [showResult, setShowResult] = useState<any>(null)
  const [resultForm, setResultForm] = useState({ goals_for: '', goals_against: '' })
  const [detailAtts, setDetailAtts] = useState<Record<string, string>>({})
  const [editEvent, setEditEvent] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  // Occasions
  const [occasions, setOccasions]       = useState<any[]>([])
  const [showOccasions, setShowOccasions] = useState(false)
  const [occForm, setOccForm] = useState({ title: '', from_date: '', to_date: '', color: '#3b82f6' })

  // Manage recurring
  const [showManageRecurring, setShowManageRecurring] = useState(false)
  const [recurringGroups, setRecurringGroups] = useState<any[]>([])
  const [recurGroupsLoading, setRecurGroupsLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any>(null)
  const [manageStep, setManageStep] = useState<'groups' | 'action' | 'editForm' | 'deleteConfirm'>('groups')
  const [manageAction, setManageAction] = useState<'edit' | 'delete'>('edit')
  const [manageScope, setManageScope] = useState<'all' | 'range' | 'manual'>('all')
  const [manageRange, setManageRange] = useState({ from: '', to: '' })
  const [manageSelected, setManageSelected] = useState<string[]>([])
  const [manageEditForm, setManageEditForm] = useState({ title: '', start_time: '', end_time: '', location: '', description: '' })

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
    description: '',
    selectedMembers: [] as string[]
  }
  const [recurForm, setRecurForm] = useState(defaultRecur)
  const setR = (k: string, v: any) => setRecurForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(m => setMembers(m.filter((x: any) => x.role !== 'parent')))
    occasionsService.getAll(teamId).then(setOccasions)
    load()
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

  async function addEvent() {
    if (!form.title.trim() || !form.start_datetime || !teamId) return
    setSaving(true)
    const memberIds = form.att_group === 'مجموعة مخصصة' && form.selectedMembers.length > 0
      ? form.selectedMembers : null
    await eventService.createEvent({
      title: form.title, event_type: form.event_type,
      start_datetime: form.start_datetime, end_datetime: form.end_datetime || null,
      location: form.location, map_url: form.map_url,
      att_group: form.att_group, description: form.description,
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
    const memberIds = recurForm.att_group === 'مجموعة مخصصة' && recurForm.selectedMembers.length > 0
      ? recurForm.selectedMembers : null
    const payload = { ...recurForm, att_member_ids: memberIds }
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
    const { error } = await eventService.setAttendance({
      event_id: eventId, team_id: teamId, user_id: user.id, status
    })
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
      att_group: ev.att_group || 'الكل',
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
    await eventService.updateEvent(editEvent.id, {
      title: editForm.title,
      event_type: editForm.event_type,
      start_datetime: editForm.start_datetime,
      end_datetime: editForm.end_datetime || null,
      location: editForm.location || null,
      map_url: editForm.map_url || null,
      description: editForm.description || null,
      att_group: editForm.att_group,
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

  // Occasions helpers
  function occasionsOnDate(date: Date) {
    const d = format(date, 'yyyy-MM-dd')
    return occasions.filter(o => d >= o.from_date && d <= o.to_date)
  }
  function occasionsOnEvent(ev: any) {
    const d = ev.start_datetime.slice(0, 10)
    return occasions.filter(o => d >= o.from_date && d <= o.to_date)
  }

  async function saveOccasion() {
    if (!occForm.title.trim() || !occForm.from_date || !occForm.to_date || !teamId || !user) return
    setSaving(true)
    const { error } = await occasionsService.create({ ...occForm, team_id: teamId, created_by: user.id })
    if (error) { console.error('occasions insert error:', error); setSaving(false); return }
    const updated = await occasionsService.getAll(teamId)
    setOccasions(updated)
    setOccForm({ title: '', from_date: '', to_date: '', color: '#3b82f6' })
    setSaving(false)
  }
  async function deleteOccasion(id: string) {
    await occasionsService.delete(id)
    setOccasions(prev => prev.filter(o => o.id !== id))
  }

  async function openManageRecurring() {
    setShowManageRecurring(true)
    setManageStep('groups')
    setSelectedGroup(null)
    setRecurGroupsLoading(true)
    if (teamId) {
      const groups = await eventService.getRecurringGroups(teamId)
      setRecurringGroups(groups)
    }
    setRecurGroupsLoading(false)
  }

  function pickGroup(g: any) {
    setSelectedGroup(g)
    setManageEditForm({ title: g.title || '', start_time: g.start_time || '', end_time: g.end_time || '', location: g.location || '', description: '' })
    setManageRange({ from: '', to: '' })
    setManageSelected([])
    setManageStep('action')
  }

  function pickManageAction(action: 'edit' | 'delete', scope: 'all' | 'range' | 'manual') {
    setManageAction(action)
    setManageScope(scope)
    setManageSelected([])
    setManageStep(action === 'edit' ? 'editForm' : 'deleteConfirm')
  }

  function getManageScopeEvents(): any[] {
    if (!selectedGroup) return []
    const evts: any[] = selectedGroup.events || []
    const sorted = [...evts].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
    if (manageScope === 'all') return sorted
    if (manageScope === 'range') {
      return sorted.filter(e => {
        const d = e.start_datetime.slice(0, 10)
        return (!manageRange.from || d >= manageRange.from) && (!manageRange.to || d <= manageRange.to)
      })
    }
    return sorted.filter(e => manageSelected.includes(e.id))
  }

  async function applyManageEdit() {
    setSaving(true)
    const targetEvents = getManageScopeEvents()
    if (!targetEvents.length) { setSaving(false); return }

    const baseData: any = {}
    if (manageEditForm.title.trim()) baseData.title = manageEditForm.title.trim()
    if (manageEditForm.location !== undefined) baseData.location = manageEditForm.location || null
    if (manageEditForm.description !== undefined) baseData.description = manageEditForm.description || null

    const hasTimeChange = manageEditForm.start_time || manageEditForm.end_time
    if (hasTimeChange) {
      await Promise.all(targetEvents.map(e => {
        const datePart = e.start_datetime.slice(0, 10)
        const upd = { ...baseData }
        if (manageEditForm.start_time) upd.start_datetime = `${datePart}T${manageEditForm.start_time}:00`
        if (manageEditForm.end_time) upd.end_datetime = `${datePart}T${manageEditForm.end_time}:00`
        return eventService.updateEvent(e.id, upd)
      }))
    } else if (Object.keys(baseData).length > 0) {
      await eventService.updateEventsByIds(targetEvents.map(e => e.id), baseData)
    }

    await load()
    setShowManageRecurring(false); setSelectedGroup(null); setManageStep('groups'); setSaving(false)
  }

  async function applyManageDelete() {
    setSaving(true)
    if (manageScope === 'all') {
      await eventService.deleteRecurringEvents(selectedGroup.id, 'all')
    } else {
      const targetIds = getManageScopeEvents().map(e => e.id)
      if (targetIds.length) await eventService.deleteEventsByIds(targetIds)
    }
    await load()
    setShowManageRecurring(false); setSelectedGroup(null); setManageStep('groups'); setSaving(false)
  }

  const canManage = canManageEvents(myRole)
  const isParent = myRole === 'parent'
  const now = new Date()

  // Visibility: coaches/admins see all; others only see events relevant to them
  const ROLE_GROUPS: Record<string, string[]> = {
    'اللاعبون فقط': ['player'],
    'المدربون فقط': ['head_coach','assistant_coach'],
    'اللاعبون والمدربون': ['player','head_coach','assistant_coach'],
    'الإداريون فقط': ['administrator','owner'],
  }
  function isEventVisible(e: any): boolean {
    if (canManage) return true
    if (e.att_member_ids?.length > 0) return e.att_member_ids.includes(user?.id)
    const allowedRoles = ROLE_GROUPS[e.att_group]
    if (allowedRoles) return allowedRoles.includes(myRole)
    return true // 'الكل' or 'مجموعة مخصصة' with no ids = everyone
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
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowOccasions(true)}>
              <Flag size={13}/> مناسبة
            </button>
            <button className="btn btn-ghost btn-sm" onClick={openManageRecurring}>
              <Settings size={13}/> المكررة
            </button>
            <div className="relative">
              <button className="btn btn-primary btn-sm flex items-center gap-1"
                onClick={() => setShowAddChoice(p => !p)}>
                <Plus size={13}/> موعد <ChevronDown size={11} className={`transition-transform ${showAddChoice ? 'rotate-180' : ''}`}/>
              </button>
              {showAddChoice && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddChoice(false)}/>
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden min-w-[160px]">
                    <button onClick={() => { setShowAdd(true); setShowAddChoice(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors">
                      <Plus size={15} className="text-brand-500 flex-shrink-0"/> موعد واحد
                    </button>
                    <div className="h-px bg-slate-100"/>
                    <button onClick={() => { setShowRecurring(true); setShowAddChoice(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors">
                      <Repeat size={15} className="text-purple-500 flex-shrink-0"/> موعد متكرر
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}/>

      {/* Active occasions banner */}
      {occasions.filter(o => format(now,'yyyy-MM-dd') >= o.from_date && format(now,'yyyy-MM-dd') <= o.to_date).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {occasions.filter(o => format(now,'yyyy-MM-dd') >= o.from_date && format(now,'yyyy-MM-dd') <= o.to_date).map(o => (
            <div key={o.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border"
              style={{ background: o.color + '18', color: o.color, borderColor: o.color + '44' }}>
              <Flag size={11}/> {o.title} · {o.from_date} ← {o.to_date}
            </div>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        {[['calendar','📅 تقويم'],['list','📋 قائمة']].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>
        ))}
      </div>

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
              {/* Occasions legend */}
              {(() => {
                const monthStart = format(startOfMonth(calMonth), 'yyyy-MM-dd')
                const monthEnd   = format(endOfMonth(calMonth),   'yyyy-MM-dd')
                const monthOccs  = occasions.filter(o => o.from_date <= monthEnd && o.to_date >= monthStart)
                if (!monthOccs.length) return null
                return (
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3 px-1">
                    {monthOccs.map(o => (
                      <div key={o.id} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: o.color }}/>
                        <span className="text-[11px] font-bold text-slate-500">{o.title}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <div className="grid grid-cols-7 gap-1 mb-1">
                {arDays.map(d => <div key={d} className="text-center text-xs font-bold text-slate-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(firstDayOfWeek).fill(null).map((_,i) => <div key={`e${i}`}/>)}
                {monthDays.map(day => {
                  const dayEvs = eventsOnDay(day)
                  const isToday = isSameDay(day, now)
                  return (
                    <div key={day.toISOString()}
                      className={`min-h-[52px] rounded-xl p-1 cursor-pointer transition-colors relative ${isToday ? 'bg-brand-50 ring-1 ring-brand-400' : dayEvs.length ? 'hover:bg-slate-50' : ''}`}
                      onClick={() => dayEvs.length && setShowDetail({ date: day, events: dayEvs })}>
                      {/* Occasion color strip at top */}
                      {occasionsOnDate(day).map((o, i) => (
                        <div key={o.id} className="absolute top-0 right-0 left-0 h-1 rounded-t-xl"
                          style={{ background: o.color, top: i * 3, opacity: 0.75 }}/>
                      ))}
                      <div className={`text-xs font-bold mb-0.5 text-center mt-1 ${isToday ? 'text-brand-600' : 'text-slate-600'}`}>
                        {day.getDate()}
                      </div>
                      {dayEvs.slice(0,2).map(e => {
                        const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
                        return <div key={e.id} className="text-center text-base leading-none" title={e.title}>{c.icon}</div>
                      })}
                      {dayEvs.length > 2 && <div className="text-xs text-center text-slate-400">+{dayEvs.length-2}</div>}
                      {/* Occasion dots */}
                      {occasionsOnDate(day).length > 0 && (
                        <div className="flex gap-0.5 justify-center mt-0.5">
                          {occasionsOnDate(day).slice(0,3).map(o => (
                            <div key={o.id} className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }}/>
                          ))}
                        </div>
                      )}
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
                          onClick={() => setShowDetail({ date: parseISO(e.start_datetime), events: [e] })}>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                              <span className="text-2xl leading-none">{c.icon}</span>
                              <span className="text-[9px] font-bold text-slate-400 leading-none">{c.label}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm truncate">{e.title}</span>
                                {e.recurrence_group_id && <Repeat size={11} className="text-slate-400 flex-shrink-0"/>}
                                {isEventLocked(e.start_datetime) && <span className="badge badge-red text-xs">مغلق</span>}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock size={10}/> {formatEventDate(e.start_datetime)} · {e.start_datetime.slice(11,16)}
                              </div>
                              {e.location && (
                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                  <MapPin size={10}/> {e.location}
                                  {e.map_url && <a href={e.map_url} target="_blank" rel="noreferrer" className="text-blue-500 underline mr-1" onClick={ev => ev.stopPropagation()}>خريطة</a>}
                                </div>
                              )}
                              {/* Match-specific info */}
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
                              {/* Result badge */}
                              {e.event_type === 'match' && <div className="mt-1"><ResultBadge e={e}/></div>}
                              {/* Edit + Result buttons */}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {canManage && (
                                  <button onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                                    className="text-xs text-blue-500 font-bold flex items-center gap-1 hover:text-blue-700 transition-colors">
                                    <Edit2 size={11}/> تعديل
                                  </button>
                                )}
                                {e.event_type === 'match' && canManage && isPast && !hasResult && (
                                  <button
                                    onClick={ev => { ev.stopPropagation(); setShowResult(e); setResultForm({ goals_for: '', goals_against: '' }) }}
                                    className="text-xs text-brand-600 font-bold flex items-center gap-1 hover:text-brand-800 transition-colors">
                                    <Trophy size={11}/> سجّل نتيجة
                                  </button>
                                )}
                                {isPast && ['training','match'].includes(e.event_type) && !isParent &&
                                  (Date.now() - new Date(e.start_datetime).getTime() < 48 * 60 * 60 * 1000) && (
                                  <button
                                    onClick={ev => { ev.stopPropagation(); navigate(`/team/${teamId}/best-player`) }}
                                    className="text-xs text-amber-600 font-bold flex items-center gap-1 hover:text-amber-800 transition-colors">
                                    ⭐ أفضل لاعب
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                <span className="badge text-xs" style={{background:c.bg,color:c.color}}>{c.label}</span>
                                {e.att_member_ids?.length > 0
                                  ? <span className="badge badge-blue text-xs"><Users size={9}/> {e.att_member_ids.length} محدد</span>
                                  : e.att_group && <span className="badge badge-gray text-xs">{e.att_group}</span>}
                                {occasionsOnEvent(e).map((o: any) => (
                                  <span key={o.id} className="badge text-xs flex items-center gap-0.5"
                                    style={{ background: o.color + '18', color: o.color, border: `1px solid ${o.color}44` }}>
                                    <Flag size={8}/> {o.title}
                                  </span>
                                ))}
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
                  {/* Match details */}
                  {e.event_type === 'match' && (
                    <div className="mt-2 bg-slate-50 rounded-xl p-2.5 space-y-1">
                      {e.opponent && (
                        <div className="text-xs font-bold text-slate-700">⚔️ ضد: {e.opponent}</div>
                      )}
                      <div className="text-xs text-slate-500">{HOME_AWAY_LABEL[e.home_away] || ''}</div>
                      {e.tournament_name && (
                        <div className="text-xs text-blue-600 font-bold">🏆 {e.tournament_name}</div>
                      )}
                      {hasResult
                        ? <div className="pt-1"><ResultBadge e={e}/></div>
                        : isPast && canManage && (
                          <button
                            onClick={() => { setShowResult(e); setResultForm({ goals_for: '', goals_against: '' }); setShowDetail(null) }}
                            className="text-xs text-brand-600 font-bold flex items-center gap-1 hover:text-brand-800">
                            <Trophy size={11}/> سجّل النتيجة
                          </button>
                        )}
                    </div>
                  )}
                  {e.att_member_ids?.length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Users size={10}/> هذا الموعد لـ {e.att_member_ids.length} عضو محدد
                    </div>
                  )}
                  {!e.att_member_ids && e.att_group && <div className="text-xs text-slate-400 mt-1">الحضور: {e.att_group}</div>}
                </div>
                {canManage && (
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
              {/* Coach note */}
              {e.description && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
                  <p className="text-xs font-bold text-amber-700 mb-1">📝 ملاحظة المدرب</p>
                  <p className="text-sm text-amber-800 leading-relaxed">{e.description}</p>
                </div>
              )}
              {/* Attendance buttons */}
              <div className="bg-slate-50 rounded-xl p-2.5 mt-3">
                <p className="text-xs font-bold text-slate-500 mb-2">هل ستحضر؟</p>
                <AttendanceButton
                  status={detailAtts[e.id] ?? ''}
                  locked={isEventLocked(e.start_datetime)}
                  onSelect={s => setDetailAtt(e.id, s)}
                />
              </div>
            </div>
          )
        })}
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
            // Auto-reset att_group when switching between player-focused and open types
            if (PLAYER_FOCUSED_TYPES.has(v) && !getAttGroups(v).includes(form.att_group)) {
              setF('att_group', getDefaultAttGroup(v))
            } else if (!PLAYER_FOCUSED_TYPES.has(v) && form.att_group === 'الكل') {
              // Keep "الكل" when switching to open types
            } else if (!PLAYER_FOCUSED_TYPES.has(v) && PLAYER_FOCUSED_TYPES.has(form.event_type)) {
              setF('att_group', 'الكل')
            }
          }}/>
        </FormField>

        {/* Match-specific fields */}
        {form.event_type === 'match' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              ⚽ <span>بيانات المباراة (اختياري — يمكن تعديلها لاحقاً)</span>
            </p>
            <FormField label="اسم المنافس">
              <input className="form-input" value={form.opponent} onChange={e => setF('opponent',e.target.value)} placeholder="الهلال، النصر..."/>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="الأرض">
                <select className="form-input" value={form.home_away} onChange={e => setF('home_away',e.target.value)}>
                  <option value="home">🏟️ ملعبنا</option>
                  <option value="away">🚌 ملعب المنافس</option>
                  <option value="neutral">⚖️ أرض محايدة</option>
                </select>
              </FormField>
              <FormField label="نوع المباراة">
                <select className="form-input" value={form.match_category} onChange={e => setF('match_category',e.target.value)}>
                  <option value="friendly">ودية</option>
                  <option value="tournament">بطولة</option>
                </select>
              </FormField>
            </div>
            {form.match_category === 'tournament' && (
              <FormField label="اسم البطولة">
                <input className="form-input" value={form.tournament_name} onChange={e => setF('tournament_name',e.target.value)} placeholder="دوري الأبطال"/>
              </FormField>
            )}
          </div>
        )}

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
        <FormField label="من يسجل الحضور؟">
          <select className="form-input" value={form.att_group} onChange={e => setF('att_group',e.target.value)}>
            {getAttGroups(form.event_type).map(g => <option key={g}>{g}</option>)}
          </select>
        </FormField>
        {form.att_group === 'مجموعة مخصصة' && (
          <FormField label="اختر الأعضاء المدعوون لهذا الموعد">
            <MemberPicker which="form"/>
            {form.selectedMembers.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠️ اختر عضواً واحداً على الأقل</p>
            )}
          </FormField>
        )}
        <FormField label="ملاحظة للاعبين (اختياري — تظهر عند التحضير)">
          <div className="relative">
            <textarea className="form-input resize-none h-20" maxLength={280}
              value={form.description} onChange={e => setF('description', e.target.value)}
              placeholder="تعليمات خاصة، متطلبات التدريب..."/>
            <span className="absolute bottom-2 left-2 text-[10px] text-slate-300">{form.description.length}/280</span>
          </div>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addEvent} disabled={saving || (form.att_group==='مجموعة مخصصة' && form.selectedMembers.length===0)}>
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
            if (PLAYER_FOCUSED_TYPES.has(v) && !getAttGroups(v).includes(recurForm.att_group)) {
              setR('att_group', getDefaultAttGroup(v))
            } else if (!PLAYER_FOCUSED_TYPES.has(v) && PLAYER_FOCUSED_TYPES.has(recurForm.event_type)) {
              setR('att_group', 'الكل')
            }
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
        <FormField label="من يسجل الحضور؟">
          <select className="form-input" value={recurForm.att_group} onChange={e => setR('att_group',e.target.value)}>
            {getAttGroups(recurForm.event_type).map(g => <option key={g}>{g}</option>)}
          </select>
        </FormField>
        {recurForm.att_group === 'مجموعة مخصصة' && (
          <FormField label="الأعضاء المدعوون لكل هذه المواعيد">
            <MemberPicker which="recur"/>
          </FormField>
        )}
        <FormField label="ملاحظة للاعبين (اختياري — تظهر عند التحضير)">
          <div className="relative">
            <textarea className="form-input resize-none h-20" maxLength={280}
              value={recurForm.description} onChange={e => setR('description', e.target.value)}
              placeholder="تعليمات خاصة، متطلبات التدريب..."/>
            <span className="absolute bottom-2 left-2 text-[10px] text-slate-300">{recurForm.description.length}/280</span>
          </div>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowRecurring(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addRecurring}
            disabled={saving || recurForm.days_of_week.length===0 || (recurForm.att_group==='مجموعة مخصصة' && recurForm.selectedMembers.length===0)}>
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

      {/* ── OCCASIONS MODAL ── */}
      <Modal open={showOccasions} onClose={() => setShowOccasions(false)} title="المناسبات والفترات" width="max-w-lg">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-bold text-slate-500 mb-3">إضافة مناسبة جديدة</p>
          <FormField label="اسم المناسبة" required>
            <input className="form-input" value={occForm.title}
              onChange={e => setOccForm(p => ({ ...p, title: e.target.value }))}
              placeholder="عيد الفطر، اختبارات، نهاية الموسم..."/>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ" required>
              <input className="form-input" type="date" value={occForm.from_date}
                onChange={e => setOccForm(p => ({ ...p, from_date: e.target.value }))}/>
            </FormField>
            <FormField label="إلى تاريخ" required>
              <input className="form-input" type="date" value={occForm.to_date}
                onChange={e => setOccForm(p => ({ ...p, to_date: e.target.value }))}/>
            </FormField>
          </div>
          <FormField label="اللون">
            <div className="flex gap-2 flex-wrap mt-1">
              {['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316'].map(color => (
                <button key={color} type="button" onClick={() => setOccForm(p => ({ ...p, color }))}
                  className={`w-8 h-8 rounded-xl border-2 transition-all ${occForm.color === color ? 'border-slate-700 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                  style={{ background: color }}/>
              ))}
            </div>
          </FormField>
          <button className="btn btn-primary btn-sm mt-3" onClick={saveOccasion}
            disabled={saving || !occForm.title.trim() || !occForm.from_date || !occForm.to_date}>
            {saving ? <Spinner size="sm"/> : <><Flag size={13}/> إضافة مناسبة</>}
          </button>
        </div>

        {occasions.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">لا توجد مناسبات مضافة بعد</p>
        ) : (
          <div className="space-y-2">
            {occasions.map(o => (
              <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white">
                <div className="w-5 h-5 rounded-lg flex-shrink-0" style={{ background: o.color }}/>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-700">{o.title}</div>
                  <div className="text-xs text-slate-400">{o.from_date} ← {o.to_date}</div>
                </div>
                <button onClick={() => deleteOccasion(o.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── MANAGE RECURRING MODAL ── */}
      <Modal open={showManageRecurring} onClose={() => { setShowManageRecurring(false); setSelectedGroup(null); setManageStep('groups') }}
        title="تعديل المواعيد المكررة" width="max-w-lg">

        {/* Step 1: Groups list */}
        {manageStep === 'groups' && (
          <div>
            {recurGroupsLoading ? (
              <div className="flex justify-center py-8"><Spinner/></div>
            ) : recurringGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">لا توجد جداول مكررة</div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 mb-3">اختر الجدول المتكرر الذي تريد تعديله</p>
                {recurringGroups.map(g => {
                  const evts: any[] = (g.events || []).sort((a: any, b: any) => a.start_datetime.localeCompare(b.start_datetime))
                  const futureCount = evts.filter((e: any) => new Date(e.start_datetime) > new Date()).length
                  return (
                    <div key={g.id} onClick={() => pickGroup(g)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-brand-50 hover:border-brand-200 cursor-pointer transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <Repeat size={16} className="text-brand-600"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-700 truncate">{g.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {evts.length} موعد · {futureCount} قادم
                          {evts[0] && <span> · {formatEventDate(evts[0].start_datetime)}</span>}
                        </div>
                      </div>
                      <span className="text-slate-300 text-lg">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Action selection */}
        {manageStep === 'action' && selectedGroup && (
          <div>
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-4 flex items-center gap-2">
              <Repeat size={14} className="text-brand-600 flex-shrink-0"/>
              <div>
                <div className="font-bold text-sm text-brand-700">{selectedGroup.title}</div>
                <div className="text-xs text-brand-500">{selectedGroup.events?.length || 0} موعد</div>
              </div>
            </div>

            <p className="text-xs font-bold text-slate-500 mb-2">تعديل:</p>
            <div className="space-y-1.5 mb-4">
              {([['all','تعديل جميع المواعيد'],['range','تعديل نطاق تاريخ (من ← إلى)'],['manual','تعديل مواعيد محددة يدوياً']] as const).map(([s, label]) => (
                <button key={s} onClick={() => pickManageAction('edit', s)}
                  className="w-full text-right flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-sm text-slate-700 font-medium transition-colors">
                  <Edit2 size={13} className="text-blue-500 flex-shrink-0"/> {label}
                </button>
              ))}
            </div>

            <p className="text-xs font-bold text-slate-500 mb-2">حذف:</p>
            <div className="space-y-1.5 mb-4">
              {([['all','حذف جميع المواعيد'],['range','حذف نطاق تاريخ (من ← إلى)'],['manual','حذف مواعيد محددة يدوياً']] as const).map(([s, label]) => (
                <button key={s} onClick={() => pickManageAction('delete', s)}
                  className="w-full text-right flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-100 bg-white hover:bg-red-50 hover:border-red-300 text-sm text-red-600 font-medium transition-colors">
                  <Trash2 size={13} className="flex-shrink-0"/> {label}
                </button>
              ))}
            </div>

            <button onClick={() => setManageStep('groups')} className="btn btn-ghost btn-sm">← رجوع</button>
          </div>
        )}

        {/* Step 3: Edit form */}
        {manageStep === 'editForm' && selectedGroup && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
              <Edit2 size={12} className="inline ml-1"/>
              {manageScope === 'all' && `تعديل جميع مواعيد: ${selectedGroup.title}`}
              {manageScope === 'range' && 'تعديل نطاق تاريخ — اترك الحقول المراد الإبقاء عليها فارغة'}
              {manageScope === 'manual' && 'اختر المواعيد المراد تعديلها'}
            </div>

            {manageScope === 'range' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="من تاريخ">
                  <input type="date" className="form-input" value={manageRange.from} onChange={e => setManageRange(p => ({...p, from: e.target.value}))}/>
                </FormField>
                <FormField label="إلى تاريخ">
                  <input type="date" className="form-input" value={manageRange.to} onChange={e => setManageRange(p => ({...p, to: e.target.value}))}/>
                </FormField>
              </div>
            )}

            {manageScope === 'manual' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto mb-3">
                <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-100">
                  {manageSelected.length} موعد محدد
                </div>
                {(selectedGroup.events || [])
                  .sort((a: any, b: any) => a.start_datetime.localeCompare(b.start_datetime))
                  .map((e: any) => (
                  <label key={e.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${manageSelected.includes(e.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={manageSelected.includes(e.id)}
                      onChange={() => setManageSelected(p => p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id])}
                      className="w-4 h-4 accent-brand-500"/>
                    <span className="text-sm">{formatEventDate(e.start_datetime)}</span>
                  </label>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 mb-3">اترك الحقل فارغاً للإبقاء على القيمة الحالية</p>
            <FormField label="العنوان">
              <input className="form-input" value={manageEditForm.title} onChange={e => setManageEditForm(p => ({...p, title: e.target.value}))} placeholder={selectedGroup.title}/>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="وقت البداية">
                <input type="time" className="form-input" value={manageEditForm.start_time} onChange={e => setManageEditForm(p => ({...p, start_time: e.target.value}))}/>
              </FormField>
              <FormField label="وقت النهاية">
                <input type="time" className="form-input" value={manageEditForm.end_time} onChange={e => setManageEditForm(p => ({...p, end_time: e.target.value}))}/>
              </FormField>
            </div>
            <FormField label="الموقع">
              <input className="form-input" value={manageEditForm.location} onChange={e => setManageEditForm(p => ({...p, location: e.target.value}))} placeholder={selectedGroup.location || ''}/>
            </FormField>
            <FormField label="ملاحظة للاعبين">
              <div className="relative">
                <textarea className="form-input resize-none h-16" maxLength={280}
                  value={manageEditForm.description} onChange={e => setManageEditForm(p => ({...p, description: e.target.value}))}
                  placeholder="تعليمات خاصة..."/>
                <span className="absolute bottom-2 left-2 text-[10px] text-slate-300">{manageEditForm.description.length}/280</span>
              </div>
            </FormField>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setManageStep('action')}>رجوع</button>
              <button className="btn btn-primary" onClick={applyManageEdit}
                disabled={saving
                  || (manageScope === 'manual' && manageSelected.length === 0)
                  || (manageScope === 'range' && (!manageRange.from || !manageRange.to))}>
                {saving ? <Spinner size="sm"/> : <><Edit2 size={13}/> تطبيق التعديل ({getManageScopeEvents().length})</>}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Delete confirm */}
        {manageStep === 'deleteConfirm' && selectedGroup && (
          <div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-sm font-bold text-red-700 mb-1">⚠️ تأكيد الحذف</p>
              <p className="text-xs text-red-600">{selectedGroup.title}</p>
            </div>

            {manageScope === 'range' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="من تاريخ">
                  <input type="date" className="form-input" value={manageRange.from} onChange={e => setManageRange(p => ({...p, from: e.target.value}))}/>
                </FormField>
                <FormField label="إلى تاريخ">
                  <input type="date" className="form-input" value={manageRange.to} onChange={e => setManageRange(p => ({...p, to: e.target.value}))}/>
                </FormField>
              </div>
            )}

            {manageScope === 'manual' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto mb-3">
                <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-100">
                  {manageSelected.length} موعد محدد للحذف
                </div>
                {(selectedGroup.events || [])
                  .sort((a: any, b: any) => a.start_datetime.localeCompare(b.start_datetime))
                  .map((e: any) => (
                  <label key={e.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${manageSelected.includes(e.id) ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={manageSelected.includes(e.id)}
                      onChange={() => setManageSelected(p => p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id])}
                      className="w-4 h-4 accent-red-500"/>
                    <span className="text-sm">{formatEventDate(e.start_datetime)}</span>
                  </label>
                ))}
              </div>
            )}

            {manageScope !== 'manual' && (
              <p className="text-sm text-slate-600 mb-4">
                سيتم حذف <strong>{getManageScopeEvents().length}</strong> موعد.
                {manageScope === 'all' && ' لا يمكن التراجع عن هذا الإجراء.'}
              </p>
            )}

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setManageStep('action')}>رجوع</button>
              <button className="btn btn-danger" onClick={applyManageDelete}
                disabled={saving
                  || (manageScope === 'manual' && manageSelected.length === 0)
                  || (manageScope === 'range' && (!manageRange.from || !manageRange.to))}>
                {saving ? <Spinner size="sm"/> : <><Trash2 size={13}/> تأكيد الحذف ({getManageScopeEvents().length})</>}
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
              <EventTypeSelector val={editForm.event_type} onChange={v => setEditForm((p: any) => ({ ...p, event_type: v }))}/>
            </FormField>
            {editForm.event_type === 'match' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                <p className="text-[11px] font-bold text-slate-500">⚽ بيانات المباراة</p>
                <FormField label="المنافس">
                  <input className="form-input" value={editForm.opponent} onChange={e => setEditForm((p: any) => ({ ...p, opponent: e.target.value }))} placeholder="الهلال، النصر..."/>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="الأرض">
                    <select className="form-input" value={editForm.home_away} onChange={e => setEditForm((p: any) => ({ ...p, home_away: e.target.value }))}>
                      <option value="home">🏟️ ملعبنا</option>
                      <option value="away">🚌 ملعب المنافس</option>
                      <option value="neutral">⚖️ أرض محايدة</option>
                    </select>
                  </FormField>
                  <FormField label="نوع المباراة">
                    <select className="form-input" value={editForm.match_category} onChange={e => setEditForm((p: any) => ({ ...p, match_category: e.target.value }))}>
                      <option value="friendly">ودية</option>
                      <option value="tournament">بطولة</option>
                    </select>
                  </FormField>
                </div>
                {editForm.match_category === 'tournament' && (
                  <FormField label="اسم البطولة">
                    <input className="form-input" value={editForm.tournament_name} onChange={e => setEditForm((p: any) => ({ ...p, tournament_name: e.target.value }))}/>
                  </FormField>
                )}
              </div>
            )}
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
            <FormField label="من يسجل الحضور؟">
              <select className="form-input" value={editForm.att_group} onChange={e => setEditForm((p: any) => ({ ...p, att_group: e.target.value }))}>
                {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </FormField>
            <FormField label="ملاحظة للاعبين (اختياري — تظهر عند التحضير)">
              <div className="relative">
                <textarea className="form-input resize-none h-20" maxLength={280}
                  value={editForm.description} onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))}
                  placeholder="تعليمات خاصة، متطلبات التدريب..."/>
                <span className="absolute bottom-2 left-2 text-[10px] text-slate-300">{editForm.description?.length || 0}/280</span>
              </div>
            </FormField>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setEditEvent(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !editForm.title.trim()}>
                {saving ? <Spinner size="sm"/> : <><Edit2 size={13}/> حفظ التعديلات</>}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
