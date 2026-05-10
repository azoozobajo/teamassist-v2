import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus, DollarSign, Trash2, Receipt, RefreshCw, Calendar,
  Settings, ChevronDown, ChevronUp, FileText, ImageIcon, X, Eye
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  financeService, teamService, teamExpensesService,
  permissionService, subscriptionService
} from '../../services'
import {
  Spinner, PageHeader, Modal, FormField, ProgressBar,
  EmptyState, Tabs, CheckboxList
} from '../../components/ui'
import { canManageFinance, RIYAL, ROLE_LABELS, EXPENSE_CATEGORIES, hasPermission } from '../../utils/helpers'

export default function FinancePage() {
  const { teamId } = useParams()
  const { user } = useAuth()

  // ── existing state ────────────────────────────────────────────────────
  const [obs, setObs] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [myPerms, setMyPerms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('obligations')
  const [showAdd, setShowAdd] = useState(false)
  const [showPay, setShowPay] = useState<any>(null)
  const [showExpense, setShowExpense] = useState(false)
  const [form, setForm] = useState({
    title: '', amount: '', due_date: '',
    target_type: 'all', target_role: 'player', target_user_ids: [] as string[]
  })
  const [expForm, setExpForm] = useState({
    title: '', amount: '', category: 'أخرى', expense_date: '', notes: '',
    receipt_images: [] as string[]
  })
  const [payAmt, setPayAmt] = useState('')
  const [saving, setSaving] = useState(false)
  const [opError, setOpError] = useState('')
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const setExp = (k: string, v: any) => setExpForm(p => ({ ...p, [k]: v }))

  // ── subscription state ────────────────────────────────────────────────
  const [team, setTeam] = useState<any>(null)
  const [allSubs, setAllSubs] = useState<any[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set())
  const [showStatement, setShowStatement] = useState<any>(null)
  const [showRenew, setShowRenew] = useState<any>(null)
  const [renewForm, setRenewForm] = useState<{
    months: number; startDate: string
    discountType: 'percent' | 'fixed' | null; discountValue: number
    paymentStatus: 'paid' | 'partial' | 'unpaid'; paidAmount: number
    notes: string
  }>({
    months: 1, startDate: new Date().toISOString().slice(0, 10),
    discountType: null, discountValue: 0,
    paymentStatus: 'paid', paidAmount: 0, notes: ''
  })

  // ── receipt image upload ──────────────────────────────────────────────
  const [uploadingImg, setUploadingImg] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    teamService.getTeam(teamId).then(setTeam)
    permissionService.getUserPermissions(teamId, user.id).then(setMyPerms)
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [o, p, e] = await Promise.all([
      financeService.getObligations(teamId),
      financeService.getPayments(teamId),
      teamExpensesService.getAll(teamId)
    ])
    setObs(o); setPayments(p); setExpenses(e); setLoading(false)
    // load subs in background for combined view
    loadSubs()
  }

  async function loadSubs() {
    if (!teamId) return
    setSubsLoading(true)
    try {
      const data = await subscriptionService.getTeamSubscriptionsAll(teamId)
      setAllSubs(data)
      subscriptionService.checkNotifications(teamId).catch(() => {})
    } catch {}
    setSubsLoading(false)
  }

  // ── derived: filtered subs ────────────────────────────────────────────
  const filteredSubs = allSubs.filter(s =>
    (!dateFrom || s.start_date >= dateFrom) &&
    (!dateTo || s.start_date <= dateTo)
  )

  // group filtered subs by player (already ordered DESC by start_date from RPC)
  const playerSubsMap: Record<string, any[]> = {}
  filteredSubs.forEach(s => {
    if (!playerSubsMap[s.player_id]) playerSubsMap[s.player_id] = []
    playerSubsMap[s.player_id].push(s)
  })

  // merge with members list so every active member appears
  const allPlayerRows = members.map(m => {
    const subs = playerSubsMap[m.user_id] || []
    return {
      player_id: m.user_id,
      full_name: m.profile?.full_name,
      avatar_url: m.profile?.avatar_url,
      role: m.role,
      subs,
      latestSub: subs[0] || null,
    }
  })

  const totalPaid = filteredSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)
  const totalRemaining = filteredSubs.reduce(
    (s, sub) => s + Math.max(0, Number(sub.final_amount) - Number(sub.paid_amount || 0)), 0
  )

  function getSubStatus(s: any): 'none' | 'expired' | 'warning' | 'active' {
    if (s === null || s === undefined || s.days_left === null || s.days_left === undefined) return 'none'
    if (s.days_left < 0) return 'expired'
    if (s.days_left <= 7) return 'warning'
    return 'active'
  }

  const subCounts = {
    active: allPlayerRows.filter(p => getSubStatus(p.latestSub) === 'active').length,
    warning: allPlayerRows.filter(p => getSubStatus(p.latestSub) === 'warning').length,
    expired: allPlayerRows.filter(p => ['expired', 'none'].includes(getSubStatus(p.latestSub))).length,
  }

  // ── renewal calc ──────────────────────────────────────────────────────
  const renewTotal = (() => {
    if (!team?.subscription_fee) return 0
    let t = parseFloat(team.subscription_fee) * renewForm.months
    if (renewForm.discountType === 'percent') t *= (1 - renewForm.discountValue / 100)
    else if (renewForm.discountType === 'fixed') t = Math.max(0, t - renewForm.discountValue)
    return Math.round(t * 100) / 100
  })()

  // ── helpers ───────────────────────────────────────────────────────────
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
  function toggleExpand(pid: string) {
    setExpandedPlayers(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
  }

  // ── actions ───────────────────────────────────────────────────────────
  async function addObligation() {
    if (!form.title || !form.amount || !teamId || !user) return
    setSaving(true); setOpError('')
    const { error } = await financeService.createObligation({
      title: form.title, amount: parseFloat(form.amount),
      due_date: form.due_date || null, team_id: teamId,
      target_type: form.target_type,
      target_role: form.target_type === 'role' ? form.target_role : null,
      target_user_ids: form.target_type === 'specific' ? form.target_user_ids : null,
      created_by: user.id
    })
    if (error) { setOpError('فشل إضافة الالتزام: ' + (error.message || 'خطأ غير معروف')); setSaving(false); return }
    await load(); setShowAdd(false)
    setForm({ title:'', amount:'', due_date:'', target_type:'all', target_role:'player', target_user_ids:[] })
    setSaving(false)
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

  async function addExpense() {
    if (!expForm.title || !expForm.amount || !teamId || !user) return
    setSaving(true); setOpError('')
    const { error } = await teamExpensesService.create({
      team_id: teamId, title: expForm.title,
      amount: parseFloat(expForm.amount), category: expForm.category,
      expense_date: expForm.expense_date || new Date().toISOString().slice(0,10),
      notes: expForm.notes || null, created_by: user.id,
      receipt_images: expForm.receipt_images.length > 0 ? expForm.receipt_images : null,
    })
    if (error) { setOpError('فشل إضافة المصروف: ' + (error.message || 'خطأ غير معروف')); setSaving(false); return }
    await load(); setShowExpense(false)
    setExpForm({ title:'', amount:'', category:'أخرى', expense_date:'', notes:'', receipt_images:[] })
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return
    await teamExpensesService.delete(id); await load()
  }

  async function handleReceiptUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingImg(true)
    const newUrls: string[] = []
    for (const file of Array.from(files)) {
      if (expForm.receipt_images.length + newUrls.length >= 5) break
      try {
        const url = await teamExpensesService.uploadReceiptImage(file)
        newUrls.push(url)
      } catch {}
    }
    setExpForm(p => ({ ...p, receipt_images: [...p.receipt_images, ...newUrls] }))
    setUploadingImg(false)
  }

  async function doRenew() {
    if (!showRenew || !teamId || !user || !team?.subscription_fee) return
    setSaving(true); setOpError('')
    const { error } = await subscriptionService.renewSubscription(teamId, showRenew.player_id, {
      months: renewForm.months,
      startDate: renewForm.startDate,
      originalAmount: parseFloat(team.subscription_fee),
      discountType: renewForm.discountType,
      discountValue: renewForm.discountValue,
      paymentStatus: renewForm.paymentStatus,
      paidAmount: renewForm.paymentStatus === 'partial' ? renewForm.paidAmount : null,
      notes: renewForm.notes,
      renewedBy: user.id,
    })
    if (error) { setOpError('فشل تجديد الاشتراك: ' + (error.message || 'خطأ غير معروف')); setSaving(false); return }
    await loadSubs()
    setShowRenew(null)
    setRenewForm({
      months: 1, startDate: new Date().toISOString().slice(0, 10),
      discountType: null, discountValue: 0,
      paymentStatus: 'paid', paidAmount: 0, notes: ''
    })
    setSaving(false)
  }

  // ── permissions ───────────────────────────────────────────────────────
  const isAdmin = canManageFinance(myRole)
  const canManageExpenses = isAdmin || hasPermission(myPerms, myRole, 'manage_team_expenses' as any)
  const isPlayer = !isAdmin && myRole !== ''

  const totalReq = obs.reduce((s, o) => s + o.amount * getTargetMembers(o).length, 0)
  const totalPaidObl = obs.reduce((s, o) => s + getTargetMembers(o).reduce((ss: number, m: any) => ss + getPaid(o.id, m.user_id), 0), 0)
  const collectPct = totalReq > 0 ? Math.round(totalPaidObl / totalReq * 100) : 0

  const myObs = obs.map(o => {
    const targets = getTargetMembers(o)
    const isMine = targets.some(m => m.user_id === user?.id)
    return isMine ? { ...o, myPaid: getPaid(o.id, user!.id) } : null
  }).filter(Boolean)

  const memberItems = members.map(m => ({
    value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] || m.role
  }))

  // sub status label helpers
  const DOT_COLOR: Record<string,string> = { none:'bg-slate-300', expired:'bg-red-500', warning:'bg-amber-400', active:'bg-emerald-500' }
  const BADGE_CLS: Record<string,string> = { none:'bg-slate-100 text-slate-500', expired:'bg-red-100 text-red-700', warning:'bg-amber-100 text-amber-700', active:'bg-emerald-100 text-emerald-700' }
  const PAY_CLS: Record<string,string> = { paid:'bg-emerald-100 text-emerald-700', partial:'bg-amber-100 text-amber-700', unpaid:'bg-red-100 text-red-700' }
  const PAY_LBL: Record<string,string> = { paid:'مسدد', partial:'جزئي', unpaid:'لم يسدد' }
  const STATUS_LBL: Record<string,string> = { none:'لا اشتراك', expired:'منتهٍ', warning:'ينتهي قريباً', active:'نشط' }

  function subBadgeText(s: any, status: string) {
    if (status === 'none') return 'لا اشتراك'
    if (status === 'expired') return `انتهى منذ ${Math.abs(s.days_left)} يوم`
    if (status === 'warning') return `ينتهي بعد ${s.days_left} يوم`
    return `${s.days_left} يوم متبقي`
  }

  // ── per-member combined financial summary (obligations + subscription debts) ──
  const memberFinanceSummary = members.map(m => {
    const obDebt = obs.reduce((total, ob) => {
      const targets = getTargetMembers(ob)
      if (!targets.some((t: any) => t.user_id === m.user_id)) return total
      return total + Math.max(0, ob.amount - getPaid(ob.id, m.user_id))
    }, 0)
    const subDebt = allSubs
      .filter(s => s.player_id === m.user_id)
      .reduce((t, s) => t + Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0)), 0)
    return { ...m, obDebt, subDebt, totalDebt: obDebt + subDebt }
  }).filter(m => m.totalDebt > 0)

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div>
      {opError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex justify-between items-start">
          <span>⚠️ {opError}</span>
          <button onClick={() => setOpError('')} className="text-red-400 hover:text-red-600 ml-2 border-none bg-transparent cursor-pointer text-xs">✕</button>
        </div>
      )}
      <PageHeader title="المالية"
        action={
          <div className="flex gap-2">
            {canManageExpenses && tab === 'expenses' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowExpense(true)}>
                <Plus size={14}/>مصروف
              </button>
            )}
            {isAdmin && tab === 'obligations' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                <Plus size={14}/>التزام جديد
              </button>
            )}
          </div>
        }/>

      <Tabs
        tabs={[
          { key: 'obligations', label: '﷼ الالتزامات' },
          { key: 'subscriptions', label: '📅 الاشتراكات' },
          { key: 'expenses', label: '🧾 مصاريف الفريق' }
        ]}
        active={tab} onChange={setTab}/>

      {/* ── OBLIGATIONS TAB ── */}
      {tab === 'obligations' && (
        <>
          {isAdmin && (
            <div className="hero-card mb-5">
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
                    <div className="text-emerald-200 text-base font-extrabold leading-none mb-1">{totalPaidObl.toLocaleString()}</div>
                    <div className="text-white/70 text-xs">المحصّل {RIYAL}</div>
                  </div>
                  <div className="bg-white/15 rounded-2xl p-3 text-center">
                    <div className="text-red-300 text-base font-extrabold leading-none mb-1">{(totalReq - totalPaidObl).toLocaleString()}</div>
                    <div className="text-white/70 text-xs">المتبقي {RIYAL}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isPlayer && (() => {
            const mySubDebt = allSubs
              .filter(s => s.player_id === user?.id)
              .reduce((t, s) => t + Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0)), 0)
            const myObDebt = myObs.reduce((t: number, o: any) => t + Math.max(0, o.amount - o.myPaid), 0)
            const grandTotal = mySubDebt + myObDebt
            return grandTotal > 0 ? (
              <div className="card bg-orange-50 border-orange-200 mb-4">
                <div className="font-extrabold text-slate-800 text-sm mb-3">📊 ملخصك المالي</div>
                {myObDebt > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">الالتزامات غير المسددة</span>
                    <span className="font-bold text-red-600">{myObDebt} {RIYAL}</span>
                  </div>
                )}
                {mySubDebt > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">مديونية الاشتراكات</span>
                    <span className="font-bold text-red-600">{mySubDebt} {RIYAL}</span>
                  </div>
                )}
                <div className="border-t border-orange-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-slate-700">إجمالي ما عليك</span>
                  <span className="font-extrabold text-red-700 text-xl">{grandTotal} {RIYAL}</span>
                </div>
              </div>
            ) : null
          })()}

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

          {/* Combined financial summary per member (admin) */}
          {isAdmin && memberFinanceSummary.length > 0 && (
            <div className="card mb-4 border-orange-200 bg-orange-50">
              <div className="font-extrabold text-slate-800 text-sm mb-3">📊 ملخص الوضع المالي للأعضاء</div>
              <div className="space-y-2">
                {memberFinanceSummary.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2 py-2 border-b border-orange-100 last:border-0">
                    <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                      {m.profile?.full_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-800">{m.profile?.full_name}</div>
                      <div className="flex gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                        {m.obDebt > 0 && <span>التزامات: {m.obDebt} {RIYAL}</span>}
                        {m.subDebt > 0 && <span>اشتراكات: {m.subDebt} {RIYAL}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-extrabold text-red-600 text-sm">{m.totalDebt} {RIYAL}</div>
                      <div className="text-xs text-slate-400">إجمالي المديونية</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        </>
      )}

      {/* ── SUBSCRIPTIONS TAB ── */}
      {tab === 'subscriptions' && (
        <div>
          {!team?.subscriptions_enabled ? (
            <div className="card border-amber-200 bg-amber-50 text-center py-10">
              <Calendar size={40} className="text-amber-400 mx-auto mb-3"/>
              <div className="font-bold text-slate-700 mb-1">نظام الاشتراكات غير مفعّل</div>
              <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">
                فعّل نظام الاشتراكات من إعدادات الفريق إذا كان فريقك يتطلب رسوم شهرية من اللاعبين
              </p>
              {isAdmin && (
                <a href={`/team/${teamId}/settings`} className="btn btn-sm btn-ghost gap-1">
                  <Settings size={13}/> إعدادات الفريق
                </a>
              )}
            </div>
          ) : (
            <>
              {isAdmin && !team?.subscription_fee && (
                <div className="card border-amber-200 bg-amber-50 mb-4 text-sm text-amber-700 flex items-center gap-2">
                  ⚠️
                  <span>لم تحدد قيمة الاشتراك الشهري.</span>
                  <a href={`/team/${teamId}/settings`} className="underline font-bold">حددها من الإعدادات</a>
                </div>
              )}

              {/* ── ADMIN VIEW ── */}
              {isAdmin && (
                <>
                  {/* Date filter */}
                  <div className="card mb-4 p-3">
                    <div className="text-xs font-bold text-slate-500 mb-2">فلترة حسب تاريخ بداية الاشتراك</div>
                    <div className="flex gap-2 items-end flex-wrap">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-slate-400 block mb-1">من</label>
                        <input type="date" className="form-input text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-slate-400 block mb-1">إلى</label>
                        <input type="date" className="form-input text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
                      </div>
                      {(dateFrom || dateTo) && (
                        <button className="btn btn-sm btn-ghost text-red-500" onClick={() => { setDateFrom(''); setDateTo('') }}>
                          مسح الفلتر
                        </button>
                      )}
                    </div>
                    {(dateFrom || dateTo) && (
                      <div className="text-xs text-slate-400 mt-1.5">
                        يعرض {filteredSubs.length} سجل اشتراك في الفترة المحددة
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="card text-center py-3 mb-0">
                      <div className="text-xl font-extrabold text-emerald-600">{subCounts.active}</div>
                      <div className="text-xs text-slate-400 mt-0.5">🟢 نشط</div>
                    </div>
                    <div className="card text-center py-3 mb-0">
                      <div className="text-xl font-extrabold text-amber-500">{subCounts.warning}</div>
                      <div className="text-xs text-slate-400 mt-0.5">🟡 ينتهي قريباً</div>
                    </div>
                    <div className="card text-center py-3 mb-0">
                      <div className="text-xl font-extrabold text-red-500">{subCounts.expired}</div>
                      <div className="text-xs text-slate-400 mt-0.5">🔴 منتهٍ / لا اشتراك</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                      <div className="text-xs text-emerald-600 font-bold mb-1">💰 إجمالي المحصّل</div>
                      <div className="text-lg font-extrabold text-emerald-700">{totalPaid.toLocaleString()} {RIYAL}</div>
                      {(dateFrom || dateTo) && <div className="text-xs text-slate-400 mt-0.5">في الفترة المحددة</div>}
                    </div>
                    <div className="rounded-2xl bg-red-50 border border-red-100 p-3">
                      <div className="text-xs text-red-600 font-bold mb-1">📊 إجمالي المتبقي</div>
                      <div className="text-lg font-extrabold text-red-600">{totalRemaining.toLocaleString()} {RIYAL}</div>
                      {(dateFrom || dateTo) && <div className="text-xs text-slate-400 mt-0.5">في الفترة المحددة</div>}
                    </div>
                  </div>

                  {/* Player list */}
                  {subsLoading
                    ? <div className="flex justify-center py-10"><Spinner/></div>
                    : allPlayerRows.length === 0
                      ? <div className="card"><EmptyState icon={<Calendar size={24}/>} title="لا يوجد أعضاء نشطون"/></div>
                      : <div className="space-y-2">
                          {allPlayerRows.map(p => {
                            const status = getSubStatus(p.latestSub)
                            const isExpanded = expandedPlayers.has(p.player_id)
                            const playerTotalPaid = p.subs.reduce((s: number, sub: any) => s + Number(sub.paid_amount || 0), 0)
                            const playerDebt = p.subs.reduce((s: number, sub: any) => s + Math.max(0, Number(sub.final_amount) - Number(sub.paid_amount || 0)), 0)
                            return (
                              <div key={p.player_id} className="card mb-0">
                                {/* Player row */}
                                <div className="flex items-center gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[status]}`}/>
                                  <div className="w-9 h-9 bg-brand-100 rounded-xl flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0 overflow-hidden">
                                    {p.avatar_url
                                      ? <img src={p.avatar_url} className="w-full h-full object-cover"/>
                                      : p.full_name?.[0]}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-800">{p.full_name}</div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 flex-wrap">
                                      <span>{ROLE_LABELS[p.role] || p.role}</span>
                                      {p.latestSub && <span>· حتى: {p.latestSub.end_date}</span>}
                                      {p.subs.length > 0 && (
                                        <span className="text-brand-500 font-bold">
                                          · {p.subs.length} {p.subs.length === 1 ? 'تجديد' : 'تجديدات'}
                                        </span>
                                      )}
                                      {playerDebt > 0 && (
                                        <span className="text-red-500 font-bold">· مديونية: {playerDebt} {RIYAL}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className={`badge text-xs ${BADGE_CLS[status]}`}>
                                      {p.latestSub ? subBadgeText(p.latestSub, status) : 'لا اشتراك'}
                                    </span>
                                    {p.subs.length > 0 && (
                                      <button onClick={() => toggleExpand(p.player_id)}
                                        className="btn btn-sm btn-ghost px-2" title="السجل">
                                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                      </button>
                                    )}
                                    <button onClick={() => setShowStatement(p)}
                                      className="btn btn-sm btn-ghost px-2 text-slate-500" title="كشف حساب">
                                      <FileText size={13}/>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowRenew(p)
                                        setRenewForm({
                                          months: 1, startDate: new Date().toISOString().slice(0, 10),
                                          discountType: null, discountValue: 0,
                                          paymentStatus: 'paid', paidAmount: 0, notes: ''
                                        })
                                      }}
                                      className="btn btn-sm btn-ghost gap-1">
                                      <RefreshCw size={13}/> تجديد
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded history table */}
                                {isExpanded && p.subs.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-slate-100">
                                    <div className="text-xs font-bold text-slate-500 mb-2">سجل الاشتراكات</div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-slate-400">
                                            <th className="text-right pb-1.5 font-bold">من</th>
                                            <th className="text-right pb-1.5 font-bold">إلى</th>
                                            <th className="text-right pb-1.5 font-bold">المدة</th>
                                            <th className="text-right pb-1.5 font-bold">المبلغ</th>
                                            <th className="text-right pb-1.5 font-bold">المدفوع</th>
                                            <th className="text-right pb-1.5 font-bold">الدفع</th>
                                            <th className="text-right pb-1.5 font-bold">الاشتراك</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {p.subs.map((s: any) => {
                                            const ss = getSubStatus(s)
                                            return (
                                              <tr key={s.sub_id} className="border-t border-slate-50">
                                                <td className="py-1.5 text-slate-600">{s.start_date}</td>
                                                <td className="py-1.5 text-slate-600">{s.end_date}</td>
                                                <td className="py-1.5 text-slate-500">{s.months} شهر</td>
                                                <td className="py-1.5 font-bold text-slate-700">{s.final_amount} {RIYAL}</td>
                                                <td className="py-1.5 text-slate-600">{Number(s.paid_amount || 0).toLocaleString()} {RIYAL}</td>
                                                <td className="py-1.5">
                                                  <span className={`badge text-xs ${PAY_CLS[s.payment_status || 'paid']}`}>
                                                    {PAY_LBL[s.payment_status || 'paid']}
                                                  </span>
                                                </td>
                                                <td className="py-1.5">
                                                  <span className={`badge text-xs ${BADGE_CLS[ss]}`}>{STATUS_LBL[ss]}</span>
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t-2 border-slate-200 font-bold text-xs">
                                            <td colSpan={3} className="pt-2 text-slate-500">
                                              الإجمالي ({p.subs.length})
                                            </td>
                                            <td className="pt-2 text-slate-700">
                                              {p.subs.reduce((s: number, x: any) => s + Number(x.final_amount), 0)} {RIYAL}
                                            </td>
                                            <td className="pt-2 text-emerald-700">
                                              {playerTotalPaid.toLocaleString()} {RIYAL}
                                            </td>
                                            <td colSpan={2} className={`pt-2 ${playerDebt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                              {playerDebt > 0 ? `متبقي: ${playerDebt} ${RIYAL}` : 'مسدد بالكامل ✅'}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                  }
                </>
              )}

              {/* ── PLAYER VIEW ── */}
              {isPlayer && (
                <div>
                  {(() => {
                    const myAllSubs = allSubs.filter(s => s.player_id === user?.id)
                    const latestSub = myAllSubs[0] || null
                    const status = getSubStatus(latestSub)
                    const myTotalPaid = myAllSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)
                    const myDebt = myAllSubs.reduce((s, sub) => s + Math.max(0, Number(sub.final_amount) - Number(sub.paid_amount || 0)), 0)

                    if (myAllSubs.length === 0) {
                      return (
                        <div className="card text-center py-10">
                          <Calendar size={40} className="text-slate-300 mx-auto mb-3"/>
                          <div className="font-bold text-slate-600 mb-1">لا يوجد اشتراك نشط</div>
                          <p className="text-xs text-slate-400">تواصل مع مسؤول الفريق لتفعيل اشتراكك</p>
                        </div>
                      )
                    }

                    const borderCl = { none:'', expired:'border-r-4 border-red-400', warning:'border-r-4 border-amber-400', active:'border-r-4 border-emerald-400' }[status]
                    return (
                      <div>
                        {latestSub && (
                          <div className={`card ${borderCl} mb-4`}>
                            <div className="font-extrabold text-slate-800 mb-3">اشتراكك الحالي</div>
                            <div className="flex justify-between text-sm text-slate-500 mb-2">
                              <span>من: {latestSub.start_date}</span>
                              <span>حتى: {latestSub.end_date}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-extrabold text-brand-700 text-lg">{latestSub.final_amount} {RIYAL}</span>
                              <span className={`badge ${BADGE_CLS[status]}`}>
                                {subBadgeText(latestSub, status)}
                              </span>
                            </div>
                            {latestSub.payment_status !== 'paid' && (
                              <div className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-2 mt-2">
                                ⚠️ مديونية: {Math.max(0, Number(latestSub.final_amount) - Number(latestSub.paid_amount || 0))} {RIYAL} غير مسددة
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-2xl bg-emerald-50 p-3">
                            <div className="text-xs text-emerald-600 font-bold">إجمالي المدفوع</div>
                            <div className="font-extrabold text-emerald-700 mt-0.5">{myTotalPaid.toLocaleString()} {RIYAL}</div>
                          </div>
                          {myDebt > 0 && (
                            <div className="rounded-2xl bg-red-50 p-3">
                              <div className="text-xs text-red-600 font-bold">إجمالي المديونية</div>
                              <div className="font-extrabold text-red-700 mt-0.5">{myDebt.toLocaleString()} {RIYAL}</div>
                            </div>
                          )}
                        </div>

                        {myAllSubs.length > 1 && (
                          <div className="card">
                            <div className="font-bold text-sm mb-3">سجل اشتراكاتك ({myAllSubs.length})</div>
                            <div className="space-y-2">
                              {myAllSubs.map((s: any) => {
                                const debt = Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0))
                                const ps = s.payment_status || 'paid'
                                return (
                                  <div key={s.sub_id} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0 text-xs">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-slate-700">{s.start_date} ← {s.end_date}</div>
                                      <div className="text-slate-400 mt-0.5">{s.months} شهر · {s.final_amount} {RIYAL}</div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <span className={`badge text-xs ${PAY_CLS[ps]}`}>{PAY_LBL[ps]}</span>
                                      {debt > 0 && <div className="text-red-500 mt-0.5">متبقي: {debt} {RIYAL}</div>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── EXPENSES TAB ── */}
      {tab === 'expenses' && (
        loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
          <div>
            <div className="hero-card mb-5">
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-10 bg-white -translate-x-16 -translate-y-12"/>
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Receipt size={22} className="text-white"/>
                </div>
                <div>
                  <div className="text-white/70 text-xs font-bold mb-0.5">إجمالي مصاريف الفريق</div>
                  <div className="text-white text-2xl font-extrabold">
                    {expenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()} {RIYAL}
                  </div>
                  <div className="text-white/60 text-xs mt-1">{expenses.length} بند مصروف</div>
                </div>
              </div>
            </div>

            {expenses.length === 0
              ? <div className="card"><EmptyState icon={<Receipt size={24}/>} title="لا توجد مصاريف" description="أضف أول مصروف للفريق"/></div>
              : <div className="space-y-2.5">
                  {expenses.map((exp: any) => {
                    const imgs: string[] = exp.receipt_images || []
                    return (
                      <div key={exp.id} className="card mb-0 flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg">
                          {({ 'معدات وكور':'⚽','ملابس وزي':'👕','مياه وتغذية':'💧','مواصلات':'🚌','سكن وفندق':'🏨','طيران':'✈️','أكل ووجبات':'🍽️','رسوم وتسجيل':'📋' } as any)[exp.category] || '📦'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-800">{exp.title}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="badge bg-slate-100 text-slate-600 text-xs">{exp.category}</span>
                            <span className="text-xs text-slate-400">{exp.expense_date}</span>
                            {exp.creator?.full_name && <span className="text-xs text-slate-400">· {exp.creator.full_name}</span>}
                          </div>
                          {exp.notes && <div className="text-xs text-slate-400 mt-1">{exp.notes}</div>}
                          {imgs.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {imgs.map((url, i) => (
                                <button key={i} onClick={() => setPreviewImg(url)}
                                  className="w-14 h-14 rounded-xl overflow-hidden border-2 border-slate-200 flex-shrink-0 hover:border-brand-400 transition-colors">
                                  <img src={url} className="w-full h-full object-cover" alt={`فاتورة ${i+1}`}/>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-extrabold text-brand-700">{Number(exp.amount).toLocaleString()} {RIYAL}</div>
                          {canManageExpenses && (
                            <button onClick={() => deleteExpense(exp.id)}
                              className="text-red-400 hover:text-red-600 mt-1 p-0.5 border-none bg-transparent cursor-pointer">
                              <Trash2 size={13}/>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
            }
          </div>
        )
      )}

      {/* ── Add Obligation Modal ── */}
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
            <CheckboxList items={memberItems} selected={form.target_user_ids} onChange={v => set('target_user_ids', v)}/>
          )}
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addObligation} disabled={saving}>
            {saving ? <Spinner size="sm"/> : 'إضافة'}
          </button>
        </div>
      </Modal>

      {/* ── Add Expense Modal ── */}
      <Modal open={showExpense} onClose={() => setShowExpense(false)} title="🧾 إضافة مصروف للفريق" width="max-w-md">
        <FormField label="البند" required>
          <input className="form-input" value={expForm.title} onChange={e => setExp('title', e.target.value)} placeholder="شراء كور تدريب..."/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={`المبلغ (${RIYAL})`} required>
            <input className="form-input" type="number" value={expForm.amount} onChange={e => setExp('amount', e.target.value)} placeholder="500"/>
          </FormField>
          <FormField label="التاريخ">
            <input className="form-input" type="date" value={expForm.expense_date} onChange={e => setExp('expense_date', e.target.value)}/>
          </FormField>
        </div>
        <FormField label="التصنيف">
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map(c => (
              <button key={c} onClick={() => setExp('category', c)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${expForm.category===c ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {c}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="ملاحظات">
          <input className="form-input" value={expForm.notes} onChange={e => setExp('notes', e.target.value)} placeholder="تفاصيل إضافية..."/>
        </FormField>

        {/* Receipt Images */}
        <FormField label="صور الفواتير (اختياري — حتى 5 صور)">
          <input
            ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleReceiptUpload(e.target.files)}/>
          {expForm.receipt_images.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImg}
              className="btn btn-ghost btn-sm gap-2 mb-2">
              {uploadingImg ? <Spinner size="sm"/> : <ImageIcon size={14}/>}
              {uploadingImg ? 'جارٍ الرفع...' : 'إضافة صورة فاتورة'}
            </button>
          )}
          {expForm.receipt_images.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-1">
              {expForm.receipt_images.map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 flex-shrink-0">
                  <img src={url} className="w-full h-full object-cover" alt={`فاتورة ${i+1}`}/>
                  <button
                    onClick={() => setExpForm(p => ({ ...p, receipt_images: p.receipt_images.filter((_,j) => j !== i) }))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center border-none cursor-pointer">
                    <X size={10}/>
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">يتم ضغط الصور تلقائياً للحفاظ على سرعة التحميل</p>
        </FormField>

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowExpense(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addExpense} disabled={saving || uploadingImg}>
            {saving ? <Spinner size="sm"/> : 'إضافة'}
          </button>
        </div>
      </Modal>

      {/* ── Payment Modal ── */}
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

      {/* ── Renewal Modal ── */}
      <Modal open={!!showRenew} onClose={() => setShowRenew(null)} title={`تجديد اشتراك — ${showRenew?.full_name}`}>
        {showRenew && (
          <>
            {!team?.subscription_fee ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                <p className="mb-3">لم تحدد قيمة الاشتراك الشهري بعد.</p>
                <a href={`/team/${teamId}/settings`} className="btn btn-sm btn-ghost">الذهاب للإعدادات</a>
              </div>
            ) : (
              <>
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-4 text-sm">
                  قيمة الاشتراك الشهري: <strong>{team.subscription_fee} {RIYAL}</strong>
                </div>

                {/* Duration + Start Date */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="تاريخ بداية الاشتراك">
                    <input className="form-input" type="date" value={renewForm.startDate}
                      onChange={e => setRenewForm(p => ({...p, startDate: e.target.value}))}/>
                  </FormField>
                  <FormField label="عدد الشهور">
                    <input className="form-input" type="number" min="1" max="36"
                      value={renewForm.months}
                      onChange={e => setRenewForm(p => ({...p, months: Math.max(1, parseInt(e.target.value)||1)}))}
                      placeholder="1"/>
                  </FormField>
                </div>
                {renewForm.startDate && renewForm.months > 0 && (() => {
                  const end = new Date(renewForm.startDate)
                  end.setMonth(end.getMonth() + renewForm.months)
                  return (
                    <div className="text-xs text-slate-500 -mt-2 mb-3 flex items-center gap-1">
                      <Calendar size={11}/>
                      <span>ينتهي بتاريخ: <strong>{end.toISOString().slice(0,10)}</strong></span>
                    </div>
                  )
                })()}

                {/* Discount */}
                <FormField label="خصم (اختياري)">
                  <div className="flex gap-2 mb-2">
                    {([null,'percent','fixed'] as const).map(dt => (
                      <button key={String(dt)}
                        onClick={() => setRenewForm(p => ({...p, discountType: dt, discountValue: 0}))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${renewForm.discountType===dt ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {dt === null ? 'بدون خصم' : dt === 'percent' ? 'نسبة %' : 'مبلغ ثابت'}
                      </button>
                    ))}
                  </div>
                  {renewForm.discountType && (
                    <input className="form-input" type="number" min="0"
                      placeholder={renewForm.discountType === 'percent' ? 'مثال: 10 (10%)' : `مثال: 50 (${RIYAL})`}
                      value={renewForm.discountValue || ''}
                      onChange={e => setRenewForm(p => ({...p, discountValue: parseFloat(e.target.value)||0}))}/>
                  )}
                </FormField>

                {/* Total */}
                <div className="bg-slate-50 rounded-xl p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">المبلغ الإجمالي</span>
                    <span className="text-xl font-extrabold text-brand-700">{renewTotal} {RIYAL}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {team.subscription_fee} {RIYAL} × {renewForm.months} شهر
                    {renewForm.discountType && ` − خصم ${renewForm.discountValue}${renewForm.discountType==='percent' ? '%' : ` ${RIYAL}`}`}
                  </div>
                </div>

                {/* Payment Status */}
                <FormField label="حالة السداد">
                  <div className="flex gap-2 mb-2">
                    {([
                      ['paid','مسدد كامل ✅'],
                      ['partial','سداد جزئي 🔶'],
                      ['unpaid','لم يسدد بعد ❌'],
                    ] as const).map(([v, l]) => (
                      <button key={v}
                        onClick={() => setRenewForm(p => ({...p, paymentStatus: v, paidAmount: 0}))}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-bold text-center transition-all ${renewForm.paymentStatus===v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {renewForm.paymentStatus === 'partial' && (
                    <div>
                      <input className="form-input" type="number" min="0"
                        placeholder={`المبلغ المدفوع (من ${renewTotal} ${RIYAL})`}
                        value={renewForm.paidAmount || ''}
                        onChange={e => setRenewForm(p => ({...p, paidAmount: parseFloat(e.target.value)||0}))}/>
                      {renewForm.paidAmount > 0 && renewTotal > renewForm.paidAmount && (
                        <div className="text-xs text-red-600 mt-1">
                          متبقي كمديونية: {Math.max(0, renewTotal - renewForm.paidAmount).toFixed(2)} {RIYAL}
                        </div>
                      )}
                    </div>
                  )}
                  {renewForm.paymentStatus === 'unpaid' && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-xl p-2.5 mt-1">
                      ⚠️ سيُسجَّل المبلغ الكامل ({renewTotal} {RIYAL}) كمديونية في ملف اللاعب
                    </div>
                  )}
                </FormField>

                <FormField label="ملاحظات">
                  <input className="form-input" placeholder="اختياري..."
                    value={renewForm.notes}
                    onChange={e => setRenewForm(p => ({...p, notes: e.target.value}))}/>
                </FormField>

                <div className="flex gap-2 justify-end mt-4">
                  <button className="btn btn-ghost" onClick={() => setShowRenew(null)}>إلغاء</button>
                  <button className="btn btn-primary" onClick={doRenew} disabled={saving}>
                    {saving ? <Spinner size="sm"/> : <><RefreshCw size={14}/> تجديد الاشتراك</>}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* ── Account Statement Modal ── */}
      <Modal open={!!showStatement} onClose={() => setShowStatement(null)}
        title={`كشف حساب — ${showStatement?.full_name}`} width="max-w-lg">
        {showStatement && (() => {
          const stSubs = allSubs.filter(s => s.player_id === showStatement.player_id)
          const stTotal = stSubs.reduce((s, sub) => s + Number(sub.final_amount), 0)
          const stPaid = stSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)
          const stDebt = stTotal - stPaid
          return (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <div className="text-xs text-slate-500">إجمالي الاشتراكات</div>
                  <div className="font-extrabold text-slate-700 mt-0.5">{stTotal} {RIYAL}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                  <div className="text-xs text-emerald-600">المسدّد</div>
                  <div className="font-extrabold text-emerald-700 mt-0.5">{stPaid} {RIYAL}</div>
                </div>
                <div className={`${stDebt > 0 ? 'bg-red-50' : 'bg-slate-50'} rounded-xl p-2.5 text-center`}>
                  <div className={`text-xs ${stDebt > 0 ? 'text-red-600' : 'text-slate-500'}`}>المديونية</div>
                  <div className={`font-extrabold mt-0.5 ${stDebt > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                    {stDebt > 0 ? `${stDebt} ${RIYAL}` : '—'}
                  </div>
                </div>
              </div>

              {stSubs.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">لا توجد اشتراكات مسجلة لهذا اللاعب</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="text-right pb-2 font-bold">#</th>
                        <th className="text-right pb-2 font-bold">الفترة</th>
                        <th className="text-right pb-2 font-bold">المبلغ</th>
                        <th className="text-right pb-2 font-bold">المدفوع</th>
                        <th className="text-right pb-2 font-bold">المتبقي</th>
                        <th className="text-right pb-2 font-bold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stSubs.map((s: any, i: number) => {
                        const debt = Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0))
                        const ss = getSubStatus(s)
                        return (
                          <tr key={s.sub_id} className="border-b border-slate-50">
                            <td className="py-2 text-slate-400">{stSubs.length - i}</td>
                            <td className="py-2 text-slate-600">
                              <div className="font-bold">{s.start_date}</div>
                              <div className="text-slate-400">← {s.end_date} ({s.months} شهر)</div>
                            </td>
                            <td className="py-2 font-bold text-slate-700">{s.final_amount} {RIYAL}</td>
                            <td className="py-2 text-emerald-700">{Number(s.paid_amount || 0)} {RIYAL}</td>
                            <td className={`py-2 font-bold ${debt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {debt > 0 ? `${debt} ${RIYAL}` : '—'}
                            </td>
                            <td className="py-2">
                              <span className={`badge text-xs ${BADGE_CLS[ss]}`}>{STATUS_LBL[ss]}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-bold text-xs">
                        <td colSpan={2} className="pt-2 text-slate-600">الإجمالي ({stSubs.length} اشتراك)</td>
                        <td className="pt-2 text-slate-700">{stTotal} {RIYAL}</td>
                        <td className="pt-2 text-emerald-700">{stPaid} {RIYAL}</td>
                        <td className={`pt-2 ${stDebt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {stDebt > 0 ? `${stDebt} ${RIYAL}` : '—'}
                        </td>
                        <td/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )
        })()}
      </Modal>

      {/* ── Image Preview Modal ── */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}>
          <button className="absolute top-4 left-4 text-white bg-white/20 rounded-full p-2 border-none cursor-pointer">
            <X size={20}/>
          </button>
          <img src={previewImg} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}/>
        </div>
      )}
    </div>
  )
}
