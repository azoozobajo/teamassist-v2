import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Upload, Download, Edit2, Trash2, Calendar, MapPin, Trophy } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { matchService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ConfirmDialog } from '../../components/ui'
import { canManageEvents, formatDate } from '../../utils/helpers'

const MATCH_TYPES: Record<string,string> = {
  league:'دوري', cup:'كأس', friendly:'ودية', playoff:'إقصائي', other:'أخرى'
}
const HOME_AWAY: Record<string,string> = {
  home:'ملعبنا', away:'ملعب الخصم', neutral:'ملعب محايد'
}
const STATUS_STYLE: Record<string,string> = {
  upcoming:'bg-blue-100 text-blue-700',
  live:'bg-red-100 text-red-700',
  finished:'bg-slate-100 text-slate-600',
  cancelled:'bg-slate-50 text-slate-400'
}
const STATUS_LABEL: Record<string,string> = {
  upcoming:'قادمة', live:'🔴 مباشرة', finished:'منتهية', cancelled:'ملغاة'
}

const emptyForm = {
  opponent:'', match_date:'', location:'', match_type:'league',
  home_away:'home', status:'upcoming',
  goals_for:'', goals_against:'',
  scorers:'', assisters:'', yellow_cards:'', red_cards:'', notes:''
}

export default function MatchesPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [matches, setMatches] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [editMatch, setEditMatch] = useState<any>(null)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [form, setForm] = useState(emptyForm as any)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const m = await matchService.getAll(teamId)
    setMatches(m); setLoading(false)
  }

  const parseNames = (str: string) => str.split(/[,،\n]/).map(s => s.trim()).filter(Boolean)

  async function saveMatch() {
    if (!form.opponent.trim() || !form.match_date || !teamId || !user) return
    setSaving(true)
    const payload = {
      team_id: teamId, created_by: user.id,
      opponent: form.opponent, match_date: form.match_date,
      location: form.location, match_type: form.match_type,
      home_away: form.home_away, status: form.status,
      goals_for:     form.goals_for !== '' ? parseInt(form.goals_for) : null,
      goals_against: form.goals_against !== '' ? parseInt(form.goals_against) : null,
      scorers:      parseNames(form.scorers),
      assisters:    parseNames(form.assisters),
      yellow_cards: parseNames(form.yellow_cards),
      red_cards:    parseNames(form.red_cards),
      notes: form.notes
    }
    if (editMatch) await matchService.update(editMatch.id, payload)
    else await matchService.create(payload)
    await load(); setShowAdd(false); setEditMatch(null); setForm(emptyForm); setSaving(false)
  }

  function openEdit(m: any) {
    setEditMatch(m)
    setForm({
      opponent:      m.opponent || '',
      match_date:    m.match_date?.slice(0,16) || '',
      location:      m.location || '',
      match_type:    m.match_type || 'league',
      home_away:     m.home_away || 'home',
      status:        m.status || 'upcoming',
      goals_for:     m.goals_for ?? '',
      goals_against: m.goals_against ?? '',
      scorers:       (m.scorers || []).join('، '),
      assisters:     (m.assisters || []).join('، '),
      yellow_cards:  (m.yellow_cards || []).join('، '),
      red_cards:     (m.red_cards || []).join('، '),
      notes:         m.notes || ''
    })
    setShowAdd(true)
  }

  // ── Excel template download ──────────────────────────────────────────
  async function downloadTemplate() {
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs' as any)
      const data = [
        { 'الخصم':'نادي الهلال','التاريخ والوقت':'2025-09-15T16:30','الملعب':'الملعب الرئيسي','النوع':'دوري','الأرض':'ملعبنا' },
        { 'الخصم':'نادي النصر', 'التاريخ والوقت':'2025-09-22T18:00','الملعب':'ملعب الزعيم',   'النوع':'كأس',  'الأرض':'ملعب الخصم' },
      ]
      const ws = XLSX.utils.json_to_sheet(data)
      // Set column widths
      ws['!cols'] = [{wch:20},{wch:20},{wch:20},{wch:10},{wch:15}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'المباريات')
      XLSX.writeFile(wb, 'قالب_المباريات_TeamAssist.xlsx')
    } catch(e) {
      alert('حدث خطأ في تحميل القالب، تأكد من الاتصال بالإنترنت')
    }
  }

  // ── Excel import ─────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !teamId || !user) return
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs' as any)
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      let imported = 0
      for (const row of rows) {
        const opponent = row['الخصم'] || row['opponent']
        if (!opponent) continue
        const typeMap: Record<string,string> = { 'دوري':'league','كأس':'cup','ودية':'friendly','إقصائي':'playoff' }
        const homeMap: Record<string,string> = { 'ملعبنا':'home','ملعب الخصم':'away','ملعب محايد':'neutral' }
        await matchService.create({
          team_id: teamId, created_by: user.id,
          opponent,
          match_date: row['التاريخ والوقت'] || row['التاريخ'] || row['date'] || new Date().toISOString(),
          location: row['الملعب'] || row['location'] || '',
          match_type: typeMap[row['النوع']] || 'league',
          home_away: homeMap[row['الأرض']] || 'home',
          status: 'upcoming'
        })
        imported++
      }
      await load()
      alert(`تم استيراد ${imported} مباريات بنجاح ✅`)
    } catch(err) {
      alert('حدث خطأ في قراءة الملف، تأكد من استخدام القالب الصحيح')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const canManage = canManageEvents(myRole)
  const upcoming = matches.filter(m => m.status === 'upcoming' || m.status === 'live')
  const finished = matches.filter(m => m.status === 'finished' || m.status === 'cancelled')
  const list = tab === 'upcoming' ? upcoming : finished

  // Season stats
  const played = matches.filter(m => m.status === 'finished' && m.goals_for !== null)
  const wins   = played.filter(m => m.goals_for > m.goals_against).length
  const draws  = played.filter(m => m.goals_for === m.goals_against).length
  const losses = played.filter(m => m.goals_for < m.goals_against).length
  const goalsFor     = played.reduce((s,m) => s + (m.goals_for || 0), 0)
  const goalsAgainst = played.reduce((s,m) => s + (m.goals_against || 0), 0)
  const pts = wins * 3 + draws

  const getResult = (m: any) => {
    if (m.goals_for === null || m.goals_against === null) return null
    if (m.goals_for > m.goals_against) return { label:'فوز', cls:'bg-emerald-100 text-emerald-700', short:'✓' }
    if (m.goals_for === m.goals_against) return { label:'تعادل', cls:'bg-amber-100 text-amber-700', short:'=' }
    return { label:'خسارة', cls:'bg-red-100 text-red-700', short:'✗' }
  }

  return (
    <div>
      <PageHeader title="المباريات"
        action={canManage && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
              <Download size={13}/> تحميل القالب
            </button>
            <label className="btn btn-ghost btn-sm cursor-pointer">
              <Upload size={13}/> استيراد Excel
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport}/>
            </label>
            <button className="btn btn-primary btn-sm"
              onClick={() => { setForm(emptyForm); setEditMatch(null); setShowAdd(true) }}>
              <Plus size={13}/> مباراة
            </button>
          </div>
        )}/>

      {/* Season Stats */}
      {played.length > 0 && (
        <div className="card mb-5 bg-gradient-to-l from-slate-700 to-slate-900 text-white">
          <div className="text-xs font-bold opacity-60 mb-3 text-center">إحصائيات الموسم</div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label:'مباريات', val: played.length, color:'' },
              { label:'فوز', val: wins, color:'text-emerald-400' },
              { label:'تعادل', val: draws, color:'text-amber-400' },
              { label:'خسارة', val: losses, color:'text-red-400' },
              { label:'النقاط', val: pts, color:'text-blue-300' },
            ].map(s => (
              <div key={s.label}>
                <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center text-xs opacity-50 mt-3">
            أهداف: {goalsFor} لصالحنا · {goalsAgainst} علينا
          </div>
        </div>
      )}

      <Tabs tabs={[
        {key:'upcoming', label:`القادمة (${upcoming.length})`},
        {key:'finished', label:`المنتهية (${finished.length})`}
      ]} active={tab} onChange={setTab}/>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : list.length === 0
          ? <div className="card"><EmptyState icon={<Trophy size={24}/>}
              title={tab==='upcoming' ? 'لا توجد مباريات قادمة' : 'لا توجد مباريات منتهية'}
              description={canManage ? 'أضف مباراة أو استورد من ملف Excel' : ''}
              action={canManage && tab==='upcoming' && (
                <button className="btn btn-primary btn-sm mt-2"
                  onClick={() => { setForm(emptyForm); setEditMatch(null); setShowAdd(true) }}>
                  <Plus size={13}/> إضافة مباراة
                </button>
              )}/></div>
          : <div className="space-y-3">
              {list.map(m => {
                const result = getResult(m)
                return (
                  <div key={m.id} className="card mb-0 cursor-pointer hover:border-slate-200 hover:shadow-md transition-all"
                    onClick={() => setShowDetail(m)}>
                    <div className="flex items-center gap-3">
                      {/* Score / Result box */}
                      <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${
                        result?.label==='فوز' ? 'bg-emerald-50' :
                        result?.label==='خسارة' ? 'bg-red-50' :
                        result?.label==='تعادل' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        {m.goals_for !== null && m.goals_against !== null ? (
                          <>
                            <span className="text-xl font-bold leading-none">{m.goals_for}-{m.goals_against}</span>
                            {result && <span className={`text-xs font-bold mt-0.5 ${result.cls} px-1.5 rounded-full`}>{result.label}</span>}
                          </>
                        ) : <span className="text-3xl">⚽</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">
                          {m.home_away==='home' ? `فريقنا ضد ${m.opponent}` : `${m.opponent} ضد فريقنا`}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar size={11}/> {formatDate(m.match_date)} · {m.match_date?.slice(11,16)}
                        </div>
                        {m.location && (
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={11}/> {m.location}
                          </div>
                        )}
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <span className={`badge ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                          <span className="badge badge-gray">{MATCH_TYPES[m.match_type]}</span>
                          <span className="badge badge-gray">{HOME_AWAY[m.home_away]}</span>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-1 flex-shrink-0" onClick={ev => ev.stopPropagation()}>
                          <button onClick={() => openEdit(m)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit2 size={13}/>
                          </button>
                          <button onClick={() => setConfirmDelete(m)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>}

      {/* ── Match Detail ── */}
      <Modal open={!!showDetail} onClose={() => setShowDetail(null)}
        title={showDetail ? `${showDetail.home_away==='home' ? 'فريقنا' : showDetail.opponent} ضد ${showDetail.home_away==='home' ? showDetail.opponent : 'فريقنا'}` : ''}>
        {showDetail && (
          <div>
            <div className="text-center py-4 mb-4">
              {showDetail.goals_for !== null ? (
                <div className="text-5xl font-bold mb-2">
                  {showDetail.goals_for} - {showDetail.goals_against}
                </div>
              ) : <div className="text-2xl mb-2">⚽ لم تُحدَّد النتيجة</div>}
              <div className="flex justify-center gap-2 flex-wrap">
                <span className={`badge ${STATUS_STYLE[showDetail.status]}`}>{STATUS_LABEL[showDetail.status]}</span>
                <span className="badge badge-gray">{MATCH_TYPES[showDetail.match_type]}</span>
                <span className="badge badge-gray">{HOME_AWAY[showDetail.home_away]}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-slate-400 mb-0.5">التاريخ والوقت</div>
                <div className="font-bold">{formatDate(showDetail.match_date)} · {showDetail.match_date?.slice(11,16)}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-slate-400 mb-0.5">الملعب</div>
                <div className="font-bold">{showDetail.location || '—'}</div>
              </div>
            </div>
            {[
              { label:'⚽ الهدافون',         list: showDetail.scorers },
              { label:'🎯 صانعو الأهداف',    list: showDetail.assisters },
              { label:'🟡 البطاقات الصفراء', list: showDetail.yellow_cards },
              { label:'🔴 البطاقات الحمراء', list: showDetail.red_cards },
            ].filter(s => s.list?.length > 0).map(s => (
              <div key={s.label} className="mb-3">
                <div className="text-xs font-bold text-slate-500 mb-1.5">{s.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.list.map((n: string, i: number) => (
                    <span key={i} className="badge badge-gray">{n}</span>
                  ))}
                </div>
              </div>
            ))}
            {showDetail.notes && (
              <div className="bg-slate-50 rounded-xl p-3 mt-3 text-xs text-slate-600">
                <div className="font-bold mb-1 text-slate-700">ملاحظات</div>
                {showDetail.notes}
              </div>
            )}
            {canManage && (
              <button onClick={() => { openEdit(showDetail); setShowDetail(null) }}
                className="btn btn-primary w-full justify-center mt-4">
                <Edit2 size={14}/> تعديل البيانات
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* ── Add/Edit Modal ── */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditMatch(null) }}
        title={editMatch ? 'تعديل المباراة' : 'إضافة مباراة جديدة'} width="max-w-lg">
        <FormField label="اسم الخصم" required>
          <input className="form-input" value={form.opponent} onChange={e => set('opponent',e.target.value)} placeholder="نادي الهلال"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="التاريخ والوقت" required>
            <input className="form-input" type="datetime-local" value={form.match_date} onChange={e => set('match_date',e.target.value)}/>
          </FormField>
          <FormField label="الملعب">
            <input className="form-input" value={form.location} onChange={e => set('location',e.target.value)} placeholder="الملعب الرئيسي"/>
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FormField label="النوع">
            <select className="form-input" value={form.match_type} onChange={e => set('match_type',e.target.value)}>
              {Object.entries(MATCH_TYPES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="الأرض">
            <select className="form-input" value={form.home_away} onChange={e => set('home_away',e.target.value)}>
              {Object.entries(HOME_AWAY).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="الحالة">
            <select className="form-input" value={form.status} onChange={e => set('status',e.target.value)}>
              <option value="upcoming">قادمة</option>
              <option value="live">مباشرة</option>
              <option value="finished">منتهية</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </FormField>
        </div>
        {(form.status === 'finished' || form.status === 'live') && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="أهدافنا">
              <input className="form-input" type="number" min="0" value={form.goals_for} onChange={e => set('goals_for',e.target.value)}/>
            </FormField>
            <FormField label="أهداف الخصم">
              <input className="form-input" type="number" min="0" value={form.goals_against} onChange={e => set('goals_against',e.target.value)}/>
            </FormField>
          </div>
        )}
        <FormField label="⚽ الهدافون" hint="افصل الأسماء بفاصلة">
          <input className="form-input" value={form.scorers} onChange={e => set('scorers',e.target.value)} placeholder="أحمد محمد، خالد العمر"/>
        </FormField>
        <FormField label="🎯 صانعو الأهداف">
          <input className="form-input" value={form.assisters} onChange={e => set('assisters',e.target.value)}/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="🟡 بطاقات صفراء">
            <input className="form-input" value={form.yellow_cards} onChange={e => set('yellow_cards',e.target.value)}/>
          </FormField>
          <FormField label="🔴 بطاقات حمراء">
            <input className="form-input" value={form.red_cards} onChange={e => set('red_cards',e.target.value)}/>
          </FormField>
        </div>
        <FormField label="ملاحظات المدرب">
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes',e.target.value)}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setEditMatch(null) }}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveMatch} disabled={saving}>
            {saving ? <Spinner size="sm"/> : editMatch ? 'حفظ التعديل' : 'إضافة المباراة'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="حذف المباراة" danger
        message={`هل تريد حذف مباراة "${confirmDelete?.opponent}"؟`}
        onConfirm={async () => { await matchService.delete(confirmDelete.id); await load(); setConfirmDelete(null) }}
        onCancel={() => setConfirmDelete(null)}/>
    </div>
  )
}
