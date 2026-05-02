import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Umbrella, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { leaveService, teamService, eventService, notificationService, permissionService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, Avatar } from '../../components/ui'
import { formatDate, canManageTeam } from '../../utils/helpers'
import { eachDayOfInterval, parseISO, format } from 'date-fns'

export default function LeavesPage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()
  const [leaves, setLeaves]   = useState<any[]>([])
  const [myRole, setMyRole]   = useState('')
  const [myPerms, setMyPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('all')

  // Modals
  const [showReq, setShowReq]       = useState(false)
  const [showApprove, setShowApprove] = useState<any>(null)
  const [approveMode, setApproveMode] = useState<'full' | 'partial'>('full')
  const [partialDays, setPartialDays]   = useState<string[]>([])
  const [partialRange, setPartialRange] = useState({ from: '', to: '' })
  const [form, setForm] = useState({ reason: '', from_date: '', to_date: '', note: '' })
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getMyRole(teamId, user.id),
      permissionService.getUserPermissions(teamId, user.id),
    ]).then(([role, perms]) => { setMyRole(role || ''); setMyPerms(perms) })
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
    setSaving(true); setSubmitError('')
    const { error } = await leaveService.create({ ...form, team_id: teamId, user_id: user.id, status: 'pending' })
    if (error) { setSubmitError('حدث خطأ، حاول مجدداً'); setSaving(false); return }
    await notificationService.createForTeam(teamId,
      `طلب إجازة من ${profile?.full_name || user.email}`,
      `${form.from_date} ← ${form.to_date}`, 'leave', user.id)
    await load()
    setShowReq(false); setForm({ reason: '', from_date: '', to_date: '', note: '' }); setSaving(false)
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
      note: approveMode === 'full' ? 'موافقة كاملة' : `موافقة جزئية على ${days.length} أيام`,
      partial_days: days, reviewed_by: user.id
    })
    const events = await eventService.getTeamEvents(teamId)
    for (const ev of events) {
      if (days.includes(ev.start_datetime.slice(0, 10)))
        await eventService.setAttendance({ event_id: ev.id, team_id: teamId, user_id: leaf.user_id, status: 'absent', admin_note: `إجازة مقبولة: ${leaf.reason}` })
    }
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: approveMode === 'full' ? 'تمت الموافقة على إجازتك كاملة' : `موافقة جزئية (${days.length} أيام)`,
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

  const getDays = (from: string, to: string) => {
    try { return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(d => format(d, 'yyyy-MM-dd')) }
    catch { return [] }
  }

  // ── Access level ──
  const isAdmin   = canManageTeam(myRole)
  const canManageLeaves = isAdmin || myPerms.includes('manage_leaves')

  // ── Data slices ──
  const pendingCount   = leaves.filter(l => l.status === 'pending').length
  const filtered       = tab === 'all' ? leaves : leaves.filter(l => l.status === tab)
  const approvedLeaves = leaves.filter(l => l.status === 'approved' || l.status === 'partial')
  const myOwnLeaves    = leaves.filter(l => l.user_id === user?.id)
  const myPending      = myOwnLeaves.filter(l => l.status === 'pending')

  // ── Style maps ──
  const statusStyle:  Record<string, string> = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', partial: 'bg-blue-100 text-blue-700' }
  const statusLabel:  Record<string, string> = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض', partial: 'جزئي' }
  const statusIcon:   Record<string, string> = { pending: '⏳', approved: '✅', rejected: '❌', partial: '✂️' }
  const statusBorder: Record<string, string> = { pending: 'border-r-4 border-amber-400', approved: 'border-r-4 border-emerald-400', rejected: 'border-r-4 border-red-400', partial: 'border-r-4 border-blue-400' }

  // ═══════════════════════════════════════════════
  // MEMBER VIEW — approved leaves as news bulletin
  // ═══════════════════════════════════════════════
  if (!canManageLeaves) return (
    <div>
      <PageHeader title="الإجازات"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowReq(true)}><Plus size={14}/>طلب إجازة</button>}/>

      {/* My pending request banner */}
      {myPending.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0"/>
          <p className="text-sm font-bold text-amber-700">طلب إجازتك قيد المراجعة</p>
          <div className="text-xs text-amber-600 mr-auto">
            {myPending[0].from_date} ← {myPending[0].to_date}
          </div>
        </div>
      )}

      {/* My approved/rejected own leaves */}
      {myOwnLeaves.filter(l => l.status !== 'pending').length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">طلباتي</p>
          <div className="space-y-2">
            {myOwnLeaves.filter(l => l.status !== 'pending').map(l => (
              <div key={l.id} className={`card mb-0 py-3 ${statusBorder[l.status] || ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{statusIcon[l.status]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500">{l.from_date} ← {l.to_date}</div>
                    {l.note && <div className="text-xs text-slate-400 mt-0.5">{l.note}</div>}
                  </div>
                  <span className={`badge text-xs ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved leaves — news bulletin */}
      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">
        الإجازات المعتمدة ({approvedLeaves.length})
      </p>
      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : approvedLeaves.length === 0
          ? <div className="card"><EmptyState icon={<Umbrella size={28}/>} title="لا توجد إجازات معتمدة حالياً"/></div>
          : (
            <div className="space-y-3">
              {approvedLeaves.map(l => (
                <div key={l.id}
                  className="card mb-0 border-r-4 border-brand-400 flex items-center gap-4">
                  <Avatar name={l.profile?.full_name || '?'} src={l.profile?.avatar_url} size="lg"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-800 text-sm">{l.profile?.full_name}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-xs text-slate-400">📅</span>
                      <span className="text-xs font-bold text-brand-700">{l.from_date}</span>
                      <span className="text-xs text-slate-400">←</span>
                      <span className="text-xs font-bold text-brand-700">{l.to_date}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Umbrella size={10} className="text-slate-400"/>
                      غير متاح للحضور خلال هذه الفترة
                    </div>
                  </div>
                  {l.status === 'partial' && l.partial_days?.length > 0 && (
                    <div className="text-center flex-shrink-0 bg-blue-50 rounded-xl px-3 py-2">
                      <div className="text-base font-black text-blue-700">{l.partial_days.length}</div>
                      <div className="text-xs text-blue-500">أيام</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

      {/* Request leave modal */}
      <Modal open={showReq} onClose={() => { setShowReq(false); setSubmitError('') }} title="طلب إجازة">
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
          <textarea className="form-input" rows={2} value={form.note} onChange={e => set('note', e.target.value)}/>
        </FormField>
        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowReq(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitLeave} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
        </div>
      </Modal>
    </div>
  )

  // ═══════════════════════════════════════════════
  // ADMIN VIEW — full details + approve/reject
  // ═══════════════════════════════════════════════
  return (
    <div>
      <PageHeader title="الإجازات والاعتذارات"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowReq(true)}><Plus size={14}/>طلب إجازة</button>}/>

      {isAdmin && pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">⏳</div>
          <p className="text-sm font-bold text-amber-700">{pendingCount} طلب إجازة بانتظار مراجعتك</p>
          <button onClick={() => setTab('pending')} className="btn btn-sm mr-auto text-amber-700 border-amber-300 hover:bg-amber-100 bg-white">عرض</button>
        </div>
      )}

      <Tabs
        tabs={[
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'معلقة', badge: pendingCount || undefined },
          { key: 'approved', label: 'مقبولة' },
          { key: 'partial', label: 'جزئية' },
          { key: 'rejected', label: 'مرفوضة' },
        ]}
        active={tab} onChange={setTab}/>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : filtered.length === 0
          ? <div className="card"><EmptyState icon={<Umbrella size={28}/>} title="لا توجد طلبات"/></div>
          : (
            <div className="space-y-3">
              {filtered.map(l => (
                <div key={l.id} className={`card mb-0 ${statusBorder[l.status] || ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <Avatar name={l.profile?.full_name || '?'} src={l.profile?.avatar_url} size="md"/>
                      <div className="absolute -bottom-1 -left-1 text-sm leading-none">{statusIcon[l.status]}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-extrabold text-sm text-slate-800">{l.profile?.full_name}</div>
                        <span className={`badge ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 mb-2">
                        <span className="text-xs text-slate-500">📅</span>
                        <span className="text-xs font-bold text-slate-600">{l.from_date}</span>
                        <span className="text-xs text-slate-400">←</span>
                        <span className="text-xs font-bold text-slate-600">{l.to_date}</span>
                      </div>
                      <div className="text-xs text-slate-500">السبب: {l.reason}</div>
                      {l.note && <div className="text-xs bg-brand-50 border border-brand-100 text-brand-700 px-3 py-1.5 rounded-xl mt-2">{l.note}</div>}
                      {l.partial_days?.length > 0 && <div className="text-xs text-blue-600 mt-1.5 font-bold">الأيام المعتمدة: {l.partial_days.length} أيام</div>}
                      {l.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { setShowApprove(l); setApproveMode('full'); setPartialDays([]) }}
                            className="btn btn-primary btn-sm">مراجعة الطلب</button>
                          <button onClick={() => rejectLeave(l)}
                            className="btn btn-ghost btn-sm text-red-600 border-red-200 hover:bg-red-50">رفض</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

      {/* ── Request Leave Modal ── */}
      <Modal open={showReq} onClose={() => { setShowReq(false); setSubmitError('') }} title="طلب إجازة">
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
          <textarea className="form-input" rows={2} value={form.note} onChange={e => set('note', e.target.value)}/>
        </FormField>
        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowReq(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitLeave} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
        </div>
      </Modal>

      {/* ── Approve Modal ── */}
      <Modal open={!!showApprove} onClose={() => { setShowApprove(null); setPartialRange({ from: '', to: '' }) }} title="مراجعة طلب الإجازة">
        {showApprove && (
          <div>
            <div className="bg-slate-50 rounded-xl p-3 mb-5">
              <div className="font-bold text-sm">{showApprove.profile?.full_name}</div>
              <div className="text-xs text-slate-500 mt-1">{showApprove.reason}</div>
              <div className="text-xs text-slate-400">من {showApprove.from_date} إلى {showApprove.to_date}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button onClick={() => setApproveMode('full')}
                className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${approveMode === 'full' ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                ✅ موافقة كاملة<br/><span className="text-xs font-normal opacity-75">غياب تلقائي للكل</span>
              </button>
              <button onClick={() => { setApproveMode('partial'); setPartialDays([]); setPartialRange({ from: '', to: '' }) }}
                className={`p-3 rounded-xl border text-sm font-bold transition-all text-center ${approveMode === 'partial' ? 'bg-blue-500 text-white border-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                ✂️ موافقة جزئية<br/><span className="text-xs font-normal opacity-75">اختر أيام محددة</span>
              </button>
            </div>
            {approveMode === 'partial' && (
              <div className="mb-5 space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-blue-700 mb-2.5">📅 حدد نطاق التاريخ المعتمد</p>
                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">من</label>
                      <input type="date" className="form-input text-sm" value={partialRange.from}
                        min={showApprove.from_date} max={partialRange.to || showApprove.to_date}
                        onChange={e => setPartialRange(p => ({ ...p, from: e.target.value }))}/>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">إلى</label>
                      <input type="date" className="form-input text-sm" value={partialRange.to}
                        min={partialRange.from || showApprove.from_date} max={showApprove.to_date}
                        onChange={e => setPartialRange(p => ({ ...p, to: e.target.value }))}/>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={!partialRange.from || !partialRange.to}
                      onClick={() => setPartialDays(getDays(partialRange.from, partialRange.to).filter(d => d >= showApprove.from_date && d <= showApprove.to_date))}
                      className="btn btn-sm flex-1 justify-center"
                      style={{ background: '#3b82f6', color: '#fff', opacity: (!partialRange.from || !partialRange.to) ? 0.5 : 1 }}>
                      تطبيق النطاق
                    </button>
                    {partialDays.length > 0 && (
                      <button onClick={() => setPartialDays([])} className="btn btn-ghost btn-sm text-red-500 border-red-200">مسح</button>
                    )}
                  </div>
                  {partialRange.from && partialRange.to && partialRange.from <= partialRange.to && (
                    <p className="text-[11px] text-blue-600 font-bold mt-2">
                      {getDays(partialRange.from, partialRange.to).filter(d => d >= showApprove.from_date && d <= showApprove.to_date).length} يوم في هذا النطاق
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">أو اختر الأيام يدوياً:</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto border border-slate-100 rounded-xl p-1">
                    {getDays(showApprove.from_date, showApprove.to_date).map(day => (
                      <label key={day} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${partialDays.includes(day) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={partialDays.includes(day)}
                          onChange={e => setPartialDays(p => e.target.checked ? [...p, day] : p.filter(d => d !== day))}
                          className="w-4 h-4 accent-blue-500 flex-shrink-0"/>
                        <span className={`text-sm ${partialDays.includes(day) ? 'font-bold text-blue-700' : 'text-slate-600'}`}>{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {partialDays.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700">✅ {partialDays.length} أيام معتمدة</span>
                    <span className="text-[11px] text-blue-500">{partialDays[0]} ← {partialDays[partialDays.length - 1]}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setShowApprove(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={() => approveLeave(showApprove)}
                disabled={saving || (approveMode === 'partial' && partialDays.length === 0)}>
                {saving ? <Spinner size="sm"/> : 'تأكيد الموافقة'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
