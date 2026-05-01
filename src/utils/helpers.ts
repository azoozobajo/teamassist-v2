import { EventType, UserRole } from '../types/database'

export const cn = (...cls: (string | undefined | false | null)[]) => cls.filter(Boolean).join(' ')

export const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-SA')
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
export const canManageFinance = (role: string) => ['owner', 'administrator'].includes(role)
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
export const REPORT_TAGS = ['إصابة', 'مشكلة', 'مكافأة', 'موقف', 'إنجاز', 'تغيير', 'ملاحظة', 'طارئ'] as const
export const NOTE_TYPES = ['مدح', 'توجيه', 'تحذير', 'تطوير'] as const
export const SPORT_TYPES = ['كرة القدم', 'كرة السلة', 'كرة الطائرة', 'السباحة', 'التنس', 'الجري', 'أخرى']
export const SAUDI_CITIES = ['جدة', 'الرياض', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'تبوك', 'أبها', 'القصيم']
export const AGE_CATEGORIES = ['تحت 10', 'تحت 12', 'تحت 14', 'تحت 16', 'تحت 18', 'تحت 21', 'كبار', 'مختلط']
export const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// Saudi Riyal new symbol
export const RIYAL = '﷼'

export const isEventLocked = (startDatetime: string): boolean => {
  return new Date(startDatetime) <= new Date()
}
