import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus, DollarSign, Trash2, Receipt, RefreshCw, Calendar,
  Settings, ChevronDown, ChevronUp, FileText, ImageIcon, X,
  Download, Printer
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  financeService, teamService, teamExpensesService,
  permissionService, subscriptionService, rewardService, notificationService
} from '../../services'
import {
  Spinner, PageHeader, Modal, FormField, ProgressBar,
  EmptyState, Tabs, CheckboxList
} from '../../components/ui'
import { canManageFinance, RIYAL, ROLE_LABELS, EXPENSE_CATEGORIES, hasPermission } from '../../utils/helpers'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10)
}

export default function FinancePage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()

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

  // subs date filter — default last month → today
  const [dateFrom, setDateFrom] = useState(monthAgoStr)
  const [dateTo, setDateTo] = useState(todayStr)

  // expenses date filter
  const [expDateFrom, setExpDateFrom] = useState('')
  const [expDateTo, setExpDateTo] = useState('')

  // statement date filter
  const [stDateFrom, setStDateFrom] = useState('')
  const [stDateTo, setStDateTo] = useState('')

  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set())
  const [showStatement, setShowStatement] = useState<any>(null)
  const [showRenew, setShowRenew] = useState<any>(null)
  const [renewForm, setRenewForm] = useState<{
    months: number; startDate: string
    discountType: 'percent' | 'fixed' | null; discountValue: number
    paymentStatus: 'paid' | 'partial' | 'unpaid'; paidAmount: number
    notes: string
  }>({
    months: 1, startDate: todayStr(),
    discountType: null, discountValue: 0,
    paymentStatus: 'paid', paidAmount: 0, notes: ''
  })

  const [uploadingImg, setUploadingImg] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── rewards state ─────────────────────────────────────────────────────
  const [rewards, setRewards] = useState<any[]>([])
  const [showReward, setShowReward] = useState(false)
  const [rewardForm, setRewardForm] = useState({
    title: '', notes: '', amount: '', user_ids: [] as string[]
  })
  const setRwf = (k: string, v: any) => setRewardForm(p => ({ ...p, [k]: v }))

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
    const [o, p, e, rw] = await Promise.all([
      financeService.getObligations(teamId),
      financeService.getPayments(teamId),
      teamExpensesService.getAll(teamId),
      rewardService.getAll(teamId),
    ])
    setObs(o); setPayments(p); setExpenses(e); setRewards(rw); setLoading(false)
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

  // ── quick filter helpers ──────────────────────────────────────────────
  function setQuickSub(t: 'week' | 'month' | 'year') {
    const to = new Date(); const from = new Date()
    if (t === 'week') from.setDate(from.getDate() - 7)
    else if (t === 'month') from.setMonth(from.getMonth() - 1)
    else from.setFullYear(from.getFullYear() - 1)
    setDateFrom(from.toISOString().slice(0, 10)); setDateTo(to.toISOString().slice(0, 10))
  }
  function setQuickExp(t: 'week' | 'month' | 'year') {
    const to = new Date(); const from = new Date()
    if (t === 'week') from.setDate(from.getDate() - 7)
    else if (t === 'month') from.setMonth(from.getMonth() - 1)
    else from.setFullYear(from.getFullYear() - 1)
    setExpDateFrom(from.toISOString().slice(0, 10)); setExpDateTo(to.toISOString().slice(0, 10))
  }
  function setQuickSt(t: 'week' | 'month' | 'year') {
    const to = new Date(); const from = new Date()
    if (t === 'week') from.setDate(from.getDate() - 7)
    else if (t === 'month') from.setMonth(from.getMonth() - 1)
    else from.setFullYear(from.getFullYear() - 1)
    setStDateFrom(from.toISOString().slice(0, 10)); setStDateTo(to.toISOString().slice(0, 10))
  }

  // ── filtered subs ─────────────────────────────────────────────────────
  const filteredSubs = allSubs.filter(s =>
    (!dateFrom || s.start_date >= dateFrom) &&
    (!dateTo || s.start_date <= dateTo)
  )

  // ── filtered expenses ─────────────────────────────────────────────────
  const filteredExpenses = expenses.filter(e =>
    (!expDateFrom || e.expense_date >= expDateFrom) &&
    (!expDateTo || e.expense_date <= expDateTo)
  )

  // ── statement filtered data ───────────────────────────────────────────
  const stPayments = payments.filter(p =>
    Number(p.paid_amount) > 0 &&
    (!stDateFrom || (p.paid_at || '').slice(0, 10) >= stDateFrom) &&
    (!stDateTo   || (p.paid_at || '').slice(0, 10) <= stDateTo)
  )
  const stSubs = allSubs.filter(s =>
    Number(s.paid_amount) > 0 &&
    (!stDateFrom || s.start_date >= stDateFrom) &&
    (!stDateTo   || s.start_date <= stDateTo)
  )
  const stExpenses = expenses.filter(e =>
    (!stDateFrom || e.expense_date >= stDateFrom) &&
    (!stDateTo   || e.expense_date <= stDateTo)
  )
  const stRewards = rewards.filter(r =>
    (!stDateFrom || (r.created_at || '').slice(0, 10) >= stDateFrom) &&
    (!stDateTo   || (r.created_at || '').slice(0, 10) <= stDateTo)
  )
  const stTotalCredit = stPayments.reduce((s, p) => s + Number(p.paid_amount), 0)
                      + stSubs.reduce((s, sub) => s + Number(sub.paid_amount), 0)
  const stTotalDebit  = stExpenses.reduce((s, e) => s + Number(e.amount), 0)
                      + stRewards.reduce((s, r) => s + Number(r.amount), 0)
  const stBalance     = stTotalCredit - stTotalDebit

  // group filtered subs by player
  const playerSubsMap: Record<string, any[]> = {}
  filteredSubs.forEach(s => {
    if (!playerSubsMap[s.player_id]) playerSubsMap[s.player_id] = []
    playerSubsMap[s.player_id].push(s)
  })

  // ── only players in subscriptions list ───────────────────────────────
  const allPlayerRows = members
    .filter(m => m.role === 'player')
    .map(m => {
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

  const totalSubPaid = filteredSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)
  const totalSubRemaining = filteredSubs.reduce(
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
  function getPaidAt(obId: string, userId: string): string {
    const p = payments.find(p => p.obligation_id === obId && p.user_id === userId)
    return p?.paid_at ? new Date(p.paid_at).toLocaleString('ar-SA') : '—'
  }
  function toggleExpand(pid: string) {
    setExpandedPlayers(prev => {
      const next = new Set(prev); if (next.has(pid)) next.delete(pid); else next.add(pid); return next
    })
  }

  // ── combined financial summary — ALL members ──────────────────────────
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
  })

  // ── export helpers ────────────────────────────────────────────────────
  function downloadCSV(filename: string, rows: string[][]) {
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportStatementCSV(playerName: string, stObs: any[], stSubs: any[]) {
    const rows: string[][] = [
      ['النوع', 'التفاصيل', 'تاريخ الإصدار', 'المبلغ', 'المدفوع', 'تاريخ السداد', 'المتبقي', 'الحالة']
    ]
    stObs.forEach(({ ob, paid, paidAt }) => {
      const rem = Math.max(0, ob.amount - paid)
      rows.push(['التزام', ob.title, ob.due_date || '—', ob.amount, paid, paidAt, rem, paid >= ob.amount ? 'مسدد' : paid > 0 ? 'جزئي' : 'غير مسدد'])
    })
    stSubs.forEach(s => {
      const rem = Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0))
      rows.push(['اشتراك', `${s.start_date} ← ${s.end_date} (${s.months} شهر)`, s.start_date, s.final_amount, s.paid_amount || 0, '—', rem, s.payment_status || '—'])
    })
    downloadCSV(`كشف-حساب-${playerName}.csv`, rows)
  }

  function printStatement(playerName: string, stObs: any[], stSubs: any[], summary: any) {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    const obRows = stObs.map(({ ob, paid, paidAt }) => {
      const rem = Math.max(0, ob.amount - paid)
      return `<tr><td>${ob.title}</td><td>${ob.due_date || '—'}</td><td>${ob.amount}</td><td>${paid}</td><td>${paidAt}</td><td style="color:${rem > 0 ? '#dc2626' : '#16a34a'}">${rem > 0 ? rem : '—'}</td><td>${paid >= ob.amount ? '✅ مسدد' : paid > 0 ? '🔶 جزئي' : '❌ غير مسدد'}</td></tr>`
    }).join('')
    const subRows = stSubs.map(s => {
      const rem = Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0))
      return `<tr><td>${s.start_date} ← ${s.end_date}</td><td>${s.months} شهر</td><td>${s.final_amount}</td><td>${s.paid_amount || 0}</td><td style="color:${rem > 0 ? '#dc2626' : '#16a34a'}">${rem > 0 ? rem : '—'}</td><td>${{ paid: '✅ مسدد', partial: '🔶 جزئي', unpaid: '❌ لم يسدد' }[s.payment_status as string] || '—'}</td></tr>`
    }).join('')
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>كشف حساب - ${playerName}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;direction:rtl}h2{color:#1D9E75;margin-bottom:4px}p{color:#666;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th,td{border:1px solid #ddd;padding:7px 10px;text-align:right}
    th{background:#f3f4f6;font-weight:bold}.summary{display:flex;gap:12px;margin:16px 0}.sc{flex:1;border:1px solid #ddd;padding:12px;border-radius:8px;text-align:center}
    .sc .val{font-size:20px;font-weight:bold}.sc .lbl{font-size:11px;color:#666;margin-top:4px}h3{margin:20px 0 6px;color:#374151}
    @media print{button{display:none!important}}</style></head><body>
    <h2>كشف حساب — ${playerName}</h2>
    <p>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}</p>
    <div class="summary">
      <div class="sc"><div class="val">${summary.total}</div><div class="lbl">إجمالي المبالغ المصدرة</div></div>
      <div class="sc"><div class="val" style="color:#16a34a">${summary.paid}</div><div class="lbl">إجمالي المدفوع</div></div>
      <div class="sc"><div class="val" style="color:${summary.remaining > 0 ? '#dc2626' : '#16a34a'}">${summary.remaining > 0 ? summary.remaining : '0'}</div><div class="lbl">الرصيد المتبقي</div></div>
    </div>
    ${stObs.length > 0 ? `<h3>الالتزامات المالية (${stObs.length})</h3>
    <table><tr><th>الالتزام</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>تاريخ السداد</th><th>المتبقي</th><th>الحالة</th></tr>${obRows}</table>` : ''}
    ${stSubs.length > 0 ? `<h3>سجل الاشتراكات (${stSubs.length})</h3>
    <table><tr><th>الفترة</th><th>المدة</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr>${subRows}</table>` : ''}
    <br><button onclick="window.print()" style="padding:10px 20px;background:#1D9E75;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨 طباعة</button>
    </body></html>`)
    w.document.close()
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
    if (error) { setOpError('فشل إضافة الالتزام: ' + (error.message || 'خطأ')); setSaving(false); return }
    await load(); setShowAdd(false)
    setForm({ title: '', amount: '', due_date: '', target_type: 'all', target_role: 'player', target_user_ids: [] })
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
      expense_date: expForm.expense_date || todayStr(),
      notes: expForm.notes || null, created_by: user.id,
      receipt_images: expForm.receipt_images.length > 0 ? expForm.receipt_images : null,
    })
    if (error) { setOpError('فشل إضافة المصروف: ' + (error.message || 'خطأ')); setSaving(false); return }
    await load(); setShowExpense(false)
    setExpForm({ title: '', amount: '', category: 'أخرى', expense_date: '', notes: '', receipt_images: [] })
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return
    await teamExpensesService.delete(id); await load()
  }

  async function addReward() {
    if (!rewardForm.title || !rewardForm.amount || rewardForm.user_ids.length === 0 || !teamId || !user) return
    setSaving(true); setOpError('')
    const amount = parseFloat(rewardForm.amount)
    const inserts = rewardForm.user_ids.map(uid => ({
      team_id: teamId, user_id: uid, title: rewardForm.title,
      notes: rewardForm.notes || null, amount, created_by: user.id,
    }))
    for (const rec of inserts) {
      const { error } = await rewardService.create(rec)
      if (error) { setOpError('فشل إضافة المكافأة: ' + (error.message || 'خطأ')); setSaving(false); return }
    }
    // Send in-app notification to each rewarded member
    await notificationService.create(
      rewardForm.user_ids.map(uid => ({
        user_id: uid,
        team_id: teamId,
        title: '🎁 مكافأة مالية',
        body: `تم منحك مكافأة "${rewardForm.title}" بمبلغ ${amount.toLocaleString()} ${RIYAL}`,
        type: 'reward',
        is_read: false,
        sender_name: profile?.full_name || null,
        team_logo: team?.logo_url || null,
      }))
    )
    await load()
    setShowReward(false)
    setRewardForm({ title: '', notes: '', amount: '', user_ids: [] })
    setSaving(false)
  }

  async function deleteReward(id: string) {
    if (!confirm('هل تريد حذف هذه المكافأة؟')) return
    await rewardService.delete(id); await load()
  }

  async function handleReceiptUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingImg(true)
    const newUrls: string[] = []
    for (const file of Array.from(files)) {
      if (expForm.receipt_images.length + newUrls.length >= 5) break
      try { const url = await teamExpensesService.uploadReceiptImage(file); newUrls.push(url) } catch {}
    }
    setExpForm(p => ({ ...p, receipt_images: [...p.receipt_images, ...newUrls] }))
    setUploadingImg(false)
  }

  async function doRenew() {
    if (!showRenew || !teamId || !user || !team?.subscription_fee) return
    setSaving(true); setOpError('')
    const { error } = await subscriptionService.renewSubscription(teamId, showRenew.player_id, {
      months: renewForm.months, startDate: renewForm.startDate,
      originalAmount: parseFloat(team.subscription_fee),
      discountType: renewForm.discountType, discountValue: renewForm.discountValue,
      paymentStatus: renewForm.paymentStatus,
      paidAmount: renewForm.paymentStatus === 'partial' ? renewForm.paidAmount : null,
      notes: renewForm.notes, renewedBy: user.id,
    })
    if (error) { setOpError('فشل تجديد الاشتراك: ' + (error.message || 'خطأ')); setSaving(false); return }
    await loadSubs(); setShowRenew(null)
    setRenewForm({ months: 1, startDate: todayStr(), discountType: null, discountValue: 0, paymentStatus: 'paid', paidAmount: 0, notes: '' })
    setSaving(false)
  }

  // ── permissions ───────────────────────────────────────────────────────
  const isAdmin = canManageFinance(myRole)
  const canManageExpenses = isAdmin || hasPermission(myPerms, myRole, 'manage_team_expenses' as any)
  const canViewExpenses   = canManageExpenses || hasPermission(myPerms, myRole, 'view_team_expenses' as any)
  const isPlayer = !isAdmin && myRole !== ''
  const myMember = members.find((m: any) => m.user_id === user?.id)
  const isParent = myMember?.role === 'parent'
  const linkedPlayerId: string | null = isParent ? (myMember?.linked_player_id || null) : null

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

  const DOT_COLOR: Record<string, string> = { none: 'bg-slate-300', expired: 'bg-red-500', warning: 'bg-amber-400', active: 'bg-emerald-500' }
  const BADGE_CLS: Record<string, string> = { none: 'bg-slate-100 text-slate-500', expired: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', active: 'bg-emerald-100 text-emerald-700' }
  const PAY_CLS: Record<string, string> = { paid: 'bg-emerald-100 text-emerald-700', partial: 'bg-amber-100 text-amber-700', unpaid: 'bg-red-100 text-red-700' }
  const PAY_LBL: Record<string, string> = { paid: 'مسدد', partial: 'جزئي', unpaid: 'لم يسدد' }
  const STATUS_LBL: Record<string, string> = { none: 'لا اشتراك', expired: 'منتهٍ', warning: 'ينتهي قريباً', active: 'نشط' }

  function subBadgeText(s: any, status: string) {
    if (status === 'none') return 'لا اشتراك'
    if (status === 'expired') return `انتهى منذ ${Math.abs(s.days_left)} يوم`
    if (status === 'warning') return `ينتهي بعد ${s.days_left} يوم`
    return `${s.days_left} يوم متبقي`
  }

  // ── QUICK FILTER BUTTONS component ───────────────────────────────────
  const QuickBtns = ({ onSet }: { onSet: (t: 'week' | 'month' | 'year') => void }) => (
    <div className="flex gap-1.5 mt-2">
      {([['week', 'آخر أسبوع'], ['month', 'آخر شهر'], ['year', 'آخر سنة']] as const).map(([t, l]) => (
        <button key={t} onClick={() => onSet(t)}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-brand-100 hover:text-brand-700 text-slate-600 font-bold transition-colors border-none cursor-pointer">
          {l}
        </button>
      ))}
    </div>
  )

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
              <button className="btn btn-primary btn-sm" onClick={() => setShowExpense(true)}><Plus size={14}/>مصروف</button>
            )}
            {isAdmin && tab === 'obligations' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14}/>التزام جديد</button>
            )}
            {isAdmin && tab === 'rewards' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowReward(true)}><Plus size={14}/>مكافأة</button>
            )}
          </div>
        }/>

      <Tabs
        tabs={[
          { key: 'obligations', label: '﷼ الالتزامات' },
          { key: 'subscriptions', label: isPlayer ? '📅 اشتراكاتي' : '📅 الاشتراكات' },
          ...(canViewExpenses ? [{ key: 'expenses', label: '🧾 مصاريف الفريق' }] : []),
          ...(canViewExpenses ? [{ key: 'statement', label: '📊 كشف الحساب' }] : []),
          ...(isAdmin ? [{ key: 'rewards', label: '🎁 المكافآت' }] : []),
        ]}
        active={tab} onChange={setTab}/>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* OBLIGATIONS TAB                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 'obligations' && (
        <>
          {/* Hero card — Admin */}
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
                    <div className="text-white/70 text-xs">المطلوب</div>
                  </div>
                  <div className="bg-white/15 rounded-2xl p-3 text-center">
                    <div className="text-emerald-200 text-base font-extrabold leading-none mb-1">{totalPaidObl.toLocaleString()}</div>
                    <div className="text-white/70 text-xs">المحصّل</div>
                  </div>
                  <div className="bg-white/15 rounded-2xl p-3 text-center">
                    <div className="text-red-300 text-base font-extrabold leading-none mb-1">{(totalReq - totalPaidObl).toLocaleString()}</div>
                    <div className="text-white/70 text-xs">المتبقي</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Player summary card */}
          {isPlayer && (() => {
            const mySubDebt = allSubs.filter(s => s.player_id === user?.id)
              .reduce((t, s) => t + Math.max(0, Number(s.final_amount) - Number(s.paid_amount || 0)), 0)
            const myObDebt = myObs.reduce((t: number, o: any) => t + Math.max(0, o.amount - o.myPaid), 0)
            const grandTotal = mySubDebt + myObDebt
            return grandTotal > 0 ? (
              <div className="card bg-orange-50 border-orange-200 mb-4">
                <div className="font-extrabold text-slate-800 text-sm mb-3">📊 ملخصك المالي</div>
                {myObDebt > 0 && <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">الالتزامات غير المسددة</span><span className="font-bold text-red-600">{myObDebt} {RIYAL}</span></div>}
                {mySubDebt > 0 && <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">مديونية الاشتراكات</span><span className="font-bold text-red-600">{mySubDebt} {RIYAL}</span></div>}
                <div className="border-t border-orange-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-slate-700">إجمالي ما عليك</span>
                  <span className="font-extrabold text-red-700 text-xl">{grandTotal} {RIYAL}</span>
                </div>
              </div>
            ) : null
          })()}

          {/* Player obligations list */}
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

          {/* ── Admin: Combined financial summary for ALL members ── */}
          {isAdmin && (
            <div className="card mb-4 border-slate-200">
              <div className="font-extrabold text-slate-800 text-sm mb-3">📊 الوضع المالي للأعضاء</div>
              <div className="space-y-1">
                {memberFinanceSummary.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2.5 py-2 border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                      {m.profile?.avatar_url
                        ? <img src={m.profile.avatar_url} className="w-full h-full object-cover rounded-xl"/>
                        : m.profile?.full_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-800 truncate">{m.profile?.full_name}</div>
                      <div className="text-xs text-slate-400">{ROLE_LABELS[m.role] || m.role}</div>
                    </div>
                    <div className={`font-extrabold text-base flex-shrink-0 ${m.totalDebt > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                      {m.totalDebt > 0 ? `${m.totalDebt} ${RIYAL}` : '0'}
                    </div>
                    <button
                      onClick={() => setShowStatement({ player_id: m.user_id, full_name: m.profile?.full_name })}
                      className="btn btn-sm btn-ghost px-2 text-slate-400 hover:text-brand-600 flex-shrink-0" title="كشف حساب">
                      <FileText size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin: Per-obligation details */}
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
                          <span>👥 {ob.target_type === 'all' ? 'الكل' : ob.target_type === 'role' ? ROLE_LABELS[ob.target_role] || ob.target_role : `${targets.length} أشخاص`} · {targets.length} شخص</span>
                          {ob.due_date && <span className="text-amber-600 font-bold">الاستحقاق: {ob.due_date}</span>}
                        </div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-500 font-bold">التحصيل</span>
                          <span className="font-extrabold text-slate-700">{paidOb.toFixed(0)}/{totalOb} {RIYAL}
                            <span className={`mr-1.5 ${pct >= 100 ? 'text-emerald-600' : pct > 50 ? 'text-amber-600' : 'text-red-500'}`}>({pct}%)</span>
                          </span>
                        </div>
                        <ProgressBar value={pct} color={pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-400' : 'bg-red-400'}/>
                        <div className="mt-3 space-y-1.5">
                          {targets.map((m: any) => {
                            const paid = getPaid(ob.id, m.user_id)
                            const remaining = Math.max(0, ob.amount - paid)
                            return (
                              <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                                <div className="w-7 h-7 bg-brand-100 text-brand-700 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                                  {m.profile?.full_name?.[0]}
                                </div>
                                <span className="font-bold text-sm text-slate-700 flex-1 truncate">{m.profile?.full_name}</span>
                                <span className={`font-extrabold text-sm flex-shrink-0 ${remaining === 0 ? 'text-slate-300' : 'text-red-600'}`}>
                                  {remaining === 0 ? '0' : `${remaining} ${RIYAL}`}
                                </span>
                                <button onClick={() => setShowPay({ ob, userId: m.user_id, name: m.profile?.full_name })}
                                  className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold px-2.5 py-1.5 rounded-xl transition-colors border-none cursor-pointer flex-shrink-0">
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SUBSCRIPTIONS TAB                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 'subscriptions' && (
        <div>
          {!team?.subscriptions_enabled ? (
            <div className="card border-amber-200 bg-amber-50 text-center py-10">
              <Calendar size={40} className="text-amber-400 mx-auto mb-3"/>
              <div className="font-bold text-slate-700 mb-1">نظام الاشتراكات غير مفعّل</div>
              <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">فعّل نظام الاشتراكات من إعدادات الفريق</p>
              {isAdmin && <a href={`/team/${teamId}/settings`} className="btn btn-sm btn-ghost gap-1"><Settings size={13}/> إعدادات الفريق</a>}
            </div>
          ) : (
            <>
              {isAdmin && !team?.subscription_fee && (
                <div className="card border-amber-200 bg-amber-50 mb-4 text-sm text-amber-700 flex items-center gap-2">
                  ⚠️ <span>لم تحدد قيمة الاشتراك الشهري.</span>
                  <a href={`/team/${teamId}/settings`} className="underline font-bold">حددها من الإعدادات</a>
                </div>
              )}

              {/* ── Admin view ── */}
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
                      <button className="btn btn-sm btn-ghost text-slate-400" onClick={() => { setDateFrom(monthAgoStr()); setDateTo(todayStr()) }}>
                        إعادة تعيين
                      </button>
                    </div>
                    <QuickBtns onSet={setQuickSub}/>
                    <div className="text-xs text-slate-400 mt-2">{filteredSubs.length} سجل اشتراك في الفترة المحددة</div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="card text-center py-3 mb-0"><div className="text-xl font-extrabold text-emerald-600">{subCounts.active}</div><div className="text-xs text-slate-400 mt-0.5">🟢 نشط</div></div>
                    <div className="card text-center py-3 mb-0"><div className="text-xl font-extrabold text-amber-500">{subCounts.warning}</div><div className="text-xs text-slate-400 mt-0.5">🟡 ينتهي قريباً</div></div>
                    <div className="card text-center py-3 mb-0"><div className="text-xl font-extrabold text-red-500">{subCounts.expired}</div><div className="text-xs text-slate-400 mt-0.5">🔴 منتهٍ / لا اشتراك</div></div>
                  </div>

                  {/* Totals row */}
                  <div className="flex items-stretch gap-2 mb-4">
                    <div className="flex-1 rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                      <div className="text-xs text-emerald-600 font-bold mb-1">💰 إجمالي الالتزامات للفريق</div>
                      <div className="text-lg font-extrabold text-emerald-700">{totalSubPaid.toLocaleString()} {RIYAL}</div>
                    </div>
                    <div className="flex-1 rounded-2xl bg-red-50 border border-red-100 p-3">
                      <div className="text-xs text-red-600 font-bold mb-1">📊 المبلغ المتبقي (لم يُسدَّد)</div>
                      <div className="text-lg font-extrabold text-red-600">{totalSubRemaining.toLocaleString()} {RIYAL}</div>
                    </div>
                  </div>

                  {/* Player list (players only) */}
                  {subsLoading
                    ? <div className="flex justify-center py-10"><Spinner/></div>
                    : allPlayerRows.length === 0
                      ? <div className="card"><EmptyState icon={<Calendar size={24}/>} title="لا يوجد لاعبون نشطون"/></div>
                      : <div className="space-y-2">
                          {allPlayerRows.map(p => {
                            const status = getSubStatus(p.latestSub)
                            const isExpanded = expandedPlayers.has(p.player_id)
                            const playerTotalPaid = p.subs.reduce((s: number, sub: any) => s + Number(sub.paid_amount || 0), 0)
                            const playerDebt = p.subs.reduce((s: number, sub: any) => s + Math.max(0, Number(sub.final_amount) - Number(sub.paid_amount || 0)), 0)
                            return (
                              <div key={p.player_id} className="card mb-0">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[status]}`}/>
                                  <div className="w-9 h-9 bg-brand-100 rounded-xl flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0 overflow-hidden">
                                    {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover"/> : p.full_name?.[0]}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-800">{p.full_name}</div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 flex-wrap">
                                      {p.latestSub && <span>حتى: {p.latestSub.end_date}</span>}
                                      {p.subs.length > 0 && <span className="text-brand-500 font-bold">· {p.subs.length} تجديد</span>}
                                      {playerDebt > 0 && <span className="text-red-500 font-bold">· مديونية: {playerDebt} {RIYAL}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className={`badge text-xs ${BADGE_CLS[status]}`}>
                                      {p.latestSub ? subBadgeText(p.latestSub, status) : 'لا اشتراك'}
                                    </span>
                                    {p.subs.length > 0 && (
                                      <button onClick={() => toggleExpand(p.player_id)} className="btn btn-sm btn-ghost px-2">
                                        {isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                      </button>
                                    )}
                                    <button onClick={() => setShowStatement(p)} className="btn btn-sm btn-ghost px-2 text-slate-500" title="كشف حساب">
                                      <FileText size={13}/>
                                    </button>
                                    <button onClick={() => { setShowRenew(p); setRenewForm({ months: 1, startDate: todayStr(), discountType: null, discountValue: 0, paymentStatus: 'paid', paidAmount: 0, notes: '' }) }}
                                      className="btn btn-sm btn-ghost gap-1">
                                      <RefreshCw size={13}/> تجديد
                                    </button>
                                  </div>
                                </div>

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
                                                <td className="py-1.5"><span className={`badge text-xs ${PAY_CLS[s.payment_status || 'paid']}`}>{PAY_LBL[s.payment_status || 'paid']}</span></td>
                                                <td className="py-1.5"><span className={`badge text-xs ${BADGE_CLS[ss]}`}>{STATUS_LBL[ss]}</span></td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t-2 border-slate-200 font-bold text-xs">
                                            <td colSpan={3} className="pt-2 text-slate-500">الإجمالي ({p.subs.length})</td>
                                            <td className="pt-2 text-slate-700">{p.subs.reduce((s: number, x: any) => s + Number(x.final_amount), 0)} {RIYAL}</td>
                                            <td className="pt-2 text-emerald-700">{playerTotalPaid.toLocaleString()} {RIYAL}</td>
                                            <td colSpan={2} className={`pt-2 ${playerDebt > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                              {playerDebt > 0 ? `متبقي: ${playerDebt} ${RIYAL}` : 'مسدد ✅'}
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

              {/* ── Player / Parent view ── */}
              {isPlayer && (
                <div>
                  {(() => {
                    // Parent: show linked child's subscriptions; Player: show own
                    const viewPlayerId = isParent ? linkedPlayerId : (user?.id || null)
                    const playerName = isParent
                      ? (members.find((m: any) => m.user_id === linkedPlayerId)?.profile?.full_name || 'الابن')
                      : null
                    const myAllSubs = viewPlayerId
                      ? allSubs.filter(s => s.player_id === viewPlayerId)
                      : []
                    const latestSub = myAllSubs[0] || null
                    const status = getSubStatus(latestSub)
                    const myTotalPaid = myAllSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)
                    const myDebt = myAllSubs.reduce((s, sub) => s + Math.max(0, Number(sub.final_amount) - Number(sub.paid_amount || 0)), 0)

                    if (isParent && !linkedPlayerId) return (
                      <div className="card text-center py-10">
                        <Calendar size={40} className="text-slate-300 mx-auto mb-3"/>
                        <div className="font-bold text-slate-600 mb-1">لم يتم ربطك بلاعب بعد</div>
                        <p className="text-xs text-slate-400">تواصل مع مسؤول الفريق لربط حسابك بحساب ابنك</p>
                      </div>
                    )

                    if (myAllSubs.length === 0) return (
                      <div className="card text-center py-10">
                        <Calendar size={40} className="text-slate-300 mx-auto mb-3"/>
                        <div className="font-bold text-slate-600 mb-1">
                          {isParent ? `لا يوجد اشتراك نشط لـ ${playerName}` : 'لا يوجد اشتراك نشط'}
                        </div>
                        <p className="text-xs text-slate-400">تواصل مع مسؤول الفريق لتفعيل الاشتراك</p>
                      </div>
                    )

                    const borderCl = { none: '', expired: 'border-r-4 border-red-400', warning: 'border-r-4 border-amber-400', active: 'border-r-4 border-emerald-400' }[status]
                    return (
                      <div>
                        <div className="font-extrabold text-slate-700 text-base mb-3">
                          {isParent ? `اشتراكات ${playerName}` : 'اشتراكاتي'}
                        </div>
                        {latestSub && (
                          <div className={`card ${borderCl} mb-4`}>
                            <div className="font-extrabold text-slate-800 mb-3">الاشتراك الحالي</div>
                            <div className="flex justify-between text-sm text-slate-500 mb-2"><span>من: {latestSub.start_date}</span><span>حتى: {latestSub.end_date}</span></div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-extrabold text-brand-700 text-lg">{latestSub.final_amount} {RIYAL}</span>
                              <span className={`badge ${BADGE_CLS[status]}`}>{subBadgeText(latestSub, status)}</span>
                            </div>
                            {latestSub.payment_status !== 'paid' && (
                              <div className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-2 mt-2">
                                ⚠️ مديونية: {Math.max(0, Number(latestSub.final_amount) - Number(latestSub.paid_amount || 0))} {RIYAL} غير مسددة
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-2xl bg-emerald-50 p-3"><div className="text-xs text-emerald-600 font-bold">إجمالي المدفوع</div><div className="font-extrabold text-emerald-700 mt-0.5">{myTotalPaid.toLocaleString()} {RIYAL}</div></div>
                          {myDebt > 0 && <div className="rounded-2xl bg-red-50 p-3"><div className="text-xs text-red-600 font-bold">إجمالي المديونية</div><div className="font-extrabold text-red-700 mt-0.5">{myDebt.toLocaleString()} {RIYAL}</div></div>}
                        </div>
                        {myAllSubs.length > 1 && (
                          <div className="card">
                            <div className="font-bold text-sm mb-3">سجل الاشتراكات ({myAllSubs.length})</div>
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* EXPENSES TAB                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 'expenses' && canViewExpenses && (
        loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
          <div>
            {/* Date filter */}
            <div className="card mb-4 p-3">
              <div className="text-xs font-bold text-slate-500 mb-2">فلترة حسب تاريخ المصروف</div>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-0">
                  <label className="text-xs text-slate-400 block mb-1">من</label>
                  <input type="date" className="form-input text-sm" value={expDateFrom} onChange={e => setExpDateFrom(e.target.value)}/>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-xs text-slate-400 block mb-1">إلى</label>
                  <input type="date" className="form-input text-sm" value={expDateTo} onChange={e => setExpDateTo(e.target.value)}/>
                </div>
                {(expDateFrom || expDateTo) && (
                  <button className="btn btn-sm btn-ghost text-red-500" onClick={() => { setExpDateFrom(''); setExpDateTo('') }}>
                    مسح
                  </button>
                )}
              </div>
              <QuickBtns onSet={setQuickExp}/>
              {(expDateFrom || expDateTo) && <div className="text-xs text-slate-400 mt-2">{filteredExpenses.length} مصروف في الفترة المحددة</div>}
            </div>

            <div className="hero-card mb-5">
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-10 bg-white -translate-x-16 -translate-y-12"/>
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Receipt size={22} className="text-white"/>
                </div>
                <div>
                  <div className="text-white/70 text-xs font-bold mb-0.5">إجمالي مصاريف الفريق</div>
                  <div className="text-white text-2xl font-extrabold">
                    {filteredExpenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()} {RIYAL}
                  </div>
                  <div className="text-white/60 text-xs mt-1">{filteredExpenses.length} بند مصروف</div>
                </div>
              </div>
            </div>

            {filteredExpenses.length === 0
              ? <div className="card"><EmptyState icon={<Receipt size={24}/>} title="لا توجد مصاريف" description="أضف أول مصروف للفريق"/></div>
              : <div className="space-y-2.5">
                  {filteredExpenses.map((exp: any) => {
                    const imgs: string[] = exp.receipt_images || []
                    return (
                      <div key={exp.id} className="card mb-0 flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg">
                          {({ 'معدات وكور': '⚽', 'ملابس وزي': '👕', 'مياه وتغذية': '💧', 'مواصلات': '🚌', 'سكن وفندق': '🏨', 'طيران': '✈️', 'أكل ووجبات': '🍽️', 'رسوم وتسجيل': '📋', 'رواتب': '💼', 'إيجار': '🏢', 'فاتورة ماء': '🚿', 'فاتورة كهرباء': '⚡', 'فاتورة اتصالات': '📱', 'فاتورة انترنت': '🌐' } as any)[exp.category] || '📦'}
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
                                  <img src={url} className="w-full h-full object-cover" alt={`فاتورة ${i + 1}`}/>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-extrabold text-brand-700">{Number(exp.amount).toLocaleString()} {RIYAL}</div>
                          {canManageExpenses && (
                            <button onClick={() => deleteExpense(exp.id)} className="text-red-400 hover:text-red-600 mt-1 p-0.5 border-none bg-transparent cursor-pointer">
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STATEMENT TAB                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 'statement' && canViewExpenses && (
        <div>
          {/* Date filter */}
          <div className="card mb-4 p-3">
            <div className="text-xs font-bold text-slate-500 mb-2">فلترة حسب التاريخ</div>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-slate-400 block mb-1">من</label>
                <input type="date" className="form-input text-sm" value={stDateFrom} onChange={e => setStDateFrom(e.target.value)}/>
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-xs text-slate-400 block mb-1">إلى</label>
                <input type="date" className="form-input text-sm" value={stDateTo} onChange={e => setStDateTo(e.target.value)}/>
              </div>
              {(stDateFrom || stDateTo) && (
                <button className="btn btn-sm btn-ghost text-red-500" onClick={() => { setStDateFrom(''); setStDateTo('') }}>مسح</button>
              )}
            </div>
            <QuickBtns onSet={setQuickSt}/>
          </div>

          {/* Summary hero cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className={`rounded-2xl p-3 text-center ${stBalance >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`text-xs font-bold mb-1 ${stBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>الرصيد</div>
              <div className={`text-lg font-extrabold ${stBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {stBalance >= 0 ? '+' : ''}{stBalance.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{RIYAL}</div>
            </div>
            <div className="rounded-2xl p-3 text-center bg-blue-50 border border-blue-200">
              <div className="text-xs font-bold text-blue-600 mb-1">دائن (وارد)</div>
              <div className="text-lg font-extrabold text-blue-700">{stTotalCredit.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">{RIYAL}</div>
            </div>
            <div className="rounded-2xl p-3 text-center bg-orange-50 border border-orange-200">
              <div className="text-xs font-bold text-orange-600 mb-1">مدين (صادر)</div>
              <div className="text-lg font-extrabold text-orange-700">{stTotalDebit.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">{RIYAL}</div>
            </div>
          </div>

          {/* Transaction list */}
          {(() => {
            type TxEntry = { date: string; label: string; sub: string; amount: number; type: 'credit' | 'debit' }
            const entries: TxEntry[] = []

            stPayments.forEach(p => {
              const member = members.find(m => m.user_id === p.user_id)
              const ob = obs.find(o => o.id === p.obligation_id)
              entries.push({
                date: (p.paid_at || '').slice(0, 10),
                label: member?.profile?.full_name || 'عضو',
                sub: ob?.title || 'التزام',
                amount: Number(p.paid_amount),
                type: 'credit'
              })
            })

            stSubs.forEach(s => {
              const member = members.find(m => m.user_id === s.player_id)
              entries.push({
                date: s.start_date,
                label: member?.profile?.full_name || 'لاعب',
                sub: `اشتراك ${s.months} شهر`,
                amount: Number(s.paid_amount),
                type: 'credit'
              })
            })

            stExpenses.forEach(e => {
              entries.push({
                date: e.expense_date,
                label: e.title,
                sub: e.category,
                amount: Number(e.amount),
                type: 'debit'
              })
            })

            stRewards.forEach(r => {
              entries.push({
                date: (r.created_at || '').slice(0, 10),
                label: r.profile?.full_name || 'عضو',
                sub: `🎁 مكافأة — ${r.title}`,
                amount: Number(r.amount),
                type: 'debit'
              })
            })

            entries.sort((a, b) => b.date.localeCompare(a.date))

            if (entries.length === 0) return (
              <div className="card"><EmptyState icon={<Receipt size={24}/>} title="لا توجد حركات مالية" description="لا توجد بيانات في الفترة المحددة"/></div>
            )

            return (
              <div className="space-y-2">
                {entries.map((e, i) => (
                  <div key={i} className="card mb-0 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 text-base font-bold ${e.type === 'credit' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {e.type === 'credit' ? '↓' : '↑'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-800 truncate">{e.label}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <span className={`badge text-xs ${e.type === 'credit' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                          {e.type === 'credit' ? 'دائن' : 'مدين'}
                        </span>
                        <span>{e.sub}</span>
                        <span>· {e.date}</span>
                      </div>
                    </div>
                    <div className={`font-extrabold text-base flex-shrink-0 ${e.type === 'credit' ? 'text-blue-700' : 'text-orange-700'}`}>
                      {e.type === 'credit' ? '+' : '-'}{e.amount.toLocaleString()} {RIYAL}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* REWARDS TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === 'rewards' && isAdmin && (
        <div>
          {/* Summary hero */}
          {rewards.length > 0 && (
            <div className="hero-card mb-5">
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center text-xl">🎁</div>
                  <div>
                    <div className="text-white/70 text-xs font-bold">إجمالي المكافآت</div>
                    <div className="text-white text-2xl font-extrabold leading-none">
                      {rewards.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()} {RIYAL}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="bg-white/15 rounded-2xl p-3 text-center">
                    <div className="text-white text-lg font-extrabold">{rewards.length}</div>
                    <div className="text-white/70 text-xs mt-0.5">عدد المكافآت</div>
                  </div>
                  <div className="bg-white/15 rounded-2xl p-3 text-center">
                    <div className="text-white text-lg font-extrabold">
                      {new Set(rewards.map(r => r.user_id)).size}
                    </div>
                    <div className="text-white/70 text-xs mt-0.5">عضو مكافأ</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rewards list */}
          {rewards.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-3">🎁</div>
              <div className="font-bold text-slate-600 text-sm">لا توجد مكافآت بعد</div>
              <div className="text-xs text-slate-400 mt-1">اضغط "مكافأة" أعلى الصفحة لإضافة أولى المكافآت</div>
            </div>
          ) : (
            <div className="space-y-2">
              {rewards.map(r => (
                <div key={r.id} className="card mb-0 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-xl">🎁</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-800 truncate">{r.title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {r.profile?.full_name || '—'}
                      {r.notes && <span className="text-slate-400"> · {r.notes}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{(r.created_at || '').slice(0, 10)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-base font-extrabold text-emerald-600">+{Number(r.amount).toLocaleString()}</div>
                      <div className="text-xs text-slate-400">{RIYAL}</div>
                    </div>
                    <button onClick={() => deleteReward(r.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors border-none cursor-pointer">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* Add Obligation */}
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
            {[['all', 'الكل'], ['role', 'فئة'], ['specific', 'أشخاص محددون']].map(([v, l]) => (
              <button key={v} onClick={() => set('target_type', v)}
                className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${form.target_type === v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {form.target_type === 'role' && (
            <select className="form-input" value={form.target_role} onChange={e => set('target_role', e.target.value)}>
              {['player', 'head_coach', 'assistant_coach', 'administrator'].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          )}
          {form.target_type === 'specific' && <CheckboxList items={memberItems} selected={form.target_user_ids} onChange={v => set('target_user_ids', v)}/>}
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addObligation} disabled={saving}>{saving ? <Spinner size="sm"/> : 'إضافة'}</button>
        </div>
      </Modal>

      {/* Add Expense */}
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
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${expForm.category === c ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>{c}</button>
            ))}
          </div>
        </FormField>
        <FormField label="ملاحظات">
          <input className="form-input" value={expForm.notes} onChange={e => setExp('notes', e.target.value)} placeholder="تفاصيل إضافية..."/>
        </FormField>
        <FormField label="صور الفواتير (اختياري — حتى 5 صور)">
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleReceiptUpload(e.target.files)}/>
          {expForm.receipt_images.length < 5 && (
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImg} className="btn btn-ghost btn-sm gap-2 mb-2">
              {uploadingImg ? <Spinner size="sm"/> : <ImageIcon size={14}/>}
              {uploadingImg ? 'جارٍ الرفع...' : 'إضافة صورة فاتورة'}
            </button>
          )}
          {expForm.receipt_images.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-1">
              {expForm.receipt_images.map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 flex-shrink-0">
                  <img src={url} className="w-full h-full object-cover"/>
                  <button onClick={() => setExpForm(p => ({ ...p, receipt_images: p.receipt_images.filter((_, j) => j !== i) }))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center border-none cursor-pointer">
                    <X size={10}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowExpense(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addExpense} disabled={saving || uploadingImg}>{saving ? <Spinner size="sm"/> : 'إضافة'}</button>
        </div>
      </Modal>

      {/* Payment */}
      <Modal open={!!showPay} onClose={() => setShowPay(null)} title={`دفعة — ${showPay?.name}`}>
        {showPay && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm">
              <div className="font-bold">{showPay.ob.title}</div>
              <div className="text-slate-500 text-xs mt-1">المطلوب: {showPay.ob.amount} {RIYAL} · المدفوع: {getPaid(showPay.ob.id, showPay.userId)} {RIYAL}</div>
            </div>
            <FormField label={`مبلغ الدفعة (${RIYAL})`}>
              <input className="form-input" type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
                placeholder={String(showPay.ob.amount - getPaid(showPay.ob.id, showPay.userId))}/>
            </FormField>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost btn-sm" onClick={() => { setPayAmt(String(showPay.ob.amount)); setTimeout(recordPayment, 100) }}>مسدد كامل</button>
              <button className="btn btn-primary" onClick={recordPayment} disabled={saving}>{saving ? <Spinner size="sm"/> : 'تسجيل'}</button>
            </div>
          </>
        )}
      </Modal>

      {/* Renewal */}
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
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="تاريخ بداية الاشتراك">
                    <input className="form-input" type="date" value={renewForm.startDate} onChange={e => setRenewForm(p => ({ ...p, startDate: e.target.value }))}/>
                  </FormField>
                  <FormField label="عدد الشهور">
                    <input className="form-input" type="number" min="1" max="36" value={renewForm.months}
                      onChange={e => setRenewForm(p => ({ ...p, months: Math.max(1, parseInt(e.target.value) || 1) }))}/>
                  </FormField>
                </div>
                {renewForm.startDate && renewForm.months > 0 && (() => {
                  const end = new Date(renewForm.startDate); end.setMonth(end.getMonth() + renewForm.months)
                  return <div className="text-xs text-slate-500 -mt-2 mb-3 flex items-center gap-1"><Calendar size={11}/><span>ينتهي: <strong>{end.toISOString().slice(0, 10)}</strong></span></div>
                })()}
                <FormField label="خصم (اختياري)">
                  <div className="flex gap-2 mb-2">
                    {([null, 'percent', 'fixed'] as const).map(dt => (
                      <button key={String(dt)} onClick={() => setRenewForm(p => ({ ...p, discountType: dt, discountValue: 0 }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${renewForm.discountType === dt ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {dt === null ? 'بدون خصم' : dt === 'percent' ? 'نسبة %' : 'مبلغ ثابت'}
                      </button>
                    ))}
                  </div>
                  {renewForm.discountType && (
                    <input className="form-input" type="number" min="0"
                      placeholder={renewForm.discountType === 'percent' ? 'مثال: 10 (10%)' : `مثال: 50 (${RIYAL})`}
                      value={renewForm.discountValue || ''}
                      onChange={e => setRenewForm(p => ({ ...p, discountValue: parseFloat(e.target.value) || 0 }))}/>
                  )}
                </FormField>
                <div className="bg-slate-50 rounded-xl p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">المبلغ الإجمالي</span>
                    <span className="text-xl font-extrabold text-brand-700">{renewTotal} {RIYAL}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {team.subscription_fee} {RIYAL} × {renewForm.months} شهر
                    {renewForm.discountType && ` − خصم ${renewForm.discountValue}${renewForm.discountType === 'percent' ? '%' : ` ${RIYAL}`}`}
                  </div>
                </div>
                <FormField label="حالة السداد">
                  <div className="flex gap-2 mb-2">
                    {([['paid', 'مسدد كامل ✅'], ['partial', 'سداد جزئي 🔶'], ['unpaid', 'لم يسدد بعد ❌']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setRenewForm(p => ({ ...p, paymentStatus: v, paidAmount: 0 }))}
                        className={`flex-1 py-2.5 rounded-xl border text-xs font-bold text-center transition-all ${renewForm.paymentStatus === v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>{l}</button>
                    ))}
                  </div>
                  {renewForm.paymentStatus === 'partial' && (
                    <div>
                      <input className="form-input" type="number" min="0" placeholder={`المبلغ المدفوع (من ${renewTotal} ${RIYAL})`}
                        value={renewForm.paidAmount || ''} onChange={e => setRenewForm(p => ({ ...p, paidAmount: parseFloat(e.target.value) || 0 }))}/>
                      {renewForm.paidAmount > 0 && renewTotal > renewForm.paidAmount && (
                        <div className="text-xs text-red-600 mt-1">متبقي كمديونية: {Math.max(0, renewTotal - renewForm.paidAmount).toFixed(2)} {RIYAL}</div>
                      )}
                    </div>
                  )}
                  {renewForm.paymentStatus === 'unpaid' && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-xl p-2.5 mt-1">⚠️ سيُسجَّل المبلغ الكامل ({renewTotal} {RIYAL}) كمديونية في ملف اللاعب</div>
                  )}
                </FormField>
                <FormField label="ملاحظات">
                  <input className="form-input" placeholder="اختياري..." value={renewForm.notes} onChange={e => setRenewForm(p => ({ ...p, notes: e.target.value }))}/>
                </FormField>
                <div className="flex gap-2 justify-end mt-4">
                  <button className="btn btn-ghost" onClick={() => setShowRenew(null)}>إلغاء</button>
                  <button className="btn btn-primary" onClick={doRenew} disabled={saving}>{saving ? <Spinner size="sm"/> : <><RefreshCw size={14}/> تجديد الاشتراك</>}</button>
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
          const pid = showStatement.player_id
          // Subscriptions
          const stSubs = allSubs.filter(s => s.player_id === pid)
          const stSubTotal = stSubs.reduce((s, sub) => s + Number(sub.final_amount), 0)
          const stSubPaid = stSubs.reduce((s, sub) => s + Number(sub.paid_amount || 0), 0)

          // Obligations
          const stObs = obs
            .filter(ob => getTargetMembers(ob).some((m: any) => m.user_id === pid))
            .map(ob => ({
              ob,
              paid: getPaid(ob.id, pid),
              paidAt: getPaidAt(ob.id, pid)
            }))
          const stObTotal = stObs.reduce((s, { ob }) => s + ob.amount, 0)
          const stObPaid = stObs.reduce((s, { paid }) => s + paid, 0)

          const grandTotal = stSubTotal + stObTotal
          const grandPaid = stSubPaid + stObPaid
          const grandRemaining = grandTotal - grandPaid

          const summary = { total: grandTotal, paid: grandPaid, remaining: grandRemaining }

          return (
            <>
              {/* Export buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => exportStatementCSV(showStatement.full_name, stObs, stSubs)}
                  className="btn btn-sm btn-ghost gap-1.5 flex-1">
                  <Download size={13}/> Excel / CSV
                </button>
                <button
                  onClick={() => printStatement(showStatement.full_name, stObs, stSubs, summary)}
                  className="btn btn-sm btn-ghost gap-1.5 flex-1">
                  <Printer size={13}/> طباعة PDF
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <div className="text-xs text-slate-500">إجمالي المُصدَر</div>
                  <div className="font-extrabold text-slate-700 mt-0.5">{grandTotal} {RIYAL}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                  <div className="text-xs text-emerald-600">المسدّد</div>
                  <div className="font-extrabold text-emerald-700 mt-0.5">{grandPaid} {RIYAL}</div>
                </div>
                <div className={`${grandRemaining > 0 ? 'bg-red-50' : 'bg-slate-50'} rounded-xl p-2.5 text-center`}>
                  <div className={`text-xs ${grandRemaining > 0 ? 'text-red-600' : 'text-slate-500'}`}>المتبقي</div>
                  <div className={`font-extrabold mt-0.5 ${grandRemaining > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                    {grandRemaining > 0 ? `${grandRemaining} ${RIYAL}` : '—'}
                  </div>
                </div>
              </div>

              {/* Obligations section */}
              {stObs.length > 0 && (
                <>
                  <div className="text-xs font-bold text-slate-500 mb-2">الالتزامات المالية ({stObs.length})</div>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100">
                          <th className="text-right pb-2 font-bold">الالتزام</th>
                          <th className="text-right pb-2 font-bold">المبلغ</th>
                          <th className="text-right pb-2 font-bold">المدفوع</th>
                          <th className="text-right pb-2 font-bold">تاريخ السداد</th>
                          <th className="text-right pb-2 font-bold">المتبقي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stObs.map(({ ob, paid, paidAt }) => {
                          const rem = Math.max(0, ob.amount - paid)
                          return (
                            <tr key={ob.id} className="border-b border-slate-50">
                              <td className="py-2 font-bold text-slate-700">{ob.title}</td>
                              <td className="py-2 text-slate-600">{ob.amount} {RIYAL}</td>
                              <td className="py-2 text-emerald-700">{paid > 0 ? `${paid} ${RIYAL}` : '—'}</td>
                              <td className="py-2 text-slate-400">{paidAt}</td>
                              <td className={`py-2 font-bold ${rem > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                {rem > 0 ? `${rem} ${RIYAL}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Subscriptions section */}
              {stSubs.length === 0 && stObs.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">لا توجد معاملات مالية لهذا العضو</div>
              ) : stSubs.length > 0 && (
                <>
                  <div className="text-xs font-bold text-slate-500 mb-2">سجل الاشتراكات ({stSubs.length})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100">
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
                              <td className="py-2 text-slate-600">
                                <div className="font-bold">{s.start_date}</div>
                                <div className="text-slate-400">← {s.end_date} ({s.months} شهر)</div>
                              </td>
                              <td className="py-2 font-bold text-slate-700">{s.final_amount} {RIYAL}</td>
                              <td className="py-2 text-emerald-700">{Number(s.paid_amount || 0)} {RIYAL}</td>
                              <td className={`py-2 font-bold ${debt > 0 ? 'text-red-600' : 'text-slate-300'}`}>{debt > 0 ? `${debt} ${RIYAL}` : '—'}</td>
                              <td className="py-2"><span className={`badge text-xs ${BADGE_CLS[ss]}`}>{STATUS_LBL[ss]}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 font-bold text-xs">
                          <td className="pt-2 text-slate-600">الإجمالي ({stSubs.length})</td>
                          <td className="pt-2 text-slate-700">{stSubTotal} {RIYAL}</td>
                          <td className="pt-2 text-emerald-700">{stSubPaid} {RIYAL}</td>
                          <td className={`pt-2 ${(stSubTotal - stSubPaid) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {(stSubTotal - stSubPaid) > 0 ? `${stSubTotal - stSubPaid} ${RIYAL}` : '—'}
                          </td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </>
          )
        })()}
      </Modal>

      {/* Add Reward Modal */}
      <Modal open={showReward} onClose={() => { setShowReward(false); setRewardForm({ title: '', notes: '', amount: '', user_ids: [] }) }}
        title="🎁 إضافة مكافأة مالية" width="max-w-lg">
        <FormField label="عنوان المكافأة" required>
          <input className="form-input" value={rewardForm.title}
            onChange={e => setRwf('title', e.target.value)} placeholder="مكافأة أداء الموسم..."/>
        </FormField>
        <FormField label="ملاحظة (اختياري)">
          <input className="form-input" value={rewardForm.notes}
            onChange={e => setRwf('notes', e.target.value)} placeholder="تفاصيل إضافية عن المكافأة..."/>
        </FormField>
        <FormField label="من يستحق المكافأة" required>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">جميع أعضاء الفريق عدا أولياء الأمور والضيوف</span>
            <button type="button"
              className="text-xs font-bold text-brand-600 hover:text-brand-800 transition-colors"
              onClick={() => {
                const eligible = members.filter(m => !['parent', 'guest'].includes(m.role)).map(m => m.user_id)
                const allSel   = eligible.length > 0 && eligible.every(id => rewardForm.user_ids.includes(id))
                setRwf('user_ids', allSel ? [] : eligible)
              }}>
              {members.filter(m => !['parent', 'guest'].includes(m.role)).length > 0 &&
               members.filter(m => !['parent', 'guest'].includes(m.role)).every(m => rewardForm.user_ids.includes(m.user_id))
                ? '✕ إلغاء الكل'
                : '✓ تحديد الكل'}
            </button>
          </div>
          <CheckboxList
            items={members
              .filter(m => !['parent', 'guest'].includes(m.role))
              .map(m => ({ value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] || m.role }))}
            selected={rewardForm.user_ids}
            onChange={v => setRwf('user_ids', v)}/>
        </FormField>
        <FormField label={`المبلغ لكل شخص (${RIYAL})`} required>
          <input className="form-input" type="number" min="1" value={rewardForm.amount}
            onChange={e => setRwf('amount', e.target.value)} placeholder="500"/>
        </FormField>
        {rewardForm.user_ids.length > 0 && rewardForm.amount && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-700 mt-1">
            💰 إجمالي المكافآت: <strong>{(parseFloat(rewardForm.amount) * rewardForm.user_ids.length).toLocaleString()} {RIYAL}</strong> لـ {rewardForm.user_ids.length} شخص
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowReward(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addReward} disabled={saving || !rewardForm.title || !rewardForm.amount || rewardForm.user_ids.length === 0}>
            {saving ? <Spinner size="sm"/> : 'إضافة المكافأة'}
          </button>
        </div>
      </Modal>

      {/* Image Preview */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <button className="absolute top-4 left-4 text-white bg-white/20 rounded-full p-2 border-none cursor-pointer"><X size={20}/></button>
          <img src={previewImg} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}/>
        </div>
      )}
    </div>
  )
}
