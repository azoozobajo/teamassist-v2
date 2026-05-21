import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Activity, BarChart3, CalendarDays, ClipboardList, Eye, Film, Flag, GitCompare,
  ListChecks, Pencil, Plus, Search, Star, Target, Trophy, Trash2, UserPlus, Users,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { eventService, scoutService, teamService } from '../../services'
import { Avatar, EmptyState, FormField, Modal, PageHeader, Spinner, Tabs } from '../../components/ui'
import { canManageScouting, canViewScouting, cn, formatDate } from '../../utils/helpers'
import { PLAYER_POSITIONS } from '../../components/sports/PositionBadges'

const STATUS_LABEL: Record<string, string> = {
  new: 'جديد',
  watching: 'تحت المتابعة',
  needs_more_watch: 'يحتاج مشاهدة إضافية',
  trial_needed: 'يحتاج تجربة',
  trial_scheduled: 'تجربة مجدولة',
  in_trial: 'في فترة تجربة',
  signing_candidate: 'مرشح للتوقيع',
  signed: 'تم التوقيع',
  rejected: 'مرفوض',
  deferred: 'مؤجل',
}

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  watching: 'bg-blue-100 text-blue-700',
  needs_more_watch: 'bg-amber-100 text-amber-700',
  trial_needed: 'bg-purple-100 text-purple-700',
  trial_scheduled: 'bg-indigo-100 text-indigo-700',
  in_trial: 'bg-orange-100 text-orange-700',
  signing_candidate: 'bg-emerald-100 text-emerald-700',
  signed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  deferred: 'bg-slate-100 text-slate-500',
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة',
}

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
}

const FOOT_LABEL: Record<string, string> = {
  right: 'يمين', left: 'يسار', both: 'كلتا القدمين',
}

const PHYSICAL_TAGS = ['سرعة', 'قوة', 'تحمل بدني', 'انفجارية', 'قفز عالٍ', 'مرونة', 'بنية كبيرة', 'خفة']

const TACTICAL_TAGS = ['قراءة اللعبة', 'ضغط عالٍ', 'بناء من الخلف', 'تمركز دفاعي', 'تسلل', 'توزيع الكرة', 'إيقاف', 'نهائيات', 'إبداع فردي']

const RECOMMENDATION_LABEL: Record<string, string> = {
  follow: 'متابعة',
  invite_trial: 'دعوة للتجربة',
  suitable: 'مناسب',
  not_suitable: 'غير مناسب',
  needs_time: 'يحتاج وقت',
  high_priority: 'أولوية عالية',
  sign: 'قبول',
  second_trial: 'تجربة ثانية',
  external_follow: 'متابعة خارجية',
  reject: 'رفض',
  negotiate: 'تحويل للتفاوض',
}

const WATCH_TYPE_LABEL: Record<string, string> = {
  match: 'مباراة',
  training: 'تدريب',
  video: 'فيديو',
  tournament: 'بطولة',
  trial: 'تجربة',
  school: 'مدرسة',
  other: 'أخرى',
}

const TRIAL_STATUS_LABEL: Record<string, string> = {
  scheduled: 'مجدولة',
  attended: 'حضر',
  absent: 'لم يحضر',
  postponed: 'مؤجلة',
  completed: 'مكتملة',
  second_trial_needed: 'يحتاج تجربة ثانية',
  passed: 'ناجح',
  not_suitable: 'غير مناسب',
}

const NATIONALITIES = [
  'أفغانستان',
  'ألبانيا',
  'الجزائر',
  'أندورا',
  'أنغولا',
  'أنتيغوا وباربودا',
  'الأرجنتين',
  'أرمينيا',
  'أستراليا',
  'النمسا',
  'أذربيجان',
  'البهاما',
  'البحرين',
  'بنغلاديش',
  'باربادوس',
  'بيلاروسيا',
  'بلجيكا',
  'بليز',
  'بنين',
  'بوتان',
  'بوليفيا',
  'البوسنة والهرسك',
  'بوتسوانا',
  'البرازيل',
  'بروناي',
  'بلغاريا',
  'بوركينا فاسو',
  'بوروندي',
  'الرأس الأخضر',
  'كمبوديا',
  'الكاميرون',
  'كندا',
  'جمهورية أفريقيا الوسطى',
  'تشاد',
  'تشيلي',
  'الصين',
  'كولومبيا',
  'جزر القمر',
  'الكونغو',
  'جمهورية الكونغو الديمقراطية',
  'كوستاريكا',
  'ساحل العاج',
  'كرواتيا',
  'كوبا',
  'قبرص',
  'التشيك',
  'الدنمارك',
  'جيبوتي',
  'دومينيكا',
  'جمهورية الدومينيكان',
  'الإكوادور',
  'مصر',
  'السلفادور',
  'غينيا الاستوائية',
  'إريتريا',
  'إستونيا',
  'إسواتيني',
  'إثيوبيا',
  'فيجي',
  'فنلندا',
  'فرنسا',
  'الغابون',
  'غامبيا',
  'جورجيا',
  'ألمانيا',
  'غانا',
  'اليونان',
  'غرينادا',
  'غواتيمالا',
  'غينيا',
  'غينيا بيساو',
  'غيانا',
  'هايتي',
  'هندوراس',
  'المجر',
  'آيسلندا',
  'الهند',
  'إندونيسيا',
  'إيران',
  'العراق',
  'أيرلندا',
  'إيطاليا',
  'جامايكا',
  'اليابان',
  'الأردن',
  'كازاخستان',
  'كينيا',
  'كيريباتي',
  'الكويت',
  'قيرغيزستان',
  'لاوس',
  'لاتفيا',
  'لبنان',
  'ليسوتو',
  'ليبيريا',
  'ليبيا',
  'ليختنشتاين',
  'ليتوانيا',
  'لوكسمبورغ',
  'مدغشقر',
  'مالاوي',
  'ماليزيا',
  'المالديف',
  'مالي',
  'مالطا',
  'جزر مارشال',
  'موريتانيا',
  'موريشيوس',
  'المكسيك',
  'ميكرونيزيا',
  'مولدوفا',
  'موناكو',
  'منغوليا',
  'الجبل الأسود',
  'المغرب',
  'موزمبيق',
  'ميانمار',
  'ناميبيا',
  'ناورو',
  'نيبال',
  'هولندا',
  'نيوزيلندا',
  'نيكاراغوا',
  'النيجر',
  'نيجيريا',
  'كوريا الشمالية',
  'مقدونيا الشمالية',
  'النرويج',
  'عمان',
  'باكستان',
  'بالاو',
  'فلسطين',
  'بنما',
  'بابوا غينيا الجديدة',
  'باراغواي',
  'بيرو',
  'الفلبين',
  'بولندا',
  'البرتغال',
  'قطر',
  'رومانيا',
  'روسيا',
  'رواندا',
  'سانت كيتس ونيفيس',
  'سانت لوسيا',
  'سانت فنسنت والغرينادين',
  'ساموا',
  'سان مارينو',
  'ساو تومي وبرينسيب',
  'السعودية',
  'السنغال',
  'صربيا',
  'سيشل',
  'سيراليون',
  'سنغافورة',
  'سلوفاكيا',
  'سلوفينيا',
  'جزر سليمان',
  'الصومال',
  'جنوب أفريقيا',
  'كوريا الجنوبية',
  'جنوب السودان',
  'إسبانيا',
  'سريلانكا',
  'السودان',
  'سورينام',
  'السويد',
  'سويسرا',
  'سوريا',
  'طاجيكستان',
  'تنزانيا',
  'تايلاند',
  'تيمور الشرقية',
  'توغو',
  'تونغا',
  'ترينيداد وتوباغو',
  'تونس',
  'تركيا',
  'تركمانستان',
  'توفالو',
  'أوغندا',
  'أوكرانيا',
  'الإمارات',
  'المملكة المتحدة',
  'الولايات المتحدة',
  'أوروغواي',
  'أوزبكستان',
  'فانواتو',
  'الفاتيكان',
  'فنزويلا',
  'فيتنام',
  'اليمن',
  'زامبيا',
  'زيمبابوي',
]

const emptyPlayer = {
  full_name: '',
  date_of_birth: '',
  nationality: '',
  city: '',
  current_club: '',
  primary_position: '',
  secondary_positions: [] as string[],
  preferred_foot: '',
  height_cm: '',
  weight_kg: '',
  phone: '',
  guardian_phone: '',
  source: '',
  status: 'new',
  priority: 'normal',
  assigned_scout_id: '',
  notes: '',
}

const emptyReport = {
  scout_player_id: '',
  watch_date: '',
  watch_type: 'match',
  location: '',
  opponent_or_event: '',
  position_played: '',
  minutes_played: '',
  strengths: '',
  development_points: '',
  notes: '',
  recommendation: 'follow',
  technical_score: 0,
  physical_score: 0,
  tactical_score: 0,
  mental_score: 0,
  discipline_score: 0,
}

const emptyMedia = {
  scout_player_id: '',
  title: '',
  media_type: 'video',
  url: '',
  notes: '',
  is_highlight: false,
}

const emptyTrial = {
  scout_player_id: '',
  trial_type: 'internal',
  event_id: '',
  title: '',
  location: '',
  trial_datetime: '',
  assigned_scout_id: '',
  evaluator_id: '',
  status: 'scheduled',
  position_tested: '',
  minutes_played: '',
  attendance_status: 'unknown',
  late_minutes: '',
  pre_notes: '',
  result_notes: '',
  recommendation: 'follow',
  technical_score: 0,
  physical_score: 0,
  tactical_score: 0,
  mental_score: 0,
  discipline_score: 0,
  team_fit_score: 0,
}

const emptyNeed = {
  position: '',
  priority: 'normal',
  min_age: null as number | null,
  max_age: null as number | null,
  min_height_cm: null as number | null,
  max_height_cm: null as number | null,
  min_weight_kg: null as number | null,
  max_weight_kg: null as number | null,
  nationality: null as string | null,
  preferred_foot: null as string | null,
  physical_tags: [] as string[],
  tactical_tags: [] as string[],
  notes: '',
  is_active: true,
}

function calcAge(dob?: string | null) {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
  return age
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-emerald-600'
  if (score >= 6.5) return 'text-blue-600'
  if (score >= 5) return 'text-amber-600'
  return 'text-slate-500'
}

function avg(nums: number[]) {
  const clean = nums.filter(n => Number.isFinite(n) && n > 0)
  return clean.length ? Math.round((clean.reduce((s, n) => s + n, 0) / clean.length) * 10) / 10 : 0
}

function calcOverall(obj: any, keys: string[]) {
  return avg(keys.map(k => Number(obj[k]) || 0))
}

export default function ScoutingPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [myRole, setMyRole] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [media, setMedia] = useState<any[]>([])
  const [trials, setTrials] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [tab, setTab] = useState('bank')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showMedia, setShowMedia] = useState(false)
  const [showTrial, setShowTrial] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<any>(null)
  const [playerForm, setPlayerForm] = useState<any>(emptyPlayer)
  const [reportForm, setReportForm] = useState<any>(emptyReport)
  const [mediaForm, setMediaForm] = useState<any>(emptyMedia)
  const [trialForm, setTrialForm] = useState<any>(emptyTrial)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [needs, setNeeds] = useState<any[]>([])
  const [showNeed, setShowNeed] = useState(false)
  const [editingNeed, setEditingNeed] = useState<any>(null)
  const [needForm, setNeedForm] = useState<any>(emptyNeed)
  const [savingNeed, setSavingNeed] = useState(false)
  const [confirmDeleteNeedId, setConfirmDeleteNeedId] = useState<string | null>(null)
  const setNF = (k: string, v: any) => setNeedForm((p: any) => ({ ...p, [k]: v }))

  const scouts = members.filter(m => ['scout', 'owner', 'administrator', 'head_coach', 'assistant_coach'].includes(m.role))
  const canManage = canManageScouting(myRole)
  const canView = canViewScouting(myRole)

  useEffect(() => {
    if (!teamId || !user) return
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    const [role, ms, evs, ps, rs, md, ts, ls, ns] = await Promise.all([
      teamService.getMyRole(teamId, user.id),
      teamService.getMembers(teamId),
      eventService.getTeamEvents(teamId),
      scoutService.getPlayers(teamId),
      scoutService.getReports(teamId),
      scoutService.getMedia(teamId),
      scoutService.getTrials(teamId),
      scoutService.getLogs(teamId),
      scoutService.getNeeds(teamId),
    ])
    setMyRole(role || '')
    setMembers(ms)
    setEvents(evs)
    setPlayers(ps)
    setReports(rs)
    setMedia(md)
    setTrials(ts)
    setLogs(ls)
    setNeeds(ns)
    setLoading(false)
  }

  const playerStats = useMemo(() => {
    const map: Record<string, any> = {}
    for (const p of players) {
      const pr = reports.filter(r => r.scout_player_id === p.id)
      const pt = trials.filter(t => t.scout_player_id === p.id)
      const pm = media.filter(m => m.scout_player_id === p.id)
      map[p.id] = {
        reports: pr.length,
        media: pm.length,
        highlights: pm.filter(m => m.is_highlight).length,
        trials: pt.length,
        avgReport: avg(pr.map(r => Number(r.overall_score) || 0)),
        avgTrial: avg(pt.map(t => Number(t.overall_score) || 0)),
        lastReport: pr[0],
        lastTrial: pt[0],
      }
    }
    return map
  }, [players, reports, trials, media])

  const needMatchedPlayers = useMemo(() => {
    const result: Record<string, { player: any; score: number }[]> = {}
    for (const need of needs) {
      const candidates: { player: any; score: number }[] = []
      for (const p of players) {
        if (p.status === 'rejected' || p.status === 'deferred') continue
        const primaryMatch = p.primary_position === need.position
        const secondaryMatch = (p.secondary_positions || []).includes(need.position)
        if (!primaryMatch && !secondaryMatch) continue

        let score = primaryMatch ? 40 : 20
        let total = 40

        const age = calcAge(p.date_of_birth)
        if (need.min_age || need.max_age) {
          total += 20
          if (age !== null) {
            const minOk = !need.min_age || age >= need.min_age
            const maxOk = !need.max_age || age <= need.max_age
            if (minOk && maxOk) score += 20
          }
        }
        if (need.min_height_cm || need.max_height_cm) {
          total += 15
          if (p.height_cm) {
            const minOk = !need.min_height_cm || p.height_cm >= need.min_height_cm
            const maxOk = !need.max_height_cm || p.height_cm <= need.max_height_cm
            if (minOk && maxOk) score += 15
          }
        }
        if (need.min_weight_kg || need.max_weight_kg) {
          total += 10
          if (p.weight_kg) {
            const minOk = !need.min_weight_kg || p.weight_kg >= need.min_weight_kg
            const maxOk = !need.max_weight_kg || p.weight_kg <= need.max_weight_kg
            if (minOk && maxOk) score += 10
          }
        }
        if (need.nationality) {
          total += 15
          if (p.nationality === need.nationality) score += 15
        }
        if (need.preferred_foot) {
          total += 10
          if (p.preferred_foot === need.preferred_foot || p.preferred_foot === 'both') score += 10
        }
        candidates.push({ player: p, score: total > 0 ? Math.round((score / total) * 100) : 0 })
      }
      candidates.sort((a, b) => b.score - a.score)
      result[need.id] = candidates.slice(0, 6)
    }
    return result
  }, [needs, players])

  const filteredPlayers = players.filter(p => {
    const hay = `${p.full_name || ''} ${p.city || ''} ${p.nationality || ''} ${p.current_club || ''} ${p.primary_position || ''}`.toLowerCase()
    if (q && !hay.includes(q.toLowerCase())) return false
    if (statusFilter && p.status !== statusFilter) return false
    if (positionFilter && p.primary_position !== positionFilter && !(p.secondary_positions || []).includes(positionFilter)) return false
    return true
  })

  const summary = {
    total: players.length,
    watching: players.filter(p => ['watching', 'needs_more_watch'].includes(p.status)).length,
    trials: players.filter(p => ['trial_needed', 'trial_scheduled', 'in_trial'].includes(p.status)).length,
    signing: players.filter(p => p.status === 'signing_candidate').length,
  }

  function openCreatePlayer() {
    setEditingPlayer(null)
    setPlayerForm(emptyPlayer)
    setError('')
    setShowPlayer(true)
  }

  function openEditPlayer(player: any) {
    setEditingPlayer(player)
    setPlayerForm({
      ...emptyPlayer,
      ...player,
      height_cm: player.height_cm ? String(player.height_cm) : '',
      weight_kg: player.weight_kg ? String(player.weight_kg) : '',
      assigned_scout_id: player.assigned_scout_id || '',
      secondary_positions: player.secondary_positions || [],
    })
    setError('')
    setShowPlayer(true)
  }

  function setPlayerField(key: string, value: any) {
    setPlayerForm((prev: any) => ({ ...prev, [key]: value }))
  }

  function toggleSecondary(position: string) {
    setPlayerForm((prev: any) => {
      const current = prev.secondary_positions || []
      const next = current.includes(position)
        ? current.filter((p: string) => p !== position)
        : [...current, position].slice(0, 3)
      return { ...prev, secondary_positions: next }
    })
  }

  async function submitPlayer() {
    if (!teamId || !user || !canManage) return
    if (!playerForm.full_name.trim()) { setError('اكتب اسم اللاعب'); return }
    setSaving(true); setError('')
    const payload = {
      team_id: teamId,
      full_name: playerForm.full_name.trim(),
      date_of_birth: playerForm.date_of_birth || null,
      nationality: playerForm.nationality || null,
      city: playerForm.city || null,
      current_club: playerForm.current_club || null,
      primary_position: playerForm.primary_position || null,
      secondary_positions: playerForm.secondary_positions || [],
      preferred_foot: playerForm.preferred_foot || null,
      height_cm: playerForm.height_cm ? Number(playerForm.height_cm) : null,
      weight_kg: playerForm.weight_kg ? Number(playerForm.weight_kg) : null,
      phone: playerForm.phone || null,
      guardian_phone: playerForm.guardian_phone || null,
      source: playerForm.source || null,
      status: playerForm.status,
      priority: playerForm.priority,
      assigned_scout_id: playerForm.assigned_scout_id || null,
      notes: playerForm.notes || null,
      added_by: editingPlayer?.added_by || user.id,
    }
    const result = editingPlayer
      ? await scoutService.updatePlayer(editingPlayer.id, payload, editingPlayer.status, user.id)
      : await scoutService.createPlayer(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ اللاعب'); setSaving(false); return }
    await load()
    setShowPlayer(false); setSaving(false)
  }

  function openReport(playerId = '') {
    setReportForm({ ...emptyReport, scout_player_id: playerId, watch_date: new Date().toISOString().slice(0, 10) })
    setError('')
    setShowReport(true)
  }

  async function submitReport() {
    if (!teamId || !user) return
    if (!reportForm.scout_player_id) { setError('اختر اللاعب'); return }
    if (!reportForm.watch_date) { setError('حدد تاريخ المشاهدة'); return }
    setSaving(true); setError('')
    const overall = calcOverall(reportForm, ['technical_score', 'physical_score', 'tactical_score', 'mental_score', 'discipline_score'])
    const result = await scoutService.createReport({
      ...reportForm,
      team_id: teamId,
      scout_id: user.id,
      minutes_played: reportForm.minutes_played ? Number(reportForm.minutes_played) : null,
      technical_score: Number(reportForm.technical_score) || 0,
      physical_score: Number(reportForm.physical_score) || 0,
      tactical_score: Number(reportForm.tactical_score) || 0,
      mental_score: Number(reportForm.mental_score) || 0,
      discipline_score: Number(reportForm.discipline_score) || 0,
      overall_score: overall,
    })
    if (result.error) { setError(result.error.message || 'تعذر حفظ التقرير'); setSaving(false); return }
    await load()
    setShowReport(false); setSaving(false)
  }

  function openMedia(playerId = '') {
    setMediaForm({ ...emptyMedia, scout_player_id: playerId })
    setError('')
    setShowMedia(true)
  }

  async function submitMedia() {
    if (!teamId || !user) return
    if (!mediaForm.scout_player_id) { setError('اختر اللاعب'); return }
    if (!mediaForm.title.trim()) { setError('اكتب عنوان المقطع'); return }
    if (!mediaForm.url.trim()) { setError('أدخل الرابط'); return }
    setSaving(true); setError('')
    const result = await scoutService.createMedia({
      ...mediaForm,
      team_id: teamId,
      title: mediaForm.title.trim(),
      uploaded_by: user.id,
    })
    if (result.error) { setError(result.error.message || 'تعذر حفظ المقطع'); setSaving(false); return }
    await load()
    setShowMedia(false); setSaving(false)
  }

  function openTrial(playerId = '') {
    setTrialForm({
      ...emptyTrial,
      scout_player_id: playerId,
      assigned_scout_id: user?.id || '',
      trial_datetime: new Date().toISOString().slice(0, 16),
    })
    setError('')
    setShowTrial(true)
  }

  async function submitTrial() {
    if (!teamId || !user) return
    if (!trialForm.scout_player_id) { setError('اختر اللاعب'); return }
    if (!trialForm.title.trim()) { setError('اكتب عنوان التجربة'); return }
    if (!trialForm.trial_datetime) { setError('حدد تاريخ ووقت التجربة'); return }
    setSaving(true); setError('')
    const overall = calcOverall(trialForm, ['technical_score', 'physical_score', 'tactical_score', 'mental_score', 'discipline_score', 'team_fit_score'])
    const result = await scoutService.createTrial({
      ...trialForm,
      team_id: teamId,
      event_id: trialForm.trial_type === 'internal' && trialForm.event_id ? trialForm.event_id : null,
      assigned_scout_id: trialForm.assigned_scout_id || null,
      evaluator_id: trialForm.evaluator_id || null,
      minutes_played: trialForm.minutes_played ? Number(trialForm.minutes_played) : null,
      late_minutes: trialForm.late_minutes ? Number(trialForm.late_minutes) : 0,
      technical_score: Number(trialForm.technical_score) || 0,
      physical_score: Number(trialForm.physical_score) || 0,
      tactical_score: Number(trialForm.tactical_score) || 0,
      mental_score: Number(trialForm.mental_score) || 0,
      discipline_score: Number(trialForm.discipline_score) || 0,
      team_fit_score: Number(trialForm.team_fit_score) || 0,
      overall_score: overall,
      created_by: user.id,
    })
    if (result.error) { setError(result.error.message || 'تعذر حفظ التجربة'); setSaving(false); return }
    await load()
    setShowTrial(false); setSaving(false)
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 4))
  }

  function openCreateNeed() {
    setEditingNeed(null)
    setNeedForm(emptyNeed)
    setShowNeed(true)
  }

  function openEditNeed(need: any) {
    setEditingNeed(need)
    setNeedForm({ ...emptyNeed, ...need, physical_tags: need.physical_tags || [], tactical_tags: need.tactical_tags || [] })
    setShowNeed(true)
  }

  function toggleNeedTag(field: 'physical_tags' | 'tactical_tags', tag: string) {
    setNeedForm((prev: any) => {
      const arr: string[] = prev[field] || []
      return { ...prev, [field]: arr.includes(tag) ? arr.filter((t: string) => t !== tag) : [...arr, tag] }
    })
  }

  async function submitNeed() {
    if (!teamId || !user || !canManage || !needForm.position) return
    setSavingNeed(true)
    const payload = {
      ...needForm,
      team_id: teamId,
      created_by: editingNeed?.created_by || user.id,
    }
    const result = editingNeed
      ? await scoutService.updateNeed(editingNeed.id, payload)
      : await scoutService.createNeed(payload)
    if (!result.error) { await load(); setShowNeed(false) }
    setSavingNeed(false)
  }

  async function confirmDeleteNeed(id: string) {
    if (!canManage) return
    await scoutService.deleteNeed(id)
    setConfirmDeleteNeedId(null)
    await load()
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner/></div>
  if (!canView) {
    return <EmptyState icon={<Eye size={28}/>} title="لا تملك صلاحية عرض قسم الكشافين" description="القسم مخصص للإدارة والكشافين والجهاز الفني."/>
  }

  const selectedCompare = compareIds.map(id => players.find(p => p.id === id)).filter(Boolean)

  return (
    <div dir="rtl">
      <PageHeader
        title="قسم الكشافين"
        subtitle="بنك اللاعبين المرشحين، تقارير المشاهدة، تجارب الأداء، المقاطع، والمقارنة"
        action={canManage && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={openCreatePlayer}><UserPlus size={14}/> لاعب مرشح</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openReport()}><ClipboardList size={14}/> تقرير</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openTrial()}><Activity size={14}/> تجربة أداء</button>
          </div>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-box"><div className="stat-value">{summary.total}</div><div className="stat-label">لاعب في البنك</div></div>
        <div className="stat-box"><div className="stat-value text-blue-600">{summary.watching}</div><div className="stat-label">تحت المتابعة</div></div>
        <div className="stat-box"><div className="stat-value text-purple-600">{summary.trials}</div><div className="stat-label">تجارب أداء</div></div>
        <div className="stat-box"><div className="stat-value text-emerald-600">{summary.signing}</div><div className="stat-label">مرشح للتوقيع</div></div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'bank', label: 'بنك اللاعبين', badge: players.length },
          { key: 'reports', label: 'التقارير', badge: reports.length },
          { key: 'trials', label: 'تجارب الأداء', badge: trials.length },
          { key: 'media', label: 'المقاطع', badge: media.length },
          { key: 'compare', label: 'المقارنة' },
          { key: 'timeline', label: 'السجل' },
          { key: 'needs', label: 'احتياجات النادي', badge: needs.filter(n => n.is_active).length || undefined },
        ]}
      />

      {tab === 'bank' && (
        <div>
          <div className="card p-3 mb-4">
            <div className="grid md:grid-cols-4 gap-2">
              <div className="md:col-span-2 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3">
                <Search size={15} className="text-slate-400"/>
                <input className="bg-transparent outline-none text-sm py-2.5 flex-1" value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم، المدينة، النادي، المركز..."/>
              </div>
              <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="form-input" value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
                <option value="">كل المراكز</option>
                {PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {filteredPlayers.length === 0 ? (
            <EmptyState icon={<Users size={28}/>} title="لا يوجد لاعبون مرشحون" description="ابدأ بإضافة لاعب مرشح إلى بنك الكشافين."/>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredPlayers.map(p => {
                const st = playerStats[p.id] || {}
                const age = calcAge(p.date_of_birth)
                return (
                  <div key={p.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={p.full_name} size="lg"/>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 truncate">{p.full_name}</h3>
                          <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', STATUS_STYLE[p.status])}>{STATUS_LABEL[p.status]}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex gap-2 flex-wrap">
                          {age !== null && <span>{age} سنة</span>}
                          {p.primary_position && <span>{p.primary_position}</span>}
                          {p.city && <span>{p.city}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 my-4">
                      <MiniStat label="تقارير" value={st.reports || 0}/>
                      <MiniStat label="تجارب" value={st.trials || 0}/>
                      <MiniStat label="مقاطع" value={st.media || 0}/>
                      <MiniStat label="تقييم" value={st.avgReport || st.avgTrial || 0}/>
                    </div>
                    <div className="text-xs text-slate-500 min-h-[36px] line-clamp-2">{p.notes || 'لا توجد ملاحظات مختصرة بعد.'}</div>
                    <div className="flex gap-2 mt-4">
                      <button className="btn btn-ghost btn-sm flex-1" onClick={() => openEditPlayer(p)}>فتح الملف</button>
                      {canManage && <button className="btn btn-primary btn-sm" onClick={() => openReport(p.id)}>تقرير</button>}
                      <button className={cn('btn btn-ghost btn-sm', compareIds.includes(p.id) && 'bg-brand-50 text-brand-700')} onClick={() => toggleCompare(p.id)}>
                        <GitCompare size={13}/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <ListSection
          emptyIcon={<ClipboardList size={28}/>}
          emptyTitle="لا توجد تقارير كشف"
          items={reports}
          render={(r: any) => (
            <div key={r.id} className="card p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-extrabold text-slate-900">{r.player?.full_name || 'لاعب'}</div>
                  <div className="text-xs text-slate-400 mt-1">{WATCH_TYPE_LABEL[r.watch_type]} · {formatDate(r.watch_date)} · {r.position_played || 'بدون مركز'}</div>
                  <p className="text-sm text-slate-600 mt-2">{r.strengths || r.notes || 'لا توجد ملاحظات'}</p>
                </div>
                <div className="text-center">
                  <div className={cn('text-2xl font-extrabold', scoreColor(Number(r.overall_score) || 0))}>{Number(r.overall_score) || 0}</div>
                  <div className="text-[11px] text-slate-400">من 10</div>
                  <span className="badge bg-brand-50 text-brand-700 mt-2">{RECOMMENDATION_LABEL[r.recommendation] || r.recommendation}</span>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {tab === 'trials' && (
        <ListSection
          emptyIcon={<Activity size={28}/>}
          emptyTitle="لا توجد تجارب أداء"
          items={trials}
          render={(t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-slate-900">{t.title}</h3>
                    <span className="badge bg-indigo-100 text-indigo-700">{t.trial_type === 'internal' ? 'داخل النادي' : 'خارجية'}</span>
                    <span className="badge bg-slate-100 text-slate-700">{TRIAL_STATUS_LABEL[t.status]}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-700 mt-1">{t.player?.full_name}</div>
                  <div className="text-xs text-slate-400 mt-1">{new Date(t.trial_datetime).toLocaleString('ar-SA')} · {t.location || t.event?.title || 'بدون موقع'}</div>
                  {t.result_notes && <p className="text-sm text-slate-600 mt-2">{t.result_notes}</p>}
                </div>
                <div className="text-center">
                  <div className={cn('text-2xl font-extrabold', scoreColor(Number(t.overall_score) || 0))}>{Number(t.overall_score) || 0}</div>
                  <div className="text-[11px] text-slate-400">تقييم تجربة</div>
                  <span className="badge bg-emerald-50 text-emerald-700 mt-2">{RECOMMENDATION_LABEL[t.recommendation] || t.recommendation}</span>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {tab === 'media' && (
        <ListSection
          emptyIcon={<Film size={28}/>}
          emptyTitle="لا توجد مقاطع أو مرفقات"
          items={media}
          render={(m: any) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-slate-900">{m.title}</h3>
                    {m.is_highlight && <span className="badge bg-amber-100 text-amber-700">لقطة مهمة</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{m.player?.full_name} · {m.media_type}</div>
                  {m.notes && <p className="text-sm text-slate-600 mt-2">{m.notes}</p>}
                </div>
                <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">فتح</a>
              </div>
            </div>
          )}
        />
      )}

      {tab === 'compare' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="font-extrabold text-slate-800 mb-3">اختر حتى 4 لاعبين للمقارنة</div>
            <div className="grid md:grid-cols-3 gap-2">
              {players.map(p => (
                <button key={p.id} onClick={() => toggleCompare(p.id)}
                  className={cn('rounded-xl border p-3 text-right text-sm font-bold', compareIds.includes(p.id) ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-100 hover:bg-slate-50')}>
                  {p.full_name}
                  <span className="block text-[11px] text-slate-400 mt-1">{p.primary_position || 'بدون مركز'} · {STATUS_LABEL[p.status]}</span>
                </button>
              ))}
            </div>
          </div>
          {selectedCompare.length > 0 && (
            <div className="overflow-x-auto card p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 text-right">المعيار</th>
                    {selectedCompare.map((p: any) => <th key={p.id} className="p-3 text-right">{p.full_name}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    ['العمر', (p: any) => calcAge(p.date_of_birth) ? `${calcAge(p.date_of_birth)} سنة` : '-'],
                    ['المركز', (p: any) => p.primary_position || '-'],
                    ['الحالة', (p: any) => STATUS_LABEL[p.status] || p.status],
                    ['تقييم التقارير', (p: any) => playerStats[p.id]?.avgReport || 0],
                    ['تقييم التجارب', (p: any) => playerStats[p.id]?.avgTrial || 0],
                    ['عدد التقارير', (p: any) => playerStats[p.id]?.reports || 0],
                    ['عدد التجارب', (p: any) => playerStats[p.id]?.trials || 0],
                    ['المقاطع المهمة', (p: any) => playerStats[p.id]?.highlights || 0],
                    ['التوصية الأخيرة', (p: any) => RECOMMENDATION_LABEL[playerStats[p.id]?.lastReport?.recommendation] || '-'],
                  ].map(([label, getter]: any) => (
                    <tr key={label}>
                      <td className="p-3 font-bold text-slate-600">{label}</td>
                      {selectedCompare.map((p: any) => <td key={p.id + label} className="p-3 text-slate-700">{getter(p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <ListSection
          emptyIcon={<ListChecks size={28}/>}
          emptyTitle="لا يوجد سجل حالات"
          items={logs}
          render={(l: any) => (
            <div key={l.id} className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center"><Flag size={18}/></div>
              <div>
                <div className="font-extrabold text-slate-900">{l.player?.full_name || 'لاعب'}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {l.old_status ? `${STATUS_LABEL[l.old_status] || l.old_status} ← ` : ''}{STATUS_LABEL[l.new_status] || l.new_status} · {formatDate(l.created_at)}
                </div>
                {l.note && <p className="text-sm text-slate-600 mt-2">{l.note}</p>}
              </div>
            </div>
          )}
        />
      )}

      {tab === 'needs' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-500">{needs.length} احتياج مسجل · {needs.filter(n => n.is_active).length} نشط</div>
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={openCreateNeed}><Plus size={14}/> إضافة احتياج</button>
            )}
          </div>

          {needs.length === 0 ? (
            <EmptyState icon={<Target size={28}/>} title="لا توجد احتياجات مسجلة" description="أضف احتياجات النادي ليتمكن الكشافون من البحث عن المرشحين المناسبين"/>
          ) : (
            <div className="space-y-4">
              {needs.map(need => {
                const candidates = needMatchedPlayers[need.id] || []
                const isConfirmingDelete = confirmDeleteNeedId === need.id
                return (
                  <div key={need.id} className={cn('card p-4', !need.is_active && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-slate-900 text-lg">{need.position}</h3>
                          <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', PRIORITY_STYLE[need.priority])}>{PRIORITY_LABEL[need.priority]}</span>
                          {!need.is_active && <span className="badge bg-slate-100 text-slate-500">غير نشط</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 flex gap-3 flex-wrap">
                          {(need.min_age || need.max_age) && (
                            <span>العمر: {need.min_age || '—'}–{need.max_age || '—'} سنة</span>
                          )}
                          {(need.min_height_cm || need.max_height_cm) && (
                            <span>الطول: {need.min_height_cm || '—'}–{need.max_height_cm || '—'} سم</span>
                          )}
                          {(need.min_weight_kg || need.max_weight_kg) && (
                            <span>الوزن: {need.min_weight_kg || '—'}–{need.max_weight_kg || '—'} كغ</span>
                          )}
                          {need.nationality && <span>الجنسية: {need.nationality}</span>}
                          {need.preferred_foot && <span>القدم: {FOOT_LABEL[need.preferred_foot]}</span>}
                        </div>
                        {((need.physical_tags?.length > 0) || (need.tactical_tags?.length > 0)) && (
                          <div className="flex gap-1.5 flex-wrap mt-2">
                            {(need.physical_tags || []).map((t: string) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">{t}</span>
                            ))}
                            {(need.tactical_tags || []).map((t: string) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold">{t}</span>
                            ))}
                          </div>
                        )}
                        {need.notes && <p className="text-xs text-slate-400 mt-2">{need.notes}</p>}
                      </div>
                      {canManage && (
                        <div className="flex gap-1 flex-shrink-0">
                          {isConfirmingDelete ? (
                            <div className="flex gap-1 items-center">
                              <span className="text-xs text-red-600 font-bold">حذف؟</span>
                              <button className="btn btn-ghost btn-sm text-red-600" onClick={() => confirmDeleteNeed(need.id)}>نعم</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteNeedId(null)}>لا</button>
                            </div>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditNeed(need)}><Pencil size={13}/></button>
                              <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDeleteNeedId(need.id)}><Trash2 size={13}/></button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="text-xs font-bold text-slate-500 mb-2">
                        المرشحون من البنك
                        {candidates.length > 0 && <span className="mr-1 text-brand-600">({candidates.length})</span>}
                      </div>
                      {candidates.length === 0 ? (
                        <div className="text-xs text-center text-slate-400 py-3 bg-slate-50 rounded-xl">
                          لا يوجد لاعبون في البنك يطابقون هذا المركز بعد
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-2">
                          {candidates.map(({ player: p, score }) => {
                            const age = calcAge(p.date_of_birth)
                            return (
                              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                                <Avatar name={p.full_name} size="sm"/>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm text-slate-900 truncate">{p.full_name}</div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {p.primary_position}
                                    {age !== null && ` · ${age} سنة`}
                                    {p.nationality && ` · ${p.nationality}`}
                                  </div>
                                  <span className={cn('text-[11px] font-bold', STATUS_STYLE[p.status], 'px-1.5 py-0.5 rounded-md')}>{STATUS_LABEL[p.status]}</span>
                                </div>
                                <div className="text-center flex-shrink-0">
                                  <div className={cn('text-base font-extrabold',
                                    score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-blue-600' : score >= 40 ? 'text-amber-600' : 'text-slate-400'
                                  )}>{score}%</div>
                                  <div className="text-[10px] text-slate-400">تطابق</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {renderPlayerModal()}
      {renderReportModal()}
      {renderMediaModal()}
      {renderTrialModal()}
      {renderNeedModal()}
    </div>
  )

  function renderPlayerModal() {
    return (
      <Modal open={showPlayer} onClose={() => !saving && setShowPlayer(false)} title={editingPlayer ? 'ملف لاعب مرشح' : 'إضافة لاعب مرشح'} width="max-w-3xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="اسم اللاعب" required><input className="form-input" value={playerForm.full_name} onChange={e => setPlayerField('full_name', e.target.value)}/></FormField>
            <FormField label="تاريخ الميلاد"><input className="form-input" type="date" value={playerForm.date_of_birth || ''} onChange={e => setPlayerField('date_of_birth', e.target.value)}/></FormField>
            <FormField label="الجنسية">
              <select className="form-input" value={playerForm.nationality || ''} onChange={e => setPlayerField('nationality', e.target.value)}>
                <option value="">اختر الجنسية</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </FormField>
            <FormField label="المدينة"><input className="form-input" value={playerForm.city || ''} onChange={e => setPlayerField('city', e.target.value)}/></FormField>
            <FormField label="النادي الحالي"><input className="form-input" value={playerForm.current_club || ''} onChange={e => setPlayerField('current_club', e.target.value)}/></FormField>
            <FormField label="مصدر اللاعب"><input className="form-input" value={playerForm.source || ''} onChange={e => setPlayerField('source', e.target.value)} placeholder="بطولة، أكاديمية، توصية..."/></FormField>
            <FormField label="المركز الأساسي"><select className="form-input" value={playerForm.primary_position || ''} onChange={e => setPlayerField('primary_position', e.target.value)}><option value="">اختر</option>{PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></FormField>
            <FormField label="القدم المفضلة"><select className="form-input" value={playerForm.preferred_foot || ''} onChange={e => setPlayerField('preferred_foot', e.target.value)}><option value="">غير محدد</option><option value="right">يمين</option><option value="left">يسار</option><option value="both">كلتا القدمين</option></select></FormField>
            <FormField label="الطول"><input className="form-input" type="number" value={playerForm.height_cm || ''} onChange={e => setPlayerField('height_cm', e.target.value)}/></FormField>
            <FormField label="الوزن"><input className="form-input" type="number" value={playerForm.weight_kg || ''} onChange={e => setPlayerField('weight_kg', e.target.value)}/></FormField>
            <FormField label="الجوال"><input className="form-input" value={playerForm.phone || ''} onChange={e => setPlayerField('phone', e.target.value)}/></FormField>
            <FormField label="جوال ولي الأمر"><input className="form-input" value={playerForm.guardian_phone || ''} onChange={e => setPlayerField('guardian_phone', e.target.value)}/></FormField>
            <FormField label="الحالة"><select className="form-input" value={playerForm.status} onChange={e => setPlayerField('status', e.target.value)}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FormField>
            <FormField label="الأولوية"><select className="form-input" value={playerForm.priority} onChange={e => setPlayerField('priority', e.target.value)}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FormField>
            <FormField label="الكشاف المسؤول"><select className="form-input" value={playerForm.assigned_scout_id || ''} onChange={e => setPlayerField('assigned_scout_id', e.target.value)}><option value="">غير محدد</option>{scouts.map(s => <option key={s.user_id} value={s.user_id}>{s.profile?.full_name}</option>)}</select></FormField>
          </div>
          <FormField label="المراكز الثانوية">
            <div className="flex flex-wrap gap-1.5">
              {PLAYER_POSITIONS.map(p => (
                <button key={p} type="button" onClick={() => toggleSecondary(p)} className={cn('px-2 py-1 rounded-lg text-xs font-bold border', (playerForm.secondary_positions || []).includes(p) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600')}>{p}</button>
              ))}
            </div>
          </FormField>
          <FormField label="ملاحظات مختصرة"><textarea className="form-input" rows={3} value={playerForm.notes || ''} onChange={e => setPlayerField('notes', e.target.value)}/></FormField>
          {editingPlayer && (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-ghost" onClick={() => { setShowPlayer(false); openReport(editingPlayer.id) }}><ClipboardList size={14}/> تقرير</button>
              <button className="btn btn-ghost" onClick={() => { setShowPlayer(false); openTrial(editingPlayer.id) }}><Activity size={14}/> تجربة</button>
              <button className="btn btn-ghost" onClick={() => { setShowPlayer(false); openMedia(editingPlayer.id) }}><Film size={14}/> مقطع</button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowPlayer(false)}>إلغاء</button>
            {canManage && <button className="btn btn-primary" onClick={submitPlayer} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button>}
          </div>
        </div>
      </Modal>
    )
  }

  function renderReportModal() {
    return (
      <Modal open={showReport} onClose={() => !saving && setShowReport(false)} title="تقرير مشاهدة" width="max-w-2xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <FormField label="اللاعب" required><select className="form-input" value={reportForm.scout_player_id} onChange={e => setReportForm((p: any) => ({ ...p, scout_player_id: e.target.value }))}><option value="">اختر لاعب</option>{players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></FormField>
          <div className="grid md:grid-cols-3 gap-3">
            <FormField label="تاريخ المشاهدة" required><input className="form-input" type="date" value={reportForm.watch_date} onChange={e => setReportForm((p: any) => ({ ...p, watch_date: e.target.value }))}/></FormField>
            <FormField label="نوع المشاهدة"><select className="form-input" value={reportForm.watch_type} onChange={e => setReportForm((p: any) => ({ ...p, watch_type: e.target.value }))}>{Object.entries(WATCH_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FormField>
            <FormField label="المركز"><select className="form-input" value={reportForm.position_played} onChange={e => setReportForm((p: any) => ({ ...p, position_played: e.target.value }))}><option value="">اختر</option>{PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></FormField>
            <FormField label="المكان"><input className="form-input" value={reportForm.location} onChange={e => setReportForm((p: any) => ({ ...p, location: e.target.value }))}/></FormField>
            <FormField label="الحدث/الخصم"><input className="form-input" value={reportForm.opponent_or_event} onChange={e => setReportForm((p: any) => ({ ...p, opponent_or_event: e.target.value }))}/></FormField>
            <FormField label="الدقائق"><input className="form-input" type="number" value={reportForm.minutes_played} onChange={e => setReportForm((p: any) => ({ ...p, minutes_played: e.target.value }))}/></FormField>
          </div>
          <ScoreGrid form={reportForm} setForm={setReportForm} keys={['technical_score','physical_score','tactical_score','mental_score','discipline_score']}/>
          <FormField label="نقاط القوة"><textarea className="form-input" rows={2} value={reportForm.strengths} onChange={e => setReportForm((p: any) => ({ ...p, strengths: e.target.value }))}/></FormField>
          <FormField label="نقاط التطوير"><textarea className="form-input" rows={2} value={reportForm.development_points} onChange={e => setReportForm((p: any) => ({ ...p, development_points: e.target.value }))}/></FormField>
          <FormField label="التوصية"><select className="form-input" value={reportForm.recommendation} onChange={e => setReportForm((p: any) => ({ ...p, recommendation: e.target.value }))}>{['follow','invite_trial','suitable','not_suitable','needs_time','high_priority'].map(k => <option key={k} value={k}>{RECOMMENDATION_LABEL[k]}</option>)}</select></FormField>
          <FormField label="ملاحظات"><textarea className="form-input" rows={2} value={reportForm.notes} onChange={e => setReportForm((p: any) => ({ ...p, notes: e.target.value }))}/></FormField>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setShowReport(false)}>إلغاء</button><button className="btn btn-primary" onClick={submitReport} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ التقرير'}</button></div>
        </div>
      </Modal>
    )
  }

  function renderMediaModal() {
    return (
      <Modal open={showMedia} onClose={() => !saving && setShowMedia(false)} title="إضافة مقطع أو مرفق">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <FormField label="اللاعب" required><select className="form-input" value={mediaForm.scout_player_id} onChange={e => setMediaForm((p: any) => ({ ...p, scout_player_id: e.target.value }))}><option value="">اختر لاعب</option>{players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></FormField>
          <FormField label="العنوان" required><input className="form-input" value={mediaForm.title} onChange={e => setMediaForm((p: any) => ({ ...p, title: e.target.value }))}/></FormField>
          <FormField label="الرابط" required><input className="form-input" value={mediaForm.url} onChange={e => setMediaForm((p: any) => ({ ...p, url: e.target.value }))} dir="ltr"/></FormField>
          <FormField label="النوع"><select className="form-input" value={mediaForm.media_type} onChange={e => setMediaForm((p: any) => ({ ...p, media_type: e.target.value }))}><option value="video">فيديو</option><option value="image">صورة</option><option value="pdf">PDF</option><option value="link">رابط</option><option value="other">أخرى</option></select></FormField>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={mediaForm.is_highlight} onChange={e => setMediaForm((p: any) => ({ ...p, is_highlight: e.target.checked }))}/> تمييز كلقطة مهمة</label>
          <FormField label="ملاحظات"><textarea className="form-input" rows={2} value={mediaForm.notes} onChange={e => setMediaForm((p: any) => ({ ...p, notes: e.target.value }))}/></FormField>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setShowMedia(false)}>إلغاء</button><button className="btn btn-primary" onClick={submitMedia} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button></div>
        </div>
      </Modal>
    )
  }

  function renderTrialModal() {
    return (
      <Modal open={showTrial} onClose={() => !saving && setShowTrial(false)} title="تجربة أداء" width="max-w-2xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <FormField label="اللاعب" required><select className="form-input" value={trialForm.scout_player_id} onChange={e => setTrialForm((p: any) => ({ ...p, scout_player_id: e.target.value }))}><option value="">اختر لاعب</option>{players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></FormField>
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="عنوان التجربة" required><input className="form-input" value={trialForm.title} onChange={e => setTrialForm((p: any) => ({ ...p, title: e.target.value }))}/></FormField>
            <FormField label="نوع التجربة"><select className="form-input" value={trialForm.trial_type} onChange={e => setTrialForm((p: any) => ({ ...p, trial_type: e.target.value }))}><option value="internal">داخل النادي</option><option value="external">خارجية</option></select></FormField>
            <FormField label="التاريخ والوقت"><input className="form-input" type="datetime-local" value={trialForm.trial_datetime} onChange={e => setTrialForm((p: any) => ({ ...p, trial_datetime: e.target.value }))}/></FormField>
            <FormField label="الموقع"><input className="form-input" value={trialForm.location} onChange={e => setTrialForm((p: any) => ({ ...p, location: e.target.value }))}/></FormField>
            {trialForm.trial_type === 'internal' && (
              <FormField label="ربط بموعد الفريق"><select className="form-input" value={trialForm.event_id} onChange={e => setTrialForm((p: any) => ({ ...p, event_id: e.target.value }))}><option value="">بدون ربط</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} - {new Date(ev.start_datetime).toLocaleDateString('ar-SA')}</option>)}</select></FormField>
            )}
            <FormField label="الحالة"><select className="form-input" value={trialForm.status} onChange={e => setTrialForm((p: any) => ({ ...p, status: e.target.value }))}>{Object.entries(TRIAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FormField>
            <FormField label="المركز المجرب"><select className="form-input" value={trialForm.position_tested} onChange={e => setTrialForm((p: any) => ({ ...p, position_tested: e.target.value }))}><option value="">اختر</option>{PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></FormField>
            <FormField label="الدقائق"><input className="form-input" type="number" value={trialForm.minutes_played} onChange={e => setTrialForm((p: any) => ({ ...p, minutes_played: e.target.value }))}/></FormField>
          </div>
          <ScoreGrid form={trialForm} setForm={setTrialForm} keys={['technical_score','physical_score','tactical_score','mental_score','discipline_score','team_fit_score']}/>
          <FormField label="ملاحظات قبل التجربة"><textarea className="form-input" rows={2} value={trialForm.pre_notes} onChange={e => setTrialForm((p: any) => ({ ...p, pre_notes: e.target.value }))}/></FormField>
          <FormField label="نتيجة التجربة"><textarea className="form-input" rows={2} value={trialForm.result_notes} onChange={e => setTrialForm((p: any) => ({ ...p, result_notes: e.target.value }))}/></FormField>
          <FormField label="التوصية"><select className="form-input" value={trialForm.recommendation} onChange={e => setTrialForm((p: any) => ({ ...p, recommendation: e.target.value }))}>{['follow','sign','second_trial','external_follow','reject','negotiate'].map(k => <option key={k} value={k}>{RECOMMENDATION_LABEL[k]}</option>)}</select></FormField>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setShowTrial(false)}>إلغاء</button><button className="btn btn-primary" onClick={submitTrial} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ التجربة'}</button></div>
        </div>
      </Modal>
    )
  }

  function renderNeedModal() {
    return (
      <Modal open={showNeed} onClose={() => !savingNeed && setShowNeed(false)} title={editingNeed ? 'تعديل الاحتياج' : 'إضافة احتياج جديد'} width="max-w-2xl">
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="المركز المطلوب" required>
              <select className="form-input" value={needForm.position} onChange={e => setNF('position', e.target.value)}>
                <option value="">اختر المركز</option>
                {PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="الأولوية">
              <select className="form-input" value={needForm.priority} onChange={e => setNF('priority', e.target.value)}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="العمر الأدنى">
              <input className="form-input" type="number" min={10} max={45} value={needForm.min_age ?? ''} onChange={e => setNF('min_age', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="العمر الأقصى">
              <input className="form-input" type="number" min={10} max={45} value={needForm.max_age ?? ''} onChange={e => setNF('max_age', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="الطول الأدنى (سم)">
              <input className="form-input" type="number" min={140} max={220} value={needForm.min_height_cm ?? ''} onChange={e => setNF('min_height_cm', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="الطول الأقصى (سم)">
              <input className="form-input" type="number" min={140} max={220} value={needForm.max_height_cm ?? ''} onChange={e => setNF('max_height_cm', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="الوزن الأدنى (كغ)">
              <input className="form-input" type="number" min={40} max={130} value={needForm.min_weight_kg ?? ''} onChange={e => setNF('min_weight_kg', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="الوزن الأقصى (كغ)">
              <input className="form-input" type="number" min={40} max={130} value={needForm.max_weight_kg ?? ''} onChange={e => setNF('max_weight_kg', e.target.value ? Number(e.target.value) : null)}/>
            </FormField>
            <FormField label="الجنسية المفضلة">
              <select className="form-input" value={needForm.nationality ?? ''} onChange={e => setNF('nationality', e.target.value || null)}>
                <option value="">أي جنسية</option>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </FormField>
            <FormField label="القدم المفضلة">
              <select className="form-input" value={needForm.preferred_foot ?? ''} onChange={e => setNF('preferred_foot', e.target.value || null)}>
                <option value="">غير محدد</option>
                <option value="right">يمين</option>
                <option value="left">يسار</option>
                <option value="both">كلتا القدمين</option>
              </select>
            </FormField>
          </div>
          <FormField label="المواصفات البدنية">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PHYSICAL_TAGS.map(t => (
                <button key={t} type="button" onClick={() => toggleNeedTag('physical_tags', t)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-bold border transition-colors',
                    (needForm.physical_tags || []).includes(t)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300')}>
                  {t}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="المواصفات التكتيكية">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {TACTICAL_TAGS.map(t => (
                <button key={t} type="button" onClick={() => toggleNeedTag('tactical_tags', t)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-bold border transition-colors',
                    (needForm.tactical_tags || []).includes(t)
                      ? 'bg-purple-500 text-white border-purple-500'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300')}>
                  {t}
                </button>
              ))}
            </div>
          </FormField>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={needForm.is_active} onChange={e => setNF('is_active', e.target.checked)}/>
            الاحتياج نشط
          </label>
          <FormField label="ملاحظات إضافية">
            <textarea className="form-input" rows={2} value={needForm.notes || ''} onChange={e => setNF('notes', e.target.value)}/>
          </FormField>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowNeed(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitNeed} disabled={savingNeed || !needForm.position}>
              {savingNeed ? <Spinner size="sm"/> : 'حفظ'}
            </button>
          </div>
        </div>
      </Modal>
    )
  }
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 text-center">
      <div className="font-extrabold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-400 font-bold">{label}</div>
    </div>
  )
}

function ListSection({ items, render, emptyIcon, emptyTitle }: {
  items: any[]
  render: (item: any) => React.ReactNode
  emptyIcon: React.ReactNode
  emptyTitle: string
}) {
  return items.length === 0
    ? <EmptyState icon={emptyIcon} title={emptyTitle}/>
    : <div className="grid gap-3">{items.map(render)}</div>
}

function ScoreGrid({ form, setForm, keys }: { form: any; setForm: any; keys: string[] }) {
  const labels: Record<string, string> = {
    technical_score: 'فني',
    physical_score: 'بدني',
    tactical_score: 'تكتيكي',
    mental_score: 'ذهني',
    discipline_score: 'انضباط',
    team_fit_score: 'ملاءمة الفريق',
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {keys.map(k => (
        <FormField key={k} label={labels[k]}>
          <input className="form-input" type="number" min={0} max={10} step={0.5}
            value={form[k]}
            onChange={e => setForm((p: any) => ({ ...p, [k]: e.target.value }))}
          />
        </FormField>
      ))}
    </div>
  )
}
