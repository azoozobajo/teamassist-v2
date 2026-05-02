import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Baby, Star, CheckSquare, Calendar, Trophy, Swords } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { permissionService, teamService, eventService, getUserPointsHelper } from '../../services'
import { supabase } from '../../lib/supabase'
import { Spinner, PageHeader, Avatar, EmptyState } from '../../components/ui'
import { formatDate, ROLE_LABELS } from '../../utils/helpers'

const ATT_STYLE: Record<string, { label: string; cls: string }> = {
  present: { label: 'حاضر',  cls: 'bg-emerald-100 text-emerald-700' },
  absent:  { label: 'غائب',  cls: 'bg-red-100 text-red-600' },
  excused: { label: 'إجازة', cls: 'bg-amber-100 text-amber-700' },
  late:    { label: 'متأخر', cls: 'bg-blue-100 text-blue-700' },
}

interface PlayerData {
  member: any
  points: number
  attendance: any[]
  upcomingEvents: any[]
}

// Role groups that include players — mirrors EventsPage logic
const PLAYER_VISIBLE_GROUPS = ['اللاعبون فقط', 'اللاعبون والمدربون']

async function fetchUpcomingEventsForPlayer(teamId: string, playerUserId: string) {
  const now = new Date()
  const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) // 60 days
  const { data } = await supabase.from('events')
    .select('id, title, start_datetime, event_type, opponent, location, att_group, att_member_ids')
    .eq('team_id', teamId)
    .gte('start_datetime', now.toISOString())
    .lte('start_datetime', future.toISOString())
    .order('start_datetime', { ascending: true })
  return (data ?? []).filter((ev: any) => {
    // Specific invite list — player must be in it
    if (ev.att_member_ids?.length > 0) return ev.att_member_ids.includes(playerUserId)
    // Role group — must include player role
    if (ev.att_group) return PLAYER_VISIBLE_GROUPS.includes(ev.att_group)
    // No restriction → visible to all
    return true
  })
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  match: 'مباراة', training: 'تدريب', meeting: 'اجتماع',
  tournament: 'بطولة', other: 'موعد',
}
const EVENT_TYPE_COLOR: Record<string, string> = {
  match: 'bg-emerald-500', training: 'bg-blue-400',
  meeting: 'bg-purple-400', tournament: 'bg-amber-400', other: 'bg-slate-400',
}

export default function MyChildPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [players, setPlayers] = useState<any[]>([])
  const [data, setData] = useState<Record<string, PlayerData>>({})
  const [selId, setSelId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId || !user) return
    load()
  }, [teamId, user])

  async function load() {
    if (!teamId || !user) return
    setLoading(true)
    const perms = await permissionService.getUserPermissions(teamId, user.id)
    const playerIds = perms
      .filter((p: string) => p.startsWith('linked_player:'))
      .map((p: string) => p.replace('linked_player:', ''))

    if (playerIds.length === 0) { setLoading(false); return }

    const allMembers = await teamService.getMembers(teamId)
    const linked = allMembers.filter((m: any) => playerIds.includes(m.user_id))
    setPlayers(linked)

    const dataMap: Record<string, PlayerData> = {}
    await Promise.all(linked.map(async (m: any) => {
      const [pts, att, upcoming] = await Promise.all([
        getUserPointsHelper(teamId, m.user_id),
        eventService.getMyAttendance(teamId, m.user_id),
        fetchUpcomingEventsForPlayer(teamId, m.user_id),
      ])
      const sorted = [...att].sort((a: any, b: any) =>
        new Date(b.event?.start_datetime || 0).getTime() - new Date(a.event?.start_datetime || 0).getTime()
      )
      dataMap[m.user_id] = { member: m, points: pts, attendance: sorted.slice(0, 8), upcomingEvents: upcoming }
    }))
    setData(dataMap)
    setSelId(linked[0]?.user_id || '')
    setLoading(false)
  }

  if (loading) return (
    <div className="flex justify-center py-20"><Spinner size="lg"/></div>
  )

  if (players.length === 0) return (
    <div>
      <PageHeader title="ابني في الفريق" subtitle="متابعة أداء أبنائك"/>
      <div className="card">
        <EmptyState title="لم يتم ربط أي لاعب بعد"
          description="تواصل مع إدارة الفريق لربط حسابك بلاعب"/>
      </div>
    </div>
  )

  const cur = data[selId]
  const attTotal   = cur?.attendance.length || 0
  const attPresent = cur?.attendance.filter((a: any) => a.status === 'present').length || 0
  const attRate    = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0

  return (
    <div>
      <PageHeader title="ابني في الفريق" subtitle="متابعة أداء أبنائك في الفريق"/>

      {/* Player tabs — only shown if multiple children */}
      {players.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {players.map(p => (
            <button key={p.user_id} onClick={() => setSelId(p.user_id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 border ${
                selId === p.user_id
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                selId === p.user_id ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'
              }`}>
                {p.profile?.full_name?.[0] || '?'}
              </div>
              {p.profile?.full_name}
            </button>
          ))}
        </div>
      )}

      {cur && (
        <div className="space-y-4">

          {/* ── Player hero card ── */}
          <div className="card">
            <div className="flex items-center gap-4">
              <Avatar name={cur.member.profile?.full_name || '?'} src={cur.member.profile?.avatar_url} size="lg"/>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-lg text-slate-800 truncate">{cur.member.profile?.full_name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="badge bg-brand-100 text-brand-700 text-xs">
                    {ROLE_LABELS[cur.member.role] || cur.member.role}
                  </span>
                  {cur.member.position_label && (
                    <span className="text-sm text-slate-400">{cur.member.position_label}</span>
                  )}
                </div>
              </div>
              <Baby size={28} className="text-brand-300 flex-shrink-0"/>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center py-4 px-2">
              <div className="text-2xl font-black text-amber-500">{cur.points}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                <Star size={11}/> النقاط
              </div>
            </div>
            <div className="card text-center py-4 px-2">
              <div className="text-2xl font-black text-emerald-600">{attRate}%</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                <CheckSquare size={11}/> نسبة الحضور
              </div>
            </div>
            <div className="card text-center py-4 px-2">
              <div className="text-2xl font-black text-blue-600">{attPresent}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                <Trophy size={11}/> جلسة حضر
              </div>
            </div>
          </div>

          {/* ── Upcoming events ── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={15} className="text-brand-500"/>
              <span className="font-extrabold text-sm text-slate-700">المواعيد القادمة</span>
            </div>
            {cur.upcomingEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">لا توجد مواعيد قادمة</p>
            ) : (
              <div className="space-y-2">
                {cur.upcomingEvents.map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
                    <div className={`w-2 h-8 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[ev.event_type] || 'bg-slate-400'}`}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-700 truncate">{ev.title}</div>
                      {ev.opponent && <div className="text-xs text-slate-400">ضد {ev.opponent}</div>}
                      {ev.location && <div className="text-xs text-slate-400 truncate">{ev.location}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold text-brand-600">{formatDate(ev.start_datetime)}</div>
                      <div className="text-xs mt-0.5 text-slate-400 font-bold">
                        {EVENT_TYPE_LABEL[ev.event_type] || ev.event_type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Recent attendance ── */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={15} className="text-brand-500"/>
              <span className="font-extrabold text-sm text-slate-700">آخر الجلسات</span>
              {attTotal > 0 && (
                <span className="text-xs text-slate-400 mr-auto">{attTotal} جلسة إجمالاً</span>
              )}
            </div>
            {cur.attendance.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">لا يوجد سجل حضور بعد</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {cur.attendance.map((a: any) => {
                  const s = ATT_STYLE[a.status] || { label: a.status, cls: 'bg-slate-100 text-slate-500' }
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${s.cls}`}>
                        {s.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 truncate">
                          {a.event?.title || 'جلسة'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 flex-shrink-0">
                        {formatDate(a.event?.start_datetime)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
