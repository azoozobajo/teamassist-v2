export const METRIC_KEYS = [
  'standing_height_cm',
  'sitting_height_cm',
  'weight_kg',
  'body_fat_percent',
  'body_fat_mass_kg',
  'muscle_percent',
  'muscle_mass_kg',
] as const

export type MetricKey = typeof METRIC_KEYS[number]

export const METRIC_LABELS: Record<MetricKey, string> = {
  standing_height_cm: 'الطول واقفًا',
  sitting_height_cm: 'الطول جالسًا',
  weight_kg: 'الوزن',
  body_fat_percent: 'نسبة الدهون',
  body_fat_mass_kg: 'كتلة الدهون',
  muscle_percent: 'نسبة العضل',
  muscle_mass_kg: 'كتلة العضل',
}

export const METRIC_UNITS: Record<MetricKey, string> = {
  standing_height_cm: 'سم',
  sitting_height_cm: 'سم',
  weight_kg: 'كغ',
  body_fat_percent: '%',
  body_fat_mass_kg: 'كغ',
  muscle_percent: '%',
  muscle_mass_kg: 'كغ',
}

// Unusual value ranges — show warning but don't block
export const METRIC_UNUSUAL_RANGES: Record<MetricKey, { min: number; max: number }> = {
  standing_height_cm: { min: 80, max: 230 },
  sitting_height_cm: { min: 40, max: 130 },
  weight_kg: { min: 20, max: 180 },
  body_fat_percent: { min: 1, max: 60 },
  body_fat_mass_kg: { min: 0.5, max: 100 },
  muscle_percent: { min: 1, max: 80 },
  muscle_mass_kg: { min: 1, max: 120 },
}

export function calculateBMI(weightKg: number | null, standingHeightCm: number | null): number | null {
  if (!weightKg || !standingHeightCm) return null
  const h = standingHeightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

export function calculateLegLength(standingHeightCm: number | null, sittingHeightCm: number | null): number | null {
  if (!standingHeightCm || !sittingHeightCm) return null
  return Math.round((standingHeightCm - sittingHeightCm) * 10) / 10
}

export function calculateFatMass(weightKg: number | null, bodyFatPercent: number | null): number | null {
  if (!weightKg || bodyFatPercent == null) return null
  return Math.round((weightKg * bodyFatPercent / 100) * 100) / 100
}

export function calculateBodyFatPercent(weightKg: number | null, fatMassKg: number | null): number | null {
  if (!weightKg || !fatMassKg) return null
  return Math.round((fatMassKg / weightKg * 100) * 10) / 10
}

export function calculateMuscleMass(weightKg: number | null, musclePercent: number | null): number | null {
  if (!weightKg || musclePercent == null) return null
  return Math.round((weightKg * musclePercent / 100) * 100) / 100
}

export function calculateMusclePercent(weightKg: number | null, muscleMassKg: number | null): number | null {
  if (!weightKg || !muscleMassKg) return null
  return Math.round((muscleMassKg / weightKg * 100) * 10) / 10
}

// Latest non-null value for a metric from measurements sorted desc by date
export function getLatestByMetric(measurements: any[], key: MetricKey): number | null {
  for (const m of measurements) {
    if (m[key] != null) return Number(m[key])
  }
  return null
}

// Latest BMI — ONLY from records where both weight AND standing_height are in the same record
export function getLatestBMI(measurements: any[]): number | null {
  for (const m of measurements) {
    if (m.weight_kg != null && m.standing_height_cm != null) {
      return calculateBMI(m.weight_kg, m.standing_height_cm)
    }
  }
  return null
}

// Growth velocity using the 2 most recent height records that are >= 30 days apart
export function getGrowthVelocity(measurements: any[]): number | null {
  const heightMs = [...measurements]
    .filter(m => m.standing_height_cm != null)
    .sort((a, b) => new Date(b.measurement_date).getTime() - new Date(a.measurement_date).getTime())
  if (heightMs.length < 2) return null
  const latest = heightMs[0]
  // Find second most recent that is >= 30 days before latest
  for (let i = 1; i < heightMs.length; i++) {
    const days = (new Date(latest.measurement_date).getTime() - new Date(heightMs[i].measurement_date).getTime()) / (1000 * 60 * 60 * 24)
    if (days >= 30) {
      const diff = Number(latest.standing_height_cm) - Number(heightMs[i].standing_height_cm)
      return Math.round((diff / days * 365.25) * 10) / 10
    }
  }
  return null
}

// Get height values (sorted asc by date) for sparkline
export function getHeightSparkline(measurements: any[]): number[] {
  return [...measurements]
    .filter(m => m.standing_height_cm != null)
    .sort((a, b) => new Date(a.measurement_date).getTime() - new Date(b.measurement_date).getTime())
    .map(m => Number(m.standing_height_cm))
}

// Get values (sorted asc by date) for a metric — for chart
export function getMetricTimeSeries(measurements: any[], key: MetricKey): Array<{ date: string; value: number }> {
  return [...measurements]
    .filter(m => m[key] != null)
    .sort((a, b) => new Date(a.measurement_date).getTime() - new Date(b.measurement_date).getTime())
    .map(m => ({ date: m.measurement_date, value: Number(m[key]) }))
}

// Get BMI time series (same-record only)
export function getBMITimeSeries(measurements: any[]): Array<{ date: string; value: number }> {
  return [...measurements]
    .filter(m => m.weight_kg != null && m.standing_height_cm != null)
    .sort((a, b) => new Date(a.measurement_date).getTime() - new Date(b.measurement_date).getTime())
    .map(m => ({ date: m.measurement_date, value: calculateBMI(m.weight_kg, m.standing_height_cm)! }))
}

// Compare latest with previous (for summary cards)
export function compareLatestWithPrevious(measurements: any[], metricKey: MetricKey): {
  latest: number | null
  prev: number | null
  diff: number | null
  trend: string
} {
  const series = getMetricTimeSeries(measurements, metricKey)
  const latest = series[series.length - 1]?.value ?? null
  const prev = series[series.length - 2]?.value ?? null
  const diff = latest != null && prev != null ? Math.round((latest - prev) * 100) / 100 : null
  const trend = latest == null || prev == null ? 'لا توجد مقارنة سابقة'
    : latest > prev ? 'زيادة'
    : latest < prev ? 'نقصان'
    : 'ثابت'
  return { latest, prev, diff, trend }
}

// Compare latest BMI with previous (same-record only)
export function compareBMI(measurements: any[]): {
  latest: number | null
  prev: number | null
  diff: number | null
  trend: string
} {
  const series = getBMITimeSeries(measurements)
  const latest = series[series.length - 1]?.value ?? null
  const prev = series[series.length - 2]?.value ?? null
  const diff = latest != null && prev != null ? Math.round((latest - prev) * 100) / 100 : null
  const trend = latest == null || prev == null ? 'لا توجد مقارنة سابقة'
    : latest > prev ? 'زيادة'
    : latest < prev ? 'نقصان'
    : 'ثابت'
  return { latest, prev, diff, trend }
}

// 30-day and same-day rule check (client-side, against loaded measurements)
export function check30DayViolation(
  measurements: any[],
  playerId: string,
  key: MetricKey,
  date: string
): { violated: boolean; sameDay: boolean; nearestDate?: string } {
  const playerMs = measurements.filter(m => m.player_id === playerId && m[key] != null && !m.deleted_at)
  if (!playerMs.length) return { violated: false, sameDay: false }
  const selectedMs = new Date(date).getTime()
  for (const m of playerMs) {
    if (m.measurement_date === date) return { violated: true, sameDay: true, nearestDate: date }
    const days = Math.abs(selectedMs - new Date(m.measurement_date).getTime()) / (1000 * 60 * 60 * 24)
    if (days < 30) return { violated: true, sameDay: false, nearestDate: m.measurement_date }
  }
  return { violated: false, sameDay: false }
}

export function getMeasurementAgeColor(measurementDate: string | null): string {
  if (!measurementDate) return 'bg-slate-100 text-slate-400'
  const days = Math.floor((Date.now() - new Date(measurementDate).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 30) return 'bg-emerald-100 text-emerald-700'
  if (days <= 90) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

export function getMeasurementAgeLabel(measurementDate: string | null): string {
  if (!measurementDate) return 'لا يوجد'
  const days = Math.floor((Date.now() - new Date(measurementDate).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'اليوم'
  if (days < 7) return `${days} أيام`
  if (days < 30) return `${Math.floor(days / 7)} أسابيع`
  if (days < 365) return `${Math.floor(days / 30)} شهر`
  return `${Math.floor(days / 365)} سنة`
}

export function calcPlayerAge(dob: string | null): number | null {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
}
