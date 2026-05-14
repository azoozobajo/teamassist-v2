import { EventType, UserRole } from '../types/database'

export const cn = (...cls: (string | undefined | false | null)[]) => cls.filter(Boolean).join(' ')

export const formatDate = (d: string) => {
  const date = new Date(d)
  const day = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][date.getDay()]
  return `${day}، ${date.toLocaleDateString('ar-SA')}`
}
export const formatDateTime = (d: string) => new Date(d).toLocaleString('ar-SA')
export const formatTime = (d: string) => d.slice(11, 16)

export const formatTimeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  const days = Math.floor(h / 24)
  return `منذ ${days} يوم`
}

export const getInitials = (name: string) => {
  const p = name.trim().split(' ')
  return p.length >= 2 ? p[0][0] + p[1][0] : p[0].slice(0, 2)
}

export const generateCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase()

// Permissions
export const isOwner = (role: string) => role === 'owner'
export const isAdmin = (role: string) => ['owner', 'administrator'].includes(role)
export const isCoach = (role: string) => ['owner', 'head_coach', 'assistant_coach', 'administrator'].includes(role)
export const canManageTeam = (role: string) => ['owner', 'administrator'].includes(role)
export const canManageEvents = (role: string) => ['owner', 'head_coach', 'assistant_coach', 'administrator'].includes(role)
export const canManageFinance = (role: string) => ['owner', 'administrator', 'head_coach'].includes(role)
export const canViewReports = (role: string) => ['owner', 'head_coach', 'assistant_coach', 'administrator'].includes(role)
export const isParent = (role: string) => role === 'parent'

// Labels
export const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك', head_coach: 'مدرب رئيسي',
  assistant_coach: 'مساعد مدرب', player: 'لاعب',
  administrator: 'إداري', media: 'إعلام',
  medical: 'طبي', parent: 'ولي أمر', guest: 'ضيف'
}

export const ROLE_COLORS: Record<string, string> = {
  owner: 'badge-green', head_coach: 'badge-blue',
  assistant_coach: 'badge-blue', player: 'badge-gray',
  administrator: 'badge-purple', media: 'badge-amber',
  medical: 'badge-red', parent: 'badge-amber', guest: 'badge-gray'
}

export const EVENT_CONFIG: Record<EventType, { label: string; color: string; bg: string; icon: string; borderClass: string }> = {
  training: { label: 'تدريب', color: '#1D9E75', bg: '#E1F5EE', icon: '⚽', borderClass: 'border-emerald-500' },
  match:    { label: 'مباراة', color: '#1E40AF', bg: '#DBEAFE', icon: '🏆', borderClass: 'border-blue-600' },
  meeting:  { label: 'اجتماع', color: '#92400E', bg: '#FEF3C7', icon: '📋', borderClass: 'border-amber-600' },
  camp:     { label: 'معسكر',  color: '#6D28D9', bg: '#EDE9FE', icon: '🏕️', borderClass: 'border-purple-600' },
  other:    { label: 'أخرى',   color: '#475569', bg: '#F1F5F9', icon: '📌', borderClass: 'border-slate-500' }
}

export const ATT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  present:  { label: 'حاضر',       color: '#065F46', bg: '#D1FAE5', icon: '✓' },
  absent:   { label: 'غائب',       color: '#991B1B', bg: '#FEE2E2', icon: '✗' },
  uncertain:{ label: 'غير متأكد', color: '#92400E', bg: '#FEF3C7', icon: '?' },
  late:     { label: 'متأخر',      color: '#9A3412', bg: '#FFEDD5', icon: '⏱' }
}

export const POINT_CATEGORIES = ['مكافأة', 'تطور', 'تعاون', 'مبادرة', 'أداء', 'نتائج'] as const
export const DEDUCTION_REASONS = ['سوء سلوك', 'اعتداء', 'غياب بدون عذر', 'تأخر متكرر', 'مخالفة النظام', 'عدم الالتزام'] as const
export const EXPENSE_CATEGORIES = ['معدات وكور', 'ملابس وزي', 'مياه وتغذية', 'مواصلات', 'سكن وفندق', 'طيران', 'أكل ووجبات', 'رسوم وتسجيل', 'رواتب', 'إيجار', 'فاتورة ماء', 'فاتورة كهرباء', 'فاتورة اتصالات', 'فاتورة انترنت', 'أخرى'] as const
export const REPORT_TAGS = ['إصابة', 'مشكلة', 'مكافأة', 'موقف', 'إنجاز', 'تغيير', 'ملاحظة', 'طارئ'] as const
export const NOTE_TYPES = ['مدح', 'توجيه', 'تحذير', 'تطوير'] as const
export const SPORT_TYPES = ['كرة القدم', 'كرة السلة', 'كرة الطائرة', 'السباحة', 'التنس', 'الجري', 'أخرى']
export const SAUDI_CITIES = ['جدة', 'الرياض', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'تبوك', 'أبها', 'القصيم']
export const AGE_CATEGORIES = ['فريق أول', 'تحت 23', 'تحت 21', 'تحت 19', 'تحت 18', 'تحت 17', 'تحت 16', 'تحت 15', 'تحت 14', 'تحت 13', 'تحت 12', 'تحت 11', 'تحت 10', 'تحت 9']
export const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// Saudi Riyal new symbol
export const RIYAL = '﷼'

export const isEventLocked = (startDatetime: string): boolean => {
  return new Date(startDatetime) <= new Date()
}

// ── PERMISSIONS ────────────────────────────────────────────────────────
export const PERMISSIONS = [
  { key: 'view_attendance',      label: 'عرض الحضور والغياب' },
  { key: 'manage_attendance',    label: 'تعديل الحضور والغياب' },
  { key: 'add_training',         label: 'إضافة مواعيد التدريب' },
  { key: 'add_matches',          label: 'إضافة المباريات' },
  { key: 'add_tournaments',      label: 'إضافة البطولات' },
  { key: 'view_reports',         label: 'عرض التقارير السرية' },
  { key: 'add_reports',          label: 'إضافة تقارير سرية' },
  { key: 'manage_leaves',        label: 'الموافقة على الإجازات' },
  { key: 'invite_members',       label: 'دعوة أعضاء وقبولهم' },
  { key: 'grant_points',         label: 'منح النقاط' },
  { key: 'manage_points_system', label: 'إدارة نظام النقاط' },
  { key: 'manage_finance_add',      label: 'إضافة الالتزامات المالية' },
  { key: 'manage_finance_pay',      label: 'تسجيل المدفوعات' },
  { key: 'view_team_expenses',       label: 'عرض مصاريف الفريق وكشف الحساب' },
  { key: 'manage_team_expenses',    label: 'إدارة مصاريف الفريق' },
  { key: 'make_announcements',      label: 'نشر الإعلانات والتذكيرات' },
  { key: 'manage_permissions',      label: 'إدارة صلاحيات الأعضاء' },
  { key: 'view_parent_chat',        label: 'رؤية شات أولياء الأمور' },
  { key: 'view_medical',            label: 'عرض التقارير الطبية (طبيب)' },
  { key: 'manage_medical',          label: 'إدارة التقارير الطبية (طبيب)' },
] as const

export type PermissionKey = typeof PERMISSIONS[number]['key']

// Owner always has all permissions
export function hasPermission(
  perms: string[],
  role: string,
  perm: PermissionKey
): boolean {
  if (role === 'owner') return true
  return perms.includes(perm)
}
