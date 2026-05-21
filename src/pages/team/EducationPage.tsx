import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Award, BookOpen, CalendarDays, CheckSquare, Download,
  Edit2, FileText, GraduationCap, MapPin, Plus, Trash2, UserRound
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { educationService, notificationService, teamService } from '../../services'
import { EmptyState, FormField, Modal, PageHeader, Spinner } from '../../components/ui'
import { canManageEducation, formatDate } from '../../utils/helpers'

const EDUCATION_TYPES = [
  ['lecture', 'محاضرة'], ['course', 'دورة'], ['workshop', 'ورشة عمل'],
  ['training', 'تدريب'], ['awareness', 'توعية'], ['meeting', 'لقاء'],
  ['quiz', 'اختبار'], ['other', 'أخرى'],
]
const EDUCATION_CATEGORIES = [
  ['psychological', 'نفسي'], ['medical', 'طبي'], ['media', 'إعلامي'],
  ['discipline', 'انضباط'], ['nutrition', 'تغذية'], ['tactical', 'تكتيكي'],
  ['legal', 'قانوني'], ['professional', 'احترافي'], ['social', 'اجتماعي'], ['other', 'أخرى'],
]
const ATT_GROUPS = ['الكل','اللاعبون فقط','المدربون فقط','اللاعبون والمدربون','الإداريون فقط','مجموعة مخصصة']

const labelOf = (items: string[][], value?: string) => items.find(([v]) => v === value)?.[1] || 'أخرى'

export default function EducationPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [team, setTeam] = useState<any>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [mainTab, setMainTab] = useState<'courses' | 'library'>('courses')
  const [showAdd, setShowAdd] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [editRow, setEditRow] = useState<any>(null)
  const [contentRow, setContentRow] = useState<any>(null)
  const [certificateRow, setCertificateRow] = useState<any>(null)
  const [certificatePlayers, setCertificatePlayers] = useState<any[]>([])
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = {
    title: '',
    start_datetime: '',
    end_datetime: '',
    location: '',
    map_url: '',
    att_group: 'اللاعبون فقط',
    selectedMembers: [] as string[],
    presenter_name: '',
    presenters_text: '',
    provider_type: 'club',
    provider_name: '',
    education_type: 'lecture',
    education_category: 'professional',
    location_detail: '',
    online_url: '',
    content_text: '',
    content_url: '',
    content_notes: '',
    description: '',
    source_template_id: '',
  }
  const [form, setForm] = useState(emptyForm)

  const canManage = canManageEducation(myRole)
  const now = new Date()

  useEffect(() => {
    if (!teamId || !user) return
    load()
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(ms => setMembers(ms.filter((m: any) => m.role !== 'parent')))
    teamService.getTeam(teamId).then(setTeam)
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [data, templateRows] = await Promise.all([
      educationService.getAll(teamId),
      educationService.getTemplates(teamId),
    ])
    setRows(data)
    setTemplates(templateRows)
    setLoading(false)
  }

  const stats = useMemo(() => {
    const past = rows.filter(r => new Date(r.event?.start_datetime) <= now).length
    const upcoming = rows.length - past
    const byCategory: Record<string, number> = {}
    rows.forEach(r => {
      const key = r.education_category || 'other'
      byCategory[key] = (byCategory[key] || 0) + 1
    })
    return { total: rows.length, past, upcoming, byCategory }
  }, [rows])

  const templateUsage = useMemo(() => {
    const usage: Record<string, number> = {}
    rows.forEach(row => {
      if (row.source_template_id) {
        usage[row.source_template_id] = (usage[row.source_template_id] || 0) + 1
      }
    })
    return usage
  }, [rows])

  function setF(k: string, v: any) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function presenterNamesFromText(text: string) {
    return text.split(/[,،\n]/).map(x => x.trim()).filter(Boolean)
  }

  function resetForm() {
    setForm(emptyForm)
    setEditRow(null)
  }

  function fillFromTemplate(template: any) {
    setForm(p => ({
      ...p,
      title: template.title || '',
      provider_type: template.provider_type || 'club',
      provider_name: template.provider_name || '',
      presenter_name: template.presenter_names?.[0] || '',
      presenters_text: (template.presenter_names || []).join('، '),
      education_type: template.education_type || 'lecture',
      education_category: template.education_category || 'professional',
      location: template.location_detail || '',
      location_detail: template.location_detail || '',
      online_url: template.online_url || '',
      content_text: template.content_text || '',
      content_url: template.content_url || '',
      content_notes: template.content_notes || '',
      description: template.description || '',
      source_template_id: template.id || '',
    }))
  }

  function openEdit(row: any) {
    const event = row.event || {}
    setEditRow(row)
    setForm({
      ...emptyForm,
      title: event.title || '',
      start_datetime: event.start_datetime?.slice(0, 16) || '',
      end_datetime: event.end_datetime?.slice(0, 16) || '',
      location: event.location || row.location_detail || '',
      map_url: event.map_url || '',
      att_group: event.att_group || 'اللاعبون فقط',
      selectedMembers: event.att_member_ids || [],
      presenter_name: row.presenter_name || row.presenter_names?.[0] || '',
      presenters_text: (row.presenter_names?.length ? row.presenter_names : row.presenter_name ? [row.presenter_name] : []).join('، '),
      provider_type: row.provider_type || 'club',
      provider_name: row.provider_name || '',
      education_type: row.education_type || 'lecture',
      education_category: row.education_category || 'professional',
      location_detail: row.location_detail || event.location || '',
      online_url: row.online_url || '',
      content_text: row.content_text || '',
      content_url: row.content_url || '',
      content_notes: row.content_notes || '',
      description: row.description || event.description || '',
      source_template_id: row.source_template_id || '',
    })
    setShowAdd(true)
  }

  function toggleMember(uid: string) {
    setForm(p => ({
      ...p,
      selectedMembers: p.selectedMembers.includes(uid)
        ? p.selectedMembers.filter(x => x !== uid)
        : [...p.selectedMembers, uid],
    }))
  }

  function eventPayload() {
    if (!teamId || !user || !form.title.trim() || !form.start_datetime) return
    const attMemberIds = form.att_group === 'مجموعة مخصصة' ? form.selectedMembers : null
    return {
      title: form.title.trim(),
      start_datetime: form.start_datetime,
      end_datetime: form.end_datetime || null,
      location: form.location || form.location_detail || null,
      map_url: form.map_url || null,
      att_group: form.att_group,
      att_member_ids: attMemberIds,
      description: form.description || null,
      created_by: user.id,
    }
  }

  function educationPayload() {
    const presenterNames = presenterNamesFromText(form.presenters_text || form.presenter_name)
    return {
      team_id: teamId,
      presenter_name: presenterNames[0] || null,
      presenter_names: presenterNames,
      provider_type: form.provider_type,
      provider_name: form.provider_name || null,
      education_type: form.education_type,
      education_category: form.education_category,
      location_detail: form.location_detail || form.location || null,
      online_url: form.online_url || null,
      content_text: form.content_text || null,
      content_url: form.content_url || null,
      content_notes: form.content_notes || null,
      description: form.description || null,
      source_template_id: form.source_template_id || null,
      created_by: user?.id || null,
    }
  }

  async function saveCourse() {
    if (!teamId || !user || !form.title.trim() || !form.start_datetime) return
    setSaving(true)
    const ev = eventPayload()
    if (!ev) { setSaving(false); return }
    const { error } = editRow
      ? await educationService.updateCourse(editRow.event_id, ev, educationPayload())
      : await educationService.createCourse(teamId, user.id, ev, educationPayload())
    if (!error) {
      await notificationService.createForTeam(teamId, `${editRow ? 'تعديل نشاط تعليم' : 'موعد تعليم جديد'}: ${form.title}`, formatDate(form.start_datetime), 'event', user.id)
      setShowAdd(false)
      resetForm()
      await load()
    }
    setSaving(false)
  }

  async function deleteCourse() {
    if (!confirmDelete) return
    setSaving(true)
    await educationService.deleteCourse(confirmDelete.event_id)
    setConfirmDelete(null)
    await load()
    setSaving(false)
  }

  async function saveContent() {
    if (!contentRow) return
    setSaving(true)
    await educationService.updateContent(contentRow.event_id, {
      content_text: form.content_text || null,
      content_url: form.content_url || null,
      content_notes: form.content_notes || null,
      attachment_url: form.online_url || contentRow.attachment_url || null,
    })
    setContentRow(null)
    await load()
    setSaving(false)
  }

  async function saveTemplateCourse() {
    if (!teamId || !user || !form.title.trim()) return
    setSaving(true)
    const presenterNames = presenterNamesFromText(form.presenters_text || form.presenter_name)
    await educationService.saveTemplate({
      team_id: teamId,
      title: form.title.trim(),
      provider_type: form.provider_type || 'club',
      provider_name: form.provider_name || null,
      presenter_names: presenterNames,
      education_type: form.education_type || 'lecture',
      education_category: form.education_category || 'professional',
      location_detail: form.location_detail || form.location || null,
      online_url: form.online_url || null,
      content_text: form.content_text || null,
      content_url: form.content_url || null,
      content_notes: form.content_notes || null,
      description: form.description || null,
      created_by: user.id,
    })
    setShowTemplate(false)
    resetForm()
    await load()
    setSaving(false)
  }

  async function openCertificates(row: any) {
    setCertificateRow(row)
    const players = await educationService.getCertificatePlayers(row.event_id)
    setCertificatePlayers(players)
  }

  function printCertificate(player: any) {
    if (!certificateRow) return
    const event = certificateRow.event || {}
    const presenters = (certificateRow.presenter_names?.length ? certificateRow.presenter_names : certificateRow.presenter_name ? [certificateRow.presenter_name] : []).join('، ')
    const courseType = labelOf(EDUCATION_TYPES, certificateRow.education_type)
    const html = `
      <!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <title>شهادة ${player.profile?.full_name || ''}</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;background:#f8fafc;margin:0;padding:40px;color:#0f172a}
        .cert{background:white;border:10px solid #0f766e;min-height:620px;padding:42px;text-align:center;position:relative}
        .logo{width:92px;height:92px;object-fit:contain;margin:0 auto 18px}
        h1{font-size:38px;margin:10px 0;color:#0f766e}
        .club{font-size:20px;font-weight:700;margin-bottom:30px}
        .body{font-size:24px;line-height:2.1;margin:34px auto;max-width:850px}
        .name{font-size:34px;font-weight:900;color:#0f766e}
        .foot{display:flex;justify-content:space-between;margin-top:55px;font-size:16px;color:#475569}
        @media print{body{background:white;padding:0}.cert{border-width:8px;min-height:90vh}button{display:none}}
      </style></head><body>
      <div class="cert">
        ${team?.logo_url ? `<img class="logo" src="${team.logo_url}" />` : ''}
        <h1>شهادة حضور</h1>
        <div class="club">يشهد ${team?.name || 'النادي'} أن</div>
        <div class="name">${player.profile?.full_name || 'اسم اللاعب'}</div>
        <div class="body">
          قد أتم حضور ${courseType} <strong>${event.title || ''}</strong><br/>
          في يوم وتاريخ ${formatDate(event.start_datetime)} والمقامة في ${certificateRow.location_detail || event.location || '—'}<br/>
          ${presenters ? `بتقديم ${presenters}` : ''}
        </div>
        <div class="club">وتمنياتنا له بالتوفيق</div>
        <div class="foot"><span>إدارة ${team?.name || 'النادي'}</span><span>${new Date().toLocaleDateString('ar-SA')}</span></div>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  return (
    <div>
      <PageHeader title="التعليم"
        action={canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => {
            resetForm()
            if (mainTab === 'library') setShowTemplate(true)
            else setShowAdd(true)
          }}>
            <Plus size={13}/> {mainTab === 'library' ? 'إضافة دورة للمكتبة' : 'إضافة نشاط'}
          </button>
        )}
      />

      <div className="flex gap-2 mb-4">
        <button
          className={`btn btn-sm ${mainTab === 'courses' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMainTab('courses')}
        >
          <CalendarDays size={13}/> الأنشطة
        </button>
        <button
          className={`btn btn-sm ${mainTab === 'library' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMainTab('library')}
        >
          <BookOpen size={13}/> مكتبة الدورات
        </button>
      </div>

      {mainTab === 'courses' ? (
      <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card text-center py-3">
          <div className="text-2xl font-extrabold text-slate-800">{stats.total}</div>
          <div className="text-xs text-slate-400 font-bold">كل الأنشطة</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-2xl font-extrabold text-emerald-700">{stats.past}</div>
          <div className="text-xs text-slate-400 font-bold">منتهية</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-2xl font-extrabold text-blue-700">{stats.upcoming}</div>
          <div className="text-xs text-slate-400 font-bold">قادمة</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="text-xs font-extrabold text-slate-500 mb-2">تصنيفات التعليم</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byCategory).length === 0
            ? <span className="text-xs text-slate-400">لا توجد بيانات</span>
            : Object.entries(stats.byCategory).map(([key, count]) => (
              <span key={key} className="text-xs font-bold bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                {labelOf(EDUCATION_CATEGORIES, key)}: {count}
              </span>
            ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : rows.length === 0 ? (
        <div className="card"><EmptyState title="لا توجد أنشطة تعليمية بعد"/></div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const event = row.event || {}
            const isPast = new Date(event.start_datetime) <= now
            return (
              <div key={row.id} className={`card border-r-4 ${isPast ? 'border-emerald-500' : 'border-blue-500'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GraduationCap size={17} className="text-teal-600"/>
                      <h3 className="font-extrabold text-sm text-slate-800 truncate">{event.title}</h3>
                      <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${isPast ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                        {isPast ? 'منتهي' : 'قادم'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12}/>{formatDate(event.start_datetime)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin size={12}/>{row.location_detail || event.location || 'بدون موقع'}</span>
                      {(row.presenter_names?.length || row.presenter_name) && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound size={12}/>
                          {(row.presenter_names?.length ? row.presenter_names : [row.presenter_name]).join('، ')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold rounded-lg bg-teal-50 text-teal-700 px-2 py-0.5">{labelOf(EDUCATION_TYPES, row.education_type)}</span>
                      <span className="text-[10px] font-bold rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5">{labelOf(EDUCATION_CATEGORIES, row.education_category)}</span>
                      {row.provider_name && (
                        <span className="text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 px-2 py-0.5">
                          {row.provider_type === 'external' ? 'خارجي' : 'النادي'}: {row.provider_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end flex-shrink-0">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/team/${teamId}/attendance`)}>
                      <CheckSquare size={13}/> التحضير
                    </button>
                    {canManage && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
                          <Edit2 size={13}/> تعديل
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          setContentRow(row)
                          setForm(p => ({
                            ...p,
                            content_text: row.content_text || '',
                            content_url: row.content_url || '',
                            content_notes: row.content_notes || '',
                            online_url: row.attachment_url || row.online_url || '',
                          }))
                        }}>
                          <FileText size={13}/> المحتوى
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openCertificates(row)}>
                          <Award size={13}/> الشهادات
                        </button>
                        <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDelete(row)}>
                          <Trash2 size={13}/> حذف
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <BookOpen size={16} className="text-teal-600"/> مكتبة الدورات
                </h3>
                <p className="text-xs text-slate-400 mt-1">أضف الدورات مرة واحدة، ثم كررها كمواعيد تعليمية في أي موسم أو تاريخ.</p>
              </div>
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowTemplate(true) }}>
                  <Plus size={13}/> إضافة دورة للمكتبة
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><Spinner/></div>
            ) : templates.length === 0 ? (
              <EmptyState title="لا توجد دورات محفوظة في المكتبة بعد"/>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {templates.map(t => {
                  const presenters = t.presenter_names?.length ? t.presenter_names : []
                  return (
                    <div key={t.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-slate-800 truncate">{t.title}</div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {labelOf(EDUCATION_TYPES, t.education_type)} · {labelOf(EDUCATION_CATEGORIES, t.education_category)}
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold rounded-lg bg-white border border-slate-100 text-teal-700 px-2 py-1">
                          تكررت {templateUsage[t.id] || 0}
                        </span>
                      </div>

                      <div className="space-y-1.5 mt-3 text-[11px] text-slate-500">
                        {presenters.length > 0 && (
                          <div className="flex items-center gap-1">
                            <UserRound size={12}/>
                            <span className="truncate">{presenters.join('، ')}</span>
                          </div>
                        )}
                        {t.provider_name && <div>{t.provider_type === 'external' ? 'جهة خارجية' : 'النادي'}: {t.provider_name}</div>}
                        {t.location_detail && <div className="flex items-center gap-1"><MapPin size={12}/>{t.location_detail}</div>}
                      </div>

                      {canManage && (
                        <button className="btn btn-primary btn-sm w-full mt-3" onClick={() => {
                          fillFromTemplate(t)
                          setMainTab('courses')
                          setShowAdd(true)
                        }}>
                          <CalendarDays size={13}/> تكرار الدورة كموعد
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); resetForm() }} title={editRow ? 'تعديل نشاط تعليمي' : 'إضافة نشاط تعليمي'} width="max-w-lg">
        <FormField label="العنوان" required>
          <input className="form-input" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="دورة التعامل مع الإعلام"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="البداية" required>
            <input className="form-input" type="datetime-local" value={form.start_datetime} onChange={e => setF('start_datetime', e.target.value)}/>
          </FormField>
          <FormField label="النهاية">
            <input className="form-input" type="datetime-local" value={form.end_datetime} onChange={e => setF('end_datetime', e.target.value)}/>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="نوع النشاط">
            <select className="form-input" value={form.education_type} onChange={e => setF('education_type', e.target.value)}>
              {EDUCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="التصنيف">
            <select className="form-input" value={form.education_category} onChange={e => setF('education_category', e.target.value)}>
              {EDUCATION_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="المقدمون / المحاضرون">
            <textarea className="form-input min-h-[72px]" value={form.presenters_text || form.presenter_name} onChange={e => { setF('presenters_text', e.target.value); setF('presenter_name', presenterNamesFromText(e.target.value)[0] || '') }} placeholder="اكتب كل مقدم في سطر، أو افصل بينهم بفاصلة"/>
          </FormField>
          <FormField label="الجهة المقدمة">
            <input className="form-input" value={form.provider_name} onChange={e => setF('provider_name', e.target.value)} placeholder="اسم الجهة"/>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="مصدر الجهة">
            <select className="form-input" value={form.provider_type} onChange={e => setF('provider_type', e.target.value)}>
              <option value="club">من النادي</option>
              <option value="external">جهة خارجية</option>
            </select>
          </FormField>
          <FormField label="مكان النشاط">
            <input className="form-input" value={form.location_detail} onChange={e => { setF('location_detail', e.target.value); setF('location', e.target.value) }} placeholder="قاعة، ملعب، أونلاين..."/>
          </FormField>
        </div>
        <FormField label="الفئة المستهدفة">
          <select className="form-input" value={form.att_group} onChange={e => setF('att_group', e.target.value)}>
            {ATT_GROUPS.map(g => <option key={g}>{g}</option>)}
          </select>
        </FormField>
        {form.att_group === 'مجموعة مخصصة' && (
          <FormField label="الأعضاء المدعوون">
            <div className="border border-slate-200 rounded-xl max-h-44 overflow-y-auto">
              {members.map((m: any) => (
                <button key={m.id} type="button" onClick={() => toggleMember(m.user_id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm border-b border-slate-50 last:border-0 ${form.selectedMembers.includes(m.user_id) ? 'bg-teal-50 text-teal-700 font-bold' : 'hover:bg-slate-50'}`}>
                  <span>{m.profile?.full_name}</span>
                  <span className="text-xs text-slate-400">{m.role}</span>
                </button>
              ))}
            </div>
          </FormField>
        )}
        <FormField label="رابط المادة أو البث">
          <input className="form-input" value={form.online_url} onChange={e => setF('online_url', e.target.value)} placeholder="https://..."/>
        </FormField>
        <FormField label="محتوى الدورة">
          <textarea className="form-input min-h-[90px]" value={form.content_text} onChange={e => setF('content_text', e.target.value)} placeholder="محاور الدورة، روابط مهمة، واجبات أو نقاط مختصرة..."/>
        </FormField>
        <FormField label="رابط محتوى إضافي">
          <input className="form-input" value={form.content_url} onChange={e => setF('content_url', e.target.value)} placeholder="رابط ملف أو فيديو أو عرض"/>
        </FormField>
        <FormField label="وصف مختصر">
          <textarea className="form-input min-h-[80px]" value={form.description} onChange={e => setF('description', e.target.value)} placeholder="محاور النشاط أو ملاحظات..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowAdd(false); resetForm() }}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveCourse}
            disabled={saving || !form.title.trim() || !form.start_datetime || (form.att_group === 'مجموعة مخصصة' && form.selectedMembers.length === 0)}>
            {saving ? <Spinner size="sm"/> : <><Plus size={13}/> {editRow ? 'حفظ' : 'إضافة'}</>}
          </button>
        </div>
      </Modal>

      <Modal open={showTemplate} onClose={() => { setShowTemplate(false); resetForm() }} title="إضافة دورة إلى المكتبة" width="max-w-lg">
        <FormField label="اسم الدورة" required>
          <input className="form-input" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="دورة التعامل مع الإعلام"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="نوع الدورة">
            <select className="form-input" value={form.education_type} onChange={e => setF('education_type', e.target.value)}>
              {EDUCATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="التصنيف">
            <select className="form-input" value={form.education_category} onChange={e => setF('education_category', e.target.value)}>
              {EDUCATION_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="المقدمون / المحاضرون">
          <textarea className="form-input min-h-[72px]" value={form.presenters_text || form.presenter_name} onChange={e => { setF('presenters_text', e.target.value); setF('presenter_name', presenterNamesFromText(e.target.value)[0] || '') }} placeholder="اكتب كل مقدم في سطر، أو افصل بينهم بفاصلة"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="مصدر الجهة">
            <select className="form-input" value={form.provider_type} onChange={e => setF('provider_type', e.target.value)}>
              <option value="club">من النادي</option>
              <option value="external">جهة خارجية</option>
            </select>
          </FormField>
          <FormField label="الجهة المقدمة">
            <input className="form-input" value={form.provider_name} onChange={e => setF('provider_name', e.target.value)} placeholder="اسم الجهة"/>
          </FormField>
        </div>
        <FormField label="المكان الافتراضي">
          <input className="form-input" value={form.location_detail} onChange={e => setF('location_detail', e.target.value)} placeholder="قاعة، ملعب، أونلاين..."/>
        </FormField>
        <FormField label="رابط المادة أو البث">
          <input className="form-input" value={form.online_url} onChange={e => setF('online_url', e.target.value)} placeholder="https://..."/>
        </FormField>
        <FormField label="محتوى الدورة">
          <textarea className="form-input min-h-[90px]" value={form.content_text} onChange={e => setF('content_text', e.target.value)} placeholder="محاور الدورة أو محتواها المختصر"/>
        </FormField>
        <FormField label="وصف مختصر">
          <textarea className="form-input min-h-[80px]" value={form.description} onChange={e => setF('description', e.target.value)} placeholder="ملاحظات أو أهداف الدورة"/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowTemplate(false); resetForm() }}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveTemplateCourse} disabled={saving || !form.title.trim()}>
            {saving ? <Spinner size="sm"/> : <><Plus size={13}/> حفظ في المكتبة</>}
          </button>
        </div>
      </Modal>

      <Modal open={!!contentRow} onClose={() => setContentRow(null)} title="محتوى الدورة" width="max-w-lg">
        <FormField label="نص المحتوى">
          <textarea className="form-input min-h-[140px]" value={form.content_text} onChange={e => setF('content_text', e.target.value)} placeholder="ملخص المحتوى، المحاور، تعليمات ما بعد الدورة..."/>
        </FormField>
        <FormField label="رابط المحتوى">
          <input className="form-input" value={form.content_url} onChange={e => setF('content_url', e.target.value)} placeholder="https://..."/>
        </FormField>
        <FormField label="ملاحظات المحتوى">
          <textarea className="form-input min-h-[80px]" value={form.content_notes} onChange={e => setF('content_notes', e.target.value)} placeholder="ملاحظات داخلية أو تعليمات للمتدربين"/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setContentRow(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveContent} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'حفظ المحتوى'}
          </button>
        </div>
      </Modal>

      <Modal open={!!certificateRow} onClose={() => { setCertificateRow(null); setCertificatePlayers([]) }} title="تحميل الشهادات" width="max-w-lg">
        {certificatePlayers.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-8">لا يوجد لاعب حضر أو تأخر في هذا النشاط حتى الآن</div>
        ) : (
          <div className="space-y-2">
            {certificatePlayers.map((p: any) => (
              <div key={p.user_id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-100">
                <div className="font-bold text-sm text-slate-700">{p.profile?.full_name}</div>
                <button className="btn btn-primary btn-sm" onClick={() => printCertificate(p)}>
                  <Download size={13}/> PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="حذف نشاط تعليمي">
        <p className="text-sm text-slate-600 mb-4">هل تريد حذف "{confirmDelete?.event?.title}"؟ سيتم حذف الموعد ومحتوى التعليم المرتبط به.</p>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>إلغاء</button>
          <button className="btn btn-danger" onClick={deleteCourse} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'حذف'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
