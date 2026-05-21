import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  BriefcaseBusiness, CalendarDays, CreditCard, FileText, HandCoins,
  Pencil, Plus, RefreshCw, Send, ShieldCheck, Trash2, UserRound
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { contractService, teamService } from '../../services'
import { EmptyState, FormField, Modal, PageHeader, Spinner } from '../../components/ui'
import { canManageContracts, cn, formatDate, RIYAL, ROLE_LABELS } from '../../utils/helpers'

const CONTRACT_TYPES: Record<string, string> = {
  professional: 'احترافي',
  amateur: 'هاوي',
  staff: 'موظف',
  temporary: 'مؤقت',
  trial: 'تجربة',
  loan: 'إعارة',
  volunteer: 'متعاون',
  other: 'أخرى',
}

const CONTRACT_STATUS: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشط',
  expired: 'منتهي',
  terminated: 'مفسوخ',
  suspended: 'معلق',
  renewal_pending: 'تحت التجديد',
  transferred: 'منتقل',
  released: 'منسق',
}

const ACQUISITION_TYPES: Record<string, string> = {
  purchase: 'شراء عقد',
  free_transfer: 'انتقال حر',
  loan: 'إعارة',
  academy_promotion: 'تصعيد من الفئات',
  trial_to_sign: 'تجربة ثم توقيع',
  renewal: 'تجديد',
  other: 'أخرى',
}

const PAYMENT_TYPES: Record<string, string> = {
  salary: 'راتب',
  bonus: 'مكافأة',
  allowance: 'بدل',
  installment: 'دفعة عقد',
  deduction: 'خصم',
  settlement: 'مخالصة',
  other: 'أخرى',
}

const WORK_TYPES: Record<string, string> = {
  full_time: 'كامل',
  part_time: 'جزئي',
  remote: 'عن بعد',
}

const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  check: 'شيك',
  club_account: 'حساب النادي',
  external_sponsor: 'راعي / جهة خارجية',
  wallet: 'محفظة إلكترونية',
  other: 'أخرى',
}

const PARTY_TYPES: Record<string, string> = {
  player: 'لاعب',
  technical_staff: 'جهاز فني',
  medical_staff: 'طبي',
  administration: 'إدارة',
  scout: 'كشاف',
  media: 'إعلام',
  other: 'أخرى',
}

const PARTY_ROLE_FILTERS: Record<string, string[]> = {
  player: ['player'],
  technical_staff: ['head_coach', 'assistant_coach'],
  medical_staff: ['medical'],
  administration: ['owner', 'administrator'],
  scout: ['scout'],
  media: ['media'],
  other: [],
}

const roleToParty = (role?: string) => {
  if (role === 'player') return 'player'
  if (role === 'head_coach' || role === 'assistant_coach') return 'technical_staff'
  if (role === 'medical') return 'medical_staff'
  if (role === 'administrator' || role === 'owner') return 'administration'
  if (role === 'scout') return 'scout'
  if (role === 'media') return 'media'
  return 'other'
}

const BENEFIT_OPTIONS = [
  { key: 'medical_insurance', label: 'تأمين طبي', type: 'non_financial' },
  { key: 'housing', label: 'سكن', type: 'non_financial' },
  { key: 'transportation', label: 'مواصلات', type: 'non_financial' },
  { key: 'club_clothes', label: 'ملابس النادي', type: 'non_financial' },
  { key: 'shoes', label: 'أحذية', type: 'non_financial' },
  { key: 'equipment', label: 'أجهزة ومعدات', type: 'non_financial' },
  { key: 'travel_tickets', label: 'تذاكر سفر', type: 'non_financial' },
  { key: 'education_allowance', label: 'بدل تعليم', type: 'financial' },
  { key: 'phone_allowance', label: 'بدل اتصال', type: 'financial' },
  { key: 'meal_allowance', label: 'بدل تغذية', type: 'financial' },
  { key: 'win_bonus', label: 'مكافأة فوز', type: 'bonus' },
  { key: 'championship_bonus', label: 'مكافأة بطولة', type: 'bonus' },
  { key: 'attendance_bonus', label: 'مكافأة حضور', type: 'bonus' },
  { key: 'performance_bonus', label: 'مكافأة أداء', type: 'bonus' },
  { key: 'report_bonus', label: 'مكافأة تقارير', type: 'bonus' },
  { key: 'signing_bonus', label: 'مكافأة توقيع', type: 'bonus' },
  { key: 'release_clause', label: 'شرط جزائي', type: 'clause' },
  { key: 'auto_renewal', label: 'تجديد تلقائي', type: 'clause' },
  { key: 'early_termination', label: 'إنهاء مبكر', type: 'clause' },
  { key: 'loan_clause', label: 'بند إعارة', type: 'clause' },
]

function money(value: any) {
  return `${Number(value || 0).toLocaleString('ar-SA')} ${RIYAL}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(date?: string) {
  if (!date) return null
  const start = new Date(today()).getTime()
  const end = new Date(date).getTime()
  return Math.ceil((end - start) / 86400000)
}

function contractMonths(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(1, months + (end.getDate() >= start.getDate() ? 1 : 0))
}

function StatCard({ icon: Icon, label, value, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    slate: 'bg-white text-slate-700 border-slate-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  }
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-xs font-bold opacity-75">
        <Icon size={15}/>{label}
      </div>
      <div className="text-2xl font-extrabold mt-2 tabular-nums">{value}</div>
    </div>
  )
}

export default function ContractsPage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [myRole, setMyRole] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])
  const [jobTitles, setJobTitles] = useState<any[]>([])
  const [tab, setTab] = useState<'dashboard' | 'contracts' | 'payments' | 'loans' | 'alerts'>('dashboard')
  const [showContract, setShowContract] = useState(false)
  const [editingContract, setEditingContract] = useState<any>(null)
  const [showJobTitle, setShowJobTitle] = useState(false)
  const [showPayment, setShowPayment] = useState<any>(null)
  const [showLoan, setShowLoan] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const emptyContract = {
    contract_party_type: 'player',
    member_user_id: '',
    member_role: 'player',
    contract_type: 'professional',
    contract_status: 'active',
    start_date: today(),
    end_date: '',
    signing_date: today(),
    acquisition_type: 'free_transfer',
    previous_club: '',
    agent_name: '',
    agent_phone: '',
    transfer_fee: '',
    release_clause: '',
    sell_on_percentage: '',
    monthly_salary: '',
    total_value: '',
    payment_day: '1',
    payment_method: '',
    bank_info: '',
    job_title_id: '',
    job_title: '',
    work_type: 'full_time',
    department: '',
    direct_manager: '',
    benefit_keys: [] as string[],
    benefit_details: {} as Record<string, string>,
    custom_benefits_text: '',
    notes: '',
  }
  const [contractForm, setContractForm] = useState(emptyContract)
  const [jobForm, setJobForm] = useState({ name: '', description: '' })
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'salary',
    period_label: '',
    due_date: today(),
    amount_due: '',
    amount_paid: '',
    paid_at: today(),
    notes: '',
  })
  const [loanForm, setLoanForm] = useState({
    loan_direction: 'out',
    other_club: '',
    from_date: today(),
    to_date: '',
    salary_covered_by: 'other_club',
    salary_coverage_percentage: '100',
    has_buy_option: false,
    buy_option_amount: '',
    notes: '',
  })

  const canManage = canManageContracts(myRole)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    load()
  }, [teamId, user])

  useEffect(() => {
    const months = contractMonths(contractForm.start_date, contractForm.end_date)
    const total = months * Number(contractForm.monthly_salary || 0)
    const nextTotal = total > 0 ? String(total) : ''
    setContractForm(p => p.total_value === nextTotal ? p : { ...p, total_value: nextTotal })
  }, [contractForm.start_date, contractForm.end_date, contractForm.monthly_salary])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [rows, jobs] = await Promise.all([
      contractService.getAll(teamId),
      contractService.getJobTitles(teamId),
    ])
    setContracts(rows)
    setJobTitles(jobs)
    setLoading(false)
  }

  const activeContracts = contracts.filter(c => c.contract_status === 'active')
  const allPayments = contracts.flatMap(c => (c.payments || []).map((p: any) => ({ ...p, contract: c })))
  const allLoans = contracts.flatMap(c => (c.loans || []).map((l: any) => ({ ...l, contract: c })))
  const isPlayerContract = contractForm.contract_party_type === 'player'
  const availableMembers = members.filter((m: any) => {
    if (m.role === 'parent' || m.role === 'guest') return false
    const roles = PARTY_ROLE_FILTERS[contractForm.contract_party_type]
    return !roles?.length || roles.includes(m.role)
  })

  const stats = useMemo(() => {
    const endingSoon = activeContracts.filter(c => {
      const days = daysUntil(c.end_date)
      return days !== null && days >= 0 && days <= 90
    }).length
    const monthlySalary = activeContracts.reduce((s, c) => s + Number(c.monthly_salary || 0), 0)
    const duePayments = allPayments.filter(p => ['due', 'partial', 'overdue'].includes(p.payment_status))
    const dueAmount = duePayments.reduce((s, p) => s + Math.max(0, Number(p.amount_due || 0) - Number(p.amount_paid || 0)), 0)
    return {
      total: contracts.length,
      active: activeContracts.length,
      endingSoon,
      monthlySalary,
      duePayments: duePayments.length,
      dueAmount,
      activeLoans: allLoans.filter(l => l.status === 'active').length,
    }
  }, [contracts])

  function setContract(k: string, v: any) {
    setContractForm(p => ({ ...p, [k]: v }))
  }

  function selectedMember() {
    return members.find((m: any) => m.user_id === contractForm.member_user_id)
  }

  function selectedJobTitle() {
    return jobTitles.find((j: any) => j.id === contractForm.job_title_id)
  }

  function toggleBenefit(key: string) {
    setContractForm(p => ({
      ...p,
      benefit_keys: p.benefit_keys.includes(key)
        ? p.benefit_keys.filter(x => x !== key)
        : [...p.benefit_keys, key],
    }))
  }

  function setBenefitDetail(key: string, value: string) {
    setContractForm(p => ({
      ...p,
      benefit_details: { ...p.benefit_details, [key]: value },
    }))
  }

  function closeContractModal() {
    setShowContract(false)
    setEditingContract(null)
    setContractForm(emptyContract)
  }

  function openNewContract() {
    setEditingContract(null)
    setContractForm(emptyContract)
    setShowContract(true)
  }

  function benefitDetailFromNote(note?: string) {
    if (!note) return ''
    return BENEFIT_OPTIONS.some(b => b.key === note) ? '' : note
  }

  function openEditContract(contract: any) {
    const party = contract.contract_party_type || roleToParty(contract.member_role)
    const optionKeys = BENEFIT_OPTIONS
      .filter(option => contract.benefits?.some((b: any) => b.title === option.label))
      .map(option => option.key)
    const benefitDetails = optionKeys.reduce((acc: Record<string, string>, key) => {
      const option = BENEFIT_OPTIONS.find(b => b.key === key)
      const row = contract.benefits?.find((b: any) => b.title === option?.label)
      acc[key] = row ? (String(Number(row.amount || 0) > 0 ? row.amount : '') || benefitDetailFromNote(row.notes)) : ''
      return acc
    }, {})
    const customBenefits = (contract.benefits || [])
      .filter((b: any) => !BENEFIT_OPTIONS.some(option => option.label === b.title))
      .map((b: any) => b.notes ? `${b.title} - ${b.notes}` : b.title)
      .join('\n')

    setEditingContract(contract)
    setContractForm({
      ...emptyContract,
      contract_party_type: party,
      member_user_id: contract.member_user_id || '',
      member_role: contract.member_role || 'player',
      contract_type: contract.contract_type || (party === 'player' ? 'professional' : 'staff'),
      contract_status: contract.contract_status || 'active',
      start_date: contract.start_date || today(),
      end_date: contract.end_date || '',
      signing_date: contract.signing_date || today(),
      acquisition_type: contract.acquisition_type || 'free_transfer',
      previous_club: contract.previous_club || '',
      agent_name: contract.agent_name || '',
      agent_phone: contract.agent_phone || '',
      transfer_fee: String(contract.transfer_fee || ''),
      release_clause: String(contract.release_clause || ''),
      sell_on_percentage: String(contract.sell_on_percentage || ''),
      monthly_salary: String(contract.monthly_salary || ''),
      total_value: String(contract.total_value || ''),
      payment_day: String(contract.payment_day || '1'),
      payment_method: contract.payment_method || '',
      bank_info: contract.bank_info || '',
      job_title_id: contract.job_title_id || '',
      job_title: contract.job_title || '',
      work_type: contract.work_type || 'full_time',
      department: contract.department || '',
      direct_manager: contract.direct_manager || '',
      benefit_keys: optionKeys,
      benefit_details: benefitDetails,
      custom_benefits_text: customBenefits,
      notes: contract.notes || '',
    })
    setShowContract(true)
  }

  function diffContractFields(oldContract: any, next: any, benefitsChanged: boolean) {
    const fields: [string, string, any][] = [
      ['contract_party_type', 'فئة العقد', oldContract.contract_party_type],
      ['member_user_id', 'العضو', oldContract.member_user_id],
      ['contract_type', 'نوع العقد', oldContract.contract_type],
      ['contract_status', 'حالة العقد', oldContract.contract_status],
      ['start_date', 'بداية العقد', oldContract.start_date],
      ['end_date', 'نهاية العقد', oldContract.end_date],
      ['acquisition_type', 'طريقة التعاقد', oldContract.acquisition_type],
      ['previous_club', 'النادي السابق', oldContract.previous_club],
      ['transfer_fee', 'قيمة الانتقال', Number(oldContract.transfer_fee || 0)],
      ['release_clause', 'الشرط الجزائي', Number(oldContract.release_clause || 0)],
      ['sell_on_percentage', 'نسبة بيع مستقبلية', Number(oldContract.sell_on_percentage || 0)],
      ['monthly_salary', 'الراتب الشهري', Number(oldContract.monthly_salary || 0)],
      ['total_value', 'قيمة العقد', Number(oldContract.total_value || 0)],
      ['payment_day', 'يوم صرف الراتب', Number(oldContract.payment_day || 1)],
      ['payment_method', 'طريقة الدفع', oldContract.payment_method],
      ['job_title_id', 'المسمى الوظيفي', oldContract.job_title_id],
      ['work_type', 'نوع الوظيفة', oldContract.work_type],
      ['department', 'القسم', oldContract.department],
    ]
    const changed = fields
      .filter(([key, , oldValue]) => String(oldValue ?? '') !== String(next[key] ?? ''))
      .map(([, label]) => label)
    if (benefitsChanged) changed.push('المكافآت والامتيازات')
    return changed
  }

  function contractBenefitsSignature(benefits: any[]) {
    return benefits
      .map(b => `${b.title}|${b.benefit_type}|${Number(b.amount || 0)}|${b.notes || ''}`)
      .sort()
      .join(';;')
  }

  async function saveContract() {
    if (!teamId || !user || !canManage || !contractForm.member_user_id || !contractForm.start_date) return
    setSaving(true)
    const member = selectedMember()
    const payload = {
      team_id: teamId,
      member_user_id: contractForm.member_user_id,
      member_role: member?.role || contractForm.member_role,
      contract_party_type: contractForm.contract_party_type,
      contract_type: contractForm.contract_type,
      contract_status: contractForm.contract_status,
      start_date: contractForm.start_date,
      end_date: contractForm.end_date || null,
      signing_date: contractForm.signing_date || null,
      acquisition_type: isPlayerContract ? contractForm.acquisition_type : null,
      previous_club: isPlayerContract ? contractForm.previous_club || null : null,
      agent_name: isPlayerContract ? contractForm.agent_name || null : null,
      agent_phone: isPlayerContract ? contractForm.agent_phone || null : null,
      transfer_fee: isPlayerContract ? Number(contractForm.transfer_fee || 0) : 0,
      release_clause: isPlayerContract ? Number(contractForm.release_clause || 0) : 0,
      sell_on_percentage: isPlayerContract ? Number(contractForm.sell_on_percentage || 0) : 0,
      monthly_salary: Number(contractForm.monthly_salary || 0),
      total_value: Number(contractForm.total_value || 0),
      payment_day: Number(contractForm.payment_day || 1),
      payment_method: contractForm.payment_method || null,
      bank_info: contractForm.bank_info || null,
      job_title_id: !isPlayerContract ? contractForm.job_title_id || null : null,
      job_title: !isPlayerContract ? selectedJobTitle()?.name || contractForm.job_title || null : null,
      work_type: !isPlayerContract ? contractForm.work_type : null,
      department: !isPlayerContract ? contractForm.department || null : null,
      direct_manager: contractForm.direct_manager || null,
      notes: contractForm.notes || null,
    }
    const optionBenefits = BENEFIT_OPTIONS
      .filter(b => contractForm.benefit_keys.includes(b.key))
      .map(b => {
        const detail = contractForm.benefit_details[b.key]?.trim() || ''
        const numericDetail = detail !== '' && !Number.isNaN(Number(detail)) ? Number(detail) : 0
        return {
          title: b.label,
          benefit_type: b.type,
          amount: numericDetail,
          notes: numericDetail > 0 ? null : detail || null,
        }
      })
    const customBenefits = contractForm.custom_benefits_text
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)
      .map(title => ({ title, benefit_type: 'clause', amount: 0, notes: null }))
    const benefits = [...optionBenefits, ...customBenefits]
    if (editingContract) {
      const benefitsChanged = contractBenefitsSignature(editingContract.benefits || []) !== contractBenefitsSignature(benefits)
      const changedFields = diffContractFields(editingContract, payload, benefitsChanged)
      const editorName = profile?.full_name || user.email || 'مستخدم'
      const auditLine = changedFields.length
        ? `تم تعديل العقد بتاريخ ${today()} وتم تغيير: ${changedFields.join('، ')} بواسطة ${editorName}.`
        : `تم فتح تعديل العقد بتاريخ ${today()} بواسطة ${editorName} بدون تغيير جوهري.`
      const notes = [contractForm.notes?.trim(), auditLine].filter(Boolean).join('\n')
      await contractService.updateContract(editingContract.id, { ...payload, notes }, editingContract.contract_status, user.id)
      await contractService.replaceBenefits(editingContract.id, teamId, benefits)
      closeContractModal()
      await load()
      setSaving(false)
      return
    }
    const { data } = await contractService.createContract({ ...payload, created_by: user.id }, benefits)
    if (data && Number(contractForm.monthly_salary || 0) > 0) {
      await contractService.addPayment({
        contract_id: data.id,
        team_id: teamId,
        member_user_id: contractForm.member_user_id,
        payment_type: 'salary',
        period_label: 'أول راتب',
        due_date: contractForm.start_date,
        amount_due: Number(contractForm.monthly_salary || 0),
        amount_paid: 0,
        payment_status: 'due',
        created_by: user.id,
      })
    }
    closeContractModal()
    await load()
    setSaving(false)
  }

  async function savePayment() {
    if (!teamId || !user || !showPayment) return
    setSaving(true)
    await contractService.addPayment({
      contract_id: showPayment.id,
      team_id: teamId,
      member_user_id: showPayment.member_user_id,
      payment_type: paymentForm.payment_type,
      period_label: paymentForm.period_label || null,
      due_date: paymentForm.due_date || null,
      amount_due: Number(paymentForm.amount_due || 0),
      amount_paid: Number(paymentForm.amount_paid || 0),
      paid_at: Number(paymentForm.amount_paid || 0) > 0 ? paymentForm.paid_at : null,
      notes: paymentForm.notes || null,
      created_by: user?.id || null,
    })
    setShowPayment(null)
    setPaymentForm({ payment_type: 'salary', period_label: '', due_date: today(), amount_due: '', amount_paid: '', paid_at: today(), notes: '' })
    await load()
    setSaving(false)
  }

  async function saveJobTitle() {
    if (!teamId || !user || !jobForm.name.trim()) return
    setSaving(true)
    const { data } = await contractService.createJobTitle({
      team_id: teamId,
      name: jobForm.name.trim(),
      description: jobForm.description.trim() || null,
      created_by: user.id,
    })
    if (data) {
      setContract('job_title_id', data.id)
      setContract('job_title', data.name)
    }
    setShowJobTitle(false)
    setJobForm({ name: '', description: '' })
    await load()
    setSaving(false)
  }

  async function saveLoan() {
    if (!teamId || !user || !showLoan || !loanForm.other_club.trim()) return
    setSaving(true)
    await contractService.addLoan({
      contract_id: showLoan.id,
      team_id: teamId,
      player_id: showLoan.member_user_id,
      loan_direction: loanForm.loan_direction,
      other_club: loanForm.other_club.trim(),
      from_date: loanForm.from_date,
      to_date: loanForm.to_date || null,
      salary_covered_by: loanForm.salary_covered_by,
      salary_coverage_percentage: Number(loanForm.salary_coverage_percentage || 0),
      has_buy_option: loanForm.has_buy_option,
      buy_option_amount: Number(loanForm.buy_option_amount || 0),
      status: 'active',
      notes: loanForm.notes || null,
      created_by: user.id,
    })
    await contractService.updateContract(showLoan.id, { contract_status: 'transferred' }, showLoan.contract_status, user.id)
    setShowLoan(null)
    setLoanForm({ loan_direction: 'out', other_club: '', from_date: today(), to_date: '', salary_covered_by: 'other_club', salary_coverage_percentage: '100', has_buy_option: false, buy_option_amount: '', notes: '' })
    await load()
    setSaving(false)
  }

  async function deleteContract() {
    if (!confirmDelete) return
    setSaving(true)
    await contractService.deleteContract(confirmDelete.id)
    setConfirmDelete(null)
    await load()
    setSaving(false)
  }

  function ContractCard({ contract }: { contract: any }) {
    const due = daysUntil(contract.end_date)
    const remaining = contract.payments?.reduce((s: number, p: any) => s + Math.max(0, Number(p.amount_due || 0) - Number(p.amount_paid || 0)), 0) || 0
    return (
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <UserRound size={16} className="text-teal-600"/>
              <h3 className="font-extrabold text-sm text-slate-800 truncate">{contract.member?.full_name || 'عضو'}</h3>
              <span className="text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 px-2 py-0.5">{ROLE_LABELS[contract.member_role] || contract.member_role}</span>
              <span className={cn(
                'text-[10px] font-bold rounded-lg px-2 py-0.5',
                contract.contract_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              )}>{CONTRACT_STATUS[contract.contract_status] || contract.contract_status}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
              <span>{PARTY_TYPES[contract.contract_party_type || roleToParty(contract.member_role)]}</span>
              <span>{CONTRACT_TYPES[contract.contract_type]}</span>
              {contract.acquisition_type && <span>{ACQUISITION_TYPES[contract.acquisition_type]}</span>}
              <span>{contract.start_date} ← {contract.end_date || 'مفتوح'}</span>
              {due !== null && due >= 0 && due <= 90 && <span className="font-bold text-amber-600">ينتهي بعد {due} يوم</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs font-bold rounded-xl bg-slate-50 border border-slate-100 px-2 py-1">راتب شهري: {money(contract.monthly_salary)}</span>
              <span className="text-xs font-bold rounded-xl bg-slate-50 border border-slate-100 px-2 py-1">القيمة: {money(contract.total_value)}</span>
              <span className="text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-100 px-2 py-1">متبقي: {money(remaining)}</span>
            </div>
            {contract.benefits?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {contract.benefits.slice(0, 4).map((b: any) => (
                  <span key={b.id} className="text-[10px] font-bold rounded-lg bg-blue-50 text-blue-700 px-2 py-0.5">{b.title}</span>
                ))}
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex gap-1.5 flex-wrap justify-end flex-shrink-0">
              <button className="btn btn-ghost btn-sm" onClick={() => {
                setShowPayment(contract)
                setPaymentForm(p => ({ ...p, amount_due: String(contract.monthly_salary || ''), period_label: 'راتب' }))
              }}>
                <CreditCard size={13}/> دفعة
              </button>
              {contract.member_role === 'player' && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowLoan(contract)}>
                  <Send size={13}/> إعارة
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => openEditContract(contract)}>
                <Pencil size={13}/> تعديل
              </button>
              <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDelete(contract)}>
                <Trash2 size={13}/> حذف
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!canManage && !loading) {
    return (
      <div className="card text-center py-10">
        <ShieldCheck size={34} className="mx-auto text-slate-300 mb-3"/>
        <h2 className="font-extrabold text-slate-700">قسم العقود خاص بمدير الفريق</h2>
        <p className="text-sm text-slate-400 mt-1">لا تملك صلاحية عرض العقود والرواتب.</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="العقود والالتزامات"
        subtitle="إدارة عقود اللاعبين والجهاز الفني والموظفين والرواتب والإعارات"
        action={canManage && (
          <button className="btn btn-primary btn-sm" onClick={openNewContract}>
            <Plus size={13}/> عقد جديد
          </button>
        )}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['dashboard', 'لوحة العقود', BriefcaseBusiness],
          ['contracts', 'العقود', FileText],
          ['payments', 'الرواتب', HandCoins],
          ['loans', 'الإعارات', Send],
          ['alerts', 'التنبيهات', CalendarDays],
        ].map(([key, label, Icon]: any) => (
          <button key={key} className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(key)}>
            <Icon size={13}/>{label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-10"><Spinner/></div> : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={FileText} label="كل العقود" value={stats.total}/>
                <StatCard icon={ShieldCheck} label="نشطة" value={stats.active} tone="green"/>
                <StatCard icon={CalendarDays} label="تنتهي خلال 90 يوم" value={stats.endingSoon} tone="amber"/>
                <StatCard icon={Send} label="إعارات نشطة" value={stats.activeLoans} tone="blue"/>
                <StatCard icon={HandCoins} label="الرواتب الشهرية" value={money(stats.monthlySalary)} tone="green"/>
                <StatCard icon={CreditCard} label="دفعات مستحقة" value={stats.duePayments} tone="red"/>
                <StatCard icon={BriefcaseBusiness} label="قيمة المستحقات" value={money(stats.dueAmount)} tone="red"/>
              </div>
              <div className="space-y-3">
                {contracts.slice(0, 5).map(c => <ContractCard key={c.id} contract={c}/>)}
                {contracts.length === 0 && <div className="card"><EmptyState title="لا توجد عقود بعد"/></div>}
              </div>
            </div>
          )}

          {tab === 'contracts' && (
            <div className="space-y-3">
              {contracts.length === 0 ? <div className="card"><EmptyState title="لا توجد عقود بعد"/></div> : contracts.map(c => <ContractCard key={c.id} contract={c}/>)}
            </div>
          )}

          {tab === 'payments' && (
            <div className="card p-0 overflow-hidden">
              {allPayments.length === 0 ? <EmptyState title="لا توجد دفعات أو رواتب بعد"/> : (
                <div className="divide-y divide-slate-50">
                  {allPayments.map(p => (
                    <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{p.contract?.member?.full_name} - {PAYMENT_TYPES[p.payment_type] || p.payment_type}</div>
                        <div className="text-xs text-slate-400 mt-1">{p.period_label || 'بدون فترة'} · استحقاق {p.due_date || '—'}</div>
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-sm text-slate-800">{money(p.amount_due)}</div>
                        <div className={cn('text-xs font-bold', p.payment_status === 'paid' ? 'text-emerald-600' : 'text-red-600')}>
                          مدفوع {money(p.amount_paid)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'loans' && (
            <div className="card p-0 overflow-hidden">
              {allLoans.length === 0 ? <EmptyState title="لا توجد إعارات مسجلة"/> : (
                <div className="divide-y divide-slate-50">
                  {allLoans.map(l => (
                    <div key={l.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-slate-800">{l.contract?.member?.full_name} ← {l.other_club}</div>
                        <div className="text-xs text-slate-400 mt-1">{l.from_date} إلى {l.to_date || 'مفتوح'} · تحمل الراتب: {l.salary_covered_by}</div>
                      </div>
                      <span className="text-xs font-bold rounded-lg bg-blue-50 text-blue-700 px-2 py-1">{l.loan_direction === 'out' ? 'إعارة خارجية' : 'إعارة داخلة'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'alerts' && (
            <div className="space-y-3">
              {activeContracts.filter(c => {
                const d = daysUntil(c.end_date)
                return d !== null && d >= 0 && d <= 90
              }).map(c => (
                <div key={c.id} className="card border-r-4 border-amber-500">
                  <div className="font-extrabold text-sm text-slate-800">عقد {c.member?.full_name} ينتهي قريباً</div>
                  <div className="text-xs text-slate-500 mt-1">ينتهي في {c.end_date}، متبقي {daysUntil(c.end_date)} يوم.</div>
                </div>
              ))}
              {allPayments.filter(p => ['due', 'partial', 'overdue'].includes(p.payment_status)).map(p => (
                <div key={p.id} className="card border-r-4 border-red-500">
                  <div className="font-extrabold text-sm text-slate-800">دفعة مستحقة: {p.contract?.member?.full_name}</div>
                  <div className="text-xs text-slate-500 mt-1">المتبقي {money(Number(p.amount_due || 0) - Number(p.amount_paid || 0))}، تاريخ الاستحقاق {p.due_date || 'غير محدد'}.</div>
                </div>
              ))}
              {stats.endingSoon === 0 && stats.duePayments === 0 && <div className="card"><EmptyState title="لا توجد تنبيهات حالياً"/></div>}
            </div>
          )}
        </>
      )}

      <Modal open={showContract} onClose={closeContractModal} title={editingContract ? 'تعديل عقد' : 'إضافة عقد جديد'} width="max-w-2xl">
        <div className="grid md:grid-cols-2 gap-3">
          <FormField label="فئة العقد" required>
            <select className="form-input" value={contractForm.contract_party_type} onChange={e => {
              setContractForm(p => ({
                ...p,
                contract_party_type: e.target.value,
                member_user_id: '',
                member_role: e.target.value === 'player' ? 'player' : p.member_role,
                acquisition_type: e.target.value === 'player' ? p.acquisition_type : 'other',
                contract_type: e.target.value === 'player' ? 'professional' : 'staff',
              }))
            }}>
              {Object.entries(PARTY_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="العضو" required>
            <select className="form-input" value={contractForm.member_user_id} onChange={e => {
              const member = members.find((m: any) => m.user_id === e.target.value)
              setContract('member_user_id', e.target.value)
              setContract('member_role', member?.role || 'player')
              setContract('contract_party_type', roleToParty(member?.role) === 'other' ? contractForm.contract_party_type : roleToParty(member?.role))
            }}>
              <option value="">اختر العضو</option>
              {availableMembers.map((m: any) => (
                <option key={m.id} value={m.user_id}>{m.profile?.full_name} - {ROLE_LABELS[m.role] || m.role}</option>
              ))}
            </select>
          </FormField>
          {availableMembers.length === 0 && (
            <div className="md:col-span-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs font-bold text-amber-700">
              لا يوجد أعضاء مطابقون لهذه الفئة حالياً. غيّر الفئة أو أضف العضو من صفحة الأعضاء.
            </div>
          )}
          <FormField label="نوع العقد">
            <select className="form-input" value={contractForm.contract_type} onChange={e => setContract('contract_type', e.target.value)}>
              {Object.entries(CONTRACT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="بداية العقد" required>
            <input className="form-input" type="date" value={contractForm.start_date} onChange={e => setContract('start_date', e.target.value)}/>
          </FormField>
          <FormField label="نهاية العقد">
            <input className="form-input" type="date" value={contractForm.end_date} onChange={e => setContract('end_date', e.target.value)}/>
          </FormField>
        </div>

        {isPlayerContract ? (
          <div className="mt-4">
            <div className="text-xs font-extrabold text-slate-500 mb-2">بيانات انتقال اللاعب</div>
            <div className="grid md:grid-cols-2 gap-3">
          <FormField label="طريقة التعاقد للاعب">
            <select className="form-input" value={contractForm.acquisition_type} onChange={e => setContract('acquisition_type', e.target.value)}>
              {Object.entries(ACQUISITION_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="النادي السابق">
            <input className="form-input" value={contractForm.previous_club} onChange={e => setContract('previous_club', e.target.value)}/>
          </FormField>
          <FormField label="قيمة الشراء / الانتقال">
            <input className="form-input" type="number" value={contractForm.transfer_fee} onChange={e => setContract('transfer_fee', e.target.value)}/>
          </FormField>
          <FormField label="الشرط الجزائي">
            <input className="form-input" type="number" value={contractForm.release_clause} onChange={e => setContract('release_clause', e.target.value)}/>
          </FormField>
          <FormField label="اسم الوكيل">
            <input className="form-input" value={contractForm.agent_name} onChange={e => setContract('agent_name', e.target.value)}/>
          </FormField>
          <FormField label="رقم الوكيل">
            <input className="form-input" value={contractForm.agent_phone} onChange={e => setContract('agent_phone', e.target.value)}/>
          </FormField>
          <FormField label="نسبة بيع مستقبلية %">
            <input className="form-input" type="number" value={contractForm.sell_on_percentage} onChange={e => setContract('sell_on_percentage', e.target.value)}/>
          </FormField>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="text-xs font-extrabold text-slate-500 mb-2">بيانات الوظيفة</div>
            <div className="grid md:grid-cols-2 gap-3">
          <FormField label="المسمى الوظيفي">
            <div className="flex gap-2">
              <select className="form-input flex-1" value={contractForm.job_title_id} onChange={e => {
                const job = jobTitles.find((j: any) => j.id === e.target.value)
                setContract('job_title_id', e.target.value)
                setContract('job_title', job?.name || '')
              }}>
                <option value="">اختر وظيفة</option>
                {jobTitles.map((j: any) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              <button type="button" className="btn btn-ghost btn-sm flex-shrink-0" onClick={() => setShowJobTitle(true)}>
                <Plus size={13}/> وظيفة
              </button>
            </div>
          </FormField>
          <FormField label="نوع الوظيفة">
            <select className="form-input" value={contractForm.work_type} onChange={e => setContract('work_type', e.target.value)}>
              {Object.entries(WORK_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
          {selectedJobTitle()?.description && (
            <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              <span className="font-bold text-slate-700">وصف الوظيفة: </span>{selectedJobTitle().description}
            </div>
          )}
          <FormField label="القسم">
            <input className="form-input" value={contractForm.department} onChange={e => setContract('department', e.target.value)}/>
          </FormField>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <FormField label="الراتب الشهري">
            <input className="form-input" type="number" value={contractForm.monthly_salary} onChange={e => setContract('monthly_salary', e.target.value)}/>
          </FormField>
          <FormField label="قيمة العقد الإجمالية">
            <input className="form-input bg-slate-50" type="number" value={contractForm.total_value} readOnly/>
            <div className="text-[11px] font-bold text-slate-400 mt-1">
              تحسب آليًا من مدة العقد والراتب الأساسي فقط بدون أي إضافات أو امتيازات.
            </div>
          </FormField>
          <FormField label="يوم صرف الراتب">
            <input className="form-input" type="number" min={1} max={31} value={contractForm.payment_day} onChange={e => setContract('payment_day', e.target.value)}/>
          </FormField>
          <FormField label="طريقة الدفع">
            <select className="form-input" value={contractForm.payment_method} onChange={e => setContract('payment_method', e.target.value)}>
              <option value="">اختر طريقة الدفع</option>
              {Object.entries(PAYMENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="المكافآت والامتيازات">
          <div className="grid md:grid-cols-2 gap-2">
            {BENEFIT_OPTIONS.map(b => {
              const active = contractForm.benefit_keys.includes(b.key)
              return (
                <div key={b.key} className={cn(
                  'rounded-xl border p-2 transition-colors',
                  active ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-100'
                )}>
                  <button type="button" onClick={() => toggleBenefit(b.key)}
                    className={cn(
                      'w-full text-xs font-bold text-right transition-colors',
                      active ? 'text-teal-700' : 'text-slate-500 hover:text-slate-700'
                    )}>
                    {b.label}
                  </button>
                  {active && (
                    <input
                      className="form-input mt-2 text-xs"
                      value={contractForm.benefit_details[b.key] || ''}
                      onChange={e => setBenefitDetail(b.key, e.target.value)}
                      placeholder="اكتب مبلغ أو وصف الخدمة المقدمة"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </FormField>
        <FormField label="بنود إضافية">
          <textarea className="form-input min-h-[80px]" value={contractForm.custom_benefits_text} onChange={e => setContract('custom_benefits_text', e.target.value)} placeholder="أي امتياز أو بند غير موجود في الخيارات، اكتب كل بند في سطر"/>
        </FormField>
        <FormField label="ملاحظات">
          <textarea className="form-input min-h-[80px]" value={contractForm.notes} onChange={e => setContract('notes', e.target.value)}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={closeContractModal}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveContract} disabled={saving || !contractForm.member_user_id || !contractForm.start_date}>
            {saving ? <Spinner size="sm"/> : editingContract ? 'حفظ التعديل' : 'حفظ العقد'}
          </button>
        </div>
      </Modal>

      <Modal open={showJobTitle} onClose={() => setShowJobTitle(false)} title="إضافة وظيفة">
        <FormField label="اسم الوظيفة" required>
          <input className="form-input" value={jobForm.name} onChange={e => setJobForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: مدرب حراس، أخصائي علاج، مدير عمليات"/>
        </FormField>
        <FormField label="وصف الوظيفة">
          <textarea className="form-input min-h-[110px]" value={jobForm.description} onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))} placeholder="اكتب المهام أو نطاق العمل لهذه الوظيفة"/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowJobTitle(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveJobTitle} disabled={saving || !jobForm.name.trim()}>
            {saving ? <Spinner size="sm"/> : 'حفظ الوظيفة'}
          </button>
        </div>
      </Modal>

      <Modal open={!!showPayment} onClose={() => setShowPayment(null)} title="إضافة دفعة / راتب">
        <FormField label="نوع الدفعة">
          <select className="form-input" value={paymentForm.payment_type} onChange={e => setPaymentForm(p => ({ ...p, payment_type: e.target.value }))}>
            {Object.entries(PAYMENT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="الفترة">
            <input className="form-input" value={paymentForm.period_label} onChange={e => setPaymentForm(p => ({ ...p, period_label: e.target.value }))} placeholder="راتب مايو"/>
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            <input className="form-input" type="date" value={paymentForm.due_date} onChange={e => setPaymentForm(p => ({ ...p, due_date: e.target.value }))}/>
          </FormField>
          <FormField label="المبلغ المستحق">
            <input className="form-input" type="number" value={paymentForm.amount_due} onChange={e => setPaymentForm(p => ({ ...p, amount_due: e.target.value }))}/>
          </FormField>
          <FormField label="المدفوع">
            <input className="form-input" type="number" value={paymentForm.amount_paid} onChange={e => setPaymentForm(p => ({ ...p, amount_paid: e.target.value }))}/>
          </FormField>
        </div>
        <FormField label="ملاحظات">
          <textarea className="form-input" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowPayment(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={savePayment} disabled={saving || !paymentForm.amount_due}>{saving ? <Spinner size="sm"/> : 'حفظ الدفعة'}</button>
        </div>
      </Modal>

      <Modal open={!!showLoan} onClose={() => setShowLoan(null)} title="تسجيل إعارة لاعب">
        <FormField label="النادي الآخر" required>
          <input className="form-input" value={loanForm.other_club} onChange={e => setLoanForm(p => ({ ...p, other_club: e.target.value }))}/>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="نوع الإعارة">
            <select className="form-input" value={loanForm.loan_direction} onChange={e => setLoanForm(p => ({ ...p, loan_direction: e.target.value }))}>
              <option value="out">إعارة لفريق آخر</option>
              <option value="in">إعارة من فريق آخر</option>
            </select>
          </FormField>
          <FormField label="تحمل الراتب">
            <select className="form-input" value={loanForm.salary_covered_by} onChange={e => setLoanForm(p => ({ ...p, salary_covered_by: e.target.value }))}>
              <option value="team">الفريق</option>
              <option value="other_club">النادي الآخر</option>
              <option value="shared">مشترك</option>
            </select>
          </FormField>
          <FormField label="من تاريخ">
            <input className="form-input" type="date" value={loanForm.from_date} onChange={e => setLoanForm(p => ({ ...p, from_date: e.target.value }))}/>
          </FormField>
          <FormField label="إلى تاريخ">
            <input className="form-input" type="date" value={loanForm.to_date} onChange={e => setLoanForm(p => ({ ...p, to_date: e.target.value }))}/>
          </FormField>
          <FormField label="نسبة تحمل الراتب">
            <input className="form-input" type="number" value={loanForm.salary_coverage_percentage} onChange={e => setLoanForm(p => ({ ...p, salary_coverage_percentage: e.target.value }))}/>
          </FormField>
          <FormField label="قيمة خيار الشراء">
            <input className="form-input" type="number" value={loanForm.buy_option_amount} onChange={e => setLoanForm(p => ({ ...p, buy_option_amount: e.target.value, has_buy_option: Number(e.target.value) > 0 }))}/>
          </FormField>
        </div>
        <FormField label="ملاحظات">
          <textarea className="form-input" value={loanForm.notes} onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowLoan(null)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveLoan} disabled={saving || !loanForm.other_club.trim()}>{saving ? <Spinner size="sm"/> : 'حفظ الإعارة'}</button>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="حذف عقد">
        <p className="text-sm text-slate-600 mb-4">هل تريد حذف عقد {confirmDelete?.member?.full_name}؟ سيتم حذف البنود والدفعات والإعارات المرتبطة به.</p>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>إلغاء</button>
          <button className="btn btn-danger" onClick={deleteContract} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حذف'}</button>
        </div>
      </Modal>
    </div>
  )
}
