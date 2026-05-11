import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, Stethoscope, ChevronDown, ChevronUp, Paperclip,
  Send, AlertCircle, X, FileText, Image, Filter
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { medicalService, teamService, permissionService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState, Tabs } from '../../components/ui'
import { canManageTeam, hasPermission } from '../../utils/helpers'

const REPORT_TYPES = [
  { key: 'injury',   label: '🦴 إصابة',    color: 'bg-red-100 text-red-700' },
  { key: 'checkup',  label: '🩺 كشف دوري', color: 'bg-blue-100 text-blue-700' },
  { key: 'followup', label: '📋 متابعة',    color: 'bg-amber-100 text-amber-700' },
  { key: 'other',    label: '📝 أخرى',      color: 'bg-slate-100 text-slate-600' },
]
const STATUS_CONFIG = {
  active:     { label: 'نشط',           color: 'bg-red-100 text-red-700' },
  monitoring: { label: 'تحت المراقبة',  color: 'bg-amber-100 text-amber-700' },
  recovered:  { label: 'متعافٍ',        color: 'bg-emerald-100 text-emerald-700' },
}
const NOTE_TYPES = [
  { key: 'comment',      label: 'تعليق عام' },
  { key: 'followup',     label: 'متابعة' },
  { key: 'prescription', label: 'وصفة دوائية' },
  { key: 'xray',         label: 'أشعة / MRI' },
  { key: 'therapy',      label: 'جلسات علاج' },
]

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
}

function FileIcon({ name }: { name: string }) {
  const isPdf = name.toLowerCase().endsWith('.pdf')
  return isPdf
    ? <FileText size={14} className="text-red-500 flex-shrink-0"/>
    : <Image size={14} className="text-blue-500 flex-shrink-0"/>
}

export default function MedicalPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL filter params (set when navigating from season report)
  const urlPlayer = searchParams.get('player') || ''
  const urlFrom   = searchParams.get('from')   || ''
  const urlTo     = searchParams.get('to')     || ''

  const [reports, setReports] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [myPerms, setMyPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, any[]>>({})
  const [loadingNotes, setLoadingNotes] = useState<string | null>(null)

  // New report form
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    title: '', report_type: 'injury', description: '',
    injury_date: '', status: 'active', player_id: ''
  })
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [saving, setSaving] = useState(false)
  const reportFileRef = useRef<HTMLInputElement>(null)

  // Note form state — shared (only one report expanded at a time)
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState('followup')
  const [noteAttach, setNoteAttach] = useState<File | null>(null)
  const [noteAttachKey, setNoteAttachKey] = useState(0) // increment = reset file input
  const [noteAttachError, setNoteAttachError] = useState('')
  const [noteUploading, setNoteUploading] = useState(false)
  const [sendingNote, setSendingNote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getMyRole(teamId, user.id),
      teamService.getMembers(teamId),
      permissionService.getUserPermissions(teamId, user.id)
    ]).then(async ([role, mems, perms]) => {
      const r = role || ''
      setMyRole(r)
      setMembers(mems.filter((x: any) => x.role === 'player'))
      setMyPerms(perms)
      const isAdm = canManageTeam(r)
      const isDoc = r === 'medical' || perms.includes('manage_medical') || perms.includes('view_medical')
      setLoading(true)
      try {
        const data = isAdm || isDoc
          ? await medicalService.getReports(teamId)
          : await medicalService.getMyReports(teamId, user!.id)
        setReports(data)
      } catch { setReports([]) }
      setLoading(false)
    })
  }, [teamId, user])

  const isAdminUser = canManageTeam(myRole)
  const isDoctor = myRole === 'medical'
    || hasPermission(myPerms, myRole, 'manage_medical' as any)
    || hasPermission(myPerms, myRole, 'view_medical' as any)
  const canWrite = isAdminUser || isDoctor

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    try {
      const data = isAdminUser || isDoctor
        ? await medicalService.getReports(teamId)
        : await medicalService.getMyReports(teamId, user.id)
      setReports(data)
    } catch { setReports([]) }
    setLoading(false)
  }

  async function expandReport(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    // clear note form when switching reports
    setNoteText(''); setNoteAttach(null); setNoteAttachKey(k => k + 1); setNoteAttachError('')
    if (!notes[id]) {
      setLoadingNotes(id)
      const data = await medicalService.getNotes(id)
      setNotes(prev => ({ ...prev, [id]: data }))
      setLoadingNotes(null)
    }
  }

  async function addReport() {
    if (!form.title || !teamId || !user) return
    setSaving(true); setAttachError('')
    let attachment_url: string | null = null

    if (attachFile) {
      setAttachUploading(true)
      const path = `${teamId}/${user.id}/${Date.now()}_${sanitizeFileName(attachFile.name)}`
      const { url, error } = await medicalService.uploadAttachment(attachFile, path)
      setAttachUploading(false)
      if (error || !url) {
        setAttachError('فشل رفع الملف: ' + (error || 'خطأ غير معروف'))
        setSaving(false); return
      }
      attachment_url = url
    }

    const targetPlayer = isAdminUser || isDoctor ? (form.player_id || user.id) : user.id
    await medicalService.createReport({
      team_id: teamId, player_id: targetPlayer,
      title: form.title, report_type: form.report_type,
      description: form.description || null,
      injury_date: form.injury_date || null,
      status: form.status, attachment_url,
      submitted_by: user.id
    })
    await load()
    setShowAdd(false)
    setForm({ title: '', report_type: 'injury', description: '', injury_date: '', status: 'active', player_id: '' })
    setAttachFile(null)
    if (reportFileRef.current) reportFileRef.current.value = ''
    setSaving(false)
  }

  async function addNote(reportId: string) {
    if (!noteText.trim() || !user || !teamId) return
    setSendingNote(true); setNoteAttachError('')
    let attachment_url: string | null = null

    if (noteAttach) {
      setNoteUploading(true)
      const path = `${teamId}/notes/${Date.now()}_${sanitizeFileName(noteAttach.name)}`
      const { url, error } = await medicalService.uploadAttachment(noteAttach, path)
      setNoteUploading(false)
      if (error || !url) {
        setNoteAttachError('فشل رفع الملف: ' + (error || 'خطأ غير معروف'))
        setSendingNote(false); return
      }
      attachment_url = url
    }

    await medicalService.addNote({
      report_id: reportId, team_id: teamId,
      author_id: user.id, note: noteText,
      note_type: noteType, attachment_url
    })
    const updated = await medicalService.getNotes(reportId)
    setNotes(prev => ({ ...prev, [reportId]: updated }))
    // reset form
    setNoteText('')
    setNoteAttach(null)
    setNoteAttachKey(k => k + 1) // forces file input DOM remount → clears browser file selection
    setNoteAttachError('')
    setSendingNote(false)
  }

  async function updateStatus(reportId: string, status: string) {
    setUpdatingStatus(reportId)
    await medicalService.updateReport(reportId, { status })
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r))
    setUpdatingStatus(null)
  }

  // Apply URL filters (player + date range) — used when navigating from season report
  const baseReports = (() => {
    let r = reports
    if (urlPlayer) r = r.filter(rep => rep.player_id === urlPlayer)
    if (urlFrom)   r = r.filter(rep => {
      const d = rep.injury_date || rep.created_at?.slice(0, 10) || ''
      return d >= urlFrom
    })
    if (urlTo)     r = r.filter(rep => {
      const d = rep.injury_date || rep.created_at?.slice(0, 10) || ''
      return d <= urlTo
    })
    return r
  })()

  const filtered = tab === 'all' ? baseReports : baseReports.filter(r => r.status === tab)
  const tabCounts = {
    all: baseReports.length,
    active: baseReports.filter(r => r.status === 'active').length,
    monitoring: baseReports.filter(r => r.status === 'monitoring').length,
    recovered: baseReports.filter(r => r.status === 'recovered').length,
  }

  // Name of filtered player (for banner)
  const filteredPlayerName = urlPlayer
    ? (members.find((m: any) => m.user_id === urlPlayer)?.profile?.full_name || '...')
    : ''

  function clearUrlFilter() {
    setSearchParams({})
  }

  return (
    <div>
      <PageHeader title="التقارير الطبية"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setAttachError('') }}>
            <Plus size={13}/> {canWrite ? 'تقرير جديد' : 'رفع تقرير'}
          </button>
        }/>

      {/* URL filter banner — shown when navigating from season report */}
      {(urlPlayer || urlFrom || urlTo) && (
        <div className="flex items-center gap-2 mb-3 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5 text-xs text-brand-700">
          <Filter size={13} className="flex-shrink-0"/>
          <span className="flex-1">
            <strong>فلتر التقرير الموسمي: </strong>
            {filteredPlayerName && <span>اللاعب: <strong>{filteredPlayerName}</strong> </span>}
            {urlFrom && <span>· من: <strong>{urlFrom}</strong> </span>}
            {urlTo && <span>· إلى: <strong>{urlTo}</strong></span>}
          </span>
          <button onClick={clearUrlFilter}
            className="flex-shrink-0 text-brand-500 hover:text-brand-700 font-bold border-none bg-transparent cursor-pointer">
            ✕ إزالة الفلتر
          </button>
        </div>
      )}

      {!isDoctor && !isAdminUser && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex gap-2 text-xs text-blue-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
          <span>يمكنك رفع تقرير طبي أو صورة من المستشفى. سيطّلع عليه طبيب الفريق ويضيف تعليقه.</span>
        </div>
      )}

      <Tabs tabs={[
        { key: 'all',        label: `الكل (${tabCounts.all})` },
        { key: 'active',     label: `🔴 نشط (${tabCounts.active})` },
        { key: 'monitoring', label: `🟡 مراقبة (${tabCounts.monitoring})` },
        { key: 'recovered',  label: `🟢 تعافٍ (${tabCounts.recovered})` },
      ]} active={tab} onChange={setTab}/>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner/></div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<Stethoscope size={28}/>} title="لا توجد تقارير طبية"/></div>
      ) : (
        <div className="space-y-3 mt-3">
          {filtered.map(report => {
            const rtConf = REPORT_TYPES.find(t => t.key === report.report_type)
            const stConf = STATUS_CONFIG[report.status as keyof typeof STATUS_CONFIG]
            const isExpanded = expandedId === report.id
            const repNotes = notes[report.id] || []

            return (
              <div key={report.id} className="card mb-0 p-0 overflow-hidden">
                {/* Report header */}
                <button className="w-full text-right p-4 border-none bg-transparent cursor-pointer"
                  onClick={() => expandReport(report.id)}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {rtConf && <span className={`badge text-xs ${rtConf.color}`}>{rtConf.label}</span>}
                        <span className={`badge text-xs ${stConf?.color}`}>{stConf?.label}</span>
                        {report.player?.full_name && (isDoctor || isAdminUser) && (
                          <span className="text-xs text-slate-500">👤 {report.player.full_name}</span>
                        )}
                      </div>
                      <div className="font-bold text-sm text-slate-800">{report.title}</div>
                      {report.description && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{report.description}</div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        {report.injury_date && <span>📅 {report.injury_date}</span>}
                        <span>🕐 {new Date(report.created_at).toLocaleDateString('ar-SA')}</span>
                        {repNotes.length > 0 && <span>💬 {repNotes.length} تعليق</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {report.attachment_url && (
                        <button
                          onClick={e => { e.stopPropagation(); setPreviewUrl(report.attachment_url) }}
                          className="text-brand-500 hover:text-brand-700 border-none bg-transparent cursor-pointer p-0.5" title="عرض المرفق">
                          <Paperclip size={15}/>
                        </button>
                      )}
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {/* Status update — doctor/admin */}
                    {(isDoctor || isAdminUser) && (
                      <div className="px-4 py-3 bg-slate-50 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">تحديث الحالة:</span>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button key={key}
                            disabled={report.status === key || updatingStatus === report.id}
                            onClick={() => updateStatus(report.id, key)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${report.status === key ? cfg.color + ' border-transparent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            {updatingStatus === report.id ? <Spinner size="sm"/> : cfg.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Notes thread */}
                    <div className="px-4 py-3 space-y-3">
                      {loadingNotes === report.id ? (
                        <div className="flex justify-center py-4"><Spinner/></div>
                      ) : repNotes.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-2">لا توجد تعليقات بعد</p>
                      ) : (
                        repNotes.map((n: any) => {
                          const ntConf = NOTE_TYPES.find(t => t.key === n.note_type)
                          return (
                            <div key={n.id} className="flex gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {n.author?.full_name?.[0] || '?'}
                              </div>
                              <div className="flex-1 bg-slate-50 rounded-xl p-2.5">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-slate-700">{n.author?.full_name}</span>
                                  {ntConf && <span className="badge bg-brand-50 text-brand-700 text-xs">{ntConf.label}</span>}
                                  <span className="text-xs text-slate-400 mr-auto">{new Date(n.created_at).toLocaleDateString('ar-SA')}</span>
                                </div>
                                <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
                                {n.attachment_url && (
                                  <button
                                    onClick={() => setPreviewUrl(n.attachment_url)}
                                    className="inline-flex items-center gap-1 text-xs text-brand-600 mt-1.5 hover:bg-brand-100 bg-brand-50 rounded-lg px-2 py-1 border-none cursor-pointer transition-colors">
                                    <Paperclip size={11}/> عرض المرفق
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}

                      {/* Add note form — doctor/admin */}
                      {canWrite && (
                        <div className="border-t border-slate-100 pt-3">
                          {/* Note type selector */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {NOTE_TYPES.map(t => (
                              <button key={t.key} onClick={() => setNoteType(t.key)}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${noteType === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {/* Attachment preview */}
                          {noteAttach && (
                            <div className="flex items-center gap-2 mb-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                              <FileIcon name={noteAttach.name}/>
                              <span className="text-xs text-brand-700 font-bold flex-1 truncate">{noteAttach.name}</span>
                              <span className="text-xs text-slate-400">({(noteAttach.size / 1024).toFixed(0)} KB)</span>
                              <button
                                onClick={() => { setNoteAttach(null); setNoteAttachKey(k => k + 1); setNoteAttachError('') }}
                                className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer flex-shrink-0">
                                <X size={13}/>
                              </button>
                            </div>
                          )}

                          {/* Error message */}
                          {noteAttachError && (
                            <div className="flex items-center gap-2 mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                              <AlertCircle size={12} className="flex-shrink-0"/>
                              {noteAttachError}
                            </div>
                          )}

                          {/* Text + actions row */}
                          <div className="flex gap-2">
                            <textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)}
                              placeholder="اكتب تعليق أو متابعة..."
                              className="form-input flex-1 resize-none text-xs"/>
                            <div className="flex flex-col gap-1">
                              {/* Attach file button */}
                              <label
                                className={`cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg transition-colors border-none ${noteAttach ? 'bg-brand-100' : 'bg-slate-100 hover:bg-slate-200'}`}
                                title="إرفاق ملف">
                                {noteUploading
                                  ? <Spinner size="sm"/>
                                  : <Paperclip size={14} className={noteAttach ? 'text-brand-600' : 'text-slate-500'}/>
                                }
                                <input
                                  key={noteAttachKey}
                                  type="file"
                                  className="hidden"
                                  accept="image/*,.pdf"
                                  onChange={e => {
                                    const f = e.target.files?.[0] || null
                                    setNoteAttach(f)
                                    setNoteAttachError('')
                                  }}
                                />
                              </label>

                              {/* Send button */}
                              <button
                                onClick={() => addNote(report.id)}
                                disabled={sendingNote || !noteText.trim() || noteUploading}
                                className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50"
                                title="إرسال">
                                {sendingNote ? <Spinner size="sm"/> : <Send size={13}/>}
                              </button>
                            </div>
                          </div>

                          {!noteAttach && (
                            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                              <Paperclip size={9}/> يمكنك إرفاق صورة أو PDF (حتى 20 MB)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Report Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAttachFile(null); setAttachError('') }}
        title={canWrite ? '🏥 تقرير طبي جديد' : '📋 رفع تقرير طبي'} width="max-w-lg">

        {(isDoctor || isAdminUser) && members.length > 0 && (
          <FormField label="اللاعب">
            <select className="form-input" value={form.player_id} onChange={e => set('player_id', e.target.value)}>
              <option value="">— اختر لاعباً —</option>
              {members.map((m: any) => (
                <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="نوع التقرير">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_TYPES.map(t => (
              <button key={t.key} onClick={() => set('report_type', t.key)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.report_type === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="العنوان" required>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="إصابة في الركبة اليمنى..."/>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="تاريخ الإصابة">
            <input className="form-input" type="date" value={form.injury_date} onChange={e => set('injury_date', e.target.value)}/>
          </FormField>
          <FormField label="الحالة">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="التفاصيل">
          <textarea className="form-input" rows={3} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="وصف الإصابة أو الحالة الطبية..."/>
        </FormField>

        {/* File attachment for report */}
        <FormField label="إرفاق صورة / تقرير مستشفى (اختياري)">
          {attachFile ? (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5">
              <FileIcon name={attachFile.name}/>
              <span className="text-sm text-brand-700 font-bold flex-1 truncate">{attachFile.name}</span>
              <span className="text-xs text-slate-400">({(attachFile.size / 1024).toFixed(0)} KB)</span>
              <button
                onClick={() => { setAttachFile(null); setAttachError(''); if (reportFileRef.current) reportFileRef.current.value = '' }}
                className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer flex-shrink-0">
                <X size={14}/>
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
              <Paperclip size={16} className="text-slate-400 flex-shrink-0"/>
              <span className="text-sm text-slate-500">اضغط لاختيار ملف (صورة أو PDF — حتى 20 MB)</span>
              <input
                ref={reportFileRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={e => { setAttachFile(e.target.files?.[0] || null); setAttachError('') }}
              />
            </label>
          )}
          {attachError && (
            <div className="flex items-center gap-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              <AlertCircle size={12} className="flex-shrink-0"/>
              {attachError}
            </div>
          )}
          {attachUploading && (
            <div className="flex items-center gap-2 mt-2 text-xs text-brand-600">
              <Spinner size="sm"/> جارٍ رفع الملف...
            </div>
          )}
        </FormField>

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setAttachFile(null); setAttachError('') }}>إلغاء</button>
          <button className="btn btn-primary" onClick={addReport} disabled={saving || attachUploading || !form.title}>
            {saving ? <Spinner size="sm"/> : 'إرسال التقرير'}
          </button>
        </div>
      </Modal>

      {/* ── Attachment preview modal ── */}
      {previewUrl && (() => {
        const isPdf = previewUrl.toLowerCase().includes('.pdf') || previewUrl.toLowerCase().includes('application/pdf')
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setPreviewUrl(null)}>
            <div
              className="relative bg-white rounded-2xl shadow-2xl overflow-hidden"
              style={{ maxWidth: '92vw', maxHeight: '92vh', width: isPdf ? '800px' : 'auto' }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  {isPdf ? <FileText size={15} className="text-red-500"/> : <Image size={15} className="text-blue-500"/>}
                  {isPdf ? 'مستند PDF' : 'صورة المرفق'}
                </span>
                <div className="flex items-center gap-2">
                  <a href={previewUrl} download target="_blank" rel="noreferrer"
                    className="text-xs text-brand-600 hover:text-brand-800 font-bold border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-1 no-underline">
                    تنزيل
                  </a>
                  <button
                    onClick={() => setPreviewUrl(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-500 border-none cursor-pointer transition-colors text-base font-bold">
                    ✕
                  </button>
                </div>
              </div>
              {/* Content */}
              {isPdf ? (
                <iframe
                  src={previewUrl}
                  title="مستند PDF"
                  style={{ width: '800px', maxWidth: '92vw', height: '80vh' }}
                  className="block border-0"/>
              ) : (
                <div className="flex items-center justify-center p-3 bg-slate-900">
                  <img
                    src={previewUrl}
                    alt="مرفق"
                    style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain' }}
                    className="rounded-xl block"/>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
