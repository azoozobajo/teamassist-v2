import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Umbrella } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { leaveService, teamService, eventService, notificationService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ProgressBar } from '../../components/ui'
import { formatDate, canManageTeam } from '../../utils/helpers'
import { eachDayOfInterval, parseISO, format } from 'date-fns'

export default function LeavesPage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()
  const [leaves, setLeaves] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [showReq, setShowReq] = useState(false)
  const [showApprove, setShowApprove] = useState<any>(null)
  const [partialDays, setPartialDays] = useState<string[]>([])
  const [approveMode, setApproveMode] = useState<'full'|'partial'>('full')
  const [form, setForm] = useState({ reason:'', from_date:'', to_date:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const l = await leaveService.getAll(teamId)
    setLeaves(l); setLoading(false)
  }

  async function submitLeave() {
    if (!form.reason || !form.from_date || !form.to_date || !teamId || !user) return
    setSaving(true)
    await leaveService.create({ ...form, team_id: teamId, user_id: user.id, status: 'pending' })
    await notificationService.createForTeam(teamId, `طلب إجازة من ${profile?.full_name || user.email}`,
      `${form.from_date} ← ${form.to_date}`, 'leave', user.id)
    await load()
    setShowReq(false); setForm({ reason:'', from_date:'', to_date:'', notes:'' }); setSaving(false)
  }

  async function approveLeave(leaf: any) {
    if (!teamId || !user) return
    setSaving(true)
    const days = approveMode === 'full'
      ? eachDayOfInterval({ start: parseISO(leaf.from_date), end: parseISO(leaf.to_date) })
          .map(d => format(d, 'yyyy-MM-dd'))
      : partialDays

    await leaveService.update(leaf.id, {
      status: approveMode === 'full' ? 'approved' : 'partial',
      note: approveMode === 'full' ? 'موافقة كاملة على الإجازة' : `موافقة جزئية على ${days.length} أيام`,
      partial_days: days,
      reviewed_by: user.id
    })

    // Auto-mark absent for events in approved days
    const events = await eventService.getTeamEvents(teamId)
    for (const ev of events) {
      const evDate = ev.start_datetime.slice(0, 10)
      if (days.includes(evDate)) {
        await eventService.setAttendance({
          event_id: ev.id, team_id: teamId, user_id: leaf.user_id,
          status: 'absent', admin_note: `إجازة مقبولة: ${leaf.reason}`
        })
      }
    }

    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: approveMode === 'full' ? 'تمت الموافقة على إجازتك كاملة' : `موافقة جزئية على إجازتك (${days.length} أيام)`,
      body: leaf.reason, type: 'leave', is_read: false
    })

    await load(); setShowApprove(null); setSaving(false)
  }

  async function rejectLeave(leaf: any) {
    if (!user) return
    await leaveService.update(leaf.id, { status: 'rejected', note: 'تم رفض الطلب', reviewed_by: user.id })
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: 'تم رفض طلب إجازتك', body: leaf.reason, type: 'leave', is_read: false
    })
    await load()
  }

  const isAdmin = canManageTeam(myRole)
  const filtered = tab === 'all' ? leaves
    : leaves.filter(l => l.status === tab)

  const statusStyle: Record<string,string> = {
    pending:'bg-amber-100 text-amber-700', approved:'bg-emerald-100 text-emerald-700',
    rejected:'bg-red-100 text-red-700', partial:'bg-blue-100 text-blue-700'
  }
  const statusLabel: Record<string,string> = {
    pending:'معلق', approved:'مقبول كامل', rejected:'مرفوض', partial:'موافقة جزئية'
  }

  // Generate days between dates
  const getDays = (from: string, to: string) => {
    try {
      return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
        .map(d => format(d, 'yyyy-MM-dd'))
    } catch { return [] }
  }

  return (
    <div>
      <PageHeader title="الإجازات والاعتذارات"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowReq(true)}><Plus size={14}/>طلب إجازة</button>}/>
      <Tabs
        tabs={[
          {key:'all',label:'الكل'}, {key:'pending',label:'معلقة'},
          {key:'approved',label:'مقبولة'}, {key:'partial',label:'جزئية'}, {key:'rejected',label:'مرفوضة'}
        ]}
        active={tab} onChange={setTab}/>
      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : filtered.length === 0 ? <div className="card"><EmptyState icon={<Umbrella size={28}/>} title="لا توجد طلبات"/></div>
        : <div className="space-y-3">
            {filtered.map(l => (
              <div key={l.id} className="card mb-0">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {l.profile?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm">{l.profile?.full_name}</div>
                      <span className={`badge ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">السبب: {l.reason}</div>
                    <div className="text-xs text-slate-400">من {l.from_date} إلى {l.to_date}</div>
                    {l.note && (
                      <div className="text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-lg mt-2">{l.note}</div>
                    )}
                    {l.partial_days?.length > 0 && (
                      <div className="text-xs text-slate-400 mt-1">الأيام المعتمدة: {l.partial_days.join('، ')}</div>
                    )}
                    {isAdmin && l.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => { setShowApprove(l); setApproveMode('full'); setPartialDays([]) }}
                          className="btn btn-primary btn-sm">مراجعة الطلب</button>
                        <button onClick={() => rejectLeave(l)}
                          className="btn btn-ghost btn-sm text-red-600 border-red-200">رفض</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>}

      {/* Request Leave Modal */}
      <Modal open={showReq} onClose={() => setShowReq(false)} title="طلب إجازة">
        <FormField label="السبب" required>
          <input className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="سفر عائلي..."/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ" required>
            <input className="form-input" type="date" value={form.from_date} onChange={e => set('from_date', e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ" required>
            <input className="form-input" type="date" value={form.to_date} onChange={e => set('to_date', e.target.value)}/>
          </FormField>
        </div>
        <FormField label="ملاحظات إضافية">
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowReq(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitLeave} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal open={!!showApprove} onClose={() => setShowApprove(null)} title="مراجعة طلب الإجازة">
        {showApprove && (
          <div>
            <div className="bg-slate-50 rounded-xl p-3 mb-5">
              <div className="font-bold text-sm">{showApprove.profile?.full_name}</div>
              <div className="text-xs text-slate-500 mt-1">{showApprove.reason}</div>
              <div className="text-xs text-slate-400">من {showApprove.from_date} إلى {showApprove.to_date}</div>
            </div>
            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button onClick={() => setApproveMode('full')}
                className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${approveMode==='full' ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                ✅ موافقة كاملة<br/><span className="text-xs font-normal opacity-75">غياب تلقائي للكل</span>
              </button>
              <button onClick={() => { setApproveMode('partial'); setPartialDays([]) }}
                className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${approveMode==='partial' ? 'bg-blue-500 text-white border-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                ✂️ موافقة جزئية<br/><span className="text-xs font-normal opacity-75">اختر أيام محددة</span>
              </button>
            </div>
            {/* Partial day picker */}
            {approveMode === 'partial' && (
              <div className="mb-5">
                <p className="text-xs font-bold text-slate-500 mb-2">اختر الأيام المعتمدة:</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {getDays(showApprove.from_date, showApprove.to_date).map(day => (
                    <label key={day} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={partialDays.includes(day)}
                        onChange={e => setPartialDays(p => e.target.checked ? [...p, day] : p.filter(d => d !== day))}
                        className="w-4 h-4 accent-brand-500"/>
                      <span className="text-sm">{day}</span>
                    </label>
                  ))}
                </div>
                {partialDays.length > 0 && (
                  <div className="mt-2 text-xs text-brand-600 font-bold">{partialDays.length} أيام محددة</div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setShowApprove(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={() => approveLeave(showApprove)} disabled={saving || (approveMode==='partial' && partialDays.length===0)}>
                {saving ? <Spinner size="sm"/> : 'تأكيد الموافقة'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
