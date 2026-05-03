import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, FileText, ChevronRight,
  Bold, Italic, Underline, List, AlignRight, AlignCenter, AlignLeft,
  Download, ShieldCheck, Users,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { regulationsService, regulationAgreementsService, notificationService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, ConfirmDialog } from '../../components/ui'
import { canManageTeam } from '../../utils/helpers'

export default function RegulationsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [docs, setDocs]     = useState<any[]>([])
  const [team, setTeam]     = useState<any>(null)
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [agreementCounts, setAgreementCounts] = useState<Record<string, number>>({})
  const [myAgreedIds, setMyAgreedIds] = useState<string[]>([])

  const [selDoc, setSelDoc] = useState<any>(undefined)
  const [editDoc, setEditDoc]   = useState<any>(undefined)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate]   = useState('')
  const [editRequired, setEditRequired] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      regulationsService.getAll(teamId),
      teamService.getTeam(teamId),
      teamService.getMyRole(teamId, user.id),
      regulationAgreementsService.getCountsForTeam(teamId),
      regulationAgreementsService.getMyAgreements(teamId, user.id),
    ]).then(([d, t, role, counts, myIds]) => {
      setDocs(d); setTeam(t); setMyRole(role || '')
      setAgreementCounts(counts); setMyAgreedIds(myIds)
      setLoading(false)
    })
  }, [teamId, user])

  function openEdit(doc?: any) {
    const now = new Date().toISOString().slice(0, 10)
    setEditTitle(doc?.title || '')
    setEditDate(doc?.published_at || now)
    setEditRequired(doc?.is_required ?? false)
    setEditDoc(doc ?? null)
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = doc?.content || ''
    }, 60)
  }

  async function save() {
    if (!editTitle.trim() || !teamId || !user) return
    setSaving(true)
    const content = editorRef.current?.innerHTML || ''
    if (editDoc?.id) {
      await regulationsService.update(editDoc.id, {
        title: editTitle, content, published_at: editDate, is_required: editRequired
      })
      // Notify members who previously agreed if doc was required
      if (editRequired) {
        const agreements = await regulationAgreementsService.getAgreementsForDoc(editDoc.id)
        if (agreements.length > 0) {
          const userIds = agreements.map((a: any) => a.user_id).filter((id: string) => id !== user.id)
          if (userIds.length > 0) {
            await notificationService.createForUsers(
              userIds, teamId,
              `تم تعديل مستند "${editTitle}"`,
              'مستند الفريق الذي وافقت عليه تم تعديله. يُرجى الاطلاع على التعديلات.',
              'regulation'
            )
          }
        }
      }
    } else {
      await regulationsService.create({
        team_id: teamId, title: editTitle, content,
        published_at: editDate, is_required: editRequired, created_by: user.id
      })
    }
    const updated = await regulationsService.getAll(teamId)
    const counts  = await regulationAgreementsService.getCountsForTeam(teamId)
    setDocs(updated); setAgreementCounts(counts)
    if (editDoc?.id && selDoc?.id === editDoc.id) {
      setSelDoc(updated.find((d: any) => d.id === editDoc.id))
    }
    setEditDoc(undefined); setSaving(false)
  }

  async function deleteDoc() {
    if (!confirmDelete) return
    await regulationsService.delete(confirmDelete.id)
    setDocs(d => d.filter(x => x.id !== confirmDelete.id))
    if (selDoc?.id === confirmDelete.id) setSelDoc(undefined)
    setConfirmDelete(null)
  }

  function downloadPDF(doc: any) {
    const win = window.open('', '_blank')!
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${doc.title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Tahoma, sans-serif; margin: 40px; color: #1e293b; direction: rtl; font-size: 14px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
    .logo { width: 56px; height: 56px; background: linear-gradient(135deg,#0f766e,#1D9E75); border-radius: 14px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: 900; overflow: hidden; }
    .logo img { width: 100%; height: 100%; object-fit: cover; }
    .team-name { font-size: 16px; font-weight: 800; color: #334155; }
    .doc-badge { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    h1 { font-size: 22px; font-weight: 900; text-align: center; margin: 20px 0 8px; color: #0f172a; }
    .meta { text-align: right; font-size: 12px; color: #94a3b8; margin-bottom: 28px; }
    .content { line-height: 2.2; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">${team?.logo_url ? `<img src="${team.logo_url}" alt=""/>` : (team?.name?.[0] || 'T')}</div>
    <div>
      <div class="team-name">${team?.name || ''}</div>
      <div class="doc-badge">وثيقة رسمية</div>
    </div>
  </div>
  <h1>${doc.title}</h1>
  <div class="meta">📅 تاريخ النشر: ${doc.published_at}</div>
  <div class="content">${doc.content || ''}</div>
  <div class="footer">${team?.name || ''} · وثيقة رسمية</div>
  <script>setTimeout(() => { window.print(); }, 400);</script>
</body>
</html>`)
    win.document.close()
  }

  function cmd(command: string, value?: string) {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  const isAdmin = canManageTeam(myRole)

  // ── DOCUMENT VIEWER ──
  if (selDoc) return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setSelDoc(undefined)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 transition-colors font-bold">
          <ChevronRight size={16}/> العودة للقائمة
        </button>
        <div className="flex gap-2">
          <button onClick={() => downloadPDF(selDoc)}
            className="flex items-center gap-1.5 btn btn-ghost btn-sm text-slate-500 border-slate-200">
            <Download size={13}/> PDF
          </button>
          {isAdmin && (
            <>
              <button onClick={() => openEdit(selDoc)}
                className="flex items-center gap-1.5 btn btn-ghost btn-sm text-blue-600 border-blue-200">
                <Edit2 size={13}/> تعديل
              </button>
              <button onClick={() => setConfirmDelete(selDoc)}
                className="flex items-center gap-1.5 btn btn-ghost btn-sm text-red-500 border-red-200">
                <Trash2 size={13}/> حذف
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card max-w-3xl mx-auto px-8 py-8" style={{ minHeight: '72vh' }}>
        <div className="pb-6 mb-6 border-b-2 border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            {team?.logo_url ? (
              <img src={team.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"/>
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)' }}>
                {team?.name?.[0] || 'T'}
              </div>
            )}
            <div>
              <div className="font-extrabold text-slate-700 text-base">{team?.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-xs text-slate-400">وثيقة رسمية</div>
                {selDoc.is_required && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg font-bold">
                    <ShieldCheck size={10}/> إلزامية الانضمام
                  </span>
                )}
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-800 text-center leading-snug mb-4">{selDoc.title}</h1>
          <div className="text-right text-xs text-slate-400 font-bold">📅 تاريخ النشر: {selDoc.published_at}</div>
        </div>
        <div dir="rtl" className="text-slate-700 leading-8 text-sm regulations-body"
          dangerouslySetInnerHTML={{ __html: selDoc.content || '<p class="text-slate-400">لا يوجد محتوى</p>' }}/>
      </div>

      <EditModal
        open={editDoc !== undefined} editDoc={editDoc} editTitle={editTitle}
        editDate={editDate} editRequired={editRequired} saving={saving} editorRef={editorRef}
        setEditTitle={setEditTitle} setEditDate={setEditDate} setEditRequired={setEditRequired}
        onClose={() => setEditDoc(undefined)} onSave={save} onCmd={cmd}/>

      <ConfirmDialog open={!!confirmDelete} title="حذف المستند" danger
        message={`هل تريد حذف "${confirmDelete?.title}"؟`}
        onConfirm={deleteDoc} onCancel={() => setConfirmDelete(null)}/>
    </div>
  )

  // ── LIST VIEW ──
  return (
    <div>
      <PageHeader title="اللوائح والأنظمة" subtitle="الوثائق والأنظمة الرسمية للفريق"
        action={isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => openEdit()}>
            <Plus size={14}/> مستند جديد
          </button>
        )}/>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg"/></div>
      ) : docs.length === 0 ? (
        <div className="card text-center py-16">
          <FileText size={40} className="mx-auto mb-3 text-slate-200"/>
          <p className="font-bold text-slate-500 text-sm">لا توجد لوائح منشورة بعد</p>
          {isAdmin && (
            <button className="btn btn-primary mt-4" onClick={() => openEdit()}>
              <Plus size={14}/> أضف أول مستند
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const myAgreed = myAgreedIds.includes(doc.id)
            const count = agreementCounts[doc.id] || 0
            return (
              <div key={doc.id}
                className="card hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => setSelDoc(doc)}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-brand-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                    <FileText size={20} className="text-brand-500"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-extrabold text-slate-800 group-hover:text-brand-700 transition-colors text-sm">
                        {doc.title}
                      </div>
                      {doc.is_required && (
                        <span className="flex items-center gap-0.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-lg font-bold">
                          <ShieldCheck size={9}/> إلزامي
                        </span>
                      )}
                      {myAgreed && (
                        <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded-lg font-bold">✅ وافقت</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">📅 {doc.published_at}</div>
                    {doc.content && (
                      <div className="text-xs text-slate-500 mt-1.5 line-clamp-2"
                        dangerouslySetInnerHTML={{
                          __html: doc.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 130) + '...'
                        }}/>
                    )}
                    {isAdmin && doc.is_required && count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-1.5">
                        <Users size={10}/> {count} عضو وافق
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEdit(doc) }}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(doc) }}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <EditModal
        open={editDoc !== undefined} editDoc={editDoc} editTitle={editTitle}
        editDate={editDate} editRequired={editRequired} saving={saving} editorRef={editorRef}
        setEditTitle={setEditTitle} setEditDate={setEditDate} setEditRequired={setEditRequired}
        onClose={() => setEditDoc(undefined)} onSave={save} onCmd={cmd}/>

      <ConfirmDialog open={!!confirmDelete} title="حذف المستند" danger
        message={`هل تريد حذف "${confirmDelete?.title}"؟`}
        onConfirm={deleteDoc} onCancel={() => setConfirmDelete(null)}/>
    </div>
  )
}

function EditModal({ open, editDoc, editTitle, editDate, editRequired, saving, editorRef, setEditTitle, setEditDate, setEditRequired, onClose, onSave, onCmd }: {
  open: boolean; editDoc: any; editTitle: string; editDate: string; editRequired: boolean
  saving: boolean; editorRef: React.RefObject<HTMLDivElement>
  setEditTitle: (v: string) => void; setEditDate: (v: string) => void; setEditRequired: (v: boolean) => void
  onClose: () => void; onSave: () => void; onCmd: (c: string, v?: string) => void
}) {
  const toolbarBtns = [
    { icon: Bold,      cmd: 'bold',      title: 'عريض' },
    { icon: Italic,    cmd: 'italic',    title: 'مائل' },
    { icon: Underline, cmd: 'underline', title: 'تحته خط' },
  ]

  return (
    <Modal open={open} onClose={onClose}
      title={editDoc?.id ? 'تعديل المستند' : 'مستند جديد'} width="max-w-2xl">
      <FormField label="عنوان المستند" required>
        <input className="form-input font-bold text-base" value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder="مثال: نظام العقوبات والمخالفات"/>
      </FormField>
      <FormField label="تاريخ النشر">
        <input className="form-input" type="date" value={editDate}
          onChange={e => setEditDate(e.target.value)}/>
      </FormField>

      {/* Required toggle */}
      <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-1">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-amber-600"/>
          <div>
            <div className="text-sm font-bold text-amber-800">إلزامية الموافقة عند الانضمام</div>
            <div className="text-xs text-amber-600">يجب على الأعضاء الجدد قراءة هذا المستند والموافقة عليه قبل الانضمام</div>
          </div>
        </div>
        <button type="button" onClick={() => setEditRequired(!editRequired)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${editRequired ? 'bg-amber-500' : 'bg-slate-300'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editRequired ? 'translate-x-0.5' : 'translate-x-5'}`}/>
        </button>
      </div>

      <FormField label="المحتوى">
        <div className="flex gap-1 flex-wrap items-center border border-slate-200 border-b-0 rounded-t-xl bg-slate-50 px-2 py-1.5">
          {toolbarBtns.map(({ icon: Icon, cmd, title }) => (
            <button key={cmd} type="button" title={title}
              onMouseDown={e => { e.preventDefault(); onCmd(cmd) }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-brand-700 hover:shadow-sm transition-all">
              <Icon size={14}/>
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-0.5"/>
          <button type="button" title="قائمة نقطية"
            onMouseDown={e => { e.preventDefault(); onCmd('insertUnorderedList') }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-brand-700 hover:shadow-sm transition-all">
            <List size={14}/>
          </button>
          <span className="w-px h-5 bg-slate-200 mx-0.5"/>
          {[
            { icon: AlignRight,  cmd: 'justifyRight',  title: 'محاذاة يمين' },
            { icon: AlignCenter, cmd: 'justifyCenter', title: 'محاذاة وسط' },
            { icon: AlignLeft,   cmd: 'justifyLeft',   title: 'محاذاة يسار' },
          ].map(({ icon: Icon, cmd, title }) => (
            <button key={cmd} type="button" title={title}
              onMouseDown={e => { e.preventDefault(); onCmd(cmd) }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-white hover:text-brand-700 hover:shadow-sm transition-all">
              <Icon size={14}/>
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-0.5"/>
          <select
            onChange={e => { onCmd('fontSize', e.target.value); e.target.value = '' }}
            className="text-xs bg-transparent border-0 text-slate-500 cursor-pointer outline-none py-0.5 rounded">
            <option value="">حجم الخط</option>
            <option value="2">صغير</option>
            <option value="3">عادي</option>
            <option value="4">متوسط</option>
            <option value="5">كبير</option>
            <option value="6">أكبر</option>
          </select>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dir="rtl"
          className="min-h-[200px] max-h-[320px] overflow-y-auto border border-slate-200 rounded-b-xl p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 leading-8"
        />
      </FormField>
      <div className="flex gap-2 justify-end mt-4">
        <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn btn-primary" onClick={onSave} disabled={saving || !editTitle.trim()}>
          {saving ? <Spinner size="sm"/> : <><FileText size={14}/> حفظ ونشر</>}
        </button>
      </div>
    </Modal>
  )
}
