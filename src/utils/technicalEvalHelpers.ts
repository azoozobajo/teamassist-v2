// ── TYPES ─────────────────────────────────────────────────────────────

export type IndicatorCategory = 'technical' | 'tactical_attack' | 'tactical_defense' | 'decision' | 'mental' | 'behavior'
export type IndicatorType = 'strength' | 'development'
export type Priority = 'high' | 'medium' | 'low'
export type ReviewType = 'training' | 'match' | 'monthly' | 'mid_season' | 'end_season'

export interface ReviewRow {
  id: string
  indicator_id: string
  review_date: string
  review_type: ReviewType
  score: number
  note: string
  evidence: string
  next_action: string | null
  reviewed_by: string | null
  deleted_at: string | null
  created_at: string
}

export interface IndicatorRow {
  id: string
  team_id: string
  player_id: string
  season: string
  indicator_name: string
  indicator_type: IndicatorType
  category: IndicatorCategory
  custom_indicator: boolean
  start_score: number
  current_score: number
  priority: Priority
  start_note: string
  evidence: string
  next_action: string | null
  created_by: string | null
  created_at: string
  deleted_at: string | null
  reviews?: ReviewRow[]
}

export interface EvalSettings {
  show_overall_score: boolean
  show_strength_average: boolean
  show_development_average: boolean
  minimum_indicators_for_overall_score: number
  require_note_for_score: boolean
  require_evidence_for_indicator: boolean
  allow_coach_to_hide_overall_score: boolean
}

// ── LABELS & LIBRARY ──────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  technical: 'فني',
  tactical_attack: 'تكتيكي هجومي',
  tactical_defense: 'تكتيكي دفاعي',
  decision: 'قرار',
  mental: 'ذهني',
  behavior: 'سلوكي داخل اللعب',
}

export const CATEGORY_COLORS: Record<IndicatorCategory, string> = {
  technical: 'bg-blue-100 text-blue-700',
  tactical_attack: 'bg-orange-100 text-orange-700',
  tactical_defense: 'bg-purple-100 text-purple-700',
  decision: 'bg-yellow-100 text-yellow-800',
  mental: 'bg-green-100 text-green-700',
  behavior: 'bg-pink-100 text-pink-700',
}

export const INDICATOR_TYPE_LABELS: Record<IndicatorType, string> = {
  strength: 'مؤشر قوة',
  development: 'مؤشر تطوير',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'عالية',
  medium: 'متوسطة',
  low: 'منخفضة',
}

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  training: 'تدريب',
  match: 'مباراة',
  monthly: 'مراجعة شهرية',
  mid_season: 'منتصف الموسم',
  end_season: 'نهاية الموسم',
}

export const RECOMMENDATION_OPTIONS = [
  'يبقى',
  'يبقى مع خطة تطوير',
  'يحتاج فرصة إضافية',
  'مناسب للتصعيد',
  'ينتقل لمركز آخر',
  'ينتقل لفئة أو مستوى أنسب',
  'يغادر بعد مراجعة فنية',
]

export const DEFAULT_EVAL_SETTINGS: EvalSettings = {
  show_overall_score: true,
  show_strength_average: true,
  show_development_average: true,
  minimum_indicators_for_overall_score: 5,
  require_note_for_score: true,
  require_evidence_for_indicator: true,
  allow_coach_to_hide_overall_score: true,
}

export const INDICATOR_LIBRARY: Record<IndicatorCategory, string[]> = {
  technical: [
    'الاستلام الموجه',
    'التحكم بالكرة',
    'التمرير القصير',
    'التمرير الطويل',
    'التمرير للعمق',
    'المراوغة',
    'التسديد',
    'العرضيات',
    'اللعب بالقدم الضعيفة',
    'الضربات الرأسية',
    'التعامل مع الكرة تحت الضغط',
    'جودة اللمسة الأولى',
  ],
  tactical_attack: [
    'التمركز بين الخطوط',
    'خلق زاوية تمرير',
    'الدخول للعمق',
    'التحرك بدون كرة',
    'توقيت الانطلاق',
    'دعم حامل الكرة',
    'التحول الهجومي',
    'اللعب تحت الضغط',
    'استغلال المساحات',
    'صناعة الفرص',
  ],
  tactical_defense: [
    'الضغط على حامل الكرة',
    'الضغط بعد الفقدان',
    'إغلاق خطوط التمرير',
    'التغطية',
    'التمركز خلف الكرة',
    'الدفاع 1 ضد 1',
    'الرقابة',
    'التعامل مع الكرات العرضية',
    'التحول من الهجوم إلى الدفاع',
    'العمل الدفاعي الجماعي',
  ],
  decision: [
    'سرعة اتخاذ القرار',
    'اختيار وقت التمرير',
    'اختيار وقت المراوغة',
    'اختيار وقت التسديد',
    'القرار في الثلث الأخير',
    'اللعب للأمام عند توفر الفرصة',
    'تغيير جهة اللعب',
    'اختيار الحل تحت الضغط',
    'تقليل القرارات الخاطئة',
  ],
  mental: [
    'التركيز',
    'ردة الفعل بعد الخطأ',
    'الشجاعة في طلب الكرة',
    'الهدوء تحت الضغط',
    'الثقة بالنفس',
    'الاستمرارية',
    'التعامل مع الضغط',
  ],
  behavior: [
    'التواصل داخل الملعب',
    'الالتزام بالدور',
    'التعاون مع الزملاء',
    'الاستجابة لتوجيهات المدرب',
    'القيادة داخل الملعب',
    'الانضباط أثناء اللعب',
    'احترام أدوار الفريق',
  ],
}

// ── SEASON HELPERS ────────────────────────────────────────────────────

export function getCurrentSeason(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

export function getSeasonOptions(): string[] {
  const current = getCurrentSeason()
  const [y1] = current.split('/').map(Number)
  return [
    `${y1 + 1}/${y1 + 2}`,
    current,
    `${y1 - 1}/${y1}`,
    `${y1 - 2}/${y1 - 1}`,
  ]
}

// ── CALCULATION FUNCTIONS ─────────────────────────────────────────────

export function getActiveIndicators(indicators: IndicatorRow[]): IndicatorRow[] {
  return indicators.filter(i => !i.deleted_at)
}

export function calcStrengthAvg(indicators: IndicatorRow[]): number | null {
  const active = getActiveIndicators(indicators).filter(i => i.indicator_type === 'strength')
  if (!active.length) return null
  return active.reduce((s, i) => s + i.current_score, 0) / active.length
}

export function calcDevAvg(indicators: IndicatorRow[]): number | null {
  const active = getActiveIndicators(indicators).filter(i => i.indicator_type === 'development')
  if (!active.length) return null
  return active.reduce((s, i) => s + i.current_score, 0) / active.length
}

export function calcOverallAvg(indicators: IndicatorRow[], minCount: number): number | null {
  const active = getActiveIndicators(indicators)
  if (active.length < minCount) return null
  return active.reduce((s, i) => s + i.current_score, 0) / active.length
}

export function calcImprovementRate(indicators: IndicatorRow[]): number | null {
  const active = getActiveIndicators(indicators)
  if (!active.length) return null
  return active.reduce((s, i) => s + (i.current_score - i.start_score), 0) / active.length
}

export function calcIndicatorDiff(indicator: IndicatorRow): number {
  return indicator.current_score - indicator.start_score
}

export function getStatusLabel(diff: number): string {
  if (diff >= 3) return 'تحسن واضح'
  if (diff >= 1) return 'تحسن متوسط'
  if (diff === 0) return 'ثابت'
  return 'تراجع'
}

export function getStatusColorClass(diff: number): string {
  if (diff >= 3) return 'text-emerald-600 bg-emerald-50'
  if (diff >= 1) return 'text-blue-600 bg-blue-50'
  if (diff === 0) return 'text-slate-500 bg-slate-50'
  return 'text-red-500 bg-red-50'
}

export function getTopStrengths(indicators: IndicatorRow[], limit = 5): IndicatorRow[] {
  return [...getActiveIndicators(indicators)]
    .sort((a, b) => b.current_score - a.current_score)
    .slice(0, limit)
}

export function getMostImproved(indicators: IndicatorRow[], limit = 5): (IndicatorRow & { diff: number })[] {
  return [...getActiveIndicators(indicators)]
    .map(i => ({ ...i, diff: i.current_score - i.start_score }))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, limit)
}

export function getDeclined(indicators: IndicatorRow[]): IndicatorRow[] {
  return getActiveIndicators(indicators).filter(i => i.current_score < i.start_score)
}

export function getRemainingDev(indicators: IndicatorRow[], limit = 5): IndicatorRow[] {
  return [...getActiveIndicators(indicators).filter(i => i.indicator_type === 'development')]
    .sort((a, b) => a.current_score - b.current_score)
    .slice(0, limit)
}

export function getLastReviewDate(indicators: IndicatorRow[]): string | null {
  const dates = getActiveIndicators(indicators)
    .flatMap(i => (i.reviews ?? []).filter(r => !r.deleted_at).map(r => r.review_date))
  if (!dates.length) return null
  return dates.sort().reverse()[0]
}

export function getMostImprovedSingle(indicators: IndicatorRow[]): IndicatorRow | null {
  const active = getActiveIndicators(indicators)
  if (!active.length) return null
  return active.reduce((best, curr) =>
    (curr.current_score - curr.start_score) > (best.current_score - best.start_score) ? curr : best
  )
}

export function getMostDeclinedSingle(indicators: IndicatorRow[]): IndicatorRow | null {
  const declined = getDeclined(indicators)
  if (!declined.length) return null
  return declined.reduce((worst, curr) =>
    (curr.current_score - curr.start_score) < (worst.current_score - worst.start_score) ? curr : worst
  )
}

export function fmtScore(score: number | null, decimals = 1): string {
  if (score === null || score === undefined) return '—'
  return score.toFixed(decimals)
}

export function formatReviewDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('ar-SA')
  } catch {
    return d
  }
}

// Builds sparkline data for a single indicator across its reviews
export function buildIndicatorSparkline(indicator: IndicatorRow): number[] {
  const activeReviews = (indicator.reviews ?? [])
    .filter(r => !r.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const points = [indicator.start_score, ...activeReviews.map(r => r.score)]
  return points
}
