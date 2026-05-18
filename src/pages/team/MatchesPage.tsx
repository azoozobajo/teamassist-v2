import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trophy, Calendar, MapPin, Filter, ChevronRight, X, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { matchService, matchStatsService, teamService, tournamentService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ConfirmDialog } from '../../components/ui'
import { canManageEvents, formatDate } from '../../utils/helpers'

const HOME_AWAY: Record<string, string> = { home: 'ملعبنا', away: 'ملعب الخصم', neutral: 'ملعب محايد' }
const LEG_LABEL: Record<string, string> = { home: 'ذهاب', away: 'إياب', none: 'بدون' }
const STATUS_STYLE: Record<string, string> = { upcoming: 'bg-blue-100 text-blue-700', live: 'bg-red-100 text-red-700', finished: 'bg-slate-100 text-slate-600', cancelled: 'bg-slate-50 text-slate-400' }
const STATUS_LABEL: Record<string, string> = { upcoming: 'قادمة', live: '🔴 مباشرة', finished: 'منتهية', cancelled: 'ملغاة' }
const SYSTEM_LABEL: Record<string, string> = { league: 'دوري', groups: 'مجموعات', cup: 'كأس' }

type SortKey = 'name' | 'matches' | 'starter' | 'sub' | 'minutes' | 'goals' | 'assists' | 'yellow' | 'red' | 'cleanSheets'

const emptyForm = {
  opponent: '', match_date: '', map_url: '', location: '',
  home_away: 'home', status: 'upcoming',
  tournament_id: '', round_number: '', stage: '', leg: 'none', notes: ''
}
const emptyTournForm = { name: '', season: '', description: '', system: 'cup' }

export default function MatchesPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [teamSeason, setTeamSeason] = useState('')
  const [loading, setLoading] = useState(true)
  const [mainTab, setMainTab] = useState('matches')
  const [matchTab, setMatchTab] = useState('upcoming')
  const [filterTourn, setFilterTourn] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [showTournAdd, setShowTournAdd] = useState(false)
  const [editMatch, setEditMatch] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [form, setForm] = useState<any>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [tournForm, setTournForm] = useState<any>(emptyTournForm)
  const [statsData, setStatsData] = useState<{ matches: any[], lineups: any[], events: any[] } | null>(null)
  const [statsTournFilter, setStatsTournFilter] = useState('')
  const [statsFrom, setStatsFrom] = useState('')
  const [statsTo, setStatsTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('goals')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [headerFilterMode, setHeaderFilterMode] = useState<'none' | 'season' | 'date'>('none')
  const [headerSeasonFilter, setHeaderSeasonFilter] = useState('')
  const [headerDateFrom, setHeaderDateFrom] = useState('')
  const [headerDateTo, setHeaderDateTo] = useState('')
  const [showSeasonGen, setShowSeasonGen] = useState(false)
  const [genTeamCount, setGenTeamCount] = useState('')
  const [genLegs, setGenLegs] = useState<'1' | '2'>('2')
  const [genMatches, setGenMatches] = useState<any[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [dateChangeReason, setDateChangeReason] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const setTourn = (k: string, v: any) => setTournForm((p: any) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getTeam(teamId).then(t => setTeamSeason(t?.current_season || ''))
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [m, t, mem] = await Promise.all([
      matchService.getAll(teamId),
      tournamentService.getAll(teamId),
      teamService.getMembers(teamId)
    ])
    setMatches(m); setTournaments(t); setMembers(mem)
    setLoading(false)
    // Load stats eagerly so card counts (yellow/red) are accurate from the start
    loadStats()
  }

  async function loadStats() {
    if (!teamId) return
    const data = await matchStatsService.getTeamMatchStats(teamId)
    setStatsData(data)
  }

  useEffect(() => {
    if (mainTab === 'stats' && !statsData) loadStats()
  }, [mainTab])

  const selectedTourn = tournaments.find(t => t.id === form.tournament_id)

  function openAddMatch() {
    setForm(emptyForm); setEditMatch(null); setDateChangeReason(''); setShowMatchModal(true)
  }

  function openEdit(m: any) {
    setEditMatch(m)
    setDateChangeReason('')
    setForm({
      opponent: m.opponent || '', match_date: m.match_date?.slice(0, 16) || '',
      map_url: m.map_url || '', location: m.location || '',
      home_away: m.home_away || 'home', status: m.status || 'upcoming',
      tournament_id: m.tournament_id || '',
      round_number: m.round_number || '',
      stage: m.stage || '',
      leg: m.leg || 'none',
      notes: m.notes || ''
    })
    setShowMatchModal(true)
  }

  async function saveMatch() {
    if (!form.opponent.trim() || !form.match_date || !teamId || !user) return
    setSaving(true)
    let matchType = 'friendly'
    if (form.tournament_id) {
      const tourn = tournaments.find(t => t.id === form.tournament_id)
      if (tourn?.system === 'league') matchType = 'league'
      else if (tourn?.system === 'groups') matchType = 'other'
      else matchType = 'cup'
    }
    let notesVal = form.notes || ''
    if (editMatch && form.match_date !== editMatch.match_date?.slice(0, 16) && dateChangeReason.trim()) {
      const stamp = new Date().toLocaleDateString('ar-SA')
      notesVal = (notesVal ? notesVal + '\n' : '') + `📅 تعديل الموعد (${stamp}): ${dateChangeReason.trim()}`
    }
    const payload: any = {
      team_id: teamId,
      opponent: form.opponent,
      match_date: form.match_date,
      map_url: form.map_url || '',
      location: form.location || '',
      match_type: matchType,
      home_away: form.home_away,
      status: form.status,
      tournament_id: form.tournament_id || null,
      leg: form.leg || 'none',
      notes: notesVal
    }
    if (form.tournament_id && form.round_number) payload.round_number = parseInt(form.round_number)
    if (form.tournament_id && form.stage) payload.stage = form.stage
    try {
      if (editMatch) {
        await matchService.update(editMatch.id, payload)
      } else {
        const { error } = await matchService.create(payload, user.id)
        if (error) throw error
      }
      await load()
      if (mainTab === 'stats') { setStatsData(null); loadStats() }
      setShowMatchModal(false); setEditMatch(null); setForm(emptyForm)
    } finally {
      setSaving(false)
    }
  }

  function generateSeasonMatches() {
    const n = parseInt(genTeamCount)
    if (!n || n < 2) return
    const roundsPerLeg = n - 1
    const totalRounds = roundsPerLeg * parseInt(genLegs)
    const rows = Array.from({ length: totalRounds }, (_, i) => ({
      round_number: i + 1,
      leg: parseInt(genLegs) === 2 && i >= roundsPerLeg ? 'away' : 'home',
      opponent: '',
      match_date: '',
      home_away: parseInt(genLegs) === 2 && i >= roundsPerLeg ? 'away' : 'home',
    }))
    setGenMatches(rows)
  }

  function updateGenRow(idx: number, field: string, value: string) {
    setGenMatches(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function bulkCreateSeasonMatches() {
    if (!teamId || !user) return
    const valid = genMatches.filter(r => r.opponent.trim())
    if (valid.length === 0) return
    setBulkSaving(true)
    try {
      for (const row of valid) {
        const payload: any = {
          team_id: teamId,
          opponent: row.opponent,
          match_date: row.match_date || new Date().toISOString().slice(0, 16),
          location: '',
          match_type: 'league',
          home_away: row.home_away,
          status: 'upcoming',
          tournament_id: form.tournament_id,
          leg: row.leg,
          round_number: row.round_number,
          notes: ''
        }
        await matchService.create(payload, user.id)
      }
      await load()
      setShowSeasonGen(false)
      setShowMatchModal(false)
      setGenMatches([])
      setGenTeamCount('')
    } finally {
      setBulkSaving(false)
    }
  }

  async function saveTournament() {
    if (!tournForm.name.trim() || !teamId || !user) return
    setSaving(true)
    await tournamentService.create({ ...tournForm, team_id: teamId, created_by: user.id })
    await load(); setShowTournAdd(false); setTournForm(emptyTournForm); setSaving(false)
  }

  const canManage = canManageEvents(myRole)

  // Match list filter (affects tab listing only)
  let filt = matches.filter(m => !filterTourn || m.tournament_id === filterTourn)
  if (filterFrom) filt = filt.filter(m => m.match_date >= filterFrom)
  if (filterTo) filt = filt.filter(m => m.match_date <= filterTo + 'T23:59')

  const upcoming = filt.filter(m => m.status === 'upcoming' || m.status === 'live')
  const finished = filt.filter(m => m.status === 'finished' || m.status === 'cancelled')
  const list = matchTab === 'upcoming' ? upcoming : finished

  // Header card filter (independent from match list filter)
  const uniqueSeasons: string[] = Array.from(new Set(tournaments.map((t: any) => t.season).filter(Boolean))).sort().reverse()
  const dateChanged = !!editMatch && !!form.match_date && form.match_date !== editMatch.match_date?.slice(0, 16)
  let headerFilt = [...matches]
  if (headerFilterMode === 'season' && headerSeasonFilter) {
    const tIds = new Set(tournaments.filter((t: any) => t.season === headerSeasonFilter).map((t: any) => t.id))
    headerFilt = headerFilt.filter((m: any) => m.tournament_id && tIds.has(m.tournament_id))
  } else if (headerFilterMode === 'date') {
    if (headerDateFrom) headerFilt = headerFilt.filter((m: any) => m.match_date >= headerDateFrom)
    if (headerDateTo) headerFilt = headerFilt.filter((m: any) => m.match_date <= headerDateTo + 'T23:59')
  }

  const played = headerFilt.filter(m => m.status === 'finished' && m.goals_for !== null)
  const wins = played.filter(m => m.goals_for > m.goals_against).length
  const draws = played.filter(m => m.goals_for === m.goals_against).length
  const losses = played.filter(m => m.goals_for < m.goals_against).length
  const remaining = headerFilt.filter(m => m.status === 'upcoming').length
  const cleanSheets = played.filter(m => m.goals_against === 0).length
  const goalsFor = played.reduce((s, m) => s + (m.goals_for || 0), 0)
  const goalsAgainst = played.reduce((s, m) => s + (m.goals_against || 0), 0)
  const goalsDiff = goalsFor - goalsAgainst
  const headerMatchIds = new Set(headerFilt.map((m: any) => m.id))
  const totalYellow = statsData
    ? statsData.events.filter((e: any) => e.event_type === 'yellow_card' && headerMatchIds.has(e.match_id)).length
    : headerFilt.reduce((s, m) => s + (m.yellow_cards?.length || 0), 0)
  const totalRed = statsData
    ? statsData.events.filter((e: any) => e.event_type === 'red_card' && headerMatchIds.has(e.match_id)).length
    : headerFilt.reduce((s, m) => s + (m.red_cards?.length || 0), 0)

  const playerStats = useMemo(() => {
    if (!statsData) return []
    let filtMatches = statsData.matches
    if (statsTournFilter === '__friendly__') {
      filtMatches = filtMatches.filter((m: any) => !m.tournament_id)
    } else if (statsTournFilter) {
      filtMatches = filtMatches.filter((m: any) => m.tournament_id === statsTournFilter)
    }
    if (statsFrom) filtMatches = filtMatches.filter((m: any) => m.match_date >= statsFrom)
    if (statsTo) filtMatches = filtMatches.filter((m: any) => m.match_date <= statsTo + 'T23:59')
    const filtMatchIds = new Set(filtMatches.map((m: any) => m.id))
    const filtLineups = statsData.lineups.filter((l: any) => filtMatchIds.has(l.match_id))
    const filtEvents = statsData.events.filter((e: any) => filtMatchIds.has(e.match_id))

    const playerMap: Record<string, any> = {}
    const ensure = (uid: string) => {
      if (!playerMap[uid]) {
        const member = members.find(m => m.user_id === uid)
        const name = member?.profile?.full_name || 'لاعب'
        playerMap[uid] = { id: uid, name, matches: 0, starter: 0, sub: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, cleanSheets: 0 }
      }
      return playerMap[uid]
    }

    for (const lineup of filtLineups) {
      const players: any[] = lineup.players || []
      const matchEvts = filtEvents.filter((e: any) => e.match_id === lineup.match_id)
      const subOuts = new Set(matchEvts.filter((e: any) => e.event_type === 'substitution').map((e: any) => e.player_out_id))
      const subIns = matchEvts.filter((e: any) => e.event_type === 'substitution')
      for (const p of players) {
        if (!p.user_id || p.role === 'excluded') continue
        const ps = ensure(p.user_id)
        ps.matches++
        if (p.role === 'starter') {
          ps.starter++
          if (subOuts.has(p.user_id)) {
            const subEvt = subIns.find((e: any) => e.player_out_id === p.user_id)
            ps.minutes += subEvt?.minute || 90
          } else {
            ps.minutes += 90
          }
        } else if (p.role === 'sub') {
          ps.sub++
          const subEvt = subIns.find((e: any) => e.player_id === p.user_id)
          ps.minutes += subEvt ? (90 - (subEvt.minute || 0)) : 0
        }
      }
    }
    for (const evt of filtEvents) {
      if (evt.event_type === 'goal' && evt.player_id) ensure(evt.player_id).goals++
      else if (evt.event_type === 'assist' && evt.player_id) ensure(evt.player_id).assists++
      else if (evt.event_type === 'yellow_card' && evt.player_id) ensure(evt.player_id).yellow++
      else if (evt.event_type === 'red_card' && evt.player_id) ensure(evt.player_id).red++
      else if (evt.event_type === 'clean_sheet' && evt.player_id) ensure(evt.player_id).cleanSheets++
    }
    return Object.values(playerMap)
  }, [statsData, statsTournFilter, statsFrom, statsTo, members])

  const sortedStats = useMemo(() => {
    return [...playerStats].sort((a, b) => {
      if (sortKey === 'name') {
        const cmp = (a.name as string).localeCompare(b.name as string)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const av = (a[sortKey] as number) || 0
      const bv = (b[sortKey] as number) || 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [playerStats, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'desc' ? <ChevronDown size={11} className="inline" /> : <ChevronUp size={11} className="inline" />)
    : null

  const getResult = (m: any) => {
    if (m.goals_for === null || m.goals_against === null) return null
    if (m.goals_for > m.goals_against) return { label: 'فوز', cls: 'bg-emerald-100 text-emerald-700' }
    if (m.goals_for === m.goals_against) return { label: 'تعادل', cls: 'bg-amber-100 text-amber-700' }
    return { label: 'خسارة', cls: 'bg-red-100 text-red-700' }
  }

  const statCols: [SortKey, string][] = [
    ['name', 'اللاعب'], ['matches', 'م'], ['starter', 'أساسي'], ['sub', 'بديل'],
    ['minutes', '⏱'], ['goals', '⚽'],
    ['assists', '👟'], ['yellow', '🟡'], ['red', '🔴'], ['cleanSheets', '🥅']
  ]

  return (
    <div>
      {deleteError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
          <span>❌ {deleteError}</span>
          <button className="text-red-400 hover:text-red-600 ml-2" onClick={() => setDeleteError('')}>✕</button>
        </div>
      )}
      <PageHeader
        title="المباريات"
        action={canManage && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTournAdd(true)}>
              <Trophy size={13} /> بطولة جديدة
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAddMatch}>
              <Plus size={13} /> إضافة مباراة
            </button>
          </div>
        )}
      />

      {/* Stats card */}
      <div className="card mb-4 bg-gradient-to-l from-slate-800 to-slate-950 text-white">
        {teamSeason && (
          <div className="text-xs opacity-60 text-center mb-3 font-medium tracking-wide">
            الموسم الرياضي {teamSeason}
          </div>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-3">
          {([
            ['لعب', played.length, ''],
            ['تبقى', remaining, 'text-blue-300'],
            ['فوز', wins, 'text-emerald-400'],
            ['تعادل', draws, 'text-amber-400'],
            ['خسارة', losses, 'text-red-400'],
            ['بطولات', tournaments.length, 'text-purple-300'],
          ] as [string, number, string][]).map(([l, v, c]) => (
            <div key={l}>
              <div className={`text-xl font-bold ${c}`}>{v}</div>
              <div className="text-xs opacity-50">{l}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-2 mt-1 grid grid-cols-3 gap-2 text-center text-xs">
          <div><span className="text-yellow-300 font-bold">{totalYellow}</span> <span className="opacity-50">🟡 صفراء</span></div>
          <div><span className="text-red-400 font-bold">{totalRed}</span> <span className="opacity-50">🔴 حمراء</span></div>
          <div><span className="text-emerald-300 font-bold">{cleanSheets}</span> <span className="opacity-50">🥅 شباك نظيفة</span></div>
        </div>
        <div className="border-t border-white/10 pt-2 mt-1 grid grid-cols-3 gap-2 text-center text-xs">
          <div><span className="text-emerald-300 font-bold">{goalsFor}</span> <span className="opacity-50">⚽ له</span></div>
          <div><span className="text-red-400 font-bold">{goalsAgainst}</span> <span className="opacity-50">⚽ عليه</span></div>
          <div><span className={`font-bold ${goalsDiff > 0 ? 'text-emerald-300' : goalsDiff < 0 ? 'text-red-400' : 'text-white opacity-70'}`}>{goalsDiff > 0 ? `+${goalsDiff}` : goalsDiff}</span> <span className="opacity-50">+/-</span></div>
        </div>
        {/* Header card filter */}
        <div className="border-t border-white/10 pt-2 mt-2">
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="text-xs opacity-30 ml-1">فلتر:</span>
            {(['none', 'season', 'date'] as const).map(mode => (
              <button key={mode}
                onClick={() => { setHeaderFilterMode(mode); setHeaderSeasonFilter(''); setHeaderDateFrom(''); setHeaderDateTo('') }}
                className={`text-xs px-2.5 py-0.5 rounded-full transition-all ${headerFilterMode === mode ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/60'}`}
              >{mode === 'none' ? 'الكل' : mode === 'season' ? 'موسم' : 'تاريخ'}</button>
            ))}
          </div>
          {headerFilterMode === 'season' && (
            <select
              value={headerSeasonFilter}
              onChange={e => setHeaderSeasonFilter(e.target.value)}
              className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
            >
              <option value="" style={{ color: '#1e293b' }}>— اختر الموسم —</option>
              {uniqueSeasons.map(s => <option key={s} value={s} style={{ color: '#1e293b' }}>{s}</option>)}
            </select>
          )}
          {headerFilterMode === 'date' && (
            <div className="flex gap-2 items-center">
              <input type="date" className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                value={headerDateFrom} onChange={e => setHeaderDateFrom(e.target.value)} />
              <span className="text-white/30 text-xs">←</span>
              <input type="date" className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                value={headerDateTo} onChange={e => setHeaderDateTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'matches', label: 'المباريات' },
          { key: 'tournaments', label: `البطولات (${tournaments.length})` },
          { key: 'stats', label: 'إحصائيات اللاعبين' }
        ]}
        active={mainTab}
        onChange={setMainTab}
      />

      {/* ── MATCHES TAB ── */}
      {mainTab === 'matches' && (<>
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-2">
          <Filter size={14} className="text-slate-400 flex-shrink-0" />
          <select className="form-input text-xs flex-1 min-w-0" style={{ maxWidth: 170 }} value={filterTourn} onChange={e => setFilterTourn(e.target.value)}>
            <option value="">كل البطولات</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="date" className="form-input text-xs" style={{ maxWidth: 145 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          <input type="date" className="form-input text-xs" style={{ maxWidth: 145 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          {(filterTourn || filterFrom || filterTo) && (
            <button onClick={() => { setFilterTourn(''); setFilterFrom(''); setFilterTo('') }} className="text-xs text-red-500 hover:underline flex items-center gap-0.5">
              <X size={12} /> مسح
            </button>
          )}
        </div>

        <Tabs
          tabs={[
            { key: 'upcoming', label: `القادمة (${upcoming.length})` },
            { key: 'finished', label: `المنتهية (${finished.length})` }
          ]}
          active={matchTab}
          onChange={setMatchTab}
        />

        {loading
          ? <div className="flex justify-center py-10"><Spinner /></div>
          : list.length === 0
            ? <div className="card"><EmptyState icon={<Trophy size={24} />}
                title={matchTab === 'upcoming' ? 'لا توجد مباريات قادمة' : 'لا توجد مباريات منتهية'}
                action={canManage && matchTab === 'upcoming' && (
                  <button className="btn btn-primary btn-sm mt-2" onClick={openAddMatch}><Plus size={13} />إضافة مباراة</button>
                )} /></div>
            : <div className="space-y-2">
              {list.map(m => {
                const result = getResult(m)
                const tourney = tournaments.find(t => t.id === m.tournament_id)
                return (
                  <div key={m.id}
                    className="card mb-0 cursor-pointer hover:shadow-md transition-all"
                    onClick={() => navigate(`/team/${teamId}/matches/${m.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${result?.label === 'فوز' ? 'bg-emerald-50' : result?.label === 'خسارة' ? 'bg-red-50' : result?.label === 'تعادل' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        {m.goals_for !== null && m.goals_against !== null
                          ? <><span className="text-xl font-bold">{m.goals_for}-{m.goals_against}</span>{result && <span className={`text-xs font-bold px-1.5 rounded-full ${result.cls}`}>{result.label}</span>}</>
                          : <span className="text-3xl">⚽</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">
                          {m.home_away === 'home' ? `فريقنا ضد ${m.opponent}` : `${m.opponent} ضد فريقنا`}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />{formatDate(m.match_date)} · {m.match_date?.slice(11, 16)}
                        </div>
                        {m.location && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <MapPin size={11} />{m.location}
                          </div>
                        )}
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <span className={`badge ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                          {tourney
                            ? <span className="badge badge-purple">{tourney.name}</span>
                            : <span className="badge badge-gray">ودية</span>}
                          <span className="badge badge-gray">{HOME_AWAY[m.home_away]}</span>
                          {m.leg && m.leg !== 'none' && <span className="badge badge-gray">{LEG_LABEL[m.leg]}</span>}
                          {m.round_number && <span className="badge badge-gray">الجولة {m.round_number}</span>}
                          {m.stage && <span className="badge badge-gray">{m.stage}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        {canManage && (
                          <>
                            <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                              onClick={e => { e.stopPropagation(); openEdit(m) }}>
                              <Edit2 size={13} />
                            </button>
                            <button className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              onClick={e => { e.stopPropagation(); setConfirmDelete(m) }}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                        <ChevronRight size={16} className="text-slate-300" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>}
      </>)}

      {/* ── TOURNAMENTS TAB ── */}
      {mainTab === 'tournaments' && (<>
        {canManage && (
          <div className="flex justify-end mb-3 mt-2">
            <button className="btn btn-primary btn-sm" onClick={() => setShowTournAdd(true)}><Plus size={13} />بطولة جديدة</button>
          </div>
        )}
        {tournaments.length === 0
          ? <div className="card"><EmptyState icon={<Trophy size={24} />} title="لا توجد بطولات" description="أضف بطولة ثم خصص لها المباريات" /></div>
          : <div className="space-y-3">
            {tournaments.map(t => {
              const tMatches = matches.filter(m => m.tournament_id === t.id)
              const tPlayed = tMatches.filter(m => m.status === 'finished' && m.goals_for !== null)
              const tWins = tPlayed.filter(m => m.goals_for > m.goals_against).length
              const tDraws = tPlayed.filter(m => m.goals_for === m.goals_against).length
              const tLosses = tPlayed.filter(m => m.goals_for < m.goals_against).length
              return (
                <div key={t.id} className="card mb-0">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">🏆</span>
                    <div className="flex-1">
                      <div className="font-bold">{t.name}</div>
                      {t.season && <div className="text-xs text-slate-400">الموسم: {t.season}</div>}
                      {t.system && <div className="text-xs text-slate-400">النظام: {SYSTEM_LABEL[t.system] || t.system}</div>}
                      {t.description && <div className="text-xs text-slate-500 mt-1">{t.description}</div>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="badge badge-gray">{tMatches.length} مباراة</span>
                        <span className="badge badge-green">{tWins} فوز</span>
                        {tDraws > 0 && <span className="badge bg-amber-100 text-amber-700">{tDraws} تعادل</span>}
                        {tLosses > 0 && <span className="badge bg-red-100 text-red-700">{tLosses} خسارة</span>}
                        <span className={`badge ${t.status === 'active' ? 'badge-blue' : 'badge-gray'}`}>{t.status === 'active' ? 'جارية' : 'منتهية'}</span>
                      </div>
                    </div>
                    <button onClick={() => { setFilterTourn(t.id); setMainTab('matches') }} className="btn btn-ghost btn-sm text-xs">
                      عرض المباريات
                    </button>
                  </div>
                </div>
              )
            })}
          </div>}
      </>)}

      {/* ── PLAYER STATS TAB ── */}
      {mainTab === 'stats' && (<>
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-2">
          <Filter size={14} className="text-slate-400 flex-shrink-0" />
          <select className="form-input text-xs" style={{ maxWidth: 170 }} value={statsTournFilter} onChange={e => setStatsTournFilter(e.target.value)}>
            <option value="">كل المباريات</option>
            <option value="__friendly__">ودية فقط</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="date" className="form-input text-xs" style={{ maxWidth: 145 }} value={statsFrom} onChange={e => setStatsFrom(e.target.value)} />
          <input type="date" className="form-input text-xs" style={{ maxWidth: 145 }} value={statsTo} onChange={e => setStatsTo(e.target.value)} />
          {(statsTournFilter || statsFrom || statsTo) && (
            <button onClick={() => { setStatsTournFilter(''); setStatsFrom(''); setStatsTo('') }} className="text-xs text-red-500 hover:underline flex items-center gap-0.5">
              <X size={12} /> مسح
            </button>
          )}
        </div>

        {!statsData
          ? <div className="flex justify-center py-10"><Spinner /></div>
          : sortedStats.length === 0
            ? <div className="card"><EmptyState icon={<Trophy size={24} />} title="لا توجد إحصائيات" description="أضف تشكيلات وأحداث للمباريات لرؤية الإحصائيات" /></div>
            : <div className="card p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {statCols.map(([k, l]) => (
                      <th
                        key={k}
                        className="px-2 py-2.5 text-center font-semibold text-slate-500 cursor-pointer hover:text-slate-700 whitespace-nowrap select-none"
                        onClick={() => toggleSort(k)}
                      >
                        {l} <SortIcon k={k} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((p, i) => (
                    <tr key={p.id} className={`border-b border-slate-50 ${i % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-blue-50/30 transition-colors`}>
                      <td className="px-2 py-2 font-medium text-right whitespace-nowrap">{p.name}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{p.matches}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{p.starter}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{p.sub}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{p.minutes}</td>
                      <td className="px-2 py-2 text-center font-bold text-emerald-600">{p.goals ?? 0}</td>
                      <td className="px-2 py-2 text-center text-blue-600">{p.assists ?? 0}</td>
                      <td className="px-2 py-2 text-center text-yellow-600">{p.yellow ?? 0}</td>
                      <td className="px-2 py-2 text-center text-red-600">{p.red ?? 0}</td>
                      <td className="px-2 py-2 text-center text-emerald-500">{p.cleanSheets ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </>)}

      {/* Add/Edit Match Modal */}
      <Modal
        open={showMatchModal}
        onClose={() => { setShowMatchModal(false); setEditMatch(null) }}
        title={editMatch ? 'تعديل المباراة' : 'إضافة مباراة'}
        width="max-w-lg"
      >
        <div>
          <FormField label="اسم الخصم" required>
            <input className="form-input" value={form.opponent} onChange={e => set('opponent', e.target.value)} placeholder="نادي الهلال" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="التاريخ والوقت" required>
              <input className="form-input" type="datetime-local" value={form.match_date} onChange={e => set('match_date', e.target.value)} />
            </FormField>
            <FormField label="المكان">
              <input className="form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="اسم الملعب" />
            </FormField>
          </div>
          {dateChanged && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              <div className="text-xs text-amber-700 font-medium mb-1">📅 تغير التاريخ / الوقت — اذكر السبب</div>
              <input
                className="form-input text-xs"
                value={dateChangeReason}
                onChange={e => setDateChangeReason(e.target.value)}
                placeholder="سبب تغيير الموعد (سيُسجَّل في الملاحظات)"
              />
            </div>
          )}

          <FormField label="رابط Google Maps">
            <input className="form-input" value={form.map_url} onChange={e => set('map_url', e.target.value)} placeholder="https://maps.google.com/..." />
          </FormField>

          {/* Tournament / Friendly selector (replaces match_type) */}
          <FormField label="البطولة / النوع">
            <select className="form-input" value={form.tournament_id} onChange={e => { set('tournament_id', e.target.value); set('round_number', ''); set('stage', '') }}>
              <option value="">ودية</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.system ? ` — ${SYSTEM_LABEL[t.system]}` : ''}
                </option>
              ))}
            </select>
          </FormField>

          {/* Conditional fields based on tournament system */}
          {form.tournament_id && selectedTourn?.system === 'league' && (
            <>
              <FormField label="رقم الجولة">
                <select className="form-input" value={form.round_number} onChange={e => set('round_number', e.target.value)}>
                  <option value="">— اختر —</option>
                  {Array.from({ length: 34 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>الجولة {n}</option>
                  ))}
                </select>
              </FormField>
              {!editMatch && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-full mb-2 border border-dashed border-slate-300 text-slate-600"
                  onClick={() => { setShowMatchModal(false); setShowSeasonGen(true) }}
                >
                  🗓 مباريات الموسم — إضافة سريعة لجميع الجولات
                </button>
              )}
            </>
          )}
          {form.tournament_id && (selectedTourn?.system === 'groups' || selectedTourn?.system === 'cup') && (
            <FormField label="المرحلة">
              <input className="form-input" value={form.stage} onChange={e => set('stage', e.target.value)} placeholder="دور الـ 16 / المجموعة أ ..." />
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="ذهاب / إياب">
              <select className="form-input text-xs" value={form.leg} onChange={e => set('leg', e.target.value)}>
                <option value="none">بدون</option>
                <option value="home">ذهاب</option>
                <option value="away">إياب</option>
              </select>
            </FormField>
            <FormField label="الأرض">
              <select className="form-input text-xs" value={form.home_away} onChange={e => set('home_away', e.target.value)}>
                {Object.entries(HOME_AWAY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="الحالة">
            <select className="form-input text-xs" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="upcoming">قادمة</option>
              <option value="live">مباشرة</option>
              <option value="finished">منتهية</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </FormField>

          <FormField label="ملاحظات">
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </FormField>

          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={() => { setShowMatchModal(false); setEditMatch(null) }}>إلغاء</button>
            <button className="btn btn-primary" onClick={saveMatch} disabled={saving}>
              {saving ? <Spinner size="sm" /> : editMatch ? 'حفظ' : 'إضافة'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Tournament Modal */}
      <Modal open={showTournAdd} onClose={() => setShowTournAdd(false)} title="إضافة بطولة جديدة">
        <FormField label="اسم البطولة" required>
          <input className="form-input" value={tournForm.name} onChange={e => setTourn('name', e.target.value)} placeholder="دوري الشباب 2025" />
        </FormField>
        <FormField label="نظام البطولة" required>
          <select className="form-input" value={tournForm.system} onChange={e => setTourn('system', e.target.value)}>
            <option value="league">دوري</option>
            <option value="groups">مجموعات</option>
            <option value="cup">كأس / إقصائي</option>
          </select>
        </FormField>
        <FormField label="الموسم">
          <select className="form-input" value={tournForm.season} onChange={e => setTourn('season', e.target.value)}>
            <option value="">— اختر الموسم —</option>
            {Array.from({ length: 22 }, (_, i) => {
              const y = 2027 - i
              return `${y}/${y + 1}`
            }).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="وصف اختياري">
          <textarea className="form-input" rows={2} value={tournForm.description} onChange={e => setTourn('description', e.target.value)} />
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowTournAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveTournament} disabled={saving}>
            {saving ? <Spinner size="sm" /> : 'إنشاء البطولة'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف المباراة"
        danger
        message={`هل تريد حذف مباراة "${confirmDelete?.opponent}"؟ سيُحذف الموعد المرتبط بها أيضاً.`}
        onConfirm={async () => {
          setDeleteError('')
          try {
            await matchService.delete(confirmDelete.id)
            await load()
            setConfirmDelete(null)
          } catch (e: any) {
            setDeleteError(e?.message || 'فشل الحذف، حاول مرة أخرى')
            setConfirmDelete(null)
          }
        }}
        onCancel={() => { setConfirmDelete(null); setDeleteError('') }}
      />

      {/* Season Matches Generator Modal */}
      <Modal
        open={showSeasonGen}
        onClose={() => { setShowSeasonGen(false); setGenMatches([]); setShowMatchModal(true) }}
        title="مباريات الموسم — إضافة سريعة"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            البطولة: <strong>{selectedTourn?.name}</strong> — أدخل عدد الفرق وسيتم توليد جدول المباريات تلقائياً
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="عدد الفرق (شاملاً فريقنا)" required>
              <input
                className="form-input"
                type="number"
                min={2} max={24}
                value={genTeamCount}
                onChange={e => setGenTeamCount(e.target.value)}
                placeholder="10"
              />
            </FormField>
            <FormField label="نظام المباريات">
              <select className="form-input" value={genLegs} onChange={e => setGenLegs(e.target.value as '1' | '2')}>
                <option value="1">ذهاب فقط</option>
                <option value="2">ذهاب وإياب</option>
              </select>
            </FormField>
          </div>

          {genTeamCount && parseInt(genTeamCount) >= 2 && (
            <div className="text-xs text-slate-500">
              {parseInt(genTeamCount) - 1} جولة × {genLegs} {genLegs === '2' ? 'ذهاب وإياب' : 'ذهاب'} = <strong className="text-slate-700">{(parseInt(genTeamCount) - 1) * parseInt(genLegs)} مباراة</strong>
            </div>
          )}

          <button
            className="btn btn-ghost btn-sm w-full border border-dashed border-slate-300"
            onClick={generateSeasonMatches}
            disabled={!genTeamCount || parseInt(genTeamCount) < 2}
          >
            توليد قائمة المباريات
          </button>

          {genMatches.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-2 text-center w-12 font-semibold text-slate-500">الجولة</th>
                      <th className="px-2 py-2 text-center w-16 font-semibold text-slate-500">المرحلة</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-500">اسم الخصم *</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-500">التاريخ والوقت</th>
                      <th className="px-2 py-2 text-center w-28 font-semibold text-slate-500">الأرض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genMatches.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : ''}>
                        <td className="px-2 py-1.5 text-center font-medium text-slate-400">{row.round_number}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${row.leg === 'home' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {row.leg === 'home' ? 'ذهاب' : 'إياب'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="form-input text-xs py-1 w-full"
                            style={{ minWidth: 110 }}
                            value={row.opponent}
                            onChange={e => updateGenRow(idx, 'opponent', e.target.value)}
                            placeholder="اسم الفريق المنافس"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="datetime-local"
                            className="form-input text-xs py-1"
                            value={row.match_date}
                            onChange={e => updateGenRow(idx, 'match_date', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            className="form-input text-xs py-1"
                            value={row.home_away}
                            onChange={e => updateGenRow(idx, 'home_away', e.target.value)}
                          >
                            {Object.entries(HOME_AWAY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {genMatches.length > 0 && (() => {
            const filled = genMatches.filter(r => r.opponent.trim()).length
            const empty = genMatches.length - filled
            return (
              <div className={`text-xs rounded-lg px-3 py-2 ${empty > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {empty > 0 ? `${empty} صف بدون اسم خصم سيتم تجاهله — ` : ''}{filled > 0 ? `سيتم إنشاء ${filled} مباراة` : 'أدخل أسماء الخصوم للمتابعة'}
              </div>
            )
          })()}

          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost" onClick={() => { setShowSeasonGen(false); setGenMatches([]); setShowMatchModal(true) }}>رجوع</button>
            {genMatches.filter(r => r.opponent.trim()).length > 0 && (
              <button className="btn btn-primary" onClick={bulkCreateSeasonMatches} disabled={bulkSaving}>
                {bulkSaving ? <Spinner size="sm" /> : `إنشاء ${genMatches.filter(r => r.opponent.trim()).length} مباراة`}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
