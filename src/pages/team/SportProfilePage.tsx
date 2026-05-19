import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckSquare, DollarSign, Stethoscope, BookOpen,
  Ruler, Activity, ChevronDown, ChevronUp, Star, Paperclip, Send, X,
  Trophy, BarChart2, Filter,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  eventService, financeService, medicalService,
  noteService, measurementService, fitnessService, pointsService, rewardService,
  matchStatsService, tournamentService, technicalEvalService, teamService,
} from '../../services'
import { Avatar, Spinner } from '../../components/ui'
import { formatDate, RIYAL } from '../../utils/helpers'
import { getTestDef } from '../../utils/fitnessTestDefinitions'
import {
  METRIC_KEYS, METRIC_LABELS, METRIC_UNITS,
  getMetricTimeSeries, getBMITimeSeries,
} from '../../utils/measurementHelpers'
import {
  getCurrentSeason, getSeasonOptions, getActiveIndicators,
  calcStrengthAvg, calcDevAvg, calcOverallAvg, calcImprovementRate,
  fmtScore, CATEGORY_LABELS, CATEGORY_COLORS, buildIndicatorSparkline,
  getStatusLabel, getStatusColorClass,
} from '../../utils/technicalEvalHelpers'

type Tab = 'attendance' | 'finance' | 'medical' | 'notes' | 'measurements' | 'fitness' | 'points' | 'matches' | 'evaluations'

// ── Constants ──────────────────────────────────────────────────────────────────
const NOTE_COLOR: Record<string, { bg: string; tc: string }> = {
  مدح:   { bg: 'bg-emerald-50', tc: 'text-emerald-700' },
  توجيه: { bg: 'bg-blue-50',    tc: 'text-blue-700' },
  تحذير: { bg: 'bg-red-50',     tc: 'text-red-700' },
  تطوير: { bg: 'bg-amber-50',   tc: 'text-amber-700' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  present: { label: 'حاضر',  color: 'text-emerald-600 bg-emerald-50' },
  absent:  { label: 'غائب',  color: 'text-red-600 bg-red-50' },
  late:    { label: 'متأخر', color: 'text-amber-600 bg-amber-50' },
  excused: { label: 'معذور', color: 'text-slate-600 bg-slate-100' },
}

const METRIC_HIGHER_IS_BETTER: Record<string, boolean | null> = {
  standing_height_cm: true,
  sitting_height_cm:  true,
  weight_kg:          null,
  body_fat_percent:   false,
  body_fat_mass_kg:   false,
  muscle_percent:     true,
  muscle_mass_kg:     true,
  bmi:                null,
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() - birth.getMonth() < 0 ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
  return age
}

function fmtEventDateTime(iso: string | undefined): { day: string; date: string; time: string } {
  if (!iso) return { day: '', date: '—', time: '' }
  const d = new Date(iso)
  return {
    day:  d.toLocaleDateString('ar-SA', { weekday: 'long' }),
    date: d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
  }
}

// ── SVG MiniChart ──────────────────────────────────────────────────────────────
function MiniChart({ chartId, series }: {
  chartId: string
  series: Array<{ date: string; value: number }>
}) {
  if (series.length < 2) return null

  const W = 300, H = 90
  const PX = 28, CTOP = 6, CBOT = 68

  const vals = series.map(p => p.value)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 1

  const xs = series.map((_, i) => PX + (i / (series.length - 1)) * (W - PX - 8))
  const ys = series.map(p => CTOP + (1 - (p.value - minV) / range) * (CBOT - CTOP))

  const pts     = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fillPts = [`${xs[0].toFixed(1)},${CBOT + 1}`, pts, `${xs[xs.length - 1].toFixed(1)},${CBOT + 1}`].join(' ')
  const gradId  = `cg_${chartId.replace(/[^a-z0-9]/gi, '_')}`
  const C       = '#6366f1'

  const fmtD = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA', { month: 'numeric', day: 'numeric' })

  const labelIdx: number[] = [0]
  if (series.length >= 5) labelIdx.push(Math.floor(series.length / 2))
  labelIdx.push(series.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={C} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={C} stopOpacity="0.01"/>
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((t, gi) => {
        const gy  = CTOP + t * (CBOT - CTOP)
        const val = maxV - t * range
        return (
          <g key={gi}>
            <line x1={PX} y1={gy.toFixed(1)} x2={W - 4} y2={gy.toFixed(1)}
              stroke="#e2e8f0" strokeWidth="0.7" strokeDasharray="3,3"/>
            <text x={PX - 4} y={gy.toFixed(1)} fontSize="7.5" fill="#94a3b8"
              textAnchor="end" dominantBaseline="middle">
              {val % 1 === 0 ? Math.round(val) : val.toFixed(1)}
            </text>
          </g>
        )
      })}
      <polygon points={fillPts} fill={`url(#${gradId})`}/>
      <polyline points={pts} fill="none" stroke={C} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round"/>
      {xs.map((x, i) => (
        <circle key={i} cx={x.toFixed(1)} cy={ys[i].toFixed(1)}
          r={i === xs.length - 1 ? 4 : 2.5}
          fill={i === xs.length - 1 ? C : '#fff'}
          stroke={C} strokeWidth="1.5"/>
      ))}
      {labelIdx.map(i => (
        <text key={i} x={xs[i].toFixed(1)} y={H - 3} fontSize="7.5" fill="#94a3b8"
          textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>
          {fmtD(series[i].date)}
        </text>
      ))}
    </svg>
  )
}

// ── Trend badge ────────────────────────────────────────────────────────────────
function TrendChip({ diff, unit, higherIsBetter }: {
  diff: number | null; unit: string; higherIsBetter: boolean | null
}) {
  if (diff === null) return <span className="text-[11px] text-slate-400">أول قياس</span>
  const inc    = diff > 0
  const isGood = higherIsBetter === null || diff === 0 ? null : inc === higherIsBetter
  const cls    = diff === 0     ? 'text-slate-400 bg-slate-100'
    : isGood === null           ? 'text-slate-600 bg-slate-100'
    : isGood                    ? 'text-emerald-700 bg-emerald-50'
    :                             'text-red-600 bg-red-50'
  const arrow   = diff === 0 ? '—' : inc ? '↑' : '↓'
  const absVal  = Math.abs(diff)
  const display = absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(1)
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[11px] font-bold ${cls}`}>
      {arrow} {diff > 0 ? '+' : ''}{display} {unit}
    </span>
  )
}

// ── Metric card ────────────────────────────────────────────────────────────────
function MetricCard({ metricKey, series, label, unit }: {
  metricKey: string; series: Array<{ date: string; value: number }>; label: string; unit: string
}) {
  const hib      = METRIC_HIGHER_IS_BETTER[metricKey] ?? null
  const latest   = series[series.length - 1]
  const prev     = series[series.length - 2]
  const diff     = prev ? Math.round((latest.value - prev.value) * 1000) / 1000 : null
  const histDesc = [...series].reverse()

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5 leading-none">
            {latest.value}<span className="text-sm text-slate-400 font-normal mr-1">{unit}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{formatDate(latest.date)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 pt-1">
          <TrendChip diff={diff} unit={unit} higherIsBetter={hib}/>
          <span className="text-[10px] text-slate-400">{series.length} قياس</span>
        </div>
      </div>
      {series.length >= 2 && (
        <div className="px-2 pb-1"><MiniChart chartId={metricKey} series={series}/></div>
      )}
      <div className="border-t border-slate-100 divide-y divide-slate-50">
        {histDesc.map((pt, idx) => {
          const prevPt = histDesc[idx + 1]
          const ptDiff = prevPt ? Math.round((pt.value - prevPt.value) * 1000) / 1000 : null
          const absD   = ptDiff !== null ? Math.abs(ptDiff) : null
          const dispD  = absD !== null ? (absD % 1 === 0 ? absD.toFixed(0) : absD.toFixed(1)) : null
          const dClr   = ptDiff === null ? '' : ptDiff === 0 ? 'text-slate-400'
            : hib === null ? 'text-slate-500'
            : (ptDiff > 0) === hib ? 'text-emerald-600' : 'text-red-500'
          return (
            <div key={pt.date + idx} className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-1.5">
                {idx === 0 && <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">آخر</span>}
                <span className="text-xs text-slate-500">
                  {new Date(pt.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {dispD !== null && (
                  <span className={`text-[10px] font-bold ${dClr}`}>
                    {ptDiff! > 0 ? '+' : ''}{ptDiff! < 0 ? '-' : ''}{dispD} {unit}
                  </span>
                )}
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {pt.value} <span className="text-[10px] text-slate-400 font-normal">{unit}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fitness test card ──────────────────────────────────────────────────────────
function TestCard({ testKey, results }: { testKey: string; results: any[] }) {
  const def      = getTestDef(testKey)
  const unit     = def?.result_unit || ''
  const hib: boolean | null = def?.best_rule === 'highest' ? true
    : def?.best_rule === 'lowest' ? false : null
  const series   = results.map(r => ({ date: r.test_date, value: Number(r.official_result) }))
  const latest   = series[series.length - 1]
  const prev     = series[series.length - 2]
  const diff     = prev ? Math.round((latest.value - prev.value) * 1000) / 1000 : null
  const histDesc = [...series].reverse()

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{def?.category || testKey}</div>
          <div className="font-bold text-sm text-slate-800 mt-0.5">{def?.name_ar || testKey}</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5 leading-none">
            {latest.value}<span className="text-sm text-slate-400 font-normal mr-1">{unit}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{formatDate(latest.date)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 pt-1">
          <TrendChip diff={diff} unit={unit} higherIsBetter={hib}/>
          <span className="text-[10px] text-slate-400">{series.length} تجربة</span>
          {hib !== null && <span className="text-[9px] text-slate-400">{hib ? '↑ الأعلى أفضل' : '↓ الأقل أفضل'}</span>}
        </div>
      </div>
      {series.length >= 2 && (
        <div className="px-2 pb-1"><MiniChart chartId={testKey} series={series}/></div>
      )}
      <div className="border-t border-slate-100 divide-y divide-slate-50">
        {histDesc.map((pt, idx) => {
          const prevPt = histDesc[idx + 1]
          const ptDiff = prevPt ? Math.round((pt.value - prevPt.value) * 1000) / 1000 : null
          const absD   = ptDiff !== null ? Math.abs(ptDiff) : null
          const dispD  = absD !== null ? (absD % 1 === 0 ? absD.toFixed(0) : absD.toFixed(2)) : null
          const dClr   = ptDiff === null ? '' : ptDiff === 0 ? 'text-slate-400'
            : hib === null ? 'text-slate-500'
            : (ptDiff > 0) === hib ? 'text-emerald-600' : 'text-red-500'
          return (
            <div key={pt.date + idx} className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-1.5">
                {idx === 0 && <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">آخر</span>}
                <span className="text-xs text-slate-500">
                  {new Date(pt.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {dispD !== null && (
                  <span className={`text-[10px] font-bold ${dClr}`}>
                    {ptDiff! > 0 ? '+' : ptDiff! < 0 ? '-' : ''}{dispD} {unit}
                  </span>
                )}
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {pt.value} <span className="text-[10px] text-slate-400 font-normal">{unit}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SportProfilePage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()

  const [tab, setTab]             = useState<Tab>('attendance')
  const [loading, setLoading]     = useState(true)

  const [attendance, setAttendance]         = useState<any[]>([])
  const [finance, setFinance]               = useState<{ obligations: any[]; payments: any[] }>({ obligations: [], payments: [] })
  const [medical, setMedical]               = useState<any[]>([])
  const [notes, setNotes]                   = useState<any[]>([])
  const [notesError, setNotesError]         = useState('')
  const [measurements, setMeasurements]     = useState<any[]>([])
  const [fitnessResults, setFitnessResults] = useState<any[]>([])
  const [pointsTxs, setPointsTxs]           = useState<any[]>([])
  const [playerRewards, setPlayerRewards]   = useState<any[]>([])
  const [expandedCase, setExpandedCase]     = useState<string | null>(null)
  const [reportNotes, setReportNotes]       = useState<Record<string, any[]>>({})
  const [loadingNotes, setLoadingNotes]     = useState<string | null>(null)
  const [noteInputs, setNoteInputs]         = useState<Record<string, string>>({})
  const [noteAttach, setNoteAttach]         = useState<Record<string, File | null>>({})
  const [noteAttachKey, setNoteAttachKey]   = useState(0)
  const [noteAttachError, setNoteAttachError] = useState('')
  const [sendingNote, setSendingNote]       = useState<string | null>(null)
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null)

  // Match stats (lazy)
  const [matchStats, setMatchStats]         = useState<{ matches: any[]; lineups: any[]; events: any[] } | null>(null)
  const [matchStatsLoading, setMatchStatsLoading] = useState(false)
  const [tournaments, setTournaments]       = useState<any[]>([])
  const [statsFilterTourn, setStatsFilterTourn] = useState('')
  const [statsFilterFrom, setStatsFilterFrom]   = useState('')
  const [statsFilterTo, setStatsFilterTo]       = useState('')

  // Technical evaluations (lazy)
  const [evalIndicators, setEvalIndicators] = useState<any[]>([])
  const [evalLoading, setEvalLoading]       = useState(false)
  const [evalSeason, setEvalSeason]         = useState(getCurrentSeason())
  const [evalSettings, setEvalSettings]     = useState<any>(null)

  useEffect(() => {
    if (tab !== 'matches' || !teamId || matchStats || matchStatsLoading) return
    setMatchStatsLoading(true)
    Promise.all([
      matchStatsService.getTeamMatchStats(teamId),
      tournamentService.getAll(teamId),
    ]).then(([stats, tourns]) => {
      setMatchStats(stats)
      setTournaments(tourns)
      setMatchStatsLoading(false)
    })
  }, [tab, teamId])

  useEffect(() => {
    if (tab !== 'evaluations' || !teamId || !user) return
    setEvalLoading(true)
    Promise.all([
      technicalEvalService.getSettings(teamId),
      technicalEvalService.getPlayerIndicators(teamId, user.id, evalSeason),
    ]).then(([settings, indicators]) => {
      setEvalSettings(settings)
      setEvalIndicators(indicators)
      setEvalLoading(false)
    })
  }, [tab, teamId, user, evalSeason])

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      eventService.getMyAttendance(teamId, user.id),
      financeService.getPlayerFinance(teamId, user.id),
      medicalService.getPlayerReports(teamId, user.id),
      noteService.getMyNotes(teamId, user.id),
      measurementService.getPlayerMeasurements(teamId, user.id),
      fitnessService.getPlayerFitnessResults(teamId, user.id),
      pointsService.getPlayerTransactions(teamId, user.id),
      rewardService.getPlayerRewards(teamId, user.id),
    ]).then(([att, fin, med, notesResult, meas, fit, pts, rw]) => {
      setAttendance(att)
      setFinance(fin)
      setMedical(med)
      if (notesResult.error) setNotesError(notesResult.error.message)
      else setNotes(notesResult.data)
      setMeasurements(meas)
      setFitnessResults(fit)
      setPointsTxs(pts)
      setPlayerRewards(rw)
      setLoading(false)
    })
  }, [teamId, user])

  // ── Computed ───────────────────────────────────────────────────────────────
  const presentCount  = attendance.filter(a => a.status === 'present' || a.status === 'late').length
  const excusedCount  = attendance.filter(a => a.status === 'excused').length
  const totalEvents   = attendance.length
  const effectiveDenom = totalEvents - excusedCount
  const attPct        = effectiveDenom > 0 ? Math.round(presentCount / effectiveDenom * 100) : (totalEvents > 0 ? 100 : 0)
  const effectiveAttPct = attPct

  const totalRequired = finance.obligations.reduce((s, o) => s + o.amount, 0)
  const totalPaid     = finance.obligations.reduce((s, o) => {
    const p = finance.payments.find((p: any) => p.obligation_id === o.id)
    return s + (p?.paid_amount || 0)
  }, 0)

  // Health status
  const healthStatus = medical.some(r => r.status === 'active')
    ? { label: 'مصاب', color: 'text-red-300' }
    : medical.some(r => r.status === 'monitoring')
    ? { label: 'مراقبة', color: 'text-amber-300' }
    : { label: 'متعافي', color: 'text-emerald-300' }

  // Age + DOB
  const age = calcAge(profile?.date_of_birth)
  const dobFormatted = profile?.date_of_birth
    ? new Date(profile.date_of_birth).toLocaleDateString('ar-SA', { year: 'numeric', month: 'numeric', day: 'numeric' })
    : null

  // Points total
  const totalPoints = pointsTxs.reduce((s, tx) => s + (tx.points || 0), 0)

  // Points with running balance (oldest→newest accumulate, then reverse for display)
  const txAsc = [...pointsTxs].reverse()
  let running = 0
  const txWithBalance = txAsc.map(tx => {
    running += tx.points || 0
    return { ...tx, balance: running }
  })
  const txDesc = [...txWithBalance].reverse()

  // Basic measurements
  const metricSeries: Record<string, Array<{ date: string; value: number }>> = {}
  METRIC_KEYS.forEach(k => { metricSeries[k] = getMetricTimeSeries(measurements, k) })
  const bmiSeries     = getBMITimeSeries(measurements)
  const activeMetrics = METRIC_KEYS.filter(k => metricSeries[k].length > 0)
  const hasBMI        = bmiSeries.length > 0

  // Latest height/weight for header
  const hSeries = metricSeries['standing_height_cm']
  const wSeries = metricSeries['weight_kg']
  const latestHeight = hSeries.length > 0 ? hSeries[hSeries.length - 1].value : null
  const latestWeight = wSeries.length > 0 ? wSeries[wSeries.length - 1].value : null

  // Fitness groups
  const byTestKey: Record<string, any[]> = {}
  fitnessResults.forEach(r => {
    if (!byTestKey[r.test_key]) byTestKey[r.test_key] = []
    byTestKey[r.test_key].push(r)
  })
  Object.values(byTestKey).forEach(arr =>
    arr.sort((a, b) => new Date(a.test_date).getTime() - new Date(b.test_date).getTime())
  )
  const fitnessByCategory: Record<string, string[]> = {}
  Object.keys(byTestKey).forEach(tk => {
    const cat = getTestDef(tk)?.category || 'أخرى'
    if (!fitnessByCategory[cat]) fitnessByCategory[cat] = []
    fitnessByCategory[cat].push(tk)
  })

  const tabs = [
    { key: 'attendance'   as Tab, icon: <CheckSquare size={14}/>, label: 'الحضور',    count: attendance.length },
    { key: 'finance'      as Tab, icon: <DollarSign size={14}/>,  label: 'المالية',   count: finance.obligations.length + playerRewards.length },
    { key: 'medical'      as Tab, icon: <Stethoscope size={14}/>, label: 'الطبية',    count: medical.length },
    { key: 'notes'        as Tab, icon: <BookOpen size={14}/>,    label: 'الملاحظات', count: notes.length },
    { key: 'measurements' as Tab, icon: <Ruler size={14}/>,       label: 'القياسات',  count: activeMetrics.length + (hasBMI ? 1 : 0) },
    { key: 'fitness'      as Tab, icon: <Activity size={14}/>,    label: 'اللياقة',   count: Object.keys(byTestKey).length },
    { key: 'points'       as Tab, icon: <Star size={14}/>,        label: 'النقاط',    count: pointsTxs.length },
    { key: 'matches'      as Tab, icon: <Trophy size={14}/>,      label: 'المباريات', count: undefined },
    { key: 'evaluations'  as Tab, icon: <BarChart2 size={14}/>,   label: 'التقييمات', count: undefined },
  ]

  async function toggleReport(id: string) {
    if (expandedCase === id) { setExpandedCase(null); return }
    setExpandedCase(id)
    if (!reportNotes[id]) {
      setLoadingNotes(id)
      const data = await medicalService.getNotes(id)
      setReportNotes(prev => ({ ...prev, [id]: data }))
      setLoadingNotes(null)
    }
  }

  async function addNote(reportId: string) {
    const text = (noteInputs[reportId] || '').trim()
    if (!text || !user || !teamId) return
    setSendingNote(reportId); setNoteAttachError('')
    let attachment_url: string | null = null
    const file = noteAttach[reportId]
    if (file) {
      const path = `${teamId}/notes/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { url, error } = await medicalService.uploadAttachment(file, path)
      if (error || !url) {
        setNoteAttachError('فشل رفع الملف: ' + (error || 'خطأ'))
        setSendingNote(null); return
      }
      attachment_url = url
    }
    await medicalService.addNote({
      report_id: reportId, team_id: teamId,
      author_id: user.id, note: text,
      note_type: 'تعليق', attachment_url,
    })
    const updated = await medicalService.getNotes(reportId)
    setReportNotes(prev => ({ ...prev, [reportId]: updated }))
    setNoteInputs(prev => ({ ...prev, [reportId]: '' }))
    setNoteAttach(prev => ({ ...prev, [reportId]: null }))
    setNoteAttachKey(k => k + 1)
    setSendingNote(null)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner/></div>

  return (
    <div dir="rtl">
      {/* ── Header card ── */}
      <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 text-white mb-4">
        <div className="flex items-center gap-4 mb-4">
          <Avatar name={profile?.full_name || '?'} src={profile?.avatar_url} size="xl"
            className="ring-4 ring-white/30 flex-shrink-0"/>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold">{profile?.full_name}</h2>
            <p className="text-sm opacity-75">ملفي الرياضي</p>
          </div>
        </div>

        {/* 6-stat grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Row 1: Height / Weight / Finance */}
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <div className="text-lg font-extrabold leading-none">
              {latestHeight != null ? latestHeight : '—'}
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">الطول سم</div>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <div className="text-lg font-extrabold leading-none">
              {latestWeight != null ? latestWeight : '—'}
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">الوزن كغ</div>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            {totalRequired > 0 ? (
              <>
                <div className={`text-lg font-extrabold leading-none ${totalPaid >= totalRequired ? 'text-emerald-300' : 'text-red-300'}`}>
                  {Math.round(totalPaid / totalRequired * 100)}%
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">المالية</div>
              </>
            ) : playerRewards.length > 0 ? (
              <>
                <div className="text-sm font-extrabold leading-none text-emerald-300">
                  +{playerRewards.reduce((s, r) => s + Number(r.amount), 0).toFixed(0)}
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">مكافآت</div>
              </>
            ) : (
              <>
                <div className="text-lg font-extrabold leading-none">—</div>
                <div className="text-[10px] opacity-70 mt-0.5">المالية</div>
              </>
            )}
          </div>

          {/* Row 2: Health / DOB+Age / Points */}
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <div className={`text-sm font-extrabold leading-none ${healthStatus.color}`}>
              {healthStatus.label}
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">الصحة</div>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            {dobFormatted ? (
              <>
                <div className="text-[10px] font-bold text-white/90 leading-snug">{dobFormatted}</div>
                <div className="text-[10px] font-bold text-white/90">({age} سنة)</div>
                <div className="text-[10px] opacity-70 mt-0.5">الميلاد</div>
              </>
            ) : (
              <>
                <div className="text-lg font-extrabold leading-none">—</div>
                <div className="text-[10px] opacity-70 mt-0.5">الميلاد</div>
              </>
            )}
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <div className={`text-lg font-extrabold leading-none ${totalPoints > 0 ? 'text-yellow-300' : totalPoints < 0 ? 'text-red-300' : 'text-white'}`}>
              {totalPoints > 0 ? `+${totalPoints}` : totalPoints}
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">النقاط</div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all
              ${tab === t.key
                ? 'bg-brand-600 text-white shadow'
                : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-100'}`}>
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
                ${tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── ATTENDANCE ── */}
      {tab === 'attendance' && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">سجل الحضور والغياب</h3>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge text-xs font-bold ${attPct >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {presentCount}/{effectiveDenom} · فعلي {attPct}%
              </span>
              {excusedCount > 0 && (
                <span className={`badge text-xs font-bold ${effectiveAttPct >= 70 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  لا تحتسب الأعذار في النسبة <span className="font-normal opacity-70">(بعذر: {excusedCount})</span>
                </span>
              )}
            </div>
          </div>
          {attendance.length === 0
            ? <p className="text-center text-slate-400 text-sm py-6">لا توجد سجلات حضور</p>
            : <div className="space-y-2">
                {[...attendance].sort((a, b) =>
                  new Date(b.event?.start_time || b.created_at).getTime() -
                  new Date(a.event?.start_datetime || a.created_at).getTime()
                ).map(a => {
                  const st  = STATUS_LABELS[a.status] || { label: a.status, color: 'text-slate-600 bg-slate-100' }
                  const dt  = fmtEventDateTime(a.event?.start_datetime)
                  return (
                    <div key={a.id} className="flex items-start justify-between rounded-xl bg-slate-50 px-3 py-2.5 gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-800 truncate">{a.event?.title || 'حدث'}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span className="text-xs font-bold text-brand-700">{dt.day}</span>
                          <span className="text-xs text-slate-500">{dt.date}</span>
                          {dt.time && <span className="text-xs text-slate-400">· {dt.time}</span>}
                        </div>
                        {a.status === 'excused' && a.excuse_reason && (
                          <div className="text-[11px] text-slate-500 mt-1 bg-slate-100 rounded px-2 py-0.5">
                            العذر: {a.excuse_reason}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${st.color}`}>{st.label}</span>
                    </div>
                  )
                })}
              </div>}
        </div>
      )}

      {/* ── FINANCE ── */}
      {tab === 'finance' && (
        <div className="space-y-4">
          {/* Obligations card */}
          <div className="card">
            <h3 className="font-bold text-sm mb-3">المستحقات المالية</h3>
            {finance.obligations.length === 0
              ? <p className="text-center text-slate-400 text-sm py-6">لا توجد مستحقات مالية</p>
              : <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-slate-700">{totalRequired} {RIYAL}</div>
                      <div className="text-[11px] text-slate-400">المطلوب</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-emerald-700">{totalPaid} {RIYAL}</div>
                      <div className="text-[11px] text-slate-400">المسدد</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-red-600">{(totalRequired - totalPaid).toFixed(0)} {RIYAL}</div>
                      <div className="text-[11px] text-slate-400">المتبقي</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {finance.obligations.map(o => {
                      const p    = finance.payments.find((p: any) => p.obligation_id === o.id)
                      const paid = p?.paid_amount || 0
                      const pct  = Math.round(paid / o.amount * 100)
                      return (
                        <div key={o.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="flex justify-between text-xs mb-2">
                            <span className="font-bold text-slate-700">{o.title}</span>
                            <span className="text-slate-500">{paid}/{o.amount} {RIYAL}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${paid >= o.amount ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}/>
                          </div>
                          {o.due_date && <div className="text-[11px] text-slate-400 mt-1.5">الاستحقاق: {o.due_date}</div>}
                        </div>
                      )
                    })}
                  </div>
                </>}
          </div>

          {/* Rewards card */}
          {playerRewards.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">🎁 المكافآت</h3>
                <span className="text-sm font-extrabold text-emerald-600">
                  +{playerRewards.reduce((s, r) => s + Number(r.amount), 0).toFixed(0)} {RIYAL}
                </span>
              </div>
              <div className="space-y-2">
                {playerRewards.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{r.title}</div>
                      {r.notes && <div className="text-xs text-slate-500 mt-0.5 truncate">{r.notes}</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(r.created_at)}</div>
                    </div>
                    <span className="text-base font-extrabold text-emerald-600 flex-shrink-0 mr-2">
                      +{Number(r.amount).toFixed(0)} {RIYAL}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MEDICAL ── */}
      {tab === 'medical' && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-slate-800 px-1">التقارير الطبية</h3>
          {medical.length === 0
            ? <div className="card text-center py-8">
                <div className="text-3xl mb-2">✅</div>
                <div className="font-bold text-slate-600 text-sm">لا توجد تقارير طبية</div>
              </div>
            : medical.map(r => {
                const isOpen = expandedCase === r.id
                const rNotes = reportNotes[r.id] ?? []
                return (
                  <div key={r.id} className="card p-0 overflow-hidden border border-slate-100">
                    {/* Header row */}
                    <button className="w-full text-right p-4 bg-transparent border-none cursor-pointer"
                      onClick={() => toggleReport(r.id)}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'active' ? 'bg-red-500' : r.status === 'monitoring' ? 'bg-amber-400' : 'bg-emerald-500'}`}/>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-800">{r.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{r.report_type} · {formatDate(r.created_at)}</div>
                        </div>
                        {r.attachment_url && <Paperclip size={13} className="text-brand-400 flex-shrink-0"/>}
                        {isOpen ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0"/> : <ChevronDown size={15} className="text-slate-400 flex-shrink-0"/>}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100">
                        {/* Description */}
                        {r.description && (
                          <div className="px-4 py-3 bg-slate-50">
                            <p className="text-xs text-slate-600 leading-relaxed">{r.description}</p>
                          </div>
                        )}
                        {/* Report attachment */}
                        {r.attachment_url && (
                          <div className="px-4 py-2 border-t border-slate-100">
                            <a href={r.attachment_url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800">
                              <Paperclip size={12}/> عرض مرفق التقرير
                            </a>
                          </div>
                        )}

                        {/* Notes / comments */}
                        <div className="px-4 pt-3 pb-2">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">التعليقات والملاحظات</div>
                          {loadingNotes === r.id
                            ? <div className="flex justify-center py-3"><Spinner size="sm"/></div>
                            : rNotes.length === 0
                              ? <p className="text-xs text-slate-400 text-center py-2">لا توجد تعليقات بعد</p>
                              : <div className="space-y-2 mb-3">
                                  {rNotes.map((n: any) => (
                                    <div key={n.id} className="bg-slate-50 rounded-xl px-3 py-2.5">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                                            {n.note_type || 'تعليق'}
                                          </span>
                                          <span className="text-[11px] font-bold text-slate-700">
                                            {n.author?.full_name || 'مجهول'}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400">
                                          {new Date(n.created_at).toLocaleDateString('ar-SA')}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
                                      {n.attachment_url && (
                                        <a href={n.attachment_url} target="_blank" rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-brand-600 mt-1.5 hover:bg-brand-100 bg-brand-50 rounded-lg px-2 py-1">
                                          <Paperclip size={11}/> عرض المرفق
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>}

                          {/* Add comment form */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden mt-2">
                            <textarea
                              className="w-full text-xs px-3 py-2.5 resize-none border-none outline-none bg-white"
                              rows={2}
                              placeholder="أضف تعليقاً أو ملاحظة..."
                              value={noteInputs[r.id] || ''}
                              onChange={e => setNoteInputs(prev => ({ ...prev, [r.id]: e.target.value }))}
                            />
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-100 gap-2">
                              {/* File attach */}
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-brand-600 transition-colors">
                                  <Paperclip size={13}/>
                                  <input key={noteAttachKey} type="file" className="hidden"
                                    onChange={e => setNoteAttach(prev => ({ ...prev, [r.id]: e.target.files?.[0] ?? null }))}/>
                                  {noteAttach[r.id] ? (
                                    <span className="flex items-center gap-1 text-brand-600">
                                      <span className="max-w-[90px] truncate">{noteAttach[r.id]!.name}</span>
                                      <button type="button" onClick={e => { e.preventDefault(); setNoteAttach(prev => ({ ...prev, [r.id]: null })); setNoteAttachKey(k => k + 1) }}>
                                        <X size={11}/>
                                      </button>
                                    </span>
                                  ) : 'إرفاق'}
                                </label>
                              </div>
                              {/* Send */}
                              <button
                                onClick={() => addNote(r.id)}
                                disabled={sendingNote === r.id || !(noteInputs[r.id] || '').trim()}
                                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-40">
                                {sendingNote === r.id ? <Spinner size="sm"/> : <><Send size={12}/> إرسال</>}
                              </button>
                            </div>
                            {noteAttachError && <p className="text-[11px] text-red-500 px-3 pb-2">{noteAttachError}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
        </div>
      )}

      {/* Attachment preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 left-4 text-white bg-white/20 rounded-full p-2 border-none cursor-pointer"
            onClick={() => setPreviewUrl(null)}><X size={20}/></button>
          <img src={previewUrl} alt="مرفق" className="max-w-full max-h-full object-contain rounded-xl"/>
        </div>
      )}

      {/* ── NOTES ── */}
      {tab === 'notes' && (
        <div className="card">
          <h3 className="font-bold text-sm mb-3">الملاحظات والتوجيهات</h3>
          {notesError
            ? <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">{notesError}</div>
            : notes.length === 0
              ? <p className="text-center text-slate-400 text-sm py-6">لا توجد ملاحظات موجهة لك</p>
              : <div className="space-y-3">
                  {notes.map(n => {
                    const clr = NOTE_COLOR[n.note_type] || NOTE_COLOR['توجيه']
                    return (
                      <div key={n.id} className={`rounded-xl p-3 ${clr.bg}`}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className={`badge text-xs ${clr.tc} border border-current/20`}>{n.note_type}</span>
                          <div className="text-right">
                            {n.event_title && <span className="text-xs text-slate-400">{n.event_title} · </span>}
                            <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                          </div>
                        </div>
                        <p className={`text-sm leading-relaxed ${clr.tc}`}>{n.content}</p>
                        {n.coach && <div className="text-xs text-slate-400 mt-1.5">— {n.coach.full_name}</div>}
                      </div>
                    )
                  })}
                </div>}
        </div>
      )}

      {/* ── BASIC MEASUREMENTS ── */}
      {tab === 'measurements' && (
        <div className="space-y-4">
          {activeMetrics.length === 0 && !hasBMI ? (
            <div className="card text-center py-8">
              <Ruler size={30} className="mx-auto text-slate-300 mb-2"/>
              <div className="font-bold text-slate-500 text-sm">لا توجد قياسات أساسية مسجلة</div>
              <div className="text-xs text-slate-400 mt-1">ستظهر قياساتك هنا بمجرد إدخالها من قِبل المدرب</div>
            </div>
          ) : (
            <>
              {activeMetrics.map(key => (
                <MetricCard key={key} metricKey={key} series={metricSeries[key]}
                  label={METRIC_LABELS[key]} unit={METRIC_UNITS[key]}/>
              ))}
              {hasBMI && (() => {
                const latest   = bmiSeries[bmiSeries.length - 1]
                const prev     = bmiSeries[bmiSeries.length - 2]
                const diff     = prev ? Math.round((latest.value - prev.value) * 100) / 100 : null
                const histDesc = [...bmiSeries].reverse()
                return (
                  <div className="card p-0 overflow-hidden">
                    <div className="flex items-start justify-between px-4 pt-4 pb-2">
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">مؤشر كتلة الجسم</div>
                        <div className="text-2xl font-extrabold text-slate-900 mt-0.5 leading-none">{latest.value}</div>
                        <div className="text-[11px] text-slate-400 mt-1">{formatDate(latest.date)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 pt-1">
                        <TrendChip diff={diff} unit="" higherIsBetter={null}/>
                        <span className="text-[10px] text-slate-400">{bmiSeries.length} قياس</span>
                      </div>
                    </div>
                    {bmiSeries.length >= 2 && <div className="px-2 pb-1"><MiniChart chartId="bmi" series={bmiSeries}/></div>}
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {histDesc.map((pt, idx) => {
                        const prevPt = histDesc[idx + 1]
                        const ptDiff = prevPt ? Math.round((pt.value - prevPt.value) * 100) / 100 : null
                        return (
                          <div key={pt.date + idx} className="flex items-center justify-between px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              {idx === 0 && <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">آخر</span>}
                              <span className="text-xs text-slate-500">
                                {new Date(pt.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {ptDiff !== null && (
                                <span className="text-[10px] font-bold text-slate-500">{ptDiff > 0 ? '+' : ''}{ptDiff}</span>
                              )}
                              <span className="text-sm font-bold text-slate-800 tabular-nums">{pt.value}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* ── FITNESS ── */}
      {tab === 'fitness' && (
        <div className="space-y-5">
          {Object.keys(byTestKey).length === 0 ? (
            <div className="card text-center py-8">
              <Activity size={30} className="mx-auto text-slate-300 mb-2"/>
              <div className="font-bold text-slate-500 text-sm">لا توجد نتائج اختبارات لياقة</div>
              <div className="text-xs text-slate-400 mt-1">ستظهر نتائجك هنا بمجرد تسجيلها من قِبل المدرب</div>
            </div>
          ) : (
            Object.entries(fitnessByCategory).map(([category, testKeys]) => (
              <div key={category}>
                <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest px-1 mb-2">{category}</div>
                <div className="space-y-4">
                  {testKeys.map(tk => <TestCard key={tk} testKey={tk} results={byTestKey[tk]}/>)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── POINTS ── */}
      {tab === 'points' && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">كشف النقاط</h3>
              <div className={`text-2xl font-extrabold ${totalPoints > 0 ? 'text-emerald-600' : totalPoints < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                {totalPoints > 0 ? '+' : ''}{totalPoints} <span className="text-sm font-normal text-slate-400">نقطة</span>
              </div>
            </div>
            {pointsTxs.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <div className="text-base font-bold text-emerald-700">
                    +{pointsTxs.filter(t => (t.points || 0) > 0).reduce((s, t) => s + t.points, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">مكتسبة</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-base font-bold text-red-600">
                    {pointsTxs.filter(t => (t.points || 0) < 0).reduce((s, t) => s + t.points, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">مخصومة</div>
                </div>
              </div>
            )}
          </div>

          {/* Transaction ledger */}
          {pointsTxs.length === 0 ? (
            <div className="card text-center py-8">
              <Star size={30} className="mx-auto text-slate-300 mb-2"/>
              <div className="font-bold text-slate-500 text-sm">لا توجد نقاط مسجلة</div>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-slate-50">
                {txDesc.map((tx, idx) => {
                  const pts    = tx.points || 0
                  const isPos  = pts > 0
                  const d      = new Date(tx.created_at)
                  const dayStr = d.toLocaleDateString('ar-SA', { weekday: 'short' })
                  const datStr = d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                  const timStr = d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={tx.id || idx} className="flex items-start gap-3 px-4 py-3">
                      {/* Points badge */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-base
                        ${isPos ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {isPos ? `+${pts}` : pts}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800 truncate">
                            {tx.reason || 'نقاط'}
                          </span>
                          {tx.category && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {tx.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-bold text-slate-400">{dayStr}</span>
                          <span className="text-xs text-slate-400">· {datStr} · {timStr}</span>
                          {tx.is_auto && (
                            <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">تلقائي</span>
                          )}
                        </div>
                      </div>
                      {/* Running balance */}
                      <div className="flex-shrink-0 text-left">
                        <div className="text-xs font-bold text-slate-500 tabular-nums">{tx.balance}</div>
                        <div className="text-[9px] text-slate-400">الرصيد</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MATCHES TAB ── */}
      {tab === 'matches' && (
        matchStatsLoading
          ? <div className="flex justify-center py-10"><Spinner /></div>
          : !matchStats
            ? null
            : (() => {
                const userId = user!.id
                const myLineups = matchStats.lineups.filter((l: any) =>
                  (l.players || []).some((p: any) => p.user_id === userId && p.role !== 'excluded')
                )
                const myMatchIds = new Set(myLineups.map((l: any) => l.match_id))
                let filtMatches = matchStats.matches.filter((m: any) => myMatchIds.has(m.id))
                if (statsFilterTourn === '__friendly__') filtMatches = filtMatches.filter((m: any) => !m.tournament_id)
                else if (statsFilterTourn) filtMatches = filtMatches.filter((m: any) => m.tournament_id === statsFilterTourn)
                if (statsFilterFrom) filtMatches = filtMatches.filter((m: any) => m.match_date >= statsFilterFrom)
                if (statsFilterTo) filtMatches = filtMatches.filter((m: any) => m.match_date <= statsFilterTo + 'T23:59')
                const filtMatchIds = new Set(filtMatches.map((m: any) => m.id))
                const filtLineups = matchStats.lineups.filter((l: any) => filtMatchIds.has(l.match_id))
                const filtEvents = matchStats.events.filter((e: any) => filtMatchIds.has(e.match_id))

                let played = 0, starter = 0, sub = 0, minutes = 0
                let goals = 0, assists = 0, yellow = 0, red = 0, cleanSheets = 0
                for (const lineup of filtLineups) {
                  const plEntry = (lineup.players || []).find((p: any) => p.user_id === userId)
                  if (!plEntry || plEntry.role === 'excluded') continue
                  const mEvts = filtEvents.filter((e: any) => e.match_id === lineup.match_id)
                  const subOut = mEvts.find((e: any) => e.event_type === 'substitution' && e.player_out_id === userId)
                  const subIn = mEvts.find((e: any) => e.event_type === 'substitution' && e.player_id === userId)
                  if (plEntry.role === 'starter') {
                    starter++; played++
                    minutes += subOut?.minute || 90
                  } else if (plEntry.role === 'sub' && subIn) {
                    sub++; played++
                    minutes += 90 - (subIn.minute || 0)
                  }
                }
                for (const evt of filtEvents) {
                  if (evt.event_type === 'goal' && evt.player_id === userId) goals++
                  else if (evt.event_type === 'assist' && evt.player_id === userId) assists++
                  else if (evt.event_type === 'yellow_card' && evt.player_id === userId) yellow++
                  else if (evt.event_type === 'red_card' && evt.player_id === userId) red++
                  else if (evt.event_type === 'clean_sheet' && evt.player_id === userId) cleanSheets++
                }
                const matchList = [...filtMatches]
                  .sort((a: any, b: any) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())
                  .map((m: any) => {
                    const lineup = filtLineups.find((l: any) => l.match_id === m.id)
                    const plEntry = (lineup?.players || []).find((p: any) => p.user_id === userId)
                    const tourney = tournaments.find((t: any) => t.id === m.tournament_id)
                    const mEvts = filtEvents.filter((e: any) => e.match_id === m.id)
                    const plGoals = mEvts.filter((e: any) => e.event_type === 'goal' && e.player_id === userId).length
                    const plAssists = mEvts.filter((e: any) => e.event_type === 'assist' && e.player_id === userId).length
                    const plYellow = mEvts.filter((e: any) => e.event_type === 'yellow_card' && e.player_id === userId).length
                    const plRed = mEvts.filter((e: any) => e.event_type === 'red_card' && e.player_id === userId).length
                    const plCS = mEvts.filter((e: any) => e.event_type === 'clean_sheet' && e.player_id === userId).length
                    const hasResult = m.goals_for !== null && m.goals_against !== null
                    const result = hasResult
                      ? m.goals_for > m.goals_against ? { l: 'فوز', c: 'bg-emerald-100 text-emerald-700' }
                      : m.goals_for === m.goals_against ? { l: 'تعادل', c: 'bg-amber-100 text-amber-700' }
                      : { l: 'خسارة', c: 'bg-red-100 text-red-700' } : null
                    return { ...m, playerRole: plEntry?.role, tourney, plGoals, plAssists, plYellow, plRed, plCS, result, hasResult }
                  })

                return (
                  <div className="space-y-3">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Filter size={13} className="text-slate-400 flex-shrink-0" />
                      <select className="form-input text-xs" style={{ maxWidth: 160 }} value={statsFilterTourn} onChange={e => setStatsFilterTourn(e.target.value)}>
                        <option value="">كل المباريات</option>
                        <option value="__friendly__">ودية فقط</option>
                        {tournaments.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <input type="date" className="form-input text-xs" style={{ maxWidth: 135 }} value={statsFilterFrom} onChange={e => setStatsFilterFrom(e.target.value)} />
                      <input type="date" className="form-input text-xs" style={{ maxWidth: 135 }} value={statsFilterTo} onChange={e => setStatsFilterTo(e.target.value)} />
                      {(statsFilterTourn || statsFilterFrom || statsFilterTo) && (
                        <button onClick={() => { setStatsFilterTourn(''); setStatsFilterFrom(''); setStatsFilterTo('') }}
                          className="text-xs text-red-500 hover:underline flex items-center gap-0.5">
                          <X size={11} /> مسح
                        </button>
                      )}
                    </div>

                    {/* Summary grids */}
                    <div className="grid grid-cols-4 gap-2">
                      {([['م', played, 'text-slate-700'], ['أساسي', starter, 'text-blue-600'], ['بديل', sub, 'text-amber-600'], ['دقائق', minutes, 'text-slate-600']] as [string, number, string][]).map(([l, v, c]) => (
                        <div key={l} className="bg-slate-50 rounded-xl p-2.5 text-center">
                          <div className={`text-lg font-bold ${c}`}>{v}</div>
                          <div className="text-[10px] text-slate-400">{l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {([['⚽', goals, 'text-emerald-600'], ['🎯', assists, 'text-blue-500'], ['🟡', yellow, 'text-yellow-600'], ['🔴', red, 'text-red-600'], ['🥅', cleanSheets, 'text-teal-600']] as [string, number, string][]).map(([l, v, c]) => (
                        <div key={l} className="bg-slate-50 rounded-xl p-2.5 text-center">
                          <div className={`text-base font-bold ${c}`}>{v}</div>
                          <div className="text-[11px] text-slate-400">{l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Match list */}
                    {matchList.length === 0
                      ? <div className="card text-center text-slate-400 py-8 text-sm">لا توجد مباريات بهذا الفلتر</div>
                      : <div className="space-y-2">
                          {matchList.map((m: any) => (
                            <div key={m.id} className="card mb-0">
                              <div className="flex items-center gap-3">
                                <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${m.result?.l === 'فوز' ? 'bg-emerald-50' : m.result?.l === 'خسارة' ? 'bg-red-50' : m.result?.l === 'تعادل' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                                  {m.hasResult
                                    ? <><span className="text-base font-bold">{m.goals_for}-{m.goals_against}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.result!.c}`}>{m.result!.l}</span></>
                                    : <span className="text-xl">⚽</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm truncate">ضد {m.opponent || '—'}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {new Date(m.match_date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                                  </div>
                                  <div className="flex gap-1.5 mt-1 flex-wrap">
                                    {m.tourney ? <span className="badge badge-purple text-[10px]">{m.tourney.name}</span> : <span className="badge badge-gray text-[10px]">ودية</span>}
                                    <span className={`badge text-[10px] ${m.playerRole === 'starter' ? 'badge-blue' : 'bg-amber-100 text-amber-700'}`}>
                                      {m.playerRole === 'starter' ? 'أساسي' : 'بديل'}
                                    </span>
                                    {m.plGoals > 0 && <span className="badge badge-green text-[10px]">⚽ {m.plGoals}</span>}
                                    {m.plAssists > 0 && <span className="badge badge-blue text-[10px]">🎯 {m.plAssists}</span>}
                                    {m.plYellow > 0 && <span className="badge bg-yellow-100 text-yellow-700 text-[10px]">🟡</span>}
                                    {m.plRed > 0 && <span className="badge bg-red-100 text-red-700 text-[10px]">🔴</span>}
                                    {m.plCS > 0 && <span className="badge bg-teal-100 text-teal-700 text-[10px]">🥅</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                )
              })()
      )}

      {/* ── EVALUATIONS TAB ── */}
      {tab === 'evaluations' && (
        evalLoading
          ? <div className="flex justify-center py-10"><Spinner /></div>
          : (() => {
              const active = getActiveIndicators(evalIndicators)
              const strengthAvg = calcStrengthAvg(active)
              const devAvg = calcDevAvg(active)
              const minCount = evalSettings?.minimum_indicators_for_overall_score ?? 5
              const overallAvg = calcOverallAvg(active, minCount)
              const improvRate = calcImprovementRate(active)
              const strengths = active.filter((i: any) => i.indicator_type === 'strength')
              const developments = active.filter((i: any) => i.indicator_type === 'development')
              const seasonOpts = getSeasonOptions()

              return (
                <div className="space-y-4">
                  {/* Season selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">الموسم:</span>
                    <select className="form-input text-xs" style={{ maxWidth: 160 }} value={evalSeason} onChange={e => setEvalSeason(e.target.value)}>
                      {seasonOpts.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Summary cards */}
                  {active.length === 0
                    ? <div className="card text-center py-10">
                        <BarChart2 size={30} className="mx-auto text-slate-300 mb-2" />
                        <div className="font-bold text-slate-500 text-sm">لا توجد تقييمات لهذا الموسم</div>
                        <div className="text-xs text-slate-400 mt-1">يضيف المدرب التقييمات من قسم التقييمات الفنية والتكتيكية</div>
                      </div>
                    : <>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['نقاط القوة', strengthAvg !== null ? fmtScore(strengthAvg) : '—', 'text-emerald-600', 'bg-emerald-50'],
                            ['مؤشرات التطوير', devAvg !== null ? fmtScore(devAvg) : '—', 'text-amber-600', 'bg-amber-50'],
                            ['المتوسط العام', overallAvg !== null ? fmtScore(overallAvg) : '—', 'text-brand-600', 'bg-brand-50'],
                            ['معدل التحسن', improvRate !== null ? (improvRate > 0 ? `+${fmtScore(improvRate)}` : fmtScore(improvRate)) : '—', improvRate !== null && improvRate > 0 ? 'text-emerald-600' : 'text-slate-600', 'bg-slate-50'],
                          ] as [string, string, string, string][]).map(([l, v, tc, bg]) => (
                            <div key={l} className={`${bg} rounded-xl p-3 text-center`}>
                              <div className={`text-xl font-extrabold ${tc}`}>{v}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{l}</div>
                            </div>
                          ))}
                        </div>

                        {/* Strengths */}
                        {strengths.length > 0 && (
                          <div>
                            <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1 mb-2">نقاط القوة ({strengths.length})</div>
                            <div className="space-y-2">
                              {strengths.map((ind: any) => {
                                const diff = ind.current_score - ind.start_score
                                const spark = buildIndicatorSparkline(ind)
                                return (
                                  <div key={ind.id} className="card mb-0 p-3">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-extrabold text-sm flex-shrink-0
                                        ${ind.current_score >= 8 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                        : ind.current_score >= 6 ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : ind.current_score >= 4 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                        : 'bg-red-50 text-red-600 border-red-200'}`}>
                                        {ind.current_score}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-slate-800 truncate">{ind.indicator_name}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[ind.category as keyof typeof CATEGORY_COLORS] || 'bg-slate-100 text-slate-600'}`}>
                                            {CATEGORY_LABELS[ind.category as keyof typeof CATEGORY_LABELS] || ind.category}
                                          </span>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColorClass(diff)}`}>
                                            {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='} {getStatusLabel(diff)}
                                          </span>
                                        </div>
                                      </div>
                                      {spark.length >= 2 && (() => {
                                        const last = spark[spark.length - 1], prev = spark[spark.length - 2]
                                        const color = last > prev ? '#10b981' : last < prev ? '#ef4444' : '#94a3b8'
                                        const min = Math.min(...spark), max = Math.max(...spark), range = max - min || 1
                                        const W = 50, H = 20, pad = 2
                                        const rtl = [...spark].reverse()
                                        const pts = rtl.map((v: number, i: number) => {
                                          const x = pad + (i / (rtl.length - 1)) * (W - pad * 2)
                                          const y = H - pad - ((v - min) / range) * (H - pad * 2)
                                          return `${x},${y}`
                                        }).join(' ')
                                        return (
                                          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
                                            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                          </svg>
                                        )
                                      })()}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Development */}
                        {developments.length > 0 && (
                          <div>
                            <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest px-1 mb-2">مؤشرات التطوير ({developments.length})</div>
                            <div className="space-y-2">
                              {developments.map((ind: any) => {
                                const diff = ind.current_score - ind.start_score
                                const spark = buildIndicatorSparkline(ind)
                                return (
                                  <div key={ind.id} className="card mb-0 p-3">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-extrabold text-sm flex-shrink-0
                                        ${ind.current_score >= 8 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                        : ind.current_score >= 6 ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : ind.current_score >= 4 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                        : 'bg-red-50 text-red-600 border-red-200'}`}>
                                        {ind.current_score}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-slate-800 truncate">{ind.indicator_name}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[ind.category as keyof typeof CATEGORY_COLORS] || 'bg-slate-100 text-slate-600'}`}>
                                            {CATEGORY_LABELS[ind.category as keyof typeof CATEGORY_LABELS] || ind.category}
                                          </span>
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColorClass(diff)}`}>
                                            {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='} {getStatusLabel(diff)}
                                          </span>
                                        </div>
                                      </div>
                                      {spark.length >= 2 && (() => {
                                        const last = spark[spark.length - 1], prev = spark[spark.length - 2]
                                        const color = last > prev ? '#10b981' : last < prev ? '#ef4444' : '#94a3b8'
                                        const min = Math.min(...spark), max = Math.max(...spark), range = max - min || 1
                                        const W = 50, H = 20, pad = 2
                                        const rtl = [...spark].reverse()
                                        const pts = rtl.map((v: number, i: number) => {
                                          const x = pad + (i / (rtl.length - 1)) * (W - pad * 2)
                                          const y = H - pad - ((v - min) / range) * (H - pad * 2)
                                          return `${x},${y}`
                                        }).join(' ')
                                        return (
                                          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
                                            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                          </svg>
                                        )
                                      })()}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                  }
                </div>
              )
            })()
      )}
    </div>
  )
}
