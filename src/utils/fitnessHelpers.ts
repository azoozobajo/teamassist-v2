import type { TestDefinition } from './fitnessTestDefinitions'

// ── RESULT CALCULATION ──────────────────────────────────────────────────

export function getOfficialSuggestedResult(testDef: TestDefinition, resultData: any): {
  value: number | null
  attemptIndex: number | null
} {
  const attempts: any[] = resultData?.attempts ?? []
  if (!attempts.length) return { value: null, attemptIndex: null }

  if (testDef.side_specific) {
    // For side-specific tests, official result = best right attempt or best left attempt (use right by default in suggestion)
    const rightAttempts: any[] = resultData?.right?.attempts ?? []
    const leftAttempts: any[] = resultData?.left?.attempts ?? []
    const rightBest = getBestAttemptValue(rightAttempts, testDef.best_rule)
    const leftBest = getBestAttemptValue(leftAttempts, testDef.best_rule)
    if (rightBest.value === null && leftBest.value === null) return { value: null, attemptIndex: null }
    // Official = average of best sides, or best right if no left
    const vals = [rightBest.value, leftBest.value].filter(v => v !== null) as number[]
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    return { value: Math.round(avg * 100) / 100, attemptIndex: 0 }
  }

  // RSA: official result = best sprint (lowest time or highest value based on best_rule)
  if (testDef.test_key === 'rsa') {
    const times = attempts.map((a: any) => Number(a.time_s)).filter(v => !isNaN(v))
    if (!times.length) return { value: null, attemptIndex: null }
    const best = Math.min(...times)
    const idx = attempts.findIndex((a: any) => Number(a.time_s) === best)
    return { value: best, attemptIndex: idx }
  }

  // Standard multi-attempt: pick best
  return getBestAttemptValue(attempts, testDef.best_rule)
}

function getBestAttemptValue(attempts: any[], bestRule: 'lowest' | 'highest'): {
  value: number | null
  attemptIndex: number | null
} {
  if (!attempts.length) return { value: null, attemptIndex: null }
  const valueKey = getAttemptValueKey(attempts[0])
  if (!valueKey) return { value: null, attemptIndex: null }

  let bestIdx = -1
  let bestVal: number | null = null
  for (let i = 0; i < attempts.length; i++) {
    const raw = attempts[i][valueKey]
    if (raw == null || raw === '') continue
    const v = Number(raw)
    if (isNaN(v)) continue
    if (
      bestVal === null ||
      (bestRule === 'lowest' && v < bestVal) ||
      (bestRule === 'highest' && v > bestVal)
    ) {
      bestVal = v
      bestIdx = i
    }
  }
  return { value: bestVal, attemptIndex: bestIdx >= 0 ? bestIdx : null }
}

function getAttemptValueKey(attempt: any): string | null {
  if (!attempt) return null
  const keys = Object.keys(attempt)
  // prefer time_s, height_cm, distance_cm, distance_m, reach_cm, reps, force_kg
  const preferred = ['time_s', 'height_cm', 'distance_cm', 'distance_m', 'reach_cm', 'reps', 'force_kg']
  for (const k of preferred) {
    if (keys.includes(k)) return k
  }
  return keys[0] ?? null
}

// ── CALCULATED FIELDS ───────────────────────────────────────────────────

export function calculateAsymmetry(rightVal: number | null, leftVal: number | null): number | null {
  if (rightVal == null || leftVal == null || rightVal === 0 || leftVal === 0) return null
  const maxVal = Math.max(rightVal, leftVal)
  return Math.round((Math.abs(rightVal - leftVal) / maxVal) * 1000) / 10
}

export function calculateYBalanceComposite(
  anteriorCm: number | null,
  posteromedialCm: number | null,
  posterolateralCm: number | null,
  legLengthCm: number | null
): number | null {
  if (!anteriorCm || !posteromedialCm || !posterolateralCm || !legLengthCm || legLengthCm === 0) return null
  return Math.round(((anteriorCm + posteromedialCm + posterolateralCm) / (3 * legLengthCm)) * 1000) / 10
}

export interface RSAStats {
  best: number | null
  worst: number | null
  total: number | null
  average: number | null
  fatigue_index: number | null
}

export function calculateRSAStats(attempts: any[]): RSAStats {
  const times = attempts.map((a: any) => Number(a.time_s)).filter(v => !isNaN(v) && v > 0)
  if (!times.length) return { best: null, worst: null, total: null, average: null, fatigue_index: null }

  const best = Math.min(...times)
  const worst = Math.max(...times)
  const total = Math.round(times.reduce((a, b) => a + b, 0) * 100) / 100
  const average = Math.round((total / times.length) * 100) / 100
  const fatigue_index = best > 0
    ? Math.round(((worst - best) / best) * 1000) / 10
    : null

  return {
    best: Math.round(best * 100) / 100,
    worst: Math.round(worst * 100) / 100,
    total,
    average,
    fatigue_index,
  }
}

// Beep Test VO2max estimate (Léger et al.)
export function estimateVO2maxBeep(level: number, shuttle: number): number | null {
  if (!level || level < 1) return null
  // Max speed at that level: speed = 8 + (level - 1) * 0.5 km/h
  const speed = 8 + (level - 1) * 0.5
  const vo2 = -24.4 + 6 * speed
  return Math.round(vo2 * 10) / 10
}

// Yo-Yo IR1/IR2 VO2max estimate
export function estimateVO2maxYoyo(distanceM: number, isIR2 = false): number | null {
  if (!distanceM || distanceM <= 0) return null
  const vo2 = isIR2
    ? distanceM * 0.0136 + 45.3
    : distanceM * 0.0084 + 36.4
  return Math.round(vo2 * 10) / 10
}

// Cooper VO2max estimate
export function estimateVO2maxCooper(distanceM: number): number | null {
  if (!distanceM || distanceM <= 0) return null
  const vo2 = (distanceM - 504.9) / 44.73
  return Math.round(vo2 * 10) / 10
}

export function computeResultDataCalculated(testDef: TestDefinition, resultData: any): Record<string, number | null> {
  const result: Record<string, number | null> = {}

  if (testDef.test_key === 'rsa') {
    const attempts: any[] = resultData?.attempts ?? []
    const stats = calculateRSAStats(attempts)
    result.best_s = stats.best
    result.worst_s = stats.worst
    result.average_s = stats.average
    result.total_s = stats.total
    result.fatigue_index = stats.fatigue_index
  }

  if (testDef.test_key === 'y_balance') {
    const calc = (side: 'right' | 'left') => {
      const d = resultData?.[side]?.attempts?.[0] ?? {}
      return calculateYBalanceComposite(
        d.anterior_cm ? Number(d.anterior_cm) : null,
        d.posteromedial_cm ? Number(d.posteromedial_cm) : null,
        d.posterolateral_cm ? Number(d.posterolateral_cm) : null,
        d.leg_length_cm ? Number(d.leg_length_cm) : null,
      )
    }
    const right = calc('right')
    const left = calc('left')
    result.composite_score_right = right
    result.composite_score_left = left
    result.asymmetry_pct = calculateAsymmetry(right, left)
  }

  if (testDef.test_key === 'agility_505' || testDef.test_key === 'grip_strength') {
    const getBest = (side: 'right' | 'left') => {
      const attempts: any[] = resultData?.[side]?.attempts ?? []
      return getBestAttemptValue(attempts, testDef.best_rule).value
    }
    const right = getBest('right')
    const left = getBest('left')
    result.asymmetry_pct = calculateAsymmetry(right, left)
  }

  if (testDef.test_key === 'beep_test') {
    const a = resultData?.attempts?.[0] ?? {}
    result.vo2max = estimateVO2maxBeep(Number(a.level), Number(a.shuttle))
  }

  if (testDef.test_key === 'yoyo_ir1') {
    const a = resultData?.attempts?.[0] ?? {}
    result.vo2max = estimateVO2maxYoyo(Number(a.distance_m), false)
  }

  if (testDef.test_key === 'yoyo_ir2') {
    const a = resultData?.attempts?.[0] ?? {}
    result.vo2max = estimateVO2maxYoyo(Number(a.distance_m), true)
  }

  if (testDef.test_key === 'cooper_test') {
    const a = resultData?.attempts?.[0] ?? {}
    result.vo2max = estimateVO2maxCooper(Number(a.distance_m))
  }

  return result
}

// Official result for saving — handles Y-balance separately (uses computed composite)
export function getOfficialFromResultData(testDef: TestDefinition, resultData: any): number | null {
  if (testDef.test_key === 'y_balance') {
    const r = resultData?.calculated?.composite_score_right ?? null
    const l = resultData?.calculated?.composite_score_left ?? null
    const vals = [r, l].filter((v): v is number => v !== null)
    if (!vals.length) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }
  if (testDef.test_key === 'rsa') {
    const stats = calculateRSAStats(resultData?.attempts ?? [])
    return stats.best
  }
  return getOfficialSuggestedResult(testDef, resultData).value
}

// ── COMPARISON & TREND ─────────────────────────────────────────────────

export function compareFitnessResults(
  curr: number | null,
  prev: number | null,
  bestRule: 'lowest' | 'highest'
): { trend: string; diff: number | null } {
  if (curr == null || prev == null) return { trend: 'لا مقارنة', diff: null }
  const diff = Math.round((curr - prev) * 100) / 100
  const improved = bestRule === 'lowest' ? curr < prev : curr > prev
  const trend = diff === 0 ? 'ثابت' : improved ? 'تحسّن' : 'تراجع'
  return { trend, diff }
}

// ── FORMATTING ─────────────────────────────────────────────────────────

export function formatFitnessResult(value: number | null, testDef: TestDefinition): string {
  if (value == null) return '—'
  if (testDef.result_type === 'time' && testDef.best_rule === 'lowest') {
    if (value >= 60) {
      const m = Math.floor(value / 60)
      const s = (value % 60).toFixed(2)
      return `${m}:${s.padStart(5, '0')}`
    }
    return `${value.toFixed(2)}s`
  }
  if (testDef.result_type === 'time' && testDef.best_rule === 'highest') {
    if (value >= 60) {
      const m = Math.floor(value / 60)
      const s = Math.round(value % 60)
      return `${m}د ${s}ث`
    }
    return `${value}ث`
  }
  if (testDef.result_type === 'count') return `${value} تكرار`
  if (testDef.result_type === 'distance') return `${value} ${testDef.result_unit}`
  if (testDef.result_type === 'score') return `${value} ${testDef.result_unit}`
  if (testDef.result_type === 'level') return `م${value}`
  return `${value}`
}

export function formatSecondsAsDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = (seconds % 60).toFixed(2)
    return `${m}:${s.padStart(5, '0')}`
  }
  return `${seconds.toFixed(2)}ث`
}

// ── VALIDATION ─────────────────────────────────────────────────────────

export function validateAttemptField(
  value: string,
  field: { min?: number; max?: number; type: string; required?: boolean }
): string | null {
  if (!value || value.trim() === '') {
    return field.required ? 'مطلوب' : null
  }
  const n = Number(value)
  if (isNaN(n)) return 'قيمة غير صالحة'
  if (field.type === 'integer' && !Number.isInteger(n)) return 'يجب أن يكون عدداً صحيحاً'
  if (field.min !== undefined && n < field.min) return `الحد الأدنى ${field.min}`
  if (field.max !== undefined && n > field.max) return `الحد الأقصى ${field.max}`
  return null
}

export function isUnusualResult(value: number | null, testDef: TestDefinition): boolean {
  if (value == null) return false
  if (testDef.unusual_min !== undefined && value < testDef.unusual_min) return true
  if (testDef.unusual_max !== undefined && value > testDef.unusual_max) return true
  return false
}
