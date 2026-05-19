import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fitnessService } from '../../services'
import { supabase } from '../../lib/supabase'
import { canManageEvents } from '../../utils/helpers'
import { Avatar } from '../../components/ui'
import { FITNESS_TESTS, FITNESS_CATEGORIES, getTestDef } from '../../utils/fitnessTestDefinitions'
import type { TestDefinition, TestField } from '../../utils/fitnessTestDefinitions'
import {
  getOfficialSuggestedResult,
  getOfficialFromResultData,
  compareFitnessResults,
  formatFitnessResult,
  validateAttemptField,
  isUnusualResult,
  calculateRSAStats,
  calculateYBalanceComposite,
  calculateAsymmetry,
  computeResultDataCalculated,
} from '../../utils/fitnessHelpers'
import { calcPlayerAge, formatDate, getMeasurementAgeColor, getMeasurementAgeLabel } from '../../utils/measurementHelpers'
import { Plus, X, ChevronDown, ChevronUp, AlertTriangle, Check, ChevronLeft, ChevronRight, Trash2, Edit3, CheckCircle, Info, BarChart2 } from 'lucide-react'

// ── TABLE COLUMN DEFINITION ────────────────────────────────────────────

interface Col {
  key: string
  groupHeader: string
  header: string
  unit: string
  side: 'right' | 'left' | null
  attemptIdx: number
  fieldKey: string
  fieldDef: TestField
}

function buildCols(testDef: TestDefinition): Col[] {
  const cols: Col[] = []
  const add = (groupHeader: string, header: string, side: 'right' | 'left' | null, ai: number, field: TestField) => {
    cols.push({ key: `${side ?? 'n'}_${ai}_${field.key}`, groupHeader, header, unit: field.unit, side, attemptIdx: ai, fieldKey: field.key, fieldDef: field })
  }

  if (testDef.side_specific) {
    for (const side of ['right', 'left'] as const) {
      for (let ai = 0; ai < testDef.attempts.count; ai++) {
        for (const field of testDef.fields) {
          const isFirstOfSide = ai === 0 && field === testDef.fields[0]
          const groupHeader = isFirstOfSide ? (side === 'right' ? 'اليمين' : 'اليسار') : ''
          const shortLabel: Record<string, string> = {
            leg_length_cm: 'طول', anterior_cm: 'أمامي', posteromedial_cm: 'PM', posterolateral_cm: 'PL',
          }
          const header = testDef.fields.length === 1 ? `م ${ai + 1}` : (shortLabel[field.key] ?? field.label)
          add(groupHeader, header, side, ai, field)
        }
      }
    }
  } else if (testDef.attempts.count === 1 && testDef.fields.length > 1) {
    for (const field of testDef.fields) add('', field.label, null, 0, field)
  } else {
    for (let ai = 0; ai < testDef.attempts.count; ai++) {
      for (const field of testDef.fields) {
        const header = testDef.test_key === 'rsa' ? `س${ai + 1}` : (testDef.fields.length === 1 ? `م ${ai + 1}` : `م${ai + 1} ${field.label}`)
        add('', header, null, ai, field)
      }
    }
  }
  return cols
}

function buildPlayerResultData(testDef: TestDefinition, pValues: Record<string, string>): any {
  const parse = (k: string) => { const v = pValues[k]; return v && v.trim() !== '' ? Number(v) : null }
  if (testDef.side_specific) {
    const buildSide = (side: 'right' | 'left') => ({
      attempts: Array.from({ length: testDef.attempts.count }, (_, ai) => {
        const a: any = {}
        testDef.fields.forEach(f => { a[f.key] = parse(`${side}_${ai}_${f.key}`) })
        return a
      }),
    })
    const data: any = { right: buildSide('right'), left: buildSide('left') }
    data.calculated = computeResultDataCalculated(testDef, data)
    return data
  }
  const data: any = {
    attempts: Array.from({ length: testDef.attempts.count }, (_, ai) => {
      const a: any = {}
      testDef.fields.forEach(f => { a[f.key] = parse(`n_${ai}_${f.key}`) })
      return a
    }),
  }
  data.calculated = computeResultDataCalculated(testDef, data)
  return data
}

function validatePlayerRow(cols: Col[], pValues: Record<string, string>, testDef: TestDefinition): { errors: string[]; warnings: string[]; hasAny: boolean } {
  const errors: string[] = []
  const warnings: string[] = []
  const hasAny = cols.some(c => pValues[c.key]?.trim())
  if (!hasAny) return { errors, warnings, hasAny }

  for (const col of cols) {
    const v = pValues[col.key]
    if (!v?.trim()) {
      if (col.fieldDef.required && col.attemptIdx === 0) errors.push(`${col.header}: مطلوب`)
      continue
    }
    const err = validateAttemptField(v, col.fieldDef)
    if (err) errors.push(`${col.header}: ${err}`)
  }

  if (testDef.test_key === 'rsa') {
    const filled = cols.filter(c => pValues[c.key]?.trim()).length
    if (filled < testDef.attempts.count) errors.push(`RSA: يجب إدخال جميع السبرنتات (${filled}/${testDef.attempts.count})`)
  }

  const resultData = buildPlayerResultData(testDef, pValues)
  const official = getOfficialFromResultData(testDef, resultData)
  if (official !== null && isUnusualResult(official, testDef)) {
    warnings.push(`النتيجة (${official} ${testDef.result_unit}) خارج النطاق المعتاد`)
  }
  return { errors, warnings, hasAny }
}

// ── TEAM BAR CHART ─────────────────────────────────────────────────────

function FitnessTeamBarChart({ playerRows, allTestKeys }: { playerRows: any[]; allTestKeys: string[] }) {
  const [selectedKey, setSelectedKey] = useState(allTestKeys[0] ?? '')
  const testDef = useMemo(() => getTestDef(selectedKey), [selectedKey])

  useEffect(() => {
    if (!allTestKeys.includes(selectedKey) && allTestKeys.length) setSelectedKey(allTestKeys[0])
  }, [allTestKeys])

  const data = useMemo(() => {
    if (!testDef) return []
    return playerRows
      .map(p => ({ id: p.id, name: p.full_name, value: p.latestByTest?.[selectedKey]?.official_result != null ? Number(p.latestByTest[selectedKey].official_result) : null }))
      .filter(d => d.value !== null)
      .sort((a, b) => testDef.best_rule === 'lowest' ? (a.value! - b.value!) : (b.value! - a.value!))
  }, [playerRows, selectedKey, testDef])

  if (!allTestKeys.length) return null
  if (!data.length) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-1.5"><BarChart2 size={15} className="text-brand-500"/> مقارنة الفريق</h3>
        <TestSelector allTestKeys={allTestKeys} value={selectedKey} onChange={setSelectedKey}/>
      </div>
      <p className="text-sm text-slate-400 text-center py-6">لا توجد نتائج لهذا الاختبار</p>
    </div>
  )

  const maxVal = Math.max(...data.map(d => d.value!))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-extrabold text-slate-700 text-sm flex items-center gap-1.5"><BarChart2 size={15} className="text-brand-500"/> مقارنة الفريق</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {testDef?.best_rule === 'lowest' ? 'الأقل = الأفضل' : 'الأعلى = الأفضل'} — {data.length} لاعب
          </p>
        </div>
        <TestSelector allTestKeys={allTestKeys} value={selectedKey} onChange={setSelectedKey}/>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {data.map((d, i) => {
          const pct = (d.value! / maxVal) * 100
          const rankPct = i / Math.max(data.length - 1, 1)
          const color = rankPct <= 0.33 ? '#10b981' : rankPct <= 0.66 ? '#f59e0b' : '#ef4444'
          return (
            <div key={d.id} className="flex items-center gap-2">
              <span className="text-xs text-slate-600 w-28 text-right shrink-0 truncate">{d.name}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden" dir="ltr">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }}/>
              </div>
              <span className="text-xs font-bold w-20 shrink-0 text-left" style={{ color }}>
                {formatFitnessResult(d.value, testDef!)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TestSelector({ allTestKeys, value, onChange }: { allTestKeys: string[]; value: string; onChange: (k: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400 max-w-[180px]">
      {allTestKeys.map(key => {
        const def = getTestDef(key)
        return <option key={key} value={key}>{def?.name_ar ?? key}</option>
      })}
    </select>
  )
}

// ── TREND BADGE ────────────────────────────────────────────────────────

function TrendBadge({ trend, diff }: { trend: string; diff: number | null }) {
  if (trend === 'لا مقارنة') return <span className="text-slate-300 text-[10px]">—</span>
  const isGood = trend === 'تحسّن'
  const isFlat = trend === 'ثابت'
  const cls = isGood ? 'bg-emerald-100 text-emerald-700' : isFlat ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-600'
  const sign = diff != null && diff > 0 ? '+' : ''
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${cls}`}>
      {isGood ? '↑' : isFlat ? '=' : '↓'} {diff != null ? `${sign}${diff}` : trend}
    </span>
  )
}

// ── INLINE LINE CHART ──────────────────────────────────────────────────

function LineChart({ series, label, unit, bestRule }: { series: { date: string; value: number }[]; label: string; unit: string; bestRule: 'lowest' | 'highest' }) {
  if (series.length < 2) return (
    <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-400">
      {series.length === 0 ? 'لا توجد بيانات' : 'إضافة المزيد من النتائج لعرض الرسم البياني'}
    </div>
  )
  const W = 460, H = 90, padX = 36, padY = 10
  const vals = series.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const pts = series.map((d, i) => ({
    x: padX + (i / (series.length - 1)) * (W - padX * 2),
    y: padY + (1 - (d.value - min) / range) * (H - padY * 2),
    d,
  }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const fill = `${path} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`
  const last = vals[vals.length - 1], prev = vals[vals.length - 2]
  const improved = bestRule === 'lowest' ? last < prev : last > prev
  const stroke = improved ? '#10b981' : last === prev ? '#94a3b8' : '#ef4444'
  return (
    <div className="bg-slate-50 rounded-xl p-3 overflow-hidden">
      <p className="text-xs font-bold text-slate-600 mb-2">{label} ({unit})</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 18}`} className="h-28">
        <path d={fill} fill={`${stroke}18`}/>
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="white" stroke={stroke} strokeWidth="1.5"/>
            <text x={p.x} y={H + 14} textAnchor="middle" fontSize="7" fill="#94a3b8">
              {new Date(p.d.date).toLocaleDateString('ar-SA', { month: 'numeric', day: 'numeric' })}
            </text>
          </g>
        ))}
        <text x="2" y={padY + 4} fontSize="7" fill="#94a3b8">{max}</text>
        <text x="2" y={H - padY} fontSize="7" fill="#94a3b8">{min}</text>
      </svg>
    </div>
  )
}

// ── ADD MODAL ──────────────────────────────────────────────────────────

const STEP_LABELS = ['اختر اللاعبين', 'اختر الاختبار', 'أدخل النتائج']

function AddFitnessTestModal({
  players, teamId, userId, onClose, onSaved,
}: {
  players: any[]; teamId: string; userId: string; onClose: () => void; onSaved: () => void
}) {
  const [step, setStep] = useState(0)
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<'all' | 'specific'>('all')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(players.filter(p => p.role === 'player').map(p => p.id))
  const [selectedTestKey, setSelectedTestKey] = useState('')
  const [filterCat, setFilterCat] = useState('')

  // playerValues[playerId][colKey] = string value
  const [playerValues, setPlayerValues] = useState<Record<string, Record<string, string>>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({})
  const [rowWarnings, setRowWarnings] = useState<Record<string, string[]>>({})
  const [warningConfirmed, setWarningConfirmed] = useState(false)
  const [globalErrors, setGlobalErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [guideTest, setGuideTest] = useState<TestDefinition | null>(null)

  const testDef = useMemo(() => getTestDef(selectedTestKey), [selectedTestKey])
  const cols = useMemo(() => testDef ? buildCols(testDef) : [], [testDef])
  const activePlayers = mode === 'all' ? players.filter(p => p.role === 'player') : players.filter(p => selectedPlayerIds.includes(p.id) && p.role === 'player')
  const filteredTests = filterCat ? FITNESS_TESTS.filter(t => t.category === filterCat) : FITNESS_TESTS

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function setVal(pid: string, colKey: string, val: string) {
    setPlayerValues(prev => ({ ...prev, [pid]: { ...(prev[pid] ?? {}), [colKey]: val } }))
    setWarningConfirmed(false)
  }

  function selectTest(key: string) {
    setSelectedTestKey(key)
    setPlayerValues({})
    setRowErrors({})
    setRowWarnings({})
    setWarningConfirmed(false)
    setStep(2)
  }

  function validateAll() {
    if (!testDef) return false
    const errs: Record<string, string[]> = {}
    const warns: Record<string, string[]> = {}
    let anyData = false
    for (const p of activePlayers) {
      const pValues = playerValues[p.id] ?? {}
      const { errors, warnings, hasAny } = validatePlayerRow(cols, pValues, testDef)
      if (hasAny) anyData = true
      if (errors.length) errs[p.id] = errors
      if (warnings.length) warns[p.id] = warnings
    }
    setRowErrors(errs)
    setRowWarnings(warns)
    if (!anyData) { setGlobalErrors(['لم يتم إدخال أي نتائج']); return false }
    if (Object.keys(errs).length) return false
    return true
  }

  async function handleSave() {
    if (!testDef) return
    setGlobalErrors([])
    if (!validateAll()) return
    if (Object.keys(rowWarnings).length && !warningConfirmed) {
      setWarningConfirmed(true)
      return
    }

    setSaving(true)
    const saveErrs: string[] = []
    let count = 0

    for (const p of activePlayers) {
      const pValues = playerValues[p.id] ?? {}
      const { hasAny } = validatePlayerRow(cols, pValues, testDef)
      if (!hasAny) continue

      const resultData = buildPlayerResultData(testDef, pValues)
      const official = getOfficialFromResultData(testDef, resultData)

      const dupe = await fitnessService.checkSameDayResult(teamId, p.id, testDef.test_key, testDate)
      if (dupe) { saveErrs.push(`${p.full_name}: يوجد اختبار مسجل في نفس اليوم`); continue }

      const { error } = await fitnessService.addFitnessTestResult({
        team_id: teamId,
        player_id: p.id,
        test_key: testDef.test_key,
        test_date: testDate,
        official_result: official,
        official_result_unit: testDef.result_unit,
        official_attempt_index: 0,
        official_selected_by: userId,
        result_data: resultData,
        created_by: userId,
      })
      if (error) saveErrs.push(`${p.full_name}: ${error.message}`)
      else count++
    }

    setSaving(false)
    if (saveErrs.length) { setGlobalErrors(saveErrs); return }
    setSavedCount(count)
    setTimeout(() => { onSaved(); onClose() }, 900)
  }

  if (savedCount > 0) return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-emerald-500"/>
        </div>
        <p className="font-extrabold text-slate-800 text-lg">تم الحفظ!</p>
        <p className="text-slate-500 text-sm mt-1">تم حفظ نتائج {savedCount} لاعب بنجاح</p>
      </div>
    </div>
  )

  return (
    <>
    {guideTest && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '80vh' }}>
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-800">{guideTest.name_ar}</h3>
              <span className="text-[11px] text-brand-600 font-semibold">{guideTest.category} · {guideTest.result_unit}</span>
            </div>
            <button onClick={() => setGuideTest(null)} className="p-2 rounded-xl hover:bg-slate-100"><X size={16}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {guideTest.guide?.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">{para}</p>
            ))}
          </div>
          <div className="p-4 border-t border-slate-100 flex gap-2 justify-end">
            <button onClick={() => setGuideTest(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-bold">
              إغلاق
            </button>
            <button onClick={() => { const key = guideTest.test_key; setGuideTest(null); selectTest(key) }}
              className="px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700">
              ابدأ الاختبار
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '92vh' }} dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-extrabold text-slate-800">إضافة اختبار لياقي</h2>
            <p className="text-xs text-slate-400 mt-0.5">{STEP_LABELS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X size={18}/></button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-5 pt-4 pb-2 flex-shrink-0">
          {STEP_LABELS.map((l, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] text-center hidden sm:block ${i === step ? 'text-brand-700 font-bold' : 'text-slate-400'}`}>{l}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Step 0: Date + Players ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">تاريخ الاختبار <span className="text-red-500">*</span></label>
                <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"/>
              </div>
              <div className="flex gap-2">
                {(['all', 'specific'] as const).map(m => (
                  <button key={m} onClick={() => {
                    setMode(m)
                    if (m === 'all') setSelectedPlayerIds(players.filter(p => p.role === 'player').map(p => p.id))
                  }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors
                      ${mode === m ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {m === 'all' ? 'كل اللاعبين' : 'لاعبون محددون'}
                  </button>
                ))}
              </div>
              {mode === 'specific' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-700">اختر اللاعبين ({selectedPlayerIds.length})</p>
                    <button className="text-xs text-brand-600 font-bold"
                      onClick={() => setSelectedPlayerIds(prev =>
                        prev.length === players.filter(p => p.role === 'player').length ? [] : players.filter(p => p.role === 'player').map(p => p.id)
                      )}>
                      {selectedPlayerIds.length === players.filter(p => p.role === 'player').length ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  {players.filter(p => p.role === 'player').map(p => {
                    const sel = selectedPlayerIds.includes(p.id)
                    const lastResult = p.results?.[0]
                    return (
                      <button key={p.id} onClick={() => togglePlayer(p.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-right
                          ${sel ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0
                          ${sel ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                          {sel && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                        <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="font-bold text-sm text-slate-800 truncate">{p.full_name}</p>
                          {calcPlayerAge(p.date_of_birth) != null && <p className="text-[10px] text-slate-400">{calcPlayerAge(p.date_of_birth)} سنة</p>}
                        </div>
                        {lastResult && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${getMeasurementAgeColor(lastResult.test_date)}`}>
                            {getMeasurementAgeLabel(lastResult.test_date)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {mode === 'all' && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-brand-700">
                  سيتم تسجيل نتائج لجميع اللاعبين ({players.filter(p => p.role === 'player').length} لاعب)
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Test Selection ── */}
          {step === 1 && (
            <div>
              <div className="flex gap-2 flex-wrap mb-3">
                <button onClick={() => setFilterCat('')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border
                    ${!filterCat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                  الكل
                </button>
                {FITNESS_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setFilterCat(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border
                      ${filterCat === cat ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTests.map(t => (
                  <div key={t.test_key} className="flex rounded-xl border border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50 transition-all overflow-hidden">
                    <button onClick={() => selectTest(t.test_key)}
                      className="flex-1 flex flex-col text-right px-3 py-2.5">
                      <span className="font-bold text-sm text-slate-800">{t.name_ar}</span>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-brand-600 font-semibold">{t.category}</span>
                        <span className="text-[10px] text-slate-400">{t.result_unit} · {t.attempts.count > 1 ? `${t.attempts.count} محاولات` : 'محاولة واحدة'}</span>
                        {t.side_specific && <span className="text-[10px] text-amber-600 font-bold">يمين/يسار</span>}
                      </div>
                    </button>
                    {t.guide && (
                      <button
                        onClick={e => { e.stopPropagation(); setGuideTest(t) }}
                        className="flex items-start pt-2.5 px-2.5 text-slate-300 hover:text-brand-500 shrink-0 transition-colors"
                        title="شرح الاختبار">
                        <Info size={14}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Results Table ── */}
          {step === 2 && testDef && (
            <div className="space-y-4">
              {warningConfirmed && Object.keys(rowWarnings).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={13}/> توجد تحذيرات — اضغط "حفظ" مجددًا للتأكيد
                </div>
              )}

              <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
                <span className="text-xs font-extrabold text-brand-700">{testDef.name_ar}</span>
                <span className="text-[10px] text-brand-500 mr-auto">{testDef.category} · {testDef.result_unit}</span>
                <button onClick={() => { setStep(1); setSelectedTestKey('') }}
                  className="text-[10px] text-brand-600 underline hover:no-underline">تغيير</button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    {/* Group header row (for side-specific) */}
                    {testDef.side_specific && (
                      <tr>
                        <th className="px-3 py-2 text-right font-bold text-slate-600 sticky right-0 bg-slate-50 z-10"/>
                        {(() => {
                          const groups: { label: string; span: number }[] = []
                          for (const col of cols) {
                            if (col.groupHeader) groups.push({ label: col.groupHeader, span: 1 })
                            else if (groups.length) groups[groups.length - 1].span++
                          }
                          return groups.map((g, i) => (
                            <th key={i} colSpan={g.span}
                              className={`px-2 py-1.5 text-center font-extrabold text-[11px] border-b border-slate-200 ${g.label === 'اليمين' ? 'text-emerald-700 bg-emerald-50' : 'text-sky-700 bg-sky-50'}`}>
                              {g.label}
                            </th>
                          ))
                        })()}
                        <th className="px-2 py-1.5 text-center font-bold text-slate-500 text-[11px]"/>
                      </tr>
                    )}
                    <tr>
                      <th className="px-3 py-2 text-right font-bold text-slate-600 min-w-[120px] sticky right-0 bg-slate-50 z-10">اللاعب</th>
                      {cols.map(col => (
                        <th key={col.key} className="px-2 py-2 text-center font-bold text-slate-600 min-w-[60px] whitespace-nowrap">
                          {col.header}
                          {col.unit && <span className="text-[9px] text-slate-400 block font-normal">{col.unit}</span>}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center font-bold text-slate-500 text-[11px] whitespace-nowrap min-w-[70px]">النتيجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePlayers.map(p => {
                      const pValues = playerValues[p.id] ?? {}
                      const pErrs = rowErrors[p.id] ?? []
                      const pWarns = rowWarnings[p.id] ?? []
                      const resultData = buildPlayerResultData(testDef, pValues)
                      const official = getOfficialFromResultData(testDef, resultData)
                      return (
                        <>
                          <tr key={p.id} className={`border-b border-slate-100 ${pErrs.length ? 'bg-red-50' : pWarns.length ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-2 sticky right-0 bg-white z-10">
                              <div className="flex items-center gap-2">
                                <Avatar name={p.full_name} src={p.avatar_url} size="sm"/>
                                <div>
                                  <p className="font-bold text-slate-800 text-xs truncate max-w-[90px]">{p.full_name}</p>
                                  {calcPlayerAge(p.date_of_birth) != null && (
                                    <p className="text-[10px] text-slate-400">{calcPlayerAge(p.date_of_birth)}س</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            {cols.map(col => (
                              <td key={col.key} className="px-1.5 py-2">
                                <input
                                  type="number" step="any"
                                  min={col.fieldDef.min} max={col.fieldDef.max}
                                  placeholder={col.attemptIdx > 0 ? '—' : ''}
                                  value={pValues[col.key] ?? ''}
                                  onChange={e => setVal(p.id, col.key, e.target.value)}
                                  className={`w-full border rounded-lg px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-brand-400
                                    ${pErrs.some(e => e.startsWith(col.header)) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                                />
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center">
                              {official != null ? (
                                <span className="text-[11px] font-extrabold text-brand-700 whitespace-nowrap">
                                  {formatFitnessResult(official, testDef)}
                                </span>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                          </tr>
                          {(pErrs.length > 0 || pWarns.length > 0) && (
                            <tr key={`${p.id}-msgs`}>
                              <td colSpan={cols.length + 2} className="px-3 pb-2 pt-0">
                                {pErrs.map((e, i) => <p key={i} className="text-[10px] text-red-600">• {e}</p>)}
                                {pWarns.map((w, i) => <p key={i} className="text-[10px] text-amber-600">• {w}</p>)}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* RSA computed stats preview */}
              {testDef.test_key === 'rsa' && activePlayers.map(p => {
                const pValues = playerValues[p.id] ?? {}
                const hasAny = cols.some(c => pValues[c.key]?.trim())
                if (!hasAny) return null
                const stats = calculateRSAStats(Array.from({ length: testDef.attempts.count }, (_, ai) => ({ time_s: Number(pValues[`n_${ai}_time_s`]) || null })))
                if (!stats.best) return null
                return (
                  <div key={p.id} className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 text-[11px]">
                    <p className="font-bold text-slate-600 mb-1">{p.full_name} — إحصائيات RSA:</p>
                    <div className="flex gap-4 flex-wrap">
                      <span>أفضل: <strong>{stats.best?.toFixed(2)}ث</strong></span>
                      <span>أسوأ: <strong>{stats.worst?.toFixed(2)}ث</strong></span>
                      <span>متوسط: <strong>{stats.average?.toFixed(2)}ث</strong></span>
                      <span>إجهاد: <strong>{stats.fatigue_index != null ? `${stats.fatigue_index}%` : '—'}</strong></span>
                    </div>
                  </div>
                )
              })}

              {/* Y-Balance composite preview */}
              {testDef.test_key === 'y_balance' && activePlayers.map(p => {
                const pValues = playerValues[p.id] ?? {}
                const hasAny = cols.some(c => pValues[c.key]?.trim())
                if (!hasAny) return null
                const r = calculateYBalanceComposite(
                  Number(pValues['right_0_anterior_cm']) || null,
                  Number(pValues['right_0_posteromedial_cm']) || null,
                  Number(pValues['right_0_posterolateral_cm']) || null,
                  Number(pValues['right_0_leg_length_cm']) || null,
                )
                const l = calculateYBalanceComposite(
                  Number(pValues['left_0_anterior_cm']) || null,
                  Number(pValues['left_0_posteromedial_cm']) || null,
                  Number(pValues['left_0_posterolateral_cm']) || null,
                  Number(pValues['left_0_leg_length_cm']) || null,
                )
                if (r == null && l == null) return null
                return (
                  <div key={p.id} className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 text-[11px]">
                    <p className="font-bold text-slate-600 mb-1">{p.full_name} — نتيجة Y-Balance:</p>
                    <div className="flex gap-4 flex-wrap">
                      <span>اليمين: <strong>{r != null ? `${r}%` : '—'}</strong></span>
                      <span>اليسار: <strong>{l != null ? `${l}%` : '—'}</strong></span>
                      <span>تباين: <strong>{calculateAsymmetry(r, l) != null ? `${calculateAsymmetry(r, l)}%` : '—'}</strong></span>
                    </div>
                  </div>
                )
              })}

              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Info size={10}/> الصفوف الفارغة لا تُحفظ. النتيجة تُحسب تلقائيًا من المحاولات.
              </p>

              {globalErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  {globalErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-slate-100 flex-shrink-0">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
              <ChevronRight size={15}/> السابق
            </button>
          )}
          <div className="flex-1"/>
          {step === 0 && (
            <button onClick={() => setStep(1)}
              disabled={mode === 'specific' && selectedPlayerIds.length === 0}
              className="flex items-center gap-1 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-40">
              التالي <ChevronLeft size={15}/>
            </button>
          )}
          {step === 1 && (
            <p className="text-xs text-slate-400 flex items-center">اضغط على الاختبار للمتابعة</p>
          )}
          {step === 2 && (
            <button onClick={handleSave} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50
                ${warningConfirmed && Object.keys(rowWarnings).length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {saving ? 'جاري الحفظ...' : warningConfirmed && Object.keys(rowWarnings).length > 0 ? 'تأكيد الحفظ رغم التحذيرات' : 'حفظ النتائج'}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

// ── DELETE / EDIT MODALS ────────────────────────────────────────────────

function DeleteFitnessModal({ result, testDef, onClose, onDeleted, userId }: { result: any; testDef: TestDefinition; onClose: () => void; onDeleted: () => void; userId: string }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  async function handleDelete() {
    if (!reason.trim()) { setErr('يجب كتابة سبب الحذف'); return }
    setLoading(true)
    const { error } = await fitnessService.deleteFitnessTestResult(result.id, result.team_id, result.player_id, reason, userId)
    setLoading(false)
    if (error) { setErr(error.message); return }
    onDeleted()
  }
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="font-extrabold text-slate-800 mb-1">حذف الاختبار</h3>
        <p className="text-xs text-slate-500 mb-4">{testDef.name_ar} — {formatDate(result.test_date)}</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 mb-3"
          placeholder="سبب الحذف..."/>
        {err && <p className="text-red-600 text-xs mb-2">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">إلغاء</button>
          <button onClick={handleDelete} disabled={loading}
            className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-40">
            {loading ? 'جاري الحذف...' : 'حذف'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditFitnessModal({ result, testDef, onClose, onSaved, userId }: { result: any; testDef: TestDefinition; onClose: () => void; onSaved: () => void; userId: string }) {
  const editCount = result.edit_count ?? 0
  const [officialResult, setOfficialResult] = useState(String(result.official_result ?? ''))
  const [notes, setNotes] = useState(result.notes ?? '')
  const [editReason, setEditReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  if (editCount >= 3) return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center">
        <p className="font-extrabold text-slate-800 mb-2">لا يمكن التعديل</p>
        <p className="text-sm text-slate-500 mb-4">تم الوصول للحد الأقصى من التعديلات (3 مرات)</p>
        <button onClick={onClose} className="px-4 py-2 bg-slate-100 rounded-xl text-sm">إغلاق</button>
      </div>
    </div>
  )

  async function handleSave() {
    if (!editReason.trim()) { setErr('يجب إدخال سبب التعديل'); return }
    const num = Number(officialResult)
    if (isNaN(num)) { setErr('النتيجة غير صالحة'); return }
    setLoading(true)
    const { error } = await fitnessService.updateFitnessTestResult(result.id, result.team_id, result.player_id, { official_result: num, notes: notes || null }, editReason, userId)
    setLoading(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-slate-800">تعديل الاختبار</h3>
          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{editCount}/3 تعديلات</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">{testDef.name_ar} — {formatDate(result.test_date)}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">النتيجة الرسمية</label>
            <div className="relative">
              <input type="number" step="any" value={officialResult} onChange={e => setOfficialResult(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"/>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{testDef.result_unit}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"/>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">سبب التعديل <span className="text-red-500">*</span></label>
            <textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={2}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="اكتب سبب التعديل..."/>
          </div>
        </div>
        {err && <p className="text-red-600 text-xs mt-2">{err}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">إلغاء</button>
          <button onClick={handleSave} disabled={loading}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 disabled:opacity-40">
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PLAYER DETAIL ──────────────────────────────────────────────────────

function PlayerFitnessDetail({ player, teamId, onClose, canManage, userId, onDataChanged }: {
  player: any; teamId: string; onClose: () => void; canManage: boolean; userId: string; onDataChanged: () => void
}) {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTestKey, setSelectedTestKey] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [editTarget, setEditTarget] = useState<any>(null)

  useEffect(() => {
    setLoading(true)
    fitnessService.getPlayerFitnessResults(teamId, player.id).then(data => {
      setResults(data)
      setLoading(false)
    })
  }, [teamId, player.id])

  const testKeys = useMemo(() => [...new Set(results.map(r => r.test_key))], [results])
  const currentKey = selectedTestKey || testKeys[0] || ''
  const currentDef = useMemo(() => getTestDef(currentKey), [currentKey])

  const testSeries = useMemo(() => {
    if (!currentKey || !currentDef) return []
    return results
      .filter(r => r.test_key === currentKey && r.official_result != null)
      .map(r => ({ date: r.test_date, value: Number(r.official_result) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [results, currentKey, currentDef])

  function handleSaved() {
    fitnessService.getPlayerFitnessResults(teamId, player.id).then(data => { setResults(data); onDataChanged() })
    setDeleteTarget(null); setEditTarget(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 mt-2" dir="rtl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Avatar name={player.full_name} src={player.avatar_url} size="sm"/>
          <div>
            <p className="font-extrabold text-slate-800 text-sm">{player.full_name}</p>
            <p className="text-[10px] text-slate-400">سجل القياسات اللياقية</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16}/></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/></div>
      ) : results.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">لا توجد اختبارات مسجلة لهذا اللاعب</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {testKeys.map(key => {
              const def = getTestDef(key)
              return (
                <button key={key} onClick={() => setSelectedTestKey(key)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-full border
                    ${currentKey === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                  {def?.name_ar ?? key}
                </button>
              )
            })}
          </div>

          {currentDef && testSeries.length >= 2 && (
            <LineChart series={testSeries} label={currentDef.name_ar} unit={currentDef.result_unit} bestRule={currentDef.best_rule}/>
          )}

          {currentDef && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-right font-bold">التاريخ</th>
                    <th className="px-3 py-2 text-center font-bold">النتيجة</th>
                    <th className="px-3 py-2 text-center font-bold">الفارق</th>
                    <th className="px-3 py-2 text-right font-bold">ملاحظات</th>
                    <th className="px-2 py-2 text-center font-bold">تعديلات</th>
                    {canManage && <th className="px-2 py-2 text-center font-bold">إجراء</th>}
                  </tr>
                </thead>
                <tbody>
                  {results
                    .filter(r => r.test_key === currentKey)
                    .sort((a, b) => b.test_date.localeCompare(a.test_date))
                    .map((r, idx, arr) => {
                      const curr = r.official_result != null ? Number(r.official_result) : null
                      const prev = arr[idx + 1]?.official_result != null ? Number(arr[idx + 1].official_result) : null
                      const { trend, diff } = compareFitnessResults(curr, prev, currentDef.best_rule)
                      return (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2">{formatDate(r.test_date)}</td>
                          <td className="px-3 py-2 text-center font-bold text-slate-800">
                            {curr != null ? formatFitnessResult(curr, currentDef) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center"><TrendBadge trend={trend} diff={diff}/></td>
                          <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]">{r.notes ?? '—'}</td>
                          <td className="px-2 py-2 text-center">
                            {(r.edit_count ?? 0) > 0 && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{r.edit_count}/3</span>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-2 py-2 text-center">
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => setEditTarget(r)} className="p-1 rounded-lg hover:bg-brand-50 text-brand-600"><Edit3 size={12}/></button>
                                <button onClick={() => setDeleteTarget(r)} className="p-1 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={12}/></button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteTarget && currentDef && <DeleteFitnessModal result={deleteTarget} testDef={currentDef} onClose={() => setDeleteTarget(null)} onDeleted={handleSaved} userId={userId}/>}
      {editTarget && currentDef && <EditFitnessModal result={editTarget} testDef={currentDef} onClose={() => setEditTarget(null)} onSaved={handleSaved} userId={userId}/>}
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────

export default function FitnessPage({ addTrigger }: { addTrigger?: number }) {
  const { teamId } = useParams<{ teamId: string }>()
  const { user } = useAuth()
  const [myRole, setMyRole] = useState('')
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [detailPlayer, setDetailPlayer] = useState<any>(null)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (!user || !teamId) return
    import('../../services').then(({ teamService }) =>
      teamService.getMembers(teamId).then(members => {
        const me = members.find((m: any) => m.user_id === user.id)
        setMyRole(me?.role ?? '')
      })
    )
  }, [teamId, user])

  useEffect(() => {
    if (addTrigger) setShowAddModal(true)
  }, [addTrigger])

  const canManage = canManageEvents(myRole)

  async function load() {
    if (!teamId) return
    setLoading(true)
    try {
      const { teamService } = await import('../../services')
      const members = await teamService.getMembers(teamId)
      const relevant = members.filter((m: any) => m.role === 'player')
      const playerIds = relevant.map((m: any) => m.user_id)
      let allResults: any[] = []
      if (playerIds.length > 0) {
        const { data } = await supabase
          .from('player_fitness_test_results')
          .select('*')
          .eq('team_id', teamId)
          .in('player_id', playerIds)
          .is('deleted_at', null)
          .order('test_date', { ascending: false })
        allResults = data ?? []
      }
      setPlayers(relevant.map((m: any) => ({
        id: m.user_id,
        full_name: m.profile?.full_name ?? '',
        avatar_url: m.profile?.avatar_url ?? null,
        date_of_birth: m.profile?.date_of_birth ?? null,
        jersey_number: m.profile?.jersey_number ?? null,
        role: m.role,
        results: allResults.filter((r: any) => r.player_id === m.user_id),
      })))
    } catch (_) {
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [teamId])

  const playerRows = useMemo(() => players.map(p => {
    const latestByTest: Record<string, any> = {}
    for (const r of (p.results ?? [])) {
      if (!latestByTest[r.test_key]) latestByTest[r.test_key] = r
    }
    return { ...p, latestByTest, totalTests: Object.keys(latestByTest).length }
  }), [players])

  const allTestKeys = useMemo(() => {
    const keys = new Set<string>()
    playerRows.forEach(p => Object.keys(p.latestByTest).forEach(k => keys.add(k)))
    return [...keys]
  }, [playerRows])

  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const sorted = useMemo(() => [...playerRows].sort((a, b) => {
    let va: any = null, vb: any = null
    if (sortKey === 'name') { va = a.full_name ?? ''; vb = b.full_name ?? '' }
    else if (sortKey === 'tests') { va = a.totalTests; vb = b.totalTests }
    else { va = a.latestByTest[sortKey]?.official_result ?? null; vb = b.latestByTest[sortKey]?.official_result ?? null }
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  }), [playerRows, sortKey, sortDir])

  function SortIcon({ k }: { k: string }) {
    if (sortKey !== k) return <span className="text-slate-300 mr-0.5">↕</span>
    return <span className="text-brand-600 mr-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }
  function Th({ label, k }: { label: string; k: string }) {
    return (
      <th onClick={() => handleSort(k)}
        className="px-2 py-2.5 text-right font-bold text-[11px] cursor-pointer hover:bg-slate-100 whitespace-nowrap select-none">
        {label}<SortIcon k={k}/>
      </th>
    )
  }

  const displayTestKeys = allTestKeys.slice(0, 7)

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="space-y-4" dir="rtl">

      {/* Team bar chart */}
      {allTestKeys.length > 0 && <FitnessTeamBarChart playerRows={playerRows} allTestKeys={allTestKeys}/>}

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <span className="text-2xl">🏃</span>
          </div>
          <p className="font-bold text-slate-600 mb-1">لا يوجد لاعبون</p>
          <p className="text-sm text-slate-400">أضف لاعبين للفريق أولاً</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-center font-bold w-8 text-[11px]">#</th>
                    <th onClick={() => handleSort('name')} className="px-3 py-2.5 text-right font-bold text-[11px] cursor-pointer hover:bg-slate-100 min-w-[130px] select-none">
                      اللاعب<SortIcon k="name"/>
                    </th>
                    <Th label="عدد الاختبارات" k="tests"/>
                    {displayTestKeys.map(key => {
                      const def = getTestDef(key)
                      return <Th key={key} label={def?.name_ar ?? key} k={key}/>
                    })}
                    <th className="px-2 py-2.5 text-center font-bold text-[11px]">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((player, idx) => {
                    const isDetail = detailPlayer?.id === player.id
                    return (
                      <>
                        <tr key={player.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isDetail ? 'bg-brand-50' : ''}`}>
                          <td className="px-3 py-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={player.full_name} src={player.avatar_url} size="sm"/>
                              <div>
                                <p className="font-bold text-slate-800 truncate max-w-[110px]">{player.full_name}</p>
                                {player.date_of_birth && <p className="text-[10px] text-slate-400">{calcPlayerAge(player.date_of_birth)} سنة</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className="bg-brand-100 text-brand-700 font-bold text-[10px] px-2 py-0.5 rounded-full">{player.totalTests}</span>
                          </td>
                          {displayTestKeys.map(key => {
                            const r = player.latestByTest?.[key]
                            const def = getTestDef(key)
                            if (!r || !def) return <td key={key} className="px-2 py-2.5 text-center text-slate-300">—</td>
                            const latestDate = r.test_date
                            const ageColor = getMeasurementAgeColor(latestDate)
                            return (
                              <td key={key} className="px-2 py-2.5 text-center">
                                <div className="font-bold text-slate-800">{formatFitnessResult(Number(r.official_result), def)}</div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${ageColor}`}>
                                  {getMeasurementAgeLabel(latestDate)}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-2 py-2.5 text-center">
                            <button onClick={() => setDetailPlayer(isDetail ? null : player)}
                              className={`p-1.5 rounded-xl transition-colors ${isDetail ? 'bg-brand-100 text-brand-700' : 'hover:bg-slate-100 text-slate-500'}`}>
                              {isDetail ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                          </td>
                        </tr>
                        {isDetail && (
                          <tr key={`${player.id}-detail`}>
                            <td colSpan={3 + displayTestKeys.length + 1} className="px-4 pb-4">
                              <PlayerFitnessDetail
                                player={player}
                                teamId={teamId ?? ''}
                                onClose={() => setDetailPlayer(null)}
                                canManage={canManage}
                                userId={user?.id ?? ''}
                                onDataChanged={load}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <Info size={12}/>
            <span>الجدول يعرض أحدث نتيجة لكل اختبار. اضغط ↓ لعرض السجل الكامل والرسم البياني للاعب.</span>
          </div>
        </>
      )}

      {showAddModal && (
        <AddFitnessTestModal
          players={players}
          teamId={teamId ?? ''}
          userId={user?.id ?? ''}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); load() }}
        />
      )}
    </div>
  )
}
