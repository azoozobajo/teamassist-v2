import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, Umbrella, AlertCircle, Paperclip, FileText, Image, X, Gavel,
  UserX, ChevronUp, ChevronDown, BarChart2, CalendarOff, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  leaveService, absenceService, teamService, eventService,
  notificationService, permissionService, medicalService, adminDecisionService,
  attendanceService,
} from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, Avatar } from '../../components/ui'
import { formatDate, canManageTeam } from '../../utils/helpers'
import { eachDayOfInterval, parseISO, format } from 'date-fns'

// ── Helpers ──────────────────────────────────────────────────────────
function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
}
function parseAttachments(url: string | null | undefined): string[] {
  if (!url) return []
  try { const p = JSON.parse(url); if (Array.isArray(p)) return p } catch {}
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
  const isCont = sorted.every((d, i) => {
    if (i === 0) return true
    return Math.round((new Date(d).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000) === 1
  })
  if (isCont) return sorted.length === 1 ? sorted[0] : `${sorted[0]} إلى ${sorted[sorted.length - 1]}`
  return sorted.join('، ')
}
function getDayCount(from: string, to: string) {
  try { return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).length } catch { return 0 }
}

// ── Constants ────────────────────────────────────────────────────────
const LEAVE_TYPE_LABEL: Record<string, string> = {
  suspension: 'إيقاف', national_team: 'استدعاء للمنتخب',
  penalty: 'عقوبة', rest: 'راحة', emergency: 'طارئ',
  death: 'حالة وفاة', marriage: 'زواج', academic: 'دراسة',
  family: 'عائلي', private_event: 'مناسبة خاصة', other: 'أخرى',
}

const ABSENCE_TYPE_LABEL: Record<string, string> = {
  excused: 'غياب بعذر',
  unexcused: 'غياب بدون عذر',
  disciplinary: 'قرار انضباطي',
  admin_suspension: 'إيقاف إداري',
  yellow_cards: 'إيقاف بالبطاقات الصفراء',
  red_card: 'إيقاف ببطاقة حمراء',
  national_team: 'استدعاء منتخب',
  injury: 'إصابة',
  emergency: 'ظرف طارئ',
  academic: 'عذر دراسي',
  family: 'عذر عائلي',
  other: 'أخرى',
}

const ABSENCE_TYPE_STYLE: Record<string, string> = {
  excused: 'bg-blue-100 text-blue-700',
  unexcused: 'bg-red-100 text-red-700',
  disciplinary: 'bg-orange-100 text-orange-700',
  admin_suspension: 'bg-red-100 text-red-700',
  yellow_cards: 'bg-yellow-100 text-yellow-700',
  red_card: 'bg-red-200 text-red-800',
  national_team: 'bg-sky-100 text-sky-700',
  injury: 'bg-rose-100 text-rose-700',
  emergency: 'bg-amber-100 text-amber-700',
  academic: 'bg-purple-100 text-purple-700',
  family: 'bg-teal-100 text-teal-700',
  other: 'bg-slate-100 text-slate-700',
}

const APPLY_TO_LABEL: Record<string, string> = {
  match_only: 'مباراة فقط',
  training_only: 'التمارين فقط',
  meeting_only: 'الاجتماعات فقط',
  all: 'كل المواعيد',
  match_training: 'المباراة والتمارين',
  training_meeting: 'التمارين والاجتماعات',
  match_training_meeting: 'المباراة والتمارين والاجتماعات',
  specific: 'اختيار مواعيد محددة',
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  match: 'مباراة', training: 'تمرين', meeting: 'اجتماع',
  camp: 'معسكر', assessment: 'تقييم', other: 'أخرى',
}
const EVENT_TYPE_ICON: Record<string, string> = {
  match: '⚽', training: '🏃', meeting: '🤝', camp: '⛺', assessment: '📊', other: '📌',
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'مالك', head_coach: 'مدرب رئيسي', assistant_coach: 'مدرب مساعد',
  player: 'لاعب', administrator: 'إداري', media: 'إعلام', medical: 'طبي',
}

// ── Component ────────────────────────────────────────────────────────
export default function LeavesPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  // ── Existing leaves state ──
  const [leaves, setLeaves]       = useState<any[]>([])
  const [decisions, setDecisions] = useState<any[]>([])
  const [members, setMembers]     = useState<any[]>([])
  const [myRole, setMyRole]       = useState('')
  const [myPerms, setMyPerms]     = useState<string[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('all')

  const [showReq, setShowReq]         = useState(false)
  const [showDecision, setShowDecision] = useState(false)
  const [showApprove, setShowApprove]  = useState<any>(null)
  const [showAppeal, setShowAppeal]    = useState<any>(null)
  const [approveMode, setApproveMode]  = useState<'full' | 'partial'>('full')
  const [partialDays, setPartialDays]  = useState<string[]>([])
  const [partialRange, setPartialRange] = useState({ from: '', to: '' })
  const [decisionNote, setDecisionNote] = useState('')
  const [form, setForm] = useState({ reason: '', leave_type: 'other', from_date: '', to_date: '', note: '' })
  const [decisionForm, setDecisionForm] = useState({
    title: '', decision_type: 'suspension', target_type: 'specific',
    target_user_ids: [] as string[], notes: '', from_date: '', to_date: '',
  })
  const [appealText, setAppealText]     = useState('')
  const [requestFiles, setRequestFiles] = useState<File[]>([])
  const [appealFiles, setAppealFiles]   = useState<File[]>([])
  const requestFileRef = useRef<HTMLInputElement>(null)
  const appealFileRef  = useRef<HTMLInputElement>(null)
  const [submitError, setSubmitError]   = useState('')
  const [saving, setSaving]             = useState(false)

  // ── New state ──
  const [mainTab, setMainTab] = useState<'leaves' | 'absences' | 'report'>('leaves')

  // Absences
  const [absences, setAbsences]         = useState<any[]>([])
  const [showAbsenceForm, setShowAbsenceForm] = useState(false)
  const [absenceForm, setAbsenceForm] = useState({
    user_id: '', absence_type: 'excused', from_date: '', to_date: '',
    reason: '', notes: '', apply_to: 'all', specific_event_ids: [] as string[],
  })
  const [absenceFiles, setAbsenceFiles]   = useState<File[]>([])
  const absenceFileRef = useRef<HTMLInputElement>(null)
  const [rangeEvents, setRangeEvents]     = useState<any[]>([])
  const [loadingRangeEvents, setLoadingRangeEvents] = useState(false)
  const [confirmDeleteAbsence, setConfirmDeleteAbsence] = useState<any>(null)

  // Admin grant leave
  const [showAdminGrant, setShowAdminGrant] = useState(false)
  const [adminGrantForm, setAdminGrantForm] = useState({
    leave_type: 'rest', target_type: 'specific' as 'specific' | 'all',
    target_user_ids: [] as string[],
    from_date: '', to_date: '', apply_to: 'all', reason: '', note: '',
  })
  const setGrant = (k: string, v: any) => setAdminGrantForm(p => ({ ...p, [k]: v }))

  // Report
  const [reportFilters, setReportFilters] = useState({
    from: '', to: '', role: '', userId: '', onlyAbsences: false, onlyLeaves: false,
  })
  const [reportSort, setReportSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: '', dir: 'desc' })

  // ── Helpers ──
  const set        = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setDecision = (k: string, v: any)  => setDecisionForm(p => ({ ...p, [k]: v }))
  const setAbs     = (k: string, v: any)   => setAbsenceForm(p => ({ ...p, [k]: v }))

  // ── Effects ──
  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getMyRole(teamId, user.id),
      permissionService.getUserPermissions(teamId, user.id),
    ]).then(([role, perms]) => { setMyRole(role || ''); setMyPerms(perms) })
    load()
  }, [teamId, user])

  // Load range events when specific mode + dates selected
  useEffect(() => {
    if (absenceForm.apply_to !== 'specific' || !absenceForm.from_date || !absenceForm.to_date || !teamId) {
      setRangeEvents([]); return
    }
    setLoadingRangeEvents(true)
    eventService.getTeamEvents(teamId).then((evs: any[]) => {
      setRangeEvents(
        evs.filter((ev: any) => {
          const d = ev.start_datetime?.slice(0, 10)
          return d >= absenceForm.from_date && d <= absenceForm.to_date
        }).sort((a: any, b: any) => a.start_datetime.localeCompare(b.start_datetime))
      )
      setLoadingRangeEvents(false)
    })
  }, [absenceForm.apply_to, absenceForm.from_date, absenceForm.to_date, teamId])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [l, d, m, abs] = await Promise.all([
      leaveService.getAll(teamId),
      adminDecisionService.getAll(teamId),
      teamService.getMembers(teamId),
      absenceService.getAll(teamId),
    ])
    setLeaves(l); setDecisions(d); setMembers(m); setAbsences(abs)
    setLoading(false)
  }

  // ── Existing leave functions (unchanged) ─────────────────────────
  async function uploadLeaveFiles(files: File[], folder: 'request' | 'appeal'): Promise<string | null | false> {
    if (!files.length || !teamId || !user) return null
    const urls: string[] = []
    for (const file of files) {
      const path = `${teamId}/leaves/${folder}/${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`
      const { url, error } = await medicalService.uploadAttachment(file, path)
      if (error || !url) { setSubmitError('فشل رفع المرفق: ' + (error || 'خطأ غير معروف')); return false }
      urls.push(url)
    }
    return urls.length === 1 ? urls[0] : JSON.stringify(urls)
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
    setShowReq(false); setForm({ reason: '', leave_type: 'other', from_date: '', to_date: '', note: '' })
    setRequestFiles([]); setSaving(false)
  }

  async function submitAdminDecision() {
    if (!teamId || !user || !decisionForm.title.trim() || !decisionForm.from_date || !decisionForm.to_date) return
    if (decisionForm.target_type === 'specific' && decisionForm.target_user_ids.length === 0) return
    setSaving(true); setSubmitError('')
    const payload = {
      team_id: teamId,
      title: decisionForm.title.trim(),
      decision_type: decisionForm.decision_type,
      target_type: decisionForm.target_type,
      target_user_ids: decisionForm.target_type === 'all' ? [] : decisionForm.target_user_ids,
      notes: decisionForm.notes.trim() || null,
      from_date: decisionForm.from_date,
      to_date: decisionForm.to_date,
      created_by: user.id,
      is_active: true,
    }
    const { error } = await adminDecisionService.create(payload)
    if (error) { setSubmitError('حدث خطأ أثناء حفظ القرار'); setSaving(false); return }
    const notifyTitle = `قرار إداري: ${payload.title}`
    const notifyBody  = `${LEAVE_TYPE_LABEL[payload.decision_type] || 'أخرى'} - من ${payload.from_date} إلى ${payload.to_date}`
    if (payload.target_type === 'all') {
      await notificationService.createForTeam(teamId, notifyTitle, notifyBody, 'leave', user.id)
    } else {
      await Promise.all(payload.target_user_ids.map((tid: string) =>
        notificationService.create({ user_id: tid, team_id: teamId, title: notifyTitle, body: notifyBody, type: 'leave', is_read: false })
      ))
    }
    await load()
    setShowDecision(false)
    setDecisionForm({ title: '', decision_type: 'suspension', target_type: 'specific', target_user_ids: [], notes: '', from_date: '', to_date: '' })
    setSaving(false)
  }

  const getDays = (from: string, to: string) => {
    try { return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(d => format(d, 'yyyy-MM-dd')) }
    catch { return [] }
  }

  async function syncLeaveAttendance(leaf: any, days: string[], status: string) {
    if (!teamId || !user) return
    // حذف سجلات الغياب المرتبطة بهذه الإجازة أولاً
    await attendanceService.removeExcusedBySource('leave', leaf.id)
    if (status === 'approved' || status === 'partial') {
      // جلب الأحداث على الأيام المعتمدة فقط
      const allEvents = await eventService.getTeamEvents(teamId)
      const daySet = new Set(days)
      const specificEventIds = allEvents
        .filter((ev: any) => daySet.has(ev.start_datetime.slice(0, 10)))
        .map((ev: any) => ev.id)
      if (specificEventIds.length) {
        await attendanceService.applyExcusedAbsence({
          teamId,
          userIds: [leaf.user_id],
          fromDate: days[0] || leaf.from_date,
          toDate: days[days.length - 1] || leaf.to_date,
          specificEventIds,
          absenceType: 'leave',
          sourceType: 'leave',
          sourceId: leaf.id,
          reason: LEAVE_TYPE_LABEL[leaf.leave_type] || leaf.reason || 'إجازة معتمدة',
          markedBy: user.id,
        })
      }
    }
  }

  async function approveLeave(leaf: any) {
    if (!teamId || !user) return
    setSaving(true)
    const days   = approveMode === 'full' ? getDays(leaf.from_date, leaf.to_date) : partialDays
    const status = approveMode === 'full' ? 'approved' : 'partial'
    const note   = decisionNote.trim() || (approveMode === 'full' ? `موافقة كاملة: ${formatDayList(days)}` : `موافقة جزئية: ${formatDayList(days)}`)
    await leaveService.update(leaf.id, { status, note, partial_days: days, reviewed_by: user.id })
    await syncLeaveAttendance(leaf, days, status)
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: approveMode === 'full' ? 'تمت الموافقة على إجازتك كاملة' : `موافقة جزئية (${days.length} أيام)`,
      body: `${leaf.reason} - الأيام المعتمدة: ${formatDayList(days)}`, type: 'leave', is_read: false,
    })
    await load(); setShowApprove(null); setDecisionNote(''); setSaving(false)
  }

  async function rejectLeave(leaf: any) {
    if (!user) return
    await leaveService.update(leaf.id, { status: 'rejected', note: decisionNote.trim() || 'تم رفض الطلب', reviewed_by: user.id })
    await syncLeaveAttendance(leaf, [], 'rejected')
    await notificationService.create({
      user_id: leaf.user_id, team_id: teamId,
      title: 'تم رفض طلب إجازتك', body: leaf.reason, type: 'leave', is_read: false,
    })
    await load(); setShowApprove(null); setDecisionNote('')
  }

  async function submitAppeal() {
    if (!showAppeal || !teamId || !user || !appealText.trim()) return
    setSaving(true); setSubmitError('')
    const appeal_attachment_url = await uploadLeaveFiles(appealFiles, 'appeal')
    if (appeal_attachment_url === false) { setSaving(false); return }
    await leaveService.update(showAppeal.id, { appeal_text: appealText, appeal_attachment_url, appealed_at: new Date().toISOString() })
    await notificationService.createForTeam(teamId,
      `رد مطالبة على إجازة من ${profile?.full_name || user.email}`,
      appealText, 'leave', user.id)
    await load(); setShowAppeal(null); setAppealText(''); setAppealFiles([]); setSaving(false)
  }

  // ── New absence functions ─────────────────────────────────────────
  const APPLY_TO_EVENT_TYPES: Record<string, string[] | null> = {
    match_only:           ['match'],
    training_only:        ['training'],
    meeting_only:         ['meeting'],
    all:                  null,
    match_training:       ['match', 'training'],
    training_meeting:     ['training', 'meeting'],
    match_training_meeting: ['match', 'training', 'meeting'],
    specific:             null,
  }

  async function submitAbsence() {
    if (!teamId || !user || !absenceForm.user_id || !absenceForm.from_date || !absenceForm.to_date) return
    setSaving(true); setSubmitError('')
    let attachment_url: string | null = null
    if (absenceFiles.length) {
      const res = await uploadLeaveFiles(absenceFiles, 'request')
      if (res === false) { setSaving(false); return }
      attachment_url = res
    }
    const payload = {
      team_id: teamId,
      user_id: absenceForm.user_id,
      absence_type: absenceForm.absence_type,
      from_date: absenceForm.from_date,
      to_date: absenceForm.to_date,
      reason: absenceForm.reason.trim() || null,
      notes: absenceForm.notes.trim() || null,
      attachment_url,
      apply_to: absenceForm.apply_to,
      specific_event_ids: absenceForm.apply_to === 'specific' ? absenceForm.specific_event_ids : [],
      recorded_by: user.id,
    }
    const { data: absenceRecord, error } = await absenceService.create(payload)
    if (error || !absenceRecord) { setSubmitError('حدث خطأ أثناء الحفظ'); setSaving(false); return }

    // كتابة على جدول attendance
    const eventTypes = APPLY_TO_EVENT_TYPES[absenceForm.apply_to]
    await attendanceService.applyExcusedAbsence({
      teamId,
      userIds: [absenceForm.user_id],
      fromDate: absenceForm.from_date,
      toDate: absenceForm.to_date,
      eventTypes: eventTypes ?? undefined,
      specificEventIds: absenceForm.apply_to === 'specific' ? absenceForm.specific_event_ids : undefined,
      absenceType: absenceForm.absence_type,
      sourceType: 'absence',
      sourceId: absenceRecord.id,
      reason: absenceForm.reason.trim() || ABSENCE_TYPE_LABEL[absenceForm.absence_type] || 'غياب بعذر',
      markedBy: user.id,
    })

    await load()
    setShowAbsenceForm(false)
    setAbsenceForm({ user_id: '', absence_type: 'excused', from_date: '', to_date: '', reason: '', notes: '', apply_to: 'all', specific_event_ids: [] })
    setAbsenceFiles([]); setSaving(false)
  }

  async function deleteAbsence(id: string) {
    await attendanceService.removeExcusedBySource('absence', id)
    await absenceService.remove(id)
    setAbsences(prev => prev.filter(a => a.id !== id))
    setConfirmDeleteAbsence(null)
  }

  async function submitAdminGrantLeave() {
    if (!teamId || !user || !adminGrantForm.from_date || !adminGrantForm.to_date) return
    const targetIds = adminGrantForm.target_type === 'all'
      ? members.filter(m => !['parent', 'guest'].includes(m.role)).map(m => m.user_id)
      : adminGrantForm.target_user_ids
    if (!targetIds.length) return
    setSaving(true); setSubmitError('')
    const eventTypes = APPLY_TO_EVENT_TYPES[adminGrantForm.apply_to]
    for (const uid of targetIds) {
      const { data: leaveRecord, error } = await leaveService.create({
        team_id: teamId, user_id: uid,
        leave_type: adminGrantForm.leave_type,
        reason: adminGrantForm.reason.trim() || LEAVE_TYPE_LABEL[adminGrantForm.leave_type] || 'إجازة إدارية',
        note: adminGrantForm.note.trim() || 'منح إداري مباشر',
        from_date: adminGrantForm.from_date, to_date: adminGrantForm.to_date,
        status: 'approved', reviewed_by: user.id, partial_days: [],
      })
      if (error || !leaveRecord) continue
      await attendanceService.applyExcusedAbsence({
        teamId, userIds: [uid],
        fromDate: adminGrantForm.from_date, toDate: adminGrantForm.to_date,
        eventTypes: eventTypes ?? undefined,
        absenceType: 'leave', sourceType: 'leave', sourceId: leaveRecord.id,
        reason: adminGrantForm.reason.trim() || LEAVE_TYPE_LABEL[adminGrantForm.leave_type] || 'إجازة إدارية',
        markedBy: user.id,
      })
    }
    if (adminGrantForm.target_type === 'all') {
      await notificationService.createForTeam(teamId,
        'منحت إجازة إدارية لكامل الفريق',
        `${adminGrantForm.from_date} ← ${adminGrantForm.to_date}`, 'leave', user.id)
    } else {
      await Promise.all(targetIds.map(uid =>
        notificationService.create({
          user_id: uid, team_id: teamId,
          title: 'تم منحك إجازة إدارية',
          body: `${adminGrantForm.from_date} ← ${adminGrantForm.to_date} — ${LEAVE_TYPE_LABEL[adminGrantForm.leave_type] || 'إجازة'}`,
          type: 'leave', is_read: false,
        })
      ))
    }
    await load()
    setShowAdminGrant(false)
    setAdminGrantForm({ leave_type: 'rest', target_type: 'specific', target_user_ids: [], from_date: '', to_date: '', apply_to: 'all', reason: '', note: '' })
    setSaving(false)
  }

  // ── Access ────────────────────────────────────────────────────────
  const isAdmin         = canManageTeam(myRole)
  const canManageLeaves = isAdmin || myPerms.includes('manage_leaves')

  // ── Leaves computed ───────────────────────────────────────────────
  const pendingCount    = leaves.filter(l => l.status === 'pending').length
  const filtered        = tab === 'all' ? leaves : leaves.filter(l => l.status === tab)
  const approvedLeaves  = leaves.filter(l => l.status === 'approved' || l.status === 'partial')
  const myOwnLeaves     = leaves.filter(l => l.user_id === user?.id)
  const myPending       = myOwnLeaves.filter(l => l.status === 'pending')
  const playerMembers   = members.filter(m => m.role === 'player')
  const relevantDecisions = decisions.filter(d =>
    d.target_type === 'all' || (user && d.target_user_ids?.includes(user.id))
  )

  // ── Style maps ────────────────────────────────────────────────────
  const statusStyle:  Record<string, string> = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', partial: 'bg-blue-100 text-blue-700' }
  const statusLabel:  Record<string, string> = { pending: 'معلق', approved: 'مقبول', rejected: 'مرفوض', partial: 'جزئي' }
  const statusIcon:   Record<string, string> = { pending: '⏳', approved: '✅', rejected: '❌', partial: '✂️' }
  const statusBorder: Record<string, string> = { pending: 'border-r-4 border-amber-400', approved: 'border-r-4 border-emerald-400', rejected: 'border-r-4 border-red-400', partial: 'border-r-4 border-blue-400' }
  const decisionTypeLabel = LEAVE_TYPE_LABEL
  const decisionTypeStyle: Record<string, string> = {
    suspension: 'bg-red-100 text-red-700', national_team: 'bg-sky-100 text-sky-700',
    penalty: 'bg-orange-100 text-orange-700',
    rest: 'bg-emerald-100 text-emerald-700', emergency: 'bg-amber-100 text-amber-700',
    death: 'bg-slate-200 text-slate-800', marriage: 'bg-pink-100 text-pink-700',
    academic: 'bg-purple-100 text-purple-700', family: 'bg-teal-100 text-teal-700',
    private_event: 'bg-fuchsia-100 text-fuchsia-700',
    other: 'bg-slate-100 text-slate-700',
  }

  function approvedDaysText(l: any) {
    if (l.status === 'approved') return `الأيام المعتمدة: ${formatDayList(getDays(l.from_date, l.to_date))}`
    if (l.status === 'partial' && l.partial_days?.length) return `الأيام المعتمدة: ${formatDayList(l.partial_days)}`
    return ''
  }

  // ── Report data ───────────────────────────────────────────────────
  const EXCLUDE_ROLES = ['parent', 'guest']
  const reportMembers = members.filter(m => !EXCLUDE_ROLES.includes(m.role))

  const rawReportData = reportMembers
    .filter(m => {
      if (reportFilters.userId && m.user_id !== reportFilters.userId) return false
      if (reportFilters.role && m.role !== reportFilters.role) return false
      const uid = m.user_id
      if (reportFilters.onlyLeaves && !leaves.some(l => l.user_id === uid)) return false
      if (reportFilters.onlyAbsences && !absences.some(a => a.user_id === uid)) return false
      return true
    })
    .map(m => {
      const uid = m.user_id
      const mLeaves = leaves.filter(l => l.user_id === uid &&
        (!reportFilters.from || l.from_date >= reportFilters.from) &&
        (!reportFilters.to   || l.to_date   <= reportFilters.to))
      const mAbs = absences.filter(a => a.user_id === uid &&
        (!reportFilters.from || a.from_date >= reportFilters.from) &&
        (!reportFilters.to   || a.to_date   <= reportFilters.to))

      const leaveDaysReq = mLeaves.reduce((s, l) => s + getDayCount(l.from_date, l.to_date), 0)
      const leaveDaysApp = mLeaves.reduce((s, l) => {
        if (l.status === 'approved') return s + getDayCount(l.from_date, l.to_date)
        if (l.status === 'partial' && l.partial_days?.length) return s + l.partial_days.length
        return s
      }, 0)
      const leaveDaysRej = mLeaves.filter(l => l.status === 'rejected').reduce((s, l) => s + getDayCount(l.from_date, l.to_date), 0)
      const lastLeave   = mLeaves.length ? mLeaves[0].created_at.slice(0, 10) : ''
      const lastAbsence = mAbs.length   ? mAbs[0].created_at.slice(0, 10) : ''

      return {
        userId: uid, name: m.profile?.full_name || '—',
        avatarUrl: m.profile?.avatar_url, role: m.role,
        leaveCount: mLeaves.length, leaveDaysReq, leaveDaysApp, leaveDaysRej,
        partialCount: mLeaves.filter(l => l.status === 'partial').length,
        absExcused:   mAbs.filter(a => a.absence_type === 'excused').length,
        absUnexcused: mAbs.filter(a => a.absence_type === 'unexcused').length,
        nationalTeam: mAbs.filter(a => a.absence_type === 'national_team').length,
        disciplinary: mAbs.filter(a => ['disciplinary', 'admin_suspension'].includes(a.absence_type)).length,
        yellowCards:  mAbs.filter(a => a.absence_type === 'yellow_cards').length,
        redCard:      mAbs.filter(a => a.absence_type === 'red_card').length,
        injury:       mAbs.filter(a => a.absence_type === 'injury').length,
        lastLeave, lastAbsence,
        totalAbs: mAbs.length,
      }
    })

  const sortedReportData = [...rawReportData].sort((a: any, b: any) => {
    if (!reportSort.col) return 0
    const av = a[reportSort.col], bv = b[reportSort.col]
    if (typeof av === 'number' && typeof bv === 'number')
      return reportSort.dir === 'asc' ? av - bv : bv - av
    return reportSort.dir === 'asc'
      ? String(av).localeCompare(String(bv), 'ar')
      : String(bv).localeCompare(String(av), 'ar')
  })

  function toggleSort(col: string) {
    setReportSort(p => p.col === col ? { col, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }

  function SortIcon({ col }: { col: string }) {
    if (reportSort.col !== col) return <ChevronDown size={11} className="text-slate-300 inline ml-0.5"/>
    return reportSort.dir === 'desc'
      ? <ChevronDown size={11} className="text-brand-500 inline ml-0.5"/>
      : <ChevronUp   size={11} className="text-brand-500 inline ml-0.5"/>
  }

  // ── Report summary stats ──────────────────────────────────────────
  const totalLeaveReqs  = rawReportData.reduce((s, r) => s + r.leaveCount, 0)
  const totalLeaveDays  = rawReportData.reduce((s, r) => s + r.leaveDaysReq, 0)
  const totalAppDays    = rawReportData.reduce((s, r) => s + r.leaveDaysApp, 0)
  const approvalRate    = totalLeaveDays > 0 ? Math.round((totalAppDays / totalLeaveDays) * 100) : 0
  const mostLeaveReqs   = [...rawReportData].sort((a, b) => b.leaveCount - a.leaveCount)[0]
  const mostLeaveApp    = [...rawReportData].sort((a, b) => b.leaveDaysApp - a.leaveDaysApp)[0]
  const mostExcused     = [...rawReportData].sort((a, b) => b.absExcused - a.absExcused)[0]
  const mostUnexcused   = [...rawReportData].sort((a, b) => b.absUnexcused - a.absUnexcused)[0]
  const absTypeCounts: Record<string, number> = {}
  absences.forEach(a => { absTypeCounts[a.absence_type] = (absTypeCounts[a.absence_type] || 0) + 1 })
  const mostCommonAbs = Object.entries(absTypeCounts).sort((a, b) => b[1] - a[1])[0]
  const totalNational  = rawReportData.reduce((s, r) => s + r.nationalTeam, 0)
  const totalDisc      = rawReportData.reduce((s, r) => s + r.disciplinary, 0)
  const totalCards     = rawReportData.reduce((s, r) => s + r.yellowCards + r.redCard, 0)

  // ── Inner components ─────────────────────────────────────────────
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
    files: File[]; setFiles: React.Dispatch<React.SetStateAction<File[]>>; inputRef: React.RefObject<HTMLInputElement>
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

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── Header ── */}
      <PageHeader title="الإجازات والمعتذرات"
        action={
          <div className="flex gap-2">
            {mainTab === 'leaves' && (
              <>
                {isAdmin && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/team/${teamId}/admin-decisions`)}>
                      <FileText size={14}/> صفحة القرارات
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => { setSubmitError(''); setShowDecision(true) }}>
                      <Gavel size={14}/> قرار إداري
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSubmitError(''); setShowAdminGrant(true) }}>
                      <ShieldCheck size={14}/> منح إجازة
                    </button>
                  </>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setShowReq(true)}>
                  <Plus size={14}/> طلب إجازة
                </button>
              </>
            )}
            {mainTab === 'absences' && canManageLeaves && (
              <button className="btn btn-primary btn-sm" onClick={() => { setSubmitError(''); setShowAbsenceForm(true) }}>
                <Plus size={14}/> تسجيل غياب
              </button>
            )}
          </div>
        }/>

      {/* ── Main tabs ── */}
      <div className="mb-4">
        <Tabs
          tabs={[
            { key: 'leaves',   label: 'الإجازات' },
            { key: 'absences', label: 'الغيابات' },
            ...(canManageLeaves ? [{ key: 'report', label: 'الكشف' }] : []),
          ]}
          active={mainTab}
          onChange={v => setMainTab(v as any)}
        />
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner/></div>}

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: الإجازات
      ═══════════════════════════════════════════════════════════ */}
      {!loading && mainTab === 'leaves' && (
        <>
          {/* ── Member view ── */}
          {!canManageLeaves && (
            <div>
              {myPending.length > 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0"/>
                  <p className="text-sm font-bold text-amber-700">طلب إجازتك قيد المراجعة</p>
                  <div className="text-xs text-amber-600 mr-auto">{myPending[0].from_date} ← {myPending[0].to_date}</div>
                </div>
              )}
              {relevantDecisions.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">قرارات إدارية</p>
                  <div className="space-y-2">
                    {relevantDecisions.map(d => (
                      <div key={d.id} className="card mb-0 py-3 border-r-4 border-red-400">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"><Gavel size={17}/></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-extrabold text-sm text-slate-800">{d.title}</div>
                              <span className={`badge text-xs ${decisionTypeStyle[d.decision_type] || decisionTypeStyle.other}`}>{decisionTypeLabel[d.decision_type] || 'أخرى'}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{d.from_date} ← {d.to_date}</div>
                            {d.notes && <div className="text-xs text-slate-500 mt-1">{d.notes}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                          </div>
                          <span className={`badge text-xs ${statusStyle[l.status]}`}>{statusLabel[l.status]}</span>
                        </div>
                        <button className="btn btn-ghost btn-sm mt-2" onClick={() => { setShowAppeal(l); setAppealText(l.appeal_text || ''); setAppealFiles([]) }}>
                          رفع رد مطالبة
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">الإجازات المعتمدة ({approvedLeaves.length})</p>
              {approvedLeaves.length === 0
                ? <div className="card"><EmptyState icon={<Umbrella size={28}/>} title="لا توجد إجازات معتمدة حالياً"/></div>
                : <div className="space-y-3">
                    {approvedLeaves.map(l => (
                      <div key={l.id} className="card mb-0 border-r-4 border-brand-400 flex items-center gap-4">
                        <Avatar name={l.profile?.full_name || '?'} src={l.profile?.avatar_url} size="lg"/>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-slate-800 text-sm">{l.profile?.full_name}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-xs font-bold text-brand-700">{l.from_date}</span>
                            <span className="text-xs text-slate-400">←</span>
                            <span className="text-xs font-bold text-brand-700">{l.to_date}</span>
                          </div>
                          {approvedDaysText(l) && <div className="text-xs text-blue-600 font-bold mt-1">{approvedDaysText(l)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          )}

          {/* ── Admin view ── */}
          {canManageLeaves && (
            <div>
              {isAdmin && pendingCount > 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">⏳</div>
                  <p className="text-sm font-bold text-amber-700">{pendingCount} طلب إجازة بانتظار مراجعتك</p>
                  <button onClick={() => setTab('pending')} className="btn btn-sm mr-auto text-amber-700 border-amber-300 hover:bg-amber-100 bg-white">عرض</button>
                </div>
              )}
              {decisions.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">القرارات الإدارية ({decisions.length})</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {decisions.slice(0, 4).map(d => (
                      <div key={d.id} className="card mb-0 border-r-4 border-red-400">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"><Gavel size={18}/></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-extrabold text-sm text-slate-800 truncate">{d.title}</div>
                              <span className={`badge text-xs ${decisionTypeStyle[d.decision_type] || decisionTypeStyle.other}`}>{decisionTypeLabel[d.decision_type] || 'أخرى'}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{d.from_date} ← {d.to_date}</div>
                            <div className="text-xs text-slate-400 mt-1">{d.target_type === 'all' ? 'كامل الفريق' : `${d.target_user_ids?.length || 0} محدد`}</div>
                            {d.notes && <div className="text-xs text-slate-500 mt-2 line-clamp-2">{d.notes}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Tabs
                tabs={[
                  { key: 'all',      label: 'الكل' },
                  { key: 'pending',  label: 'معلقة',   badge: pendingCount || undefined },
                  { key: 'approved', label: 'مقبولة' },
                  { key: 'partial',  label: 'جزئية' },
                  { key: 'rejected', label: 'مرفوضة' },
                ]}
                active={tab} onChange={setTab}/>
              {filtered.length === 0
                ? <div className="card"><EmptyState icon={<Umbrella size={28}/>} title="لا توجد طلبات"/></div>
                : <div className="space-y-3">
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
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => {
                                setShowApprove(l)
                                setApproveMode(l.status === 'partial' ? 'partial' : 'full')
                                setPartialDays(l.partial_days?.length ? l.partial_days : [])
                                setDecisionNote(l.note || '')
                              }} className="btn btn-primary btn-sm">مراجعة الطلب</button>
                              {l.user_id === user?.id && l.status !== 'pending' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAppeal(l); setAppealText(l.appeal_text || ''); setAppealFiles([]) }}>
                                  رفع رد مطالبة
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 2: الغيابات
      ═══════════════════════════════════════════════════════════ */}
      {!loading && mainTab === 'absences' && (
        <div>
          {/* My own absences (member) */}
          {!canManageLeaves && (
            <>
              {absences.filter(a => a.user_id === user?.id).length === 0
                ? <div className="card"><EmptyState icon={<CalendarOff size={28}/>} title="لا توجد غيابات مسجلة عليك"/></div>
                : <div className="space-y-3">
                    {absences.filter(a => a.user_id === user?.id).map(a => (
                      <div key={a.id} className="card mb-0 border-r-4 border-slate-300">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-lg flex-shrink-0">
                            <UserX size={18} className="text-slate-500"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`badge text-xs ${ABSENCE_TYPE_STYLE[a.absence_type] || ABSENCE_TYPE_STYLE.other}`}>
                                {ABSENCE_TYPE_LABEL[a.absence_type] || 'أخرى'}
                              </span>
                              <span className="text-xs text-slate-400">{a.from_date} ← {a.to_date}</span>
                            </div>
                            {a.reason && <div className="text-xs text-slate-600">{a.reason}</div>}
                            <div className="text-xs text-slate-400 mt-1">
                              يؤثر على: <span className="font-bold">{APPLY_TO_LABEL[a.apply_to] || a.apply_to}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>}
            </>
          )}

          {/* Admin view */}
          {canManageLeaves && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="card mb-0 text-center py-3">
                  <div className="text-2xl font-black text-slate-800">{absences.length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">إجمالي الغيابات</div>
                </div>
                <div className="card mb-0 text-center py-3">
                  <div className="text-2xl font-black text-red-600">{absences.filter(a => a.absence_type === 'unexcused').length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">بدون عذر</div>
                </div>
                <div className="card mb-0 text-center py-3">
                  <div className="text-2xl font-black text-sky-600">{absences.filter(a => a.absence_type === 'national_team').length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">استدعاء منتخب</div>
                </div>
              </div>

              {absences.length === 0
                ? <div className="card"><EmptyState icon={<CalendarOff size={28}/>} title="لا توجد غيابات مسجلة" description="اضغط «تسجيل غياب» لإضافة قرار غياب"/></div>
                : <div className="space-y-3">
                    {absences.map(a => {
                      const mem = members.find(m => m.user_id === a.user_id)
                      return (
                        <div key={a.id} className="card mb-0 border-r-4 border-slate-200">
                          <div className="flex items-start gap-3">
                            <Avatar name={a.profile?.full_name || '?'} src={a.profile?.avatar_url} size="md"/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                <div className="font-extrabold text-sm text-slate-800">{a.profile?.full_name}</div>
                                <span className={`badge text-xs ${ABSENCE_TYPE_STYLE[a.absence_type] || ABSENCE_TYPE_STYLE.other}`}>
                                  {ABSENCE_TYPE_LABEL[a.absence_type] || 'أخرى'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 mb-2 inline-flex">
                                <span className="text-xs text-slate-500">📅</span>
                                <span className="text-xs font-bold text-slate-600">{a.from_date}</span>
                                <span className="text-xs text-slate-400">←</span>
                                <span className="text-xs font-bold text-slate-600">{a.to_date}</span>
                                <span className="text-xs text-slate-400 mr-1">({getDayCount(a.from_date, a.to_date)} يوم)</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                يؤثر على: <span className="font-bold text-brand-600">{APPLY_TO_LABEL[a.apply_to] || a.apply_to}</span>
                                {a.apply_to === 'specific' && a.specific_event_ids?.length > 0 &&
                                  <span className="text-slate-400"> ({a.specific_event_ids.length} موعد)</span>}
                              </div>
                              {a.reason && <div className="text-xs text-slate-500 mt-1">السبب: {a.reason}</div>}
                              {a.notes && <div className="text-xs text-slate-400 mt-0.5">{a.notes}</div>}
                              {a.recorder && <div className="text-xs text-slate-400 mt-1">سجّله: {a.recorder.full_name}</div>}
                              <AttachmentLinks url={a.attachment_url}/>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => setConfirmDeleteAbsence(a)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                                <X size={14}/>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 3: الكشف
      ═══════════════════════════════════════════════════════════ */}
      {!loading && mainTab === 'report' && canManageLeaves && (
        <div>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="card mb-0 py-3 text-center">
              <div className="text-2xl font-black text-slate-800">{totalLeaveReqs}</div>
              <div className="text-xs text-slate-400 mt-0.5">إجمالي طلبات الإجازة</div>
            </div>
            <div className="card mb-0 py-3 text-center">
              <div className="text-2xl font-black text-brand-600">{totalAppDays}</div>
              <div className="text-xs text-slate-400 mt-0.5">أيام إجازة مقبولة</div>
            </div>
            <div className="card mb-0 py-3 text-center">
              <div className="text-2xl font-black text-emerald-600">{approvalRate}%</div>
              <div className="text-xs text-slate-400 mt-0.5">نسبة القبول</div>
            </div>
            <div className="card mb-0 py-3 text-center">
              <div className="text-2xl font-black text-rose-600">{absences.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">إجمالي الغيابات</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {mostLeaveReqs && mostLeaveReqs.leaveCount > 0 && (
              <div className="card mb-0 py-2.5 flex items-center gap-2">
                <Avatar name={mostLeaveReqs.name} src={mostLeaveReqs.avatarUrl} size="sm"/>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400">أكثر طلبات إجازة</div>
                  <div className="text-xs font-bold text-slate-700 truncate">{mostLeaveReqs.name}</div>
                  <div className="text-[10px] text-brand-600">{mostLeaveReqs.leaveCount} طلب</div>
                </div>
              </div>
            )}
            {mostExcused && mostExcused.absExcused > 0 && (
              <div className="card mb-0 py-2.5 flex items-center gap-2">
                <Avatar name={mostExcused.name} src={mostExcused.avatarUrl} size="sm"/>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400">أكثر غياب بعذر</div>
                  <div className="text-xs font-bold text-slate-700 truncate">{mostExcused.name}</div>
                  <div className="text-[10px] text-blue-600">{mostExcused.absExcused} مرة</div>
                </div>
              </div>
            )}
            {mostUnexcused && mostUnexcused.absUnexcused > 0 && (
              <div className="card mb-0 py-2.5 flex items-center gap-2">
                <Avatar name={mostUnexcused.name} src={mostUnexcused.avatarUrl} size="sm"/>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400">أكثر غياب بدون عذر</div>
                  <div className="text-xs font-bold text-slate-700 truncate">{mostUnexcused.name}</div>
                  <div className="text-[10px] text-red-600">{mostUnexcused.absUnexcused} مرة</div>
                </div>
              </div>
            )}
            {mostCommonAbs && (
              <div className="card mb-0 py-2.5 text-center">
                <div className="text-[10px] text-slate-400 mb-1">أكثر سبب غياب</div>
                <span className={`badge text-xs ${ABSENCE_TYPE_STYLE[mostCommonAbs[0]] || ABSENCE_TYPE_STYLE.other}`}>
                  {ABSENCE_TYPE_LABEL[mostCommonAbs[0]] || mostCommonAbs[0]}
                </span>
                <div className="text-[10px] text-slate-400 mt-1">{mostCommonAbs[1]} مرة</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="card mb-0 py-2.5 text-center">
              <div className="text-xl font-black text-sky-600">{totalNational}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">استدعاء منتخب</div>
            </div>
            <div className="card mb-0 py-2.5 text-center">
              <div className="text-xl font-black text-orange-600">{totalDisc}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">إيقافات انضباطية</div>
            </div>
            <div className="card mb-0 py-2.5 text-center">
              <div className="text-xl font-black text-yellow-600">{totalCards}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">إيقافات بالبطاقات</div>
            </div>
          </div>

          {/* Filters */}
          <div className="card mb-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={14} className="text-slate-400"/>
              <span className="text-xs font-bold text-slate-500">فلاتر الكشف</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">من تاريخ</label>
                <input type="date" className="form-input text-xs"
                  value={reportFilters.from} onChange={e => setReportFilters(p => ({ ...p, from: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">إلى تاريخ</label>
                <input type="date" className="form-input text-xs"
                  value={reportFilters.to} onChange={e => setReportFilters(p => ({ ...p, to: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">الدور</label>
                <select className="form-input text-xs" value={reportFilters.role}
                  onChange={e => setReportFilters(p => ({ ...p, role: e.target.value }))}>
                  <option value="">الكل</option>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">الشخص</label>
                <select className="form-input text-xs" value={reportFilters.userId}
                  onChange={e => setReportFilters(p => ({ ...p, userId: e.target.value }))}>
                  <option value="">الكل</option>
                  {reportMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={reportFilters.onlyLeaves}
                    onChange={e => setReportFilters(p => ({ ...p, onlyLeaves: e.target.checked }))}
                    className="w-4 h-4 accent-brand-500"/>
                  <span className="text-xs text-slate-600">فقط من لديهم إجازات</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={reportFilters.onlyAbsences}
                    onChange={e => setReportFilters(p => ({ ...p, onlyAbsences: e.target.checked }))}
                    className="w-4 h-4 accent-brand-500"/>
                  <span className="text-xs text-slate-600">فقط من لديهم غيابات</span>
                </label>
                <button className="btn btn-ghost btn-sm text-slate-400 mr-auto"
                  onClick={() => setReportFilters({ from: '', to: '', role: '', userId: '', onlyAbsences: false, onlyLeaves: false })}>
                  مسح الفلاتر
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-right px-3 py-2.5 font-bold text-slate-500">#</th>
                    <th className="text-right px-3 py-2.5 font-bold text-slate-500">الاسم</th>
                    <th className="text-right px-3 py-2.5 font-bold text-slate-500">الدور</th>
                    {[
                      { col: 'leaveCount',    label: 'طلبات' },
                      { col: 'leaveDaysReq',  label: 'أيام مطلوبة' },
                      { col: 'leaveDaysApp',  label: 'أيام مقبولة' },
                      { col: 'leaveDaysRej',  label: 'أيام مرفوضة' },
                      { col: 'partialCount',  label: 'جزئية' },
                      { col: 'absExcused',    label: 'غ. بعذر' },
                      { col: 'absUnexcused',  label: 'غ. بدون عذر' },
                      { col: 'nationalTeam',  label: 'منتخب' },
                      { col: 'disciplinary',  label: 'إيقاف' },
                      { col: 'yellowCards',   label: '🟡 بطاقات' },
                      { col: 'redCard',       label: '🔴 بطاقة' },
                      { col: 'injury',        label: 'إصابة' },
                      { col: 'lastLeave',     label: 'آخر إجازة' },
                      { col: 'lastAbsence',   label: 'آخر غياب' },
                    ].map(({ col, label }) => (
                      <th key={col} className="text-right px-3 py-2.5 font-bold text-slate-500 cursor-pointer hover:text-brand-600 whitespace-nowrap"
                        onClick={() => toggleSort(col)}>
                        {label} <SortIcon col={col}/>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedReportData.length === 0 ? (
                    <tr><td colSpan={18} className="text-center py-8 text-slate-400">لا توجد بيانات</td></tr>
                  ) : sortedReportData.map((r, idx) => (
                    <tr key={r.userId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.name} src={r.avatarUrl} size="sm"/>
                          <span className="font-bold text-slate-700 whitespace-nowrap">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{ROLE_LABEL[r.role] || r.role}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-700">{r.leaveCount || '—'}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{r.leaveDaysReq || '—'}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-600">{r.leaveDaysApp || '—'}</td>
                      <td className="px-3 py-2 text-center text-red-500">{r.leaveDaysRej || '—'}</td>
                      <td className="px-3 py-2 text-center text-blue-500">{r.partialCount || '—'}</td>
                      <td className="px-3 py-2 text-center text-blue-600">{r.absExcused || '—'}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-600">{r.absUnexcused || '—'}</td>
                      <td className="px-3 py-2 text-center text-sky-600">{r.nationalTeam || '—'}</td>
                      <td className="px-3 py-2 text-center text-orange-600">{r.disciplinary || '—'}</td>
                      <td className="px-3 py-2 text-center text-yellow-600">{r.yellowCards || '—'}</td>
                      <td className="px-3 py-2 text-center text-red-700">{r.redCard || '—'}</td>
                      <td className="px-3 py-2 text-center text-rose-600">{r.injury || '—'}</td>
                      <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{r.lastLeave || '—'}</td>
                      <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{r.lastAbsence || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODALS (existing unchanged)
      ═══════════════════════════════════════════════════════════ */}

      {/* Request leave */}
      <Modal open={showReq} onClose={() => { setShowReq(false); setSubmitError('') }} title="طلب إجازة">
        <FormField label="تصنيف العذر" required>
          <select className="form-input" value={form.leave_type} onChange={e => set('leave_type', e.target.value)}>
            <option value="national_team">استدعاء للمنتخب</option>
            <option value="death">حالة وفاة</option>
            <option value="marriage">زواج</option>
            <option value="academic">دراسة</option>
            <option value="family">عائلي</option>
            <option value="private_event">مناسبة خاصة</option>
            <option value="penalty">عقوبة</option>
            <option value="emergency">طارئ</option>
            <option value="other">أخرى</option>
          </select>
        </FormField>
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

      {/* Admin decision */}
      <Modal open={showDecision} onClose={() => { setShowDecision(false); setSubmitError('') }} title="قرار إداري جديد">
        <FormField label="عنوان القرار" required>
          <input className="form-input" value={decisionForm.title} onChange={e => setDecision('title', e.target.value)} placeholder="مثال: إيقاف عن التمارين"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="نوع القرار" required>
            <select className="form-input" value={decisionForm.decision_type} onChange={e => setDecision('decision_type', e.target.value)}>
              <option value="suspension">إيقاف</option>
              <option value="national_team">استدعاء للمنتخب</option>
              <option value="death">حالة وفاة</option>
              <option value="marriage">زواج</option>
              <option value="academic">دراسة</option>
              <option value="family">عائلي</option>
              <option value="private_event">مناسبة خاصة</option>
              <option value="penalty">عقوبة</option>
              <option value="rest">راحة</option>
              <option value="emergency">طارئ</option>
              <option value="other">أخرى</option>
            </select>
          </FormField>
          <FormField label="المستهدف" required>
            <select className="form-input" value={decisionForm.target_type}
              onChange={e => setDecisionForm(p => ({ ...p, target_type: e.target.value, target_user_ids: e.target.value === 'all' ? [] : p.target_user_ids }))}>
              <option value="specific">لاعب أو مجموعة محددة</option>
              <option value="all">كامل الفريق</option>
            </select>
          </FormField>
        </div>
        {decisionForm.target_type === 'specific' && (
          <FormField label="اختر اللاعبين" required>
            <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
              {playerMembers.length === 0
                ? <div className="text-xs text-slate-400 py-4 text-center">لا يوجد لاعبون نشطون</div>
                : playerMembers.map(m => {
                    const checked = decisionForm.target_user_ids.includes(m.user_id)
                    return (
                      <label key={m.user_id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setDecisionForm(p => ({
                            ...p,
                            target_user_ids: e.target.checked ? [...p.target_user_ids, m.user_id] : p.target_user_ids.filter(id => id !== m.user_id)
                          }))} className="w-4 h-4 accent-red-500 flex-shrink-0"/>
                        <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm"/>
                        <span className="text-sm font-bold text-slate-700">{m.profile?.full_name || 'لاعب'}</span>
                      </label>
                    )
                  })}
            </div>
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ" required>
            <input className="form-input" type="date" value={decisionForm.from_date} onChange={e => setDecision('from_date', e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ" required>
            <input className="form-input" type="date" value={decisionForm.to_date} min={decisionForm.from_date || undefined} onChange={e => setDecision('to_date', e.target.value)}/>
          </FormField>
        </div>
        <FormField label="ملاحظات">
          <textarea className="form-input" rows={3} value={decisionForm.notes} onChange={e => setDecision('notes', e.target.value)} placeholder="تفاصيل القرار..."/>
        </FormField>
        <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs font-bold text-red-700">
          عند حفظ القرار سيتم تسجيل الغياب بعذر تلقائيًا لكل موعد داخل الفترة.
        </div>
        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2 mt-3">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowDecision(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitAdminDecision}
            disabled={saving || !decisionForm.title.trim() || !decisionForm.from_date || !decisionForm.to_date
              || decisionForm.from_date > decisionForm.to_date
              || (decisionForm.target_type === 'specific' && decisionForm.target_user_ids.length === 0)}>
            {saving ? <Spinner size="sm"/> : 'حفظ القرار'}
          </button>
        </div>
      </Modal>

      {/* Approve leave */}
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
                      className="btn btn-sm flex-1 justify-center" style={{ background: '#3b82f6', color: '#fff', opacity: (!partialRange.from || !partialRange.to) ? 0.5 : 1 }}>
                      تطبيق النطاق
                    </button>
                    {partialDays.length > 0 && (
                      <button onClick={() => setPartialDays([])} className="btn btn-ghost btn-sm text-red-500 border-red-200">مسح</button>
                    )}
                  </div>
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
                onChange={e => setDecisionNote(e.target.value)} placeholder="اكتب سبب القرار أو تفاصيل الأيام المعتمدة..."/>
            </FormField>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setShowApprove(null)}>إلغاء</button>
              <button className="btn btn-ghost text-red-600 border-red-200 hover:bg-red-50" onClick={() => rejectLeave(showApprove)} disabled={saving}>رفض</button>
              <button className="btn btn-primary" onClick={() => approveLeave(showApprove)}
                disabled={saving || (approveMode === 'partial' && partialDays.length === 0)}>
                {saving ? <Spinner size="sm"/> : 'تأكيد الموافقة'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Appeal */}
      <Modal open={!!showAppeal} onClose={() => { setShowAppeal(null); setAppealText(''); setAppealFiles([]); setSubmitError('') }} title="رفع رد مطالبة">
        {showAppeal && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <div className="text-xs font-bold text-slate-700">{showAppeal.reason}</div>
              <div className="text-xs text-slate-400 mt-1">{showAppeal.from_date} ← {showAppeal.to_date}</div>
            </div>
            <FormField label="اكتب أهمية الإجازة ولماذا هي ضرورية" required>
              <textarea className="form-input" rows={4} value={appealText}
                onChange={e => setAppealText(e.target.value)} placeholder="وضح سبب الحاجة للإجازة..."/>
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

      {/* ── NEW: Add Absence modal ── */}
      <Modal open={showAbsenceForm} onClose={() => { setShowAbsenceForm(false); setSubmitError(''); setAbsenceFiles([]) }} title="تسجيل غياب">
        <FormField label="الشخص" required>
          <select className="form-input" value={absenceForm.user_id} onChange={e => setAbs('user_id', e.target.value)}>
            <option value="">اختر شخصاً...</option>
            {members.filter(m => !['parent', 'guest'].includes(m.role)).map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.full_name} — {ROLE_LABEL[m.role] || m.role}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="نوع الغياب" required>
          <select className="form-input" value={absenceForm.absence_type} onChange={e => setAbs('absence_type', e.target.value)}>
            {Object.entries(ABSENCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ" required>
            <input className="form-input" type="date" value={absenceForm.from_date} onChange={e => setAbs('from_date', e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ" required>
            <input className="form-input" type="date" value={absenceForm.to_date}
              min={absenceForm.from_date || undefined} onChange={e => setAbs('to_date', e.target.value)}/>
          </FormField>
        </div>

        {/* Apply to */}
        <FormField label="تطبيق الغياب على" required>
          <select className="form-input" value={absenceForm.apply_to}
            onChange={e => setAbsenceForm(p => ({ ...p, apply_to: e.target.value, specific_event_ids: [] }))}>
            {Object.entries(APPLY_TO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>

        {/* Specific events selector */}
        {absenceForm.apply_to === 'specific' && (
          <div className="border border-slate-100 rounded-xl p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-600">المواعيد في الفترة المختارة</p>
              {rangeEvents.length > 0 && (
                <button className="text-xs text-brand-600 font-bold hover:underline"
                  onClick={() => setAbsenceForm(p => ({
                    ...p,
                    specific_event_ids: p.specific_event_ids.length === rangeEvents.length
                      ? []
                      : rangeEvents.map(ev => ev.id)
                  }))}>
                  {absenceForm.specific_event_ids.length === rangeEvents.length ? 'إلغاء الكل' : 'تحديد الكل'}
                </button>
              )}
            </div>
            {!absenceForm.from_date || !absenceForm.to_date
              ? <p className="text-xs text-slate-400 text-center py-3">حدد الفترة الزمنية أولاً</p>
              : loadingRangeEvents
                ? <div className="flex justify-center py-3"><Spinner size="sm"/></div>
                : rangeEvents.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-3">لا توجد مواعيد في هذه الفترة</p>
                  : <div className="space-y-1 max-h-52 overflow-y-auto">
                      {rangeEvents.map(ev => {
                        const checked = absenceForm.specific_event_ids.includes(ev.id)
                        return (
                          <label key={ev.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                            <input type="checkbox" checked={checked}
                              onChange={e => setAbsenceForm(p => ({
                                ...p,
                                specific_event_ids: e.target.checked
                                  ? [...p.specific_event_ids, ev.id]
                                  : p.specific_event_ids.filter(id => id !== ev.id)
                              }))} className="w-4 h-4 accent-brand-500 flex-shrink-0"/>
                            <span className="text-sm">{EVENT_TYPE_ICON[ev.event_type] || '📌'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-700 truncate">{ev.title}</div>
                              <div className="text-[10px] text-slate-400">
                                {ev.start_datetime?.slice(0, 10)} · {EVENT_TYPE_LABEL[ev.event_type] || ev.event_type}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>}
            {absenceForm.specific_event_ids.length > 0 && (
              <div className="mt-2 text-xs font-bold text-brand-600">✓ {absenceForm.specific_event_ids.length} موعد محدد</div>
            )}
          </div>
        )}

        <FormField label="السبب">
          <input className="form-input" value={absenceForm.reason} onChange={e => setAbs('reason', e.target.value)} placeholder="سبب الغياب..."/>
        </FormField>
        <FormField label="ملاحظات">
          <textarea className="form-input" rows={2} value={absenceForm.notes} onChange={e => setAbs('notes', e.target.value)}/>
        </FormField>
        <FormField label="مرفق اختياري">
          <FilePicker files={absenceFiles} setFiles={setAbsenceFiles} inputRef={absenceFileRef}/>
        </FormField>

        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowAbsenceForm(false); setAbsenceFiles([]) }}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitAbsence}
            disabled={saving || !absenceForm.user_id || !absenceForm.from_date || !absenceForm.to_date
              || (absenceForm.apply_to === 'specific' && absenceForm.specific_event_ids.length === 0)}>
            {saving ? <Spinner size="sm"/> : 'حفظ الغياب'}
          </button>
        </div>
      </Modal>

      {/* Admin grant leave */}
      <Modal open={showAdminGrant} onClose={() => { setShowAdminGrant(false); setSubmitError('') }} title="منح إجازة إدارية مباشرة">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-4 text-xs font-bold text-emerald-700">
          <ShieldCheck size={12} className="inline ml-1"/>
          سيتم تسجيل الإجازة كـ «مقبولة» فوراً وتحديث سجلات الحضور تلقائياً.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="المستهدف" required>
            <select className="form-input" value={adminGrantForm.target_type}
              onChange={e => setAdminGrantForm(p => ({ ...p, target_type: e.target.value as 'specific' | 'all', target_user_ids: [] }))}>
              <option value="specific">أشخاص محددون</option>
              <option value="all">كامل الفريق</option>
            </select>
          </FormField>
          <FormField label="نوع الإجازة" required>
            <select className="form-input" value={adminGrantForm.leave_type} onChange={e => setGrant('leave_type', e.target.value)}>
              <option value="rest">راحة</option>
              <option value="national_team">استدعاء للمنتخب</option>
              <option value="death">حالة وفاة</option>
              <option value="marriage">زواج</option>
              <option value="academic">دراسة</option>
              <option value="family">عائلي</option>
              <option value="private_event">مناسبة خاصة</option>
              <option value="emergency">طارئ</option>
              <option value="other">أخرى</option>
            </select>
          </FormField>
        </div>
        {adminGrantForm.target_type === 'specific' && (
          <FormField label="اختر الأشخاص" required>
            <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
              {members.filter(m => !['parent', 'guest'].includes(m.role)).length === 0
                ? <div className="text-xs text-slate-400 py-3 text-center">لا يوجد أعضاء</div>
                : members.filter(m => !['parent', 'guest'].includes(m.role)).map(m => {
                    const checked = adminGrantForm.target_user_ids.includes(m.user_id)
                    return (
                      <label key={m.user_id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setAdminGrantForm(p => ({
                            ...p,
                            target_user_ids: e.target.checked ? [...p.target_user_ids, m.user_id] : p.target_user_ids.filter(id => id !== m.user_id)
                          }))} className="w-4 h-4 accent-emerald-500 flex-shrink-0"/>
                        <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm"/>
                        <span className="text-sm font-bold text-slate-700">{m.profile?.full_name || 'عضو'}</span>
                        <span className="text-xs text-slate-400 mr-auto">{ROLE_LABEL[m.role] || m.role}</span>
                      </label>
                    )
                  })}
            </div>
            {adminGrantForm.target_user_ids.length > 0 && (
              <div className="mt-1 text-xs font-bold text-emerald-600">✓ {adminGrantForm.target_user_ids.length} شخص محدد</div>
            )}
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ" required>
            <input className="form-input" type="date" value={adminGrantForm.from_date} onChange={e => setGrant('from_date', e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ" required>
            <input className="form-input" type="date" value={adminGrantForm.to_date}
              min={adminGrantForm.from_date || undefined} onChange={e => setGrant('to_date', e.target.value)}/>
          </FormField>
        </div>
        <FormField label="تطبيق على" required>
          <select className="form-input" value={adminGrantForm.apply_to} onChange={e => setGrant('apply_to', e.target.value)}>
            {Object.entries(APPLY_TO_LABEL).filter(([k]) => k !== 'specific').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </FormField>
        <FormField label="السبب">
          <input className="form-input" value={adminGrantForm.reason} onChange={e => setGrant('reason', e.target.value)} placeholder="سبب منح الإجازة..."/>
        </FormField>
        <FormField label="ملاحظة">
          <textarea className="form-input" rows={2} value={adminGrantForm.note} onChange={e => setGrant('note', e.target.value)}/>
        </FormField>
        {submitError && <p className="text-xs text-red-600 font-bold bg-red-50 rounded-xl px-3 py-2">{submitError}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdminGrant(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={submitAdminGrantLeave}
            disabled={saving || !adminGrantForm.from_date || !adminGrantForm.to_date
              || (adminGrantForm.target_type === 'specific' && adminGrantForm.target_user_ids.length === 0)}>
            {saving ? <Spinner size="sm"/> : 'منح الإجازة'}
          </button>
        </div>
      </Modal>

      {/* Confirm delete absence */}
      {confirmDeleteAbsence && (
        <Modal open title="حذف الغياب" onClose={() => setConfirmDeleteAbsence(null)}>
          <p className="text-sm text-slate-700 mb-4">هل تريد حذف هذا الغياب؟</p>
          <div className="bg-slate-50 rounded-xl p-3 mb-4">
            <div className="font-bold text-sm">{confirmDeleteAbsence.profile?.full_name}</div>
            <div className="text-xs text-slate-500 mt-1">{confirmDeleteAbsence.from_date} ← {confirmDeleteAbsence.to_date}</div>
            <span className={`badge text-xs mt-1 ${ABSENCE_TYPE_STYLE[confirmDeleteAbsence.absence_type] || ABSENCE_TYPE_STYLE.other}`}>
              {ABSENCE_TYPE_LABEL[confirmDeleteAbsence.absence_type] || 'أخرى'}
            </span>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost" onClick={() => setConfirmDeleteAbsence(null)}>إلغاء</button>
            <button className="btn bg-red-500 hover:bg-red-600 text-white" onClick={() => deleteAbsence(confirmDeleteAbsence.id)}>حذف</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
