import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, FileText, ChevronRight,
  Bold, Italic, Underline, List, AlignRight, AlignCenter, AlignLeft,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { regulationsService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, ConfirmDialog } from '../../components/ui'
import { canManageTeam } from '../../utils/helpers'

export default function RegulationsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [docs, setDocs]     = useState<any[]>([])
  const [team, setTeam]     = useState<any>(null)
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)

  // selDoc: currently viewing; undefined = list view
  const [selDoc, setSelDoc] = useState<any>(undefined)

  // editDoc: undefined=closed, null=new, object=editing
  const [editDoc, setEditDoc]   = useState<any>(undefined)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      regulationsService.getAll(teamId),
      teamService.getTeam(teamId),
      teamService.getMyRole(teamId, user.id),
    ]).then(([d, t, role]) => {
      setDocs(d); setTeam(t); setMyRole(role || ''); setLoading(false)
    })
  }, [teamId, user])

  function openEdit(doc?: any) {
    const now = new Date().toISOString().slice(0, 10)
    setEditTitle(doc?.title || '')
    setEditDate(doc?.published_at || now)
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
      await regulationsService.update(editDoc.id, { title: editTitle, content, published_at: editDate })
    } else {
      await regulationsService.create({ team_id: teamId, title: editTitle, content, published_at: editDate, created_by: user.id })
    }
    const updated = await regulationsService.getAll(teamId)
    setDocs(updated)
    // Refresh selDoc if we just edited it
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

  // execCommand wrapper — onMouseDown prevents editor losing focus
  function cmd(command: string, value?: string) {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  const isAdmin = canManageTeam(myRole)

  // ─────────────────────────────────────────────
  // DOCUMENT VIEWER
  // ─────────────────────────────────────────────
  if (selDoc) return (
    <div>
      {/* Back button */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setSelDoc(undefined)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 transition-colors font-bold">
          <ChevronRight size={16}/> العودة للقائمة
        </button>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => openEdit(selDoc)}
              className="flex items-center gap-1.5 btn btn-ghost btn-sm text-blue-600 border-blue-200">
              <Edit2 size={13}/> تعديل
            </button>
            <button onClick={() => setConfirmDelete(selDoc)}
              className="flex items-center gap-1.5 btn btn-ghost btn-sm text-red-500 border-red-200">
              <Trash2 size={13}/> حذف
            </button>
          </div>
        )}
      </div>

      {/* Document paper */}
      <div className="card max-w-3xl mx-auto px-8 py-8" style={{ minHeight: '72vh' }}>
        {/* Document header */}
        <div className="pb-6 mb-6 border-b-2 border-slate-100">
          {/* Logo + team name (right/start in RTL) */}
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
              <div className="text-xs text-slate-400 mt-0.5">وثيقة رسمية</div>
            </div>
          </div>

          {/* Title — large, centered */}
          <h1 className="text-2xl font-black text-slate-800 text-center leading-snug mb-4">
            {selDoc.title}
          </h1>

          {/* Published date — right aligned */}
          <div className="text-right text-xs text-slate-400 font-bold">
            📅 تاريخ النشر: {selDoc.published_at}
          </div>
        </div>

        {/* Body content */}
        <div
          dir="rtl"
          className="text-slate-700 leading-8 text-sm regulations-body"
          dangerouslySetInnerHTML={{ __html: selDoc.content || '<p class="text-slate-400">لا يوجد محتوى</p>' }}
        />
      </div>

      {/* Edit modal (accessible from viewer too) */}
      <EditModal
        open={editDoc !== undefined} editDoc={editDoc} editTitle={editTitle}
        editDate={editDate} saving={saving} editorRef={editorRef}
        setEditTitle={setEditTitle} setEditDate={setEditDate}
        onClose={() => setEditDoc(undefined)} onSave={save} onCmd={cmd}/>

      <ConfirmDialog open={!!confirmDelete} title="حذف المستند" danger
        message={`هل تريد حذف "${confirmDelete?.title}"؟`}
        onConfirm={deleteDoc} onCancel={() => setConfirmDelete(null)}/>
    </div>
  )

  // ─────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────
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
          {docs.map(doc => (
            <div key={doc.id}
              className="card hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => setSelDoc(doc)}>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 bg-brand-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                  <FileText size={20} className="text-brand-500"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-800 group-hover:text-brand-700 transition-colors text-sm">
                    {doc.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">📅 {doc.published_at}</div>
                  {doc.content && (
                    <div className="text-xs text-slate-500 mt-1.5 line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: doc.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 130) + '...'
                      }}/>
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
          ))}
        </div>
      )}

      <EditModal
        open={editDoc !== undefined} editDoc={editDoc} editTitle={editTitle}
        editDate={editDate} saving={saving} editorRef={editorRef}
        setEditTitle={setEditTitle} setEditDate={setEditDate}
        onClose={() => setEditDoc(undefined)} onSave={save} onCmd={cmd}/>

      <ConfirmDialog open={!!confirmDelete} title="حذف المستند" danger
        message={`هل تريد حذف "${confirmDelete?.title}"؟`}
        onConfirm={deleteDoc} onCancel={() => setConfirmDelete(null)}/>
    </div>
  )
}

// ── Extracted Edit Modal (shared between list + viewer) ──────────────────
function EditModal({ open, editDoc, editTitle, editDate, saving, editorRef, setEditTitle, setEditDate, onClose, onSave, onCmd }: {
  open: boolean; editDoc: any; editTitle: string; editDate: string
  saving: boolean; editorRef: React.RefObject<HTMLDivElement>
  setEditTitle: (v: string) => void; setEditDate: (v: string) => void
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
      <FormField label="المحتوى">
        {/* Toolbar */}
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
        {/* Editable area */}
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
