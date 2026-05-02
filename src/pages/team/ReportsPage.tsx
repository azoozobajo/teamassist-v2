import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Shield, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { reportService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState, SearchBox } from '../../components/ui'
import { REPORT_TAGS, canViewReports, formatDate } from '../../utils/helpers'

const TAG_EMOJI: Record<string, string> = {
  إصابة:'🤕', مشكلة:'⚠️', مكافأة:'🏆', موقف:'😤',
  إنجاز:'🌟', تغيير:'🔄', ملاحظة:'📌', طارئ:'🚨'
}
const TAG_COLOR: Record<string, string> = {
  إصابة:'bg-red-100 text-red-700', مشكلة:'bg-amber-100 text-amber-700',
  مكافأة:'bg-emerald-100 text-emerald-700', موقف:'bg-red-100 text-red-700',
  إنجاز:'bg-emerald-100 text-emerald-700', تغيير:'bg-blue-100 text-blue-700',
  ملاحظة:'bg-slate-100 text-slate-600', طارئ:'bg-red-200 text-red-800'
}

export default function ReportsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selTag, setSelTag] = useState<string>('ملاحظة')
  const [form, setForm] = useState({ title: '', content: '', visible_to: 'الجهاز الفني فقط' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [taggedMembers, setTaggedMembers] = useState<string[]>([])
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(m => setMembers(m))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const r = await reportService.getAll(teamId)
    setReports(r); setLoading(false)
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim() || !teamId || !user) return
    setSaving(true)
    await reportService.create({
      ...form, tag: selTag, team_id: teamId, created_by: user.id,
      tagged_members: taggedMembers.length > 0 ? taggedMembers : null
    })
    await load(); setShowAdd(false)
    setForm({ title:'', content:'', visible_to:'الجهاز الفني فقط' })
    setSelTag('ملاحظة'); setTaggedMembers([]); setSaving(false)
  }

  const canWrite = canViewReports(myRole)
  const filtered = reports.filter(r =>
    (!q || r.title.includes(q) || r.content.includes(q)) &&
    (!tagFilter || r.tag === tagFilter) &&
    (!dateFilter || r.created_at?.startsWith(dateFilter))
  )

  if (!canWrite) {
    return (
      <div className="card text-center py-12">
        <Shield size={40} className="text-slate-300 mx-auto mb-3"/>
        <p className="text-slate-500 font-bold">وصول محظور</p>
        <p className="text-xs text-slate-400 mt-1">هذا القسم للإداريين والجهاز الفني فقط</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="التقارير السرية" subtitle="للإداريين والجهاز الفني فقط"
        action={<button className="btn btn-sm" style={{background:'#991B1B',color:'#fff',border:'none'}} onClick={() => setShowAdd(true)}>
          <Plus size={14}/> تقرير جديد
        </button>}/>
      <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
        <Shield size={14} className="text-red-600 flex-shrink-0"/>
        <span className="text-xs text-red-700 font-bold">سري — لا يراه اللاعبون</span>
      </div>

      {/* Search & filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-0"><SearchBox placeholder="ابحث..." value={q} onChange={setQ}/></div>
        <select className="form-input w-32" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">كل التاقات</option>
          {REPORT_TAGS.map(t => <option key={t}>{t}</option>)}
        </select>
        <input className="form-input w-36" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}/>
      </div>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : filtered.length === 0
          ? <div className="card"><EmptyState icon={<Shield size={24}/>} title="لا توجد تقارير" description="اضغط + لإضافة تقرير جديد"/></div>
          : <div className="space-y-3">
              {filtered.map(r => (
                <div key={r.id} className="card mb-0 cursor-pointer hover:border-slate-200 transition-colors"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`badge ${TAG_COLOR[r.tag] || 'bg-slate-100 text-slate-600'}`}>
                      {TAG_EMOJI[r.tag]} {r.tag}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                    <span className="text-xs text-slate-300">· {r.visible_to}</span>
                  </div>
                  <div className="font-bold text-sm mb-1">{r.title}</div>
                  <div className={`text-xs text-slate-500 leading-relaxed ${expandedId === r.id ? '' : 'line-clamp-2'}`}>
                    {r.content}
                  </div>
                  {r.tagged_profiles?.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <span className="text-xs text-slate-400">يخص:</span>
                      {r.tagged_profiles.map((p: any) => (
                        <span key={p.id} className="flex items-center gap-1 bg-slate-100 rounded-full px-2 py-0.5 text-xs font-medium">
                          <div className="w-4 h-4 bg-slate-300 rounded-full flex items-center justify-center text-[10px]">{p.full_name?.[0]}</div>
                          {p.full_name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-3">
                    <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center text-xs">{r.author?.full_name?.[0]}</div>
                    <span className="text-xs text-slate-400">{r.author?.full_name}</span>
                  </div>
                </div>
              ))}
            </div>}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="تقرير سري جديد">
        <FormField label="العنوان" required>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="عنوان التقرير"/>
        </FormField>
        <FormField label="يخص">
          <select className="form-input" value={form.visible_to} onChange={e => set('visible_to', e.target.value)}>
            <option>الجهاز الفني فقط</option>
            <option>الإداريون فقط</option>
            <option>الكل (عدا اللاعبين)</option>
          </select>
        </FormField>
        <div className="form-group">
          <label className="form-label">التاق</label>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_TAGS.map(t => (
              <button key={t} onClick={() => setSelTag(t)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${selTag===t ? 'bg-red-700 text-white border-red-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                {TAG_EMOJI[t]} {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">الأعضاء المذكورون (اختياري)</label>
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
            {members.length === 0 && <div className="p-3 text-xs text-slate-400 text-center">لا يوجد أعضاء</div>}
            {members.map((m: any) => {
              const isSel = taggedMembers.includes(m.user_id)
              return (
                <div key={m.id}
                  onClick={() => setTaggedMembers(p => p.includes(m.user_id) ? p.filter(x => x !== m.user_id) : [...p, m.user_id])}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${isSel ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSel ? 'bg-red-700 border-red-700' : 'border-slate-300'}`}>
                    {isSel && <Check size={10} className="text-white"/>}
                  </div>
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">{m.profile?.full_name?.[0]}</div>
                  <span className="text-sm">{m.profile?.full_name}</span>
                </div>
              )
            })}
          </div>
          {taggedMembers.length > 0 && <p className="text-xs text-slate-400 mt-1">{taggedMembers.length} محدد</p>}
        </div>
        <FormField label="نص التقرير" required>
          <textarea className="form-input" rows={4} value={form.content} onChange={e => set('content', e.target.value)} placeholder="اكتب تفاصيل التقرير..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn" style={{background:'#991B1B',color:'#fff',border:'none'}} onClick={save} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'حفظ التقرير'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
