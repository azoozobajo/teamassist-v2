import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trophy, ChevronDown, ChevronUp, Send, ExternalLink,
  Paperclip, ArrowUpDown, ChevronRight,
  X, AlertCircle, Image, FileText,
  Ruler, Activity, Star, CheckSquare, DollarSign, Stethoscope, BookOpen, BarChart2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, noteService, notificationService, medicalService, financeService, pointsService, eventService, measurementService, fitnessService, rewardService, matchStatsService, tournamentService, technicalEvalService, leaveService, adminDecisionService } from '../../services'
import {
  getCurrentSeason, getSeasonOptions, getActiveIndicators,
  calcStrengthAvg, calcDevAvg, calcOverallAvg, calcImprovementRate,
  fmtScore, CATEGORY_LABELS, CATEGORY_COLORS, buildIndicatorSparkline,
  getStatusLabel, getStatusColorClass,
} from '../../utils/technicalEvalHelpers'
import { Spinner, PageHeader, SearchBox, Avatar, Modal, FormField, EmptyState, ProgressBar } from '../../components/ui'
import { NOTE_TYPES, canManageEvents, canManageTeam, formatDate, RIYAL } from '../../utils/helpers'
import { getTestDef } from '../../utils/fitnessTestDefinitions'
import { METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, getMetricTimeSeries, getBMITimeSeries } from '../../utils/measurementHelpers'
import { PositionBadges } from '../../components/sports/PositionBadges'
import { NotesSummaryBox } from '../../components/player/NotesSummaryBox'

const NOTE_COLOR: Record<string, { bg: string; tc: string }> = {
  مدح:   { bg: 'bg-emerald-50', tc: 'text-emerald-700' },
  توجيه: { bg: 'bg-blue-50',    tc: 'text-blue-700' },
  تحذير: { bg: 'bg-red-50',     tc: 'text-red-700' },
  تطوير: { bg: 'bg-amber-50',   tc: 'text-amber-700' },
}

const METRIC_HIGHER_IS_BETTER: Record<string, boolean | null> = {
  standing_height_cm: true, sitting_height_cm: true, weight_kg: null,
  body_fat_percent: false, body_fat_mass_kg: false,
  muscle_percent: true, muscle_mass_kg: true, bmi: null,
}

const ATT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  present:   { label: 'حاضر',  color: 'text-emerald-600 bg-emerald-50' },
  absent:    { label: 'غائب',  color: 'text-red-600 bg-red-50' },
  late:      { label: 'متأخر', color: 'text-amber-600 bg-amber-50' },
  excused:   { label: 'بعذر',  color: 'text-slate-600 bg-slate-100' },
  uncertain: { label: 'غير متأكد', color: 'text-amber-700 bg-amber-50' },
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

function MiniChartPl({ chartId, series }: { chartId: string; series: Array<{ date: string; value: number }> }) {
  if (series.length < 2) return null
  const W = 300, H = 90, PX = 28, CTOP = 6, CBOT = 68
  const vals = series.map(p => p.value)
  const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1
  const xs = series.map((_, i) => PX + (i / (series.length - 1)) * (W - PX - 8))
  const ys = series.map(p => CTOP + (1 - (p.value - minV) / range) * (CBOT - CTOP))
  const pts     = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fillPts = [`${xs[0].toFixed(1)},${CBOT + 1}`, pts, `${xs[xs.length - 1].toFixed(1)},${CBOT + 1}`].join(' ')
  const gradId  = `plcg_${chartId.replace(/[^a-z0-9]/gi, '_')}`
  const C = '#6366f1'
  const fmtD = (d: string) => new Date(d).toLocaleDateString('ar-SA', { month: 'numeric', day: 'numeric' })
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
        const gy = CTOP + t * (CBOT - CTOP), val = maxV - t * range
        return (
          <g key={gi}>
            <line x1={PX} y1={gy.toFixed(1)} x2={W - 4} y2={gy.toFixed(1)} stroke="#e2e8f0" strokeWidth="0.7" strokeDasharray="3,3"/>
            <text x={PX - 4} y={gy.toFixed(1)} fontSize="7.5" fill="#94a3b8" textAnchor="end" dominantBaseline="middle">
              {val % 1 === 0 ? Math.round(val) : val.toFixed(1)}
            </text>
          </g>
        )
      })}
      <polygon points={fillPts} fill={`url(#${gradId})`}/>
      <polyline points={pts} fill="none" stroke={C} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {xs.map((x, i) => (
        <circle key={i} cx={x.toFixed(1)} cy={ys[i].toFixed(1)} r={i === xs.length - 1 ? 4 : 2.5}
          fill={i === xs.length - 1 ? C : '#fff'} stroke={C} strokeWidth="1.5"/>
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

function TrendChipPl({ diff, unit, higherIsBetter }: { diff: number | null; unit: string; higherIsBetter: boolean | null }) {
  if (diff === null) return <span className="text-[11px] text-slate-400">أول قياس</span>
  const inc = diff > 0
  const isGood = higherIsBetter === null || diff === 0 ? null : inc === higherIsBetter
  const cls = diff === 0 ? 'text-slate-400 bg-slate-100'
    : isGood === null ? 'text-slate-600 bg-slate-100'
    : isGood ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
  const arrow = diff === 0 ? '—' : inc ? '↑' : '↓'
  const absVal = Math.abs(diff), display = absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(1)
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[11px] font-bold ${cls}`}>
      {arrow} {diff > 0 ? '+' : ''}{display} {unit}
    </span>
  )
}

function MetricCardPl({ metricKey, series, label, unit }: {
  metricKey: string; series: Array<{ date: string; value: number }>; label: string; unit: string
}) {
  const hib = METRIC_HIGHER_IS_BETTER[metricKey] ?? null
  const latest = series[series.length - 1], prev = series[series.length - 2]
  const diff = prev ? Math.round((latest.value - prev.value) * 1000) / 1000 : null
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
          <TrendChipPl diff={diff} unit={unit} higherIsBetter={hib}/>
          <span className="text-[10px] text-slate-400">{series.length} قياس</span>
        </div>
      </div>
      {series.length >= 2 && (
        <div className="px-2 pb-1"><MiniChartPl chartId={metricKey} series={series}/></div>
      )}
      <div className="border-t border-slate-100 divide-y divide-slate-50">
        {histDesc.map((pt, idx) => {
          const prevPt = histDesc[idx + 1]
          const ptDiff = prevPt ? Math.round((pt.value - prevPt.value) * 1000) / 1000 : null
          const absD = ptDiff !== null ? Math.abs(ptDiff) : null
          const dispD = absD !== null ? (absD % 1 === 0 ? absD.toFixed(0) : absD.toFixed(1)) : null
          const dClr = ptDiff === null ? '' : ptDiff === 0 ? 'text-slate-400'
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

function TestCardPl({ testKey, results }: { testKey: string; results: any[] }) {
  const def = getTestDef(testKey)
  const unit = def?.result_unit || ''
  const hib: boolean | null = def?.best_rule === 'highest' ? true : def?.best_rule === 'lowest' ? false : null
  const series = results.map(r => ({ date: r.test_date, value: Number(r.official_result) }))
  const latest = series[series.length - 1], prev = series[series.length - 2]
  const diff = prev ? Math.round((latest.value - prev.value) * 1000) / 1000 : null
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
          <TrendChipPl diff={diff} unit={unit} higherIsBetter={hib}/>
          <span className="text-[10px] text-slate-400">{series.length} تجربة</span>
          {hib !== null && <span className="text-[9px] text-slate-400">{hib ? '↑ الأعلى أفضل' : '↓ الأقل أفضل'}</span>}
        </div>
      </div>
      {series.length >= 2 && (
        <div className="px-2 pb-1"><MiniChartPl chartId={testKey} series={series}/></div>
      )}
      <div className="border-t border-slate-100 divide-y divide-slate-50">
        {histDesc.map((pt, idx) => {
          const prevPt = histDesc[idx + 1]
          const ptDiff = prevPt ? Math.round((pt.value - prevPt.value) * 1000) / 1000 : null
          const absD = ptDiff !== null ? Math.abs(ptDiff) : null
          const dispD = absD !== null ? (absD % 1 === 0 ? absD.toFixed(0) : absD.toFixed(2)) : null
          const dClr = ptDiff === null ? '' : ptDiff === 0 ? 'text-slate-400'
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

const CASE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  active:     { label: 'نشط',          color: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  monitoring: { label: 'تحت المراقبة', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  recovered:  { label: 'تعافٍ',        color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

const CASE_NOTE_TYPES = [
  { key: 'followup',     label: 'متابعة' },
  { key: 'prescription', label: 'وصفة' },
  { key: 'therapy',      label: 'جلسات' },
  { key: 'xray',         label: 'أشعة' },
  { key: 'comment',      label: 'تعليق' },
]

const REPORT_TYPES = [
  { key: 'injury',   label: '🦴 إصابة',    color: 'bg-red-100 text-red-700' },
  { key: 'checkup',  label: '🩺 كشف دوري', color: 'bg-blue-100 text-blue-700' },
  { key: 'followup', label: '📋 متابعة',    color: 'bg-amber-100 text-amber-700' },
  { key: 'other',    label: '📝 أخرى',      color: 'bg-slate-100 text-slate-600' },
]

type SortKey = 'join_asc' | 'join_desc' | 'age_asc' | 'age_desc' | 'att_asc' | 'att_desc' | 'inj_asc' | 'inj_desc'

interface PlayerStat {
  attendancePct: number
  effectiveAttPct: number
  generalAttPct: number
  excusedCount: number
  totalEvents: number
  injuryCount: number
  points: number
  matchesPlayed: number
  isAvailable: boolean
}

function calcAge(dob: string | undefined): number | null {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function formatFullDate(dateStr: string | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
}

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
}

function parseAttachments(url: string | null | undefined): string[] {
  if (!url) return []
  try {
    const parsed = JSON.parse(url)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return [url]
}

function FileIcon({ name }: { name: string }) {
  return name.toLowerCase().endsWith('.pdf')
    ? <FileText size={13} className="text-red-500 flex-shrink-0"/>
    : <Image size={13} className="text-blue-500 flex-shrink-0"/>
}

export default function PlayersPage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  // Members & roles
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')

  // Per-player stats (for sorting + display in list)
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStat>>({})
  const [loadingStats, setLoadingStats] = useState(false)

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('join_desc')
  const [showSort, setShowSort] = useState(false)

  // Selected player detail
  const [selPlayer, setSelPlayer] = useState<any>(null)
  const [playerNotes, setPlayerNotes] = useState<any[]>([])
  const [playerMedical, setPlayerMedical] = useState<any[]>([])
  const [playerFinance, setPlayerFinance] = useState<{ obligations: any[]; payments: any[] }>({ obligations: [], payments: [] })
  const [playerPts, setPlayerPts] = useState(0)
  const [detailTab, setDetailTab] = useState('matchstats')

  // Extended player data (for new tabs)
  const [playerAttendance, setPlayerAttendance] = useState<any[]>([])
  const [playerMeasurements, setPlayerMeasurements] = useState<any[]>([])
  const [playerFitnessResults, setPlayerFitnessResults] = useState<any[]>([])
  const [playerPointsTxs, setPlayerPointsTxs] = useState<any[]>([])
  const [playerRewards, setPlayerRewards] = useState<any[]>([])
  const [loadingPlayerData, setLoadingPlayerData] = useState(false)

  // Notes
  const [showNote, setShowNote] = useState(false)
  const [noteForm, setNoteForm] = useState({ note_type: 'مدح' as any, content: '', event_title: '', is_visible_to_player: false })
  const [saving, setSaving] = useState(false)
  const [saveNoteError, setSaveNoteError] = useState('')
  const [noteLoadError, setNoteLoadError] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // Match popup
  const [matchPopup, setMatchPopup] = useState<any>(null)

  // Injury cases
  const [showCaseModal, setShowCaseModal] = useState(false)
  const [caseForm, setCaseForm] = useState({ title: '', description: '', injury_date: '', report_type: 'injury' })
  const [caseAttachFiles, setCaseAttachFiles] = useState<File[]>([])
  const [caseAttachError, setCaseAttachError] = useState('')
  const [caseAttachUploading, setCaseAttachUploading] = useState(false)
  const [casePreviewUrl, setCasePreviewUrl] = useState<string | null>(null)
  const caseFileInputRef = useRef<HTMLInputElement>(null)
  const [savingCase, setSavingCase] = useState(false)
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [caseNotes, setCaseNotes] = useState<Record<string, any[]>>({})
  const [loadingCaseNotes, setLoadingCaseNotes] = useState<string | null>(null)
  const [caseNoteText, setCaseNoteText] = useState('')
  const [caseNoteType, setCaseNoteType] = useState('followup')
  const [sendingCaseNote, setSendingCaseNote] = useState(false)
  const [updatingCaseStatus, setUpdatingCaseStatus] = useState<string | null>(null)

  const [unreadNotes, setUnreadNotes] = useState<Record<string, number>>({})

  // Match stats for player detail
  const [allTournaments, setAllTournaments] = useState<any[]>([])
  const [playerMatchStats, setPlayerMatchStats] = useState<{ matches: any[]; lineups: any[]; events: any[] } | null>(null)
  const [playerMatchStatsLoading, setPlayerMatchStatsLoading] = useState(false)
  const [statsFilterTourn, setStatsFilterTourn] = useState('')
  const [statsFilterFrom, setStatsFilterFrom] = useState('')
  const [statsFilterTo, setStatsFilterTo] = useState('')

  // Technical evaluation for player detail
  const [playerEvalData, setPlayerEvalData] = useState<{ settings: any; indicators: any[] } | null>(null)
  const [playerEvalLoading, setPlayerEvalLoading] = useState(false)
  const [playerEvalSeason, setPlayerEvalSeason] = useState(getCurrentSeason())

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    tournamentService.getAll(teamId).then(t => setAllTournaments(t))
    teamService.getMembers(teamId).then(async m => {
      const players = m.filter((mem: any) => mem.role === 'player')
      setMembers(players)
      const counts: Record<string, number> = {}
      for (const mem of players) {
        counts[mem.user_id] = await noteService.getUnreadCount(teamId, mem.user_id)
      }
      setUnreadNotes(counts)
      setLoading(false)
      loadAllStats(players)
    })
  }, [teamId, user])

  async function loadAllStats(players: any[]) {
    if (!teamId) return
    setLoadingStats(true)

    const today = new Date().toISOString().slice(0, 10)

    // Team-level data (single fetches)
    const [{ lineups }, allMedical, allLeaves, allDecisions] = await Promise.all([
      matchStatsService.getTeamMatchStats(teamId),
      medicalService.getReports(teamId),
      leaveService.getAll(teamId),
      adminDecisionService.getAll(teamId),
    ])

    // Matches played count per player (starter or sub = actually played)
    const matchCountMap: Record<string, number> = {}
    for (const lineup of (lineups as any[])) {
      for (const p of (lineup.players || [])) {
        if (p.role === 'starter' || p.role === 'sub') {
          matchCountMap[p.user_id] = (matchCountMap[p.user_id] || 0) + 1
        }
      }
    }

    // Medical reports grouped by player
    const medicalByPlayer: Record<string, any[]> = {}
    for (const r of (allMedical as any[])) {
      if (!medicalByPlayer[r.player_id]) medicalByPlayer[r.player_id] = []
      medicalByPlayer[r.player_id].push(r)
    }

    // Active injury player IDs
    const activeInjuryIds = new Set(
      (allMedical as any[]).filter(r => r.status === 'active' || r.status === 'monitoring').map(r => r.player_id)
    )

    // Leave-unavailable today
    const leaveUnavailable = new Set(
      (allLeaves as any[]).filter(l => l.status === 'approved' && l.from_date <= today && l.to_date >= today).map(l => l.user_id)
    )

    // Admin decision unavailable today
    const decisionUnavailable = new Set<string>()
    for (const dec of (allDecisions as any[])) {
      if (dec.from_date <= today && dec.to_date >= today) {
        for (const uid of (dec.target_user_ids || [])) decisionUnavailable.add(uid)
      }
    }

    const statsMap: Record<string, PlayerStat> = {}
    await Promise.all(players.map(async (m: any) => {
      const [att, pts] = await Promise.all([
        eventService.getMyAttendance(teamId!, m.user_id),
        pointsService.getUserPointsTotal ? pointsService.getUserPointsTotal(teamId!, m.user_id) : Promise.resolve(0)
      ])
      const present = att.filter((a: any) => a.status === 'present' || a.status === 'late').length
      const excused = att.filter((a: any) => a.status === 'excused').length
      const total = att.length
      const effectiveDenom = total - excused
      const effectiveAttPct = effectiveDenom > 0 ? Math.round(present / effectiveDenom * 100) : (total > 0 ? 100 : 0)
      const generalAttPct = total > 0 ? Math.round(present / total * 100) : 0
      const playerMedical = medicalByPlayer[m.user_id] || []
      statsMap[m.user_id] = {
        attendancePct: effectiveAttPct,
        effectiveAttPct,
        generalAttPct,
        excusedCount: excused,
        totalEvents: total,
        injuryCount: playerMedical.filter((r: any) => r.report_type === 'injury').length,
        points: pts as number || 0,
        matchesPlayed: matchCountMap[m.user_id] || 0,
        isAvailable: !activeInjuryIds.has(m.user_id) && !leaveUnavailable.has(m.user_id) && !decisionUnavailable.has(m.user_id),
      }
    }))
    setPlayerStats(statsMap)
    setLoadingStats(false)
  }

  async function openPlayer(m: any) {
    setSelPlayer(m); setDetailTab('matchstats')
    setExpandedCaseId(null); setCaseNotes({})
    setNoteLoadError(''); setSaveNoteError('')
    setPlayerAttendance([]); setPlayerMeasurements([])
    setPlayerFitnessResults([]); setPlayerPointsTxs([]); setPlayerRewards([])
    setPlayerMatchStats(null); setStatsFilterTourn(''); setStatsFilterFrom(''); setStatsFilterTo('')
    setPlayerEvalData(null); setPlayerEvalSeason(getCurrentSeason())
    if (!teamId || !user) return
    setLoadingPlayerData(true)
    const isCoach = canManageEvents(myRole) || canManageTeam(myRole)
    const [notesResult, medical, finance, att, meas, fit, pts, rw] = await Promise.all([
      isCoach
        ? noteService.getPlayerNotesForCoach(teamId, m.user_id, user.id)
        : noteService.getMyNotes(teamId, m.user_id),
      medicalService.getPlayerReports(teamId, m.user_id),
      financeService.getPlayerFinance(teamId, m.user_id),
      eventService.getMyAttendance(teamId, m.user_id),
      measurementService.getPlayerMeasurements(teamId, m.user_id),
      fitnessService.getPlayerFitnessResults(teamId, m.user_id),
      pointsService.getPlayerTransactions(teamId, m.user_id),
      rewardService.getPlayerRewards(teamId, m.user_id),
    ])
    if (notesResult.error) {
      setNoteLoadError(notesResult.error.message)
    } else {
      setPlayerNotes(notesResult.data)
    }
    setPlayerMedical(medical)
    setPlayerFinance(finance)
    setPlayerAttendance(att)
    setPlayerMeasurements(meas)
    setPlayerFitnessResults(fit)
    setPlayerPointsTxs(pts)
    setPlayerRewards(rw)
    setPlayerPts(playerStats[m.user_id]?.points ?? 0)
    setLoadingPlayerData(false)
    await noteService.markRead(m.user_id, teamId)
    setUnreadNotes(p => ({ ...p, [m.user_id]: 0 }))
  }

  // Lazy-load match stats when stats tab is opened
  useEffect(() => {
    if (detailTab !== 'matchstats' || !selPlayer || !teamId || playerMatchStats || playerMatchStatsLoading) return
    setPlayerMatchStatsLoading(true)
    matchStatsService.getTeamMatchStats(teamId).then(data => {
      setPlayerMatchStats(data)
      setPlayerMatchStatsLoading(false)
    })
  }, [detailTab, selPlayer, teamId])

  // Lazy-load technical evaluation data when techeval tab is opened
  useEffect(() => {
    if (detailTab !== 'techeval' || !selPlayer || !teamId) return
    setPlayerEvalLoading(true)
    Promise.all([
      technicalEvalService.getSettings(teamId),
      technicalEvalService.getPlayerIndicators(teamId, selPlayer.user_id, playerEvalSeason),
    ]).then(([settings, indicators]) => {
      setPlayerEvalData({ settings, indicators })
      setPlayerEvalLoading(false)
    })
    // Also pre-load match stats if not loaded yet
    if (!playerMatchStats && !playerMatchStatsLoading) {
      setPlayerMatchStatsLoading(true)
      matchStatsService.getTeamMatchStats(teamId).then(data => {
        setPlayerMatchStats(data)
        setPlayerMatchStatsLoading(false)
      })
    }
  }, [detailTab, selPlayer, teamId, playerEvalSeason])

  async function saveNote() {
    if (!noteForm.content.trim() || !selPlayer || !teamId || !user) return
    setSaving(true); setSaveNoteError('')
    const { data: created, error } = await noteService.create({ ...noteForm, team_id: teamId, player_id: selPlayer.user_id, coach_id: user.id, is_read: false })
    if (error) {
      console.error('coach_notes insert error:', error)
      setSaveNoteError(`حدث خطأ في الحفظ: ${error.message || 'تأكد من تشغيل ملف SQL وصلاحياتك'}`)
      setSaving(false)
      return
    }
    // Notify the player only if the note is visible to them
    if (noteForm.is_visible_to_player) {
      notificationService.create({
        user_id: selPlayer.user_id,
        team_id: teamId,
        title: '📋 توجيه جديد من المدرب',
        body: `${noteForm.note_type}: ${noteForm.content.slice(0, 60)}${noteForm.content.length > 60 ? '...' : ''}`,
        type: 'mail',
        is_read: false,
      })
    }
    // Optimistically add the new note to the list immediately
    if (created) {
      setPlayerNotes(prev => [{ ...created, coach: { id: user.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url } }, ...prev])
    } else {
      const { data } = await noteService.getPlayerNotesForCoach(teamId, selPlayer.user_id, user.id)
      setPlayerNotes(data)
    }
    setShowNote(false)
    setNoteForm({ note_type: 'مدح', content: '', event_title: '', is_visible_to_player: false })
    setSaving(false)
  }

  async function submitReply(noteId: string) {
    if (!replyText.trim()) return
    setSendingReply(true)
    await noteService.addPlayerReply(noteId, replyText)
    setPlayerNotes(prev => prev.map(n => n.id === noteId
      ? { ...n, player_reply: replyText, player_replied_at: new Date().toISOString() }
      : n
    ))
    setReplyingTo(null); setReplyText(''); setSendingReply(false)
  }

  function closeCaseModal() {
    setShowCaseModal(false)
    setCaseForm({ title: '', description: '', injury_date: '', report_type: 'injury' })
    setCaseAttachFiles([])
    setCaseAttachError('')
    if (caseFileInputRef.current) caseFileInputRef.current.value = ''
  }

  async function saveCase() {
    if (!caseForm.title || !selPlayer || !teamId || !user) return
    setSavingCase(true); setCaseAttachError('')

    let attachment_url: string | null = null

    if (caseAttachFiles.length > 0) {
      setCaseAttachUploading(true)
      const urls: string[] = []
      for (const file of caseAttachFiles) {
        const path = `${teamId}/${user.id}/${Date.now()}_${sanitizeFileName(file.name)}`
        const { url, error } = await medicalService.uploadAttachment(file, path)
        if (error || !url) {
          setCaseAttachError('فشل رفع الملف: ' + (error || 'خطأ غير معروف'))
          setCaseAttachUploading(false); setSavingCase(false); return
        }
        urls.push(url)
      }
      setCaseAttachUploading(false)
      attachment_url = urls.length === 1 ? urls[0] : JSON.stringify(urls)
    }

    await medicalService.createReport({
      team_id: teamId, player_id: selPlayer.user_id,
      title: caseForm.title, report_type: caseForm.report_type,
      description: caseForm.description || null,
      injury_date: caseForm.injury_date || null,
      status: 'active', submitted_by: user.id, attachment_url
    })
    const medical = await medicalService.getPlayerReports(teamId, selPlayer.user_id)
    setPlayerMedical(medical)
    closeCaseModal(); setSavingCase(false)
  }

  async function expandCase(id: string) {
    if (expandedCaseId === id) { setExpandedCaseId(null); return }
    setExpandedCaseId(id); setCaseNoteText(''); setCaseNoteType('followup')
    if (!caseNotes[id]) {
      setLoadingCaseNotes(id)
      const data = await medicalService.getNotes(id)
      setCaseNotes(prev => ({ ...prev, [id]: data }))
      setLoadingCaseNotes(null)
    }
  }

  async function addCaseNote(reportId: string) {
    if (!caseNoteText.trim() || !user || !teamId) return
    setSendingCaseNote(true)
    await medicalService.addNote({ report_id: reportId, team_id: teamId, author_id: user.id, note: caseNoteText, note_type: caseNoteType })
    const updated = await medicalService.getNotes(reportId)
    setCaseNotes(prev => ({ ...prev, [reportId]: updated }))
    setCaseNoteText(''); setSendingCaseNote(false)
  }

  async function updateCaseStatus(reportId: string, status: string) {
    setUpdatingCaseStatus(reportId)
    const patch: any = { status }
    if (status === 'recovered') patch.recovery_date = new Date().toISOString().slice(0, 10)
    await medicalService.updateReport(reportId, patch)
    setPlayerMedical(prev => prev.map(r => r.id === reportId ? { ...r, ...patch } : r))
    setUpdatingCaseStatus(null)
  }

  const isCoach = canManageEvents(myRole) || canManageTeam(myRole)
  const canWriteNote = isCoach

  // ── Sort & filter ──
  const filtered = members.filter(m => m.profile?.full_name?.includes(q))

  const sorted = [...filtered].sort((a, b) => {
    const as = playerStats[a.user_id]
    const bs = playerStats[b.user_id]
    switch (sortKey) {
      case 'join_desc': return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
      case 'join_asc':  return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
      case 'att_desc':  return (bs?.attendancePct ?? 0) - (as?.attendancePct ?? 0)
      case 'att_asc':   return (as?.attendancePct ?? 0) - (bs?.attendancePct ?? 0)
      case 'age_asc': {
        const ad = a.profile?.date_of_birth || '9999'
        const bd = b.profile?.date_of_birth || '9999'
        return bd.localeCompare(ad) // younger = more recent DOB
      }
      case 'age_desc': {
        const ad = a.profile?.date_of_birth || '0000'
        const bd = b.profile?.date_of_birth || '0000'
        return ad.localeCompare(bd) // older = earlier DOB
      }
      case 'inj_desc': return (bs?.injuryCount ?? 0) - (as?.injuryCount ?? 0)
      case 'inj_asc':  return (as?.injuryCount ?? 0) - (bs?.injuryCount ?? 0)
      default: return 0
    }
  })

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'join_desc', label: '📅 أحدث انضماماً' },
    { key: 'join_asc',  label: '📅 أقدم انضماماً' },
    { key: 'att_desc',  label: '✅ الأعلى حضوراً' },
    { key: 'att_asc',   label: '✅ الأقل حضوراً' },
    { key: 'age_asc',   label: '🎂 الأصغر سناً' },
    { key: 'age_desc',  label: '🎂 الأكبر سناً' },
    { key: 'inj_desc',  label: '🤕 الأكثر إصابات' },
    { key: 'inj_asc',   label: '🤕 الأقل إصابات' },
  ]

  const injuryCases = playerMedical.filter(r => r.report_type === 'injury')
  const activeInjuries = injuryCases.filter(r => r.status === 'active' || r.status === 'monitoring')

  // ══════════════════════════════════════════
  // PLAYER DETAIL VIEW
  // ══════════════════════════════════════════
  if (selPlayer) {
    const age = calcAge(selPlayer.profile?.date_of_birth)
    const stat = playerStats[selPlayer.user_id]

    // ── Attendance computed ──
    const plPresentCount  = playerAttendance.filter(a => a.status === 'present' || a.status === 'late').length
    const plExcusedCount  = playerAttendance.filter(a => a.status === 'excused').length
    const plTotalEvents   = playerAttendance.length
    const plEffDenom      = plTotalEvents - plExcusedCount
    const plAttPct        = plEffDenom > 0 ? Math.round(plPresentCount / plEffDenom * 100) : (plTotalEvents > 0 ? 100 : 0)
    const plEffAttPct     = plAttPct

    // ── Measurements computed ──
    const plMetricSeries: Record<string, Array<{ date: string; value: number }>> = {}
    METRIC_KEYS.forEach(k => { plMetricSeries[k] = getMetricTimeSeries(playerMeasurements, k) })
    const plBmiSeries    = getBMITimeSeries(playerMeasurements)
    const plActiveMetrics = METRIC_KEYS.filter(k => plMetricSeries[k].length > 0)
    const plHasBMI        = plBmiSeries.length > 0
    const plHSeries = plMetricSeries['standing_height_cm']
    const plWSeries = plMetricSeries['weight_kg']
    const plLatestHeight = plHSeries.length > 0 ? plHSeries[plHSeries.length - 1].value : null
    const plLatestWeight = plWSeries.length > 0 ? plWSeries[plWSeries.length - 1].value : null

    // ── Fitness computed ──
    const plByTestKey: Record<string, any[]> = {}
    playerFitnessResults.forEach(r => {
      if (!plByTestKey[r.test_key]) plByTestKey[r.test_key] = []
      plByTestKey[r.test_key].push(r)
    })
    Object.values(plByTestKey).forEach(arr =>
      arr.sort((a, b) => new Date(a.test_date).getTime() - new Date(b.test_date).getTime())
    )
    const plFitnessByCategory: Record<string, string[]> = {}
    Object.keys(plByTestKey).forEach(tk => {
      const cat = getTestDef(tk)?.category || 'أخرى'
      if (!plFitnessByCategory[cat]) plFitnessByCategory[cat] = []
      plFitnessByCategory[cat].push(tk)
    })

    // ── Points computed ──
    const plTotalPoints = playerPointsTxs.reduce((s, tx) => s + (tx.points || 0), 0)
    const plTxAsc = [...playerPointsTxs].reverse()
    let plRunning = 0
    const plTxWithBalance = plTxAsc.map(tx => {
      plRunning += tx.points || 0
      return { ...tx, balance: plRunning }
    })
    const plTxDesc = [...plTxWithBalance].reverse()

    // ── Finance computed ──
    const plGetMyPaid = (obId: string) => {
      const p = playerFinance.payments.find((p: any) => p.obligation_id === obId)
      return p?.paid_amount || 0
    }
    const plTotalRequired = playerFinance.obligations.reduce((s, o) => s + o.amount, 0)
    const plTotalPaid     = playerFinance.obligations.reduce((s, o) => s + plGetMyPaid(o.id), 0)
    const plFinancePct    = plTotalRequired > 0 ? Math.round(plTotalPaid / plTotalRequired * 100) : null

    // ── Health status ──
    const plHealthStatus = playerMedical.some(r => r.status === 'active')
      ? { label: 'مصاب', color: 'text-red-300' }
      : playerMedical.some(r => r.status === 'monitoring')
      ? { label: 'مراقبة', color: 'text-amber-300' }
      : { label: 'متعافي', color: 'text-emerald-300' }

    const DETAIL_TABS = [
      { key: 'notes',        icon: <BookOpen size={13}/>,    label: 'الملاحظات',       count: playerNotes.length },
      { key: 'medical',      icon: <Stethoscope size={13}/>, label: 'التقارير الطبية', count: injuryCases.length },
      { key: 'finance',      icon: <DollarSign size={13}/>,  label: 'المالية',         count: playerFinance.obligations.length },
      { key: 'measurements', icon: <Ruler size={13}/>,       label: 'القياسات',        count: plActiveMetrics.length + (plHasBMI ? 1 : 0) },
      { key: 'fitness',      icon: <Activity size={13}/>,    label: 'اللياقة',         count: Object.keys(plByTestKey).length },
      { key: 'attendance',   icon: <CheckSquare size={13}/>, label: 'الحضور',          count: plTotalEvents },
      { key: 'points',       icon: <Star size={13}/>,        label: 'النقاط',          count: playerPointsTxs.length },
      { key: 'matchstats',   icon: <BarChart2 size={13}/>,   label: 'إحصائيات',        count: undefined },
      { key: 'techeval',     icon: <Star size={13}/>,        label: 'التقييمات الفنية', count: undefined },
    ]

    return (
      <div>
        <button onClick={() => setSelPlayer(null)}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 mb-4 cursor-pointer">
          ← العودة للقائمة
        </button>

        {/* ── Player Header Card ── */}
        <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 text-white mb-4">
          <div className="flex items-center gap-4 mb-4">
            <Avatar name={selPlayer.profile?.full_name || '?'} src={selPlayer.profile?.avatar_url} size="xl"
              className="ring-4 ring-white/30 flex-shrink-0"/>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold">{selPlayer.profile?.full_name}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <PositionBadges member={selPlayer} />
                {age !== null && <span className="text-xs text-white/70">{age} سنة</span>}
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">انضم {formatFullDate(selPlayer.joined_at)}</div>
              {activeInjuries.length > 0 && (
                <div className="inline-flex items-center gap-1 bg-red-500/30 border border-red-300/40 rounded-lg px-2 py-0.5 mt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-300 animate-pulse"/>
                  <span className="text-xs text-red-100 font-bold">{activeInjuries.length} إصابة نشطة</span>
                </div>
              )}
            </div>
          </div>

          {/* 6-stat grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-base font-extrabold leading-none">{loadingPlayerData ? '…' : plLatestHeight != null ? plLatestHeight : '—'}</div>
              <div className="text-[10px] opacity-70 mt-0.5">الطول سم</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-base font-extrabold leading-none">{loadingPlayerData ? '…' : plLatestWeight != null ? plLatestWeight : '—'}</div>
              <div className="text-[10px] opacity-70 mt-0.5">الوزن كغ</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className={`text-base font-extrabold leading-none ${plFinancePct !== null ? (plFinancePct >= 100 ? 'text-emerald-300' : 'text-red-300') : ''}`}>
                {loadingPlayerData ? '…' : plFinancePct !== null ? `${plFinancePct}%` : '—'}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">المالية</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className={`text-sm font-extrabold leading-none ${plHealthStatus.color}`}>
                {loadingPlayerData ? '…' : plHealthStatus.label}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">الصحة</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-base font-extrabold leading-none">{loadingPlayerData ? '…' : plTotalEvents > 0 ? `${plAttPct}%` : '—'}</div>
              {!loadingPlayerData && plExcusedCount > 0 && (
                <div className="text-[9px] opacity-70">{plEffAttPct}% فعلي</div>
              )}
              <div className="text-[10px] opacity-70 mt-0.5">الحضور</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className={`text-base font-extrabold leading-none ${plTotalPoints > 0 ? 'text-yellow-300' : plTotalPoints < 0 ? 'text-red-300' : ''}`}>
                {loadingPlayerData ? '…' : plTotalPoints > 0 ? `+${plTotalPoints}` : plTotalPoints || '—'}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">النقاط</div>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-0.5">
          {DETAIL_TABS.map(t => (
            <button key={t.key} onClick={() => setDetailTab(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all
                ${detailTab === t.key
                  ? 'bg-brand-600 text-white shadow'
                  : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-100'}`}>
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
                  ${detailTab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loadingPlayerData && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
            <Spinner/> جارٍ تحميل بيانات اللاعب...
          </div>
        )}

        {/* ── Notes Tab ── */}
        {detailTab === 'notes' && !loadingPlayerData && (
          <div className="space-y-3">
            <NotesSummaryBox notes={playerNotes} showVisibilityBreakdown />
            <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-sm">الملاحظات</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ملاحظات خاصة بالملف — المدرب يختار إذا يراها اللاعب</p>
              </div>
              {canWriteNote && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowNote(true)}>
                  <Plus size={12}/> إضافة
                </button>
              )}
            </div>
            {noteLoadError ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
                <p className="font-bold text-red-700 text-sm mb-1">⚠️ لم يتم إعداد جدول الملاحظات</p>
                <p className="text-xs text-slate-500 mb-1">شغّل الملف التالي في Supabase Dashboard:</p>
                <code className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">supabase/coach_notes_setup.sql</code>
                <p className="text-[10px] text-red-400 mt-2 font-mono">{noteLoadError}</p>
              </div>
            ) : playerNotes.length === 0
              ? <EmptyState title="لا توجد ملاحظات"/>
              : <div className="space-y-3">
                  {playerNotes.map(n => {
                    const clr = NOTE_COLOR[n.note_type] || NOTE_COLOR['توجيه']
                    return (
                      <div key={n.id} className={`rounded-xl p-3 ${clr.bg}`}>
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`badge text-xs ${clr.bg} ${clr.tc} border border-current/20`}>{n.note_type}</span>
                            {n.is_visible_to_player
                              ? <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-1.5 py-0.5">مرئية للاعب</span>
                              : <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">خاصة</span>}
                          </div>
                          <div className="text-right">
                            {n.event_title && <span className="text-xs text-slate-400">{n.event_title} · </span>}
                            <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                          </div>
                        </div>
                        <p className={`text-sm leading-relaxed ${clr.tc}`}>{n.content}</p>
                        {n.coach && <div className="text-xs text-slate-400 mt-1.5">— {n.coach.full_name}</div>}
                        {n.player_reply && (
                          <div className="mt-2 bg-white/70 rounded-lg p-2.5 border border-current/10">
                            <div className="text-[10px] font-bold text-slate-500 mb-1">رد اللاعب · {formatDate(n.player_replied_at)}</div>
                            <p className="text-xs text-slate-700">{n.player_reply}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>}
            </div>
          </div>
        )}

        {/* ── Medical/Injuries Tab ── */}
        {detailTab === 'medical' && !loadingPlayerData && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800">التقارير الطبية</h3>
                {activeInjuries.length > 0 && (
                  <span className="badge bg-red-100 text-red-700 text-xs">{activeInjuries.length} نشط</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isCoach && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCaseModal(true)}>
                    <Plus size={12}/> فتح حالة
                  </button>
                )}
                <button onClick={() => navigate(`/team/${teamId}/medical?player=${selPlayer.user_id}`)}
                  className="btn btn-ghost btn-sm text-brand-600 border-brand-200">
                  <ExternalLink size={12}/> التقارير الطبية
                </button>
              </div>
            </div>

            {injuryCases.length === 0 ? (
              <div className="card text-center py-8">
                <div className="text-4xl mb-2">✅</div>
                <div className="font-bold text-slate-600 text-sm">لا توجد إصابات مسجلة</div>
              </div>
            ) : (
              injuryCases.map(cas => {
                const st = CASE_STATUS[cas.status as keyof typeof CASE_STATUS] || CASE_STATUS.active
                const isOpen = expandedCaseId === cas.id
                const notes = caseNotes[cas.id] || []
                const duration = cas.injury_date && cas.recovery_date
                  ? daysBetween(cas.injury_date, cas.recovery_date)
                  : cas.injury_date
                    ? daysBetween(cas.injury_date, new Date().toISOString().slice(0, 10))
                    : null

                return (
                  <div key={cas.id} className="card mb-0 p-0 overflow-hidden border border-slate-100">
                    <button className="w-full text-right p-4 border-none bg-transparent cursor-pointer"
                      onClick={() => expandCase(cas.id)}>
                      <div className="flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${st.dot}`}/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={`badge text-xs ${st.color}`}>{st.label}</span>
                            {duration !== null && (
                              <span className={`badge text-xs ${cas.status === 'recovered' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                {duration} يوم {cas.status === 'recovered' ? 'مدة التعافي' : 'منذ الإصابة'}
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-sm text-slate-800">{cas.title}</div>
                          {cas.description && <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cas.description}</div>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                            {cas.injury_date && <span>📅 {cas.injury_date}</span>}
                            {cas.recovery_date && <span>✅ {cas.recovery_date}</span>}
                            {caseNotes[cas.id]?.length > 0 && <span>💬 {caseNotes[cas.id].length} تحديث</span>}
                            {cas.attachment_url && (
                              <span className="flex items-center gap-0.5">
                                <Paperclip size={10}/>
                                {parseAttachments(cas.attachment_url).length} مرفق
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-slate-400">
                          {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100">
                        {isCoach && (
                          <div className="px-4 py-2.5 bg-slate-50 flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-500">تحديث الحالة:</span>
                            {Object.entries(CASE_STATUS).map(([key, cfg]) => (
                              <button key={key}
                                disabled={cas.status === key || updatingCaseStatus === cas.id}
                                onClick={() => updateCaseStatus(cas.id, key)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${cas.status === key ? cfg.color + ' border-transparent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                {updatingCaseStatus === cas.id ? <Spinner size="sm"/> : cfg.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="px-4 py-3 space-y-3">
                          {loadingCaseNotes === cas.id ? <div className="flex justify-center py-3"><Spinner/></div>
                            : notes.length === 0 ? <p className="text-xs text-slate-400 text-center py-2">لا توجد تحديثات بعد</p>
                            : notes.map((n: any) => {
                                const ntConf = CASE_NOTE_TYPES.find(t => t.key === n.note_type)
                                return (
                                  <div key={n.id} className="flex gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                      {n.author?.full_name?.[0] || '?'}
                                    </div>
                                    <div className="flex-1 bg-slate-50 rounded-xl p-2.5">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-xs font-bold text-slate-700">{n.author?.full_name}</span>
                                        {ntConf && <span className="badge bg-brand-50 text-brand-700 text-[10px]">{ntConf.label}</span>}
                                        <span className="text-xs text-slate-400 mr-auto">{new Date(n.created_at).toLocaleDateString('ar-SA')}</span>
                                      </div>
                                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
                                    </div>
                                  </div>
                                )
                              })}
                          {isCoach && (
                            <div className="border-t border-slate-100 pt-3">
                              <div className="flex flex-wrap gap-1 mb-2">
                                {CASE_NOTE_TYPES.map(t => (
                                  <button key={t.key} onClick={() => setCaseNoteType(t.key)}
                                    className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all ${caseNoteType === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <textarea rows={2} value={caseNoteText} onChange={e => setCaseNoteText(e.target.value)}
                                  placeholder="أضف تحديثاً للحالة..."
                                  className="form-input flex-1 resize-none text-xs"/>
                                <button onClick={() => addCaseNote(cas.id)}
                                  disabled={sendingCaseNote || !caseNoteText.trim()}
                                  className="w-8 h-8 self-end bg-brand-500 rounded-lg flex items-center justify-center text-white hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50">
                                  {sendingCaseNote ? <Spinner size="sm"/> : <Send size={13}/>}
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Attachments */}
                          {cas.attachment_url && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {parseAttachments(cas.attachment_url).map((url: string, idx: number) => (
                                <button key={idx} onClick={() => setCasePreviewUrl(url)}
                                  className="inline-flex items-center gap-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-2 py-1 border-none cursor-pointer transition-colors">
                                  <Paperclip size={11}/> مرفق {idx + 1}
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => navigate(`/team/${teamId}/medical?player=${selPlayer.user_id}`)}
                            className="text-xs text-brand-600 hover:underline flex items-center gap-1 border-none bg-transparent cursor-pointer">
                            <ExternalLink size={11}/> فتح الملف الطبي الكامل
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Finance Tab ── */}
        {detailTab === 'finance' && !loadingPlayerData && (
          <div className="space-y-3">
            {/* Obligations */}
            <div className="card">
              <h3 className="font-bold text-sm mb-3">المستحقات المالية</h3>
              {playerFinance.obligations.length === 0
                ? <div className="text-center py-4 text-slate-400 text-sm">لا توجد مستحقات مالية</div>
                : <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="stat-box"><div className="stat-value text-base">{plTotalRequired} {RIYAL}</div><div className="stat-label">المطلوب</div></div>
                      <div className="stat-box"><div className="stat-value text-base text-emerald-600">{plTotalPaid} {RIYAL}</div><div className="stat-label">المسدد</div></div>
                      <div className="stat-box"><div className="stat-value text-base text-red-600">{(plTotalRequired - plTotalPaid).toFixed(0)} {RIYAL}</div><div className="stat-label">المتبقي</div></div>
                    </div>
                    <div className="space-y-3">
                      {playerFinance.obligations.map(o => {
                        const paid = plGetMyPaid(o.id)
                        const pct = Math.round(paid / o.amount * 100)
                        return (
                          <div key={o.id}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-bold">{o.title}</span>
                              <span className="text-slate-500">{paid}/{o.amount} {RIYAL}</span>
                            </div>
                            <ProgressBar value={pct} color={paid >= o.amount ? 'bg-emerald-500' : 'bg-amber-400'}/>
                            {o.due_date && <div className="text-xs text-slate-400 mt-0.5">الاستحقاق: {o.due_date}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </>}
            </div>

            {/* Rewards */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">المكافآت</h3>
                {playerRewards.length > 0 && (
                  <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">
                    +{playerRewards.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()} {RIYAL}
                  </span>
                )}
              </div>
              {playerRewards.length === 0
                ? <div className="text-center py-4 text-slate-400 text-sm">لا توجد مكافآت</div>
                : <div className="space-y-2">
                    {playerRewards.map(r => (
                      <div key={r.id} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">🎁</span>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-800 truncate">{r.title}</div>
                            {r.notes && <div className="text-xs text-slate-400 truncate">{r.notes}</div>}
                            <div className="text-xs text-slate-400">{(r.created_at || '').slice(0, 10)}</div>
                          </div>
                        </div>
                        <div className="text-sm font-extrabold text-emerald-600 flex-shrink-0 mr-2">
                          +{Number(r.amount).toLocaleString()} {RIYAL}
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        )}

        {/* ── Measurements Tab ── */}
        {detailTab === 'measurements' && !loadingPlayerData && (
          <div className="space-y-4">
            {plActiveMetrics.length === 0 && !plHasBMI ? (
              <div className="card text-center py-8">
                <Ruler size={30} className="mx-auto text-slate-300 mb-2"/>
                <div className="font-bold text-slate-500 text-sm">لا توجد قياسات أساسية مسجلة</div>
              </div>
            ) : (
              <>
                {plActiveMetrics.map(key => (
                  <MetricCardPl key={key} metricKey={key} series={plMetricSeries[key]}
                    label={METRIC_LABELS[key]} unit={METRIC_UNITS[key]}/>
                ))}
                {plHasBMI && (() => {
                  const latest   = plBmiSeries[plBmiSeries.length - 1]
                  const prev     = plBmiSeries[plBmiSeries.length - 2]
                  const diff     = prev ? Math.round((latest.value - prev.value) * 100) / 100 : null
                  const histDesc = [...plBmiSeries].reverse()
                  return (
                    <div className="card p-0 overflow-hidden">
                      <div className="flex items-start justify-between px-4 pt-4 pb-2">
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">مؤشر كتلة الجسم</div>
                          <div className="text-2xl font-extrabold text-slate-900 mt-0.5 leading-none">{latest.value}</div>
                          <div className="text-[11px] text-slate-400 mt-1">{formatDate(latest.date)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 pt-1">
                          <TrendChipPl diff={diff} unit="" higherIsBetter={null}/>
                          <span className="text-[10px] text-slate-400">{plBmiSeries.length} قياس</span>
                        </div>
                      </div>
                      {plBmiSeries.length >= 2 && <div className="px-2 pb-1"><MiniChartPl chartId="bmi_pl" series={plBmiSeries}/></div>}
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

        {/* ── Fitness Tab ── */}
        {detailTab === 'fitness' && !loadingPlayerData && (
          <div className="space-y-5">
            {Object.keys(plByTestKey).length === 0 ? (
              <div className="card text-center py-8">
                <Activity size={30} className="mx-auto text-slate-300 mb-2"/>
                <div className="font-bold text-slate-500 text-sm">لا توجد نتائج اختبارات لياقة</div>
              </div>
            ) : (
              Object.entries(plFitnessByCategory).map(([category, testKeys]) => (
                <div key={category}>
                  <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest px-1 mb-2">{category}</div>
                  <div className="space-y-4">
                    {testKeys.map(tk => <TestCardPl key={tk} testKey={tk} results={plByTestKey[tk]}/>)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Attendance Tab ── */}
        {detailTab === 'attendance' && !loadingPlayerData && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">سجل الحضور والغياب</h3>
              <div className="flex flex-col items-end gap-1">
                {plTotalEvents > 0 && (
                  <span className={`badge text-xs font-bold ${plAttPct >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {plPresentCount}/{plEffDenom} · فعلي {plAttPct}%
                  </span>
                )}
                {plExcusedCount > 0 && (
                  <span className={`badge text-xs font-bold ${plEffAttPct >= 70 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    لا تحتسب الأعذار في النسبة <span className="font-normal opacity-70">(بعذر: {plExcusedCount})</span>
                  </span>
                )}
              </div>
            </div>
            {playerAttendance.length === 0
              ? <p className="text-center text-slate-400 text-sm py-6">لا توجد سجلات حضور</p>
              : <div className="space-y-2">
                  {[...playerAttendance].sort((a, b) =>
                    new Date(b.event?.start_time || b.created_at).getTime() -
                    new Date(a.event?.start_datetime || a.created_at).getTime()
                  ).map(a => {
                    const st  = ATT_STATUS_LABELS[a.status] || { label: a.status, color: 'text-slate-600 bg-slate-100' }
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
                            <div className="text-[11px] text-slate-500 mt-1 bg-slate-100 rounded px-2 py-0.5">العذر: {a.excuse_reason}</div>
                          )}
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${st.color}`}>{st.label}</span>
                      </div>
                    )
                  })}
                </div>}
          </div>
        )}

        {/* ── Points Tab ── */}
        {detailTab === 'points' && !loadingPlayerData && (
          <div className="space-y-3">
            <div className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-800">كشف نقاط اللاعب</h3>
                <div className={`text-2xl font-extrabold ${plTotalPoints > 0 ? 'text-emerald-600' : plTotalPoints < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {plTotalPoints > 0 ? '+' : ''}{plTotalPoints} <span className="text-sm font-normal text-slate-400">نقطة</span>
                </div>
              </div>
              {playerPointsTxs.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <div className="text-base font-bold text-emerald-700">
                      +{playerPointsTxs.filter(t => (t.points || 0) > 0).reduce((s, t) => s + t.points, 0)}
                    </div>
                    <div className="text-[11px] text-slate-400">مكتسبة</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <div className="text-base font-bold text-red-600">
                      {playerPointsTxs.filter(t => (t.points || 0) < 0).reduce((s, t) => s + t.points, 0)}
                    </div>
                    <div className="text-[11px] text-slate-400">مخصومة</div>
                  </div>
                </div>
              )}
            </div>
            {playerPointsTxs.length === 0 ? (
              <div className="card text-center py-8">
                <Star size={30} className="mx-auto text-slate-300 mb-2"/>
                <div className="font-bold text-slate-500 text-sm">لا توجد نقاط مسجلة</div>
              </div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <div className="divide-y divide-slate-50">
                  {plTxDesc.map((tx, idx) => {
                    const pts   = tx.points || 0
                    const isPos = pts > 0
                    const d     = new Date(tx.created_at)
                    const dayStr = d.toLocaleDateString('ar-SA', { weekday: 'short' })
                    const datStr = d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                    const timStr = d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={tx.id || idx} className="flex items-start gap-3 px-4 py-3">
                        <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-base
                          ${isPos ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {isPos ? `+${pts}` : pts}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-800 truncate">{tx.reason || 'نقاط'}</span>
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

        {/* ── Match Stats Tab ── */}
        {detailTab === 'matchstats' && (() => {
          const userId = selPlayer.user_id
          if (playerMatchStatsLoading || (!playerMatchStats && detailTab === 'matchstats')) {
            return <div className="flex justify-center py-10"><Spinner /></div>
          }
          if (!playerMatchStats) return null

          // Filter matches where this player appeared in lineup
          const playerLineups = playerMatchStats.lineups.filter((l: any) =>
            (l.players || []).some((p: any) => p.user_id === userId && p.role !== 'excluded')
          )
          const playerMatchIds = new Set(playerLineups.map((l: any) => l.match_id))
          let filtMatches = playerMatchStats.matches.filter((m: any) => playerMatchIds.has(m.id))

          if (statsFilterTourn === '__friendly__') {
            filtMatches = filtMatches.filter((m: any) => !m.tournament_id)
          } else if (statsFilterTourn) {
            filtMatches = filtMatches.filter((m: any) => m.tournament_id === statsFilterTourn)
          }
          if (statsFilterFrom) filtMatches = filtMatches.filter((m: any) => m.match_date >= statsFilterFrom)
          if (statsFilterTo) filtMatches = filtMatches.filter((m: any) => m.match_date <= statsFilterTo + 'T23:59')

          const filtMatchIds = new Set(filtMatches.map((m: any) => m.id))
          const filtLineups = playerMatchStats.lineups.filter((l: any) => filtMatchIds.has(l.match_id))
          const filtEvents = playerMatchStats.events.filter((e: any) => filtMatchIds.has(e.match_id))

          let matchesPlayed = 0, starter = 0, sub = 0, startedAndSubbed = 0, minutes = 0
          let goals = 0, assists = 0, yellow = 0, red = 0, cleanSheets = 0

          for (const lineup of filtLineups) {
            const players: any[] = lineup.players || []
            const plEntry = players.find((p: any) => p.user_id === userId)
            if (!plEntry || plEntry.role === 'excluded') continue
            matchesPlayed++
            const matchEvts = filtEvents.filter((e: any) => e.match_id === lineup.match_id)
            const subOuts = matchEvts.filter((e: any) => e.event_type === 'substitution' && e.player_out_id === userId)
            const subIn = matchEvts.find((e: any) => e.event_type === 'substitution' && e.player_id === userId)
            if (plEntry.role === 'starter') {
              starter++
              if (subOuts.length > 0) {
                startedAndSubbed++
                minutes += subOuts[0].minute || 90
              } else {
                minutes += 90
              }
            } else {
              sub++
              minutes += subIn ? (90 - (subIn.minute || 0)) : 0
            }
          }
          for (const evt of filtEvents) {
            if (evt.player_id !== userId && evt.player_out_id !== userId) continue
            if (evt.event_type === 'goal' && evt.player_id === userId) goals++
            else if (evt.event_type === 'assist' && evt.player_id === userId) assists++
            else if (evt.event_type === 'yellow_card' && evt.player_id === userId) yellow++
            else if (evt.event_type === 'red_card' && evt.player_id === userId) red++
            else if (evt.event_type === 'clean_sheet' && evt.player_id === userId) cleanSheets++
          }

          const matchList = filtMatches.map((m: any) => {
            const lineup = filtLineups.find((l: any) => l.match_id === m.id)
            const plEntry = (lineup?.players || []).find((p: any) => p.user_id === userId)
            const tourney = allTournaments.find((t: any) => t.id === m.tournament_id)
            const mEvts = filtEvents.filter((e: any) => e.match_id === m.id)
            const plGoals = mEvts.filter((e: any) => e.event_type === 'goal' && e.player_id === userId).length
            const plAssists = mEvts.filter((e: any) => e.event_type === 'assist' && e.player_id === userId).length
            const plYellow = mEvts.filter((e: any) => e.event_type === 'yellow_card' && e.player_id === userId).length
            const plRed = mEvts.filter((e: any) => e.event_type === 'red_card' && e.player_id === userId).length
            const plCleanSheet = mEvts.filter((e: any) => e.event_type === 'clean_sheet' && e.player_id === userId).length
            return { ...m, playerRole: plEntry?.role, tourney, plGoals, plAssists, plYellow, plRed, plCleanSheet }
          }).sort((a: any, b: any) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())

          return (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select className="form-input text-xs" style={{ maxWidth: 160 }} value={statsFilterTourn} onChange={e => setStatsFilterTourn(e.target.value)}>
                  <option value="">كل المباريات</option>
                  <option value="__friendly__">ودية فقط</option>
                  {allTournaments.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input type="date" className="form-input text-xs" style={{ maxWidth: 140 }} value={statsFilterFrom} onChange={e => setStatsFilterFrom(e.target.value)} />
                <input type="date" className="form-input text-xs" style={{ maxWidth: 140 }} value={statsFilterTo} onChange={e => setStatsFilterTo(e.target.value)} />
                {(statsFilterTourn || statsFilterFrom || statsFilterTo) && (
                  <button onClick={() => { setStatsFilterTourn(''); setStatsFilterFrom(''); setStatsFilterTo('') }}
                    className="text-xs text-red-500 hover:underline flex items-center gap-0.5">
                    <X size={11} /> مسح
                  </button>
                )}
              </div>

              {/* Stats summary grid */}
              <div className="grid grid-cols-4 gap-2">
                {([
                  ['م', matchesPlayed, 'text-slate-700'],
                  ['أساسي', starter, 'text-blue-600'],
                  ['بديل', sub, 'text-amber-600'],
                  ['دقائق', minutes, 'text-slate-600'],
                ] as [string, number, string][]).map(([l, v, c]) => (
                  <div key={l} className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <div className={`text-lg font-bold ${c}`}>{v}</div>
                    <div className="text-[10px] text-slate-400">{l}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {([
                  ['⚽', goals, 'text-emerald-600'],
                  ['🎯', assists, 'text-blue-500'],
                  ['🟡', yellow, 'text-yellow-600'],
                  ['🔴', red, 'text-red-600'],
                  ['🥅', cleanSheets, 'text-teal-600'],
                ] as [string, number, string][]).map(([l, v, c]) => (
                  <div key={l} className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <div className={`text-base font-bold ${c}`}>{v}</div>
                    <div className="text-[11px] text-slate-400">{l}</div>
                  </div>
                ))}
              </div>

              {/* Match list */}
              {matchList.length === 0 ? (
                <div className="card text-center text-slate-400 py-6 text-sm">لا توجد مباريات بهذا الفلتر</div>
              ) : (
                <div className="space-y-2">
                  {matchList.map((m: any) => {
                    const hasResult = m.goals_for !== null && m.goals_against !== null
                    const result = hasResult ? (m.goals_for > m.goals_against ? { l: 'فوز', c: 'bg-emerald-100 text-emerald-700' } : m.goals_for === m.goals_against ? { l: 'تعادل', c: 'bg-amber-100 text-amber-700' } : { l: 'خسارة', c: 'bg-red-100 text-red-700' }) : null
                    return (
                      <div key={m.id} className="card mb-0 cursor-pointer hover:shadow-md transition-all"
                        onClick={() => setMatchPopup({ ...m, result })}>
                        <div className="flex items-center gap-3">
                          <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 text-xs font-bold ${result?.l === 'فوز' ? 'bg-emerald-50' : result?.l === 'خسارة' ? 'bg-red-50' : result?.l === 'تعادل' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                            {hasResult ? (
                              <><span className="text-base font-bold">{m.goals_for}-{m.goals_against}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${result!.c}`}>{result!.l}</span></>
                            ) : <span className="text-xl">⚽</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">ضد {m.opponent || '—'}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{new Date(m.match_date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              {m.tourney ? <span className="badge badge-purple text-[10px]">{m.tourney.name}</span> : <span className="badge badge-gray text-[10px]">ودية</span>}
                              <span className={`badge text-[10px] ${m.playerRole === 'starter' ? 'badge-blue' : 'bg-amber-100 text-amber-700'}`}>{m.playerRole === 'starter' ? 'أساسي' : 'بديل'}</span>
                              {m.plGoals > 0 && <span className="badge badge-green text-[10px]">⚽ {m.plGoals}</span>}
                              {m.plAssists > 0 && <span className="badge badge-blue text-[10px]">👟 {m.plAssists}</span>}
                              {m.plYellow > 0 && <span className="badge bg-yellow-100 text-yellow-700 text-[10px]">🟡</span>}
                              {m.plRed > 0 && <span className="badge bg-red-100 text-red-700 text-[10px]">🔴</span>}
                              {m.plCleanSheet > 0 && <span className="badge bg-teal-100 text-teal-700 text-[10px]">🥅</span>}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Technical Evaluation Tab ── */}
        {detailTab === 'techeval' && (() => {
          if (playerEvalLoading) return <div className="flex justify-center py-10"><Spinner /></div>
          if (!playerEvalData) return null

          const active = getActiveIndicators(playerEvalData.indicators)
          const settings = playerEvalData.settings
          const minCount = settings?.minimum_indicators_for_overall_score ?? 5
          const strengthAvg = calcStrengthAvg(active)
          const devAvg = calcDevAvg(active)
          const overallAvg = calcOverallAvg(active, minCount)
          const improvRate = calcImprovementRate(active)
          const strengths = active.filter((i: any) => i.indicator_type === 'strength')
          const developments = active.filter((i: any) => i.indicator_type === 'development')
          const seasonOpts = getSeasonOptions()

          // Quick match stats summary if loaded
          const userId = selPlayer.user_id
          let mPlayed = 0, mGoals = 0, mAssists = 0, mMinutes = 0
          if (playerMatchStats) {
            for (const lineup of playerMatchStats.lineups) {
              const plEntry = (lineup.players || []).find((p: any) => p.user_id === userId)
              if (!plEntry || plEntry.role === 'excluded') continue
              const mEvts = playerMatchStats.events.filter((e: any) => e.match_id === lineup.match_id)
              const subOut = mEvts.find((e: any) => e.event_type === 'substitution' && e.player_out_id === userId)
              const subIn = mEvts.find((e: any) => e.event_type === 'substitution' && e.player_id === userId)
              if (plEntry.role === 'starter') { mPlayed++; mMinutes += subOut?.minute || 90 }
              else if (plEntry.role === 'sub' && subIn) { mPlayed++; mMinutes += 90 - (subIn.minute || 0) }
            }
            mGoals = playerMatchStats.events.filter((e: any) => e.event_type === 'goal' && e.player_id === userId).length
            mAssists = playerMatchStats.events.filter((e: any) => e.event_type === 'assist' && e.player_id === userId).length
          }

          return (
            <div className="space-y-4">
              {/* Season + quick match bar */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">الموسم:</span>
                <select className="form-input text-xs" style={{ maxWidth: 150 }} value={playerEvalSeason}
                  onChange={e => setPlayerEvalSeason(e.target.value)}>
                  {seasonOpts.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {playerMatchStats && (
                  <div className="flex items-center gap-2 mr-auto">
                    {([['م', mPlayed, 'text-slate-600'], ['⚽', mGoals, 'text-emerald-600'], ['🎯', mAssists, 'text-blue-500'], ['⏱', mMinutes, 'text-slate-500']] as [string, number, string][]).map(([l, v, c]) => (
                      <div key={l} className="flex items-center gap-1">
                        <span className={`text-sm font-bold ${c}`}>{v}</span>
                        <span className="text-[10px] text-slate-400">{l}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {active.length === 0
                ? <div className="card text-center py-10">
                    <BarChart2 size={28} className="mx-auto text-slate-300 mb-2" />
                    <div className="font-bold text-slate-500 text-sm">لا توجد تقييمات لهذا الموسم</div>
                  </div>
                : <>
                    {/* Summary scores */}
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['نقاط القوة', strengthAvg !== null ? fmtScore(strengthAvg) : '—', 'text-emerald-600', 'bg-emerald-50'],
                        ['مؤشرات التطوير', devAvg !== null ? fmtScore(devAvg) : '—', 'text-amber-600', 'bg-amber-50'],
                        ['المتوسط العام', overallAvg !== null ? fmtScore(overallAvg) : '—', 'text-brand-600', 'bg-brand-50'],
                        ['معدل التحسن', improvRate !== null ? (improvRate > 0 ? `+${fmtScore(improvRate)}` : fmtScore(improvRate)) : '—',
                          improvRate !== null && improvRate > 0 ? 'text-emerald-600' : 'text-slate-500', 'bg-slate-50'],
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

                    {/* Development indicators */}
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
        })()}

        {/* Match Popup */}
        <Modal open={!!matchPopup} onClose={() => setMatchPopup(null)} title="تفاصيل المباراة">
          {matchPopup && (() => {
            const mp = matchPopup
            const hasResult = mp.goals_for !== null && mp.goals_against !== null
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${mp.result?.l === 'فوز' ? 'bg-emerald-50' : mp.result?.l === 'خسارة' ? 'bg-red-50' : mp.result?.l === 'تعادل' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    {hasResult ? (
                      <>
                        <span className="text-2xl font-bold">{mp.goals_for}-{mp.goals_against}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${mp.result!.c}`}>{mp.result!.l}</span>
                      </>
                    ) : <span className="text-3xl">⚽</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base">{mp.home_away === 'home' ? `فريقنا ضد ${mp.opponent}` : `${mp.opponent} ضد فريقنا`}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {new Date(mp.match_date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {mp.match_date?.slice(11, 16) ? ` · ${mp.match_date.slice(11, 16)}` : ''}
                    </div>
                    {mp.location && <div className="text-xs text-slate-400 mt-0.5">📍 {mp.location}</div>}
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {mp.tourney ? <span className="badge badge-purple">{mp.tourney.name}</span> : <span className="badge badge-gray">ودية</span>}
                      {mp.round_number && <span className="badge badge-gray">الجولة {mp.round_number}</span>}
                      <span className={`badge ${mp.playerRole === 'starter' ? 'badge-blue' : 'bg-amber-100 text-amber-700'}`}>
                        {mp.playerRole === 'starter' ? '▶ أساسي' : '↔ بديل'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Player match stats */}
                {(mp.plGoals > 0 || mp.plAssists > 0 || mp.plYellow > 0 || mp.plRed > 0 || mp.plCleanSheet > 0) && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs font-semibold text-slate-500 mb-2">إحصائياته في هذه المباراة</div>
                    <div className="flex gap-3 flex-wrap">
                      {mp.plGoals > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-bold text-emerald-600">{mp.plGoals}</div>
                          <div className="text-[10px] text-slate-400">⚽ أهداف</div>
                        </div>
                      )}
                      {mp.plAssists > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-600">{mp.plAssists}</div>
                          <div className="text-[10px] text-slate-400">👟 صناعة</div>
                        </div>
                      )}
                      {mp.plYellow > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-bold text-yellow-600">{mp.plYellow}</div>
                          <div className="text-[10px] text-slate-400">🟡 صفراء</div>
                        </div>
                      )}
                      {mp.plRed > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-bold text-red-600">{mp.plRed}</div>
                          <div className="text-[10px] text-slate-400">🔴 حمراء</div>
                        </div>
                      )}
                      {mp.plCleanSheet > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-bold text-teal-600">{mp.plCleanSheet}</div>
                          <div className="text-[10px] text-slate-400">🥅 شباك نظيفة</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                  <button className="btn btn-ghost" onClick={() => setMatchPopup(null)}>إغلاق</button>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setMatchPopup(null); navigate(`/team/${teamId}/matches/${mp.id}`) }}
                  >
                    انتقل لصفحة المباراة ←
                  </button>
                </div>
              </div>
            )
          })()}
        </Modal>

        {/* Note Modal */}
        <Modal open={showNote} onClose={() => { setShowNote(false); setSaveNoteError('') }} title={`توجيه وإرشاد — ${selPlayer.profile?.full_name}`}>
          <div className="form-group">
            <label className="form-label">نوع الملاحظة</label>
            <div className="flex gap-2 flex-wrap">
              {NOTE_TYPES.map(t => (
                <button key={t} onClick={() => setNoteForm(p => ({ ...p, note_type: t }))}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${noteForm.note_type === t ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <FormField label="مرتبطة بحدث (اختياري)">
            <input className="form-input" value={noteForm.event_title}
              onChange={e => setNoteForm(p => ({ ...p, event_title: e.target.value }))} placeholder="تدريب الثلاثاء..."/>
          </FormField>
          <FormField label="نص الملاحظة" required>
            <textarea className="form-input" rows={3} value={noteForm.content}
              onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} placeholder="اكتب ملاحظتك هنا..."/>
          </FormField>
          {/* Visibility toggle */}
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5 mt-1">
            <div>
              <div className="text-xs font-bold text-slate-700">إظهار للاعب وولي أمره</div>
              <div className="text-[10px] text-slate-400">إذا أوقفت هذا الخيار تبقى الملاحظة خاصة للمدربين فقط</div>
            </div>
            <button
              onClick={() => setNoteForm(p => ({ ...p, is_visible_to_player: !p.is_visible_to_player }))}
              className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0 ${noteForm.is_visible_to_player ? 'bg-brand-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${noteForm.is_visible_to_player ? 'right-0.5' : 'right-5'}`}/>
            </button>
          </div>
          {noteForm.is_visible_to_player && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-700 mt-2">
              ✅ سيتلقى اللاعب إشعاراً بهذه الملاحظة وستظهر له في ملفه.
            </div>
          )}
          {saveNoteError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600 mt-2">
              {saveNoteError}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={() => { setShowNote(false); setSaveNoteError('') }}>إلغاء</button>
            <button className="btn btn-primary" onClick={saveNote} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button>
          </div>
        </Modal>

        {/* New Injury Case Modal */}
        <Modal open={showCaseModal} onClose={closeCaseModal} title={`فتح تقرير طبي — ${selPlayer.profile?.full_name}`} width="max-w-lg">
          <FormField label="نوع التقرير">
            <div className="flex flex-wrap gap-1.5">
              {REPORT_TYPES.map(t => (
                <button key={t.key} onClick={() => setCaseForm(p => ({ ...p, report_type: t.key }))}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${caseForm.report_type === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="العنوان" required>
            <input className="form-input" value={caseForm.title}
              onChange={e => setCaseForm(p => ({ ...p, title: e.target.value }))}
              placeholder="إصابة في الركبة اليمنى..."/>
          </FormField>
          <FormField label="تاريخ الإصابة">
            <input className="form-input" type="date" value={caseForm.injury_date}
              onChange={e => setCaseForm(p => ({ ...p, injury_date: e.target.value }))}/>
          </FormField>
          <FormField label="التفاصيل وخطة العلاج">
            <textarea className="form-input" rows={3} value={caseForm.description}
              onChange={e => setCaseForm(p => ({ ...p, description: e.target.value }))}
              placeholder="الخطة العلاجية، التوصيات..."/>
          </FormField>

          {/* Multi-file attachment (up to 5 images) */}
          <FormField label={`المرفقات — صور أو تقارير (${caseAttachFiles.length}/5)`}>
            {caseAttachFiles.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {caseAttachFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                    <FileIcon name={f.name}/>
                    <span className="text-xs text-brand-700 font-bold flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    <button
                      onClick={() => setCaseAttachFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer flex-shrink-0">
                      <X size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {caseAttachFiles.length < 5 && (
              <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                <Paperclip size={15} className="text-slate-400 flex-shrink-0"/>
                <span className="text-xs text-slate-500">اضغط لإضافة صورة أو PDF ({caseAttachFiles.length}/5)</span>
                <input
                  ref={caseFileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  multiple
                  onChange={e => {
                    const newFiles = Array.from(e.target.files || [])
                    setCaseAttachFiles(prev => {
                      const combined = [...prev, ...newFiles]
                      return combined.slice(0, 5)
                    })
                    setCaseAttachError('')
                    if (caseFileInputRef.current) caseFileInputRef.current.value = ''
                  }}
                />
              </label>
            )}
            {caseAttachError && (
              <div className="flex items-center gap-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                <AlertCircle size={12} className="flex-shrink-0"/>
                {caseAttachError}
              </div>
            )}
            {caseAttachUploading && (
              <div className="flex items-center gap-2 mt-2 text-xs text-brand-600">
                <Spinner size="sm"/> جارٍ رفع الملفات...
              </div>
            )}
          </FormField>

          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={closeCaseModal}>إلغاء</button>
            <button className="btn btn-primary" onClick={saveCase} disabled={savingCase || caseAttachUploading || !caseForm.title}>
              {savingCase ? <Spinner size="sm"/> : 'فتح الحالة'}
            </button>
          </div>
        </Modal>

        {/* Attachment preview modal */}
        {casePreviewUrl && (() => {
          const isPdf = casePreviewUrl.toLowerCase().includes('.pdf')
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
              onClick={() => setCasePreviewUrl(null)}>
              <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden"
                style={{ maxWidth: '92vw', maxHeight: '92vh', width: isPdf ? '800px' : 'auto' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    {isPdf ? <FileText size={15} className="text-red-500"/> : <Image size={15} className="text-blue-500"/>}
                    {isPdf ? 'مستند PDF' : 'صورة المرفق'}
                  </span>
                  <div className="flex items-center gap-2">
                    <a href={casePreviewUrl} download target="_blank" rel="noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-800 font-bold border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-1 no-underline">
                      تنزيل
                    </a>
                    <button onClick={() => setCasePreviewUrl(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-500 border-none cursor-pointer transition-colors text-base font-bold">
                      ✕
                    </button>
                  </div>
                </div>
                {isPdf
                  ? <iframe src={casePreviewUrl} title="مستند" style={{ width: '800px', maxWidth: '92vw', height: '80vh' }} className="block border-0"/>
                  : <div className="flex items-center justify-center p-3 bg-slate-900">
                      <img src={casePreviewUrl} alt="مرفق" style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain' }} className="rounded-xl block"/>
                    </div>
                }
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  // ══════════════════════════════════════════
  // PLAYERS LIST VIEW
  // ══════════════════════════════════════════
  return (
    <div>
      <PageHeader title="اللاعبون"
        action={
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button onClick={() => setShowSort(v => !v)}
                className="btn btn-ghost btn-sm flex items-center gap-1">
                <ArrowUpDown size={13}/>
                <span className="hidden sm:inline">{SORT_OPTIONS.find(s => s.key === sortKey)?.label.split(' ').slice(1).join(' ')}</span>
              </button>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)}/>
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden py-1">
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt.key}
                        onClick={() => { setSortKey(opt.key); setShowSort(false) }}
                        className={`w-full text-right px-4 py-2.5 text-xs font-bold transition-colors border-none cursor-pointer ${sortKey === opt.key ? 'bg-brand-50 text-brand-700' : 'bg-transparent text-slate-700 hover:bg-slate-50'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        }/>

      <SearchBox placeholder="ابحث عن لاعب..." value={q} onChange={setQ}/>

      {loadingStats && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 px-1">
          <Spinner size="sm"/> جارٍ تحميل الإحصائيات...
        </div>
      )}

      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : sorted.length === 0 ? <div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا يوجد لاعبون"/></div>
        : (() => {
            const POSITION_GROUPS = [
              { label: 'حراس المرمى', positions: ['حارس مرمى'] },
              { label: 'المدافعون', positions: ['ظهير أيمن', 'ظهير أيسر', 'قلب دفاع', 'ليبرو'] },
              { label: 'خط الوسط', positions: ['محور دفاعي', 'محور', 'وسط أيمن', 'وسط أيسر', 'وسط هجومي', 'صانع لعب', 'جناح أيمن', 'جناح أيسر'] },
              { label: 'المهاجمون', positions: ['مهاجم ثاني', 'مهاجم', 'رأس حربة'] },
            ]
            const knownPositions = POSITION_GROUPS.flatMap(g => g.positions)

            const renderRow = (m: any) => {
              const stat = playerStats[m.user_id]
              const dob = m.profile?.date_of_birth
              const age = dob ? calcAge(dob) : null
              const primary = m.primary_position || m.position_label || ''
              const rawSec = m.secondary_positions ?? []
              const secondary: string[] = (Array.isArray(rawSec) ? rawSec : typeof rawSec === 'string' ? rawSec.replace(/^\{|\}$/g, '').split(',').map((p: string) => p.trim()).filter(Boolean) : []).filter((p: string) => p && p !== primary).slice(0, 3)
              return (
                <tr key={m.id} className="hover:bg-slate-50/70 transition-colors cursor-pointer" onClick={() => openPlayer(m)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="sm" badge={unreadNotes[m.user_id] || 0}/>
                        {stat && (
                          <span className={`absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${stat.isAvailable ? 'bg-emerald-500' : 'bg-red-500'}`}/>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-800 truncate max-w-[120px]">{m.profile?.full_name || 'مجهول'}</div>
                        {m.jersey_number && <div className="text-[10px] text-slate-400">#{m.jersey_number}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {dob ? (
                      <div>
                        <div className="text-xs text-slate-600">{new Date(dob).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' })}</div>
                        {age !== null && <div className="text-[10px] text-slate-400">{age} سنة</div>}
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {m.preferred_foot
                      ? <span className="inline-block text-[11px] px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-semibold">{m.preferred_foot}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      {primary && <div><span className="inline-block text-[11px] px-2 py-0.5 rounded-lg bg-brand-500 text-white font-bold">{primary}</span></div>}
                      {secondary.length > 0 && (
                        <div className="flex flex-wrap gap-0.5">
                          {secondary.map(pos => (
                            <span key={pos} className="inline-block text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold">{pos}</span>
                          ))}
                        </div>
                      )}
                      {!primary && secondary.length === 0 && <span className="text-slate-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {stat ? (
                      <span className={`text-xs font-bold ${stat.generalAttPct >= 80 ? 'text-emerald-600' : stat.generalAttPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                        {stat.generalAttPct}%
                      </span>
                    ) : loadingStats ? <Spinner size="sm"/> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {stat ? (
                      <span className={`text-xs font-bold ${stat.effectiveAttPct >= 80 ? 'text-emerald-600' : stat.effectiveAttPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                        {stat.effectiveAttPct}%
                      </span>
                    ) : loadingStats ? <Spinner size="sm"/> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {stat ? (
                      <span className={`text-xs font-bold ${stat.matchesPlayed > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                        {stat.matchesPlayed || '—'}
                      </span>
                    ) : loadingStats ? <Spinner size="sm"/> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {stat ? (
                      <span className={`text-xs font-bold ${stat.injuryCount > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                        {stat.injuryCount || '—'}
                      </span>
                    ) : loadingStats ? <Spinner size="sm"/> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {stat ? (
                      <span className={`text-xs font-bold ${stat.points > 0 ? 'text-brand-600' : stat.points < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {stat.points !== 0 ? stat.points : '—'}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openPlayer(m)}
                      title="ملف اللاعب"
                      className="p-1.5 text-slate-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                      <ExternalLink size={13}/>
                    </button>
                  </td>
                </tr>
              )
            }

            return (
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-500">اللاعب</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">الميلاد</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">القدم</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-slate-500">المركز</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">ح. عام</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">ح. فعلي</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">مباريات</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">إصابات</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-slate-500">النقاط</th>
                        <th className="px-3 py-2.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {POSITION_GROUPS.map(group => {
                        const groupPlayers = sorted.filter(m => group.positions.includes(m.primary_position || m.position_label || ''))
                        if (groupPlayers.length === 0) return null
                        return (
                          <React.Fragment key={group.label}>
                            <tr>
                              <td colSpan={10} className="px-4 py-1.5 text-[11px] font-extrabold text-slate-400 bg-slate-50/80 border-b border-slate-100 uppercase tracking-wide">
                                {group.label}
                              </td>
                            </tr>
                            {groupPlayers.map(renderRow)}
                          </React.Fragment>
                        )
                      })}
                      {(() => {
                        const ungrouped = sorted.filter(m => !knownPositions.includes(m.primary_position || m.position_label || ''))
                        if (ungrouped.length === 0) return null
                        return (
                          <React.Fragment key="ungrouped">
                            <tr>
                              <td colSpan={10} className="px-4 py-1.5 text-[11px] font-extrabold text-slate-400 bg-slate-50/80 border-b border-slate-100 uppercase tracking-wide">
                                أخرى
                              </td>
                            </tr>
                            {ungrouped.map(renderRow)}
                          </React.Fragment>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
    </div>
  )
}
