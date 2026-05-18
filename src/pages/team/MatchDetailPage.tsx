import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Edit2, Trash2, Save, Calendar, MapPin, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { matchService, matchLineupService, matchEventsService, matchNotesService, medicalService, teamService, eventService, tournamentService } from '../../services'
import { Spinner, FormField, Tabs, ConfirmDialog } from '../../components/ui'
import { canManageEvents, formatDate } from '../../utils/helpers'
import type { FootballFormation, LineupPlayer, MatchEventType } from '../../types/database'

// ── Formation definitions ──────────────────────────────────────────────
// Portrait coordinates: x% = lateral (0=top, 100=bottom), y% = depth (0=opponent goal, 100=our goal)
// Landscape transform: lx = 100 - y  (our goal on left), ly = x
// Layer guide: GK y≈91, DEF y≈73, MID y≈50, ATK y≈28
type PitchPos = { x: number; y: number; label: string }
const FORMATIONS: Record<FootballFormation, PitchPos[]> = {
  '4-4-2': [
    { x: 33, y: 26, label: 'م' }, { x: 67, y: 26, label: 'م' },
    { x: 10, y: 50, label: 'و' }, { x: 33, y: 50, label: 'و' }, { x: 67, y: 50, label: 'و' }, { x: 90, y: 50, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-3-3': [
    { x: 20, y: 24, label: 'م' }, { x: 50, y: 22, label: 'م' }, { x: 80, y: 24, label: 'م' },
    { x: 25, y: 50, label: 'و' }, { x: 50, y: 50, label: 'و' }, { x: 75, y: 50, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-2-3-1': [
    { x: 50, y: 22, label: 'م' },
    { x: 15, y: 37, label: 'م' }, { x: 50, y: 35, label: 'م' }, { x: 85, y: 37, label: 'م' },
    { x: 35, y: 56, label: 'و' }, { x: 65, y: 56, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-1-4-1': [
    { x: 50, y: 22, label: 'م' },
    { x: 10, y: 38, label: 'و' }, { x: 33, y: 38, label: 'و' }, { x: 67, y: 38, label: 'و' }, { x: 90, y: 38, label: 'و' },
    { x: 50, y: 55, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-5-1': [
    { x: 50, y: 22, label: 'م' },
    { x: 10, y: 40, label: 'و' }, { x: 28, y: 40, label: 'و' }, { x: 50, y: 40, label: 'و' }, { x: 72, y: 40, label: 'و' }, { x: 90, y: 40, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-4-1-1': [
    { x: 50, y: 20, label: 'م' },
    { x: 50, y: 34, label: 'م' },
    { x: 10, y: 51, label: 'و' }, { x: 33, y: 51, label: 'و' }, { x: 67, y: 51, label: 'و' }, { x: 90, y: 51, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '4-3-1-2': [
    { x: 33, y: 20, label: 'م' }, { x: 67, y: 20, label: 'م' },
    { x: 50, y: 34, label: 'م' },
    { x: 25, y: 52, label: 'و' }, { x: 50, y: 52, label: 'و' }, { x: 75, y: 52, label: 'و' },
    { x: 10, y: 73, label: 'م' }, { x: 30, y: 73, label: 'م' }, { x: 70, y: 73, label: 'م' }, { x: 90, y: 73, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '3-5-2': [
    { x: 33, y: 22, label: 'م' }, { x: 67, y: 22, label: 'م' },
    { x: 10, y: 39, label: 'و' }, { x: 28, y: 39, label: 'و' }, { x: 50, y: 39, label: 'و' }, { x: 72, y: 39, label: 'و' }, { x: 90, y: 39, label: 'و' },
    { x: 25, y: 70, label: 'م' }, { x: 50, y: 70, label: 'م' }, { x: 75, y: 70, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '3-4-3': [
    { x: 20, y: 22, label: 'م' }, { x: 50, y: 22, label: 'م' }, { x: 80, y: 22, label: 'م' },
    { x: 15, y: 50, label: 'و' }, { x: 38, y: 50, label: 'و' }, { x: 62, y: 50, label: 'و' }, { x: 85, y: 50, label: 'و' },
    { x: 25, y: 70, label: 'م' }, { x: 50, y: 70, label: 'م' }, { x: 75, y: 70, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '3-4-2-1': [
    { x: 50, y: 20, label: 'م' },
    { x: 30, y: 33, label: 'م' }, { x: 70, y: 33, label: 'م' },
    { x: 15, y: 52, label: 'و' }, { x: 38, y: 52, label: 'و' }, { x: 62, y: 52, label: 'و' }, { x: 85, y: 52, label: 'و' },
    { x: 25, y: 70, label: 'م' }, { x: 50, y: 70, label: 'م' }, { x: 75, y: 70, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '5-3-2': [
    { x: 33, y: 22, label: 'م' }, { x: 67, y: 22, label: 'م' },
    { x: 25, y: 46, label: 'و' }, { x: 50, y: 46, label: 'و' }, { x: 75, y: 46, label: 'و' },
    { x: 10, y: 69, label: 'م' }, { x: 27, y: 69, label: 'م' }, { x: 50, y: 69, label: 'م' }, { x: 73, y: 69, label: 'م' }, { x: 90, y: 69, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '5-4-1': [
    { x: 50, y: 22, label: 'م' },
    { x: 15, y: 40, label: 'و' }, { x: 38, y: 40, label: 'و' }, { x: 62, y: 40, label: 'و' }, { x: 85, y: 40, label: 'و' },
    { x: 10, y: 69, label: 'م' }, { x: 27, y: 69, label: 'م' }, { x: 50, y: 69, label: 'م' }, { x: 73, y: 69, label: 'م' }, { x: 90, y: 69, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
  '5-2-3': [
    { x: 20, y: 22, label: 'م' }, { x: 50, y: 22, label: 'م' }, { x: 80, y: 22, label: 'م' },
    { x: 35, y: 50, label: 'و' }, { x: 65, y: 50, label: 'و' },
    { x: 10, y: 69, label: 'م' }, { x: 27, y: 69, label: 'م' }, { x: 50, y: 69, label: 'م' }, { x: 73, y: 69, label: 'م' }, { x: 90, y: 69, label: 'م' },
    { x: 50, y: 91, label: 'ح' },
  ],
}

const ALL_FORMATIONS = Object.keys(FORMATIONS) as FootballFormation[]

const EVENT_TYPE_CONFIG: Record<MatchEventType, { label: string; icon: string; color: string }> = {
  goal:         { label: 'هدف',          icon: '⚽', color: 'text-emerald-600' },
  assist:       { label: 'صناعة',        icon: '🎯', color: 'text-blue-600' },
  yellow_card:  { label: 'بطاقة صفراء', icon: '🟡', color: 'text-yellow-600' },
  red_card:     { label: 'بطاقة حمراء', icon: '🔴', color: 'text-red-600' },
  substitution: { label: 'تبديل',        icon: '🔄', color: 'text-purple-600' },
  clean_sheet:  { label: 'شباك نظيفة',  icon: '🥅', color: 'text-teal-600' },
}

const EXCUSE_TYPES: Record<string, string> = {
  injured: 'مصاب', suspended: 'موقوف', excluded: 'مستبعد', other: 'أخرى'
}

const NOTE_VISIBILITY_LABELS = {
  all: 'الكل',
  staff: 'الجهاز الفني فقط',
  management: 'الإدارة فقط',
  me: 'أنا فقط',
}

export default function MatchDetailPage() {
  const { teamId, matchId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [match, setMatch] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [tournament, setTournament] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('lineup')

  // Lineup state
  const [formation, setFormation] = useState<FootballFormation>('4-4-2')
  const [lineupPlayers, setLineupPlayers] = useState<LineupPlayer[]>([])
  const [captainId, setCaptainId] = useState<string>('')
  const [savingLineup, setSavingLineup] = useState(false)

  // Match events state
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [eventForm, setEventForm] = useState({ event_type: 'goal' as MatchEventType, player_id: '', player_out_id: '', assist_player_id: '', minute: '' })
  const [injuredPlayerIds, setInjuredPlayerIds] = useState<Set<string>>(new Set())
  const [savingEvent, setSavingEvent] = useState(false)
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<any>(null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)

  // Events validation error
  const [eventError, setEventError] = useState('')

  // Match notes state
  const [matchNotes, setMatchNotes] = useState<any[]>([])
  const [noteForm, setNoteForm] = useState({ content: '', visibility: 'staff' })
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  // Score edit
  const [editScore, setEditScore] = useState(false)
  const [scoreFor, setScoreFor] = useState('')
  const [scoreAgainst, setScoreAgainst] = useState('')
  const [savingScore, setSavingScore] = useState(false)

  // Attendance state
  const [attendance, setAttendance] = useState<any[]>([])
  const [savingAtt, setSavingAtt] = useState<Record<string, boolean>>({})
  const [attInitialized, setAttInitialized] = useState(false)

  const canManage = canManageEvents(myRole)

  const load = useCallback(async () => {
    if (!teamId || !matchId || !user) return
    setLoading(true)
    const [m, role, mems, teamData] = await Promise.all([
      matchService.getOne(matchId),
      teamService.getMyRole(teamId, user.id),
      teamService.getMembers(teamId),
      teamService.getTeam(teamId),
    ])
    setMatch(m)
    setTeam(teamData)
    setMyRole(role || '')
    setMembers(mems.filter((x: any) => x.role !== 'parent'))

    if (m?.tournament_id) {
      const all = await tournamentService.getAll(teamId)
      setTournament(all.find((x: any) => x.id === m.tournament_id) || null)
    }

    // Load lineup
    const lineup = await matchLineupService.get(matchId)
    if (lineup) {
      setFormation(lineup.formation as FootballFormation)
      const players = lineup.players || []
      setLineupPlayers(players)
      const cap = players.find((p: any) => p.is_captain)
      if (cap) setCaptainId(cap.user_id)
    }

    // Load match events
    const events = await matchEventsService.getAll(matchId)
    setMatchEvents(events)

    // Load attendance (from linked event)
    if (m?.event_id) {
      const att = await eventService.getAttendance(m.event_id)
      setAttendance(att || [])
    }

    // Load match notes
    const notes = await matchNotesService.getAll(matchId)
    setMatchNotes(notes)

    // Load active injuries for lineup warning indicators
    const reports = await medicalService.getReports(teamId)
    const injured = new Set<string>(
      reports.filter((r: any) => r.status === 'active' || r.status === 'monitoring').map((r: any) => r.player_id)
    )
    setInjuredPlayerIds(injured)

    setLoading(false)
  }, [teamId, matchId, user])

  useEffect(() => { load() }, [load])

  // ── Lineup helpers ───────────────────────────────────────────────────
  const positions = FORMATIONS[formation]
  const starters = lineupPlayers.filter(p => p.role === 'starter')
  const subs = lineupPlayers.filter(p => p.role === 'sub')
  const excluded = lineupPlayers.filter(p => p.role === 'excluded')

  function assignPlayerToPosition(posIndex: number, userId: string) {
    const jersey = members.find(m => m.user_id === userId)?.jersey_number || 0
    setLineupPlayers(prev => {
      const next = prev.filter(p => p.position_index !== posIndex && p.user_id !== userId)
      if (!userId) return next
      return [...next, { position_index: posIndex, user_id: userId, jersey_number: jersey, role: 'starter' }]
    })
  }

  function addPlayerToRole(userId: string, role: 'sub' | 'excluded') {
    if (!userId) return
    const jersey = members.find(m => m.user_id === userId)?.jersey_number || 0
    setLineupPlayers(prev => {
      const next = prev.filter(p => p.user_id !== userId)
      return [...next, { position_index: -1, user_id: userId, jersey_number: jersey, role }]
    })
  }

  function removeFromLineup(userId: string) {
    setLineupPlayers(prev => prev.filter(p => p.user_id !== userId))
  }

  async function saveLineup() {
    if (!matchId || !teamId || !user) return
    setSavingLineup(true)
    const playersWithCaptain = lineupPlayers.map(p => ({ ...p, is_captain: p.user_id === captainId && p.role === 'starter' }))
    await matchLineupService.save(matchId, teamId, formation, playersWithCaptain, user.id)
    setSavingLineup(false)
  }

  // ── Match events helpers ─────────────────────────────────────────────
  function getEventWarning(playerId: string, minute: number): string {
    if (!playerId || !minute) return ''
    const subOut = matchEvents.find(e => e.event_type === 'substitution' && e.player_out_id === playerId && e.id !== editingEventId)
    if (subOut && minute > subOut.minute) {
      const name = members.find(m => m.user_id === playerId)?.profile?.full_name || ''
      return `⚠️ ${name} غادر الملعب في الدقيقة ${subOut.minute}`
    }
    return ''
  }

  async function addMatchEvent() {
    if (!matchId || !teamId || !user || !eventForm.player_id || !eventForm.minute) return
    setEventError('')
    setSavingEvent(true)
    const min = parseInt(eventForm.minute)
    if (editingEventId) {
      await matchEventsService.remove(editingEventId)
      setEditingEventId(null)
    }
    await matchEventsService.add({
      match_id: matchId, team_id: teamId,
      event_type: eventForm.event_type,
      player_id: eventForm.player_id || null,
      player_out_id: eventForm.player_out_id || null,
      minute: min,
      created_by: user.id
    })
    // If goal + assist player selected, create assist event automatically
    if (eventForm.event_type === 'goal' && eventForm.assist_player_id) {
      await matchEventsService.add({
        match_id: matchId, team_id: teamId,
        event_type: 'assist',
        player_id: eventForm.assist_player_id,
        minute: min,
        created_by: user.id
      })
    }
    const events = await matchEventsService.getAll(matchId)
    setMatchEvents(events)
    if (['yellow_card', 'red_card'].includes(eventForm.event_type)) {
      await matchService.syncCardCounts(matchId)
    }
    setEventForm({ event_type: 'goal', player_id: '', player_out_id: '', assist_player_id: '', minute: '' })
    setSavingEvent(false)
  }

  async function deleteMatchEvent(id: string) {
    const evt = matchEvents.find(e => e.id === id)
    await matchEventsService.remove(id)
    setMatchEvents(prev => prev.filter(e => e.id !== id))
    if (evt && ['yellow_card', 'red_card'].includes(evt.event_type) && matchId) {
      await matchService.syncCardCounts(matchId)
    }
    setConfirmDeleteEvent(null)
  }

  function startEditEvent(ev: any) {
    setEditingEventId(ev.id)
    setEventForm({
      event_type: ev.event_type as MatchEventType,
      player_id: ev.player_id || '',
      player_out_id: ev.player_out_id || '',
      assist_player_id: '',
      minute: String(ev.minute)
    })
  }

  // ── Score helpers ────────────────────────────────────────────────────
  async function saveScore() {
    if (!matchId) return
    setSavingScore(true)
    const gf = scoreFor !== '' ? parseInt(scoreFor) : null
    const ga = scoreAgainst !== '' ? parseInt(scoreAgainst) : null
    let status = match.status
    if (gf !== null && ga !== null) status = 'finished'
    await matchService.update(matchId, { goals_for: gf, goals_against: ga, status })
    setMatch((m: any) => ({ ...m, goals_for: gf, goals_against: ga, status }))
    setEditScore(false)
    setSavingScore(false)
  }

  // ── Attendance helpers ───────────────────────────────────────────────
  // Auto-init: mark all players as 'confirmed' when attendance tab opens for the first time
  useEffect(() => {
    if (tab !== 'attendance' || !match?.event_id || !teamId || attInitialized || members.length === 0) return
    const playerMems = members.filter((m: any) => m.role === 'player')
    if (playerMems.length === 0) return
    setAttInitialized(true)
    const missing = playerMems.filter((pm: any) => !attendance.some((a: any) => a.user_id === pm.user_id))
    if (missing.length === 0) return
    Promise.all(missing.map((pm: any) => eventService.setAttendance({
      event_id: match.event_id, team_id: teamId, user_id: pm.user_id,
      player_confirmation: 'confirmed'
    }))).then(() => {
      setAttendance(prev => [
        ...prev,
        ...missing.map((pm: any) => ({ user_id: pm.user_id, player_confirmation: 'confirmed', status: '' }))
      ])
    })
  }, [tab, match?.event_id, attInitialized, members.length])

  async function setPlayerConfirmation(userId: string, confirmation: string) {
    if (!match?.event_id || !teamId) return
    setSavingAtt(p => ({ ...p, [userId]: true }))
    await eventService.setAttendance({
      event_id: match.event_id, team_id: teamId, user_id: userId,
      player_confirmation: confirmation
    })
    setAttendance(prev => {
      const existing = prev.find((a: any) => a.user_id === userId)
      return [...prev.filter((a: any) => a.user_id !== userId), { ...(existing || { user_id: userId }), player_confirmation: confirmation }]
    })
    setSavingAtt(p => ({ ...p, [userId]: false }))
  }

  async function setCoachAttStatus(userId: string, status: string, excuseType?: string, excuseText?: string, lateMinutes?: number) {
    if (!match?.event_id || !teamId) return
    setSavingAtt(p => ({ ...p, [userId]: true }))
    const record: any = {
      event_id: match.event_id, team_id: teamId, user_id: userId,
      status, has_excuse: !!excuseType, excuse_type: excuseType || null, late_excuse: excuseText || null
    }
    if (lateMinutes !== undefined) record.late_minutes = lateMinutes
    await eventService.setAttendance(record)
    setAttendance(prev => {
      const existing = prev.find((a: any) => a.user_id === userId)
      return [...prev.filter((a: any) => a.user_id !== userId), { ...(existing || { user_id: userId }), ...record }]
    })
    setSavingAtt(p => ({ ...p, [userId]: false }))
  }

  // ── Notes helpers ────────────────────────────────────────────────────
  async function saveNote() {
    if (!noteForm.content.trim() || !matchId || !teamId || !user) return
    setSavingNote(true)
    if (editingNoteId) {
      await matchNotesService.update(editingNoteId, noteForm.content, noteForm.visibility)
      setMatchNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, content: noteForm.content, visibility: noteForm.visibility } : n))
      setEditingNoteId(null)
    } else {
      const { data } = await matchNotesService.add({ match_id: matchId, team_id: teamId, content: noteForm.content, visibility: noteForm.visibility, created_by: user.id })
      if (data) setMatchNotes(prev => [...prev, data])
    }
    setNoteForm({ content: '', visibility: 'staff' })
    setSavingNote(false)
  }

  async function deleteNote(id: string) {
    await matchNotesService.remove(id)
    setMatchNotes(prev => prev.filter(n => n.id !== id))
  }

  function canSeeNote(note: any): boolean {
    if (note.visibility === 'all') return true
    if (note.visibility === 'me') return note.created_by === user?.id
    if (note.visibility === 'staff') return canManage
    if (note.visibility === 'management') return myRole === 'admin'
    return false
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!match) return <div className="card text-center text-slate-400 py-10">لم يتم العثور على المباراة</div>

  const goalsFor = match.goals_for
  const goalsAgainst = match.goals_against
  const hasResult = goalsFor !== null && goalsAgainst !== null
  const resultLabel = hasResult
    ? goalsFor > goalsAgainst ? 'فوز' : goalsFor === goalsAgainst ? 'تعادل' : 'خسارة'
    : null
  const resultColor = resultLabel === 'فوز' ? 'text-emerald-500' : resultLabel === 'خسارة' ? 'text-red-500' : 'text-amber-500'

  // Only registered players (role='player') for lineup management
  const playerMembers = members.filter(m => m.role === 'player')

  // All lineup players not excluded (starters + bench), used for event player selects
  const lineupEligible = lineupPlayers.filter(p => p.role !== 'excluded')
  const lineupEligibleMembers = members.filter(m => lineupEligible.some(p => p.user_id === m.user_id))

  // Substitution tracking (for warning computation only — not for filtering)
  const subbedOutIds = new Set(matchEvents.filter(e => e.event_type === 'substitution').map((e: any) => e.player_out_id))
  const subbedInIds = new Set(matchEvents.filter(e => e.event_type === 'substitution').map((e: any) => e.player_id))

  function getEventPlayerList(type: MatchEventType, isPlayerOut = false): any[] {
    if (isPlayerOut) {
      // Player going OFF (substitution): any starter (show all, warn if already subbed)
      return members.filter(m => lineupPlayers.some(p => p.role === 'starter' && p.user_id === m.user_id))
    }
    if (type === 'substitution') {
      // Player coming ON: any bench sub
      return members.filter(m => lineupPlayers.some(p => p.role === 'sub' && p.user_id === m.user_id))
    }
    // goal/assist/cards/clean_sheet: all lineup members (starters + bench, not excluded)
    return lineupEligibleMembers
  }

  const MemberSelect = ({ value, onChange, placeholder, list }: { value: string; onChange: (v: string) => void; placeholder?: string; list?: any[] }) => {
    const opts = list ?? lineupEligibleMembers
    return (
      <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder || 'اختر لاعباً...'}</option>
        {opts.map(m => <option key={m.id} value={m.user_id}>{m.profile?.full_name}{m.jersey_number ? ` (${m.jersey_number})` : ''}</option>)}
      </select>
    )
  }

  return (
    <div>
      {/* Back + Title */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(`/team/${teamId}/matches`)}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowRight size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">
            {match.home_away === 'home' ? `فريقنا ضد ${match.opponent}` : `${match.opponent} ضد فريقنا`}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span className="flex items-center gap-1"><Calendar size={11} />{formatDate(match.match_date)} · {match.match_date?.slice(11, 16)}</span>
            {match.location && <span className="flex items-center gap-1"><MapPin size={11} />{match.location}</span>}
            {tournament && <span className="badge badge-purple">{tournament.name}</span>}
          </div>
        </div>
      </div>

      {/* Score Card */}
      <div className="card mb-4 bg-gradient-to-b from-slate-800 to-slate-950 text-white">
        <div className="flex items-center gap-2">
          {/* Our team */}
          <div className="flex flex-col items-center gap-1 flex-1">
            {team?.logo_url ? (
              <img src={team.logo_url} className="w-14 h-14 rounded-full object-cover border-2 border-white/20" alt="" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-600 border-2 border-white/20 flex items-center justify-center text-white text-xl font-bold">
                {(team?.name || 'F')[0]}
              </div>
            )}
            <span className="text-[10px] opacity-50 text-center max-w-[70px] truncate">{team?.name || 'فريقنا'}</span>
          </div>
          {/* Score */}
          <div className="flex flex-col items-center flex-1">
            {hasResult ? (
              <>
                <div className="text-4xl font-bold">{goalsFor} - {goalsAgainst}</div>
                {resultLabel && <div className={`text-sm font-bold ${resultColor}`}>{resultLabel}</div>}
              </>
            ) : (
              <div className="text-2xl font-bold opacity-40">VS</div>
            )}
            {canManage && !editScore && (
              <button onClick={() => { setScoreFor(match.goals_for ?? ''); setScoreAgainst(match.goals_against ?? ''); setEditScore(true) }}
                className="mt-2 text-[10px] opacity-50 hover:opacity-80 transition-opacity">
                {hasResult ? 'تعديل النتيجة' : 'تسجيل النتيجة'}
              </button>
            )}
          </div>
          {/* Opponent */}
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className="w-14 h-14 flex items-center justify-center opacity-60">
              <svg viewBox="0 0 24 24" className="w-14 h-14" fill="white">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              </svg>
            </div>
            <span className="text-[10px] opacity-50 text-center max-w-[70px] truncate">{match.opponent}</span>
          </div>
        </div>
        {editScore && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <input type="number" min="0" className="form-input text-slate-900 text-center w-16 py-1.5" value={scoreFor} onChange={e => setScoreFor(e.target.value)} placeholder="0" />
            <span className="text-xl font-bold">-</span>
            <input type="number" min="0" className="form-input text-slate-900 text-center w-16 py-1.5" value={scoreAgainst} onChange={e => setScoreAgainst(e.target.value)} placeholder="0" />
            <button onClick={saveScore} disabled={savingScore} className="btn btn-primary btn-sm">
              {savingScore ? <Spinner size="sm" /> : <Save size={13} />}
            </button>
            <button onClick={() => setEditScore(false)} className="btn btn-ghost btn-sm text-slate-300">×</button>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'lineup', label: 'التشكيلة' },
          { key: 'events', label: `الأحداث (${matchEvents.length})` },
          { key: 'attendance', label: `الحضور (${playerMembers.length})` },
        ]}
        active={tab} onChange={setTab} />

      {/* ── LINEUP TAB ─────────────────────────────────────────────────── */}
      {tab === 'lineup' && (
        <div className="mt-3 space-y-4">
          {/* Formation selector */}
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="text-xs font-bold text-slate-500 whitespace-nowrap">التشكيلة</div>
              <select
                className="form-input text-sm font-bold flex-1"
                value={formation}
                onChange={e => canManage && setFormation(e.target.value as FootballFormation)}
                disabled={!canManage}>
                {ALL_FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Pitch - landscape image background */}
          <div className="card p-2 overflow-hidden">
            <div className="relative mx-auto rounded-xl overflow-hidden"
              style={{
                backgroundImage: 'url(/images/pitch.jpg)',
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                paddingBottom: '64.3%'
              }}>
              {/* Player circles – landscape transform: lx = 100-portrait_y, ly = portrait_x */}
              {positions.map((pos, idx) => {
                const lx = 100 - pos.y
                const ly = pos.x
                const isGK = pos.label === 'ح'
                const assigned = lineupPlayers.find(p => p.position_index === idx && p.role === 'starter')
                const jersey = assigned?.jersey_number
                const memberData = assigned ? members.find(m => m.user_id === assigned.user_id) : null
                const isCaptain = assigned?.user_id === captainId && !!captainId
                const isInjured = assigned ? injuredPlayerIds.has(assigned.user_id) : false
                const avatarUrl = memberData?.profile?.avatar_url
                const displayText = assigned
                  ? (jersey ? String(jersey) : (memberData?.profile?.full_name?.[0] || pos.label))
                  : pos.label
                const circleBase = isGK && assigned ? '#92400e' : '#1e40af'
                return (
                  <div key={idx} className="absolute" style={{ left: `${lx}%`, top: `${ly}%`, transform: 'translate(-50%,-50%)' }}>
                    <div className="relative">
                      {canManage ? (
                        <div className="relative w-10 h-10">
                          <select
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 rounded-full"
                            value={assigned?.user_id || ''}
                            onChange={e => assignPlayerToPosition(idx, e.target.value)}>
                            <option value="">— {pos.label} —</option>
                            {playerMembers.map(m => <option key={m.id} value={m.user_id}>{m.profile?.full_name}{m.jersey_number ? ` #${m.jersey_number}` : ''}</option>)}
                          </select>
                          <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold border-2 shadow-md pointer-events-none select-none ${isGK && assigned ? 'border-yellow-300/80' : 'border-white/70'}`}
                            style={{ background: assigned ? circleBase : 'rgba(0,0,0,0.45)' }}>
                            {assigned && avatarUrl
                              ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                              : <span className="text-white text-xs font-bold">{displayText}</span>}
                          </div>
                        </div>
                      ) : (
                        <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold border-2 shadow-md ${isGK && assigned ? 'border-yellow-300/80' : 'border-white/70'}`}
                          style={{ background: assigned ? circleBase : 'rgba(0,0,0,0.45)' }}>
                          {assigned && avatarUrl
                            ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                            : <span className="text-white text-xs font-bold">{jersey ?? pos.label}</span>}
                        </div>
                      )}
                      {isGK && assigned && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] leading-none pointer-events-none">🧤</span>
                      )}
                      {isCaptain && (
                        <span className="absolute -top-1.5 -left-1.5 bg-yellow-400 text-yellow-900 text-[8px] font-extrabold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none pointer-events-none">C</span>
                      )}
                      {isInjured && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border border-white pointer-events-none animate-pulse" title="مصاب" />
                      )}
                    </div>
                    {assigned && memberData && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 whitespace-nowrap text-white text-[9px] font-semibold text-center mt-0.5 drop-shadow"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)', maxWidth: 52 }}>
                        {(memberData.profile?.full_name || '').split(' ').slice(0, 2).join(' ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Players lists */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Starters */}
            <div className="card">
              <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><Users size={12} /> أساسيون ({starters.length})</div>
              <div className="space-y-1">
                {starters.map(p => {
                  const mem = members.find(m => m.user_id === p.user_id)
                  const isCap = p.user_id === captainId
                  // Check if this player is in GK position (label 'ح')
                  const gkPos = positions.find((pos, idx) => pos.label === 'ح' && lineupPlayers.some(lp => lp.position_index === idx && lp.user_id === p.user_id))
                  const isGK = !!gkPos
                  return (
                    <div key={p.user_id} className="flex items-center gap-2 text-xs">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${isGK ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.jersey_number || '?'}
                      </span>
                      <span className="flex-1 truncate">{mem?.profile?.full_name}</span>
                      {isGK && <span className="text-[11px]" title="حارس">🧤</span>}
                      {isCap && <span className="bg-yellow-400 text-yellow-900 text-[8px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center">C</span>}
                      {canManage && (
                        <button
                          title={isCap ? 'إلغاء الكابتن' : 'تعيين كابتن'}
                          onClick={() => setCaptainId(isCap ? '' : p.user_id)}
                          className={`text-[10px] px-1 rounded transition-colors ${isCap ? 'text-yellow-600 bg-yellow-50' : 'text-slate-300 hover:text-yellow-500'}`}>
                          {isCap ? '★' : '☆'}
                        </button>
                      )}
                      {canManage && <button onClick={() => removeFromLineup(p.user_id)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>}
                    </div>
                  )
                })}
                {starters.length === 0 && <div className="text-xs text-slate-400">لا يوجد</div>}
              </div>
            </div>
            {/* Substitutes */}
            <div className="card">
              <div className="text-xs font-bold text-slate-500 mb-2">احتياط ({subs.length})</div>
              <div className="space-y-1 mb-2">
                {subs.map(p => {
                  const mem = members.find(m => m.user_id === p.user_id)
                  return (
                    <div key={p.user_id} className="flex items-center gap-2 text-xs">
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-[10px]">{p.jersey_number || '?'}</span>
                      <span className="flex-1 truncate">{mem?.profile?.full_name}</span>
                      {canManage && <button onClick={() => removeFromLineup(p.user_id)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>}
                    </div>
                  )
                })}
              </div>
              {canManage && (
                <select className="form-input text-xs py-1" onChange={e => { addPlayerToRole(e.target.value, 'sub'); e.target.value = '' }}>
                  <option value="">+ إضافة احتياط</option>
                  {playerMembers.filter(m => !lineupPlayers.find(p => p.user_id === m.user_id)).map(m => (
                    <option key={m.id} value={m.user_id}>{m.profile?.full_name}{m.jersey_number ? ` (${m.jersey_number})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
            {/* Excluded */}
            <div className="card">
              <div className="text-xs font-bold text-slate-500 mb-2">مستبعدون ({excluded.length})</div>
              <div className="space-y-1 mb-2">
                {excluded.map(p => {
                  const mem = members.find(m => m.user_id === p.user_id)
                  return (
                    <div key={p.user_id} className="flex items-center gap-2 text-xs">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-[10px]">{p.jersey_number || '?'}</span>
                      <span className="flex-1 truncate text-slate-500 line-through">{mem?.profile?.full_name}</span>
                      {canManage && <button onClick={() => removeFromLineup(p.user_id)} className="text-red-400 hover:text-red-600 text-base leading-none">×</button>}
                    </div>
                  )
                })}
              </div>
              {canManage && (
                <select className="form-input text-xs py-1" onChange={e => { addPlayerToRole(e.target.value, 'excluded'); e.target.value = '' }}>
                  <option value="">+ إضافة مستبعد</option>
                  {playerMembers.filter(m => !lineupPlayers.find(p => p.user_id === m.user_id)).map(m => (
                    <option key={m.id} value={m.user_id}>{m.profile?.full_name}{m.jersey_number ? ` (${m.jersey_number})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {canManage && (
            <button onClick={saveLineup} disabled={savingLineup} className="btn btn-primary w-full justify-center">
              {savingLineup ? <Spinner size="sm" /> : <><Save size={14} /> حفظ التشكيلة</>}
            </button>
          )}
        </div>
      )}

      {/* ── EVENTS TAB ─────────────────────────────────────────────────── */}
      {tab === 'events' && (
        <div className="mt-3 space-y-3">
          {/* Inline form - always visible for managers */}
          {canManage && (
            <div className="card border border-brand-100 bg-brand-50/30">
              <div className="text-xs font-bold text-brand-600 mb-2">{editingEventId ? 'تعديل حدث' : 'إضافة حدث'}</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <FormField label="نوع الحدث">
                  <select className="form-input text-xs" value={eventForm.event_type}
                    onChange={e => { setEventForm(p => ({ ...p, event_type: e.target.value as MatchEventType, player_id: '', player_out_id: '', assist_player_id: '' })); setEventError('') }}>
                    {Object.entries(EVENT_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </FormField>
                <FormField label="الدقيقة *">
                  <input type="number" min="1" max="120" className="form-input text-xs" value={eventForm.minute}
                    onChange={e => { setEventForm(p => ({ ...p, minute: e.target.value })); setEventError('') }} placeholder="45" />
                </FormField>
              </div>
              <FormField label={eventForm.event_type === 'substitution' ? 'اللاعب الداخل *' : 'اللاعب *'}>
                <MemberSelect
                  value={eventForm.player_id}
                  onChange={v => { setEventForm(p => ({ ...p, player_id: v })); setEventError('') }}
                  list={getEventPlayerList(eventForm.event_type)}
                />
              </FormField>
              {/* Warning if player has field-status conflict */}
              {eventForm.player_id && eventForm.minute && (() => {
                const w = getEventWarning(eventForm.player_id, parseInt(eventForm.minute))
                return w ? <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mt-1 mb-1">{w}</div> : null
              })()}
              {/* Goal: optional assist player */}
              {eventForm.event_type === 'goal' && (
                <FormField label="صانع الهدف (اختياري)">
                  <MemberSelect
                    value={eventForm.assist_player_id}
                    onChange={v => setEventForm(p => ({ ...p, assist_player_id: v }))}
                    placeholder="بدون صناعة"
                    list={getEventPlayerList('assist')}
                  />
                </FormField>
              )}
              {/* Substitution: player going off */}
              {eventForm.event_type === 'substitution' && (
                <FormField label="اللاعب الخارج *">
                  <MemberSelect
                    value={eventForm.player_out_id}
                    onChange={v => setEventForm(p => ({ ...p, player_out_id: v }))}
                    placeholder="اللاعب الخارج..."
                    list={getEventPlayerList(eventForm.event_type, true)}
                  />
                </FormField>
              )}
              {eventError && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-1">{eventError}</div>}
              <div className="flex gap-2 justify-end mt-2">
                {editingEventId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingEventId(null); setEventForm({ event_type: 'goal', player_id: '', player_out_id: '', assist_player_id: '', minute: '' }); setEventError('') }}>إلغاء</button>
                )}
                <button className="btn btn-primary btn-sm" onClick={addMatchEvent} disabled={savingEvent || !eventForm.player_id || !eventForm.minute}>
                  {savingEvent ? <Spinner size="sm" /> : editingEventId ? 'حفظ' : 'إضافة'}
                </button>
              </div>
            </div>
          )}

          {matchEvents.length === 0 ? (
            <div className="card text-center text-slate-400 py-6 text-sm">لا توجد أحداث مسجّلة</div>
          ) : (
            <div className="space-y-2">
              {matchEvents.map(ev => {
                const cfg = EVENT_TYPE_CONFIG[ev.event_type as MatchEventType]
                return (
                  <div key={ev.id} className={`card mb-0 flex items-center gap-3 ${editingEventId === ev.id ? 'ring-2 ring-brand-300' : ''}`}>
                    <span className="text-2xl">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</div>
                      <div className="text-xs text-slate-500">
                        {ev.player?.full_name}
                        {ev.event_type === 'substitution' && ev.player_out && ` ← ${ev.player_out.full_name}`}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">{ev.minute}'</div>
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => startEditEvent(ev)} className="p-1.5 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-colors">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => setConfirmDeleteEvent(ev)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Match Notes (staff only) ─────────────────────────────── */}
          {canManage && (
            <div className="mt-4 card border border-amber-200 bg-amber-50/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📋</span>
                <div className="text-xs font-bold text-amber-700">ملاحظات تقنية</div>
                <span className="text-[10px] text-amber-600 opacity-70">(للجهاز الفني)</span>
              </div>
              {/* Existing notes */}
              <div className="space-y-2 mb-3">
                {matchNotes.filter(canSeeNote).map(note => (
                  <div key={note.id} className={`rounded-xl p-3 text-xs border ${editingNoteId === note.id ? 'border-amber-400 bg-amber-50' : 'border-amber-100 bg-white'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 text-slate-700 whitespace-pre-wrap">{note.content}</div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditingNoteId(note.id); setNoteForm({ content: note.content, visibility: note.visibility }) }}
                          className="p-1 text-slate-300 hover:text-amber-600 rounded transition-colors"><Edit2 size={11} /></button>
                        <button onClick={() => deleteNote(note.id)}
                          className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors"><Trash2 size={11} /></button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 opacity-70">
                      {NOTE_VISIBILITY_LABELS[note.visibility as keyof typeof NOTE_VISIBILITY_LABELS]}
                    </div>
                  </div>
                ))}
                {matchNotes.filter(canSeeNote).length === 0 && (
                  <div className="text-xs text-amber-600 opacity-60 text-center py-1">لا توجد ملاحظات</div>
                )}
              </div>
              {/* Add / Edit note form */}
              <div className="space-y-2">
                <textarea
                  className="form-input text-xs resize-none"
                  rows={3}
                  value={noteForm.content}
                  onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="أضف ملاحظة تقنية..."
                />
                <div className="flex items-center gap-2">
                  <select className="form-input text-xs flex-1" value={noteForm.visibility} onChange={e => setNoteForm(p => ({ ...p, visibility: e.target.value }))}>
                    {Object.entries(NOTE_VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {editingNoteId && (
                    <button className="btn btn-ghost btn-sm text-xs" onClick={() => { setEditingNoteId(null); setNoteForm({ content: '', visibility: 'staff' }) }}>إلغاء</button>
                  )}
                  <button className="btn btn-sm bg-amber-500 hover:bg-amber-600 text-white" onClick={saveNote} disabled={savingNote || !noteForm.content.trim()}>
                    {savingNote ? <Spinner size="sm" /> : editingNoteId ? 'حفظ' : 'إضافة'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ATTENDANCE TAB ─────────────────────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="mt-3">
          {!match.event_id ? (
            <div className="card text-center text-slate-400 text-sm py-6">
              هذه المباراة لا تملك موعداً مرتبطاً للحضور
            </div>
          ) : playerMembers.length === 0 ? (
            <div className="card text-center text-slate-400 text-sm py-6">لا يوجد لاعبون مسجلون في الفريق</div>
          ) : (
            <>
              {/* Summary cards */}
              {(() => {
                const confirmed = playerMembers.filter((m: any) => (attendance.find((a: any) => a.user_id === m.user_id)?.player_confirmation ?? 'confirmed') === 'confirmed').length
                const uncertain = playerMembers.filter((m: any) => attendance.find((a: any) => a.user_id === m.user_id)?.player_confirmation === 'uncertain').length
                const declaredAbsent = playerMembers.filter((m: any) => attendance.find((a: any) => a.user_id === m.user_id)?.player_confirmation === 'absent').length
                const coachPresent = playerMembers.filter((m: any) => attendance.find((a: any) => a.user_id === m.user_id)?.status === 'present').length
                const coachAbsent = playerMembers.filter((m: any) => attendance.find((a: any) => a.user_id === m.user_id)?.status === 'absent').length
                return (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="card mb-0 bg-slate-50 py-2.5">
                      <div className="text-[10px] text-slate-400 font-medium mb-1.5 text-center">تأكيد اللاعبين</div>
                      <div className="flex gap-2 justify-center text-center">
                        <div><div className="text-base font-bold text-emerald-600">{confirmed}</div><div className="text-[10px] text-slate-400">متأكد</div></div>
                        <div><div className="text-base font-bold text-amber-500">{uncertain}</div><div className="text-[10px] text-slate-400">غير متأكد</div></div>
                        <div><div className="text-base font-bold text-red-500">{declaredAbsent}</div><div className="text-[10px] text-slate-400">غائب</div></div>
                      </div>
                    </div>
                    <div className="card mb-0 bg-slate-50 py-2.5">
                      <div className="text-[10px] text-slate-400 font-medium mb-1.5 text-center">تسجيل المدرب</div>
                      <div className="flex gap-2 justify-center text-center">
                        <div><div className="text-base font-bold text-emerald-600">{coachPresent}</div><div className="text-[10px] text-slate-400">حاضر</div></div>
                        <div><div className="text-base font-bold text-red-500">{coachAbsent}</div><div className="text-[10px] text-slate-400">غائب</div></div>
                        <div><div className="text-base font-bold text-slate-300">{playerMembers.length - coachPresent - coachAbsent}</div><div className="text-[10px] text-slate-400">لم يسجل</div></div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Players list */}
              <div className="space-y-2">
                {playerMembers.map((mem: any) => {
                  const att = attendance.find((a: any) => a.user_id === mem.user_id)
                  const confirmation = att?.player_confirmation ?? 'confirmed'
                  const coachStatus = att?.status ?? ''
                  const isSaving = savingAtt[mem.user_id]
                  const isMe = mem.user_id === user?.id
                  const leftBorder = confirmation === 'confirmed' ? 'border-emerald-300' : confirmation === 'uncertain' ? 'border-amber-300' : 'border-red-300'

                  return (
                    <div key={mem.id} className={`card mb-0 border-r-4 ${leftBorder}`}>
                      {/* Name + coach badge */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-sm">{mem.profile?.full_name}</div>
                        {coachStatus === 'present' && (
                          <span className="badge badge-green text-[10px]">
                            {att?.late_minutes ? `حاضر +${att.late_minutes}د` : '✓ حاضر'}
                          </span>
                        )}
                        {coachStatus === 'absent' && (
                          <span className="badge bg-red-100 text-red-700 text-[10px]">
                            غائب {att?.has_excuse ? `(${EXCUSE_TYPES[att.excuse_type] || 'عذر'})` : '(بدون عذر)'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {/* Row 1: Player confirmation */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-16 flex-shrink-0">تأكيد اللاعب</span>
                          {isMe ? (
                            <div className="flex gap-1 flex-wrap">
                              {(['confirmed', 'uncertain', 'absent'] as const).map(c => (
                                <button key={c} onClick={() => setPlayerConfirmation(mem.user_id, c)}
                                  className={`text-xs px-2 py-0.5 rounded-lg border transition-all ${confirmation === c
                                    ? c === 'confirmed' ? 'bg-emerald-500 text-white border-emerald-500'
                                      : c === 'uncertain' ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-red-500 text-white border-red-500'
                                    : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                  {c === 'confirmed' ? '✅ متأكد' : c === 'uncertain' ? '❓ غير متأكد' : '❌ غائب'}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">
                              {confirmation === 'confirmed' ? '✅ متأكد' : confirmation === 'uncertain' ? '❓ غير متأكد' : '❌ غائب'}
                            </span>
                          )}
                        </div>

                        {/* Row 2: Coach recording (coach only edits, others read-only) */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-16 flex-shrink-0">تسجيل المدرب</span>
                          {isSaving ? <Spinner size="sm" /> : canManage ? (
                            <div className="flex gap-1 flex-wrap items-center">
                              <button onClick={() => setCoachAttStatus(mem.user_id, 'present')}
                                className={`text-xs px-2.5 py-0.5 rounded-lg border font-bold transition-all ${coachStatus === 'present' ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-400 hover:border-emerald-300'}`}>
                                حاضر
                              </button>
                              {coachStatus === 'present' && (
                                <LateMinutesInput
                                  value={att?.late_minutes || 0}
                                  onChange={min => setCoachAttStatus(mem.user_id, 'present', undefined, undefined, min)}
                                />
                              )}
                              <AbsenceDropdown
                                currentStatus={coachStatus}
                                currentExcuse={att?.excuse_type}
                                currentNote={att?.late_excuse}
                                onSelect={(excuseType, note) => setCoachAttStatus(mem.user_id, 'absent', excuseType, note)}
                                canManage={true}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {coachStatus === 'present'
                                ? (att?.late_minutes ? `حاضر (تأخر ${att.late_minutes} دقيقة)` : 'حاضر')
                                : coachStatus === 'absent'
                                  ? `غائب${att?.has_excuse ? ` (${EXCUSE_TYPES[att.excuse_type] || 'عذر'})` : ' (بدون عذر)'}`
                                  : '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog open={!!confirmDeleteEvent} title="حذف الحدث" danger
        message="هل تريد حذف هذا الحدث؟"
        onConfirm={() => deleteMatchEvent(confirmDeleteEvent.id)}
        onCancel={() => setConfirmDeleteEvent(null)} />
    </div>
  )
}

// ── AbsenceDropdown (coach only) ───────────────────────────────────────
function AbsenceDropdown({ currentStatus, currentExcuse, currentNote, onSelect, canManage }: {
  currentStatus: string
  currentExcuse?: string
  currentNote?: string
  onSelect: (excuseType: string | undefined, note: string) => void
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const [excuseType, setExcuseType] = useState(currentExcuse || '')
  const [note, setNote] = useState(currentNote || '')
  const isAbsent = currentStatus === 'absent'

  if (!canManage) return null

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`text-xs px-2.5 py-0.5 rounded-lg border font-bold transition-all ${isAbsent ? 'bg-red-100 text-red-700 border-red-200' : 'border-slate-200 text-slate-400 hover:border-red-300'}`}>
        {isAbsent ? `غائب${currentExcuse ? ` (${EXCUSE_TYPES[currentExcuse]})` : ''}` : 'غائب ▾'}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 w-52">
          <div className="text-xs font-bold text-slate-500 mb-2">نوع الغياب</div>
          <div className="space-y-1 mb-2">
            <button onClick={() => { onSelect(undefined, ''); setOpen(false) }}
              className="w-full text-right text-xs px-2 py-1.5 rounded-lg hover:bg-red-50 text-red-600 font-bold">
              بدون عذر
            </button>
            {Object.entries(EXCUSE_TYPES).map(([k, v]) => (
              <button key={k} onClick={() => setExcuseType(k)}
                className={`w-full text-right text-xs px-2 py-1.5 rounded-lg hover:bg-amber-50 ${excuseType === k ? 'bg-amber-50 text-amber-700 font-bold' : 'text-slate-600'}`}>
                {v}
              </button>
            ))}
          </div>
          {excuseType && (
            <>
              <input className="form-input text-xs mb-2" value={note} onChange={e => setNote(e.target.value)} placeholder="تفاصيل السبب..." />
              <button onClick={() => { onSelect(excuseType, note); setOpen(false) }}
                className="btn btn-primary btn-xs w-full justify-center">تأكيد</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── LateMinutesInput (coach only) ──────────────────────────────────────
function LateMinutesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(String(value || ''))

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className={`text-xs px-2 py-0.5 rounded-lg border transition-all ${value > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'border-slate-200 text-slate-400 hover:border-amber-200'}`}>
        {value > 0 ? `تأخر ${value}د` : '+ تأخر'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input type="number" min={0} max={90} autoFocus
        className="form-input text-xs py-0.5 w-14 text-center"
        value={local} onChange={e => setLocal(e.target.value)} />
      <span className="text-[10px] text-slate-400">دق</span>
      <button onClick={() => { onChange(parseInt(local) || 0); setEditing(false) }}
        className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-lg">✓</button>
      <button onClick={() => setEditing(false)} className="text-xs text-slate-400">✕</button>
    </div>
  )
}
