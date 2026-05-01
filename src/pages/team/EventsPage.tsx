import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, MapPin, Clock, Repeat, Trash2, Users, X, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, teamService, notificationService } from '../../services'
import { Spinner, PageHeader, EmptyState, Modal, FormField, Tabs } from '../../components/ui'
import { EVENT_CONFIG, WEEK_DAYS, canManageEvents, formatDate, isEventLocked } from '../../utils/helpers'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { arSA } from 'date-fns/locale'

const EVENT_TYPES = ['training','match','meeting','camp','other']
const ATT_GROUPS = ['الكل','اللاعبون فقط','المدربون فقط','اللاعبون والمدربون','الإداريون فقط','مجموعة مخصصة']

export default function EventsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
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
  const [saving, setSaving] = useState(false)

  // Single event form
  const defaultForm = {
    title: '', event_type: 'training', start_datetime: '', end_datetime: '',
    location: '', map_url: '', att_group: 'الكل', description: '',
    selectedMembers: [] as string[]
  }
  const [form, setForm] = useState(defaultForm)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  // Recurring form
  const defaultRecur = {
    title: '', event_type: 'training', days_of_week: [] as number[],
    start_date: '', end_date: '', start_time: '18:00', end_time: '20:00',
    location: '', map_url: '', att_group: 'الكل',
    selectedMembers: [] as string[]
  }
  const [recurForm, setRecurForm] = useState(defaultRecur)
  const setR = (k: string, v: any) => setRecurForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(m => setMembers(m.filter((x: any) => x.role !== 'parent')))
    load()
  }, [teamId, user])

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
      att_member_ids: memberIds, team_id: teamId, created_by: user!.id
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

  const toggleDay = (d: number) =>
    setR('days_of_week', recurForm.days_of_week.includes(d)
      ? recurForm.days_of_week.filter(x => x !== d)
      : [...recurForm.days_of_week, d])

  const toggleMember = (uid: string, which: 'form' | 'recur') => {
    if (which === 'form') {
      const sel = form.selectedMembers.includes(uid)
        ? form.selectedMembers.filter(x => x !== uid)
        : [...form.selectedMembers, uid]
      setF('selectedMembers', sel)
    } else {
      const sel = recurForm.selectedMembers.includes(uid)
        ? recurForm.selectedMembers.filter(x => x !== uid)
        : [...recurForm.selectedMembers, uid]
      setR('selectedMembers', sel)
    }
  }

  const canManage = canManageEvents(myRole)
  const now = new Date()
  const upcoming = events.filter(e => new Date(e.start_datetime) >= now)
  const past = events.filter(e => new Date(e.start_datetime) < now).reverse()
  const list = tab === 'upcoming' ? upcoming : past

  // Calendar helpers
  const monthDays = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDayOfWeek = getDay(startOfMonth(calMonth))
  const eventsOnDay = (day: Date) => events.filter(e => isSameDay(parseISO(e.start_datetime), day))
  const arDays = ['أح','إث','ثل','أر','خم','جم','سب']

  // Member picker component (reused in both forms)
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

  return (
    <div>
      <PageHeader title="المواعيد"
        action={canManage && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRecurring(true)}>
              <Repeat size={13}/> متكرر
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={13}/> حدث
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
                  const isToday = isSameDay(day, now)
                  return (
                    <div key={day.toISOString()}
                      className={`min-h-[52px] rounded-xl p-1 cursor-pointer transition-colors ${isToday ? 'bg-brand-50 ring-1 ring-brand-400' : dayEvs.length ? 'hover:bg-slate-50' : ''}`}
                      onClick={() => dayEvs.length && setShowDetail({ date: day, events: dayEvs })}>
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
                      return (
                        <div key={e.id} className={`card mb-0 border-r-4 ${c.borderClass} cursor-pointer hover:shadow-md transition-all`}
                          onClick={() => setShowDetail({ date: parseISO(e.start_datetime), events: [e] })}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl flex-shrink-0">{c.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
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
        {showDetail?.events.map((e: any) => {
          const c = EVENT_CONFIG[e.event_type as keyof typeof EVENT_CONFIG] || EVENT_CONFIG.other
          return (
            <div key={e.id} className={`card border-r-4 ${c.borderClass} mb-3`}>
              <div className="flex items-start justify-between">
                <div>
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
                  {e.att_member_ids?.length > 0 && (
                    <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Users size={10}/> هذا الموعد لـ {e.att_member_ids.length} عضو محدد
                    </div>
                  )}
                  {!e.att_member_ids && e.att_group && <div className="text-xs text-slate-400 mt-1">الحضور: {e.att_group}</div>}
                </div>
                {canManage && (
                  <button onClick={() => setConfirmDelete(e)} className="text-slate-400 hover:text-red-500 p-1">
                    <Trash2 size={14}/>
                  </button>
                )}
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
          <EventTypeSelector val={form.event_type} onChange={v => setF('event_type',v)}/>
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
        <FormField label="من يسجل الحضور؟">
          <select className="form-input" value={form.att_group} onChange={e => setF('att_group',e.target.value)}>
            {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
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
          <EventTypeSelector val={recurForm.event_type} onChange={v => setR('event_type',v)}/>
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
            {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
          </select>
        </FormField>
        {recurForm.att_group === 'مجموعة مخصصة' && (
          <FormField label="الأعضاء المدعوون لكل هذه المواعيد">
            <MemberPicker which="recur"/>
          </FormField>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowRecurring(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addRecurring}
            disabled={saving || recurForm.days_of_week.length===0 || (recurForm.att_group==='مجموعة مخصصة' && recurForm.selectedMembers.length===0)}>
            {saving ? <Spinner size="sm"/> : <><Repeat size={13}/> إنشاء الجدول</>}
          </button>
        </div>
      </Modal>
    </div>
  )
}
