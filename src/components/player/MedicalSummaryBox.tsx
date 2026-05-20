import React from 'react'
import { Activity, AlertTriangle, ShieldCheck, Stethoscope } from 'lucide-react'

type MedicalCase = {
  id: string
  case_type?: string | null
  status?: string | null
  severity?: string | null
  onset_date?: string | null
  expected_return_date?: string | null
  actual_return_date?: string | null
  absence_days?: number | null
  is_recurrence?: boolean | null
  body_region?: string | null
  body_side?: string | null
  body_location?: string | null
  tissue_type?: string | null
  detailed_diagnosis?: string | null
  illness_type?: string | null
  notes?: string | null
  created_at?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  active: 'نشط',
  monitoring: 'تحت المراقبة',
  recovered: 'متعاف',
}

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-red-50 text-red-700 border-red-100',
  monitoring: 'bg-amber-50 text-amber-700 border-amber-100',
  recovered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
}

const SEVERITY_LABEL: Record<string, string> = {
  minimal: 'بسيطة جدًا',
  mild: 'بسيطة',
  moderate: 'متوسطة',
  severe: 'شديدة',
  very_severe: 'شديدة جدًا',
}

const BODY_REGION_LABEL: Record<string, string> = {
  head_face: 'الرأس والوجه',
  neck: 'الرقبة',
  shoulder: 'الكتف',
  upper_arm: 'الذراع',
  elbow: 'الكوع',
  forearm: 'الساعد',
  wrist: 'الرسغ',
  hand_fingers: 'اليد والأصابع',
  chest: 'الصدر',
  back: 'الظهر',
  abdomen: 'البطن',
  pelvis: 'الحوض',
  hip: 'الورك',
  adductors: 'العضلة الضامة',
  quadriceps: 'الفخذ الأمامي',
  hamstrings: 'الفخذ الخلفي',
  knee: 'الركبة',
  lower_leg: 'الساق',
  achilles: 'وتر أخيل',
  ankle: 'الكاحل',
  foot: 'القدم',
  toes: 'أصابع القدم',
  femur: 'عظمة الفخذ',
  other_region: 'أخرى',
}

const TISSUE_LABEL: Record<string, string> = {
  muscle: 'عضلية',
  tendon: 'وترية',
  ligament: 'رباطية',
  joint: 'مفصلية',
  bone: 'عظمية',
  cartilage: 'غضروفية',
  nerve: 'عصبية',
  skin: 'جلدية',
  concussion: 'ارتجاج',
  contusion: 'كدمة',
  inflammation: 'التهاب',
  overload: 'حمل زائد',
  unknown: 'غير محددة',
  other: 'أخرى',
}

const ILLNESS_LABEL: Record<string, string> = {
  flu: 'إنفلونزا',
  fever: 'حمى',
  stomach: 'مشكلة هضمية',
  respiratory: 'تنفسية',
  infection: 'عدوى',
  other: 'مرض آخر',
}

function labelOf(map: Record<string, string>, value?: string | null, fallback = 'غير محدد') {
  if (!value) return fallback
  return map[value] || value
}

function fmtDate(date?: string | null) {
  if (!date) return 'غير محدد'
  return new Date(date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function countTop(cases: MedicalCase[], key: keyof MedicalCase) {
  const counts = cases.reduce((acc: Record<string, number>, item) => {
    const value = item[key]
    if (typeof value !== 'string' || !value) return acc
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null
}

function describeCase(item?: MedicalCase | null) {
  if (!item) return 'لا توجد حالة حالية'
  if (item.case_type === 'illness') return labelOf(ILLNESS_LABEL, item.illness_type, 'مرض')
  const region = labelOf(BODY_REGION_LABEL, item.body_region, 'إصابة')
  const tissue = item.tissue_type ? labelOf(TISSUE_LABEL, item.tissue_type) : ''
  return [region, tissue].filter(Boolean).join(' - ')
}

function SummaryTile({ label, value, hint, className = 'bg-slate-50 text-slate-700 border-slate-100' }: {
  label: string
  value: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${className}`}>
      <div className="text-xl font-extrabold leading-none tabular-nums">{value}</div>
      <div className="text-[11px] font-bold opacity-75 mt-1">{label}</div>
      {hint && <div className="text-[10px] opacity-70 mt-0.5 truncate">{hint}</div>}
    </div>
  )
}

export function MedicalSummaryBox({ cases }: { cases: MedicalCase[] }) {
  const sorted = [...cases].sort((a, b) =>
    new Date(b.onset_date || b.created_at || '').getTime() - new Date(a.onset_date || a.created_at || '').getTime()
  )
  const injuries = cases.filter(c => c.case_type === 'injury')
  const illnesses = cases.filter(c => c.case_type === 'illness')
  const active = cases.filter(c => c.status === 'active')
  const monitoring = cases.filter(c => c.status === 'monitoring')
  const recovered = cases.filter(c => c.status === 'recovered')
  const current = active[0] || monitoring[0] || null
  const latest = sorted[0] || null
  const absenceDays = cases.reduce((sum, item) => sum + (Number(item.absence_days) || 0), 0)
  const recurrences = injuries.filter(c => c.is_recurrence).length
  const topRegion = countTop(injuries, 'body_region')
  const topTissue = countTop(injuries, 'tissue_type')
  const topDiagnosis = countTop(injuries, 'detailed_diagnosis')

  const riskLevel = active.some(c => c.severity === 'severe' || c.severity === 'very_severe') || recurrences >= 2 || absenceDays >= 30
    ? { label: 'مرتفع', className: 'bg-red-50 text-red-700 border-red-100', icon: <AlertTriangle size={16}/> }
    : active.length > 0 || monitoring.length > 0 || recurrences > 0 || absenceDays >= 10
      ? { label: 'متوسط', className: 'bg-amber-50 text-amber-700 border-amber-100', icon: <Activity size={16}/> }
      : { label: 'منخفض', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <ShieldCheck size={16}/> }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">ملخص الحالة الطبية</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">قراءة سريعة لوضع اللاعب طوال الموسم</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
          <Stethoscope size={17}/>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className={`rounded-xl border p-3 ${current ? STATUS_CLASS[current.status || 'active'] : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold opacity-75">الحالة الحالية</div>
              <div className="text-base font-extrabold mt-0.5">
                {current ? `${STATUS_LABEL[current.status || 'active'] || 'نشط'} - ${describeCase(current)}` : 'متاح للمشاركة'}
              </div>
              <div className="text-[11px] opacity-75 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {current?.onset_date && <span>منذ {fmtDate(current.onset_date)}</span>}
                {current?.expected_return_date && <span>عودة متوقعة {fmtDate(current.expected_return_date)}</span>}
                {current?.is_recurrence && <span>حالة متكررة</span>}
              </div>
            </div>
            <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${riskLevel.className}`}>
              {riskLevel.icon}
              خطر {riskLevel.label}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="الحالات" value={cases.length} className="bg-slate-900 text-white border-slate-900"/>
          <SummaryTile label="الإصابات" value={injuries.length} className="bg-orange-50 text-orange-700 border-orange-100"/>
          <SummaryTile label="الأمراض" value={illnesses.length} className="bg-blue-50 text-blue-700 border-blue-100"/>
          <SummaryTile label="أيام الغياب" value={absenceDays} className="bg-red-50 text-red-700 border-red-100"/>
          <SummaryTile label="نشط" value={active.length} className="bg-red-50 text-red-700 border-red-100"/>
          <SummaryTile label="مراقبة" value={monitoring.length} className="bg-amber-50 text-amber-700 border-amber-100"/>
          <SummaryTile label="متعاف" value={recovered.length} className="bg-emerald-50 text-emerald-700 border-emerald-100"/>
          <SummaryTile label="تكرار" value={recurrences} className="bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100"/>
        </div>

        {latest && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="text-[11px] font-bold text-slate-400">آخر حالة مسجلة</div>
            <div className="text-sm font-extrabold text-slate-800 mt-0.5">{describeCase(latest)}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>{fmtDate(latest.onset_date || latest.created_at)}</span>
              <span>{SEVERITY_LABEL[latest.severity || ''] || 'شدة غير محددة'}</span>
              <span>{STATUS_LABEL[latest.status || ''] || 'حالة غير محددة'}</span>
              {(latest.absence_days || 0) > 0 && <span>{latest.absence_days} يوم غياب</span>}
            </div>
          </div>
        )}

        {injuries.length >= 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <SummaryTile
              label="أكثر منطقة"
              value={topRegion ? labelOf(BODY_REGION_LABEL, topRegion[0]) : '—'}
              hint={topRegion ? `${topRegion[1]} مرة` : undefined}
            />
            <SummaryTile
              label="أكثر نوع"
              value={topTissue ? labelOf(TISSUE_LABEL, topTissue[0]) : '—'}
              hint={topTissue ? `${topTissue[1]} مرة` : undefined}
            />
            <SummaryTile
              label="أكثر تشخيص"
              value={topDiagnosis ? topDiagnosis[0] : '—'}
              hint={topDiagnosis ? `${topDiagnosis[1]} مرة` : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
