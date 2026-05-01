import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, DollarSign } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { financeService, teamService } from '../../services'
import { Spinner, PageHeader, StatCard, Modal, FormField, ProgressBar, EmptyState, Tabs, CheckboxList } from '../../components/ui'
import { canManageFinance, RIYAL, ROLE_LABELS, formatDate } from '../../utils/helpers'

export default function FinancePage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [obs, setObs] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('obligations')
  const [showAdd, setShowAdd] = useState(false)
  const [showPay, setShowPay] = useState<any>(null)
  const [form, setForm] = useState({
    title: '', amount: '', due_date: '',
    target_type: 'all', target_role: 'player', target_user_ids: [] as string[]
  })
  const [payAmt, setPayAmt] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [o, p] = await Promise.all([financeService.getObligations(teamId), financeService.getPayments(teamId)])
    setObs(o); setPayments(p); setLoading(false)
  }

  function getTargetMembers(ob: any): any[] {
    if (ob.target_type === 'all') return members
    if (ob.target_type === 'role') return members.filter(m => m.role === ob.target_role)
    if (ob.target_type === 'specific') return members.filter(m => ob.target_user_ids?.includes(m.user_id))
    return members
  }

  function getPaid(obId: string, userId: string): number {
    const p = payments.find(p => p.obligation_id === obId && p.user_id === userId)
    return p?.paid_amount || 0
  }

  async function addObligation() {
    if (!form.title || !form.amount || !teamId || !user) return
    setSaving(true)
    await financeService.createObligation({
      title: form.title, amount: parseFloat(form.amount),
      due_date: form.due_date || null, team_id: teamId,
      target_type: form.target_type,
      target_role: form.target_type === 'role' ? form.target_role : null,
      target_user_ids: form.target_type === 'specific' ? form.target_user_ids : null,
      created_by: user.id
    })
    await load(); setShowAdd(false)
    setForm({ title:'', amount:'', due_date:'', target_type:'all', target_role:'player', target_user_ids:[] }); setSaving(false)
  }

  async function recordPayment() {
    if (!showPay || !teamId || !user) return
    setSaving(true)
    const amt = parseFloat(payAmt) || showPay.ob.amount
    const cur = getPaid(showPay.ob.id, showPay.userId)
    const total = Math.min(showPay.ob.amount, cur + amt)
    await financeService.upsertPayment({
      obligation_id: showPay.ob.id, user_id: showPay.userId, team_id: teamId,
      amount: showPay.ob.amount, paid_amount: total,
      status: total >= showPay.ob.amount ? 'paid' : total > 0 ? 'partial' : 'unpaid',
      paid_at: new Date().toISOString(), recorded_by: user.id
    })
    await load(); setShowPay(null); setPayAmt(''); setSaving(false)
  }

  const isAdmin = canManageFinance(myRole)
  const isPlayer = !isAdmin && myRole !== ''

  // Stats
  const totalReq = obs.reduce((s, o) => s + o.amount * getTargetMembers(o).length, 0)
  const totalPaid = obs.reduce((s, o) => s + getTargetMembers(o).reduce((ss: number, m: any) => ss + getPaid(o.id, m.user_id), 0), 0)

  // My finance (for player view)
  const myObs = obs.map(o => {
    const targets = getTargetMembers(o)
    const isMine = targets.some(m => m.user_id === user?.id)
    return isMine ? { ...o, myPaid: getPaid(o.id, user!.id) } : null
  }).filter(Boolean)

  const memberItems = members.map(m => ({ value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] || m.role }))

  const collectPct = totalReq > 0 ? Math.round(totalPaid / totalReq * 100) : 0

  return (
    <div>
      <PageHeader title="المالية"
        action={isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14}/>التزام جديد</button>
        )}/>

      {/* Admin hero stats */}
      {isAdmin && (
        <div className="hero-card mb-5">
          {/* decorative circle */}
          <div className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-10 bg-white -translate-x-16 -translate-y-12"/>
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                <DollarSign size={20} className="text-white"/>
              </div>
              <div>
                <div className="text-white/70 text-xs font-bold">نسبة التحصيل</div>
                <div className="text-white text-2xl font-extrabold leading-none">{collectPct}%</div>
              </div>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${collectPct}%` }}/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/15 rounded-2xl p-3 text-center">
                <div className="text-white text-base font-extrabold leading-none mb-1">{totalReq.toLocaleString()}</div>
                <div className="text-white/70 text-xs">المطلوب {RIYAL}</div>
              </div>
              <div className="bg-white/15 rounded-2xl p-3 text-center">
                <div className="text-emerald-200 text-base font-extrabold leading-none mb-1">{totalPaid.toLocaleString()}</div>
                <div className="text-white/70 text-xs">المحصّل {RIYAL}</div>
              </div>
              <div className="bg-white/15 rounded-2xl p-3 text-center">
                <div className="text-red-300 text-base font-extrabold leading-none mb-1">{(totalReq - totalPaid).toLocaleString()}</div>
                <div className="text-white/70 text-xs">المتبقي {RIYAL}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player view - only my obligations */}
      {isPlayer && (
        <div>
          <p className="text-sm font-extrabold text-slate-600 mb-3">مستحقاتي المالية</p>
          {myObs.length === 0
            ? <div className="card"><EmptyState icon={<DollarSign size={24}/>} title="لا توجد مستحقات"/></div>
            : myObs.map((o: any) => {
                const pct = Math.round(o.myPaid / o.amount * 100)
                const status = o.myPaid >= o.amount ? 'مسدد' : o.myPaid > 0 ? 'جزئي' : 'غير مسدد'
                const sc = o.myPaid >= o.amount ? 'bg-emerald-100 text-emerald-700' : o.myPaid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                const borderCl = o.myPaid >= o.amount ? 'border-r-4 border-emerald-400' : o.myPaid > 0 ? 'border-r-4 border-amber-400' : 'border-r-4 border-red-400'
                return (
                  <div key={o.id} className={`card mb-3 ${borderCl}`}>
                    <div className="flex justify-between mb-2">
                      <div className="font-extrabold text-sm text-slate-800">{o.title}</div>
                      <span className={`badge ${sc}`}>{status}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span>المطلوب: {o.amount} {RIYAL}</span>
                      <span>المسدد: {o.myPaid} {RIYAL}</span>
                    </div>
                    <ProgressBar value={pct} color={o.myPaid >= o.amount ? 'bg-emerald-500' : 'bg-amber-400'}/>
                    <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                      <span>{pct}% مسدد</span>
                      {o.due_date && <span>الاستحقاق: {o.due_date}</span>}
                    </div>
                  </div>
                )
              })}
        </div>
      )}

      {/* Admin view */}
      {isAdmin && (
        loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : obs.length === 0
          ? <div className="card"><EmptyState icon={<DollarSign size={24}/>} title="لا توجد التزامات" description="اضغط + لإضافة التزام مالي"/></div>
          : <div className="space-y-4">
              {obs.map(ob => {
                const targets = getTargetMembers(ob)
                const totalOb = ob.amount * targets.length
                const paidOb = targets.reduce((s: number, m: any) => s + getPaid(ob.id, m.user_id), 0)
                const pct = totalOb ? Math.round(paidOb / totalOb * 100) : 0
                return (
                  <div key={ob.id} className="card mb-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-extrabold text-sm text-slate-800">{ob.title}</div>
                      <div className="text-sm font-extrabold text-brand-600">{ob.amount} {RIYAL}</div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mb-3">
                      <span className="flex items-center gap-1">
                        <span>👥</span>
                        {ob.target_type === 'all' ? 'الكل' : ob.target_type === 'role' ? ROLE_LABELS[ob.target_role] || ob.target_role : `${targets.length} أشخاص محددون`}
                        · {targets.length} شخص
                      </span>
                      {ob.due_date && <span className="text-amber-600 font-bold">الاستحقاق: {ob.due_date}</span>}
                    </div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-bold">التحصيل الكلي</span>
                      <span className="font-extrabold text-slate-700">{paidOb.toFixed(0)}/{totalOb} {RIYAL}
                        <span className={`mr-1.5 ${pct >= 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-red-500'}`}>({pct}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={pct} color={pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-400' : 'bg-red-400'}/>
                    <div className="mt-3 space-y-2">
                      {targets.map((m: any) => {
                        const paid = getPaid(ob.id, m.user_id)
                        const p = Math.round(paid / ob.amount * 100)
                        const st = paid >= ob.amount ? 'مسدد' : paid > 0 ? 'جزئي' : 'غير مسدد'
                        const sc = paid >= ob.amount ? 'bg-emerald-100 text-emerald-700' : paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        return (
                          <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                            <div className="w-7 h-7 bg-brand-100 text-brand-700 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                              {m.profile?.full_name?.[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="font-bold truncate">{m.profile?.full_name}</span>
                                <span className="text-slate-400">{paid}/{ob.amount} {RIYAL}</span>
                              </div>
                              <ProgressBar value={p} height="h-1.5"/>
                            </div>
                            <span className={`badge text-xs ${sc}`}>{st}</span>
                            <button onClick={() => setShowPay({ ob, userId: m.user_id, name: m.profile?.full_name })}
                              className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold px-2.5 py-1.5 rounded-xl transition-colors border-none cursor-pointer">
                              دفعة
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {/* Add Obligation Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة التزام مالي" width="max-w-lg">
        <FormField label="الالتزام" required>
          <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="اشتراك شهري..."/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={`المبلغ (${RIYAL})`} required>
            <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="300"/>
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            <input className="form-input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}/>
          </FormField>
        </div>
        <FormField label="يُطبّق على">
          <div className="flex gap-2 mb-3">
            {[['all','الكل'],['role','فئة'],['specific','أشخاص محددون']].map(([v,l]) => (
              <button key={v} onClick={() => set('target_type', v)}
                className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${form.target_type===v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {form.target_type === 'role' && (
            <select className="form-input" value={form.target_role} onChange={e => set('target_role', e.target.value)}>
              {['player','head_coach','assistant_coach','administrator'].map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          )}
          {form.target_type === 'specific' && (
            <CheckboxList items={memberItems} selected={form.target_user_ids}
              onChange={v => set('target_user_ids', v)}/>
          )}
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addObligation} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'إضافة'}
          </button>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!showPay} onClose={() => setShowPay(null)} title={`دفعة — ${showPay?.name}`}>
        {showPay && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm">
              <div className="font-bold">{showPay.ob.title}</div>
              <div className="text-slate-500 text-xs mt-1">
                المطلوب: {showPay.ob.amount} {RIYAL} · المدفوع: {getPaid(showPay.ob.id, showPay.userId)} {RIYAL}
              </div>
            </div>
            <FormField label={`مبلغ الدفعة (${RIYAL})`}>
              <input className="form-input" type="number" value={payAmt}
                onChange={e => setPayAmt(e.target.value)}
                placeholder={String(showPay.ob.amount - getPaid(showPay.ob.id, showPay.userId))}/>
            </FormField>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost btn-sm" onClick={() => { setPayAmt(String(showPay.ob.amount)); setTimeout(recordPayment, 100) }}>
                مسدد كامل
              </button>
              <button className="btn btn-primary" onClick={recordPayment} disabled={saving}>
                {saving ? <Spinner size="sm"/> : 'تسجيل'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
