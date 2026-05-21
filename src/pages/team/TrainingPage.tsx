import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  BookOpen, ChevronDown, ChevronUp, ClipboardList, Dumbbell, Eye,
  Pencil, Plus, Printer, Save, Target, Trash2, Upload, Users, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { trainingService, teamService, eventService } from '../../services'
import { Avatar, EmptyState, FormField, Modal, PageHeader, Spinner, Tabs } from '../../components/ui'
import { canManageTraining, canViewTraining, cn, formatDate } from '../../utils/helpers'

// ── Labels ──────────────────────────────────────────────────────────────
const INTENSITY_LABEL: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', recovery: 'استرداد' }
const INTENSITY_COLOR: Record<string, string> = { low: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700', recovery: 'bg-blue-100 text-blue-700' }
const INTENSITY_DOT: Record<string, string> = { low: 'bg-green-500', medium: 'bg-amber-500', high: 'bg-red-500', recovery: 'bg-blue-500' }

const MD_LABEL: Record<string, string> = { 'md-4': 'MD-4', 'md-3': 'MD-3', 'md-2': 'MD-2', 'md-1': 'MD-1', 'md': 'MD ⚽', 'md+1': 'MD+1', 'md+2': 'MD+2', 'free': 'حر' }
const MD_COLOR: Record<string, string> = { 'md-4': 'bg-slate-100 text-slate-600', 'md-3': 'bg-orange-100 text-orange-700', 'md-2': 'bg-amber-100 text-amber-700', 'md-1': 'bg-purple-100 text-purple-700', 'md': 'bg-red-100 text-red-700', 'md+1': 'bg-blue-100 text-blue-700', 'md+2': 'bg-teal-100 text-teal-700', 'free': 'bg-slate-50 text-slate-500' }
const INTENSITY_BAR_HEIGHT: Record<string, number> = { low: 8, medium: 14, high: 20, recovery: 6 }
const INTENSITY_BAR_COLOR: Record<string, string> = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', recovery: '#3b82f6' }

const BLOCK_TYPE_LABEL: Record<string, string> = { warmup: '🔥 احماء', main: '⚽ أساسي', cooldown: '❄️ تهدئة', individual: '👤 فردي' }
const BLOCK_TYPE_COLOR: Record<string, string> = { warmup: 'border-orange-300 bg-orange-50', main: 'border-blue-300 bg-blue-50', cooldown: 'border-teal-300 bg-teal-50', individual: 'border-purple-300 bg-purple-50' }

const CATEGORY_LABEL: Record<string, string> = { technical: 'مهاري', tactical: 'تكتيكي', physical: 'بدني', gk: 'حراس مرمى', mental: 'ذهني' }
const SECTION_LABEL: Record<string, string> = { warmup: 'احماء', main: 'أساسي', cooldown: 'تهدئة' }
const LOCATION_LABEL: Record<string, string> = { pitch: 'ملعب', gym: 'صالة جيم', indoor: 'ملعب داخلي', sand: 'رملة', pool: 'مسبح' }

const PHASE_TYPE_LABEL: Record<string, string> = { preparation: 'مرحلة الإعداد', early: 'بداية الموسم', mid: 'منتصف الموسم', late: 'نهاية الموسم', off: 'إيقاف الموسم', custom: 'مرحلة مخصصة' }

const AUTHOR_ROLE_LABEL: Record<string, string> = { hc: '⚽ المدرب الرئيسي', fc: '💪 مدرب اللياقة', gkt: '🧤 مدرب الحراس', assistant: '🔧 المساعد', other: '👤 آخر' }
const AUTHOR_ROLE_COLOR: Record<string, string> = { hc: 'bg-blue-50 border-blue-200', fc: 'bg-orange-50 border-orange-200', gkt: 'bg-green-50 border-green-200', assistant: 'bg-purple-50 border-purple-200', other: 'bg-slate-50 border-slate-200' }

const ASSIGNMENT_REASON_LABEL: Record<string, string> = { recovery: 'استرداد', injury: 'إصابة', fitness: 'لياقة خاصة', tactical: 'تكتيكي', other: 'أخرى' }
const SYSTEM_ROLE_LABEL: Record<string, string> = { head_coach: '⚽ مدرب رئيسي', assistant_coach: '🔧 مساعد', fitness_coach: '💪 لياقة', gk_coach: '🧤 حراس مرمى', team_manager: '📋 مدير', doctor: '🏥 طبيب', physiotherapist: '🦴 معالج', analyst: '📊 محلل', player: 'لاعب' }

const EQUIPMENT_OPTIONS = ['كرات', 'مخاريط', 'حواجز', 'أشرطة مطاطية', 'سلّم رشاقة', 'عوارض', 'مرمى صغير', 'مصوّب', 'Foam Roller', 'GPS', 'شباك تدريبية']

const SESSION_CATEGORY_LABEL: Record<string, string> = { first_team: 'الفريق الأول', u23: 'تحت 23', u18: 'تحت 18', gk_only: 'حراس المرمى', fitness_only: 'لياقة بدنية', individual: 'فردي' }

// ── Empty templates ──────────────────────────────────────────────────────
const emptyPhase = { name: '', phase_type: 'custom', start_date: '', end_date: '', color: '#6366f1', description: '', sort_order: 0 }
const emptySession = { date: '', start_time: '', duration_min: 90, category: 'first_team', title: '', intensity: 'medium', md_tag: 'free', phase_id: '', theme_id: '', tactical_goal: '', physical_goal: '', gk_goal: '', notes: '' }
const emptyBlock = { block_type: 'main', title: '', start_offset_min: 0, duration_min: 20, content_hc: '', content_fc: '', content_gkt: '' }
const emptyExercise = { name: '', description: '', section: 'main', category: 'technical', location: 'pitch', player_count_min: 2, duration_min: 10, equipment: [] as string[], technical_points: '', variables: '', image_url: '' }

// ── Calendar helpers ─────────────────────────────────────────────────────
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function toDateStr(d: Date) { return d.toISOString().slice(0, 10) }
const MONTH_DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// Monthly grid: rows of 7 days starting from Sunday containing the 1st of the month
function getMonthGrid(anchor: Date): Date[][] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = new Date(firstDay)
  startDay.setDate(firstDay.getDate() - firstDay.getDay()) // back to Sunday
  const rows: Date[][] = []
  const cur = new Date(startDay)
  while (true) {
    const row: Date[] = []
    for (let i = 0; i < 7; i++) { row.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
    rows.push(row)
    if (cur > lastDay) break
  }
  return rows
}

// Compute MD tag for a date given sorted match dates (YYYY-MM-DD)
function computeMdTag(dateStr: string, mDates: string[]): string | null {
  if (!mDates.length) return null
  const d = new Date(dateStr).getTime()
  let best: { tag: string; dist: number } | null = null
  for (const md of mDates) {
    const diff = Math.round((new Date(md).getTime() - d) / 86400000)
    if (diff === 0) return 'md'
    if (diff > 0 && diff <= 4 && (!best || diff < best.dist))
      best = { tag: `md-${diff}`, dist: diff }
    else if (diff < 0 && diff >= -2 && (!best || -diff < best.dist))
      best = { tag: `md+${-diff}`, dist: -diff }
  }
  return best?.tag ?? null
}

// Find which phase a date belongs to (for calendar coloring)
function getDayPhase(dateStr: string, phases: any[]) {
  return phases.find(p => p.start_date && p.end_date && dateStr >= p.start_date && dateStr <= p.end_date) ?? null
}

// ═══════════════════════════════════════════════════════════════════════
export default function TrainingPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [tab, setTab] = useState('phases')

  // Phases
  const [phases, setPhases] = useState<any[]>([])
  const [seasonMapView, setSeasonMapView] = useState<'timeline' | 'gantt'>('timeline')
  const [showPhase, setShowPhase] = useState(false)
  const [editingPhase, setEditingPhase] = useState<any>(null)
  const [phaseForm, setPhaseForm] = useState<any>(emptyPhase)
  const [savingPhase, setSavingPhase] = useState(false)
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null)
  const [phaseGoals, setPhaseGoals] = useState<Record<string, any[]>>({})
  const [confirmDeletePhaseId, setConfirmDeletePhaseId] = useState<string | null>(null)

  // Goals
  const [showGoal, setShowGoal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<any>(null)
  const [goalPhaseId, setGoalPhaseId] = useState('')
  const [goalTexts, setGoalTexts] = useState<string[]>([''])
  const [savingGoal, setSavingGoal] = useState(false)
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null)

  // Exercises
  const [exercises, setExercises] = useState<any[]>([])
  const [showExercise, setShowExercise] = useState(false)
  const [editingExercise, setEditingExercise] = useState<any>(null)
  const [exerciseForm, setExerciseForm] = useState<any>(emptyExercise)
  const [savingExercise, setSavingExercise] = useState(false)
  const [exerciseFilter, setExerciseFilter] = useState({ section: '', category: '', q: '' })
  const [selectedExercise, setSelectedExercise] = useState<any>(null)
  const [exerciseComments, setExerciseComments] = useState<any[]>([])
  const [exCommentText, setExCommentText] = useState('')
  const [exCommentRole, setExCommentRole] = useState('hc')
  const [savingExComment, setSavingExComment] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [confirmDeleteExId, setConfirmDeleteExId] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Sessions
  const [sessions, setSessions] = useState<any[]>([])
  const [showSession, setShowSession] = useState(false)
  const [editingSession, setEditingSession] = useState<any>(null)
  const [sessionForm, setSessionForm] = useState<any>(emptySession)
  const [savingSession, setSavingSession] = useState(false)
  const [selectedSession, setSelectedSession] = useState<any>(null)
  const [sessionBlocks, setSessionBlocks] = useState<any[]>([])
  const [sessionBlockExercises, setSessionBlockExercises] = useState<any[]>([])
  const [sessionIndividuals, setSessionIndividuals] = useState<Record<string, any[]>>({})
  const [sessionComments, setSessionComments] = useState<any[]>([])
  const [sessionCommentText, setSessionCommentText] = useState('')
  const [sessionCommentRole, setSessionCommentRole] = useState('hc')
  const [savingSessionComment, setSavingSessionComment] = useState(false)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null)
  const [sessionDateFilter, setSessionDateFilter] = useState('')
  const [sessionPhaseFilter, setSessionPhaseFilter] = useState('')

  // Blocks modal
  const [showBlock, setShowBlock] = useState(false)
  const [editingBlock, setEditingBlock] = useState<any>(null)
  const [blockForm, setBlockForm] = useState<any>(emptyBlock)
  const [savingBlock, setSavingBlock] = useState(false)
  const [confirmDeleteBlockId, setConfirmDeleteBlockId] = useState<string | null>(null)
  const [showAddExToBlock, setShowAddExToBlock] = useState<string | null>(null) // blockId
  const [addExAssignedTo, setAddExAssignedTo] = useState('all')
  const [addExDuration, setAddExDuration] = useState('')
  const [addExFilterQ, setAddExFilterQ] = useState('')
  const [addExFilterSection, setAddExFilterSection] = useState('')
  const [addExFilterCategory, setAddExFilterCategory] = useState('')

  // Individual program modal
  const [showIndividual, setShowIndividual] = useState(false)
  const [individualBlockId, setIndividualBlockId] = useState('')
  const [individualForm, setIndividualForm] = useState({ player_ids: [] as string[], reason: 'other', program_content: '', notes: '', supervisor_id: '' })
  const [savingIndividual, setSavingIndividual] = useState(false)

  // Calendar events (matches + training) from events table
  const [calendarEvents, setCalendarEvents] = useState<any[]>([])

  // Monthly view anchor (1st of displayed month)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Error
  const [error, setError] = useState('')

  // Training role of current user in the session (hc/fc/gkt/assistant)
  const [myTrainingRole, setMyTrainingRole] = useState<'hc' | 'fc' | 'gkt' | 'assistant'>('hc')
  const [assistantFullAccess, setAssistantFullAccess] = useState(false)

  // Inline block content editing
  const [inlineEdit, setInlineEdit] = useState<{ blockId: string; col: 'hc' | 'fc' | 'gkt'; value: string } | null>(null)

  // Custom equipment (persisted in localStorage)
  const [customEquipInput, setCustomEquipInput] = useState('')
  const [savedEquipment, setSavedEquipment] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ta_equipment_lib') || '[]') } catch { return [] }
  })

  const canManage = canManageTraining(myRole)

  useEffect(() => {
    if (!teamId || !user) return
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    const [role, ms, ph, ex, ss, evts] = await Promise.all([
      teamService.getMyRole(teamId, user.id),
      teamService.getMembers(teamId),
      trainingService.getPhases(teamId),
      trainingService.getExercises(teamId),
      trainingService.getSessions(teamId),
      eventService.getTeamEvents(teamId),
    ])
    const resolvedRole = role || ''
    setMyRole(resolvedRole)
    // Set training role based on system role
    if (resolvedRole === 'head_coach') setMyTrainingRole('hc')
    else if (resolvedRole === 'assistant_coach') setMyTrainingRole('assistant')
    setMembers(ms)
    setPhases(ph)
    setExercises(ex)
    const filteredEvts = (evts as any[]).filter(e => e.event_type === 'match' || e.event_type === 'training')
    setCalendarEvents(filteredEvts)

    // Auto-create sessions for training events in current + next 2 months (only for managers)
    let finalSessions = ss
    if (canManageTraining(resolvedRole) && teamId && user) {
      const today = new Date()
      const windowStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
      const windowEnd = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().slice(0, 10)
      const trainingEvts = filteredEvts.filter(e => e.event_type === 'training')
      const sessionDates = new Set((ss as any[]).map((s: any) => s.date))
      const missing = trainingEvts.filter((e: any) => {
        const d = e.start_datetime.slice(0, 10)
        return d >= windowStart && d <= windowEnd && !sessionDates.has(d)
      })
      if (missing.length > 0) {
        await Promise.all(missing.map((event: any) => trainingService.createSession({
          team_id: teamId, created_by: user.id,
          date: event.start_datetime.slice(0, 10),
          start_time: event.start_datetime.slice(11, 16) || null,
          title: event.title, intensity: 'medium', md_tag: 'free', duration_min: 90,
          category: 'first_team', phase_id: null, theme_id: null,
        })))
        finalSessions = await trainingService.getSessions(teamId)
      }
    }
    setSessions(finalSessions)
    setLoading(false)
  }

  async function loadPhaseGoals(phaseId: string) {
    const goals = await trainingService.getPhaseGoals(phaseId)
    setPhaseGoals(prev => ({ ...prev, [phaseId]: goals }))
  }

  async function loadSessionDetail(session: any) {
    setSelectedSession(session)
    const [rawBlocks, comments, blockEx] = await Promise.all([
      trainingService.getSessionBlocks(session.id),
      trainingService.getSessionComments(session.id),
      trainingService.getBlockExercises(session.id),
    ])

    // Auto-create standard blocks if missing (warmup / main / cooldown)
    let blocks = rawBlocks as any[]
    if (canManage && teamId) {
      const types = blocks.map((b: any) => b.block_type)
      const AUTO_BLOCKS = [
        { block_type: 'warmup',   title: 'الإحماء',         start_offset_min: 0,  duration_min: 15, order_index: 0 },
        { block_type: 'main',     title: 'الجزء الرئيسي',   start_offset_min: 15, duration_min: 60, order_index: 1 },
        { block_type: 'cooldown', title: 'التهدئة',          start_offset_min: 75, duration_min: 15, order_index: 2 },
      ]
      const missing = AUTO_BLOCKS.filter(b => !types.includes(b.block_type))
      if (missing.length > 0) {
        await Promise.all(missing.map(b => trainingService.createBlock({
          ...b, session_id: session.id, team_id: teamId, content_hc: '', content_fc: '', content_gkt: '',
        })))
        blocks = await trainingService.getSessionBlocks(session.id) as any[]
      }
    }

    // Sort: warmup → main → cooldown → individual (by order_index)
    blocks.sort((a: any, b: any) => {
      const ORDER: Record<string, number> = { warmup: 0, main: 1, cooldown: 2, individual: 3 }
      const typeOrder = (ORDER[a.block_type] ?? 4) - (ORDER[b.block_type] ?? 4)
      return typeOrder !== 0 ? typeOrder : (a.order_index ?? 0) - (b.order_index ?? 0)
    })

    setSessionBlocks(blocks)
    setSessionComments(comments)
    setSessionBlockExercises(blockEx)
    // Load individual assignments
    const indivBlocks = blocks.filter((b: any) => b.block_type === 'individual')
    const indivMap: Record<string, any[]> = {}
    for (const b of indivBlocks) {
      indivMap[b.id] = await trainingService.getIndividualAssignments(b.id)
    }
    setSessionIndividuals(indivMap)
  }

  async function loadExerciseDetail(ex: any) {
    setSelectedExercise(ex)
    setExerciseComments(await trainingService.getExerciseComments(ex.id))
  }

  // ─ Phase handlers ─
  function openCreatePhase() { setEditingPhase(null); setPhaseForm(emptyPhase); setError(''); setShowPhase(true) }
  function openEditPhase(p: any) { setEditingPhase(p); setPhaseForm({ ...p }); setError(''); setShowPhase(true) }

  async function submitPhase() {
    if (!teamId || !user || !canManage) return
    if (!phaseForm.name.trim()) { setError('اكتب اسم المرحلة'); return }
    setSavingPhase(true); setError('')
    const payload = { ...phaseForm, team_id: teamId, created_by: editingPhase?.created_by || user.id, name: phaseForm.name.trim(), start_date: phaseForm.start_date || null, end_date: phaseForm.end_date || null }
    const result = editingPhase ? await trainingService.updatePhase(editingPhase.id, payload) : await trainingService.createPhase(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ المرحلة'); setSavingPhase(false); return }
    await load(); setShowPhase(false); setSavingPhase(false)
  }

  async function deletePhase(id: string) {
    if (!canManage) return
    await trainingService.deletePhase(id)
    setConfirmDeletePhaseId(null)
    await load()
  }

  async function togglePhaseExpand(phaseId: string) {
    if (expandedPhaseId === phaseId) { setExpandedPhaseId(null); return }
    setExpandedPhaseId(phaseId)
    if (!phaseGoals[phaseId]) await loadPhaseGoals(phaseId)
  }

  // ─ Goal handlers ─
  function openAddGoal(phaseId: string) { setGoalPhaseId(phaseId); setEditingGoal(null); setGoalTexts(['']); setError(''); setShowGoal(true) }
  function openEditGoal(goal: any, phaseId: string) { setGoalPhaseId(phaseId); setEditingGoal(goal); setGoalTexts([goal.goal_text]); setError(''); setShowGoal(true) }

  async function submitGoal() {
    if (!teamId || !goalPhaseId) return
    const validTexts = goalTexts.map(t => t.trim()).filter(Boolean)
    if (!validTexts.length) { setError('اكتب نص الهدف على الأقل'); return }
    setSavingGoal(true); setError('')
    if (editingGoal) {
      const result = await trainingService.updatePhaseGoal(editingGoal.id, { phase_id: goalPhaseId, team_id: teamId, goal_text: validTexts[0], sort_order: editingGoal.sort_order })
      if (result.error) { setError(result.error.message || 'تعذر حفظ الهدف'); setSavingGoal(false); return }
    } else {
      const base = phaseGoals[goalPhaseId]?.length || 0
      const results = await Promise.all(validTexts.map((text, i) =>
        trainingService.createPhaseGoal({ phase_id: goalPhaseId, team_id: teamId, goal_text: text, sort_order: base + i })
      ))
      const failed = results.filter((r: any) => r.error)
      if (failed.length) { setError('تعذر حفظ بعض الأهداف'); setSavingGoal(false); return }
    }
    await loadPhaseGoals(goalPhaseId); setShowGoal(false); setSavingGoal(false)
  }

  async function updateGoalAchievement(goalId: string, phaseId: string, pct: number, notes: string) {
    await trainingService.updatePhaseGoal(goalId, { achievement_pct: pct, achievement_notes: notes, is_approved: true, approved_at: new Date().toISOString(), approved_by: user?.id })
    await loadPhaseGoals(phaseId)
  }

  async function deleteGoal(id: string, phaseId: string) {
    await trainingService.deletePhaseGoal(id)
    setConfirmDeleteGoalId(null)
    await loadPhaseGoals(phaseId)
  }

  // ─ Exercise handlers ─
  function openCreateExercise() { setEditingExercise(null); setExerciseForm(emptyExercise); setError(''); setShowExercise(true) }
  function openEditExercise(ex: any) { setEditingExercise(ex); setExerciseForm({ ...emptyExercise, ...ex, equipment: ex.equipment || [] }); setError(''); setShowExercise(true) }

  function toggleEquipment(item: string) {
    setExerciseForm((p: any) => {
      const arr: string[] = p.equipment || []
      return { ...p, equipment: arr.includes(item) ? arr.filter((e: string) => e !== item) : [...arr, item] }
    })
  }

  async function handleExerciseImageUpload(file: File) {
    if (!teamId) return
    setUploadingImage(true)
    const { url, error: uploadError } = await trainingService.uploadExerciseImage(file, teamId)
    if (uploadError) { setError(uploadError); setUploadingImage(false); return }
    setExerciseForm((p: any) => ({ ...p, image_url: url }))
    setUploadingImage(false)
  }

  async function submitExercise() {
    if (!teamId || !user || !canManage) return
    if (!exerciseForm.name.trim()) { setError('اكتب اسم التمرين'); return }
    setSavingExercise(true); setError('')
    const payload = { ...exerciseForm, team_id: teamId, created_by: editingExercise?.created_by || user.id, name: exerciseForm.name.trim(), equipment: exerciseForm.equipment || [] }
    const result = editingExercise ? await trainingService.updateExercise(editingExercise.id, payload) : await trainingService.createExercise(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ التمرين'); setSavingExercise(false); return }
    await load(); setShowExercise(false); setSavingExercise(false)
    // If we were viewing exercise detail, refresh it
    if (selectedExercise && editingExercise?.id === selectedExercise.id) {
      const updated = exercises.find(e => e.id === editingExercise.id)
      if (updated) setSelectedExercise({ ...updated, ...payload })
    }
  }

  async function saveExerciseCopy() {
    // Save current exerciseForm as a NEW exercise (copy with edits)
    if (!teamId || !user || !exerciseForm.name.trim()) { setError('اكتب اسم التمرين'); return }
    setSavingExercise(true); setError('')
    const payload = { ...exerciseForm, team_id: teamId, created_by: user.id, name: exerciseForm.name.trim() + ' (نسخة)', equipment: exerciseForm.equipment || [] }
    delete payload.id
    const result = await trainingService.createExercise(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ النسخة'); setSavingExercise(false); return }
    await load(); setShowExercise(false); setSavingExercise(false)
  }

  async function addExerciseComment() {
    if (!teamId || !user || !selectedExercise || !exCommentText.trim()) return
    setSavingExComment(true)
    const result = await trainingService.addExerciseComment({ exercise_id: selectedExercise.id, team_id: teamId, author_id: user.id, author_role: exCommentRole, comment: exCommentText.trim() })
    if (!result.error && result.data) {
      setExerciseComments(prev => [...prev, result.data])
      setExCommentText('')
    }
    setSavingExComment(false)
  }

  // ─ Session handlers ─
  function openCreateSession() { setEditingSession(null); setSessionForm({ ...emptySession, date: new Date().toISOString().slice(0, 10) }); setError(''); setShowSession(true) }
  function openEditSession(s: any) { setEditingSession(s); setSessionForm({ ...emptySession, ...s, phase_id: s.phase_id || '', theme_id: s.theme_id || '', match_event_id: s.match_event_id || '' }); setError(''); setShowSession(true) }

  async function submitSession() {
    if (!teamId || !user || !canManage) return
    if (!sessionForm.title.trim()) { setError('اكتب عنوان الوحدة'); return }
    if (!sessionForm.date) { setError('حدد تاريخ الوحدة'); return }
    setSavingSession(true); setError('')
    const payload = { ...sessionForm, team_id: teamId, created_by: editingSession?.created_by || user.id, title: sessionForm.title.trim(), phase_id: sessionForm.phase_id || null, theme_id: sessionForm.theme_id || null, start_time: sessionForm.start_time || null, match_event_id: sessionForm.match_event_id || null }
    const result = editingSession ? await trainingService.updateSession(editingSession.id, payload) : await trainingService.createSession(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ الوحدة'); setSavingSession(false); return }
    await load()
    // If we have a new session, open it
    if (!editingSession && result.data) {
      await loadSessionDetail(result.data)
    } else if (editingSession && selectedSession?.id === editingSession.id) {
      await loadSessionDetail({ ...selectedSession, ...payload })
    }
    setShowSession(false); setSavingSession(false)
  }

  async function deleteSession(id: string) {
    if (!canManage) return
    await trainingService.deleteSession(id)
    if (selectedSession?.id === id) setSelectedSession(null)
    setConfirmDeleteSessionId(null)
    await load()
  }

  // ─ Block handlers ─
  function openAddBlock(type?: string) { setEditingBlock(null); setBlockForm({ ...emptyBlock, block_type: type || 'main', order_index: sessionBlocks.length }); setError(''); setShowBlock(true) }
  function openEditBlock(b: any) { setEditingBlock(b); setBlockForm({ ...b }); setError(''); setShowBlock(true) }

  async function submitBlock() {
    if (!selectedSession || !teamId || !canManage) return
    setSavingBlock(true); setError('')
    const payload = { ...blockForm, session_id: selectedSession.id, team_id: teamId, order_index: editingBlock?.order_index ?? sessionBlocks.length }
    const result = editingBlock ? await trainingService.updateBlock(editingBlock.id, payload) : await trainingService.createBlock(payload)
    if (result.error) { setError(result.error.message || 'تعذر حفظ القسم'); setSavingBlock(false); return }
    await loadSessionDetail(selectedSession)
    setShowBlock(false); setSavingBlock(false)
  }

  async function deleteBlock(id: string) {
    if (!canManage || !selectedSession) return
    await trainingService.deleteBlock(id)
    setConfirmDeleteBlockId(null)
    await loadSessionDetail(selectedSession)
  }

  // ─ Block exercise handlers ─
  async function addExerciseToBlock(blockId: string, exerciseId: string) {
    if (!selectedSession || !teamId || !canManage) return
    const block = sessionBlocks.find((b: any) => b.id === blockId)
    const existingCount = sessionBlockExercises.filter((be: any) => be.block_id === blockId).length
    await trainingService.addBlockExercise({ block_id: blockId, session_id: selectedSession.id, team_id: teamId, exercise_id: exerciseId, assigned_to: addExAssignedTo, order_index: existingCount, duration_min: addExDuration ? Number(addExDuration) : null })
    await loadSessionDetail(selectedSession)
    setShowAddExToBlock(null); setAddExAssignedTo('all'); setAddExDuration('')
  }

  async function removeExerciseFromBlock(id: string) {
    if (!canManage || !selectedSession) return
    await trainingService.removeBlockExercise(id)
    await loadSessionDetail(selectedSession)
  }

  // ─ Individual program handlers ─
  async function submitIndividual() {
    if (!selectedSession || !teamId || !canManage || !individualForm.player_ids.length) return
    setSavingIndividual(true)
    const { player_ids, ...rest } = individualForm
    await Promise.all(player_ids.map(pid =>
      trainingService.addIndividualAssignment({
        block_id: individualBlockId,
        session_id: selectedSession.id,
        team_id: teamId,
        player_id: pid,
        reason: rest.reason,
        program_content: rest.program_content,
        notes: rest.notes,
        supervisor_id: rest.supervisor_id || null,
      })
    ))
    const indivBlocks = sessionBlocks.filter((b: any) => b.block_type === 'individual')
    const indivMap: Record<string, any[]> = { ...sessionIndividuals }
    for (const b of indivBlocks) {
      indivMap[b.id] = await trainingService.getIndividualAssignments(b.id)
    }
    setSessionIndividuals(indivMap)
    setShowIndividual(false); setSavingIndividual(false)
    setIndividualForm({ player_ids: [], reason: 'other', program_content: '', notes: '', supervisor_id: '' })
  }

  async function removeIndividual(id: string, blockId: string) {
    if (!canManage) return
    await trainingService.removeIndividualAssignment(id)
    setSessionIndividuals(prev => ({ ...prev, [blockId]: (prev[blockId] || []).filter((a: any) => a.id !== id) }))
  }

  // ─ Session comment handlers ─
  async function addSessionCommentHandler() {
    if (!teamId || !user || !selectedSession || !sessionCommentText.trim()) return
    setSavingSessionComment(true)
    const result = await trainingService.addSessionComment({ session_id: selectedSession.id, team_id: teamId, author_id: user.id, author_role: sessionCommentRole, comment: sessionCommentText.trim() })
    if (!result.error && result.data) { setSessionComments(prev => [...prev, result.data]); setSessionCommentText('') }
    setSavingSessionComment(false)
  }

  // ─ Inline block content save ─
  async function saveInlineBlockContent() {
    if (!inlineEdit || !selectedSession || !user) return
    const block = sessionBlocks.find((b: any) => b.id === inlineEdit.blockId)
    if (!block) return
    const now = new Date().toISOString()
    const payload: any = {
      [`content_${inlineEdit.col}`]: inlineEdit.value,
      [`authored_${inlineEdit.col}`]: user.id,
      [`authored_${inlineEdit.col}_at`]: now,
    }
    await trainingService.updateBlock(inlineEdit.blockId, { ...block, ...payload })
    setInlineEdit(null)
    await loadSessionDetail(selectedSession)
  }

  // ─ Print session as landscape PDF ─
  function printSession() {
    const session = selectedSession
    if (!session) return
    const blocks = sessionBlocks

    const bulletLines = (text: string) =>
      text ? text.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean) : []

    const exRows = (filter: string[]) =>
      sessionBlockExercises
        .filter((be: any) => filter.includes(be.assigned_to))
        .map((be: any) => {
          const ex = be.exercise
          if (!ex) return ''
          const pts = bulletLines(ex.technical_points).map(l => `<li>${l}</li>`).join('')
          const vars = bulletLines(ex.variables).map(l => `<li>${l}</li>`).join('')
          const imgHtml = ex.image_url
            ? `<img src="${ex.image_url}" style="width:52px;height:52px;object-fit:cover;border-radius:5px;flex-shrink:0;display:block;border:1px solid #e2e8f0;"/>`
            : ''
          return `<div style="margin-top:5px;padding:5px 7px;background:#f8fafc;border-radius:6px;font-size:10px;display:flex;gap:7px;align-items:flex-start;">
            ${imgHtml}
            <div style="flex:1;min-width:0;">
              <strong>${ex.name}</strong>${(be.duration_min || ex.duration_min) ? ` · ${be.duration_min || ex.duration_min}دق` : ''}${ex.player_count_min ? ` · ${ex.player_count_min}+ لاعب` : ''}
              ${ex.description ? `<div style="color:#475569;margin-top:2px;line-height:1.4;">${ex.description}</div>` : ''}
              ${pts ? `<div style="margin-top:2px;font-weight:bold;color:#475569;">النقاط الفنية:</div><ul style="margin:1px 0 0;padding-right:14px;">${pts}</ul>` : ''}
              ${vars ? `<div style="margin-top:2px;font-weight:bold;color:#475569;">المتغيرات:</div><ul style="margin:1px 0 0;padding-right:14px;">${vars}</ul>` : ''}
            </div>
          </div>`
        }).join('')

    const blockRows = blocks.map((block: any) => {
      const timeStr = block.start_offset_min
        ? `${String(Math.floor(block.start_offset_min / 60)).padStart(2, '0')}:${String(block.start_offset_min % 60).padStart(2, '0')}`
        : '—'
      const typeColors: Record<string, string> = { warmup: '#f97316', main: '#3b82f6', cooldown: '#14b8a6', individual: '#a855f7' }
      const borderColor = typeColors[block.block_type] || '#94a3b8'
      const typeLabel = BLOCK_TYPE_LABEL[block.block_type] || block.block_type

      if (block.block_type === 'individual') {
        const assignments = (sessionIndividuals[block.id] || []).map((a: any) =>
          `<div style="margin-top:4px;padding:5px 7px;background:#f5f3ff;border-radius:6px;font-size:10px;">
            <strong>${a.player?.full_name || '—'}</strong>
            ${a.supervisor?.full_name ? ` · مشرف: ${a.supervisor.full_name}` : ''}
            ${ASSIGNMENT_REASON_LABEL[a.reason] ? ` (${ASSIGNMENT_REASON_LABEL[a.reason]})` : ''}
            ${a.program_content ? `<div style="margin-top:2px;color:#475569;">${a.program_content}</div>` : ''}
          </div>`
        ).join('')
        return `<tr>
          <td style="border-right:4px solid ${borderColor};padding:7px 9px;width:90px;vertical-align:top;">
            <strong>${typeLabel}</strong><br>${timeStr}<br>${block.duration_min}دق
          </td>
          <td colspan="3" style="padding:7px 9px;vertical-align:top;border:1px solid #e2e8f0;">${assignments || '—'}</td>
        </tr>`
      }

      return `<tr>
        <td style="border-right:4px solid ${borderColor};padding:7px 9px;width:90px;vertical-align:top;">
          <strong>${typeLabel}</strong><br><span style="color:#64748b;">${timeStr}</span><br>${block.duration_min}دق
          ${block.title ? `<br><small style="color:#94a3b8;">${block.title}</small>` : ''}
        </td>
        <td style="padding:7px 9px;vertical-align:top;border:1px solid #e2e8f0;width:30%;">
          <div style="white-space:pre-wrap;font-size:11px;">${block.content_fc || ''}</div>${exRows(['fc', 'all'])}
        </td>
        <td style="padding:7px 9px;vertical-align:top;border:1px solid #e2e8f0;width:35%;">
          <div style="white-space:pre-wrap;font-size:11px;">${block.content_hc || ''}</div>${exRows(['hc', 'all'])}
        </td>
        <td style="padding:7px 9px;vertical-align:top;border:1px solid #e2e8f0;width:25%;">
          <div style="white-space:pre-wrap;font-size:11px;">${block.content_gkt || ''}</div>${exRows(['gkt', 'all'])}
        </td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>بطاقة الوحدة التدريبية</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11px; direction: rtl; color: #1e293b; margin: 0; }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #1e293b; padding-bottom: 6px; }
    .header h1 { font-size: 15px; margin: 0 0 3px; }
    .header p { margin: 1px 0; color: #475569; font-size: 10px; }
    .goals { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px; }
    .goal-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; font-size: 10px; }
    .goal-label { font-weight: bold; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e293b; color: white; padding: 6px 9px; text-align: right; font-size: 10px; font-weight: bold; }
    td { border: 1px solid #e2e8f0; }
    ul { margin: 0; padding-right: 14px; }
    li { margin: 1px 0; }
    img { display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>بطاقة الوحدة التدريبية الرسمية</h1>
    <p>${session.title} · ${session.date}${session.start_time ? ' · ' + session.start_time.slice(0, 5) : ''} · ${session.duration_min} دقيقة${session.intensity ? ' · الشدة: ' + INTENSITY_LABEL[session.intensity] : ''}</p>
  </div>
  ${session.tactical_goal || session.physical_goal || session.gk_goal ? `
  <div class="goals">
    <div class="goal-box"><div class="goal-label" style="color:#2563eb;">⚽ الهدف التكتيكي (HC)</div>${session.tactical_goal || '—'}</div>
    <div class="goal-box"><div class="goal-label" style="color:#ea580c;">💪 الهدف البدني (FC)</div>${session.physical_goal || '—'}</div>
    <div class="goal-box"><div class="goal-label" style="color:#16a34a;">🧤 هدف الحراس (GKT)</div>${session.gk_goal || '—'}</div>
  </div>` : ''}
  <table>
    <thead>
      <tr>
        <th style="width:90px;">الوقت / القسم</th>
        <th style="width:30%;">💪 FC — مدرب اللياقة</th>
        <th style="width:35%;">⚽ HC — المدرب الرئيسي</th>
        <th>🧤 GKT — مدرب الحراس</th>
      </tr>
    </thead>
    <tbody>${blockRows}</tbody>
  </table>
  ${session.notes ? `<div style="margin-top:8px;padding:6px 9px;background:#f8fafc;border-radius:6px;font-size:10px;"><strong>ملاحظات:</strong> ${session.notes}</div>` : ''}
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 600)
  }

  // ─ Custom equipment library ─
  function addCustomEquipment() {
    const item = customEquipInput.trim()
    if (!item) return
    const newSaved = savedEquipment.includes(item) ? savedEquipment : [...savedEquipment, item]
    setSavedEquipment(newSaved)
    try { localStorage.setItem('ta_equipment_lib', JSON.stringify(newSaved)) } catch {}
    // Also select it in the form
    setExerciseForm((p: any) => {
      const arr: string[] = p.equipment || []
      return { ...p, equipment: arr.includes(item) ? arr : [...arr, item] }
    })
    setCustomEquipInput('')
  }

  // ─ Computed ─
  const filteredExercises = useMemo(() => exercises.filter(e => {
    if (exerciseFilter.section && e.section !== exerciseFilter.section) return false
    if (exerciseFilter.category && e.category !== exerciseFilter.category) return false
    if (exerciseFilter.q && !e.name.toLowerCase().includes(exerciseFilter.q.toLowerCase())) return false
    return true
  }), [exercises, exerciseFilter])

  const filteredSessions = useMemo(() => sessions.filter(s => {
    if (sessionPhaseFilter && s.phase_id !== sessionPhaseFilter) return false
    if (sessionDateFilter && !s.date.startsWith(sessionDateFilter)) return false
    return true
  }), [sessions, sessionPhaseFilter, sessionDateFilter])

  // Match dates for MD computation
  const matchDates = useMemo(() =>
    calendarEvents.filter(e => e.event_type === 'match').map(e => e.start_datetime.slice(0, 10)),
    [calendarEvents])

  const players = useMemo(() => members.filter(m => m.role === 'player'), [members])

  const allEquipment = useMemo(() => {
    const combined = [...EQUIPMENT_OPTIONS, ...savedEquipment]
    return combined.filter((v, i, a) => a.indexOf(v) === i)
  }, [savedEquipment])

  // ── Guards ──
  if (loading) return <div className="flex justify-center py-20"><Spinner/></div>
  if (!canViewTraining(myRole)) {
    return <EmptyState icon={<Eye size={28}/>} title="لا تملك صلاحية عرض الخطة التدريبية" description="القسم مخصص للجهاز الفني."/>
  }

  return (
    <div dir="rtl">
      <PageHeader
        title="الخطة التدريبية"
        subtitle="مراحل الموسم، الجدول الشهري، مكتبة التمارين"
        action={canManage && tab === 'library' && (
          <button className="btn btn-primary btn-sm" onClick={openCreateExercise}>
            <Plus size={14}/> تمرين جديد
          </button>
        )}
      />

      <Tabs
        active={tab}
        onChange={t => { setTab(t); setSelectedExercise(null) }}
        tabs={[
          { key: 'phases', label: 'مراحل الموسم', badge: phases.length || undefined },
          { key: 'weekly', label: 'الجدول الشهري' },
          { key: 'library', label: 'مكتبة التمارين', badge: exercises.length || undefined },
        ]}
      />

      {/* ═══ TAB: PHASES ═══════════════════════════════════════════════ */}
      {tab === 'phases' && (
        <div>
          <div className="flex justify-end mb-4">
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={openCreatePhase}><Plus size={14}/> إضافة مرحلة</button>
            )}
          </div>

          {phases.length === 0 ? (
            <EmptyState icon={<Target size={28}/>} title="لا توجد مراحل موسم" description="أضف مراحل الموسم لتنظيم الخطة التدريبية"/>
          ) : (
            <div className="space-y-3">
              {/* ── Season Map ───────────────────────────────────────── */}
              {(() => {
                const todayD = new Date()
                const todayStr = todayD.toISOString().slice(0, 10)
                const sy = todayD.getMonth() >= 7 ? todayD.getFullYear() : todayD.getFullYear() - 1
                const SEA_START = new Date(sy, 7, 1).getTime()
                const SEA_END   = new Date(sy + 1, 4, 31, 23, 59, 59).getTime()
                const TOTAL_MS  = SEA_END - SEA_START
                const MONTHS = [
                  { y: sy,     m: 7,  label: 'أغسطس' },
                  { y: sy,     m: 8,  label: 'سبتمبر' },
                  { y: sy,     m: 9,  label: 'أكتوبر' },
                  { y: sy,     m: 10, label: 'نوفمبر' },
                  { y: sy,     m: 11, label: 'ديسمبر' },
                  { y: sy + 1, m: 0,  label: 'يناير' },
                  { y: sy + 1, m: 1,  label: 'فبراير' },
                  { y: sy + 1, m: 2,  label: 'مارس' },
                  { y: sy + 1, m: 3,  label: 'أبريل' },
                  { y: sy + 1, m: 4,  label: 'مايو' },
                ]
                function datePct(ds: string) {
                  return Math.max(0, Math.min(100, ((new Date(ds + 'T00:00:00').getTime() - SEA_START) / TOTAL_MS) * 100))
                }
                const todayPct = datePct(todayStr)
                const inSeason = todayD.getTime() >= SEA_START && todayD.getTime() <= SEA_END
                const curY = todayD.getFullYear(), curM = todayD.getMonth()
                const phasesWithDates = phases.filter(p => p.start_date && p.end_date)

                return (
                  <div className="card overflow-hidden mb-1" dir="ltr">
                    {/* Map header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100" dir="rtl">
                      <div>
                        <span className="font-extrabold text-slate-800 text-sm">خريطة الموسم</span>
                        <span className="text-[11px] text-slate-400 mr-2">{sy}/{sy + 1}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        <button
                          className={cn('px-3 py-1 rounded-md text-[11px] font-bold transition-all', seasonMapView === 'timeline' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700')}
                          onClick={() => setSeasonMapView('timeline')}>
                          شريط
                        </button>
                        <button
                          className={cn('px-3 py-1 rounded-md text-[11px] font-bold transition-all', seasonMapView === 'gantt' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700')}
                          onClick={() => setSeasonMapView('gantt')}>
                          جدول
                        </button>
                      </div>
                    </div>

                    {seasonMapView === 'timeline' ? (
                      /* ── Scenario 1: Horizontal Timeline Bar ── */
                      <div className="px-4 pt-3 pb-4">
                        {/* Month labels */}
                        <div className="flex mb-1">
                          {MONTHS.map((mo, i) => (
                            <div key={i} style={{ width: '10%' }}
                              className={cn('text-center text-[9px] font-bold truncate px-0.5', mo.y === curY && mo.m === curM ? 'text-orange-500' : 'text-slate-400')}>
                              {mo.label.slice(0, 3)}
                            </div>
                          ))}
                        </div>

                        {/* Phase bars + today needle */}
                        <div className="relative rounded-lg overflow-hidden" style={{ height: phasesWithDates.length * 38 + 16 }}>
                          {/* Month grid lines */}
                          {MONTHS.map((mo, i) => (
                            <div key={i} className={cn('absolute top-0 bottom-0', mo.y === curY && mo.m === curM ? 'bg-orange-50' : '')}
                              style={{ left: `${i * 10}%`, width: '10%', borderRight: '1px solid #f1f5f9' }}/>
                          ))}

                          {/* Phase bars */}
                          {phasesWithDates.map((phase, i) => {
                            const l = datePct(phase.start_date)
                            const r = datePct(phase.end_date)
                            const w = Math.max(r - l, 1)
                            const isActive = inSeason && phase.start_date <= todayStr && phase.end_date >= todayStr
                            return (
                              <div key={phase.id}
                                className="absolute flex items-center px-2 rounded-lg overflow-hidden"
                                style={{
                                  left: `${l}%`, width: `${w}%`,
                                  top: 8 + i * 38, height: 30,
                                  backgroundColor: `${phase.color}20`,
                                  border: `2px solid ${isActive ? phase.color : phase.color + '88'}`,
                                  boxShadow: isActive ? `0 0 0 2px ${phase.color}33` : undefined,
                                }}>
                                <span className="text-[10px] font-extrabold truncate" style={{ color: phase.color }}>
                                  {phase.name}
                                </span>
                              </div>
                            )
                          })}

                          {/* Today needle */}
                          {inSeason && (
                            <div className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                              style={{ left: `${todayPct}%`, transform: 'translateX(-50%)' }}>
                              <div className="flex-1 w-px bg-orange-500"/>
                              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white shadow-md flex-shrink-0"/>
                            </div>
                          )}
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap" dir="rtl">
                          {inSeason && (
                            <span className="flex items-center gap-1 text-[10px] text-orange-500 font-bold">
                              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"/>
                              أنت هنا
                            </span>
                          )}
                          {phasesWithDates.map(p => (
                            <span key={p.id} className="flex items-center gap-1 text-[10px] text-slate-500">
                              <span className="w-2.5 h-2 rounded-sm inline-block" style={{ backgroundColor: p.color }}/>
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* ── Scenario 2: Gantt Swim Lanes ── */
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left text-[10px] font-bold text-slate-500 py-2 px-3 w-36 bg-white sticky left-0 z-10">المرحلة</th>
                              {MONTHS.map((mo, i) => {
                                const isCur = mo.y === curY && mo.m === curM
                                return (
                                  <th key={i} className={cn('text-center text-[9px] font-bold py-2 px-0 border-r border-slate-100', isCur ? 'text-orange-500 bg-orange-50' : 'text-slate-400')}>
                                    {mo.label.slice(0, 3)}
                                    {isCur && <div className="text-[8px] font-bold text-orange-400">▼</div>}
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {phasesWithDates.map(phase => {
                              const isActive = inSeason && phase.start_date <= todayStr && phase.end_date >= todayStr
                              return (
                                <tr key={phase.id} className="border-b border-slate-50">
                                  <td className="py-2 px-3 bg-white sticky left-0 z-10">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color }}/>
                                      <span className="text-[11px] font-extrabold truncate" style={{ color: phase.color }}>{phase.name}</span>
                                      {isActive && <span className="text-[9px] bg-orange-100 text-orange-600 font-bold px-1 rounded-full flex-shrink-0">الآن</span>}
                                    </div>
                                  </td>
                                  {MONTHS.map((mo, i) => {
                                    const moStart = new Date(mo.y, mo.m, 1).toISOString().slice(0, 10)
                                    const moEnd   = new Date(mo.y, mo.m + 1, 0).toISOString().slice(0, 10)
                                    const overlaps = phase.start_date <= moEnd && phase.end_date >= moStart
                                    const isCur = mo.y === curY && mo.m === curM
                                    const startsHere = phase.start_date >= moStart && phase.start_date <= moEnd
                                    const endsHere   = phase.end_date   >= moStart && phase.end_date   <= moEnd
                                    return (
                                      <td key={i} className={cn('py-1.5 px-0.5 border-r border-slate-100', isCur ? 'bg-orange-50' : '')}>
                                        {overlaps && (
                                          <div className="h-5 w-full"
                                            style={{
                                              backgroundColor: phase.color,
                                              opacity: 0.75,
                                              borderRadius: `${startsHere ? '6px' : '0'} ${endsHere ? '6px' : '0'} ${endsHere ? '6px' : '0'} ${startsHere ? '6px' : '0'}`,
                                            }}/>
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        {inSeason && (
                          <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-orange-500 font-bold border-t border-slate-100" dir="rtl">
                            <span className="w-3 h-3 rounded-sm bg-orange-50 border border-orange-300 inline-block"/>
                            العمود المظلل = الشهر الحالي (أنت هنا)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* End-of-season average across all loaded phases */}
              {Object.keys(phaseGoals).length > 0 && (() => {
                const allGoals = Object.values(phaseGoals).flat()
                const withPct = allGoals.filter((g: any) => g.achievement_pct != null)
                if (withPct.length < 2) return null
                const avg = Math.round(withPct.reduce((s: number, g: any) => s + g.achievement_pct, 0) / withPct.length)
                const cls = avg >= 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : avg >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'
                return (
                  <div className={cn('flex items-center gap-3 rounded-xl border p-3', cls)}>
                    <Target size={16}/>
                    <span className="text-sm font-extrabold">معدل إنجاز الموسم:</span>
                    <span className="text-xl font-extrabold">{avg}%</span>
                    <span className="text-xs opacity-70">من {withPct.length} هدف مقيّم</span>
                  </div>
                )
              })()}
              {phases.map(phase => {
                const isExpanded = expandedPhaseId === phase.id
                const goals = phaseGoals[phase.id] || []
                const today = new Date().toISOString().slice(0, 10)
                const phaseEnded = phase.end_date && phase.end_date < today
                return (
                  <div key={phase.id} className="card overflow-hidden">
                    {/* Phase header bar */}
                    <div className="h-1.5 w-full" style={{ backgroundColor: phase.color }}/>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-4 h-4 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: phase.color }}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-extrabold text-slate-900">{phase.name}</h3>
                              <span className="text-[11px] text-slate-400">{PHASE_TYPE_LABEL[phase.phase_type]}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 flex gap-3 flex-wrap">
                              {phase.start_date && <span>من: {phase.start_date}</span>}
                              {phase.end_date && <span>إلى: {phase.end_date}</span>}
                              {phaseEnded && <span className="text-slate-300">• منتهية</span>}
                            </div>
                            {phase.description && <p className="text-xs text-slate-500 mt-1">{phase.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canManage && (
                            <>
                              {confirmDeletePhaseId === phase.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-red-600 font-bold">حذف؟</span>
                                  <button className="btn btn-ghost btn-sm text-red-600" onClick={() => deletePhase(phase.id)}>نعم</button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeletePhaseId(null)}>لا</button>
                                </div>
                              ) : (
                                <>
                                  <button className="btn btn-ghost btn-sm" onClick={() => openEditPhase(phase)}><Pencil size={13}/></button>
                                  <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDeletePhaseId(phase.id)}><Trash2 size={13}/></button>
                                </>
                              )}
                            </>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => togglePhaseExpand(phase.id)}>
                            {isExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                          </button>
                        </div>
                      </div>

                      {/* Goals */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-500">الأهداف ({goals.length})</span>
                              {goals.length > 0 && (() => {
                                const withPct = goals.filter((g: any) => g.achievement_pct != null)
                                if (!withPct.length) return null
                                const avg = Math.round(withPct.reduce((s: number, g: any) => s + g.achievement_pct, 0) / withPct.length)
                                const cls = avg >= 80 ? 'bg-emerald-100 text-emerald-700' : avg >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                return <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', cls)}>إنجاز: {avg}%</span>
                              })()}
                            </div>
                            {canManage && (
                              <button className="btn btn-ghost btn-sm text-xs" onClick={() => openAddGoal(phase.id)}><Plus size={12}/> هدف</button>
                            )}
                          </div>
                          {goals.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-2">لا توجد أهداف — أضف هدفاً لهذه المرحلة</p>
                          ) : (
                            <div className="space-y-3">
                              {goals.map((goal: any) => (
                                <GoalCard
                                  key={goal.id}
                                  goal={goal}
                                  phaseEnded={!!phaseEnded}
                                  canManage={canManage}
                                  confirmDeleteGoalId={confirmDeleteGoalId}
                                  onEdit={() => openEditGoal(goal, phase.id)}
                                  onDelete={() => deleteGoal(goal.id, phase.id)}
                                  onConfirmDelete={() => setConfirmDeleteGoalId(goal.id)}
                                  onCancelDelete={() => setConfirmDeleteGoalId(null)}
                                  onApprove={(pct, notes) => updateGoalAchievement(goal.id, phase.id, pct, notes)}
                                />
                              ))}
                            </div>
                          )}
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

      {/* ═══ TAB: MONTHLY CALENDAR ══════════════════════════════════════ */}
      {tab === 'weekly' && (
        <div>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>← الشهر السابق</button>
            <span className="font-extrabold text-slate-800 text-sm">
              {currentMonth.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>الشهر التالي →</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {MONTH_DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] font-extrabold text-slate-400 py-1 truncate">{d}</div>
            ))}
          </div>

          {/* Month grid */}
          <div className="space-y-1">
            {getMonthGrid(currentMonth).map((row, ri) => (
              <div key={ri} className="grid grid-cols-7 gap-1">
                {row.map(day => {
                  const key = toDateStr(day)
                  const inMonth = day.getMonth() === currentMonth.getMonth()
                  const isToday = key === new Date().toISOString().slice(0, 10)
                  const dayMatches = calendarEvents.filter(e => e.event_type === 'match' && e.start_datetime.slice(0, 10) === key)
                  const dayTrainingEvts = calendarEvents.filter(e => e.event_type === 'training' && e.start_datetime.slice(0, 10) === key)
                  const daySessions = sessions.filter(s => s.date === key)
                  const mdTag = inMonth ? computeMdTag(key, matchDates) : null
                  const dayPhase = inMonth && !isToday ? getDayPhase(key, phases) : null

                  return (
                    <div key={key} className={cn(
                      'rounded-xl border p-1 flex flex-col transition-colors',
                      isToday ? 'border-brand-400 bg-brand-50' : inMonth ? 'border-slate-200' : 'border-transparent bg-slate-50/30',
                    )}
                    style={{
                      minHeight: 88,
                      ...(dayPhase && !isToday ? { backgroundColor: `${dayPhase.color}18`, borderColor: `${dayPhase.color}55` } : {}),
                    }}>
                      {/* Date + MD badge */}
                      <div className="flex items-center justify-between mb-0.5 flex-shrink-0">
                        <span className={cn('text-xs font-extrabold leading-none', isToday ? 'text-brand-700' : inMonth ? 'text-slate-700' : 'text-slate-300')}>
                          {day.getDate()}
                        </span>
                        {mdTag && (
                          <span className={cn('text-[9px] font-bold px-1 rounded leading-tight', MD_COLOR[mdTag])}>
                            {MD_LABEL[mdTag]}
                          </span>
                        )}
                      </div>

                      {/* Events & sessions */}
                      <div className="flex-1 space-y-0.5 overflow-hidden">
                        {/* Matches */}
                        {dayMatches.map(ev => (
                          <div key={ev.id} className="text-[9px] font-bold rounded px-1 py-0.5 bg-blue-100 text-blue-700 truncate leading-tight">
                            🏆 {ev.title}
                          </div>
                        ))}

                        {/* Training events with linked sessions below them */}
                        {dayTrainingEvts.map(ev => (
                          <div key={ev.id}>
                            <div className="text-[9px] font-bold rounded px-1 py-0.5 bg-slate-100 text-slate-500 truncate leading-tight">
                              ⚽ {ev.title}
                            </div>
                            {daySessions.map(s => (
                              <button key={s.id}
                                onClick={() => loadSessionDetail(s)}
                                className="w-full text-right text-[9px] font-bold rounded px-1 py-0.5 bg-emerald-100 text-emerald-700 leading-tight flex items-center gap-0.5 mr-1 mt-0.5">
                                <span className="flex-1 truncate">📋 {s.title}</span>
                                {s.block_count === 0 && <span className="flex-shrink-0">⚠️</span>}
                              </button>
                            ))}
                          </div>
                        ))}

                        {/* Standalone sessions (no training event today) */}
                        {!dayTrainingEvts.length && daySessions.map(s => (
                          <button key={s.id}
                            onClick={() => loadSessionDetail(s)}
                            className="w-full text-right text-[9px] font-bold rounded px-1 py-0.5 bg-emerald-100 text-emerald-700 leading-tight block flex items-center gap-0.5">
                            <span className="flex-1 truncate">📋 {s.title}</span>
                            {s.block_count === 0 && <span className="flex-shrink-0">⚠️</span>}
                          </button>
                        ))}
                      </div>

                      {/* Intensity bars */}
                      {inMonth && daySessions.some(s => s.intensity) && (
                        <div className="flex items-end gap-0.5 mt-1 flex-shrink-0" style={{ height: 20 }}>
                          {daySessions.filter(s => s.intensity).map((s, i) => (
                            <div key={i} className="w-1.5 rounded-t-sm flex-shrink-0"
                              style={{
                                height: INTENSITY_BAR_HEIGHT[s.intensity] ?? 8,
                                backgroundColor: INTENSITY_BAR_COLOR[s.intensity] ?? '#94a3b8',
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {canManage && inMonth && (
                        <button className="text-center text-[9px] text-slate-200 hover:text-brand-400 transition-colors mt-0.5 flex-shrink-0 leading-none"
                          onClick={() => { setSessionForm({ ...emptySession, date: key }); setEditingSession(null); setError(''); setShowSession(true) }}>
                          +
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="bg-blue-100 text-blue-700 rounded px-1">🏆</span> مباراة</span>
            <span className="flex items-center gap-1"><span className="bg-slate-100 text-slate-500 rounded px-1">⚽</span> موعد تدريب</span>
            <span className="flex items-center gap-1"><span className="bg-emerald-100 text-emerald-700 rounded px-1">📋</span> وحدة تدريبية مفصّلة</span>
            <span>MD = قرب المباراة (محسوب تلقائياً)</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-end gap-0.5 h-4">
                <span className="w-1.5 rounded-t-sm" style={{ height: 8, backgroundColor: '#22c55e', display: 'inline-block' }}/>
                <span className="w-1.5 rounded-t-sm" style={{ height: 14, backgroundColor: '#f59e0b', display: 'inline-block' }}/>
                <span className="w-1.5 rounded-t-sm" style={{ height: 20, backgroundColor: '#ef4444', display: 'inline-block' }}/>
                <span className="w-1.5 rounded-t-sm" style={{ height: 6, backgroundColor: '#3b82f6', display: 'inline-block' }}/>
              </span>
              شدة التدريب (منخفضة / متوسطة / عالية / استشفاء)
            </span>
          </div>
        </div>
      )}

      {/* ═══ SESSION DETAIL OVERLAY (opens from calendar) ═══════════════ */}
      {selectedSession && (
        <div className="fixed inset-0 bg-white z-40 overflow-y-auto" dir="rtl">
        <div className="max-w-6xl mx-auto px-4 pb-10">
          {/* Top bar */}
          <div className="flex items-center gap-3 py-3 border-b border-slate-100 mb-4 sticky top-0 bg-white z-10">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSession(null)}><X size={15}/> إغلاق</button>
            <span className="font-extrabold text-slate-900 flex-1 truncate">{selectedSession.title}</span>
            {canManage && (
              <div className="flex gap-2 mr-auto flex-shrink-0">
                <button className="btn btn-ghost btn-sm" onClick={printSession}><Printer size={13}/> طباعة PDF</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEditSession(selectedSession)}><Pencil size={13}/> تعديل</button>
                {confirmDeleteSessionId === selectedSession.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600 font-bold">حذف؟</span>
                    <button className="btn btn-ghost btn-sm text-red-600" onClick={() => deleteSession(selectedSession.id)}>نعم</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteSessionId(null)}>لا</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDeleteSessionId(selectedSession.id)}><Trash2 size={13}/></button>
                )}
              </div>
            )}
          </div>

          {/* Session Plan Card */}
          <div className="card overflow-hidden mb-4">
            {/* Header */}
            <div className="bg-slate-800 text-white p-4">
              <div className="text-center font-extrabold text-lg mb-1">بطاقة الوحدة التدريبية الرسمية</div>
              <div className="text-center text-sm text-slate-300">
                {selectedSession.date} {selectedSession.start_time && `· ${selectedSession.start_time.slice(0, 5)}`} · {selectedSession.duration_min} دقيقة
              </div>
            </div>

            {/* Goals row */}
            <div className="grid md:grid-cols-3 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
              <div className="p-3">
                <div className="text-[11px] font-bold text-blue-600 mb-1">⚽ الهدف التكتيكي (HC)</div>
                <p className="text-sm text-slate-700">{selectedSession.tactical_goal || '—'}</p>
              </div>
              <div className="p-3">
                <div className="text-[11px] font-bold text-orange-600 mb-1">💪 الهدف البدني (FC)</div>
                <p className="text-sm text-slate-700">{selectedSession.physical_goal || '—'}</p>
              </div>
              <div className="p-3">
                <div className="text-[11px] font-bold text-green-600 mb-1">🧤 الهدف الفني — الحراس (GKT)</div>
                <p className="text-sm text-slate-700">{selectedSession.gk_goal || '—'}</p>
              </div>
            </div>

            {/* Intensity + MD */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
              <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', INTENSITY_COLOR[selectedSession.intensity])}>
                الشدة: {INTENSITY_LABEL[selectedSession.intensity]}
              </span>
              {selectedSession.md_tag && (
                <span className={cn('px-2 py-0.5 rounded-lg text-[11px] font-bold', MD_COLOR[selectedSession.md_tag])}>
                  {MD_LABEL[selectedSession.md_tag]}
                </span>
              )}
              {selectedSession.phase && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedSession.phase.color }}/>
                  {selectedSession.phase.name}
                </span>
              )}
            </div>

            {/* Role selector strip */}
            {canManage && (
              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-indigo-600 flex-shrink-0">دوري في هذه الوحدة:</span>
                {(['hc', 'fc', 'gkt', 'assistant'] as const).map(r => (
                  <button key={r} onClick={() => setMyTrainingRole(r)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-bold transition-colors',
                      myTrainingRole === r ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-500 border border-indigo-200 hover:bg-indigo-50')}>
                    {r === 'hc' ? '⚽ مدرب رئيسي' : r === 'fc' ? '💪 لياقة' : r === 'gkt' ? '🧤 حراس' : '🔧 مساعد'}
                  </button>
                ))}
                {myTrainingRole === 'hc' && (
                  <label className="flex items-center gap-1.5 mr-2 text-xs text-indigo-500 cursor-pointer">
                    <input type="checkbox" checked={assistantFullAccess} onChange={e => setAssistantFullAccess(e.target.checked)} className="rounded"/>
                    السماح للمساعد بالكتابة في كل الأقسام
                  </label>
                )}
              </div>
            )}

            {/* Blocks table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 640 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-3 text-right w-28 text-slate-500 text-xs font-bold">الوقت / القسم</th>
                    <th className="p-3 text-right text-orange-700 text-xs font-bold">💪 FC — مدرب اللياقة</th>
                    <th className="p-3 text-right text-blue-700 text-xs font-bold">⚽ HC — المدرب الرئيسي</th>
                    <th className="p-3 text-right text-green-700 text-xs font-bold">🧤 GKT — مدرب الحراس</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sessionBlocks.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">لا توجد أقسام — أضف قسماً أدناه</td></tr>
                  )}
                  {sessionBlocks.map((block: any) => {
                    const blockExs = sessionBlockExercises.filter((be: any) => be.block_id === block.id)
                    const indivAssignments = sessionIndividuals[block.id] || []
                    return (
                      <tr key={block.id} className={cn('align-top border-r-4', block.block_type === 'warmup' ? 'border-r-orange-300' : block.block_type === 'cooldown' ? 'border-r-teal-300' : block.block_type === 'individual' ? 'border-r-purple-300' : 'border-r-blue-300')}>
                        <td className="p-3">
                          <div className="font-bold text-slate-700 text-xs">{block.start_offset_min ? `${String(Math.floor(block.start_offset_min / 60)).padStart(2, '0')}:${String(block.start_offset_min % 60).padStart(2, '0')}` : '—'}</div>
                          <div className="text-[11px] text-slate-400">{block.duration_min} دق</div>
                          <div className="mt-1 text-[11px] font-bold" style={{ color: block.block_type === 'warmup' ? '#ea580c' : block.block_type === 'cooldown' ? '#0d9488' : block.block_type === 'individual' ? '#9333ea' : '#2563eb' }}>
                            {BLOCK_TYPE_LABEL[block.block_type]}
                          </div>
                          {block.title && <div className="text-[10px] text-slate-400 mt-0.5">{block.title}</div>}
                        </td>
                        {block.block_type === 'individual' ? (
                          <td colSpan={3} className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-bold text-purple-600">تدريب فردي</span>
                              {canManage && (
                                <div className="flex items-center gap-1">
                                  {confirmDeleteBlockId === block.id ? (
                                    <>
                                      <button className="btn btn-ghost btn-sm text-[10px] text-red-600" onClick={() => deleteBlock(block.id)}>حذف القسم</button>
                                      <button className="btn btn-ghost btn-sm text-[10px]" onClick={() => setConfirmDeleteBlockId(null)}>إلغاء</button>
                                    </>
                                  ) : (
                                    <button className="btn btn-ghost btn-sm p-1 text-red-400" title="حذف هذا التدريب الفردي" onClick={() => setConfirmDeleteBlockId(block.id)}><Trash2 size={11}/></button>
                                  )}
                                </div>
                              )}
                            </div>
                            {indivAssignments.map((a: any) => (
                              <div key={a.id} className="flex items-start gap-2 mb-2 rounded-xl bg-purple-50 p-2">
                                <Avatar name={a.player?.full_name || '?'} size="sm"/>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-slate-800">{a.player?.full_name}</div>
                                  <div className="text-[11px] text-purple-600">{ASSIGNMENT_REASON_LABEL[a.reason]}</div>
                                  {a.supervisor?.full_name && <div className="text-[11px] text-slate-500">👤 المشرف: {a.supervisor.full_name}</div>}
                                  {a.program_content && <p className="text-[11px] text-slate-600 mt-0.5">{a.program_content}</p>}
                                </div>
                                {canManage && <button className="text-red-400 hover:text-red-600" onClick={() => removeIndividual(a.id, block.id)}><X size={12}/></button>}
                              </div>
                            ))}
                            {canManage && (
                              <button className="btn btn-ghost btn-sm text-xs text-purple-600 mt-1"
                                onClick={() => { setIndividualBlockId(block.id); setIndividualForm({ player_ids: [], reason: 'other', program_content: '', notes: '', supervisor_id: '' }); setShowIndividual(true) }}>
                                <Plus size={11}/> إضافة لاعبين
                              </button>
                            )}
                          </td>
                        ) : (
                          (() => {
                            const canWriteHC = canManage && (myTrainingRole === 'hc' || (myTrainingRole === 'assistant' && assistantFullAccess))
                            const canWriteFC = canManage && (myTrainingRole === 'fc' || myTrainingRole === 'hc' || (myTrainingRole === 'assistant' && assistantFullAccess))
                            const canWriteGKT = canManage && (myTrainingRole === 'gkt' || myTrainingRole === 'hc' || (myTrainingRole === 'assistant' && assistantFullAccess))
                            const mkCell = (col: 'hc' | 'fc' | 'gkt', canWrite: boolean, content: string, author: any, exFilter: string[]) => (
                              <td className="p-3 align-top border-r border-slate-50 last:border-r-0">
                                {/* Inline edit or display */}
                                {inlineEdit?.blockId === block.id && inlineEdit.col === col ? (
                                  <div className="space-y-1">
                                    <textarea className="form-input text-xs w-full" rows={4}
                                      value={inlineEdit.value}
                                      onChange={e => setInlineEdit(p => p ? { ...p, value: e.target.value } : p)}
                                      onKeyDown={e => { if (e.key === 'Escape') setInlineEdit(null) }}
                                      autoFocus/>
                                    <div className="flex gap-1 justify-end">
                                      <button className="btn btn-ghost btn-sm text-xs px-2" onClick={() => setInlineEdit(null)}>إلغاء</button>
                                      <button className="btn btn-primary btn-sm text-xs px-2" onClick={saveInlineBlockContent}>حفظ</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className={cn('text-xs text-slate-600 whitespace-pre-wrap min-h-[36px] rounded p-1 transition-colors',
                                      canWrite ? 'cursor-text hover:bg-slate-50 hover:ring-1 hover:ring-slate-200' : '')}
                                    onClick={() => canWrite && setInlineEdit({ blockId: block.id, col, value: content || '' })}>
                                    {content || (canWrite
                                      ? <span className="text-slate-300 italic text-[11px]">انقر للكتابة...</span>
                                      : <span className="text-slate-300">—</span>)}
                                  </div>
                                )}
                                {/* Attribution */}
                                {author?.full_name && (
                                  <div className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-1">
                                    <span>✏️</span><span>{author.full_name}</span>
                                  </div>
                                )}
                                {/* Exercises for this column */}
                                {blockExs.filter((be: any) => exFilter.includes(be.assigned_to)).map((be: any) => (
                                  <ExerciseChip key={be.id} be={be} canManage={canWrite} onRemove={() => removeExerciseFromBlock(be.id)} onView={() => be.exercise && loadExerciseDetail(be.exercise)} teamId={teamId} onExerciseSaved={() => load()}/>
                                ))}
                                {canWrite && (
                                  <button className="text-[10px] text-brand-500 hover:text-brand-700 flex items-center gap-0.5 mt-1.5"
                                    onClick={() => { setAddExAssignedTo(col); setShowAddExToBlock(block.id) }}>
                                    <Plus size={10}/> تمرين
                                  </button>
                                )}
                              </td>
                            )
                            return (
                              <>
                                {mkCell('fc', canWriteFC, block.content_fc, block.author_fc, ['fc', 'all'])}
                                {mkCell('hc', canWriteHC, block.content_hc, block.author_hc, ['hc', 'all'])}
                                {mkCell('gkt', canWriteGKT, block.content_gkt, block.author_gkt, ['gkt', 'all'])}
                              </>
                            )
                          })()
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Add block buttons — only individual is manual */}
            {canManage && (
              <div className="p-3 border-t border-slate-100 flex items-center gap-3">
                <span className="text-[11px] text-slate-400">الأحماء والأساسي والتهدئة تُضاف تلقائياً</span>
                <button className="btn btn-ghost btn-sm text-purple-600 text-xs" onClick={() => openAddBlock('individual')}>
                  <Plus size={12}/> إضافة تدريب فردي
                </button>
              </div>
            )}
          </div>

          {/* Session Notes */}
          {selectedSession.notes && (
            <div className="card p-4 mb-4">
              <div className="text-xs font-bold text-slate-500 mb-1">ملاحظات الوحدة</div>
              <p className="text-sm text-slate-700">{selectedSession.notes}</p>
            </div>
          )}

          {/* Staff Comments */}
          <div className="card p-4">
            <div className="font-extrabold text-slate-800 mb-3">📋 تقارير وملاحظات الطاقم الفني</div>
            <div className="space-y-3 mb-4">
              {sessionComments.length === 0 && (
                <p className="text-xs text-center text-slate-400 py-3">لا توجد تقارير بعد — كن أول من يكتب</p>
              )}
              {sessionComments.map((c: any) => (
                <div key={c.id} className={cn('rounded-xl border p-3', AUTHOR_ROLE_COLOR[c.author_role])}>
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={c.author?.full_name || '?'} size="sm"/>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{c.author?.full_name}</div>
                      <div className="text-[11px] text-slate-500">{AUTHOR_ROLE_LABEL[c.author_role]} · {new Date(c.created_at).toLocaleString('ar-SA')}</div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.comment}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <select className="form-input" value={sessionCommentRole} onChange={e => setSessionCommentRole(e.target.value)}>
                {Object.entries(AUTHOR_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <textarea className="form-input" rows={3} placeholder="اكتب تقريرك أو ملاحظتك..." value={sessionCommentText} onChange={e => setSessionCommentText(e.target.value)}/>
              <div className="flex justify-end">
                <button className="btn btn-primary btn-sm" onClick={addSessionCommentHandler} disabled={savingSessionComment || !sessionCommentText.trim()}>
                  {savingSessionComment ? <Spinner size="sm"/> : <><Save size={13}/> حفظ التقرير</>}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ═══ TAB: LIBRARY ═══════════════════════════════════════════════ */}
      {tab === 'library' && !selectedExercise && (
        <div>
          <div className="card p-3 mb-4">
            <div className="grid md:grid-cols-4 gap-2">
              <input className="form-input md:col-span-2" value={exerciseFilter.q} onChange={e => setExerciseFilter(p => ({ ...p, q: e.target.value }))} placeholder="بحث باسم التمرين..."/>
              <select className="form-input" value={exerciseFilter.section} onChange={e => setExerciseFilter(p => ({ ...p, section: e.target.value }))}>
                <option value="">كل الأقسام</option>
                {Object.entries(SECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="form-input" value={exerciseFilter.category} onChange={e => setExerciseFilter(p => ({ ...p, category: e.target.value }))}>
                <option value="">كل الفئات</option>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {filteredExercises.length === 0 ? (
            <EmptyState icon={<Dumbbell size={28}/>} title="لا توجد تمارين في المكتبة" description="أضف تمريناً جديداً لبدء بناء المكتبة"/>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredExercises.map(ex => (
                <div key={ex.id} className="card p-0 overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadExerciseDetail(ex)}>
                  {ex.image_url ? (
                    <img src={ex.image_url} alt={ex.name} className="w-full h-32 object-cover"/>
                  ) : (
                    <div className="w-full h-32 bg-slate-100 flex items-center justify-center text-slate-300"><Dumbbell size={32}/></div>
                  )}
                  <div className="p-3">
                    <div className="font-extrabold text-slate-900">{ex.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                      <span>{SECTION_LABEL[ex.section]}</span>
                      <span>·</span>
                      <span>{CATEGORY_LABEL[ex.category]}</span>
                      <span>·</span>
                      <span>{LOCATION_LABEL[ex.location]}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex gap-3">
                      <span>⏱️ {ex.duration_min} دق</span>
                      <span>👥 {ex.player_count_min}+ لاعب</span>
                    </div>
                    {(ex.equipment || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(ex.equipment || []).slice(0, 3).map((e: string) => (
                          <span key={e} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-600">{e}</span>
                        ))}
                        {(ex.equipment || []).length > 3 && <span className="text-[10px] text-slate-400">+{(ex.equipment || []).length - 3}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exercise Detail */}
      {tab === 'library' && selectedExercise && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedExercise(null)}>← العودة للمكتبة</button>
            {canManage && (
              <div className="flex gap-2 mr-auto">
                <button className="btn btn-ghost btn-sm" onClick={() => openEditExercise(selectedExercise)}><Pencil size={13}/> تعديل</button>
                {confirmDeleteExId === selectedExercise.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600 font-bold">حذف؟</span>
                    <button className="btn btn-ghost btn-sm text-red-600" onClick={async () => { await trainingService.deleteExercise(selectedExercise.id); await load(); setSelectedExercise(null); setConfirmDeleteExId(null) }}>نعم</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteExId(null)}>لا</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm text-red-500" onClick={() => setConfirmDeleteExId(selectedExercise.id)}><Trash2 size={13}/></button>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-4">
              {/* Exercise info */}
              <div className="card p-4">
                {selectedExercise.image_url && (
                  <img src={selectedExercise.image_url} alt={selectedExercise.name} className="w-full h-48 object-cover rounded-xl mb-4"/>
                )}
                <h2 className="font-extrabold text-xl text-slate-900">{selectedExercise.name}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="badge bg-blue-50 text-blue-700">{SECTION_LABEL[selectedExercise.section]}</span>
                  <span className="badge bg-purple-50 text-purple-700">{CATEGORY_LABEL[selectedExercise.category]}</span>
                  <span className="badge bg-slate-100 text-slate-600">{LOCATION_LABEL[selectedExercise.location]}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="font-extrabold text-slate-800">{selectedExercise.duration_min} دق</div><div className="text-[11px] text-slate-400">مدة التمرين</div></div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="font-extrabold text-slate-800">{selectedExercise.player_count_min}+</div><div className="text-[11px] text-slate-400">حد أدنى للاعبين</div></div>
                </div>
                {(selectedExercise.equipment || []).length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-slate-500 mb-1">🛠️ الأدوات المستخدمة</div>
                    <div className="flex flex-wrap gap-1">{(selectedExercise.equipment || []).map((e: string) => <span key={e} className="px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-700">{e}</span>)}</div>
                  </div>
                )}
                {selectedExercise.description && (
                  <div className="mt-3"><div className="text-xs font-bold text-slate-500 mb-1">📝 شرح التمرين</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedExercise.description}</p></div>
                )}
                {selectedExercise.technical_points && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-slate-500 mb-1">⭐ النقاط الفنية</div>
                    <BulletList text={selectedExercise.technical_points}/>
                  </div>
                )}
                {selectedExercise.variables && (
                  <div className="mt-3">
                    <div className="text-xs font-bold text-slate-500 mb-1">⚙️ المتغيرات</div>
                    <BulletList text={selectedExercise.variables}/>
                  </div>
                )}
              </div>
            </div>

            {/* Comments */}
            <div className="card p-4">
              <div className="font-extrabold text-slate-800 mb-3">تقارير وملاحظات الطاقم الفني</div>
              <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
                {exerciseComments.length === 0 && <p className="text-xs text-center text-slate-400 py-3">لا توجد تقارير بعد</p>}
                {exerciseComments.map((c: any) => (
                  <div key={c.id} className={cn('rounded-xl border p-3', AUTHOR_ROLE_COLOR[c.author_role])}>
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar name={c.author?.full_name || '?'} size="sm"/>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{c.author?.full_name}</div>
                        <div className="text-[11px] text-slate-500">{AUTHOR_ROLE_LABEL[c.author_role]}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.comment}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <select className="form-input" value={exCommentRole} onChange={e => setExCommentRole(e.target.value)}>
                  {Object.entries(AUTHOR_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <textarea className="form-input" rows={3} placeholder="اكتب ملاحظتك على هذا التمرين..." value={exCommentText} onChange={e => setExCommentText(e.target.value)}/>
                <button className="btn btn-primary btn-sm w-full" onClick={addExerciseComment} disabled={savingExComment || !exCommentText.trim()}>
                  {savingExComment ? <Spinner size="sm"/> : 'حفظ الملاحظة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODALS ══════════════════════════════════════════════════════ */}
      {renderPhaseModal()}
      {renderGoalModal()}
      {renderSessionModal()}
      {renderBlockModal()}
      {renderExerciseModal()}
      {renderIndividualModal()}
      {renderAddExToBlockModal()}
    </div>
  )

  // ─ Phase Modal ─
  function renderPhaseModal() {
    return (
      <Modal open={showPhase} onClose={() => !savingPhase && setShowPhase(false)} title={editingPhase ? 'تعديل المرحلة' : 'إضافة مرحلة جديدة'}>
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="اسم المرحلة" required>
              <input className="form-input" value={phaseForm.name} onChange={e => setPhaseForm((p: any) => ({ ...p, name: e.target.value }))}/>
            </FormField>
            <FormField label="نوع المرحلة">
              <select className="form-input" value={phaseForm.phase_type} onChange={e => setPhaseForm((p: any) => ({ ...p, phase_type: e.target.value }))}>
                {Object.entries(PHASE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="تاريخ البداية">
              <input className="form-input" type="date" value={phaseForm.start_date || ''} onChange={e => setPhaseForm((p: any) => ({ ...p, start_date: e.target.value }))}/>
            </FormField>
            <FormField label="تاريخ النهاية">
              <input className="form-input" type="date" value={phaseForm.end_date || ''} onChange={e => setPhaseForm((p: any) => ({ ...p, end_date: e.target.value }))}/>
            </FormField>
            <FormField label="لون المرحلة">
              <div className="flex items-center gap-2">
                <input type="color" value={phaseForm.color} onChange={e => setPhaseForm((p: any) => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"/>
                <span className="text-sm text-slate-500">{phaseForm.color}</span>
              </div>
            </FormField>
            <FormField label="الترتيب">
              <input className="form-input" type="number" min={0} value={phaseForm.sort_order} onChange={e => setPhaseForm((p: any) => ({ ...p, sort_order: Number(e.target.value) }))}/>
            </FormField>
          </div>
          <FormField label="وصف / ملاحظات">
            <textarea className="form-input" rows={2} value={phaseForm.description || ''} onChange={e => setPhaseForm((p: any) => ({ ...p, description: e.target.value }))}/>
          </FormField>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowPhase(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitPhase} disabled={savingPhase}>{savingPhase ? <Spinner size="sm"/> : 'حفظ'}</button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Goal Modal ─
  function renderGoalModal() {
    return (
      <Modal open={showGoal} onClose={() => !savingGoal && setShowGoal(false)} title={editingGoal ? 'تعديل الهدف' : 'إضافة أهداف'}>
        <div className="space-y-3">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <div className="space-y-2">
            {goalTexts.map((txt, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-slate-400 mt-3 text-xs flex-shrink-0">•</span>
                <textarea
                  className="form-input flex-1 text-sm"
                  rows={2}
                  value={txt}
                  onChange={e => setGoalTexts(prev => prev.map((t, j) => j === i ? e.target.value : t))}
                  placeholder={`هدف ${i + 1}...`}
                  autoFocus={i === 0 && !editingGoal}
                />
                {goalTexts.length > 1 && (
                  <button className="btn btn-ghost btn-sm text-red-400 mt-2 flex-shrink-0" onClick={() => setGoalTexts(prev => prev.filter((_, j) => j !== i))}>
                    <X size={14}/>
                  </button>
                )}
              </div>
            ))}
          </div>
          {!editingGoal && (
            <button className="btn btn-ghost btn-sm text-xs text-brand-600" onClick={() => setGoalTexts(prev => [...prev, ''])}>
              <Plus size={12}/> إضافة هدف آخر
            </button>
          )}
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <button className="btn btn-ghost" onClick={() => setShowGoal(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitGoal} disabled={savingGoal || !goalTexts.some(t => t.trim())}>
              {savingGoal ? <Spinner size="sm"/> : editingGoal ? 'تحديث' : `حفظ (${goalTexts.filter(t => t.trim()).length})`}
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Session Modal ─
  function renderSessionModal() {
    return (
      <Modal open={showSession} onClose={() => !savingSession && setShowSession(false)} title={editingSession ? 'تعديل الوحدة التدريبية' : 'وحدة تدريبية جديدة'} width="max-w-2xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="عنوان الوحدة" required>
              <input className="form-input" value={sessionForm.title} onChange={e => setSessionForm((p: any) => ({ ...p, title: e.target.value }))}/>
            </FormField>
            <FormField label="التاريخ" required>
              <input className="form-input" type="date" value={sessionForm.date} onChange={e => setSessionForm((p: any) => ({ ...p, date: e.target.value }))}/>
            </FormField>
            <FormField label="وقت البداية">
              <input className="form-input" type="time" value={sessionForm.start_time} onChange={e => setSessionForm((p: any) => ({ ...p, start_time: e.target.value }))}/>
            </FormField>
            <FormField label="المدة (دقائق)">
              <input className="form-input" type="number" min={10} value={sessionForm.duration_min} onChange={e => setSessionForm((p: any) => ({ ...p, duration_min: Number(e.target.value) }))}/>
            </FormField>
            <FormField label="الشدة">
              <select className="form-input" value={sessionForm.intensity} onChange={e => setSessionForm((p: any) => ({ ...p, intensity: e.target.value }))}>
                {Object.entries(INTENSITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="MD Tag">
              <select className="form-input" value={sessionForm.md_tag} onChange={e => setSessionForm((p: any) => ({ ...p, md_tag: e.target.value }))}>
                {Object.entries(MD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="المرحلة">
              <select className="form-input" value={sessionForm.phase_id} onChange={e => setSessionForm((p: any) => ({ ...p, phase_id: e.target.value }))}>
                <option value="">بدون مرحلة</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="الهدف التكتيكي (HC)">
            <input className="form-input" value={sessionForm.tactical_goal} onChange={e => setSessionForm((p: any) => ({ ...p, tactical_goal: e.target.value }))} placeholder="ماذا يريد المدرب تطوير اليوم؟"/>
          </FormField>
          <FormField label="الهدف البدني (FC)">
            <input className="form-input" value={sessionForm.physical_goal} onChange={e => setSessionForm((p: any) => ({ ...p, physical_goal: e.target.value }))} placeholder="الهدف البدني لمدرب اللياقة"/>
          </FormField>
          <FormField label="الهدف الفني — الحراس (GKT)">
            <input className="form-input" value={sessionForm.gk_goal} onChange={e => setSessionForm((p: any) => ({ ...p, gk_goal: e.target.value }))} placeholder="هدف مدرب حراس المرمى"/>
          </FormField>
          <FormField label="ملاحظات">
            <textarea className="form-input" rows={2} value={sessionForm.notes || ''} onChange={e => setSessionForm((p: any) => ({ ...p, notes: e.target.value }))}/>
          </FormField>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowSession(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitSession} disabled={savingSession}>{savingSession ? <Spinner size="sm"/> : 'حفظ الوحدة'}</button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Block Modal ─
  function renderBlockModal() {
    return (
      <Modal open={showBlock} onClose={() => !savingBlock && setShowBlock(false)} title={editingBlock ? 'تعديل القسم' : 'إضافة قسم'}>
        <div className="space-y-3">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="نوع القسم">
              <select className="form-input" value={blockForm.block_type} onChange={e => setBlockForm((p: any) => ({ ...p, block_type: e.target.value }))}>
                {Object.entries(BLOCK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="عنوان القسم">
              <input className="form-input" value={blockForm.title || ''} onChange={e => setBlockForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="مثال: الجزء الرئيسي الأول — التدريب المنفصل"/>
            </FormField>
            <FormField label="بداية القسم (دقيقة من بداية الوحدة)">
              <input className="form-input" type="number" min={0} value={blockForm.start_offset_min} onChange={e => setBlockForm((p: any) => ({ ...p, start_offset_min: Number(e.target.value) }))}/>
            </FormField>
            <FormField label="مدة القسم (دقائق)">
              <input className="form-input" type="number" min={1} value={blockForm.duration_min} onChange={e => setBlockForm((p: any) => ({ ...p, duration_min: Number(e.target.value) }))}/>
            </FormField>
          </div>
          {blockForm.block_type !== 'individual' && (
            <>
              <FormField label="💪 محتوى مدرب اللياقة (FC)">
                <textarea className="form-input" rows={3} value={blockForm.content_fc || ''} onChange={e => setBlockForm((p: any) => ({ ...p, content_fc: e.target.value }))} placeholder="ما يقوم به مدرب اللياقة في هذا القسم..."/>
              </FormField>
              <FormField label="⚽ محتوى المدرب الرئيسي (HC)">
                <textarea className="form-input" rows={3} value={blockForm.content_hc || ''} onChange={e => setBlockForm((p: any) => ({ ...p, content_hc: e.target.value }))} placeholder="ما يقوم به المدرب الرئيسي في هذا القسم..."/>
              </FormField>
              <FormField label="🧤 محتوى مدرب الحراس (GKT)">
                <textarea className="form-input" rows={3} value={blockForm.content_gkt || ''} onChange={e => setBlockForm((p: any) => ({ ...p, content_gkt: e.target.value }))} placeholder="ما يقوم به مدرب الحراس في هذا القسم..."/>
              </FormField>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowBlock(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitBlock} disabled={savingBlock}>{savingBlock ? <Spinner size="sm"/> : 'حفظ'}</button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Exercise Modal ─
  function renderExerciseModal() {
    return (
      <Modal open={showExercise} onClose={() => !savingExercise && setShowExercise(false)} title={editingExercise ? 'تعديل التمرين' : 'تمرين جديد'} width="max-w-2xl">
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{error}</div>}
          {/* Image upload */}
          <div className="flex items-center gap-4">
            {exerciseForm.image_url ? (
              <img src={exerciseForm.image_url} alt="preview" className="w-24 h-24 object-cover rounded-xl border border-slate-200"/>
            ) : (
              <div className="w-24 h-24 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200"><Dumbbell size={28}/></div>
            )}
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
                {uploadingImage ? <Spinner size="sm"/> : <><Upload size={13}/> رفع صورة التمرين</>}
              </button>
              <p className="text-[11px] text-slate-400 mt-1">PNG، JPG — مرفق إلزامي</p>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleExerciseImageUpload(f) }}/>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <FormField label="اسم التمرين" required>
              <input className="form-input" value={exerciseForm.name} onChange={e => setExerciseForm((p: any) => ({ ...p, name: e.target.value }))}/>
            </FormField>
            <FormField label="القسم">
              <select className="form-input" value={exerciseForm.section} onChange={e => setExerciseForm((p: any) => ({ ...p, section: e.target.value }))}>
                {Object.entries(SECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="الفئة">
              <select className="form-input" value={exerciseForm.category} onChange={e => setExerciseForm((p: any) => ({ ...p, category: e.target.value }))}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="المكان">
              <select className="form-input" value={exerciseForm.location} onChange={e => setExerciseForm((p: any) => ({ ...p, location: e.target.value }))}>
                {Object.entries(LOCATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="الحد الأدنى للاعبين">
              <input className="form-input" type="number" min={1} value={exerciseForm.player_count_min} onChange={e => setExerciseForm((p: any) => ({ ...p, player_count_min: Number(e.target.value) }))}/>
            </FormField>
            <FormField label="مدة التمرين (دقائق)">
              <input className="form-input" type="number" min={1} value={exerciseForm.duration_min} onChange={e => setExerciseForm((p: any) => ({ ...p, duration_min: Number(e.target.value) }))}/>
            </FormField>
          </div>
          <FormField label="الأدوات المستخدمة">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {allEquipment.map(item => (
                <button key={item} type="button" onClick={() => toggleEquipment(item)}
                  className={cn('px-2 py-1 rounded-lg text-xs font-bold border transition-colors',
                    (exerciseForm.equipment || []).includes(item) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300')}>
                  {item}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input className="form-input flex-1 text-xs" value={customEquipInput}
                onChange={e => setCustomEquipInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomEquipment() } }}
                placeholder="أداة جديدة... ثم اضغط Enter لإضافتها للمكتبة"/>
              <button type="button" className="btn btn-ghost btn-sm text-xs" onClick={addCustomEquipment}>+ إضافة</button>
            </div>
          </FormField>
          <FormField label="شرح التمرين">
            <textarea className="form-input" rows={3} value={exerciseForm.description || ''} onChange={e => setExerciseForm((p: any) => ({ ...p, description: e.target.value }))} placeholder="كيف يُنفَّذ التمرين خطوة بخطوة..."/>
          </FormField>
          <FormField label="النقاط الفنية المهمة — كل نقطة في سطر (Enter للسطر التالي)">
            <BulletListInput
              value={exerciseForm.technical_points || ''}
              onChange={v => setExerciseForm((p: any) => ({ ...p, technical_points: v }))}
              placeholder="• التركيز على...&#10;اضغط Enter للنقطة التالية"
              rows={4}
            />
          </FormField>
          <FormField label="المتغيرات — صعّب / سهّل (كل متغير في سطر)">
            <BulletListInput
              value={exerciseForm.variables || ''}
              onChange={v => setExerciseForm((p: any) => ({ ...p, variables: v }))}
              placeholder="• صعّب: أضف قيد...&#10;• سهّل: قلل...&#10;اضغط Enter للنقطة التالية"
              rows={4}
            />
          </FormField>
          <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
            <button className="btn btn-ghost" onClick={() => setShowExercise(false)}>إلغاء</button>
            {editingExercise && (
              <button className="btn btn-ghost btn-sm text-blue-600" onClick={saveExerciseCopy} disabled={savingExercise}><Save size={13}/> حفظ كتمرين جديد</button>
            )}
            <button className="btn btn-primary" onClick={submitExercise} disabled={savingExercise}>{savingExercise ? <Spinner size="sm"/> : editingExercise ? 'تحديث التمرين' : 'حفظ في المكتبة'}</button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Individual Program Modal ─
  function renderIndividualModal() {
    const staffMembers = members.filter((m: any) => m.role !== 'player')
    const togglePlayer = (uid: string) => setIndividualForm(p => ({
      ...p,
      player_ids: p.player_ids.includes(uid) ? p.player_ids.filter(id => id !== uid) : [...p.player_ids, uid],
    }))
    return (
      <Modal open={showIndividual} onClose={() => !savingIndividual && setShowIndividual(false)} title="إضافة تدريب فردي" width="max-w-lg">
        <div className="space-y-4">
          {/* Player multi-select */}
          <FormField label="اللاعبون المشاركون" required>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {players.length === 0 ? (
                <p className="p-3 text-sm text-slate-400 text-center">لا توجد لاعبون في الفريق</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {players.map((m: any) => {
                    const checked = individualForm.player_ids.includes(m.user_id)
                    return (
                      <label key={m.user_id}
                        className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors', checked ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                        <input type="checkbox" checked={checked} onChange={() => togglePlayer(m.user_id)} className="rounded accent-brand-500"/>
                        <Avatar name={m.profile?.full_name || '?'} size="sm"/>
                        <span className="text-sm text-slate-800">{m.profile?.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            {individualForm.player_ids.length > 0 && (
              <p className="text-[11px] text-brand-600 mt-1">✓ {individualForm.player_ids.length} لاعب محدد</p>
            )}
          </FormField>

          {/* Coach supervisor */}
          <FormField label="المدرب المشرف">
            <div className="grid grid-cols-3 gap-2">
              {staffMembers.map((m: any) => {
                const roleLabel = SYSTEM_ROLE_LABEL[m.role] || m.role
                const selected = individualForm.supervisor_id === m.user_id
                return (
                  <button key={m.user_id} type="button"
                    onClick={() => setIndividualForm(p => ({ ...p, supervisor_id: selected ? '' : m.user_id }))}
                    className={cn('rounded-xl border p-2 text-center text-xs font-bold transition-colors',
                      selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300')}>
                    <div className="text-[10px] text-slate-400 font-normal mb-0.5">{roleLabel}</div>
                    <div className="truncate">{m.profile?.full_name || '—'}</div>
                  </button>
                )
              })}
              {staffMembers.length === 0 && (
                <span className="col-span-3 text-xs text-slate-400">لا يوجد طاقم فني مسجل</span>
              )}
            </div>
          </FormField>

          <FormField label="سبب التدريب الفردي">
            <select className="form-input" value={individualForm.reason} onChange={e => setIndividualForm(p => ({ ...p, reason: e.target.value }))}>
              {Object.entries(ASSIGNMENT_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="محتوى البرنامج">
            <textarea className="form-input" rows={3} value={individualForm.program_content}
              onChange={e => setIndividualForm(p => ({ ...p, program_content: e.target.value }))}
              placeholder="ما الذي سيؤديه اللاعب في هذا التدريب..."/>
          </FormField>
          <FormField label="ملاحظات">
            <textarea className="form-input" rows={2} value={individualForm.notes} onChange={e => setIndividualForm(p => ({ ...p, notes: e.target.value }))}/>
          </FormField>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setShowIndividual(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={submitIndividual} disabled={savingIndividual || !individualForm.player_ids.length}>
              {savingIndividual ? <Spinner size="sm"/> : `إضافة (${individualForm.player_ids.length || 0} لاعب)`}
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  // ─ Add Exercise to Block Modal ─
  function renderAddExToBlockModal() {
    const bulletLines = (text: string) =>
      text ? text.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean) : []

    const filtered = exercises.filter(ex => {
      if (addExFilterSection && ex.section !== addExFilterSection) return false
      if (addExFilterCategory && ex.category !== addExFilterCategory) return false
      if (addExFilterQ && !ex.name.toLowerCase().includes(addExFilterQ.toLowerCase())) return false
      return true
    })

    return (
      <Modal open={!!showAddExToBlock} onClose={() => { setShowAddExToBlock(null); setAddExFilterQ(''); setAddExFilterSection(''); setAddExFilterCategory('') }} title="إضافة تمرين من المكتبة" width="max-w-2xl">
        <div className="space-y-3">
          {/* Assign + duration */}
          <div className="grid grid-cols-2 gap-2">
            <FormField label="يُسند إلى">
              <select className="form-input" value={addExAssignedTo} onChange={e => setAddExAssignedTo(e.target.value)}>
                <option value="all">الجميع</option>
                <option value="hc">⚽ HC</option>
                <option value="fc">💪 FC</option>
                <option value="gkt">🧤 GKT</option>
              </select>
            </FormField>
            <FormField label="المدة (دق) — اختياري">
              <input className="form-input" type="number" min={1} value={addExDuration} onChange={e => setAddExDuration(e.target.value)} placeholder="من التمرين"/>
            </FormField>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-3 gap-2">
            <input className="form-input text-sm" value={addExFilterQ} onChange={e => setAddExFilterQ(e.target.value)} placeholder="بحث باسم التمرين..."/>
            <select className="form-input text-sm" value={addExFilterSection} onChange={e => setAddExFilterSection(e.target.value)}>
              <option value="">كل الأقسام</option>
              {Object.entries(SECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="form-input text-sm" value={addExFilterCategory} onChange={e => setAddExFilterCategory(e.target.value)}>
              <option value="">كل الفئات</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {/* Exercise list */}
          <div className="max-h-[420px] overflow-y-auto space-y-2 -mx-1 px-1">
            {filtered.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-6">لا توجد تمارين بهذه الفلاتر</p>
            )}
            {filtered.map(ex => {
              const techLines = bulletLines(ex.technical_points)
              const varLines = bulletLines(ex.variables)
              return (
                <div key={ex.id} className="rounded-xl border border-slate-100 bg-white overflow-hidden hover:border-brand-200 transition-colors">
                  {/* Header row — clickable to add */}
                  <button className="w-full text-right p-3 hover:bg-brand-50 transition-colors"
                    onClick={() => showAddExToBlock && addExerciseToBlock(showAddExToBlock, ex.id)}>
                    <div className="flex items-center gap-3">
                      {ex.image_url
                        ? <img src={ex.image_url} alt={ex.name} className="w-12 h-12 object-cover rounded-lg flex-shrink-0"/>
                        : <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 flex-shrink-0"><Dumbbell size={18}/></div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-800">{ex.name}</div>
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                          {ex.section && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{SECTION_LABEL[ex.section]}</span>}
                          {ex.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{CATEGORY_LABEL[ex.category]}</span>}
                          {ex.location && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{LOCATION_LABEL[ex.location]}</span>}
                          <span className="text-[10px] text-slate-400">⏱️ {ex.duration_min}دق</span>
                          <span className="text-[10px] text-slate-400">👥 {ex.player_count_min}+</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 bg-brand-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                        <Plus size={13}/>
                      </div>
                    </div>
                  </button>
                  {/* Full details below */}
                  {(ex.description || techLines.length > 0 || varLines.length > 0 || (ex.equipment||[]).length > 0) && (
                    <div className="border-t border-slate-100 px-3 py-2 bg-slate-50 space-y-1.5">
                      {ex.description && <p className="text-[11px] text-slate-600">{ex.description}</p>}
                      {(ex.equipment||[]).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(ex.equipment||[]).map((e: string) => (
                            <span key={e} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">🛠️ {e}</span>
                          ))}
                        </div>
                      )}
                      {techLines.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 mb-0.5">⭐ النقاط الفنية</div>
                          <ul className="space-y-0.5">
                            {techLines.map((l, i) => <li key={i} className="flex items-start gap-1 text-[11px] text-slate-700"><span className="text-slate-300">•</span>{l}</li>)}
                          </ul>
                        </div>
                      )}
                      {varLines.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 mb-0.5">⚙️ المتغيرات</div>
                          <ul className="space-y-0.5">
                            {varLines.map((l, i) => <li key={i} className="flex items-start gap-1 text-[11px] text-slate-700"><span className="text-slate-300">•</span>{l}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-between border-t border-slate-100 pt-2">
            <button className="btn btn-ghost btn-sm text-xs" onClick={() => { setShowAddExToBlock(null); setAddExFilterQ(''); setAddExFilterSection(''); setAddExFilterCategory(''); openCreateExercise() }}>+ تمرين جديد في المكتبة</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddExToBlock(null); setAddExFilterQ(''); setAddExFilterSection(''); setAddExFilterCategory('') }}>إغلاق</button>
          </div>
        </div>
      </Modal>
    )
  }
}

// ═══ Helper Components ══════════════════════════════════════════════════

function ExerciseChip({ be, canManage, onRemove, onView, teamId, onExerciseSaved }: {
  be: any; canManage: boolean; onRemove: () => void; onView: () => void
  teamId?: string; onExerciseSaved?: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [imgZoom, setImgZoom] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [savedEquip] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ta_equipment_lib') || '[]') } catch { return [] }
  })

  const ex = be.exercise
  if (!ex && !be.custom_name) return null

  const lines = (text: string) => text?.split('\n').map((l: string) => l.replace(/^•\s*/, '').trim()).filter(Boolean) || []
  const allEquip = [...EQUIPMENT_OPTIONS, ...savedEquip].filter((v, i, a) => a.indexOf(v) === i)

  function openEdit() {
    setEditForm({ ...ex, equipment: ex.equipment || [] })
    setEditError('')
    setEditing(true)
  }

  function toggleEquip(item: string) {
    setEditForm((p: any) => {
      const arr: string[] = p.equipment || []
      return { ...p, equipment: arr.includes(item) ? arr.filter((e: string) => e !== item) : [...arr, item] }
    })
  }

  async function saveEdit() {
    if (!teamId || !editForm?.name?.trim()) { setEditError('اكتب اسم التمرين'); return }
    setSaving(true)
    const result = await trainingService.updateExercise(ex.id, { ...editForm, team_id: teamId, name: editForm.name.trim() })
    if (result.error) { setEditError(result.error.message || 'تعذر الحفظ'); setSaving(false); return }
    setSaving(false); setEditing(false); onExerciseSaved?.()
  }

  async function saveAsNew() {
    if (!teamId || !editForm?.name?.trim()) { setEditError('اكتب اسم التمرين'); return }
    setSaving(true)
    const payload = { ...editForm, team_id: teamId, name: editForm.name.trim() }
    delete payload.id
    const result = await trainingService.createExercise(payload)
    if (result.error) { setEditError(result.error.message || 'تعذر الحفظ'); setSaving(false); return }
    setSaving(false); setEditing(false); onExerciseSaved?.()
  }

  return (
    <>
      <div className="mt-1.5 rounded-xl border border-slate-100 bg-white overflow-hidden">
        {/* Chip header row */}
        <div className="flex items-center gap-1.5 px-2 py-1">
          {/* Thumbnail — click to zoom */}
          {ex?.image_url ? (
            <button onClick={() => setImgZoom(true)} className="flex-shrink-0 focus:outline-none">
              <img src={ex.image_url} alt={ex.name} className="w-8 h-8 object-cover rounded-lg hover:opacity-80 transition-opacity cursor-zoom-in"/>
            </button>
          ) : (
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <BookOpen size={11} className="text-slate-400"/>
            </div>
          )}
          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-slate-700 truncate">{ex?.name || be.custom_name}</div>
            <div className="text-[10px] text-slate-400 flex gap-1">
              {(be.duration_min || ex?.duration_min) && <span>⏱️ {be.duration_min || ex?.duration_min}دق</span>}
              {ex?.player_count_min && <span>· 👥 {ex.player_count_min}+</span>}
            </div>
          </div>
          {/* Expand + remove */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {ex && (
              <button title="تفاصيل" className="text-slate-400 hover:text-brand-500 p-0.5" onClick={() => setExpanded(p => !p)}>
                {expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
              </button>
            )}
            {canManage && <button className="text-red-400 hover:text-red-600 p-0.5" onClick={onRemove}><X size={10}/></button>}
          </div>
        </div>

        {/* Expanded full details */}
        {expanded && ex && (
          <div className="border-t border-slate-100 px-2 py-2 bg-slate-50 space-y-2">
            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {ex.section && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[10px] text-blue-700">{SECTION_LABEL[ex.section] || ex.section}</span>}
              {ex.category && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-[10px] text-purple-700">{CATEGORY_LABEL[ex.category] || ex.category}</span>}
              {ex.location && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600">{LOCATION_LABEL[ex.location] || ex.location}</span>}
            </div>
            {/* Description */}
            {ex.description && <p className="text-[11px] text-slate-600 leading-relaxed">{ex.description}</p>}
            {/* Equipment */}
            {(ex.equipment || []).length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 mb-0.5">🛠️ الأدوات</div>
                <div className="flex flex-wrap gap-1">
                  {(ex.equipment || []).map((e: string) => (
                    <span key={e} className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] text-slate-600">{e}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Technical points */}
            {ex.technical_points && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 mb-0.5">⭐ النقاط الفنية</div>
                <ul className="space-y-0.5">
                  {lines(ex.technical_points).map((l: string, i: number) => (
                    <li key={i} className="flex items-start gap-1 text-[11px] text-slate-700">
                      <span className="text-slate-300 flex-shrink-0">•</span><span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Variables */}
            {ex.variables && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 mb-0.5">⚙️ المتغيرات</div>
                <ul className="space-y-0.5">
                  {lines(ex.variables).map((l: string, i: number) => (
                    <li key={i} className="flex items-start gap-1 text-[11px] text-slate-700">
                      <span className="text-slate-300 flex-shrink-0">•</span><span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Edit button — visible to all; save-as-new always available, update-original only for managers */}
            {ex && teamId && (
              <button className="btn btn-ghost btn-sm text-xs text-blue-600 w-full mt-1" onClick={openEdit}>
                <Pencil size={11}/> تعديل / حفظ كجديد
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image zoom modal */}
      {imgZoom && ex?.image_url && (
        <Modal open={imgZoom} onClose={() => setImgZoom(false)} title={ex.name}>
          <img src={ex.image_url} alt={ex.name} className="w-full rounded-xl object-contain max-h-[70vh]"/>
        </Modal>
      )}

      {/* Edit exercise modal */}
      {editing && editForm && (
        <Modal open={editing} onClose={() => !saving && setEditing(false)} title={`تعديل: ${ex.name}`} width="max-w-2xl">
          <div className="space-y-4">
            {editError && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm font-bold">{editError}</div>}
            <div className="grid md:grid-cols-2 gap-3">
              <FormField label="اسم التمرين" required>
                <input className="form-input" value={editForm.name} onChange={e => setEditForm((p: any) => ({ ...p, name: e.target.value }))}/>
              </FormField>
              <FormField label="القسم">
                <select className="form-input" value={editForm.section} onChange={e => setEditForm((p: any) => ({ ...p, section: e.target.value }))}>
                  {Object.entries(SECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
              <FormField label="الفئة">
                <select className="form-input" value={editForm.category} onChange={e => setEditForm((p: any) => ({ ...p, category: e.target.value }))}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
              <FormField label="المكان">
                <select className="form-input" value={editForm.location} onChange={e => setEditForm((p: any) => ({ ...p, location: e.target.value }))}>
                  {Object.entries(LOCATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </FormField>
              <FormField label="الحد الأدنى للاعبين">
                <input className="form-input" type="number" min={1} value={editForm.player_count_min} onChange={e => setEditForm((p: any) => ({ ...p, player_count_min: Number(e.target.value) }))}/>
              </FormField>
              <FormField label="مدة التمرين (دقائق)">
                <input className="form-input" type="number" min={1} value={editForm.duration_min} onChange={e => setEditForm((p: any) => ({ ...p, duration_min: Number(e.target.value) }))}/>
              </FormField>
            </div>
            <FormField label="الأدوات المستخدمة">
              <div className="flex flex-wrap gap-1.5 mt-1">
                {allEquip.map(item => (
                  <button key={item} type="button" onClick={() => toggleEquip(item)}
                    className={cn('px-2 py-1 rounded-lg text-xs font-bold border transition-colors',
                      (editForm.equipment || []).includes(item) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300')}>
                    {item}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="شرح التمرين">
              <textarea className="form-input" rows={3} value={editForm.description || ''} onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))}/>
            </FormField>
            <FormField label="النقاط الفنية">
              <BulletListInput value={editForm.technical_points || ''} onChange={v => setEditForm((p: any) => ({ ...p, technical_points: v }))} rows={4}/>
            </FormField>
            <FormField label="المتغيرات">
              <BulletListInput value={editForm.variables || ''} onChange={v => setEditForm((p: any) => ({ ...p, variables: v }))} rows={3}/>
            </FormField>
            <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>إلغاء</button>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm text-blue-600" onClick={saveAsNew} disabled={saving}>
                  <Save size={13}/> حفظ كتمرين جديد
                </button>
                {canManage && (
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                    {saving ? <Spinner size="sm"/> : 'تحديث التمرين'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── BulletListInput: textarea where Enter adds a new bullet point ─────────
function BulletListInput({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  function handleFocus() {
    if (!value) onChange('• ')
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const ta = e.currentTarget
    const start = ta.selectionStart
    const before = value.slice(0, start)
    const after = value.slice(ta.selectionEnd)
    const newVal = before + '\n• ' + after
    onChange(newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 3 }, 0)
  }
  return (
    <textarea
      className="form-input text-sm"
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      placeholder={placeholder || '• اكتب نقطة... ثم اضغط Enter'}
      style={{ lineHeight: '2' }}
    />
  )
}

// ── BulletList: render bullet text as a proper list ───────────────────────
function BulletList({ text }: { text: string }) {
  if (!text?.trim()) return <span className="text-slate-400">—</span>
  const lines = text.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean)
  if (!lines.length) return <span className="text-slate-400">—</span>
  return (
    <ul className="space-y-1">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
          <span className="text-slate-400 flex-shrink-0 mt-0.5 text-xs leading-relaxed">•</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}

function GoalCard({ goal, phaseEnded, canManage, confirmDeleteGoalId, onEdit, onDelete, onConfirmDelete, onCancelDelete, onApprove }: {
  goal: any; phaseEnded: boolean; canManage: boolean
  confirmDeleteGoalId: string | null
  onEdit: () => void; onDelete: () => void; onConfirmDelete: () => void; onCancelDelete: () => void
  onApprove: (pct: number, notes: string) => void
}) {
  const [showApprove, setShowApprove] = useState(false)
  const [pctVal, setPctVal] = useState(goal.achievement_pct ?? 0)
  const [notesVal, setNotesVal] = useState(goal.achievement_notes || '')

  const pct: number | null = goal.achievement_pct
  const pctCls = pct == null ? 'bg-slate-200 text-slate-500' : pct >= 80 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
      {/* Compact row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-slate-300 flex-shrink-0 text-xs">•</span>
        <p className="text-sm text-slate-700 flex-1 leading-snug">{goal.goal_text}</p>
        {pct != null && (
          <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-bold', pctCls)}>{pct}%</span>
        )}
        {canManage && (
          <div className="flex gap-0.5 flex-shrink-0">
            {confirmDeleteGoalId === goal.id ? (
              <>
                <button className="btn btn-ghost btn-sm text-red-600 text-xs" onClick={onDelete}>حذف</button>
                <button className="btn btn-ghost btn-sm text-xs" onClick={onCancelDelete}>لا</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm p-1" onClick={onEdit}><Pencil size={11}/></button>
                <button className="btn btn-ghost btn-sm p-1 text-red-400" onClick={onConfirmDelete}><Trash2 size={11}/></button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline progress bar when achievement exists */}
      {pct != null && (
        <div className="px-3 pb-1">
          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div className={cn('h-1.5 rounded-full transition-all', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${pct}%` }}/>
          </div>
          {goal.achievement_notes && <p className="text-[10px] text-slate-400 mt-0.5">{goal.achievement_notes}</p>}
        </div>
      )}

      {/* Achievement toggle */}
      {canManage && (
        <div className="border-t border-slate-100 px-3 py-1">
          {!showApprove ? (
            <button className="text-[11px] text-blue-500 hover:text-blue-700" onClick={() => setShowApprove(true)}>
              {goal.is_approved ? 'تعديل نسبة الإنجاز ▾' : '+ اعتماد نسبة الإنجاز'}
            </button>
          ) : (
            <div className="space-y-2 py-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 flex-shrink-0">النسبة:</span>
                <input type="range" min={0} max={100} step={5} value={pctVal} onChange={e => setPctVal(Number(e.target.value))} className="flex-1"/>
                <span className="text-xs font-bold w-8">{pctVal}%</span>
              </div>
              <textarea className="form-input text-xs w-full" rows={2} value={notesVal} onChange={e => setNotesVal(e.target.value)} placeholder="ملاحظة..."/>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-ghost btn-sm text-xs" onClick={() => setShowApprove(false)}>إلغاء</button>
                <button className="btn btn-primary btn-sm text-xs" onClick={() => { onApprove(pctVal, notesVal); setShowApprove(false) }}>اعتماد</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
