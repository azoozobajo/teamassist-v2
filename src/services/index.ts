import { supabase } from '../lib/supabase'
import { format, parseISO, getDay, eachDayOfInterval } from 'date-fns'

// ── TEAMS ─────────────────────────────────────────────────────────────
export const teamService = {
  async getMyTeams(userId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, joined_at, teams(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('removed_at', null)
    return (data ?? []).map((r: any) => ({ ...r.teams, myRole: r.role, joinedAt: r.joined_at }))
  },
  async getTeam(id: string) {
    const { data } = await supabase.from('teams').select('*').eq('id', id).single()
    return data
  },
  async createTeam(data: any, userId: string) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: team, error } = await supabase.from('teams')
      .insert({ ...data, invite_code: code, invite_code_enabled: true, require_approval: false, created_by: userId })
      .select().single()
    if (error) return { error }
    await supabase.from('team_members')
      .insert({ team_id: team.id, user_id: userId, role: 'owner', status: 'active', is_visible: true })
    return { team }
  },
  async updateTeam(id: string, data: any) {
    return supabase.from('teams').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async getByInviteCode(code: string) {
    const { data } = await supabase.from('teams').select('*')
      .eq('invite_code', code.toUpperCase()).eq('invite_code_enabled', true).single()
    return data
  },
  async joinTeamByCode(teamId: string, userId: string, requireApproval: boolean) {
    if (requireApproval) {
      return supabase.from('join_requests')
        .insert({ team_id: teamId, user_id: userId, status: 'pending' })
    }
    return supabase.from('team_members')
      .insert({ team_id: teamId, user_id: userId, role: 'player', status: 'active', is_visible: true })
  },
  async getMembers(teamId: string) {
    const { data } = await supabase.from('team_members')
      .select('*, profile:profiles!user_id(*)')
      .eq('team_id', teamId).eq('status', 'active').is('removed_at', null)
      .order('joined_at', { ascending: true })
    return data ?? []
  },
  async getVisibleMembers(teamId: string) {
    const { data } = await supabase.from('team_members')
      .select('*, profile:profiles!user_id(*)')
      .eq('team_id', teamId).eq('status', 'active').eq('is_visible', true).is('removed_at', null)
    return data ?? []
  },
  async getParentMembers(teamId: string) {
    const { data } = await supabase.from('team_members')
      .select('*, profile:profiles!user_id(id, full_name, avatar_url), linked_player:profiles!linked_player_id(id, full_name)')
      .eq('team_id', teamId).eq('role', 'parent').eq('status', 'active').is('removed_at', null)
    return data ?? []
  },
  async setLinkedPlayer(memberId: string, linkedPlayerId: string | null) {
    return supabase.from('team_members').update({ linked_player_id: linkedPlayerId }).eq('id', memberId)
  },
  async updateMemberRole(memberId: string, role: string) {
    return supabase.from('team_members').update({ role }).eq('id', memberId)
  },
  async removeMember(memberId: string) {
    return supabase.from('team_members')
      .update({ status: 'inactive', removed_at: new Date().toISOString() }).eq('id', memberId)
  },
  async leaveSelf(teamId: string, _userId: string) {
    return supabase.rpc('leave_team', { p_team_id: teamId })
  },
  async getMyRole(teamId: string, userId: string) {
    const { data } = await supabase.from('team_members').select('role')
      .eq('team_id', teamId).eq('user_id', userId).eq('status', 'active').single()
    return data?.role ?? null
  },
  async getMyArchivedTeams(userId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, removed_at, joined_at, teams(*)')
      .eq('user_id', userId)
      .neq('status', 'active')
    return (data ?? []).map((r: any) => ({
      ...r.teams, myRole: r.role,
      removedAt: r.removed_at, joinedAt: r.joined_at, archived: true
    }))
  },
  async regenerateCode(teamId: string) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    await supabase.from('teams').update({ invite_code: code }).eq('id', teamId)
    return code
  },
  // Join requests
  async getJoinRequests(teamId: string) {
    const { data } = await supabase.from('join_requests')
      .select('*, profile:profiles(*)')
      .eq('team_id', teamId).eq('status', 'pending')
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async reviewJoinRequest(id: string, status: 'approved' | 'rejected', teamId: string, userId: string, reviewerId: string, role = 'player') {
    await supabase.from('join_requests').update({ status, reviewed_by: reviewerId }).eq('id', id)
    if (status === 'approved') {
      await supabase.from('team_members')
        .insert({ team_id: teamId, user_id: userId, role, status: 'active', is_visible: true })
    }
  },
  async getMyJoinRequests(userId: string) {
    const { data } = await supabase.from('join_requests')
      .select('*, team:teams(*)')
      .eq('user_id', userId).order('created_at', { ascending: false })
    return data ?? []
  }
}

// ── EVENTS ────────────────────────────────────────────────────────────
export const eventService = {
  async getTeamEvents(teamId: string) {
    const { data } = await supabase.from('events').select('*')
      .eq('team_id', teamId).order('start_datetime', { ascending: true })
    return data ?? []
  },
  async getUpcomingEvents(teamId: string, limit = 5) {
    const { data } = await supabase.from('events').select('*')
      .eq('team_id', teamId)
      .gte('start_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: true }).limit(limit)
    return data ?? []
  },
  async getNextEvent(teamId: string) {
    const { data } = await supabase.from('events').select('*')
      .eq('team_id', teamId)
      .gte('start_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: true }).limit(1).single()
    return data
  },
  async createEvent(data: any) {
    const isLocked = new Date(data.start_datetime) <= new Date()
    return supabase.from('events').insert({ ...data, is_locked: isLocked }).select().single()
  },
  async getEventsForMember(teamId: string, userId: string) {
    // Events where member is specifically included OR att_member_ids is null (everyone)
    const { data } = await supabase.from('events').select('*')
      .eq('team_id', teamId)
      .or(`att_member_ids.is.null,att_member_ids.cs.{${userId}}`)
      .order('start_datetime', { ascending: true })
    return data ?? []
  },
  async createRecurringEvents(groupData: any, userId: string, teamId: string) {
    // Create the recurrence group
    const { data: group, error: gErr } = await supabase.from('recurrence_groups')
      .insert({ ...groupData, team_id: teamId, created_by: userId }).select().single()
    if (gErr || !group) return { error: gErr }
    // Generate all occurrences
    const start = parseISO(groupData.start_date)
    const end = parseISO(groupData.end_date)
    const days = eachDayOfInterval({ start, end })
    const events = days
      .filter(d => groupData.days_of_week.includes(getDay(d)))
      .map(d => ({
        team_id: teamId,
        recurrence_group_id: group.id,
        title: groupData.title,
        event_type: groupData.event_type,
        start_datetime: `${format(d, 'yyyy-MM-dd')}T${groupData.start_time}:00`,
        end_datetime: groupData.end_time ? `${format(d, 'yyyy-MM-dd')}T${groupData.end_time}:00` : null,
        location: groupData.location,
        map_url: groupData.map_url,
        att_group: groupData.att_group || 'الكل',
        description: groupData.description || null,
        created_by: userId,
        is_locked: new Date(`${format(d, 'yyyy-MM-dd')}T${groupData.start_time}`) <= new Date()
      }))
    const { error } = await supabase.from('events').insert(events)
    return { error, count: events.length }
  },
  async updateEvent(id: string, data: any) {
    return supabase.from('events').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async updateRecurringEvents(groupId: string, data: any, scope: 'all' | 'future', fromDate?: string) {
    let query = supabase.from('events').update({ ...data, updated_at: new Date().toISOString() })
      .eq('recurrence_group_id', groupId)
    if (scope === 'future' && fromDate) {
      query = query.gte('start_datetime', fromDate)
    }
    return query
  },
  async deleteEvent(id: string) {
    return supabase.from('events').delete().eq('id', id)
  },
  async deleteRecurringEvents(groupId: string, scope: 'all' | 'future', fromDate?: string) {
    let query = supabase.from('events').delete().eq('recurrence_group_id', groupId)
    if (scope === 'future' && fromDate) query = query.gte('start_datetime', fromDate)
    await query
    if (scope === 'all') {
      await supabase.from('recurrence_groups').delete().eq('id', groupId)
    }
  },
  async getRecurringGroups(teamId: string) {
    const { data } = await supabase.from('recurrence_groups')
      .select('*, events(id, start_datetime, title, description)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async updateEventsByIds(ids: string[], data: any) {
    return supabase.from('events').update({ ...data, updated_at: new Date().toISOString() }).in('id', ids)
  },
  async deleteEventsByIds(ids: string[]) {
    return supabase.from('events').delete().in('id', ids)
  },
  async lockPassedEvents(teamId: string) {
    return supabase.from('events').update({ is_locked: true })
      .eq('team_id', teamId).lt('start_datetime', new Date().toISOString()).eq('is_locked', false)
  },
  async getAttendance(eventId: string) {
    const { data } = await supabase.from('attendance')
      .select('*, profile:profiles!user_id(id, full_name, avatar_url)').eq('event_id', eventId)
    return data ?? []
  },
  async setAttendance(record: any) {
    return supabase.from('attendance')
      .upsert({ ...record, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' })
  },
  async getMyAttendance(teamId: string, userId: string) {
    const { data } = await supabase.from('attendance')
      .select('*, event:events(*)').eq('team_id', teamId).eq('user_id', userId)
    return data ?? []
  },
  async getMatchResults(teamId: string) {
    const { data } = await supabase.from('events')
      .select('id, title, start_datetime, goals_for, goals_against, opponent, home_away, tournament_name, match_category')
      .eq('team_id', teamId).eq('event_type', 'match')
      .not('goals_for', 'is', null)
      .order('start_datetime', { ascending: false })
    return data ?? []
  },
  async getWeekEvents(teamId: string) {
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const { data } = await supabase.from('events').select('*')
      .eq('team_id', teamId)
      .gte('start_datetime', now.toISOString())
      .lte('start_datetime', weekLater.toISOString())
      .order('start_datetime', { ascending: true })
    return data ?? []
  },
  async getRecentPastEvents(teamId: string, eventTypes: string[], hours: number) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const { data } = await supabase.from('events')
      .select('id, title, event_type, start_datetime')
      .eq('team_id', teamId)
      .in('event_type', eventTypes)
      .lt('start_datetime', new Date().toISOString())
      .gte('start_datetime', since)
      .order('start_datetime', { ascending: false })
    return data ?? []
  },
  async getTeamAttendanceStats(teamId: string) {
    const { data } = await supabase.from('attendance')
      .select('user_id, status, profiles(full_name)').eq('team_id', teamId)
    return data ?? []
  },
  async getAttendanceForEvents(eventIds: string[], userId: string) {
    if (!eventIds.length) return {}
    const { data } = await supabase.from('attendance')
      .select('event_id, status').in('event_id', eventIds).eq('user_id', userId)
    const map: Record<string, string> = {}
    ;(data ?? []).forEach((a: any) => { map[a.event_id] = a.status })
    return map
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
export const notificationService = {
  async getAll(userId: string) {
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
    return data ?? []
  },
  async markRead(id: string) {
    return supabase.from('notifications').update({ is_read: true }).eq('id', id)
  },
  async markAllRead(userId: string) {
    return supabase.from('notifications').update({ is_read: true }).eq('user_id', userId)
  },
  async create(data: any) {
    return supabase.from('notifications').insert(data)
  },
  async createForUsers(userIds: string[], teamId: string, title: string, body: string, type: string) {
    if (!userIds.length) return
    const { data: team } = await supabase.from('teams').select('logo_url').eq('id', teamId).single()
    const notifs = userIds.map(uid => ({
      user_id: uid, team_id: teamId, title, body, type, is_read: false,
      team_logo: team?.logo_url || null
    }))
    await supabase.from('notifications').insert(notifs)
  },
  async createForTeam(teamId: string, title: string, body: string, type: string, excludeUserId?: string, senderName?: string) {
    const { data: members } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('status', 'active')
    if (!members) return
    // Get team logo
    const { data: team } = await supabase.from('teams').select('logo_url').eq('id', teamId).single()
    const notifs = members
      .filter((m: any) => m.user_id !== excludeUserId)
      .map((m: any) => ({
        user_id: m.user_id, team_id: teamId, title, body, type, is_read: false,
        sender_name: senderName || null,
        team_logo: team?.logo_url || null
      }))
    if (notifs.length) await supabase.from('notifications').insert(notifs)
  }
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────
export const announcementService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('announcements')
      .select('*, profile:profiles(*)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('announcements').insert(data).select().single()
  },
  async delete(id: string) {
    return supabase.from('announcements').delete().eq('id', id)
  },
  async getVotes(announcementId: string, userId: string) {
    const { data } = await supabase.from('poll_votes')
      .select('option_index').eq('announcement_id', announcementId).eq('user_id', userId)
    return data?.map((v: any) => v.option_index) ?? []
  },
  async vote(announcementId: string, userId: string, optionIndex: number) {
    return supabase.from('poll_votes')
      .upsert({ announcement_id: announcementId, user_id: userId, option_index: optionIndex },
        { onConflict: 'announcement_id,user_id' })
  }
}

// ── FINANCE ───────────────────────────────────────────────────────────
export const financeService = {
  async getObligations(teamId: string) {
    const { data } = await supabase.from('financial_obligations').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async createObligation(data: any) {
    return supabase.from('financial_obligations').insert(data).select().single()
  },
  async getPayments(teamId: string) {
    const { data } = await supabase.from('payments')
      .select('*, profile:profiles(id, full_name)').eq('team_id', teamId)
    return data ?? []
  },
  async upsertPayment(data: any) {
    return supabase.from('payments')
      .upsert({ ...data, created_at: new Date().toISOString() }, { onConflict: 'obligation_id,user_id' })
  },
  async getPlayerFinance(teamId: string, userId: string) {
    const { data: obs } = await supabase.from('financial_obligations')
      .select('*').eq('team_id', teamId)
    const { data: pays } = await supabase.from('payments')
      .select('*').eq('team_id', teamId).eq('user_id', userId)
    return { obligations: obs ?? [], payments: pays ?? [] }
  }
}

// ── LEAVES ────────────────────────────────────────────────────────────
export const leaveService = {
  async getAll(teamId: string) {
    const { data, error } = await supabase.from('leaves').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    if (error) { console.error('[leaveService.getAll]', error); return [] }
    if (!data?.length) return []
    const ids = [...new Set(data.map((l: any) => l.user_id))]
    const { data: profs } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', ids)
    const pm: Record<string, any> = {}
    ;(profs ?? []).forEach((p: any) => { pm[p.id] = p })
    return data.map((l: any) => ({ ...l, profile: pm[l.user_id] ?? null }))
  },
  async getMyLeaves(teamId: string, userId: string) {
    const { data } = await supabase.from('leaves').select('*')
      .eq('team_id', teamId).eq('user_id', userId).order('created_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('leaves').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('leaves').update(data).eq('id', id)
  }
}

// ── COACH NOTES ───────────────────────────────────────────────────────
export const noteService = {
  async getPlayerNotes(teamId: string, playerId: string) {
    const { data } = await supabase.from('coach_notes')
      .select('*, coach:profiles(*)')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('coach_notes').insert(data).select().single()
  },
  async markRead(playerId: string, teamId: string) {
    return supabase.from('coach_notes')
      .update({ is_read: true }).eq('player_id', playerId).eq('team_id', teamId)
  },
  async getUnreadCount(teamId: string, playerId: string) {
    const { count } = await supabase.from('coach_notes')
      .select('id', { count: 'exact' })
      .eq('team_id', teamId).eq('player_id', playerId).eq('is_read', false)
    return count ?? 0
  }
}

// ── INJURIES ──────────────────────────────────────────────────────────
export const injuryService = {
  async getPlayerInjuries(teamId: string, playerId: string) {
    const { data } = await supabase.from('injuries').select('*')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('injury_date', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('injuries').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('injuries').update(data).eq('id', id)
  }
}

// ── POINTS ────────────────────────────────────────────────────────────
export const pointsService = {
  async getLeaderboard(teamId: string) {
    const { data } = await supabase.rpc('get_points_leaderboard', { p_team_id: teamId })
    return data ?? []
  },
  async getHistory(teamId: string, limit = 50) {
    const { data } = await supabase.from('points_transactions')
      .select('*, profile:profiles!user_id(*)')
      .eq('team_id', teamId).order('created_at', { ascending: false }).limit(limit)
    return data ?? []
  },
  async addPoints(records: any[]) {
    return supabase.from('points_transactions').insert(records)
  },
  async getAutoSettings(teamId: string) {
    const { data } = await supabase.from('auto_point_settings').select('*').eq('team_id', teamId)
    return data ?? []
  },
  async saveAutoSettings(settings: any[]) {
    return supabase.from('auto_point_settings')
      .upsert(settings, { onConflict: 'team_id,event_trigger' })
  },
  async getCompetitions(teamId: string) {
    const { data } = await supabase.from('competitions')
      .select('*, winner:profiles(full_name)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async createCompetition(data: any) {
    return supabase.from('competitions').insert(data).select().single()
  },
  async addAutoAttendancePoints(teamId: string, userId: string, eventType: string, eventId: string) {
    // Points are only for players, not coaches/admins/parents
    const { data: memberRow } = await supabase.from('team_members')
      .select('role').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
    if (memberRow?.role !== 'player') return
    const triggerMap: Record<string, string> = {
      training: 'حضور التدريب',
      match: 'حضور المباراة',
      meeting: 'حضور الاجتماع',
      camp: 'حضور المعسكر',
    }
    const trigger = triggerMap[eventType]
    if (!trigger) return
    const { data: setting } = await supabase.from('auto_point_settings')
      .select('points, is_active').eq('team_id', teamId).eq('event_trigger', trigger).maybeSingle()
    if (!setting?.is_active || !setting.points) return
    // Check deduplication: already awarded for this event+user?
    const { count } = await supabase.from('points_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId).eq('user_id', userId).eq('source_event_id', eventId).eq('is_auto', true)
    if ((count ?? 0) > 0) return
    await supabase.from('points_transactions').insert({
      team_id: teamId, user_id: userId, points: setting.points,
      category: 'أداء', reason: trigger, is_auto: true, source_event_id: eventId
    })
    // Update streak for training events
    let longestStreak = 0
    if (eventType === 'training') {
      const streak = await streakService.updateStreakOnAttendance(teamId, userId, eventId)
      const { data: streakRow } = await supabase.from('player_streaks')
        .select('longest_streak').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
      longestStreak = streakRow?.longest_streak ?? streak ?? 0
    }
    // Badge check for all event types (training + match)
    const { data: pts } = await supabase.from('points_transactions')
      .select('points').eq('team_id', teamId).eq('user_id', userId)
    const totalPoints = (pts ?? []).reduce((s: number, r: any) => s + r.points, 0)
    const { data: attRows } = await supabase.from('attendance')
      .select('event_id, events!inner(event_type)')
      .eq('team_id', teamId).eq('user_id', userId)
      .in('status', ['present', 'late'])
    const trainingCount = (attRows ?? []).filter((a: any) => a.events?.event_type === 'training').length
    const matchCount    = (attRows ?? []).filter((a: any) => a.events?.event_type === 'match').length
    await badgeService.checkAndAwardBadges(teamId, userId, {
      totalPoints, longestStreak, trainingCount, matchCount,
    })
  },
  async getPlayerTransactions(teamId: string, userId: string, fromDate?: string, toDate?: string) {
    let q = supabase.from('points_transactions')
      .select('*')
      .eq('team_id', teamId).eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (fromDate) q = q.gte('created_at', fromDate)
    if (toDate) q = q.lte('created_at', toDate + 'T23:59:59')
    const { data } = await q
    return data ?? []
  },
  async getUserPoints(teamId: string, userId: string) {
    const { data } = await supabase.from('points_transactions')
      .select('points').eq('team_id', teamId).eq('user_id', userId)
    return (data ?? []).reduce((s: number, r: any) => s + r.points, 0)
  },
}

// ── PLAYER LEVELS ─────────────────────────────────────────────────────
export const levelService = {
  async getLevels(teamId: string) {
    const { data } = await supabase.from('player_levels')
      .select('*').eq('team_id', teamId).order('min_points', { ascending: true })
    return data ?? []
  },
  async saveLevel(level: any) {
    if (level.id) {
      return supabase.from('player_levels').update({
        name: level.name, icon: level.icon, min_points: level.min_points, color: level.color
      }).eq('id', level.id)
    }
    return supabase.from('player_levels').insert({ ...level })
  },
  async deleteLevel(id: string) {
    return supabase.from('player_levels').delete().eq('id', id)
  },
  getPlayerLevel(points: number, levels: any[]) {
    const sorted = [...levels].sort((a, b) => b.min_points - a.min_points)
    return sorted.find(l => points >= l.min_points) ?? null
  },
}

// ── STREAKS ────────────────────────────────────────────────────────────
export const streakService = {
  async getRules(teamId: string) {
    const { data } = await supabase.from('streak_rules')
      .select('*').eq('team_id', teamId).order('consecutive_count', { ascending: true })
    return data ?? []
  },
  async saveRules(teamId: string, rules: { consecutive_count: number; bonus_points: number }[]) {
    await supabase.from('streak_rules').delete().eq('team_id', teamId)
    if (rules.length === 0) return
    return supabase.from('streak_rules').insert(rules.map(r => ({ ...r, team_id: teamId })))
  },
  async getStreak(teamId: string, userId: string) {
    const { data } = await supabase.from('player_streaks')
      .select('*').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
    return data
  },
  async getTeamStreaks(teamId: string) {
    const { data } = await supabase.from('player_streaks')
      .select('*').eq('team_id', teamId)
    return data ?? []
  },
  async updateStreakOnAttendance(teamId: string, userId: string, eventId: string) {
    // Get ordered list of all training events for this team up to now
    const { data: events } = await supabase.from('events')
      .select('id, start_datetime')
      .eq('team_id', teamId).eq('event_type', 'training')
      .lte('start_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: false })
      .limit(50)
    if (!events || events.length === 0) return

    const eventIds = events.map((e: any) => e.id)
    // Get attendance records for this player on all these training events
    const { data: attRows } = await supabase.from('attendance')
      .select('event_id, status')
      .eq('team_id', teamId).eq('user_id', userId)
      .in('event_id', eventIds)
    const presentSet = new Set(
      (attRows ?? []).filter((a: any) => a.status === 'present' || a.status === 'late').map((a: any) => a.event_id)
    )

    // Count consecutive from most recent backwards
    let streak = 0
    for (const ev of events) {
      if (presentSet.has(ev.id)) streak++
      else break
    }

    // Get current record
    const { data: current } = await supabase.from('player_streaks')
      .select('longest_streak').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
    const longest = Math.max(streak, current?.longest_streak ?? 0)

    await supabase.from('player_streaks').upsert({
      team_id: teamId, user_id: userId,
      current_streak: streak, longest_streak: longest,
      last_training_event_id: eventId,
    }, { onConflict: 'team_id,user_id' })

    // Check streak rules and award bonus points (deduplicated by reason+event)
    const { data: rules } = await supabase.from('streak_rules')
      .select('*').eq('team_id', teamId).eq('consecutive_count', streak)
    if (rules && rules.length > 0) {
      const rule = rules[0]
      const reason = `سلسلة ${streak} تدريبات متتالية 🔥`
      const { count } = await supabase.from('points_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).eq('user_id', userId)
        .eq('source_event_id', eventId).eq('reason', reason)
      if ((count ?? 0) === 0) {
        await supabase.from('points_transactions').insert({
          team_id: teamId, user_id: userId,
          points: rule.bonus_points, category: 'أداء',
          reason, is_auto: true, source_event_id: eventId,
        })
      }
    }
    return streak
  },
}

// ── BADGES ────────────────────────────────────────────────────────────
export const badgeService = {
  async getDefinitions(teamId: string) {
    const { data } = await supabase.from('badge_definitions')
      .select('*').eq('team_id', teamId).order('created_at', { ascending: true })
    return data ?? []
  },
  async saveDefinition(def: any) {
    if (def.id) {
      return supabase.from('badge_definitions').update({
        name: def.name, icon: def.icon, description: def.description,
        trigger_type: def.trigger_type, trigger_value: def.trigger_value, color: def.color,
      }).eq('id', def.id)
    }
    return supabase.from('badge_definitions').insert({ ...def })
  },
  async deleteDefinition(id: string) {
    return supabase.from('badge_definitions').delete().eq('id', id)
  },
  async getPlayerBadges(teamId: string, userId: string) {
    const { data } = await supabase.from('player_badges')
      .select('*, badge:badge_definitions(*)')
      .eq('team_id', teamId).eq('user_id', userId)
      .order('earned_at', { ascending: false })
    return data ?? []
  },
  async getTeamBadges(teamId: string) {
    const { data } = await supabase.from('player_badges')
      .select('*, badge:badge_definitions(*)')
      .eq('team_id', teamId)
    return data ?? []
  },
  async checkAndAwardBadges(teamId: string, userId: string, context: {
    totalPoints?: number; currentStreak?: number; longestStreak?: number;
    bestPlayerWins?: number; monthlyStars?: number;
    matchCount?: number; trainingCount?: number;
  }) {
    const { data: defs } = await supabase.from('badge_definitions')
      .select('*').eq('team_id', teamId)
    if (!defs || defs.length === 0) return []

    const earned: string[] = []
    for (const def of defs) {
      let qualifies = false
      const v = def.trigger_value
      switch (def.trigger_type) {
        case 'total_points':    qualifies = (context.totalPoints ?? 0) >= v; break
        case 'streak':          qualifies = (context.longestStreak ?? 0) >= v; break
        case 'best_player_wins':qualifies = (context.bestPlayerWins ?? 0) >= v; break
        case 'monthly_star':    qualifies = (context.monthlyStars ?? 0) >= v; break
        case 'match_count':     qualifies = (context.matchCount ?? 0) >= v; break
        case 'training_count':  qualifies = (context.trainingCount ?? 0) >= v; break
      }
      if (!qualifies) continue
      const { error } = await supabase.from('player_badges').insert({
        team_id: teamId, user_id: userId, badge_id: def.id,
      })
      if (!error) earned.push(def.id)
    }
    return earned
  },

  // Retroactively evaluate ALL players in a team and award qualifying badges
  async evaluateAllPlayers(teamId: string) {
    // Get all players
    const { data: players } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('role', 'player').eq('status', 'active')
    if (!players || players.length === 0) return

    for (const p of players) {
      const uid = p.user_id

      // Total points
      const { data: ptsRows } = await supabase.from('points_transactions')
        .select('points').eq('team_id', teamId).eq('user_id', uid)
      const totalPoints = (ptsRows ?? []).reduce((s: number, r: any) => s + r.points, 0)

      // Streak
      const { data: streakRow } = await supabase.from('player_streaks')
        .select('longest_streak').eq('team_id', teamId).eq('user_id', uid).maybeSingle()
      const longestStreak = streakRow?.longest_streak ?? 0

      // Best player wins
      const { count: bpWins } = await supabase.from('best_player_polls')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).eq('winner_id', uid).eq('status', 'closed')

      // Monthly stars
      const { count: msCount } = await supabase.from('monthly_stars')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).eq('user_id', uid).not('announced_at', 'is', null)

      // Attendance counts
      const { data: attRows } = await supabase.from('attendance')
        .select('event_id, events!inner(event_type)')
        .eq('team_id', teamId).eq('user_id', uid)
        .in('status', ['present', 'late'])
      const trainingCount = (attRows ?? []).filter((a: any) => a.events?.event_type === 'training').length
      const matchCount    = (attRows ?? []).filter((a: any) => a.events?.event_type === 'match').length

      await badgeService.checkAndAwardBadges(teamId, uid, {
        totalPoints, longestStreak,
        bestPlayerWins: bpWins ?? 0,
        monthlyStars: msCount ?? 0,
        trainingCount, matchCount,
      })
    }
  },
}

// ── DM ────────────────────────────────────────────────────────────────
export const dmService = {
  async getConversations(teamId: string, userId: string) {
    const { data } = await supabase.from('direct_messages')
      .select('*, sender:profiles!sender_id(id, full_name), receiver:profiles!receiver_id(id, full_name)')
      .eq('team_id', teamId)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
    // Group by conversation partner
    const convMap: Record<string, any> = {}
    ;(data ?? []).forEach((m: any) => {
      const partnerId = m.sender_id === userId ? m.receiver_id : m.sender_id
      const partnerName = m.sender_id === userId ? m.receiver?.full_name : m.sender?.full_name
      if (!convMap[partnerId]) {
        convMap[partnerId] = { partnerId, partnerName, lastMsg: m, unread: 0 }
      }
      if (!m.is_read && m.receiver_id === userId) convMap[partnerId].unread++
    })
    return Object.values(convMap)
  },
  async getMessages(teamId: string, userId: string, otherId: string) {
    const { data } = await supabase.from('direct_messages')
      .select('*, sender:profiles!sender_id(*)')
      .eq('team_id', teamId)
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true })
    return data ?? []
  },
  async send(data: any) {
    return supabase.from('direct_messages').insert(data).select('*, sender:profiles!sender_id(*)').single()
  },
  async markRead(teamId: string, senderId: string, receiverId: string) {
    return supabase.from('direct_messages')
      .update({ is_read: true })
      .eq('team_id', teamId).eq('sender_id', senderId).eq('receiver_id', receiverId).eq('is_read', false)
  }
}

// ── REPORTS ───────────────────────────────────────────────────────────
export const reportService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('secret_reports')
      .select('*, author:profiles(*)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    if (!data?.length) return data ?? []
    const allIds: string[] = []
    data.forEach((r: any) => { if (r.tagged_members?.length) allIds.push(...r.tagged_members) })
    const uniqueIds = [...new Set(allIds)]
    const pm: Record<string, any> = {}
    if (uniqueIds.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, full_name, avatar_url').in('id', uniqueIds)
      ;(profs ?? []).forEach((p: any) => { pm[p.id] = p })
    }
    return data.map((r: any) => ({
      ...r,
      tagged_profiles: (r.tagged_members ?? []).map((id: string) => pm[id]).filter(Boolean)
    }))
  },
  async create(data: any) {
    return supabase.from('secret_reports').insert(data).select().single()
  }
}

// ── CHAT ──────────────────────────────────────────────────────────────
export const chatService = {
  async getMessages(teamId: string, chatType: 'general' | 'parents' = 'general', limit = 100) {
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:profiles(*)')
      .eq('team_id', teamId).eq('chat_type', chatType)
      .order('created_at', { ascending: true }).limit(limit)
    return data ?? []
  },
  async send(data: any) {
    return supabase.from('chat_messages').insert(data).select('*, sender:profiles(*)').single()
  },
  subscribeToMessages(teamId: string, chatType: 'general' | 'parents', onMessage: (msg: any) => void) {
    return supabase.channel(`chat:${teamId}:${chatType}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `team_id=eq.${teamId}`
      }, async (payload) => {
        if (payload.new.chat_type !== chatType) return
        const { data } = await supabase.from('chat_messages')
          .select('*, sender:profiles(*)')
          .eq('id', payload.new.id).single()
        if (data) onMessage(data)
      })
      .subscribe()
  }
}

// ── INVITATIONS ───────────────────────────────────────────────────────
export const inviteService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('invitations').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    const token = Math.random().toString(36).substring(2, 16)
    return supabase.from('invitations').insert({ ...data, token, status: 'pending' }).select().single()
  },
  async getMyInvitations(email: string) {
    const { data } = await supabase.from('invitations')
      .select('*, team:teams(*)')
      .eq('email', email).eq('status', 'pending')
    return data ?? []
  },
  async acceptInvitation(id: string, userId: string) {
    const { data: inv } = await supabase.from('invitations').select('*').eq('id', id).single()
    if (!inv) return { error: 'not found' }
    await supabase.from('team_members')
      .insert({ team_id: inv.team_id, user_id: userId, role: inv.role, status: 'active', is_visible: true })
    return supabase.from('invitations').update({ status: 'accepted' }).eq('id', id)
  }
}

// Add getUserPoints if not exists
export const getUserPointsHelper = async (teamId: string, userId: string) => {
  const { supabase } = await import('../lib/supabase')
  const { data } = await supabase.from('points_transactions')
    .select('points').eq('team_id', teamId).eq('user_id', userId)
  return (data ?? []).reduce((s: number, r: any) => s + r.points, 0)
}

// ── MATCHES ────────────────────────────────────────────────────────────
export const matchService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('matches').select('*')
      .eq('team_id', teamId).order('match_date', { ascending: false })
    return data ?? []
  },
  async getUpcoming(teamId: string) {
    const { data } = await supabase.from('matches').select('*')
      .eq('team_id', teamId).eq('status', 'upcoming')
      .gte('match_date', new Date().toISOString())
      .order('match_date', { ascending: true })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('matches').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('matches').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('matches').delete().eq('id', id)
  }
}

// ── TOURNAMENTS ────────────────────────────────────────────────────────
export const tournamentService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('tournaments').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('tournaments').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('tournaments').update(data).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('tournaments').delete().eq('id', id)
  }
}

// ── BEST PLAYER ────────────────────────────────────────────────────────
export const bestPlayerService = {
  async getPollForEvent(eventId: string) {
    const { data } = await supabase.from('best_player_polls').select('*').eq('event_id', eventId).single()
    return data
  },
  async createPoll(data: any) {
    return supabase.from('best_player_polls').insert(data).select().single()
  },
  async closePoll(pollId: string, winnerId: string, teamId: string, pts: number, announce = false) {
    await supabase.from('best_player_polls')
      .update({ status: 'closed', winner_id: winnerId, closed_at: new Date().toISOString(), points_awarded: pts, result_announced: announce })
      .eq('id', pollId)
    if (pts > 0) {
      await supabase.from('points_transactions').insert({
        team_id: teamId, user_id: winnerId, points: pts,
        category: 'مكافأة', reason: 'أفضل لاعب', is_auto: true
      })
    }
    const { count } = await supabase.from('best_player_polls')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId).eq('winner_id', winnerId).eq('status', 'closed')
    await badgeService.checkAndAwardBadges(teamId, winnerId, { bestPlayerWins: count ?? 0 })
  },
  async announceResult(pollId: string, teamId: string, createdBy: string) {
    await supabase.from('best_player_polls').update({ result_announced: true }).eq('id', pollId)
    const { data: poll } = await supabase.from('best_player_polls')
      .select('*, winner:profiles!winner_id(id,full_name), event:events(title,event_type)')
      .eq('id', pollId).single()
    if (!poll) return
    const winnerName = (poll.winner as any)?.full_name || 'اللاعب'
    const eventTitle = (poll.event as any)?.title || 'الموعد'
    const msg = `🏆 ${winnerName} هو أفضل لاعب في ${eventTitle}! تهانينا 👏`
    await supabase.from('announcements').insert({
      team_id: teamId, title: `⭐ أفضل لاعب: ${winnerName}`, content: msg, announcement_type: 'best_player', created_by: createdBy
    })
    await notificationService.createForTeam(teamId, `⭐ أفضل لاعب: ${winnerName}`, msg, 'best_player', createdBy)
  },
  async vote(pollId: string, voterId: string, nomineeId: string) {
    const { error } = await supabase.from('best_player_votes').insert({ poll_id: pollId, voter_id: voterId, nominee_id: nomineeId })
    return error
  },
  async removeVote(pollId: string, voterId: string, nomineeId: string) {
    const { error } = await supabase.from('best_player_votes').delete()
      .eq('poll_id', pollId).eq('voter_id', voterId).eq('nominee_id', nomineeId)
    return error
  },
  async getVotes(pollId: string) {
    const { data } = await supabase.from('best_player_votes').select('*, nominee:profiles!nominee_id(id,full_name)').eq('poll_id', pollId)
    return data ?? []
  },
  async getMyVotes(pollId: string, voterId: string) {
    const { data } = await supabase.from('best_player_votes').select('nominee_id').eq('poll_id', pollId).eq('voter_id', voterId)
    return (data ?? []).map((v: any) => v.nominee_id) as string[]
  },
  async getMyVote(pollId: string, voterId: string) {
    const { data } = await supabase.from('best_player_votes').select('nominee_id').eq('poll_id', pollId).eq('voter_id', voterId).limit(1).maybeSingle()
    return data?.nominee_id ?? null
  },
  async getPlayerAwards(teamId: string, userId: string) {
    const { data } = await supabase.from('best_player_polls')
      .select('*').eq('team_id', teamId).eq('winner_id', userId).eq('status', 'closed')
    return data ?? []
  },
  async getTeamAwards(teamId: string) {
    const { data } = await supabase.from('best_player_polls')
      .select('*, winner:profiles!winner_id(id,full_name), event:events(title,event_type)')
      .eq('team_id', teamId).eq('status', 'closed').order('closed_at', { ascending: false })
    return data ?? []
  },
  async getOpenPollsForTeam(teamId: string) {
    const now = new Date().toISOString()
    const { data } = await supabase.from('best_player_polls')
      .select('*, event:events(id,title,event_type,start_datetime)')
      .eq('team_id', teamId)
      .eq('status', 'open')
      .or(`closes_at.is.null,closes_at.gt.${now}`)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async getAllOpenPollsForTeam(teamId: string) {
    const { data } = await supabase.from('best_player_polls')
      .select('*, event:events(id,title,event_type,start_datetime)')
      .eq('team_id', teamId).eq('status', 'open')
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async ensurePoll(eventId: string, teamId: string, startDatetime: string) {
    const { data: existing } = await supabase.from('best_player_polls')
      .select('id,closes_at,status').eq('event_id', eventId).maybeSingle()
    if (existing) return existing
    const closesAt = new Date(new Date(startDatetime).getTime() + 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase.from('best_player_polls')
      .insert({ team_id: teamId, event_id: eventId, closes_at: closesAt })
      .select('id,closes_at,status').single()
    return data
  },
  async getAllAwards(teamId: string) {
    const [polls, stars] = await Promise.all([
      supabase.from('best_player_polls')
        .select('*, player:profiles!winner_id(id,full_name,avatar_url), event:events(title,event_type)')
        .eq('team_id', teamId).eq('status', 'closed').order('closed_at', { ascending: false }),
      supabase.from('monthly_stars')
        .select('*, player:profiles!user_id(id,full_name,avatar_url)')
        .eq('team_id', teamId).not('announced_at', 'is', null)
        .order('year', { ascending: false }).order('month', { ascending: false })
    ])
    const pollAwards = (polls.data ?? []).map((p: any) => ({
      id: p.id, type: 'poll' as const,
      player: p.player,
      awardName: `أفضل لاعب · ${p.event?.title || ''}`,
      date: p.closed_at,
      points: p.points_awarded || 0,
    }))
    const starAwards = (stars.data ?? []).map((s: any) => ({
      id: s.id, type: 'star' as const,
      player: s.player,
      awardName: s.label || 'نجم الشهر',
      date: s.announced_at,
      points: s.points_awarded || 0,
    }))
    return [...pollAwards, ...starAwards].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
}

// ── PERMISSIONS ────────────────────────────────────────────────────────
export const permissionService = {
  async getTeamPermissions(teamId: string) {
    const { data } = await supabase.from('team_permissions').select('*, profile:profiles(id,full_name)').eq('team_id', teamId)
    return data ?? []
  },
  async getUserPermissions(teamId: string, userId: string) {
    const { data } = await supabase.from('team_permissions').select('permission').eq('team_id', teamId).eq('user_id', userId)
    return (data ?? []).map((p: any) => p.permission) as string[]
  },
  async grant(teamId: string, userId: string, permission: string, grantedBy: string) {
    return supabase.from('team_permissions').upsert({ team_id: teamId, user_id: userId, permission, granted_by: grantedBy }, { onConflict: 'team_id,user_id,permission' })
  },
  async revoke(teamId: string, userId: string, permission: string) {
    return supabase.from('team_permissions').delete().eq('team_id', teamId).eq('user_id', userId).eq('permission', permission)
  },
  async setUserPermissions(teamId: string, userId: string, permissions: string[], grantedBy: string) {
    await supabase.from('team_permissions').delete().eq('team_id', teamId).eq('user_id', userId)
    if (permissions.length > 0) {
      await supabase.from('team_permissions').insert(permissions.map(p => ({ team_id: teamId, user_id: userId, permission: p, granted_by: grantedBy })))
    }
  }
}

// ── MONTHLY STAR ───────────────────────────────────────────────────────
export const monthlyStarService = {
  async getCurrent(teamId: string) {
    const now = new Date()
    const { data } = await supabase.from('monthly_stars')
      .select('*, player:profiles!user_id(id, full_name, avatar_url)')
      .eq('team_id', teamId)
      .eq('month', now.getMonth() + 1)
      .eq('year', now.getFullYear())
      .maybeSingle()
    return data ?? null
  },
  async set(teamId: string, userId: string, month: number, year: number, opts: { label?: string; note?: string; congratsMsg?: string; announceAt?: string | null; announcedAt?: string | null; createdBy: string; pointsAwarded?: number }) {
    const { error } = await supabase.from('monthly_stars').upsert({
      team_id: teamId, user_id: userId, month, year,
      label: opts.label || null,
      note: opts.note || null,
      congrats_msg: opts.congratsMsg || null,
      announce_at: opts.announceAt || null,
      announced_at: opts.announcedAt || null,
      created_by: opts.createdBy,
      points_awarded: opts.pointsAwarded ?? 0,
    }, { onConflict: 'team_id,month,year' })
    if (error) return { data: null, error }
    const { data } = await supabase.from('monthly_stars')
      .select('*, player:profiles!user_id(id, full_name, avatar_url)')
      .eq('team_id', teamId).eq('month', month).eq('year', year).single()
    return { data, error: null }
  },
  async announce(id: string, teamId?: string, userId?: string) {
    await supabase.from('monthly_stars').update({ announced_at: new Date().toISOString() }).eq('id', id)
    if (teamId && userId) {
      const { count } = await supabase.from('monthly_stars')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).eq('user_id', userId).not('announced_at', 'is', null)
      await badgeService.checkAndAwardBadges(teamId, userId, {
        monthlyStars: count ?? 0,
      })
    }
  },
  async getHistory(teamId: string) {
    const now = new Date()
    const { data } = await supabase.from('monthly_stars')
      .select('*, player:profiles!user_id(id, full_name, avatar_url)')
      .eq('team_id', teamId)
      .not('announced_at', 'is', null)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
    return (data ?? []).filter((s: any) => !(s.month === now.getMonth() + 1 && s.year === now.getFullYear()))
  }
}


// ── REGULATIONS ────────────────────────────────────────────────────────
export const regulationsService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('regulations')
      .select('*')
      .eq('team_id', teamId).order('published_at', { ascending: false })
    return data ?? []
  },
  async getRequired(teamId: string) {
    const { data } = await supabase.from('regulations')
      .select('*').eq('team_id', teamId).eq('is_required', true)
      .order('published_at', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('regulations').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('regulations').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('regulations').delete().eq('id', id)
  },
}

export const regulationAgreementsService = {
  async getMyAgreements(teamId: string, userId: string) {
    const { data } = await supabase.from('regulation_agreements')
      .select('regulation_id').eq('team_id', teamId).eq('user_id', userId)
    return (data ?? []).map((r: any) => r.regulation_id) as string[]
  },
  async agree(teamId: string, regulationId: string, userId: string) {
    return supabase.from('regulation_agreements').upsert(
      { team_id: teamId, regulation_id: regulationId, user_id: userId, agreed_at: new Date().toISOString() },
      { onConflict: 'regulation_id,user_id' }
    )
  },
  async getAgreementsForDoc(regulationId: string) {
    const { data } = await supabase.from('regulation_agreements')
      .select('user_id').eq('regulation_id', regulationId)
    return data ?? []
  },
  async getCountsForTeam(teamId: string) {
    const { data } = await supabase.from('regulation_agreements')
      .select('regulation_id').eq('team_id', teamId)
    const counts: Record<string, number> = {}
    ;(data ?? []).forEach((r: any) => { counts[r.regulation_id] = (counts[r.regulation_id] || 0) + 1 })
    return counts
  },
}

// ── OCCASIONS ──────────────────────────────────────────────────────────
export const occasionsService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('occasions').select('*')
      .eq('team_id', teamId).order('from_date', { ascending: true })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('occasions').insert(data).select().single()
  },
  async delete(id: string) {
    return supabase.from('occasions').delete().eq('id', id)
  },
}
