import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trophy, ChevronDown, ChevronUp, Send, ExternalLink,
  Paperclip, List, LayoutGrid, ArrowUpDown, ChevronRight,
  X, AlertCircle, Image, FileText
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, noteService, medicalService, financeService, pointsService, eventService } from '../../services'
import { Spinner, PageHeader, SearchBox, Avatar, Modal, FormField, EmptyState, ProgressBar } from '../../components/ui'
import { NOTE_TYPES, canManageEvents, canManageTeam, formatDate, RIYAL } from '../../utils/helpers'

const NOTE_COLOR: Record<string, { bg: string; tc: string }> = {
  مدح:   { bg: 'bg-emerald-50', tc: 'text-emerald-700' },
  توجيه: { bg: 'bg-blue-50',    tc: 'text-blue-700' },
  تحذير: { bg: 'bg-red-50',     tc: 'text-red-700' },
  تطوير: { bg: 'bg-amber-50',   tc: 'text-amber-700' },
}

const CASE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  active:     { label: 'نشط',          color: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  monitoring: { label: 'تحت المراقبة', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  recovered:  { label: 'تعافٍ',        color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

const CASE_NOTE_TYPES = [
  { key: 'followup',     label: 'متابعة' },
  { key: 'prescription', label: 'وصفة' },
  { key: 'therapy',      label: 'جلسات' },
  { key: 'xray',         label: 'أشعة' },
  { key: 'comment',      label: 'تعليق' },
]

const REPORT_TYPES = [
  { key: 'injury',   label: '🦴 إصابة',    color: 'bg-red-100 text-red-700' },
  { key: 'checkup',  label: '🩺 كشف دوري', color: 'bg-blue-100 text-blue-700' },
  { key: 'followup', label: '📋 متابعة',    color: 'bg-amber-100 text-amber-700' },
  { key: 'other',    label: '📝 أخرى',      color: 'bg-slate-100 text-slate-600' },
]

type SortKey = 'join_asc' | 'join_desc' | 'age_asc' | 'age_desc' | 'att_asc' | 'att_desc' | 'inj_asc' | 'inj_desc'

interface PlayerStat {
  attendancePct: number
  totalEvents: number
  injuryCount: number
  points: number
}

function calcAge(dob: string | undefined): number | null {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function formatFullDate(dateStr: string | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
}

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
  return name.toLowerCase().endsWith('.pdf')
    ? <FileText size={13} className="text-red-500 flex-shrink-0"/>
    : <Image size={13} className="text-blue-500 flex-shrink-0"/>
}

export default function PlayersPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Members & roles
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')

  // Per-player stats (for sorting + display in list)
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStat>>({})
  const [loadingStats, setLoadingStats] = useState(false)

  // View & sort
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('join_desc')
  const [showSort, setShowSort] = useState(false)

  // Selected player detail
  const [selPlayer, setSelPlayer] = useState<any>(null)
  const [playerNotes, setPlayerNotes] = useState<any[]>([])
  const [playerMedical, setPlayerMedical] = useState<any[]>([])
  const [playerFinance, setPlayerFinance] = useState<{ obligations: any[]; payments: any[] }>({ obligations: [], payments: [] })
  const [playerPts, setPlayerPts] = useState(0)
  const [detailTab, setDetailTab] = useState('notes')

  // Notes
  const [showNote, setShowNote] = useState(false)
  const [noteForm, setNoteForm] = useState({ note_type: 'مدح' as any, content: '', event_title: '' })
  const [saving, setSaving] = useState(false)
  const [saveNoteError, setSaveNoteError] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // Injury cases
  const [showCaseModal, setShowCaseModal] = useState(false)
  const [caseForm, setCaseForm] = useState({ title: '', description: '', injury_date: '', report_type: 'injury' })
  const [caseAttachFiles, setCaseAttachFiles] = useState<File[]>([])
  const [caseAttachError, setCaseAttachError] = useState('')
  const [caseAttachUploading, setCaseAttachUploading] = useState(false)
  const [casePreviewUrl, setCasePreviewUrl] = useState<string | null>(null)
  const caseFileInputRef = useRef<HTMLInputElement>(null)
  const [savingCase, setSavingCase] = useState(false)
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [caseNotes, setCaseNotes] = useState<Record<string, any[]>>({})
  const [loadingCaseNotes, setLoadingCaseNotes] = useState<string | null>(null)
  const [caseNoteText, setCaseNoteText] = useState('')
  const [caseNoteType, setCaseNoteType] = useState('followup')
  const [sendingCaseNote, setSendingCaseNote] = useState(false)
  const [updatingCaseStatus, setUpdatingCaseStatus] = useState<string | null>(null)

  const [unreadNotes, setUnreadNotes] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(async m => {
      const players = m.filter((mem: any) => mem.role === 'player')
      setMembers(players)
      const counts: Record<string, number> = {}
      for (const mem of players) {
        counts[mem.user_id] = await noteService.getUnreadCount(teamId, mem.user_id)
      }
      setUnreadNotes(counts)
      setLoading(false)
      loadAllStats(players)
    })
  }, [teamId, user])

  async function loadAllStats(players: any[]) {
    if (!teamId) return
    setLoadingStats(true)
    const statsMap: Record<string, PlayerStat> = {}
    await Promise.all(players.map(async (m: any) => {
      const [att, medical, pts] = await Promise.all([
        eventService.getMyAttendance(teamId!, m.user_id),
        medicalService.getPlayerReports(teamId!, m.user_id),
        pointsService.getUserPointsTotal ? pointsService.getUserPointsTotal(teamId!, m.user_id) : Promise.resolve(0)
      ])
      const present = att.filter((a: any) => a.status === 'present' || a.status === 'late').length
      const total = att.length
      statsMap[m.user_id] = {
        attendancePct: total > 0 ? Math.round(present / total * 100) : 0,
        totalEvents: total,
        injuryCount: medical.filter((r: any) => r.report_type === 'injury').length,
        points: pts as number || 0
      }
    }))
    setPlayerStats(statsMap)
    setLoadingStats(false)
  }

  async function openPlayer(m: any) {
    setSelPlayer(m); setDetailTab('notes')
    setExpandedCaseId(null); setCaseNotes({})
    if (!teamId || !user) return
    const isCoach = canManageEvents(myRole) || canManageTeam(myRole)
    const [notes, medical, finance] = await Promise.all([
      isCoach
        ? noteService.getPlayerNotesForCoach(teamId, m.user_id, user.id)
        : noteService.getMyNotes(teamId, m.user_id),
      medicalService.getPlayerReports(teamId, m.user_id),
      financeService.getPlayerFinance(teamId, m.user_id),
    ])
    setPlayerNotes(notes)
    setPlayerMedical(medical)
    setPlayerFinance(finance)
    setPlayerPts(playerStats[m.user_id]?.points ?? 0)
    await noteService.markRead(m.user_id, teamId)
    setUnreadNotes(p => ({ ...p, [m.user_id]: 0 }))
  }

  async function saveNote() {
    if (!noteForm.content.trim() || !selPlayer || !teamId || !user) return
    setSaving(true); setSaveNoteError('')
    const { error } = await noteService.create({ ...noteForm, team_id: teamId, player_id: selPlayer.user_id, coach_id: user.id, is_read: false })
    if (error) {
      setSaveNoteError('حدث خطأ في الحفظ. تأكد من صلاحياتك وحاول مجدداً.')
      setSaving(false)
      return
    }
    const notes = await noteService.getPlayerNotesForCoach(teamId, selPlayer.user_id, user.id)
    setPlayerNotes(notes)
    setShowNote(false)
    setNoteForm({ note_type: 'مدح', content: '', event_title: '' })
    setSaving(false)
  }

  async function submitReply(noteId: string) {
    if (!replyText.trim()) return
    setSendingReply(true)
    await noteService.addPlayerReply(noteId, replyText)
    setPlayerNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, player_reply: replyText, player_replied_at: new Date().toISOString() }
      : n
    ))
    setReplyingTo(null); setReplyText(''); setSendingReply(false)
  }

  function closeCaseModal() {
    setShowCaseModal(false)
    setCaseForm({ title: '', description: '', injury_date: '', report_type: 'injury' })
    setCaseAttachFiles([])
    setCaseAttachError('')
    if (caseFileInputRef.current) caseFileInputRef.current.value = ''
  }

  async function saveCase() {
    if (!caseForm.title || !selPlayer || !teamId || !user) return
    setSavingCase(true); setCaseAttachError('')

    let attachment_url: string | null = null

    if (caseAttachFiles.length > 0) {
      setCaseAttachUploading(true)
      const urls: string[] = []
      for (const file of caseAttachFiles) {
        const path = `${teamId}/${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`
        const { url, error } = await medicalService.uploadAttachment(file, path)
        if (error || !url) {
          setCaseAttachError('فشل رفع الملف: ' + (error || 'خطأ غير معروف'))
          setCaseAttachUploading(false); setSavingCase(false); return
        }
        urls.push(url)
      }
      setCaseAttachUploading(false)
      attachment_url = urls.length === 1 ? urls[0] : JSON.stringify(urls)
    }

    await medicalService.createReport({
      team_id: teamId, player_id: selPlayer.user_id,
      title: caseForm.title, report_type: caseForm.report_type,
      description: caseForm.description || null,
      injury_date: caseForm.injury_date || null,
      status: 'active', submitted_by: user.id, attachment_url
    })
    const medical = await medicalService.getPlayerReports(teamId, selPlayer.user_id)
    setPlayerMedical(medical)
    closeCaseModal(); setSavingCase(false)
  }

  async function expandCase(id: string) {
    if (expandedCaseId === id) { setExpandedCaseId(null); return }
    setExpandedCaseId(id); setCaseNoteText(''); setCaseNoteType('followup')
    if (!caseNotes[id]) {
      setLoadingCaseNotes(id)
      const data = await medicalService.getNotes(id)
      setCaseNotes(prev => ({ ...prev, [id]: data }))
      setLoadingCaseNotes(null)
    }
  }

  async function addCaseNote(reportId: string) {
    if (!caseNoteText.trim() || !user || !teamId) return
    setSendingCaseNote(true)
    await medicalService.addNote({ report_id: reportId, team_id: teamId, author_id: user.id, note: caseNoteText, note_type: caseNoteType })
    const updated = await medicalService.getNotes(reportId)
    setCaseNotes(prev => ({ ...prev, [reportId]: updated }))
    setCaseNoteText(''); setSendingCaseNote(false)
  }

  async function updateCaseStatus(reportId: string, status: string) {
    setUpdatingCaseStatus(reportId)
    const patch: any = { status }
    if (status === 'recovered') patch.recovery_date = new Date().toISOString().slice(0, 10)
    await medicalService.updateReport(reportId, patch)
    setPlayerMedical(prev => prev.map(r => r.id === reportId ? { ...r, ...patch } : r))
    setUpdatingCaseStatus(null)
  }

  const isCoach = canManageEvents(myRole) || canManageTeam(myRole)
  const canWriteNote = isCoach

  // ── Sort & filter ──
  const filtered = members.filter(m => m.profile?.full_name?.includes(q))

  const sorted = [...filtered].sort((a, b) => {
    const as = playerStats[a.user_id]
    const bs = playerStats[b.user_id]
    switch (sortKey) {
      case 'join_desc': return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
      case 'join_asc':  return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
      case 'att_desc':  return (bs?.attendancePct ?? 0) - (as?.attendancePct ?? 0)
      case 'att_asc':   return (as?.attendancePct ?? 0) - (bs?.attendancePct ?? 0)
      case 'age_asc': {
        const ad = a.profile?.date_of_birth || '9999'
        const bd = b.profile?.date_of_birth || '9999'
        return bd.localeCompare(ad) // younger = more recent DOB
      }
      case 'age_desc': {
        const ad = a.profile?.date_of_birth || '0000'
        const bd = b.profile?.date_of_birth || '0000'
        return ad.localeCompare(bd) // older = earlier DOB
      }
      case 'inj_desc': return (bs?.injuryCount ?? 0) - (as?.injuryCount ?? 0)
      case 'inj_asc':  return (as?.injuryCount ?? 0) - (bs?.injuryCount ?? 0)
      default: return 0
    }
  })

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'join_desc', label: '📅 أحدث انضماماً' },
    { key: 'join_asc',  label: '📅 أقدم انضماماً' },
    { key: 'att_desc',  label: '✅ الأعلى حضوراً' },
    { key: 'att_asc',   label: '✅ الأقل حضوراً' },
    { key: 'age_asc',   label: '🎂 الأصغر سناً' },
    { key: 'age_desc',  label: '🎂 الأكبر سناً' },
    { key: 'inj_desc',  label: '🤕 الأكثر إصابات' },
    { key: 'inj_asc',   label: '🤕 الأقل إصابات' },
  ]

  const injuryCases = playerMedical.filter(r => r.report_type === 'injury')
  const activeInjuries = injuryCases.filter(r => r.status === 'active' || r.status === 'monitoring')

  const getMyPaid = (obId: string) => {
    const p = playerFinance.payments.find(p => p.obligation_id === obId)
    return p?.paid_amount || 0
  }
  const totalRequired = playerFinance.obligations.reduce((s, o) => s + o.amount, 0)
  const totalPaid = playerFinance.obligations.reduce((s, o) => s + getMyPaid(o.id), 0)

  // ══════════════════════════════════════════
  // PLAYER DETAIL VIEW
  // ══════════════════════════════════════════
  if (selPlayer) {
    const age = calcAge(selPlayer.profile?.date_of_birth)
    const stat = playerStats[selPlayer.user_id]

    return (
      <div>
        <button onClick={() => setSelPlayer(null)}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 mb-4 cursor-pointer">
          ← العودة للقائمة
        </button>

        {/* Player Card */}
        <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 text-white mb-4">
          <div className="flex items-center gap-4 mb-3">
            <Avatar name={selPlayer.profile?.full_name || '?'} src={selPlayer.profile?.avatar_url} size="xl"
              className="ring-4 ring-white/30 flex-shrink-0"/>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold">{selPlayer.profile?.full_name}</div>
              <div className="text-sm opacity-80">{selPlayer.role}{selPlayer.position_label ? ` · ${selPlayer.position_label}` : ''}</div>
              {activeInjuries.length > 0 && (
                <div className="inline-flex items-center gap-1 bg-red-500/30 border border-red-300/40 rounded-lg px-2 py-0.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-300 animate-pulse"/>
                  <span className="text-xs text-red-100 font-bold">{activeInjuries.length} إصابة نشطة</span>
                </div>
              )}
            </div>
            <div className="text-center bg-white/15 px-4 py-3 rounded-xl flex-shrink-0">
              <div className="text-2xl font-bold text-yellow-300">{playerPts}</div>
              <div className="text-xs opacity-80">نقطة</div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-white/10 rounded-xl p-2.5">
              <div className="text-white/60 text-[10px] font-bold mb-0.5">تاريخ الانضمام</div>
              <div className="text-white text-xs font-bold">{formatFullDate(selPlayer.joined_at)}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <div className="text-white/60 text-[10px] font-bold mb-0.5">تاريخ الميلاد</div>
              <div className="text-white text-xs font-bold">
                {selPlayer.profile?.date_of_birth
                  ? `${formatFullDate(selPlayer.profile.date_of_birth)}${age !== null ? ` (${age} سنة)` : ''}`
                  : '—'}
              </div>
            </div>
            {stat && (
              <>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-white/60 text-[10px] font-bold mb-0.5">نسبة الحضور</div>
                  <div className="text-white text-xs font-bold">{stat.attendancePct}% <span className="opacity-60">({stat.totalEvents} حدث)</span></div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-white/60 text-[10px] font-bold mb-0.5">الإصابات</div>
                  <div className="text-white text-xs font-bold">{stat.injuryCount} حالة</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {[
            ['notes', `📬 بريد (${playerNotes.length})`],
            ['injuries', `🤕 إصابات (${injuryCases.length})`],
            ['finance', `${RIYAL} المالية`]
          ].map(([k, l]) => (
            <button key={k} onClick={() => setDetailTab(k)}
              className={`flex-shrink-0 flex-1 py-2 text-xs font-bold rounded-lg transition-all ${detailTab === k ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* ── Notes Tab ── */}
        {detailTab === 'notes' && (
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-sm">البريد</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">تظهر فقط لمن كتبها واللاعب</p>
              </div>
              {canWriteNote && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowNote(true)}>
                  <Plus size={12}/> رسالة
                </button>
              )}
            </div>
            {playerNotes.length === 0
              ? <EmptyState title="لا توجد رسائل"/>
              : <div className="space-y-3">
                  {playerNotes.map(n => {
                    const clr = NOTE_COLOR[n.note_type] || NOTE_COLOR['توجيه']
                    return (
                      <div key={n.id} className={`rounded-xl p-3 ${clr.bg}`}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className={`badge text-xs ${clr.bg} ${clr.tc} border border-current/20`}>{n.note_type}</span>
                          <div className="text-right">
                            {n.event_title && <span className="text-xs text-slate-400">{n.event_title} · </span>}
                            <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                          </div>
                        </div>
                        <p className={`text-sm leading-relaxed ${clr.tc}`}>{n.content}</p>
                        {n.coach && <div className="text-xs text-slate-400 mt-1.5">— {n.coach.full_name}</div>}

                        {/* Player reply (if exists) */}
                        {n.player_reply && (
                          <div className="mt-2 bg-white/70 rounded-lg p-2.5 border border-current/10">
                            <div className="text-[10px] font-bold text-slate-500 mb-1">رد اللاعب · {formatDate(n.player_replied_at)}</div>
                            <p className="text-xs text-slate-700">{n.player_reply}</p>
                          </div>
                        )}

                        {/* Reply button (only player can reply - handled in TeamDashboard) */}
                      </div>
                    )
                  })}
                </div>}
          </div>
        )}

        {/* ── Injuries Tab ── */}
        {detailTab === 'injuries' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800">سجل الإصابات</h3>
                {activeInjuries.length > 0 && (
                  <span className="badge bg-red-100 text-red-700 text-xs">{activeInjuries.length} نشط</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isCoach && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCaseModal(true)}>
                    <Plus size={12}/> فتح حالة
                  </button>
                )}
                <button onClick={() => navigate(`/team/${teamId}/medical?player=${selPlayer.user_id}`)}
                  className="btn btn-ghost btn-sm text-brand-600 border-brand-200">
                  <ExternalLink size={12}/> التقارير الطبية
                </button>
              </div>
            </div>

            {injuryCases.length === 0 ? (
              <div className="card text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <div className="font-bold text-slate-600 text-sm">لا توجد إصابات مسجلة</div>
              </div>
            ) : (
              injuryCases.map(cas => {
                const st = CASE_STATUS[cas.status as keyof typeof CASE_STATUS] || CASE_STATUS.active
                const isOpen = expandedCaseId === cas.id
                const notes = caseNotes[cas.id] || []
                const duration = cas.injury_date && cas.recovery_date
                  ? daysBetween(cas.injury_date, cas.recovery_date)
                  : cas.injury_date
                    ? daysBetween(cas.injury_date, new Date().toISOString().slice(0, 10))
                    : null

                return (
                  <div key={cas.id} className="card mb-0 p-0 overflow-hidden border border-slate-100">
                    <button className="w-full text-right p-4 border-none bg-transparent cursor-pointer"
                      onClick={() => expandCase(cas.id)}>
                      <div className="flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${st.dot}`}/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={`badge text-xs ${st.color}`}>{st.label}</span>
                            {duration !== null && (
                              <span className={`badge text-xs ${cas.status === 'recovered' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                {duration} يوم {cas.status === 'recovered' ? 'مدة التعافي' : 'منذ الإصابة'}
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-sm text-slate-800">{cas.title}</div>
                          {cas.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cas.description}</div>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                            {cas.injury_date && <span>📅 {cas.injury_date}</span>}
                            {cas.recovery_date && <span>✅ {cas.recovery_date}</span>}
                            {caseNotes[cas.id]?.length > 0 && <span>💬 {caseNotes[cas.id].length} تحديث</span>}
                            {cas.attachment_url && (
                              <span className="flex items-center gap-0.5">
                                <Paperclip size={10}/>
                                {parseAttachments(cas.attachment_url).length} مرفق
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-slate-400">
                          {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100">
                        {isCoach && (
                          <div className="px-4 py-2.5 bg-slate-50 flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-500">تحديث الحالة:</span>
                            {Object.entries(CASE_STATUS).map(([key, cfg]) => (
                              <button key={key}
                                disabled={cas.status === key || updatingCaseStatus === cas.id}
                                onClick={() => updateCaseStatus(cas.id, key)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${cas.status === key ? cfg.color + ' border-transparent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                {updatingCaseStatus === cas.id ? <Spinner size="sm"/> : cfg.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="px-4 py-3 space-y-3">
                          {loadingCaseNotes === cas.id ? <div className="flex justify-center py-3"><Spinner/></div>
                            : notes.length === 0 ? <p className="text-xs text-slate-400 text-center py-2">لا توجد تحديثات بعد</p>
                            : notes.map((n: any) => {
                                const ntConf = CASE_NOTE_TYPES.find(t => t.key === n.note_type)
                                return (
                                  <div key={n.id} className="flex gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                      {n.author?.full_name?.[0] || '?'}
                                    </div>
                                    <div className="flex-1 bg-slate-50 rounded-xl p-2.5">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-xs font-bold text-slate-700">{n.author?.full_name}</span>
                                        {ntConf && <span className="badge bg-brand-50 text-brand-700 text-[10px]">{ntConf.label}</span>}
                                        <span className="text-xs text-slate-400 mr-auto">{new Date(n.created_at).toLocaleDateString('ar-SA')}</span>
                                      </div>
                                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
                                    </div>
                                  </div>
                                )
                              })}
                          {isCoach && (
                            <div className="border-t border-slate-100 pt-3">
                              <div className="flex flex-wrap gap-1 mb-2">
                                {CASE_NOTE_TYPES.map(t => (
                                  <button key={t.key} onClick={() => setCaseNoteType(t.key)}
                                    className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all ${caseNoteType === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <textarea rows={2} value={caseNoteText} onChange={e => setCaseNoteText(e.target.value)}
                                  placeholder="أضف تحديثاً للحالة..."
                                  className="form-input flex-1 resize-none text-xs"/>
                                <button onClick={() => addCaseNote(cas.id)}
                                  disabled={sendingCaseNote || !caseNoteText.trim()}
                                  className="w-8 h-8 self-end bg-brand-500 rounded-lg flex items-center justify-center text-white hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50">
                                  {sendingCaseNote ? <Spinner size="sm"/> : <Send size={13}/>}
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Attachments */}
                          {cas.attachment_url && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {parseAttachments(cas.attachment_url).map((url: string, idx: number) => (
                                <button key={idx} onClick={() => setCasePreviewUrl(url)}
                                  className="inline-flex items-center gap-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-2 py-1 border-none cursor-pointer transition-colors">
                                  <Paperclip size={11}/> مرفق {idx + 1}
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => navigate(`/team/${teamId}/medical?player=${selPlayer.user_id}`)}
                            className="text-xs text-brand-600 hover:underline flex items-center gap-1 border-none bg-transparent cursor-pointer">
                            <ExternalLink size={11}/> فتح الملف الطبي الكامل
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Finance Tab ── */}
        {detailTab === 'finance' && (
          <div className="card">
            <h3 className="font-bold text-sm mb-3">المستحقات المالية</h3>
            {playerFinance.obligations.length === 0
              ? <div className="text-center py-6 text-slate-400 text-sm">لا توجد مستحقات مالية</div>
              : <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="stat-box"><div className="stat-value text-base">{totalRequired} {RIYAL}</div><div className="stat-label">المطلوب</div></div>
                    <div className="stat-box"><div className="stat-value text-base text-emerald-600">{totalPaid} {RIYAL}</div><div className="stat-label">المسدد</div></div>
                    <div className="stat-box"><div className="stat-value text-base text-red-600">{(totalRequired - totalPaid).toFixed(0)} {RIYAL}</div><div className="stat-label">المتبقي</div></div>
                  </div>
                  <div className="space-y-3">
                    {playerFinance.obligations.map(o => {
                      const paid = getMyPaid(o.id)
                      const pct = Math.round(paid / o.amount * 100)
                      return (
                        <div key={o.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold">{o.title}</span>
                            <span className="text-slate-500">{paid}/{o.amount} {RIYAL}</span>
                          </div>
                          <ProgressBar value={pct} color={paid >= o.amount ? 'bg-emerald-500' : 'bg-amber-400'}/>
                          {o.due_date && <div className="text-xs text-slate-400 mt-0.5">الاستحقاق: {o.due_date}</div>}
                        </div>
                      )
                    })}
                  </div>
                </>}
          </div>
        )}

        {/* Note Modal */}
        <Modal open={showNote} onClose={() => { setShowNote(false); setSaveNoteError('') }} title={`رسالة إلى ${selPlayer.profile?.full_name}`}>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
            🔒 هذه الرسالة لن تظهر إلا لك وللاعب فقط.
          </div>
          <div className="form-group">
            <label className="form-label">نوع الرسالة</label>
            <div className="flex gap-2 flex-wrap">
              {NOTE_TYPES.map(t => (
                <button key={t} onClick={() => setNoteForm(p => ({ ...p, note_type: t }))}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${noteForm.note_type === t ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <FormField label="مرتبطة بحدث (اختياري)">
            <input className="form-input" value={noteForm.event_title}
              onChange={e => setNoteForm(p => ({ ...p, event_title: e.target.value }))} placeholder="تدريب الثلاثاء..."/>
          </FormField>
          <FormField label="نص الرسالة" required>
            <textarea className="form-input" rows={3} value={noteForm.content}
              onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} placeholder="اكتب رسالتك هنا..."/>
          </FormField>
          {saveNoteError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600 mt-2">
              {saveNoteError}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={() => { setShowNote(false); setSaveNoteError('') }}>إلغاء</button>
            <button className="btn btn-primary" onClick={saveNote} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إرسال'}</button>
          </div>
        </Modal>

        {/* New Injury Case Modal */}
        <Modal open={showCaseModal} onClose={closeCaseModal} title={`فتح تقرير طبي — ${selPlayer.profile?.full_name}`} width="max-w-lg">
          <FormField label="نوع التقرير">
            <div className="flex flex-wrap gap-1.5">
              {REPORT_TYPES.map(t => (
                <button key={t.key} onClick={() => setCaseForm(p => ({ ...p, report_type: t.key }))}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${caseForm.report_type === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="العنوان" required>
            <input className="form-input" value={caseForm.title}
              onChange={e => setCaseForm(p => ({ ...p, title: e.target.value }))}
              placeholder="إصابة في الركبة اليمنى..."/>
          </FormField>
          <FormField label="تاريخ الإصابة">
            <input className="form-input" type="date" value={caseForm.injury_date}
              onChange={e => setCaseForm(p => ({ ...p, injury_date: e.target.value }))}/>
          </FormField>
          <FormField label="التفاصيل وخطة العلاج">
            <textarea className="form-input" rows={3} value={caseForm.description}
              onChange={e => setCaseForm(p => ({ ...p, description: e.target.value }))}
              placeholder="الخطة العلاجية، التوصيات..."/>
          </FormField>

          {/* Multi-file attachment (up to 5 images) */}
          <FormField label={`المرفقات — صور أو تقارير (${caseAttachFiles.length}/5)`}>
            {caseAttachFiles.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {caseAttachFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                    <FileIcon name={f.name}/>
                    <span className="text-xs text-brand-700 font-bold flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    <button
                      onClick={() => setCaseAttachFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer flex-shrink-0">
                      <X size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {caseAttachFiles.length < 5 && (
              <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                <Paperclip size={15} className="text-slate-400 flex-shrink-0"/>
                <span className="text-xs text-slate-500">اضغط لإضافة صورة أو PDF ({caseAttachFiles.length}/5)</span>
                <input
                  ref={caseFileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  multiple
                  onChange={e => {
                    const newFiles = Array.from(e.target.files || [])
                    setCaseAttachFiles(prev => {
                      const combined = [...prev, ...newFiles]
                      return combined.slice(0, 5)
                    })
                    setCaseAttachError('')
                    if (caseFileInputRef.current) caseFileInputRef.current.value = ''
                  }}
                />
              </label>
            )}
            {caseAttachError && (
              <div className="flex items-center gap-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                <AlertCircle size={12} className="flex-shrink-0"/>
                {caseAttachError}
              </div>
            )}
            {caseAttachUploading && (
              <div className="flex items-center gap-2 mt-2 text-xs text-brand-600">
                <Spinner size="sm"/> جارٍ رفع الملفات...
              </div>
            )}
          </FormField>

          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={closeCaseModal}>إلغاء</button>
            <button className="btn btn-primary" onClick={saveCase} disabled={savingCase || caseAttachUploading || !caseForm.title}>
              {savingCase ? <Spinner size="sm"/> : 'فتح الحالة'}
            </button>
          </div>
        </Modal>

        {/* Attachment preview modal */}
        {casePreviewUrl && (() => {
          const isPdf = casePreviewUrl.toLowerCase().includes('.pdf')
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
              onClick={() => setCasePreviewUrl(null)}>
              <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden"
                style={{ maxWidth: '92vw', maxHeight: '92vh', width: isPdf ? '800px' : 'auto' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    {isPdf ? <FileText size={15} className="text-red-500"/> : <Image size={15} className="text-blue-500"/>}
                    {isPdf ? 'مستند PDF' : 'صورة المرفق'}
                  </span>
                  <div className="flex items-center gap-2">
                    <a href={casePreviewUrl} download target="_blank" rel="noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-800 font-bold border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-1 no-underline">
                      تنزيل
                    </a>
                    <button onClick={() => setCasePreviewUrl(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-500 border-none cursor-pointer transition-colors text-base font-bold">
                      ✕
                    </button>
                  </div>
                </div>
                {isPdf
                  ? <iframe src={casePreviewUrl} title="مستند" style={{ width: '800px', maxWidth: '92vw', height: '80vh' }} className="block border-0"/>
                  : <div className="flex items-center justify-center p-3 bg-slate-900">
                      <img src={casePreviewUrl} alt="مرفق" style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain' }} className="rounded-xl block"/>
                    </div>
                }
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  // ══════════════════════════════════════════
  // PLAYERS LIST VIEW
  // ══════════════════════════════════════════
  return (
    <div>
      <PageHeader title="اللاعبون"
        action={
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button onClick={() => setShowSort(v => !v)}
                className="btn btn-ghost btn-sm flex items-center gap-1">
                <ArrowUpDown size={13}/>
                <span className="hidden sm:inline">{SORT_OPTIONS.find(s => s.key === sortKey)?.label.split(' ').slice(1).join(' ')}</span>
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)}/>
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden py-1">
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt.key}
                        onClick={() => { setSortKey(opt.key); setShowSort(false) }}
                        className={`w-full text-right px-4 py-2.5 text-xs font-bold transition-colors border-none cursor-pointer ${sortKey === opt.key ? 'bg-brand-50 text-brand-700' : 'bg-transparent text-slate-700 hover:bg-slate-50'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* View toggle */}
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="btn btn-ghost btn-sm">
              {viewMode === 'grid' ? <List size={15}/> : <LayoutGrid size={15}/>}
            </button>
          </div>
        }/>

      <SearchBox placeholder="ابحث عن لاعب..." value={q} onChange={setQ}/>

      {loadingStats && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 px-1">
          <Spinner size="sm"/> جارٍ تحميل الإحصائيات...
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : sorted.length === 0 ? <div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا يوجد لاعبون"/></div>
        : viewMode === 'list'
          // ── Numbered list view ──
          ? (
            <div className="card p-0 overflow-hidden">
              {sorted.map((m, i) => {
                const stat = playerStats[m.user_id]
                const age = calcAge(m.profile?.date_of_birth)
                const unread = unreadNotes[m.user_id] || 0
                const activeInj = stat?.injuryCount ?? 0

                return (
                  <button key={m.id}
                    onClick={() => openPlayer(m)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors text-right border-none bg-transparent cursor-pointer">
                    {/* Rank */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700'
                      : i === 1 ? 'bg-slate-100 text-slate-600'
                      : i === 2 ? 'bg-orange-100 text-orange-600'
                      : 'bg-slate-50 text-slate-400'
                    }`}>{i + 1}</div>

                    <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm" badge={unread}/>

                    <div className="flex-1 min-w-0 text-right">
                      <div className="font-bold text-sm truncate">{m.profile?.full_name}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {m.position_label && <span className="text-xs text-brand-600 font-medium">{m.position_label}</span>}
                        {age !== null && <span className="text-xs text-slate-400">{age} سنة</span>}
                        <span className="text-xs text-slate-400">{new Date(m.joined_at).toLocaleDateString('ar-SA')}</span>
                      </div>
                    </div>

                    {/* Stats chips */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {stat ? (
                        <>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${stat.attendancePct >= 70 ? 'bg-emerald-50 text-emerald-700' : stat.attendancePct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                            {stat.attendancePct}%
                          </span>
                          {stat.points > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-yellow-50 text-yellow-700">
                              {stat.points}⭐
                            </span>
                          )}
                          {activeInj > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-red-50 text-red-600">
                              🤕{activeInj}
                            </span>
                          )}
                        </>
                      ) : loadingStats ? (
                        <Spinner size="sm"/>
                      ) : null}
                      <ChevronRight size={14} className="text-slate-300 flex-shrink-0"/>
                    </div>
                  </button>
                )
              })}
            </div>
          )
          // ── Grid view ──
          : (
            <div className="grid md:grid-cols-2 gap-3">
              {sorted.map(m => {
                const stat = playerStats[m.user_id]
                const age = calcAge(m.profile?.date_of_birth)
                const unread = unreadNotes[m.user_id] || 0

                return (
                  <div key={m.id} className="card-hover mb-0" onClick={() => openPlayer(m)}>
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="md" badge={unread}/>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{m.profile?.full_name}</div>
                        <div className="text-xs text-slate-400">{m.role}{m.position_label ? ` · ${m.position_label}` : ''}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {age !== null && <span className="text-xs text-slate-400">{age} سنة</span>}
                          <span className="text-xs text-slate-400">انضم {new Date(m.joined_at).toLocaleDateString('ar-SA')}</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">←</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`rounded-xl p-2 text-center ${!stat || stat.attendancePct === 0 ? 'bg-slate-50' : stat.attendancePct >= 70 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        <div className={`text-sm font-bold ${!stat ? 'text-slate-400' : stat.attendancePct >= 70 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {stat ? `${stat.attendancePct}%` : loadingStats ? '…' : '—'}
                        </div>
                        <div className="text-xs text-slate-400">حضور</div>
                      </div>
                      <div className="bg-yellow-50 rounded-xl p-2 text-center">
                        <div className="text-sm font-bold text-yellow-600">
                          {stat ? stat.points : loadingStats ? '…' : '—'}
                        </div>
                        <div className="text-xs text-slate-400">نقاط</div>
                      </div>
                      <div className={`rounded-xl p-2 text-center ${stat?.injuryCount ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div className={`text-sm font-bold ${stat?.injuryCount ? 'text-red-600' : 'text-slate-600'}`}>
                          {stat ? stat.injuryCount : loadingStats ? '…' : '—'}
                        </div>
                        <div className="text-xs text-slate-400">إصابات</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}
