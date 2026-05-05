import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Settings, Star, X, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { pointsService, teamService, levelService, streakService, badgeService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState, ProgressBar, CheckboxList } from '../../components/ui'
import { POINT_CATEGORIES, canManageTeam, ROLE_LABELS } from '../../utils/helpers'

// ── Constants ──────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  مكافأة: 'bg-emerald-100 text-emerald-700', تطور: 'bg-blue-100 text-blue-700',
  تعاون: 'bg-purple-100 text-purple-700', مبادرة: 'bg-amber-100 text-amber-700',
  أداء: 'bg-yellow-100 text-yellow-700', نتائج: 'bg-slate-100 text-slate-600',
}
const MEDALS = ['🥇', '🥈', '🥉']
const DEFAULT_AUTO = [
  { event_trigger: 'حضور التدريب', points: 5, is_active: true },
  { event_trigger: 'حضور المباراة', points: 10, is_active: true },
  { event_trigger: 'حضور الاجتماع', points: 3, is_active: true },
  { event_trigger: 'حضور المعسكر', points: 15, is_active: false },
]
const TRIGGER_LABELS: Record<string, string> = {
  total_points: '🏆 إجمالي النقاط',
  streak: '🔥 سلسلة متتالية',
  best_player_wins: '⭐ أفضل لاعب',
  monthly_star: '👑 نجم الشهر',
  match_count: '⚽ عدد المباريات',
  training_count: '🏃 عدد التدريبات',
}
const ICON_SETS = {
  'رياضية': ['⚽', '🏆', '🥇', '🥈', '🥉', '🎯', '🏅', '🎖️', '🛡️', '🏋️', '🤸', '🏃', '🧢', '👟', '🥊'],
  'قوة':    ['💪', '🔥', '⚡', '💫', '🌟', '⭐', '👑', '💥', '✨', '🎇', '🚀', '💯', '🔝', '🎯', '🏹'],
  'حيوانات':['🦁', '🐯', '🦅', '🦊', '🐺', '🐆', '🦈', '🦊', '🐻', '🦝', '🦬', '🐴', '🦏', '🦒', '🐘'],
  'إنجاز':  ['💎', '🔑', '🌙', '☀️', '🌊', '🏔️', '🎪', '🎗️', '🎁', '🏵️', '🎀', '🎊', '🎉', '🪄', '🔮'],
}

// ── Icon Picker ────────────────────────────────────────────────────────
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('رياضية')
  return (
    <div className="relative">
      <button type="button"
        onClick={() => setOpen(p => !p)}
        className="w-12 h-12 text-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center transition-all">
        {value || '⭐'}
      </button>
      {open && (
        <div className="absolute z-50 top-14 right-0 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 w-72">
          <div className="flex gap-1 mb-2 flex-wrap">
            {Object.keys(ICON_SETS).map(k => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${tab === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {k}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {(ICON_SETS as any)[tab].map((ic: string) => (
              <button key={ic} type="button"
                onClick={() => { onChange(ic); setOpen(false) }}
                className={`w-9 h-9 text-xl rounded-xl flex items-center justify-center transition-all hover:bg-brand-50 hover:scale-110 ${value === ic ? 'bg-brand-100 ring-2 ring-brand-400' : ''}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Level Badge ────────────────────────────────────────────────────────
function LevelBadge({ pts, levels }: { pts: number; levels: any[] }) {
  const lv = levelService.getPlayerLevel(pts, levels)
  if (!lv) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: lv.color + '22', color: lv.color, border: `1px solid ${lv.color}55` }}>
      {lv.icon} {lv.name}
    </span>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function PointsPage() {
  const { teamId } = useParams()
  const { user } = useAuth()

  const [history, setHistory]           = useState<any[]>([])
  const [comps, setComps]               = useState<any[]>([])
  const [autoSettings, setAutoSettings] = useState(DEFAULT_AUTO)
  const [members, setMembers]           = useState<any[]>([])
  const [myRole, setMyRole]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState('leaderboard')

  // New: levels, streaks, badges
  const [levels, setLevels]           = useState<any[]>([])
  const [streakRules, setStreakRules] = useState<any[]>([])
  const [teamStreaks, setTeamStreaks] = useState<any[]>([])
  const [badgeDefs, setBadgeDefs]     = useState<any[]>([])
  const [teamBadges, setTeamBadges]   = useState<any[]>([])

  // Modals
  const [showAdd, setShowAdd]         = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab]   = useState('auto')
  const [showComp, setShowComp]       = useState(false)

  // Add points form
  const [form, setForm] = useState({
    category: 'مكافأة' as any, reason: '', points: '', target: 'all', selectedMembers: [] as string[],
  })
  const [compForm, setCompForm] = useState({ name: '', from_date: '', to_date: '', prize: '' })
  const [saving, setSaving]           = useState(false)
  const [evaluating, setEvaluating]   = useState(false)
  const [evalDone, setEvalDone]       = useState(false)

  // Per-player modal
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [playerTxns, setPlayerTxns]         = useState<any[]>([])
  const [playerBadges, setPlayerBadges]     = useState<any[]>([])
  const [txnLoading, setTxnLoading]         = useState(false)
  const [filterFrom, setFilterFrom]         = useState('')
  const [filterTo, setFilterTo]             = useState('')

  // Leaderboard date range filter
  const [lbFrom, setLbFrom]           = useState('')
  const [lbTo, setLbTo]               = useState('')
  const [lbFiltered, setLbFiltered]   = useState<any[] | null>(null)
  const [lbLoading, setLbLoading]     = useState(false)

  // Settings edit states
  const [editLevel, setEditLevel]   = useState<any>(null)
  const [editBadge, setEditBadge]   = useState<any>(null)
  const [streakDraft, setStreakDraft] = useState<{ consecutive_count: number; bonus_points: number }[]>([])

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId) return
    setLoading(true)
    const [h, c, a, lv, sr, ts, bd, tb] = await Promise.all([
      pointsService.getHistory(teamId, 200),
      pointsService.getCompetitions(teamId),
      pointsService.getAutoSettings(teamId),
      levelService.getLevels(teamId),
      streakService.getRules(teamId),
      streakService.getTeamStreaks(teamId),
      badgeService.getDefinitions(teamId),
      badgeService.getTeamBadges(teamId),
    ])
    setHistory(h); setComps(c)
    if (a.length) setAutoSettings(a)
    setLevels(lv); setStreakRules(sr); setStreakDraft(sr)
    setTeamStreaks(ts); setBadgeDefs(bd); setTeamBadges(tb)
    setLoading(false)
  }

  // Build leaderboard — players only
  const lb = React.useMemo(() => {
    const totals: Record<string, { name: string; avatar: string | null; pts: number; userId: string }> = {}
    members.filter((m: any) => m.role === 'player').forEach((m: any) => {
      totals[m.user_id] = {
        name: m.profile?.full_name || '?',
        avatar: m.profile?.avatar_url || null,
        pts: 0, userId: m.user_id,
      }
    })
    history.forEach((t: any) => {
      if (totals[t.user_id]) totals[t.user_id].pts += t.points
    })
    return Object.values(totals).sort((a, b) => b.pts - a.pts)
  }, [members, history])

  async function openPlayer(p: any) {
    setSelectedPlayer(p)
    setFilterFrom(''); setFilterTo('')
    setPlayerTxns([]); setTxnLoading(true)
    if (!teamId) return
    const [txns, badges] = await Promise.all([
      pointsService.getPlayerTransactions(teamId, p.userId),
      badgeService.getPlayerBadges(teamId, p.userId),
    ])
    setPlayerTxns(txns); setPlayerBadges(badges); setTxnLoading(false)
  }

  async function applyFilter() {
    if (!teamId || !selectedPlayer) return
    setTxnLoading(true)
    const txns = await pointsService.getPlayerTransactions(teamId, selectedPlayer.userId, filterFrom || undefined, filterTo || undefined)
    setPlayerTxns(txns); setTxnLoading(false)
  }

  const filteredTotal = playerTxns.reduce((s, t) => s + t.points, 0)

  async function applyLbFilter() {
    if (!teamId || !lbFrom || !lbTo) return
    setLbLoading(true)
    const txns = await pointsService.getHistoryByRange(teamId, lbFrom, lbTo)
    const totals: Record<string, { name: string; avatar: string | null; pts: number; userId: string }> = {}
    members.filter((m: any) => m.role === 'player').forEach((m: any) => {
      totals[m.user_id] = { name: m.profile?.full_name || '?', avatar: m.profile?.avatar_url || null, pts: 0, userId: m.user_id }
    })
    txns.forEach((t: any) => {
      if (totals[t.user_id]) totals[t.user_id].pts += t.points
    })
    setLbFiltered(Object.values(totals).sort((a, b) => b.pts - a.pts))
    setLbLoading(false)
  }

  function resetLbFilter() {
    setLbFrom(''); setLbTo(''); setLbFiltered(null)
  }

  async function addPoints() {
    if (!form.reason.trim() || !form.points || !teamId || !user) return
    setSaving(true)
    const pts = parseInt(form.points)
    let targets: string[] = []
    if (form.target === 'all') targets = members.map(m => m.user_id)
    else if (form.target === 'players') targets = members.filter(m => m.role === 'player').map(m => m.user_id)
    else targets = form.selectedMembers
    await pointsService.addPoints(targets.map(uid => ({
      team_id: teamId, user_id: uid, points: pts,
      category: form.category, reason: form.reason, is_auto: false, created_by: user.id,
    })))
    await load(); setShowAdd(false)
    setForm({ category: 'مكافأة', reason: '', points: '', target: 'all', selectedMembers: [] })
    setSaving(false)
  }

  async function addComp() {
    if (!compForm.name || !teamId) return
    setSaving(true)
    await pointsService.createCompetition({ ...compForm, team_id: teamId, is_active: true })
    await load(); setShowComp(false); setCompForm({ name: '', from_date: '', to_date: '', prize: '' }); setSaving(false)
  }

  async function saveAutoSettings() {
    if (!teamId) return
    await pointsService.saveAutoSettings(autoSettings.map(s => ({ ...s, team_id: teamId })))
  }

  // ── Level CRUD ──
  async function saveLevel(lv: any) {
    if (!teamId) return
    await levelService.saveLevel({ ...lv, team_id: teamId })
    const updated = await levelService.getLevels(teamId)
    setLevels(updated); setEditLevel(null)
  }
  async function deleteLevel(id: string) {
    await levelService.deleteLevel(id)
    if (teamId) setLevels(await levelService.getLevels(teamId))
  }

  // ── Streak rules ──
  async function saveStreakRules() {
    if (!teamId) return
    await streakService.saveRules(teamId, streakDraft.filter(r => r.consecutive_count > 0 && r.bonus_points > 0))
    const updated = await streakService.getRules(teamId)
    setStreakRules(updated); setStreakDraft(updated)
  }

  // ── Badge CRUD ──
  async function saveBadge(bd: any) {
    if (!teamId) return
    await badgeService.saveDefinition({ ...bd, team_id: teamId })
    const updated = await badgeService.getDefinitions(teamId)
    setBadgeDefs(updated); setEditBadge(null)
  }
  async function deleteBadge(id: string) {
    await badgeService.deleteDefinition(id)
    if (teamId) setBadgeDefs(await badgeService.getDefinitions(teamId))
  }

  async function saveAllSettings() {
    await Promise.all([saveAutoSettings(), saveStreakRules()])
    setShowSettings(false)
  }

  const isAdmin = canManageTeam(myRole)
  const activeLb = lbFiltered ?? lb
  const maxPts  = activeLb[0]?.pts || 1
  const memberItems = members.map(m => ({ value: m.user_id, label: m.profile?.full_name || '?', sub: ROLE_LABELS[m.role] }))

  // Helper: get next level
  function getNextLevel(pts: number) {
    const sorted = [...levels].sort((a, b) => a.min_points - b.min_points)
    return sorted.find(l => l.min_points > pts) ?? null
  }

  return (
    <div>
      <PageHeader title="نظام النقاط والمكافآت"
        action={isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => { setSettingsTab('auto'); setShowSettings(true) }}>
              <Settings size={13} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={13} /> نقاط</button>
          </div>
        )} />

      {/* Tabs + compact date filter on one row */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex bg-white rounded-2xl border border-slate-100 p-1 gap-0.5">
          {[
            { key: 'leaderboard', label: '🏆 الترتيب' },
            { key: 'history',     label: '📋 السجل' },
            { key: 'competitions', label: '🎯 المسابقات' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                tab === t.key ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'leaderboard' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-400 flex-shrink-0">الفترة</span>
            <input type="date"
              className="border border-slate-200 rounded-lg text-xs py-1 px-1.5 bg-white w-[118px]"
              value={lbFrom} onChange={e => setLbFrom(e.target.value)}/>
            <span className="text-slate-400 text-xs flex-shrink-0">←</span>
            <input type="date"
              className="border border-slate-200 rounded-lg text-xs py-1 px-1.5 bg-white w-[118px]"
              value={lbTo} onChange={e => setLbTo(e.target.value)}/>
            <button onClick={applyLbFilter} disabled={!lbFrom || !lbTo || lbLoading}
              className="btn btn-primary btn-sm px-2.5 py-1 text-xs disabled:opacity-40 flex-shrink-0">
              {lbLoading ? <Spinner size="sm"/> : 'عرض'}
            </button>
            {lbFiltered && (
              <button onClick={resetLbFilter} className="btn btn-ghost btn-sm p-1 flex-shrink-0">
                <X size={12}/>
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <>
          {/* ── Leaderboard ── */}
          {tab === 'leaderboard' && (
            <>
              {lbLoading ? (
                <div className="flex justify-center py-8"><Spinner/></div>
              ) : activeLb.length === 0 ? (
                <div className="card"><EmptyState icon={<Star size={28} />} title="لا يوجد لاعبون بعد" /></div>
              ) : (
                <div className="space-y-2.5">
                  {activeLb.map((p, i) => {
                    const isTop    = i < 3
                    const topBg    = ['bg-yellow-50 border-yellow-200', 'bg-slate-50 border-slate-200', 'bg-orange-50 border-orange-200'][i] || ''
                    const ptColor  = ['text-yellow-600', 'text-slate-500', 'text-orange-500'][i] || 'text-amber-600'
                    const streak   = teamStreaks.find(s => s.user_id === p.userId)
                    const badgeCount = teamBadges.filter(b => b.user_id === p.userId).length
                    return (
                      <div key={p.userId} onClick={() => openPlayer(p)}
                        className={`card flex items-center gap-3 transition-all cursor-pointer active:scale-[0.98] ${isTop ? topBg : 'hover:bg-slate-50'}`}>
                        {/* Rank */}
                        <div className="text-2xl w-9 text-center flex-shrink-0 leading-none">
                          {i < 3 ? MEDALS[i] : <span className="text-sm font-bold text-slate-400">#{i + 1}</span>}
                        </div>
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-sm flex-shrink-0 overflow-hidden ${isTop ? 'bg-white shadow-sm' : 'bg-brand-100 text-brand-700'}`}>
                          {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover" alt="" /> : p.name[0]}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-sm text-slate-900 truncate">{p.name}</span>
                            {!lbFiltered && levels.length > 0 && <LevelBadge pts={p.pts} levels={levels} />}
                          </div>
                          {!lbFiltered && (
                            <div className="flex items-center gap-2 mt-1">
                              {streak && streak.current_streak >= 2 && (
                                <span className="text-xs text-orange-500 font-bold flex items-center gap-0.5">
                                  🔥 {streak.current_streak}
                                </span>
                              )}
                              {badgeCount > 0 && (
                                <span className="text-xs text-amber-600 font-bold">🏅 {badgeCount}</span>
                              )}
                            </div>
                          )}
                          <div className="mt-1.5">
                            <ProgressBar value={maxPts > 0 ? Math.round(p.pts / maxPts * 100) : 0}
                              color={isTop ? 'bg-yellow-400' : 'bg-brand-400'} height="h-2" />
                          </div>
                        </div>
                        {/* Points */}
                        <div className={`text-center px-3 py-2 rounded-2xl flex-shrink-0 ${isTop ? 'bg-white shadow-sm' : 'bg-slate-50'}`}>
                          <div className={`text-xl font-extrabold leading-none ${ptColor}`}>{p.pts}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">نقطة</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── History ── */}
          {tab === 'history' && (
            history.length === 0
              ? <div className="card"><EmptyState title="لا يوجد سجل" /></div>
              : <div className="card p-0 divide-y divide-slate-50">
                  {history.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`badge text-xs ${CAT_COLOR[h.category] || 'bg-slate-100 text-slate-600'}`}>{h.category}</span>
                          {h.is_auto && <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">تلقائي</span>}
                        </div>
                        <div className="font-bold text-xs">{h.profile?.full_name}</div>
                        <div className="text-xs text-slate-400">{h.reason}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-yellow-600">+{h.points}</div>
                        <div className="text-xs text-slate-400">{h.created_at?.slice(0, 10)}</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── Competitions ── */}
          {tab === 'competitions' && (
            <div>
              {isAdmin && (
                <div className="flex justify-end mb-3">
                  <button className="btn btn-primary btn-sm" onClick={() => setShowComp(true)}><Plus size={13} /> مسابقة</button>
                </div>
              )}
              {comps.length === 0
                ? <div className="card"><EmptyState icon={<Star size={24} />} title="لا توجد مسابقات" /></div>
                : <div className="space-y-3">
                    {comps.map((c: any) => (
                      <div key={c.id} className="card">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">🎯</span>
                          <div className="flex-1">
                            <div className="font-bold text-sm">{c.name}</div>
                            <div className="text-xs text-slate-400">{c.from_date} ← {c.to_date}</div>
                          </div>
                          <span className={`badge ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {c.is_active ? 'جارية' : 'منتهية'}
                          </span>
                        </div>
                        <div className="bg-yellow-50 text-yellow-700 text-xs px-3 py-2 rounded-xl">🏆 الجائزة: {c.prize}</div>
                        {c.winner && <div className="text-xs text-emerald-600 mt-2">👑 الفائز: {c.winner.full_name}</div>}
                      </div>
                    ))}
                  </div>}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          Per-Player Modal
      ══════════════════════════════════════════════ */}
      {selectedPlayer && (() => {
        const streak    = teamStreaks.find(s => s.user_id === selectedPlayer.userId)
        const curLevel  = levelService.getPlayerLevel(selectedPlayer.pts, levels)
        const nextLevel = getNextLevel(selectedPlayer.pts)
        const pctToNext = nextLevel
          ? Math.min(100, Math.round(
              ((selectedPlayer.pts - (curLevel?.min_points ?? 0)) /
               (nextLevel.min_points - (curLevel?.min_points ?? 0))) * 100))
          : 100
        return (
          <Modal open={!!selectedPlayer} onClose={() => setSelectedPlayer(null)}
            title={`كشف حساب · ${selectedPlayer.name}`}>

            {/* Level + streak hero row */}
            {(curLevel || streak) && (
              <div className="flex gap-3 mb-4">
                {curLevel && (
                  <div className="flex-1 rounded-2xl p-3 flex items-center gap-3"
                    style={{ background: curLevel.color + '15', border: `1.5px solid ${curLevel.color}44` }}>
                    <span className="text-3xl">{curLevel.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm" style={{ color: curLevel.color }}>{curLevel.name}</div>
                      {nextLevel ? (
                        <>
                          <div className="text-[11px] text-slate-400 mb-1">
                            {nextLevel.min_points - selectedPlayer.pts} نقطة للمستوى التالي
                          </div>
                          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pctToNext}%`, background: curLevel.color }} />
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] font-bold" style={{ color: curLevel.color }}>✨ أعلى مستوى</div>
                      )}
                    </div>
                  </div>
                )}
                {streak && streak.current_streak > 0 && (
                  <div className="rounded-2xl p-3 bg-orange-50 border border-orange-100 text-center min-w-[72px]">
                    <div className="text-2xl">🔥</div>
                    <div className="font-extrabold text-orange-500 text-lg leading-none">{streak.current_streak}</div>
                    <div className="text-[10px] text-orange-400 font-bold">سلسلة</div>
                    {streak.longest_streak > streak.current_streak && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        أطول: {streak.longest_streak}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Badges */}
            {playerBadges.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-slate-500 mb-2">الشارات المكتسبة</div>
                <div className="flex flex-wrap gap-2">
                  {playerBadges.map((pb: any) => (
                    <div key={pb.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold"
                      style={{
                        background: (pb.badge?.color || '#F59E0B') + '18',
                        border: `1px solid ${(pb.badge?.color || '#F59E0B')}44`,
                        color: pb.badge?.color || '#B45309',
                      }}
                      title={pb.badge?.description || ''}>
                      <span className="text-base">{pb.badge?.icon}</span>
                      {pb.badge?.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Date filter */}
            <div className="flex gap-2 items-end mb-3">
              <div className="flex-1">
                <label className="form-label text-xs">من</label>
                <input className="form-input" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="form-label text-xs">إلى</label>
                <input className="form-input" type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm mb-0.5 flex-shrink-0" onClick={applyFilter}>فلترة</button>
              {(filterFrom || filterTo) && (
                <button className="btn btn-ghost btn-sm mb-0.5 flex-shrink-0" onClick={() => {
                  setFilterFrom(''); setFilterTo('')
                  pointsService.getPlayerTransactions(teamId!, selectedPlayer.userId).then(setPlayerTxns)
                }}><X size={14} /></button>
              )}
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between bg-yellow-50 rounded-xl px-4 py-3 mb-3">
              <span className="text-sm text-slate-600">{filterFrom || filterTo ? 'إجمالي الفترة' : 'إجمالي النقاط'}</span>
              <span className="text-2xl font-extrabold text-yellow-600">{filteredTotal}</span>
            </div>

            {/* Transactions */}
            {txnLoading
              ? <div className="flex justify-center py-6"><Spinner /></div>
              : playerTxns.length === 0
                ? <EmptyState title="لا توجد معاملات" />
                : <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto rounded-xl border border-slate-100">
                    {playerTxns.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={`badge text-xs flex-shrink-0 ${CAT_COLOR[t.category] || 'bg-slate-100 text-slate-600'}`}>{t.category}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-700 truncate">{t.reason}</div>
                          <div className="text-[11px] text-slate-400">{t.created_at?.slice(0, 10)}</div>
                        </div>
                        <div className="text-base font-extrabold text-yellow-600 flex-shrink-0">+{t.points}</div>
                      </div>
                    ))}
                  </div>
            }
            <div className="flex justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => setSelectedPlayer(null)}>إغلاق</button>
            </div>
          </Modal>
        )
      })()}

      {/* ══════════════════════════════════════════════
          Add Points Modal
      ══════════════════════════════════════════════ */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="⭐ إضافة نقاط">
        <div className="form-group">
          <label className="form-label">القسم</label>
          <div className="flex flex-wrap gap-1.5">
            {POINT_CATEGORIES.map(c => (
              <button key={c} onClick={() => set('category', c)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.category === c ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <FormField label="المستفيدون">
          <div className="flex gap-2 mb-3">
            {[['all', 'الكل'], ['players', 'اللاعبون'], ['select', 'محددون']].map(([v, l]) => (
              <button key={v} onClick={() => set('target', v)}
                className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${form.target === v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {form.target === 'select' && (
            <CheckboxList items={memberItems} selected={form.selectedMembers} onChange={v => set('selectedMembers', v)} />
          )}
        </FormField>
        <FormField label="عدد النقاط" required>
          <input className="form-input" type="number" value={form.points} onChange={e => set('points', e.target.value)} placeholder="10" />
        </FormField>
        <FormField label="السبب" required>
          <input className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="أداء ممتاز في المباراة..." />
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addPoints} disabled={saving}>{saving ? <Spinner size="sm" /> : 'إضافة'}</button>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════
          Settings Modal (4 tabs)
      ══════════════════════════════════════════════ */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="⚙️ الإعدادات">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {[['auto', '🤖 تلقائي'], ['levels', '🏅 مستويات'], ['streaks', '🔥 سلاسل'], ['badges', '🎖️ شارات']].map(([k, l]) => (
            <button key={k} onClick={() => setSettingsTab(k)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${settingsTab === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Auto points */}
        {settingsTab === 'auto' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400 mb-3">تُضاف تلقائياً عند تسجيل الحضور</div>
            {autoSettings.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
                <input type="checkbox" checked={s.is_active}
                  onChange={e => { const a = [...autoSettings]; a[i] = { ...a[i], is_active: e.target.checked }; setAutoSettings(a) }}
                  className="w-4 h-4 accent-brand-500" />
                <span className="flex-1 text-sm">{s.event_trigger}</span>
                <input type="number" value={s.points}
                  onChange={e => { const a = [...autoSettings]; a[i] = { ...a[i], points: parseInt(e.target.value) || 0 }; setAutoSettings(a) }}
                  className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm" />
                <span className="text-xs text-slate-400">نقطة</span>
              </div>
            ))}
          </div>
        )}

        {/* Levels */}
        {settingsTab === 'levels' && (
          <div>
            <div className="text-xs text-slate-400 mb-3">حدد المستويات التي يصل إليها اللاعب حسب نقاطه</div>
            <div className="space-y-2 mb-3">
              {levels.length === 0 && <div className="text-center text-sm text-slate-400 py-4">لا توجد مستويات بعد</div>}
              {levels.map((lv: any) => (
                <div key={lv.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50">
                  <span className="text-2xl">{lv.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: lv.color }}>{lv.name}</div>
                    <div className="text-xs text-slate-400">من {lv.min_points} نقطة</div>
                  </div>
                  <button onClick={() => setEditLevel(lv)} className="btn btn-ghost btn-sm p-1.5 text-xs">تعديل</button>
                  <button onClick={() => deleteLevel(lv.id)} className="btn btn-ghost btn-sm p-1.5 text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setEditLevel({ icon: '⭐', name: '', min_points: 0, color: '#1D9E75' })}
              className="btn btn-ghost btn-sm w-full border border-dashed border-slate-200">
              <Plus size={13} /> إضافة مستوى
            </button>
          </div>
        )}

        {/* Streaks */}
        {settingsTab === 'streaks' && (
          <div>
            <div className="text-xs text-slate-400 mb-3">نقاط بونص عند تحقيق عدد تدريبات متتالية</div>
            <div className="space-y-2 mb-3">
              {streakDraft.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-orange-500 text-lg">🔥</span>
                  <input type="number" value={r.consecutive_count} placeholder="عدد التدريبات"
                    onChange={e => { const d = [...streakDraft]; d[i] = { ...d[i], consecutive_count: parseInt(e.target.value) || 0 }; setStreakDraft(d) }}
                    className="form-input w-24 text-center text-sm" />
                  <span className="text-xs text-slate-400 flex-shrink-0">متتالي →</span>
                  <input type="number" value={r.bonus_points} placeholder="نقاط"
                    onChange={e => { const d = [...streakDraft]; d[i] = { ...d[i], bonus_points: parseInt(e.target.value) || 0 }; setStreakDraft(d) }}
                    className="form-input w-24 text-center text-sm" />
                  <span className="text-xs text-slate-400 flex-shrink-0">نقطة</span>
                  <button onClick={() => setStreakDraft(streakDraft.filter((_, j) => j !== i))}
                    className="btn btn-ghost btn-sm p-1.5 text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
              {streakDraft.length === 0 && (
                <div className="text-center text-sm text-slate-400 py-3">لا توجد قواعد سلاسل بعد</div>
              )}
            </div>
            <button onClick={() => setStreakDraft(p => [...p, { consecutive_count: 0, bonus_points: 0 }])}
              className="btn btn-ghost btn-sm w-full border border-dashed border-slate-200">
              <Plus size={13} /> إضافة قاعدة
            </button>
          </div>
        )}

        {/* Badges */}
        {settingsTab === 'badges' && (
          <div>
            <div className="text-xs text-slate-400 mb-3">شارات تُمنح تلقائياً عند تحقيق الشرط</div>
            <div className="space-y-2 mb-3">
              {badgeDefs.length === 0 && <div className="text-center text-sm text-slate-400 py-4">لا توجد شارات بعد</div>}
              {badgeDefs.map((bd: any) => (
                <div key={bd.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50">
                  <span className="text-2xl">{bd.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: bd.color }}>{bd.name}</div>
                    <div className="text-xs text-slate-400">{TRIGGER_LABELS[bd.trigger_type]} · {bd.trigger_value}</div>
                  </div>
                  <button onClick={() => setEditBadge(bd)} className="btn btn-ghost btn-sm p-1.5 text-xs">تعديل</button>
                  <button onClick={() => deleteBadge(bd.id)} className="btn btn-ghost btn-sm p-1.5 text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditBadge({ icon: '🏅', name: '', description: '', trigger_type: 'total_points', trigger_value: 100, color: '#F59E0B' })}
              className="btn btn-ghost btn-sm w-full border border-dashed border-slate-200">
              <Plus size={13} /> إضافة شارة
            </button>

            {/* Retroactive evaluation */}
            {badgeDefs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400 mb-2">
                  اضغط الزر لتقييم جميع اللاعبين الحاليين ومنح الشارات التي يستحقونها بناءً على بياناتهم الموجودة
                </div>
                <button
                  disabled={evaluating || evalDone}
                  onClick={async () => {
                    if (!teamId) return
                    setEvaluating(true); setEvalDone(false)
                    await badgeService.evaluateAllPlayers(teamId)
                    const [tb] = await Promise.all([badgeService.getTeamBadges(teamId)])
                    setTeamBadges(tb)
                    setEvaluating(false); setEvalDone(true)
                    setTimeout(() => setEvalDone(false), 4000)
                  }}
                  className="btn btn-primary btn-sm w-full justify-center">
                  {evaluating
                    ? <><Spinner size="sm" /> جاري التقييم...</>
                    : evalDone
                      ? '✅ تم التقييم بنجاح'
                      : '🔍 تقييم وتوزيع الشارات الآن'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>إغلاق</button>
          {(settingsTab === 'auto' || settingsTab === 'streaks') && (
            <button className="btn btn-primary" onClick={saveAllSettings}>حفظ</button>
          )}
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════
          Edit Level Modal
      ══════════════════════════════════════════════ */}
      {editLevel && (
        <Modal open={!!editLevel} onClose={() => setEditLevel(null)} title={editLevel.id ? 'تعديل المستوى' : 'مستوى جديد'}>
          <div className="flex items-center gap-3 mb-4">
            <IconPicker value={editLevel.icon} onChange={v => setEditLevel((p: any) => ({ ...p, icon: v }))} />
            <div className="flex-1">
              <label className="form-label">اسم المستوى</label>
              <input className="form-input" value={editLevel.name}
                onChange={e => setEditLevel((p: any) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: نجم، أسطورة..." />
            </div>
          </div>
          <FormField label="الحد الأدنى من النقاط">
            <input className="form-input" type="number" value={editLevel.min_points}
              onChange={e => setEditLevel((p: any) => ({ ...p, min_points: parseInt(e.target.value) || 0 }))} />
          </FormField>
          <FormField label="اللون">
            <div className="flex items-center gap-3">
              <input type="color" value={editLevel.color}
                onChange={e => setEditLevel((p: any) => ({ ...p, color: e.target.value }))}
                className="w-10 h-10 rounded-xl border-none cursor-pointer" />
              <span className="text-sm font-bold" style={{ color: editLevel.color }}>
                {editLevel.icon} {editLevel.name || 'معاينة'}
              </span>
            </div>
          </FormField>
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={() => setEditLevel(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => saveLevel(editLevel)}
              disabled={!editLevel.name.trim()}>حفظ</button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════
          Edit Badge Modal
      ══════════════════════════════════════════════ */}
      {editBadge && (
        <Modal open={!!editBadge} onClose={() => setEditBadge(null)} title={editBadge.id ? 'تعديل الشارة' : 'شارة جديدة'}>
          <div className="flex items-center gap-3 mb-4">
            <IconPicker value={editBadge.icon} onChange={v => setEditBadge((p: any) => ({ ...p, icon: v }))} />
            <div className="flex-1">
              <label className="form-label">اسم الشارة</label>
              <input className="form-input" value={editBadge.name}
                onChange={e => setEditBadge((p: any) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: المداوم، المقاتل..." />
            </div>
          </div>
          <FormField label="الوصف">
            <input className="form-input" value={editBadge.description}
              onChange={e => setEditBadge((p: any) => ({ ...p, description: e.target.value }))}
              placeholder="وصف قصير يظهر عند التحويم" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="شرط المنح">
              <select className="form-input" value={editBadge.trigger_type}
                onChange={e => setEditBadge((p: any) => ({ ...p, trigger_type: e.target.value }))}>
                {Object.entries(TRIGGER_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </FormField>
            <FormField label="القيمة المطلوبة">
              <input className="form-input" type="number" value={editBadge.trigger_value}
                onChange={e => setEditBadge((p: any) => ({ ...p, trigger_value: parseInt(e.target.value) || 1 }))} />
            </FormField>
          </div>
          <FormField label="اللون">
            <div className="flex items-center gap-3">
              <input type="color" value={editBadge.color}
                onChange={e => setEditBadge((p: any) => ({ ...p, color: e.target.value }))}
                className="w-10 h-10 rounded-xl border-none cursor-pointer" />
              <span className="text-sm font-bold" style={{ color: editBadge.color }}>
                {editBadge.icon} {editBadge.name || 'معاينة'}
              </span>
            </div>
          </FormField>
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn btn-ghost" onClick={() => setEditBadge(null)}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => saveBadge(editBadge)}
              disabled={!editBadge.name.trim()}>حفظ</button>
          </div>
        </Modal>
      )}

      {/* Competition Modal */}
      <Modal open={showComp} onClose={() => setShowComp(false)} title="🎯 مسابقة جديدة">
        <FormField label="اسم المسابقة" required>
          <input className="form-input" value={compForm.name} onChange={e => setCompForm(p => ({ ...p, name: e.target.value }))} placeholder="مسابقة أبريل" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="من تاريخ"><input className="form-input" type="date" value={compForm.from_date} onChange={e => setCompForm(p => ({ ...p, from_date: e.target.value }))} /></FormField>
          <FormField label="إلى تاريخ"><input className="form-input" type="date" value={compForm.to_date} onChange={e => setCompForm(p => ({ ...p, to_date: e.target.value }))} /></FormField>
        </div>
        <FormField label="الجائزة">
          <input className="form-input" value={compForm.prize} onChange={e => setCompForm(p => ({ ...p, prize: e.target.value }))} placeholder="قسيمة شراء 500 ريال" />
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowComp(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={addComp} disabled={saving}>{saving ? <Spinner size="sm" /> : 'إطلاق'}</button>
        </div>
      </Modal>
    </div>
  )
}
