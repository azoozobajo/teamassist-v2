import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Stethoscope, ChevronDown, ChevronUp, Paperclip, Send, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { medicalService, teamService, permissionService } from '../../services'
import { supabase } from '../../lib/supabase'
import { Spinner, PageHeader, Modal, FormField, EmptyState, Tabs } from '../../components/ui'
import { canManageTeam, hasPermission } from '../../utils/helpers'

const REPORT_TYPES = [
  { key: 'injury',   label: '🦴 إصابة',         color: 'bg-red-100 text-red-700' },
  { key: 'checkup',  label: '🩺 كشف دوري',      color: 'bg-blue-100 text-blue-700' },
  { key: 'followup', label: '📋 متابعة',         color: 'bg-amber-100 text-amber-700' },
  { key: 'other',    label: '📝 أخرى',           color: 'bg-slate-100 text-slate-600' },
]
const STATUS_CONFIG = {
  active:     { label: 'نشط',      color: 'bg-red-100 text-red-700' },
  monitoring: { label: 'تحت المراقبة', color: 'bg-amber-100 text-amber-700' },
  recovered:  { label: 'متعافٍ',   color: 'bg-emerald-100 text-emerald-700' },
}
const NOTE_TYPES = [
  { key: 'comment',      label: 'تعليق عام' },
  { key: 'followup',     label: 'متابعة' },
  { key: 'prescription', label: 'وصفة دوائية' },
  { key: 'xray',         label: 'أشعة / MRI' },
  { key: 'therapy',      label: 'جلسات علاج' },
]

export default function MedicalPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [reports, setReports] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [myPerms, setMyPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, any[]>>({})
  const [loadingNotes, setLoadingNotes] = useState<string | null>(null)

  // New report form
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', report_type: 'injury', description: '', injury_date: '', status: 'active', player_id: '' })
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  // Note form
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState('followup')
  const [noteAttach, setNoteAttach] = useState<File | null>(null)
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
      // Load after we know role/perms
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
    if (!notes[id]) {
      setLoadingNotes(id)
      const data = await medicalService.getNotes(id)
      setNotes(prev => ({ ...prev, [id]: data }))
      setLoadingNotes(null)
    }
  }

  async function addReport() {
    if (!form.title || !teamId || !user) return
    setSaving(true)
    let attachment_url: string | null = null
    if (attachFile) {
      const path = `${teamId}/${user.id}/${Date.now()}_${attachFile.name}`
      attachment_url = await medicalService.uploadAttachment(attachFile, path)
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
    setAttachFile(null); setSaving(false)
  }

  async function addNote(reportId: string) {
    if (!noteText.trim() || !user || !teamId) return
    setSendingNote(true)
    let attachment_url: string | null = null
    if (noteAttach) {
      const path = `${teamId}/notes/${Date.now()}_${noteAttach.name}`
      attachment_url = await medicalService.uploadAttachment(noteAttach, path)
    }
    await medicalService.addNote({
      report_id: reportId, team_id: teamId,
      author_id: user.id, note: noteText,
      note_type: noteType, attachment_url
    })
    const updated = await medicalService.getNotes(reportId)
    setNotes(prev => ({ ...prev, [reportId]: updated }))
    setNoteText(''); setNoteAttach(null); setSendingNote(false)
  }

  async function updateStatus(reportId: string, status: string) {
    setUpdatingStatus(reportId)
    await medicalService.updateReport(reportId, { status })
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r))
    setUpdatingStatus(null)
  }

  const isAdminUser = canManageTeam(myRole)
  const isDoctor = myRole === 'medical' || hasPermission(myPerms, myRole, 'manage_medical' as any) || hasPermission(myPerms, myRole, 'view_medical' as any)
  const canWrite = isAdminUser || isDoctor || hasPermission(myPerms, myRole, 'manage_medical' as any)

  const filtered = tab === 'all' ? reports : reports.filter(r => r.status === tab)

  const tabCounts = {
    all: reports.length,
    active: reports.filter(r => r.status === 'active').length,
    monitoring: reports.filter(r => r.status === 'monitoring').length,
    recovered: reports.filter(r => r.status === 'recovered').length,
  }

  return (
    <div>
      <PageHeader title="التقارير الطبية"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <Plus size={13}/> {isDoctor || isAdminUser ? 'تقرير جديد' : 'رفع تقرير'}
          </button>
        }/>

      {/* Info banner for players */}
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
                {/* Report header — click to expand */}
                <button className="w-full text-right p-4 border-none bg-transparent cursor-pointer"
                  onClick={() => expandReport(report.id)}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {rtConf && <span className={`badge text-xs ${rtConf.color}`}>{rtConf.label}</span>}
                        <span className={`badge text-xs ${stConf?.color}`}>{stConf?.label}</span>
                        {report.player?.full_name && isDoctor && (
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
                        <a href={report.attachment_url} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-brand-500 hover:text-brand-700">
                          <Paperclip size={15}/>
                        </a>
                      )}
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {/* Status change (doctor/admin only) */}
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
                                  <a href={n.attachment_url} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1 text-xs text-brand-600 mt-1.5 hover:underline">
                                    <Paperclip size={11}/> مرفق
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}

                      {/* Add note — doctor/admin only */}
                      {(isDoctor || isAdminUser) && (
                        <div className="border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {NOTE_TYPES.map(t => (
                              <button key={t.key} onClick={() => setNoteType(t.key)}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${noteType === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)}
                              placeholder="اكتب تعليق أو متابعة..."
                              className="form-input flex-1 resize-none text-xs"/>
                            <div className="flex flex-col gap-1">
                              <label className="cursor-pointer flex items-center justify-center w-8 h-8 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                                <Paperclip size={14} className="text-slate-500"/>
                                <input type="file" className="hidden" accept="image/*,.pdf"
                                  onChange={e => setNoteAttach(e.target.files?.[0] || null)}/>
                              </label>
                              {noteAttach && <span className="text-[10px] text-brand-600 text-center">مرفق</span>}
                              <button onClick={() => addNote(report.id)} disabled={sendingNote || !noteText.trim()}
                                className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50">
                                {sendingNote ? <Spinner size="sm"/> : <Send size={13}/>}
                              </button>
                            </div>
                          </div>
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
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAttachFile(null) }}
        title={isDoctor || isAdminUser ? '🏥 تقرير طبي جديد' : '📋 رفع تقرير طبي'} width="max-w-lg">

        {/* Player selector — only for doctor/admin */}
        {(isDoctor || isAdminUser) && members.length > 0 && (
          <FormField label="اللاعب">
            <select className="form-input" value={form.player_id} onChange={e => set('player_id', e.target.value)}>
              <option value="">— اختر لاعباً (أو اتركه فارغاً لتقرير عام) —</option>
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
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="إصابة في الركبة اليمنى..."/>
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
          <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="وصف الإصابة أو الحالة الطبية..."/>
        </FormField>

        <FormField label="إرفاق صورة / تقرير مستشفى (اختياري)">
          <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 transition-colors">
            <Paperclip size={16} className="text-slate-400"/>
            <span className="text-sm text-slate-500">{attachFile ? attachFile.name : 'اضغط لاختيار ملف (صورة أو PDF)'}</span>
            <input type="file" className="hidden" accept="image/*,.pdf"
              onChange={e => setAttachFile(e.target.files?.[0] || null)}/>
          </label>
        </FormField>

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addReport} disabled={saving || !form.title}>
            {saving ? <Spinner size="sm"/> : 'إرسال التقرير'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
