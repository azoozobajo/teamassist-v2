import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Settings, Star } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { pointsService, teamService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ProgressBar, CheckboxList } from '../../components/ui'
import { POINT_CATEGORIES, canManageTeam, ROLE_LABELS } from '../../utils/helpers'

const CAT_COLOR: Record<string,string> = {
  مكافأة:'bg-emerald-100 text-emerald-700', تطور:'bg-blue-100 text-blue-700',
  تعاون:'bg-purple-100 text-purple-700', مبادرة:'bg-amber-100 text-amber-700',
  أداء:'bg-yellow-100 text-yellow-700', نتائج:'bg-slate-100 text-slate-600'
}
const MEDALS = ['🥇','🥈','🥉']
const DEFAULT_AUTO = [
  { event_trigger:'حضور التدريب', points: 5, is_active: true },
  { event_trigger:'حضور المباراة', points: 10, is_active: true },
  { event_trigger:'حضور الاجتماع', points: 3, is_active: true },
  { event_trigger:'حضور المعسكر', points: 15, is_active: false },
]

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
  const [form, setForm] = useState({ category:'مكافأة' as any, reason:'', points:'', target:'all', selectedMembers:[] as string[] })
  const [compForm, setCompForm] = useState({ name:'', from_date:'', to_date:'', prize:'' })
  const [saving, setSaving] = useState(false)
  const set = (k:string,v:any) => setForm(p=>({...p,[k]:v}))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [h, c, a] = await Promise.all([
      pointsService.getHistory(teamId),
      pointsService.getCompetitions(teamId),
      pointsService.getAutoSettings(teamId),
    ])
    setHistory(h); setComps(c)
    if (a.length) setAutoSettings(a)
    // Build leaderboard from history
    const totals: Record<string,{name:string,init:string,pts:number,userId:string}> = {}
    h.forEach((t: any) => {
      if (!totals[t.user_id]) totals[t.user_id] = { name: t.profile?.full_name || '?', init: t.profile?.full_name?.[0] || '?', pts: 0, userId: t.user_id }
      totals[t.user_id].pts += t.points
    })
    setLb(Object.values(totals).sort((a,b) => b.pts - a.pts))
    setLoading(false)
  }

  async function addPoints() {
    if (!form.reason.trim() || !form.points || !teamId || !user) return
    setSaving(true)
    const pts = parseInt(form.points)
    let targets: string[] = []
    if (form.target === 'all') targets = members.map(m => m.user_id)
    else if (form.target === 'players') targets = members.filter(m => m.role === 'player').map(m => m.user_id)
    else targets = form.selectedMembers
    const inserts = targets.map(uid => ({
      team_id: teamId, user_id: uid, points: pts,
      category: form.category, reason: form.reason, is_auto: false, created_by: user.id
    }))
    await pointsService.addPoints(inserts)
    await load(); setShowAdd(false)
    setForm({ category:'مكافأة', reason:'', points:'', target:'all', selectedMembers:[] }); setSaving(false)
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
  const maxPts = lb[0]?.pts || 1
  const memberItems = members.map(m => ({ value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] }))

  return (
    <div>
      <PageHeader title="نظام النقاط والمكافآت"
        action={isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}><Settings size={13}/></button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={13}/> نقاط</button>
          </div>
        )}/>
      <Tabs tabs={[{key:'leaderboard',label:'🏆 الترتيب'},{key:'history',label:'📋 السجل'},{key:'competitions',label:'🎯 المسابقات'}]}
        active={tab} onChange={setTab}/>
      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {tab === 'leaderboard' && (
            lb.length === 0
              ? <div className="card"><EmptyState icon={<Star size={24}/>} title="لا توجد نقاط بعد" description="أضف نقاطاً للأعضاء للبدء"/></div>
              : <div className="space-y-3">
                  {lb.map((p,i) => (
                    <div key={p.userId} className="card mb-0 flex items-center gap-3">
                      <div className="text-2xl w-9 text-center flex-shrink-0">{MEDALS[i] || <span className="text-sm font-bold text-slate-400">#{i+1}</span>}</div>
                      <div className="w-9 h-9 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        {p.init}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{p.name}</div>
                        <ProgressBar value={Math.round(p.pts/maxPts*100)} color="bg-yellow-400"/>
                      </div>
                      <div className="text-center bg-yellow-50 px-3 py-1.5 rounded-xl">
                        <div className="text-lg font-bold text-yellow-600">{p.pts}</div>
                        <div className="text-xs text-slate-400">نقطة</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}
          {tab === 'history' && (
            history.length === 0
              ? <div className="card"><EmptyState title="لا يوجد سجل"/></div>
              : <div className="card p-0 divide-y divide-slate-50">
                  {history.map((h: any) => (
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
                        <div className="text-lg font-bold text-yellow-600">+{h.points}</div>
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

      {/* Add Points Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="⭐ إضافة نقاط">
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
        <FormField label="المستفيدون">
          <div className="flex gap-2 mb-3">
            {[['all','الكل'],['players','اللاعبون'],['select','محددون']].map(([v,l]) => (
              <button key={v} onClick={() => set('target', v)}
                className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.target===v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
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
          <input className="form-input" type="number" value={form.points} onChange={e => set('points', e.target.value)} placeholder="10"/>
        </FormField>
        <FormField label="السبب" required>
          <input className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="أداء ممتاز في المباراة..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addPoints} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إضافة'}</button>
        </div>
      </Modal>

      {/* Auto Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="⚙️ النقاط التلقائية">
        <div className="text-xs text-slate-400 mb-3">تُضاف تلقائياً عند تسجيل الحضور</div>
        <div className="space-y-2">
          {autoSettings.map((s,i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
              <input type="checkbox" checked={s.is_active}
                onChange={e => { const a=[...autoSettings]; a[i]={...a[i],is_active:e.target.checked}; setAutoSettings(a) }}
                className="w-4 h-4 accent-brand-500"/>
              <span className="flex-1 text-sm">{s.event_trigger}</span>
              <input type="number" value={s.points}
                onChange={e => { const a=[...autoSettings]; a[i]={...a[i],points:parseInt(e.target.value)||0}; setAutoSettings(a) }}
                className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm"/>
              <span className="text-xs text-slate-400">نقطة</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end mt-4">
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
