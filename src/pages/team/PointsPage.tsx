import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Settings, Star, Minus, Filter, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { pointsService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ProgressBar, CheckboxList } from '../../components/ui'
import { POINT_CATEGORIES, DEDUCTION_REASONS, canManageTeam, ROLE_LABELS } from '../../utils/helpers'

const CAT_COLOR: Record<string,string> = {
  مكافأة:'bg-emerald-100 text-emerald-700', تطور:'bg-blue-100 text-blue-700',
  تعاون:'bg-purple-100 text-purple-700', مبادرة:'bg-amber-100 text-amber-700',
  أداء:'bg-yellow-100 text-yellow-700', نتائج:'bg-slate-100 text-slate-600',
  خصم:'bg-red-100 text-red-700'
}
const MEDALS = ['🥇','🥈','🥉']
const DEFAULT_AUTO = [
  { event_trigger:'حضور التدريب',  points: 5,  is_active: true },
  { event_trigger:'حضور المباراة', points: 10, is_active: true },
  { event_trigger:'حضور الاجتماع', points: 3,  is_active: true },
  { event_trigger:'حضور المعسكر',  points: 15, is_active: false },
  { event_trigger:'سلسلة 3',       points: 15, is_active: true },
  { event_trigger:'سلسلة 5',       points: 25, is_active: true },
  { event_trigger:'سلسلة 10',      points: 50, is_active: true },
  { event_trigger:'سلسلة كل 5',    points: 10, is_active: true },
]
const ATTENDANCE_TRIGGERS = ['حضور التدريب','حضور المباراة','حضور الاجتماع','حضور المعسكر']
const STREAK_TRIGGERS     = ['سلسلة 3','سلسلة 5','سلسلة 10','سلسلة كل 5']
const STREAK_LABELS: Record<string,string> = {
  'سلسلة 3':    '🔥 3 جلسات متتالية',
  'سلسلة 5':    '🔥 5 جلسات متتالية',
  'سلسلة 10':   '🔥 10 جلسات متتالية',
  'سلسلة كل 5': '🔥 كل 5 بعد العاشرة',
}

export default function PointsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [lb, setLb] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [comps, setComps] = useState<any[]>([])
  const [autoSettings, setAutoSettings] = useState(DEFAULT_AUTO)
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('leaderboard')
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showComp, setShowComp] = useState(false)
  const [isDeductMode, setIsDeductMode] = useState(false)
  const [form, setForm] = useState({ category:'مكافأة' as any, reason:'', points:'', target:'all', selectedMembers:[] as string[] })
  const [compForm, setCompForm] = useState({ name:'', from_date:'', to_date:'', prize:'' })
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // ── Date filter ──
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const set = (k:string,v:any) => setForm(p=>({...p,[k]:v}))
  const hasFilter = !!(filterFrom || filterTo)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(mems => {
      setMembers(mems)
      load(mems)
    })
  }, [teamId, user])

  function buildLeaderboard(allMembers: any[], txList: any[]) {
    const players = allMembers.filter(m => m.role === 'player' && m.status !== 'removed')
    const totals: Record<string, number> = {}
    txList.forEach((t: any) => { totals[t.user_id] = (totals[t.user_id] || 0) + t.points })
    return players.map(p => ({
      userId: p.user_id,
      name:   p.profile?.full_name || '?',
      init:   (p.profile?.full_name || '?')[0],
      pts:    totals[p.user_id] || 0,
    })).sort((a, b) => b.pts - a.pts)
  }

  async function load(mems?: any[]) {
    if (!teamId) return
    setLoading(true)
    const [h, c, a] = await Promise.all([
      pointsService.getHistory(teamId, 500),
      pointsService.getCompetitions(teamId),
      pointsService.getAutoSettings(teamId),
    ])
    setHistory(h); setComps(c)
    // Merge DB settings with defaults so all triggers always appear
    const merged = DEFAULT_AUTO.map(def => {
      const fromDb = a.find((x: any) => x.event_trigger === def.event_trigger)
      return fromDb ? { ...def, ...fromDb } : def
    })
    a.forEach((x: any) => {
      if (!merged.find(m => m.event_trigger === x.event_trigger)) merged.push(x)
    })
    setAutoSettings(merged)
    setLb(buildLeaderboard(mems ?? members, h))
    setLoading(false)
  }

  // ── Filtered data ──
  const filteredHistory = history.filter((h: any) => {
    const d = h.created_at?.slice(0, 10) || ''
    if (filterFrom && d < filterFrom) return false
    if (filterTo   && d > filterTo)   return false
    return true
  })

  const filteredLb = buildLeaderboard(members, filteredHistory)

  const displayLb      = hasFilter ? filteredLb      : lb
  const displayHistory = hasFilter ? filteredHistory : history

  async function addPoints() {
    setAddError('')
    if (!form.points || parseInt(form.points) < 1) { setAddError('أدخل عدد النقاط'); return }
    if (!form.reason.trim()) { setAddError('أدخل سبب الإضافة أو الخصم'); return }
    if (!teamId || !user) return
    setSaving(true)
    const rawPts = parseInt(form.points)
    const pts = isDeductMode ? -Math.abs(rawPts) : Math.abs(rawPts)
    let targets: string[] = []
    if (form.target === 'all') targets = members.filter(m => m.status !== 'removed').map(m => m.user_id)
    else if (form.target === 'players') targets = members.filter(m => m.role === 'player').map(m => m.user_id)
    else targets = form.selectedMembers
    if (targets.length === 0) { setAddError('لا يوجد أعضاء مستهدفون'); setSaving(false); return }
    const inserts = targets.map(uid => ({
      team_id: teamId, user_id: uid, points: pts,
      category: isDeductMode ? 'خصم' : form.category,
      reason: form.reason, is_auto: false
    }))
    const { error } = await pointsService.addPoints(inserts)
    if (error) {
      setAddError('فشل الحفظ: ' + error.message)
      setSaving(false); return
    }
    await load()
    setShowAdd(false)
    setForm({ category:'مكافأة', reason:'', points:'', target:'all', selectedMembers:[] })
    setIsDeductMode(false); setSaving(false); setAddError('')
  }

  async function addComp() {
    if (!compForm.name || !teamId) return
    setSaving(true)
    await pointsService.createCompetition({ ...compForm, team_id: teamId, is_active: true })
    await load(); setShowComp(false); setCompForm({ name:'', from_date:'', to_date:'', prize:'' }); setSaving(false)
  }

  async function saveAutoSettings() {
    if (!teamId) return
    const toSave = autoSettings.map(s => ({ ...s, team_id: teamId }))
    await pointsService.saveAutoSettings(toSave)
    setShowSettings(false)
  }

  const isAdmin = canManageTeam(myRole)
  const maxPts = displayLb[0]?.pts || 1
  const memberItems = members.map(m => ({ value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] }))

  return (
    <div>
      <PageHeader title="نظام النقاط والمكافآت"
        action={isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}><Settings size={13}/></button>
            <button className="btn btn-danger btn-sm" onClick={() => { setIsDeductMode(true); setAddError(''); setShowAdd(true) }}><Minus size={13}/> خصم</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setIsDeductMode(false); setAddError(''); setShowAdd(true) }}><Plus size={13}/> نقاط</button>
          </div>
        )}/>

      <Tabs tabs={[{key:'leaderboard',label:'🏆 الترتيب'},{key:'history',label:'📋 السجل'},{key:'competitions',label:'🎯 المسابقات'}]}
        active={tab} onChange={setTab}/>

      {/* ── Date filter (leaderboard + history) ── */}
      {tab !== 'competitions' && (
        <div className="card mb-3 py-2.5 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={13} className="text-slate-400 flex-shrink-0"/>
            <span className="text-xs font-bold text-slate-500 flex-shrink-0">فلترة بالتاريخ:</span>
            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">من</span>
                <input type="date" className="form-input py-1 text-xs" style={{ width: 130 }}
                  value={filterFrom} onChange={e => setFilterFrom(e.target.value)}/>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">إلى</span>
                <input type="date" className="form-input py-1 text-xs" style={{ width: 130 }}
                  value={filterTo} onChange={e => setFilterTo(e.target.value)}/>
              </div>
              {hasFilter && (
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg border-none cursor-pointer font-bold transition-colors">
                  <X size={11}/> إزالة
                </button>
              )}
            </div>
            {hasFilter && (
              <span className="text-xs bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded-lg flex-shrink-0">
                {displayHistory.length} سجل
              </span>
            )}
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {tab === 'leaderboard' && (
            displayLb.length === 0
              ? <div className="card"><EmptyState icon={<Star size={28}/>} title={hasFilter ? 'لا توجد نقاط في هذه الفترة' : 'لا توجد نقاط بعد'} description={hasFilter ? 'جرب تغيير نطاق التاريخ' : 'أضف نقاطاً للأعضاء للبدء'}/></div>
              : <div className="space-y-2.5">
                  {displayLb.map((p, i) => {
                    const isTop = i < 3
                    const topBg  = ['bg-yellow-50 border-yellow-200','bg-slate-50 border-slate-200','bg-orange-50 border-orange-200'][i] || ''
                    const ptColor= ['text-yellow-600','text-slate-500','text-orange-500'][i] || 'text-amber-600'
                    return (
                      <div key={p.userId}
                        className={`card flex items-center gap-3 transition-all ${isTop ? topBg : ''}`}>
                        <div className="text-2xl w-9 text-center flex-shrink-0 leading-none">
                          {MEDALS[i] || <span className="text-sm font-bold text-slate-400">#{i+1}</span>}
                        </div>
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-sm flex-shrink-0 ${isTop ? 'bg-white shadow-sm' : 'bg-brand-100 text-brand-700'}`}>
                          {p.init}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-sm text-slate-900 truncate">{p.name}</div>
                          <div className="mt-1.5">
                            <ProgressBar value={Math.round(p.pts/maxPts*100)} color={isTop ? 'bg-yellow-400' : 'bg-brand-400'} height="h-2"/>
                          </div>
                        </div>
                        <div className={`text-center px-3 py-2 rounded-2xl flex-shrink-0 ${isTop ? 'bg-white shadow-sm' : 'bg-slate-50'}`}>
                          <div className={`text-xl font-extrabold leading-none ${ptColor}`}>{p.pts}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">نقطة</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
          )}

          {tab === 'history' && (
            displayHistory.length === 0
              ? <div className="card"><EmptyState title={hasFilter ? 'لا يوجد سجل في هذه الفترة' : 'لا يوجد سجل'}/></div>
              : <div className="card p-0 divide-y divide-slate-50">
                  {displayHistory.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`badge text-xs ${CAT_COLOR[h.category] || 'bg-slate-100 text-slate-600'}`}>{h.category}</span>
                          {h.is_auto && <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">تلقائي</span>}
                        </div>
                        <div className="font-bold text-xs">{h.profile?.full_name}</div>
                        <div className="text-xs text-slate-400">{h.reason}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-lg font-bold ${h.points < 0 ? 'text-red-500' : 'text-yellow-600'}`}>
                          {h.points < 0 ? h.points : `+${h.points}`}
                        </div>
                        <div className="text-xs text-slate-400">{h.created_at?.slice(0,10)}</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'competitions' && (
            <div>
              {isAdmin && (
                <div className="flex justify-end mb-3">
                  <button className="btn btn-primary btn-sm" onClick={() => setShowComp(true)}><Plus size={13}/> مسابقة</button>
                </div>
              )}
              {comps.length === 0
                ? <div className="card"><EmptyState icon={<Star size={24}/>} title="لا توجد مسابقات"/></div>
                : <div className="space-y-3">
                    {comps.map((c: any) => (
                      <div key={c.id} className="card mb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">🎯</span>
                          <div className="flex-1">
                            <div className="font-bold text-sm">{c.name}</div>
                            <div className="text-xs text-slate-400">{c.from_date} ← {c.to_date}</div>
                          </div>
                          <span className={`badge ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {c.is_active ? 'جارية' : 'منتهية'}
                          </span>
                        </div>
                        <div className="bg-yellow-50 text-yellow-700 text-xs px-3 py-2 rounded-xl">🏆 الجائزة: {c.prize}</div>
                        {c.winner && <div className="text-xs text-emerald-600 mt-2">👑 الفائز: {c.winner.full_name}</div>}
                      </div>
                    ))}
                  </div>}
            </div>
          )}
        </>
      )}

      {/* Add/Deduct Points Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setIsDeductMode(false) }}
        title={isDeductMode ? '🔴 خصم نقاط' : '⭐ إضافة نقاط'}>

        <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-xl">
          <button onClick={() => setIsDeductMode(false)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isDeductMode ? 'bg-white shadow-sm text-brand-700' : 'text-slate-500'}`}>
            ⭐ إضافة نقاط
          </button>
          <button onClick={() => setIsDeductMode(true)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isDeductMode ? 'bg-white shadow-sm text-red-600' : 'text-slate-500'}`}>
            🔴 خصم نقاط
          </button>
        </div>

        {isDeductMode ? (
          <div className="form-group">
            <label className="form-label">سبب الخصم</label>
            <div className="flex flex-wrap gap-1.5">
              {DEDUCTION_REASONS.map(r => (
                <button key={r} onClick={() => set('reason', r)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.reason===r ? 'bg-red-500 text-white border-red-500' : 'border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700'}`}>
                  {r}
                </button>
              ))}
            </div>
            <input className="form-input mt-2" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="أو اكتب سبباً مخصصاً..."/>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">القسم</label>
            <div className="flex flex-wrap gap-1.5">
              {POINT_CATEGORIES.map(c => (
                <button key={c} onClick={() => set('category', c)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.category===c ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <FormField label="المستهدفون">
          <div className="flex gap-2 mb-3">
            {[['all','الكل'],['players','اللاعبون'],['select','محددون']].map(([v,l]) => (
              <button key={v} onClick={() => set('target', v)}
                className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.target===v ? (isDeductMode ? 'bg-red-500 text-white border-red-500' : 'bg-brand-500 text-white border-brand-500') : 'border-slate-200 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {form.target === 'select' && (
            <CheckboxList items={memberItems} selected={form.selectedMembers}
              onChange={v => set('selectedMembers', v)}/>
          )}
        </FormField>
        <FormField label="عدد النقاط" required>
          <input className="form-input" type="number" min="1" value={form.points} onChange={e => set('points', e.target.value)} placeholder="10"/>
        </FormField>
        {!isDeductMode && (
          <FormField label="السبب" required>
            <input className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="أداء ممتاز في المباراة..."/>
          </FormField>
        )}
        {isDeductMode && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 mt-2">
            ⚠️ ستُخصم {form.points || '؟'} نقطة من رصيد {form.target === 'all' ? 'جميع الأعضاء' : form.target === 'players' ? 'جميع اللاعبين' : `${form.selectedMembers.length} أشخاص`}
          </div>
        )}
        {addError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 font-bold">
            ⚠️ {addError}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setIsDeductMode(false); setAddError('') }}>إلغاء</button>
          <button className={`btn ${isDeductMode ? 'btn-danger' : 'btn-primary'}`} onClick={addPoints} disabled={saving}>
            {saving ? <Spinner size="sm"/> : isDeductMode ? 'تأكيد الخصم' : 'إضافة'}
          </button>
        </div>
      </Modal>

      {/* Auto Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="⚙️ النقاط التلقائية">

        {/* Attendance Points Section */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">📋</span>
            <span className="text-xs font-bold text-slate-700">نقاط الحضور</span>
          </div>
          <div className="text-xs text-slate-400 mb-2">تُضاف تلقائياً عند تسجيل حضور اللاعب</div>
          <div className="space-y-2">
            {autoSettings.filter(s => ATTENDANCE_TRIGGERS.includes(s.event_trigger)).map(s => {
              const i = autoSettings.findIndex(x => x.event_trigger === s.event_trigger)
              return (
                <div key={s.event_trigger} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
                  <input type="checkbox" checked={s.is_active}
                    onChange={e => { const a=[...autoSettings]; a[i]={...a[i],is_active:e.target.checked}; setAutoSettings(a) }}
                    className="w-4 h-4 accent-brand-500"/>
                  <span className="flex-1 text-sm">{s.event_trigger}</span>
                  <input type="number" value={s.points}
                    onChange={e => { const a=[...autoSettings]; a[i]={...a[i],points:parseInt(e.target.value)||0}; setAutoSettings(a) }}
                    className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm"/>
                  <span className="text-xs text-slate-400">نقطة</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Streak Bonuses Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-slate-700">مكافآت السلسلة التلقائية</span>
          </div>
          <div className="text-xs text-slate-400 mb-2">مكافآت إضافية تُمنح عند الحضور المتواصل — الغياب بعذر لا يقطع السلسلة</div>
          <div className="space-y-2">
            {autoSettings.filter(s => STREAK_TRIGGERS.includes(s.event_trigger)).map(s => {
              const i = autoSettings.findIndex(x => x.event_trigger === s.event_trigger)
              return (
                <div key={s.event_trigger} className="flex items-center gap-3 p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <input type="checkbox" checked={s.is_active}
                    onChange={e => { const a=[...autoSettings]; a[i]={...a[i],is_active:e.target.checked}; setAutoSettings(a) }}
                    className="w-4 h-4 accent-amber-500"/>
                  <span className="flex-1 text-sm">{STREAK_LABELS[s.event_trigger] || s.event_trigger}</span>
                  <input type="number" value={s.points}
                    onChange={e => { const a=[...autoSettings]; a[i]={...a[i],points:parseInt(e.target.value)||0}; setAutoSettings(a) }}
                    className="w-16 text-center border border-amber-200 rounded-lg py-1 text-sm"/>
                  <span className="text-xs text-slate-400">نقطة</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>إغلاق</button>
          <button className="btn btn-primary" onClick={saveAutoSettings}>حفظ</button>
        </div>
      </Modal>

      {/* Competition Modal */}
      <Modal open={showComp} onClose={() => setShowComp(false)} title="🎯 مسابقة جديدة">
        <FormField label="اسم المسابقة" required>
          <input className="form-input" value={compForm.name} onChange={e => setCompForm(p=>({...p,name:e.target.value}))} placeholder="مسابقة أبريل"/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ"><input className="form-input" type="date" value={compForm.from_date} onChange={e => setCompForm(p=>({...p,from_date:e.target.value}))}/></FormField>
          <FormField label="إلى تاريخ"><input className="form-input" type="date" value={compForm.to_date} onChange={e => setCompForm(p=>({...p,to_date:e.target.value}))}/></FormField>
        </div>
        <FormField label="الجائزة">
          <input className="form-input" value={compForm.prize} onChange={e => setCompForm(p=>({...p,prize:e.target.value}))} placeholder="قسيمة شراء 500 ريال"/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowComp(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addComp} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إطلاق'}</button>
        </div>
      </Modal>
    </div>
  )
}
