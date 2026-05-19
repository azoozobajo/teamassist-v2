import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Umbrella, AlertCircle, Paperclip, FileText, Image, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { leaveService, teamService, eventService, notificationService, permissionService, medicalService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, Avatar } from '../../components/ui'
import { formatDate, canManageTeam } from '../../utils/helpers'
import { eachDayOfInterval, parseISO, format } from 'date-fns'

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
}

function parseAttachments(url: string | null | undefined): string[] {
  if (!url) return []
  try {
    const parsed = JSON.parse(url)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return [url]
}

function FileIcon({ name }: { name: string }) {
  return name.toLowerCase().includes('.pdf')
    ? <FileText size={13} className="text-red-500 flex-shrink-0"/>
    : <Image size={13} className="text-blue-500 flex-shrink-0"/>
}

function formatDayList(days: string[] = []) {
  if (!days.length) return ''
  const sorted = [...days].sort()
  const isContinuous = sorted.every((day, i) => {
    if (i === 0) return true
    const prev = new Date(sorted[i - 1])
    const cur = new Date(day)
    return Math.round((cur.getTime() - prev.getTime()) / 86400000) === 1
  })
  if (isContinuous) return sorted.length === 1 ? sorted[0] : `${sorted[0]} إلى ${sorted[sorted.length - 1]}`
  return sorted.join('، ')
}

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
  const [showAppeal, setShowAppeal] = useState<any>(null)
  const [approveMode, setApproveMode] = useState<'full' | 'partial'>('full')
  const [partialDays, setPartialDays]   = useState<string[]>([])
  const [partialRange, setPartialRange] = useState({ from: '', to: '' })
  const [decisionNote, setDecisionNote] = useState('')
  const [form, setForm] = useState({ reason: '', from_date: '', to_date: '', note: '' })
  const [appealText, setAppealText] = useState('')
  const [requestFiles, setRequestFiles] = useState<File[]>([])
  const [appealFiles, setAppealFiles] = useState<File[]>([])
  const requestFileRef = useRef<HTMLInputElement>(null)
  const appealFileRef = useRef<HTMLInputElement>(null)
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
    const attachment_url = await uploadLeaveFiles(requestFiles, 'request')
    if (attachment_url === false) { setSaving(false); return }
    const { error } = await leaveService.create({ ...form, attachment_url, team_id: teamId, user_id: user.id, status: 'pending' })
    if (error) { setSubmitError('حدث خطأ، حاول مجدداً'); setSaving(false); return }
    await notificationService.createForTeam(teamId,
      `طلب إجازة من ${profile?.full_name || user.email}`,
      `${form.from_date} ← ${form.to_date}`, 'leave', user.id)
    await load()
    setShowReq(false); setForm({ reason: '', from_date: '', to_date: '', note: '' }); setRequestFiles([]); setSaving(false)
  }

  async function uploadLeaveFiles(files: File[], folder: 'request' | 'appeal'): Promise<string | null | false> {
    if (!files.length || !teamId || !user) return null
    const urls: string[] = []
    for (const file of files) {
      const path = `${teamId}/leaves/${folder}/${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`
      const { url, error } = await medicalService.uploadAttachment(file, path)
      if (error || !url) {
        setSubmitError('فشل رفع المرفق: ' + (error || 'خطأ غير معروف'))
        return false
      }
      urls.push(url)
    }
    return urls.length === 1 ? urls[0] : JSON.stringify(urls)
  }

  async function syncLeaveAttendance(leaf: any, days: string[], status: string) {
    if (!teamId || !user) return
    const events = await eventService.getTeamEvents(teamId)
    const relevantDates = new Set([
      ...getDays(leaf.from_date, leaf.to_date),
      ...(leaf.partial_days || []),
      ...days,
    ])
    for (const ev of events) {
      const evDay = ev.start_datetime.slice(0, 10)
      if (!relevantDates.has(evDay)) continue

      const shouldMarkExcused = (status === 'approved' || status === 'partial') && days.includes(evDay)
      if (shouldMarkExcused) {
        await eventService.setAttendance({
          event_id: ev.id,
          team_id: teamId,
          user_id: leaf.user_id,
          status: 'excused',
          has_excuse: true,
          excuse_reason: `إجازة معتمدة: ${leaf.reason}`,
          admin_note: `إجازة معتمدة (${formatDayList(days)})`,
          marked_by: user.id,
        })
      } else {
        const eventAttendance = await eventService.getAttendance(ev.id)
        const existing = eventAttendance.find((a: any) => a.user_id === leaf.user_id)
        const wasSetByLeave = existing?.admin_note?.includes('إجازة معتمدة')
          || existing?.excuse_reason?.includes('إجازة معتمدة')
        if (!wasSetByLeave) continue

        await eventService.setAttendance({
          event_id: ev.id,
          team_id: teamId,
          user_id: leaf.user_id,
          status: 'uncertain',
          has_excuse: false,
          excuse_reason: null,
          admin_note: 'تم تعديل قرار الإجازة',
          marked_by: user.id,
        })
      }
    }
  }

  async function approveLeave(leaf: any) {
    if (!teamId || !user) return
    setSaving(true)
    const days = approveMode === 'full'
      ? eachDayOfInterval({ start: parseISO(leaf.from_date), end: parseISO(leaf.to_date) })
          .map(d => format(d, 'yyyy-MM-dd'))
      : partialDays
    const status = approveMode === 'full' ? 'approved' : 'partial'
    const note = decisionNote.trim() || (approveMode === 'full'
      ? `موافقة كاملة: ${formatDayList(days)}`
      : `موافقة جزئية: ${formatDayList(days)}`)
    await leaveService.update(leaf.id, {
      status,
      note,
      partial_days: days, reviewed_by: user.id
    })
    await syncLeaveAttendance(leaf, days, status)
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: approveMode === 'full' ? 'تمت الموافقة على إجازتك كاملة' : `موافقة جزئية (${days.length} أيام)`,
      body: `${leaf.reason} - الأيام المعتمدة: ${formatDayList(days)}`, type: 'leave', is_read: false
    })
    await load(); setShowApprove(null); setDecisionNote(''); setSaving(false)
  }

  async function rejectLeave(leaf: any) {
    if (!user) return
    await leaveService.update(leaf.id, { status: 'rejected', note: decisionNote.trim() || 'تم رفض الطلب', reviewed_by: user.id })
    await syncLeaveAttendance(leaf, [], 'rejected')
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: 'تم رفض طلب إجازتك', body: leaf.reason, type: 'leave', is_read: false
    })
    await load(); setShowApprove(null); setDecisionNote('')
  }

  async function submitAppeal() {
    if (!showAppeal || !teamId || !user || !appealText.trim()) return
    setSaving(true); setSubmitError('')
    const appeal_attachment_url = await uploadLeaveFiles(appealFiles, 'appeal')
    if (appeal_attachment_url === false) { setSaving(false); return }
    await leaveService.update(showAppeal.id, {
      appeal_text: appealText,
      appeal_attachment_url,
      appealed_at: new Date().toISOString(),
    })
    await notificationService.createForTeam(teamId,
      `رد مطالبة على إجازة من ${profile?.full_name || user.email}`,
      appealText, 'leave', user.id)
    await load()
    setShowAppeal(null); setAppealText(''); setAppealFiles([]); setSaving(false)
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

  function approvedDaysText(l: any) {
    if (l.status === 'approved') return `الأيام المعتمدة: ${formatDayList(getDays(l.from_date, l.to_date))}`
    if (l.status === 'partial' && l.partial_days?.length) return `الأيام المعتمدة: ${formatDayList(l.partial_days)}`
    return ''
  }

  function AttachmentLinks({ url, label = 'مرفق' }: { url?: string | null; label?: string }) {
    const files = parseAttachments(url)
    if (!files.length) return null
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {files.map((fileUrl, idx) => (
          <a key={idx} href={fileUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-2 py-1 border border-brand-100 no-underline">
            <Paperclip size={11}/> {label} {files.length > 1 ? idx + 1 : ''}
          </a>
        ))}
      </div>
    )
  }

  function FilePicker({ files, setFiles, inputRef }: {
    files: File[]
    setFiles: React.Dispatch<React.SetStateAction<File[]>>
    inputRef: React.RefObject<HTMLInputElement>
  }) {
    return (
      <div className="space-y-2">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
            <FileIcon name={f.name}/>
            <span className="text-xs text-brand-700 font-bold flex-1 truncate">{f.name}</span>
            <span className="text-xs text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
            <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
              className="p-1 rounded-lg hover:bg-red-50 text-red-500 border-none bg-transparent cursor-pointer">
              <X size={13}/>
            </button>
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 text-xs font-bold text-slate-500 hover:border-brand-300 hover:text-brand-600">
          <Paperclip size={14} className="inline ml-1"/> إضافة صورة أو PDF
        </button>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
          onChange={e => {
            const next = Array.from(e.target.files || [])
            setFiles(prev => [...prev, ...next].slice(0, 5))
            if (inputRef.current) inputRef.current.value = ''
          }}/>
      </div>
    )
  }

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
                    {approvedDaysText(l) && <div className="text-xs text-blue-600 font-bold mt-1">{approvedDaysText(l)}</div>}
                    <AttachmentLinks url={l.attachment_url} label="مرفق الطلب"/>
                    <AttachmentLinks url={l.appeal_attachment_url} label="مرفق الرد"/>
                  </div>
                  <span className={`badge text-xs ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowAppeal(l); setAppealText(l.appeal_text || ''); setAppealFiles([]) }}>
                    رفع رد مطالبة
                  </button>
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
                    {approvedDaysText(l) && <div className="text-xs text-blue-600 font-bold mt-1.5">{approvedDaysText(l)}</div>}
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
        <FormField label="مرفقات الطلب — صورة أو PDF">
          <FilePicker files={requestFiles} setFiles={setRequestFiles} inputRef={requestFileRef}/>
        </FormField>
        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowReq(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitLeave} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
        </div>
      </Modal>

      <Modal open={!!showAppeal} onClose={() => { setShowAppeal(null); setAppealText(''); setAppealFiles([]); setSubmitError('') }} title="رفع رد مطالبة">
        {showAppeal && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <div className="text-xs font-bold text-slate-700">{showAppeal.reason}</div>
              <div className="text-xs text-slate-400 mt-1">{showAppeal.from_date} ← {showAppeal.to_date}</div>
            </div>
            <FormField label="اكتب أهمية الإجازة ولماذا هي ضرورية" required>
              <textarea className="form-input" rows={4} value={appealText}
                onChange={e => setAppealText(e.target.value)}
                placeholder="وضح سبب الحاجة للإجازة وأي تفاصيل داعمة..."/>
            </FormField>
            <FormField label="مرفقات الرد — صورة أو PDF">
              <FilePicker files={appealFiles} setFiles={setAppealFiles} inputRef={appealFileRef}/>
            </FormField>
            {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setShowAppeal(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={submitAppeal} disabled={saving || !appealText.trim()}>
                {saving ? <Spinner size="sm"/> : 'إرسال الرد'}
              </button>
            </div>
          </>
        )}
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
                      {approvedDaysText(l) && <div className="text-xs text-blue-600 mt-1.5 font-bold">{approvedDaysText(l)}</div>}
                      <AttachmentLinks url={l.attachment_url} label="مرفق الطلب"/>
                      {l.appeal_text && (
                        <div className="text-xs bg-amber-50 border border-amber-100 text-amber-700 px-3 py-1.5 rounded-xl mt-2">
                          رد المطالبة: {l.appeal_text}
                        </div>
                      )}
                      <AttachmentLinks url={l.appeal_attachment_url} label="مرفق الرد"/>
                      {(l.status === 'pending' || l.status === 'approved' || l.status === 'partial' || l.status === 'rejected') && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => {
                              setShowApprove(l)
                              setApproveMode(l.status === 'partial' ? 'partial' : 'full')
                              setPartialDays(l.partial_days?.length ? l.partial_days : [])
                              setDecisionNote(l.note || '')
                            }}
                            className="btn btn-primary btn-sm">مراجعة الطلب</button>
                          {l.user_id === user?.id && l.status !== 'pending' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAppeal(l); setAppealText(l.appeal_text || ''); setAppealFiles([]) }}>
                              رفع رد مطالبة
                            </button>
                          )}
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
        <FormField label="مرفقات الطلب — صورة أو PDF">
          <FilePicker files={requestFiles} setFiles={setRequestFiles} inputRef={requestFileRef}/>
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
              <AttachmentLinks url={showApprove.attachment_url} label="مرفق الطلب"/>
              {showApprove.appeal_text && (
                <div className="text-xs bg-amber-50 border border-amber-100 text-amber-700 px-3 py-1.5 rounded-xl mt-2">
                  رد المطالبة: {showApprove.appeal_text}
                </div>
              )}
              <AttachmentLinks url={showApprove.appeal_attachment_url} label="مرفق الرد"/>
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
            <FormField label="ملاحظة القرار">
              <textarea className="form-input" rows={2} value={decisionNote}
                onChange={e => setDecisionNote(e.target.value)}
                placeholder="اكتب سبب القرار أو تفاصيل الأيام المعتمدة..."/>
            </FormField>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setShowApprove(null)}>إلغاء</button>
              <button className="btn btn-ghost text-red-600 border-red-200 hover:bg-red-50" onClick={() => rejectLeave(showApprove)} disabled={saving}>
                رفض / تعديل إلى مرفوض
              </button>
              <button className="btn btn-primary" onClick={() => approveLeave(showApprove)}
                disabled={saving || (approveMode === 'partial' && partialDays.length === 0)}>
                {saving ? <Spinner size="sm"/> : 'تأكيد الموافقة'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!showAppeal} onClose={() => { setShowAppeal(null); setAppealText(''); setAppealFiles([]); setSubmitError('') }} title="رفع رد مطالبة">
        {showAppeal && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <div className="text-xs font-bold text-slate-700">{showAppeal.reason}</div>
              <div className="text-xs text-slate-400 mt-1">{showAppeal.from_date} ← {showAppeal.to_date}</div>
            </div>
            <FormField label="اكتب أهمية الإجازة ولماذا هي ضرورية" required>
              <textarea className="form-input" rows={4} value={appealText}
                onChange={e => setAppealText(e.target.value)}
                placeholder="وضح سبب الحاجة للإجازة وأي تفاصيل داعمة..."/>
            </FormField>
            <FormField label="مرفقات الرد — صورة أو PDF">
              <FilePicker files={appealFiles} setFiles={setAppealFiles} inputRef={appealFileRef}/>
            </FormField>
            {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setShowAppeal(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={submitAppeal} disabled={saving || !appealText.trim()}>
                {saving ? <Spinner size="sm"/> : 'إرسال الرد'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
