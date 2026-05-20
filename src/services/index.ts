import { supabase } from '../lib/supabase'
import { addDays, format, parseISO, getDay, eachDayOfInterval } from 'date-fns'

const ADMIN_DECISION_LABELS: Record<string, string> = {
  suspension: 'إيقاف',
  national_team: 'استدعاء للمنتخب',
  penalty: 'عقوبة',
  rest: 'راحة',
  emergency: 'طارئ',
  death: 'حالة وفاة',
  marriage: 'زواج',
  academic: 'دراسة',
  family: 'عائلي',
  private_event: 'مناسبة خاصة',
  other: 'أخرى',
}

const ATTENDANCE_ROLE_GROUPS: Record<string, string[]> = {
  'اللاعبون فقط': ['player'],
  'المدربون فقط': ['head_coach', 'assistant_coach'],
  'اللاعبون والمدربون': ['player', 'head_coach', 'assistant_coach'],
  'الإداريون فقط': ['administrator', 'owner'],
}

const ADMIN_DECISION_ABSENCE_TYPE: Record<string, string> = {
  suspension: 'admin_suspension',
  national_team: 'national_team',
  penalty: 'admin_suspension',
  rest: 'other',
  emergency: 'emergency',
  death: 'family',
  marriage: 'family',
  academic: 'academic',
  family: 'family',
  private_event: 'other',
  other: 'other',
}

function getEligibleIdsForEvent(event: any, members: any[]) {
  if (event.att_member_ids?.length > 0) return event.att_member_ids as string[]
  if (event.event_type === 'match' || event.event_type === 'training') {
    return members.filter(m => m.role === 'player').map(m => m.user_id)
  }
  const roles = ATTENDANCE_ROLE_GROUPS[event.att_group]
  if (roles) return members.filter(m => roles.includes(m.role)).map(m => m.user_id)
  return members.map(m => m.user_id)
}

async function applyAdminDecisionsToEvents(teamId: string, events: any[], markedBy?: string) {
  if (!events.length) return
  const eventDays = events.map(e => e.start_datetime?.slice(0, 10)).filter(Boolean)
  if (!eventDays.length) return
  const from = eventDays.reduce((a, b) => a < b ? a : b)
  const to = eventDays.reduce((a, b) => a > b ? a : b)

  const { data: decisions, error } = await supabase.from('admin_decisions')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .lte('from_date', to)
    .gte('to_date', from)
  if (error || !decisions?.length) return

  const { data: members } = await supabase.from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .is('removed_at', null)
  const activeMembers = members ?? []
  const records: any[] = []

  for (const event of events) {
    const day = event.start_datetime?.slice(0, 10)
    if (!day) continue
    const eligibleIds = new Set(getEligibleIdsForEvent(event, activeMembers))

    for (const decision of decisions) {
      if (day < decision.from_date || day > decision.to_date) continue
      const targetIds = decision.target_type === 'all'
        ? activeMembers.filter(m => m.role === 'player').map(m => m.user_id)
        : (decision.target_user_ids ?? [])
      for (const userId of targetIds) {
        if (!eligibleIds.has(userId)) continue
        records.push({
          event_id: event.id,
          team_id: teamId,
          user_id: userId,
          status: 'excused',
          absence_type: ADMIN_DECISION_ABSENCE_TYPE[decision.decision_type] || 'other',
          source_type: 'absence',
          source_id: decision.id,
          locked_by_source: true,
          is_coach_confirmed: false,
          has_excuse: true,
          excuse_reason: ADMIN_DECISION_LABELS[decision.decision_type] || 'أخرى',
          admin_note: `قرار إداري - ${ADMIN_DECISION_LABELS[decision.decision_type] || 'أخرى'}: ${decision.title}`,
          marked_by: markedBy || decision.created_by || null,
          updated_at: new Date().toISOString(),
        })
      }
    }
  }

  if (records.length) {
    await supabase.from('attendance').upsert(records, { onConflict: 'event_id,user_id' })
  }
}

// ── TEAMS ─────────────────────────────────────────────────────────────
export const teamService = {
  async getMyTeams(userId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, joined_at, teams(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('removed_at', null)
    return (data ?? [])
      .filter((r: any) => r.teams?.is_active !== false)
      .map((r: any) => ({ ...r.teams, myRole: r.role, joinedAt: r.joined_at }))
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
  async joinTeamByCode(teamId: string, userId: string) {
    // Always create a join request — admin always approves and sets the role
    // First check if a pending request already exists
    const { data: existing } = await supabase.from('join_requests')
      .select('id').eq('team_id', teamId).eq('user_id', userId).eq('status', 'pending').maybeSingle()
    if (existing) return { data: existing, error: null }
    return supabase.from('join_requests')
      .insert({ team_id: teamId, user_id: userId, status: 'pending' })
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
  async updateMemberPositions(memberId: string, primaryPosition: string | null, secondaryPositions: string[], extra?: {
    preferred_foot?: string | null
    jersey_number?: number | null
  }) {
    return supabase.from('team_members').update({
      primary_position: primaryPosition || null,
      secondary_positions: secondaryPositions.slice(0, 3),
      position_label: primaryPosition || null,
      ...extra,
    }).eq('id', memberId)
  },
  async updateMemberContactInfo(memberId: string, data: {
    guardian_name?: string | null
    guardian_phone?: string | null
    home_address?: string | null
  }) {
    return supabase.from('team_members').update(data).eq('id', memberId)
  },
  async updateMemberPreferredFoot(teamId: string, userId: string, foot: string | null) {
    return supabase.from('team_members')
      .update({ preferred_foot: foot })
      .eq('team_id', teamId).eq('user_id', userId)
  },
  async getMemberByUser(teamId: string, userId: string) {
    const { data } = await supabase.from('team_members')
      .select('*')
      .eq('team_id', teamId).eq('user_id', userId).eq('status', 'active').single()
    return data ?? null
  },
  async removeMember(memberId: string) {
    return supabase.from('team_members')
      .update({ status: 'inactive', removed_at: new Date().toISOString() }).eq('id', memberId)
  },
  async leaveSelf(teamId: string, userId: string) {
    return supabase.from('team_members')
      .update({ status: 'inactive', removed_at: new Date().toISOString() })
      .eq('team_id', teamId).eq('user_id', userId)
  },
  async transferOwnership(teamId: string, newOwnerMemberId: string) {
    return supabase.from('team_members').update({ role: 'owner' }).eq('id', newOwnerMemberId).eq('team_id', teamId)
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
  async deleteTeam(teamId: string) {
    return supabase.from('teams').delete().eq('id', teamId)
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
  },
  // Search registered users to add directly (admin action)
  async searchUsers(query: string, teamId: string) {
    if (!query.trim()) return []
    const { data: existing } = await supabase
      .from('team_members').select('user_id').eq('team_id', teamId).eq('status', 'active').is('removed_at', null)
    const existingIds = (existing ?? []).map((r: any) => r.user_id)
    const { data } = await supabase.from('profiles')
      .select('id, full_name, email, phone, avatar_url')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10)
    return (data ?? []).filter((u: any) => !existingIds.includes(u.id))
  },
  // Add a registered user directly to team using SECURITY DEFINER RPC
  async addMemberDirect(teamId: string, userId: string, role: string) {
    return supabase.rpc('add_member_direct', {
      p_team_id: teamId, p_user_id: userId, p_role: role
    })
  },
  // Notify all team admins about a new join request
  async notifyAdminsJoinRequest(teamId: string, requesterName: string) {
    const { data: admins } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('status', 'active')
      .in('role', ['owner', 'administrator', 'head_coach'])
    if (!admins) return
    const notifs = admins.map((a: any) => ({
      user_id: a.user_id, team_id: teamId,
      title: '🔔 طلب انضمام جديد',
      body: `${requesterName} يطلب الانضمام للفريق — راجع الأعضاء ← طلبات الانضمام`,
      type: 'general', is_read: false
    }))
    await supabase.from('notifications').insert(notifs)
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
    const result = await supabase.from('events').insert({ ...data, is_locked: isLocked }).select().single()
    if (result.data?.id && data.team_id) {
      await applyAdminDecisionsToEvents(data.team_id, [result.data], data.created_by)
    }
    return result
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
        created_by: userId,
        is_locked: new Date(`${format(d, 'yyyy-MM-dd')}T${groupData.start_time}`) <= new Date()
      }))
    const { data: createdEvents, error } = await supabase.from('events').insert(events).select()
    if (!error && createdEvents?.length) {
      await applyAdminDecisionsToEvents(teamId, createdEvents, userId)
    }
    return { error, count: createdEvents?.length ?? events.length }
  },
  async updateEvent(id: string, data: any) {
    const result = await supabase.from('events')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (result.data?.team_id) {
      await applyAdminDecisionsToEvents(result.data.team_id, [result.data], data.created_by)
    }
    return result
  },
  async updateRecurringEvents(groupId: string, data: any, scope: 'all' | 'future', fromDate?: string) {
    let query = supabase.from('events').update({ ...data, updated_at: new Date().toISOString() })
      .eq('recurrence_group_id', groupId)
    if (scope === 'future' && fromDate) {
      query = query.gte('start_datetime', fromDate)
    }
    const result = await query.select()
    const updatedEvents = result.data ?? []
    if (updatedEvents.length) {
      await applyAdminDecisionsToEvents(updatedEvents[0].team_id, updatedEvents, data.created_by)
    }
    return result
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
  },
  async getAttendanceSummary(teamId: string, eventIds: string[]): Promise<Record<string, Record<string, number>>> {
    if (!eventIds.length) return {}
    const { data } = await supabase.from('attendance')
      .select('event_id, status').eq('team_id', teamId).in('event_id', eventIds)
    const s: Record<string, Record<string, number>> = {}
    ;(data ?? []).forEach((r: any) => {
      if (!s[r.event_id]) s[r.event_id] = {}
      s[r.event_id][r.status] = (s[r.event_id][r.status] || 0) + 1
    })
    return s
  },
  async bulkDeleteEvents(eventIds: string[]) {
    if (!eventIds.length) return
    return supabase.from('events').delete().in('id', eventIds)
  },
  async bulkUpdateEventTimes(eventIds: string[], newStartTime: string, newEndTime: string) {
    if (!eventIds.length) return
    const { data: evs } = await supabase.from('events')
      .select('id, start_datetime').in('id', eventIds)
    if (!evs?.length) return
    const updates = evs.map((e: any) => ({
      id: e.id,
      start_datetime: `${e.start_datetime.slice(0, 10)}T${newStartTime}:00`,
      end_datetime: newEndTime ? `${e.start_datetime.slice(0, 10)}T${newEndTime}:00` : null,
      updated_at: new Date().toISOString()
    }))
    return supabase.from('events').upsert(updates)
  }
}

// ── ATTENDANCE SERVICE (النظام الموحد) ───────────────────────────────────

const ATTENDANCE_ROLE_GROUPS_NEW: Record<string, string[]> = {
  'اللاعبون فقط':        ['player'],
  'المدربون فقط':        ['head_coach', 'assistant_coach'],
  'اللاعبون والمدربون': ['player', 'head_coach', 'assistant_coach'],
  'الإداريون فقط':      ['administrator', 'owner'],
}

function getEligibleIdsNew(event: any, members: any[]): string[] {
  if (event.att_member_ids?.length > 0) return event.att_member_ids as string[]
  if (event.event_type === 'match' || event.event_type === 'training')
    return members.filter(m => m.role === 'player').map(m => m.user_id)
  const roles = ATTENDANCE_ROLE_GROUPS_NEW[event.att_group]
  if (roles) return members.filter(m => roles.includes(m.role)).map(m => m.user_id)
  return members.map(m => m.user_id)
}

export const attendanceService = {

  // ── تحقق: هل يمكن للمدرب تغيير هذا السجل؟ ──────────────────────────
  canCoachOverride(record: any): { allowed: boolean; reason?: string } {
    if (!record) return { allowed: true }
    if (record.locked_by_source && record.status === 'excused') {
      const labels: Record<string, string> = {
        leave: 'إجازة معتمدة', admin_leave: 'إجازة إدارية',
        absence: 'قرار إداري', medical: 'إصابة',
        tournament_suspension: 'إيقاف بطولة',
      }
      const label = labels[record.source_type] || 'عذر رسمي'
      return { allowed: false, reason: label }
    }
    return { allowed: true }
  },

  // ── اللاعب يسجّل نفسه ─────────────────────────────────────────────
  async markSelf(
    teamId: string, eventId: string, userId: string,
    status: 'present' | 'late' | 'absent',
    extra?: { late_minutes?: number; member_note?: string }
  ) {
    const record: any = {
      event_id: eventId, team_id: teamId, user_id: userId,
      status,
      source_type: 'player_self',
      is_coach_confirmed: false,
      marked_by: userId,
      updated_at: new Date().toISOString(),
      ...(extra ?? {}),
    }
    if (status === 'absent') {
      record.absence_type = 'unexcused'
    }
    if (status !== 'late') {
      record.late_minutes = 0
    }
    return supabase.from('attendance')
      .upsert(record, { onConflict: 'event_id,user_id' })
  },

  // ── المدرب يسجّل أو يؤكد ─────────────────────────────────────────
  async markByCoach(
    teamId: string, eventId: string, userId: string,
    status: 'present' | 'late' | 'absent' | 'excused',
    coachId: string,
    extra?: { late_minutes?: number; late_excuse?: string; has_excuse?: boolean; excuse_reason?: string; admin_note?: string }
  ) {
    // تحقق من سجل موجود: هل محمي بمصدر رسمي؟
    const { data: existing } = await supabase.from('attendance')
      .select('locked_by_source, status, source_type')
      .eq('event_id', eventId).eq('user_id', userId).maybeSingle()

    if (existing) {
      const check = attendanceService.canCoachOverride(existing)
      // المدرب لا يستطيع تحويل عذر رسمي إلى غائب بدون عذر
      if (!check.allowed && status === 'absent') {
        return { error: `لا يمكن التغيير: ${check.reason}` }
      }
    }

    const record: any = {
      event_id: eventId, team_id: teamId, user_id: userId,
      status,
      source_type: 'manual',
      source_id: null,
      locked_by_source: false,
      is_coach_confirmed: true,
      confirmed_by: coachId,
      marked_by: coachId,
      updated_at: new Date().toISOString(),
      ...(extra ?? {}),
    }
    if (status === 'absent') {
      record.absence_type = 'unexcused'
      record.locked_by_source = false
    }
    if (status === 'present' || status === 'late') {
      record.absence_type = null
      record.excuse_reason = null
      if (!extra?.admin_note) record.admin_note = null
    }
    if (status !== 'late') {
      record.late_minutes = 0
    }
    return supabase.from('attendance')
      .upsert(record, { onConflict: 'event_id,user_id' })
  },

  // ── تطبيق غياب بعذر من مصدر رسمي ────────────────────────────────
  async applyExcusedAbsence(params: {
    teamId: string
    userIds: string[]
    fromDate: string
    toDate: string
    eventTypes?: string[]         // null = كل الأنواع
    specificEventIds?: string[]   // لو حدد أحداث بعينها
    absenceType: string
    sourceType: string
    sourceId: string
    reason?: string
    markedBy?: string
  }) {
    const {
      teamId, userIds, fromDate, toDate,
      eventTypes, specificEventIds,
      absenceType, sourceType, sourceId,
      reason, markedBy,
    } = params

    // جلب الأحداث المؤهلة
    let events: any[] = []
    if (specificEventIds?.length) {
      const { data } = await supabase.from('events')
        .select('id, event_type, start_datetime, att_member_ids, att_group')
        .in('id', specificEventIds)
      events = data ?? []
    } else {
      const { data } = await supabase.from('events')
        .select('id, event_type, start_datetime, att_member_ids, att_group')
        .eq('team_id', teamId)
        .gte('start_datetime', `${fromDate}T00:00:00`)
        .lte('start_datetime', `${toDate}T23:59:59`)
      events = (data ?? []).filter((e: any) => {
        if (!eventTypes || eventTypes.includes('all')) return true
        return eventTypes.includes(e.event_type)
      })
    }

    if (!events.length) return { count: 0 }

    const { data: members } = await supabase.from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)

    const records: any[] = []
    for (const event of events) {
      const eligibleIds = new Set(getEligibleIdsNew(event, members ?? []))
      for (const userId of userIds) {
        if (!eligibleIds.has(userId)) continue
        records.push({
          event_id: event.id,
          team_id: teamId,
          user_id: userId,
          status: absenceType === 'unexcused' ? 'absent' : 'excused',
          absence_type: absenceType,
          source_type: sourceType,
          source_id: sourceId,
          locked_by_source: absenceType !== 'unexcused',
          is_coach_confirmed: absenceType === 'unexcused',
          has_excuse: absenceType !== 'unexcused',
          excuse_reason: reason || null,
          admin_note: reason || null,
          marked_by: markedBy || null,
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (!records.length) return { count: 0 }
    const { error } = await supabase.from('attendance')
      .upsert(records, { onConflict: 'event_id,user_id' })
    return { count: records.length, error }
  },

  // ── حذف غياب بعذر عند إلغاء المصدر ──────────────────────────────
  async removeExcusedBySource(sourceType: string, sourceId: string) {
    return supabase.from('attendance')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
  },

  // ── تطبيق تشكيلة المباراة على سجلات الحضور ───────────────────────
  async applyUnexcusedAbsence(params: {
    teamId: string
    userIds: string[]
    fromDate: string
    toDate: string
    eventTypes?: string[]
    specificEventIds?: string[]
    sourceId: string
    reason?: string
    markedBy?: string
  }) {
    const { teamId, userIds, fromDate, toDate, eventTypes, specificEventIds, sourceId, reason, markedBy } = params
    let events: any[] = []
    if (specificEventIds?.length) {
      const { data } = await supabase.from('events')
        .select('id, event_type, start_datetime, att_member_ids, att_group')
        .in('id', specificEventIds)
      events = data ?? []
    } else {
      const { data } = await supabase.from('events')
        .select('id, event_type, start_datetime, att_member_ids, att_group')
        .eq('team_id', teamId)
        .gte('start_datetime', `${fromDate}T00:00:00`)
        .lte('start_datetime', `${toDate}T23:59:59`)
      events = (data ?? []).filter((e: any) => {
        if (!eventTypes || eventTypes.includes('all')) return true
        return eventTypes.includes(e.event_type)
      })
    }
    if (!events.length) return { count: 0 }

    const { data: members } = await supabase.from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)

    const records: any[] = []
    for (const event of events) {
      const eligibleIds = new Set(getEligibleIdsNew(event, members ?? []))
      for (const userId of userIds) {
        if (!eligibleIds.has(userId)) continue
        records.push({
          event_id: event.id,
          team_id: teamId,
          user_id: userId,
          status: 'absent',
          absence_type: 'unexcused',
          source_type: 'absence',
          source_id: sourceId,
          locked_by_source: false,
          is_coach_confirmed: true,
          admin_note: reason || null,
          marked_by: markedBy || null,
          updated_at: new Date().toISOString(),
        })
      }
    }
    if (!records.length) return { count: 0 }
    const { error } = await supabase.from('attendance')
      .upsert(records, { onConflict: 'event_id,user_id' })
    return { count: records.length, error }
  },

  async applyMatchLineup(
    matchEventId: string,
    teamId: string,
    lineup: Array<{ user_id: string; role: 'starter' | 'sub' | 'excluded' }>,
    markedBy?: string
  ) {
    // 1. جلب كل اللاعبين النشطين
    const { data: members } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('status', 'active')
      .eq('role', 'player').is('removed_at', null)
    const allPlayerIds = (members ?? []).map((m: any) => m.user_id)

    const calledUpIds = new Set(
      lineup.filter(p => p.role === 'starter' || p.role === 'sub').map(p => p.user_id)
    )
    const excludedIds = new Set(
      lineup.filter(p => p.role === 'excluded').map(p => p.user_id)
    )

    const records: any[] = []

    for (const playerId of allPlayerIds) {
      if (calledUpIds.has(playerId)) {
        // مستدعى → يُحتسب موعداً، نضع حالة مبدئية = absent حتى يسجّل المدرب
        // لكن لا نتجاوز سجلاً موجوداً من المدرب
        const { data: existing } = await supabase.from('attendance')
          .select('id, is_coach_confirmed').eq('event_id', matchEventId)
          .eq('user_id', playerId).maybeSingle()
        if (!existing) {
          records.push({
            event_id: matchEventId, team_id: teamId, user_id: playerId,
            status: 'absent', absence_type: 'unexcused',
            source_type: 'match', is_coach_confirmed: false,
            marked_by: markedBy || null,
            updated_at: new Date().toISOString(),
          })
        }
      } else if (excludedIds.has(playerId)) {
        // مستبعد → لا موعد، نحذف أي سجل قديم غير مؤكد
        await supabase.from('attendance')
          .delete()
          .eq('event_id', matchEventId).eq('user_id', playerId)
          .eq('is_coach_confirmed', false)
          .or('locked_by_source.is.null,locked_by_source.eq.false')
      } else {
        // غير موجود في القائمة = غير مستدعى → نفس المستبعد
        await supabase.from('attendance')
          .delete()
          .eq('event_id', matchEventId).eq('user_id', playerId)
          .eq('is_coach_confirmed', false)
          .or('locked_by_source.is.null,locked_by_source.eq.false')
      }
    }

    if (records.length) {
      await supabase.from('attendance')
        .upsert(records, { onConflict: 'event_id,user_id' })
    }
    return { calledUp: calledUpIds.size, excluded: excludedIds.size }
  },

  // ── مباريات بدون تشكيلة انتهت → تسجيل غياب وإنشاء إشعار ─────────
  async markUnlinedMatchesAbsent(teamId: string, markedBy?: string) {
    const now = new Date().toISOString()
    // جلب المباريات المنتهية من جدول events بـ event_type = 'match'
    const { data: matches } = await supabase.from('matches')
      .select('id, event_id, opponent, match_date, team_id')
      .eq('team_id', teamId)
      .lt('match_date', now)
    if (!matches?.length) return []

    // جلب المباريات التي لها تشكيلة مسجّلة
    const { data: lineups } = await supabase.from('match_lineup')
      .select('match_id').eq('team_id', teamId)
    const withLineup = new Set((lineups ?? []).map((l: any) => l.match_id))

    const unlined = matches.filter((m: any) => m.event_id && !withLineup.has(m.id))
    if (!unlined.length) return []

    // جلب اللاعبين النشطين
    const { data: members } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('status', 'active')
      .eq('role', 'player').is('removed_at', null)
    const playerIds = (members ?? []).map((m: any) => m.user_id)

    const records: any[] = []
    for (const match of unlined) {
      for (const pid of playerIds) {
        const { data: ex } = await supabase.from('attendance')
          .select('id').eq('event_id', match.event_id).eq('user_id', pid).maybeSingle()
        if (!ex) {
          records.push({
            event_id: match.event_id, team_id: teamId, user_id: pid,
            status: 'absent', absence_type: 'unexcused',
            source_type: 'match', is_coach_confirmed: false,
            admin_note: 'لم تُسجَّل تشكيلة المباراة',
            marked_by: markedBy || null,
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    if (records.length) {
      await supabase.from('attendance')
        .upsert(records, { onConflict: 'event_id,user_id' })
    }
    return unlined.map((m: any) => ({ id: m.id, title: m.opponent }))
  },

  // ── إحصاء حضور لاعب واحد ────────────────────────────────────────
  async getPlayerStats(
    teamId: string, userId: string,
    filters?: { fromDate?: string; toDate?: string; eventTypes?: string[] }
  ) {
    // 1. جلب كل مواعيد الفريق
    let evQuery = supabase.from('events')
      .select('id, event_type, start_datetime, att_member_ids, att_group')
      .eq('team_id', teamId).order('start_datetime', { ascending: true })
    if (filters?.fromDate) evQuery = evQuery.gte('start_datetime', `${filters.fromDate}T00:00:00`)
    if (filters?.toDate)   evQuery = evQuery.lte('start_datetime', `${filters.toDate}T23:59:59`)
    const { data: events } = await evQuery

    // 2. جلب تشكيلات المباريات لهذا اللاعب
    const { data: lineupRecords } = await supabase.from('match_lineup')
      .select('match_id, players').eq('team_id', teamId)
    const { data: matchRows } = await supabase.from('matches')
      .select('id, event_id').eq('team_id', teamId)
    const matchEventMap: Record<string, string> = {}
    ;(matchRows ?? []).forEach((m: any) => { if (m.event_id) matchEventMap[m.id] = m.event_id })

    const matchLineupMap = new Map<string, string>()
    ;(lineupRecords ?? []).forEach((lr: any) => {
      const found = (lr.players ?? []).find((p: any) => p.user_id === userId)
      if (found) matchLineupMap.set(matchEventMap[lr.match_id] || lr.match_id, found.role)
    })

    const allEventIds = (events ?? []).map((e: any) => e.id)
    const { data: preAttRecords } = await supabase.from('attendance')
      .select('event_id, status, absence_type, late_minutes, locked_by_source')
      .eq('team_id', teamId).eq('user_id', userId)
      .in('event_id', allEventIds.length ? allEventIds : ['__none__'])

    const preAttMap = new Map<string, any>()
    ;(preAttRecords ?? []).forEach((r: any) => preAttMap.set(r.event_id, r))

    // 3. جلب أعضاء الفريق لتحديد الأهلية
    const { data: members } = await supabase.from('team_members')
      .select('user_id, role').eq('team_id', teamId)
      .eq('status', 'active').is('removed_at', null)
    const memberObj = (members ?? []).find((m: any) => m.user_id === userId)

    // 4. تحديد المواعيد التي تخص اللاعب
    const eligibleEventIds: string[] = []
    for (const event of (events ?? [])) {
      if (filters?.eventTypes?.length && !filters.eventTypes.includes(event.event_type)) continue
      if (event.event_type === 'match') {
        const lineupRole = matchLineupMap.get(event.id)
        const officialExcuse = preAttMap.get(event.id)
        if (
          lineupRole === 'starter' || lineupRole === 'sub'
          || (officialExcuse?.status === 'excused' && officialExcuse?.locked_by_source)
        ) {
          eligibleEventIds.push(event.id)
        }
        // excluded أو غير موجود في القائمة = لا يُحتسب
      } else {
        const eligibleIds = getEligibleIdsNew(event, members ?? [])
        if (eligibleIds.includes(userId)) eligibleEventIds.push(event.id)
      }
    }

    // 5. جلب سجلات الحضور
    const attRecords = (preAttRecords ?? []).filter((r: any) => eligibleEventIds.includes(r.event_id))

    const attMap = new Map<string, any>()
    ;(attRecords ?? []).forEach((r: any) => attMap.set(r.event_id, r))

    // 6. حساب الإحصاء
    let present = 0, late = 0, absent = 0
    let lateMinutesTotal = 0
    const excused = { total: 0, leave: 0, injury: 0, nationalTeam: 0, adminSuspension: 0, emergency: 0, academic: 0, family: 0, cards: 0, other: 0 }

    for (const eventId of eligibleEventIds) {
      const r = attMap.get(eventId)
      if (!r) { absent++; continue }

      if (r.status === 'present') { present++ }
      else if (r.status === 'late') {
        late++; present++
        lateMinutesTotal += Number(r.late_minutes) || 0
      }
      else if (r.status === 'excused') {
        excused.total++
        const t = r.absence_type
        if (t === 'leave' || t === 'admin_leave') excused.leave++
        else if (t === 'injury')            excused.injury++
        else if (t === 'national_team')     excused.nationalTeam++
        else if (t === 'admin_suspension')  excused.adminSuspension++
        else if (t === 'emergency')         excused.emergency++
        else if (t === 'academic')          excused.academic++
        else if (t === 'family')            excused.family++
        else if (t === 'cards')             excused.cards++
        else                                excused.other++
      }
      else { // absent or uncertain (قديم)
        absent++
      }
    }

    const totalEvents = eligibleEventIds.length
    const generalRate  = totalEvents > 0 ? Math.round((present / totalEvents) * 100) : 0
    const denominator  = totalEvents - excused.total
    const effectiveRate = denominator > 0 ? Math.round((present / denominator) * 100) : 0

    return {
      userId, totalEvents, present, late,
      absent: absent,
      excused,
      lateMinutesTotal,
      lateAvgMinutes: late > 0 ? Math.round(lateMinutesTotal / late) : 0,
      generalRate,
      effectiveRate,
      streak: 0, // احسبه من الخارج لو احتجت
    }
  },

  async getPlayerAttendanceBreakdown(
    teamId: string,
    userId: string,
    filters?: { fromDate?: string; toDate?: string; eventTypes?: string[] }
  ) {
    const nowIso = new Date().toISOString()
    let toLimit = nowIso
    if (filters?.toDate) {
      const requestedTo = `${filters.toDate}T23:59:59`
      toLimit = new Date(requestedTo).getTime() < new Date(nowIso).getTime() ? requestedTo : nowIso
    }

    let evQuery = supabase.from('events')
      .select('id, title, event_type, start_datetime, att_member_ids, att_group')
      .eq('team_id', teamId)
      .lte('start_datetime', toLimit)
      .order('start_datetime', { ascending: true })
    if (filters?.fromDate) evQuery = evQuery.gte('start_datetime', `${filters.fromDate}T00:00:00`)
    const { data: events } = await evQuery
    const baseEvents = ((events ?? []) as any[]).filter(e =>
      !filters?.eventTypes?.length || filters.eventTypes.includes(e.event_type)
    )

    const eventIds = baseEvents.map(e => e.id)
    let attRecords: any[] = []
    if (eventIds.length) {
      const { data } = await supabase.from('attendance')
        .select('id, event_id, status, absence_type, late_minutes, excuse_reason, admin_note, locked_by_source, source_type')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .in('event_id', eventIds)
      attRecords = data ?? []
    }

    const attMap = new Map<string, any>()
    attRecords.forEach((r: any) => attMap.set(r.event_id, r))

    const { data: members } = await supabase.from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)

    const { data: lineupRecords } = await supabase.from('match_lineup')
      .select('match_id, players')
      .eq('team_id', teamId)
    const { data: matchRows } = await supabase.from('matches')
      .select('id, event_id')
      .eq('team_id', teamId)

    const matchEventMap: Record<string, string> = {}
    ;(matchRows ?? []).forEach((m: any) => { if (m.event_id) matchEventMap[m.id] = m.event_id })

    const matchLineupMap = new Map<string, string>()
    ;(lineupRecords ?? []).forEach((lr: any) => {
      const found = (lr.players ?? []).find((p: any) => p.user_id === userId)
      if (found) matchLineupMap.set(matchEventMap[lr.match_id] || lr.match_id, found.role)
    })

    const emptyBucket = () => ({
      totalEvents: 0,
      present: 0,
      late: 0,
      lateMinutesTotal: 0,
      lateAvgMinutes: 0,
      absent: 0,
      excused: 0,
      generalRate: 0,
      effectiveRate: 0,
    })
    const byEventType: Record<string, any> = {
      match: emptyBucket(),
      training: emptyBucket(),
      meeting: emptyBucket(),
      assessment: emptyBucket(),
      camp: emptyBucket(),
      other: emptyBucket(),
    }
    const summary = emptyBucket()
    const excusedBreakdown = {
      leave: 0,
      injury: 0,
      nationalTeam: 0,
      adminSuspension: 0,
      cards: 0,
      emergency: 0,
      academic: 0,
      family: 0,
      other: 0,
    }

    const normalizedExcuseKey = (type: string | null | undefined) => {
      if (type === 'leave' || type === 'admin_leave') return 'leave'
      if (type === 'injury') return 'injury'
      if (type === 'national_team') return 'nationalTeam'
      if (type === 'admin_suspension') return 'adminSuspension'
      if (type === 'cards') return 'cards'
      if (type === 'emergency') return 'emergency'
      if (type === 'academic') return 'academic'
      if (type === 'family') return 'family'
      return 'other'
    }

    const displayEvents: any[] = []
    let notCalledMatches = 0

    for (const event of baseEvents) {
      const type = byEventType[event.event_type] ? event.event_type : 'other'
      const att = attMap.get(event.id)
      let counts = false
      let notCalled = false

      if (event.event_type === 'match') {
        const lineupRole = matchLineupMap.get(event.id)
        counts = lineupRole === 'starter' || lineupRole === 'sub' || (att?.status === 'excused' && att?.locked_by_source)
        notCalled = !counts
      } else {
        const eligibleIds = getEligibleIdsNew(event, members ?? [])
        counts = eligibleIds.includes(userId)
      }

      if (!counts) {
        if (event.event_type === 'match' && notCalled) {
          notCalledMatches++
          displayEvents.push({
            event,
            eventId: event.id,
            eventType: event.event_type,
            counted: false,
            status: 'not_called',
            label: 'غير مستدعى',
          })
        }
        continue
      }

      const bucket = byEventType[type]
      summary.totalEvents++
      bucket.totalEvents++

      const status = att?.status || 'absent'
      const row: any = {
        event,
        eventId: event.id,
        eventType: event.event_type,
        counted: true,
        status,
        absenceType: att?.absence_type || (status === 'absent' ? 'unexcused' : null),
        lateMinutes: Number(att?.late_minutes) || 0,
        excuseReason: att?.excuse_reason || att?.admin_note || null,
      }

      if (status === 'present') {
        summary.present++; bucket.present++
      } else if (status === 'late') {
        summary.present++; summary.late++
        bucket.present++; bucket.late++
        summary.lateMinutesTotal += row.lateMinutes
        bucket.lateMinutesTotal += row.lateMinutes
      } else if (status === 'excused') {
        summary.excused++; bucket.excused++
        const key = normalizedExcuseKey(att?.absence_type)
        ;(excusedBreakdown as any)[key]++
      } else {
        summary.absent++; bucket.absent++
        row.status = 'absent'
      }

      displayEvents.push(row)
    }

    const finalize = (bucket: any) => {
      bucket.lateAvgMinutes = bucket.late > 0 ? Math.round(bucket.lateMinutesTotal / bucket.late) : 0
      bucket.generalRate = bucket.totalEvents > 0
        ? Math.round((bucket.present / bucket.totalEvents) * 1000) / 10
        : 0
      const effectiveDenom = bucket.totalEvents - bucket.excused
      bucket.effectiveRate = effectiveDenom > 0
        ? Math.round((bucket.present / effectiveDenom) * 1000) / 10
        : 0
      bucket.effectiveDenominator = effectiveDenom
      return bucket
    }
    finalize(summary)
    Object.values(byEventType).forEach(finalize)

    return {
      summary,
      byEventType,
      excusedBreakdown,
      events: displayEvents.sort((a, b) =>
        new Date(b.event?.start_datetime || '').getTime() - new Date(a.event?.start_datetime || '').getTime()
      ),
      notCalledMatches,
      filters: { fromDate: filters?.fromDate || '', toDate: filters?.toDate || '', cappedAt: nowIso },
    }
  },

  // ── إحصاء كل أعضاء الفريق (للتقارير) ────────────────────────────
  async getTeamStats(
    teamId: string,
    filters?: { fromDate?: string; toDate?: string; eventTypes?: string[] }
  ) {
    const { data: members } = await supabase.from('team_members')
      .select('user_id, role, profile:profiles!user_id(id, full_name, avatar_url)')
      .eq('team_id', teamId).eq('status', 'active').is('removed_at', null)

    const results = await Promise.all(
      (members ?? []).map(async (m: any) => {
        const stats = await attendanceService.getPlayerStats(teamId, m.user_id, filters)
        return { ...stats, name: m.profile?.full_name || '', avatarUrl: m.profile?.avatar_url, role: m.role }
      })
    )
    return results
  },

  // ── البطولات: جلب قوانين إيقاف ───────────────────────────────────
  async getTournamentRules(tournamentId: string, teamId: string) {
    const { data } = await supabase.from('tournament_rules')
      .select('*').eq('tournament_id', tournamentId).eq('team_id', teamId).maybeSingle()
    return data
  },

  async saveTournamentRules(rules: {
    tournamentId: string; teamId: string; createdBy: string
    yellowCardsLimit: number; yellowSuspensionMatches: number
    doubleYellowSuspension: number; directRedSuspension: number
  }) {
    const payload = {
      tournament_id: rules.tournamentId, team_id: rules.teamId,
      yellow_cards_limit: rules.yellowCardsLimit,
      yellow_suspension_matches: rules.yellowSuspensionMatches,
      double_yellow_suspension: rules.doubleYellowSuspension,
      direct_red_suspension: rules.directRedSuspension,
      created_by: rules.createdBy,
    }
    return supabase.from('tournament_rules')
      .upsert(payload, { onConflict: 'tournament_id,team_id' }).select().single()
  },

  // ── البطولات: إنشاء إيقاف وتطبيقه ───────────────────────────────
  async applySuspensionToUpcomingMatches(suspension: any) {
    if (!suspension?.tournament_id || !suspension?.matches_count) return { count: 0 }
    const { data: matches } = await supabase.from('matches')
      .select('id, event_id, match_date')
      .eq('team_id', suspension.team_id)
      .eq('tournament_id', suspension.tournament_id)
      .gte('match_date', new Date().toISOString())
      .order('match_date', { ascending: true })
      .limit(Number(suspension.matches_count) || 0)

    const records = (matches ?? [])
      .filter((m: any) => m.event_id)
      .map((m: any) => ({
        event_id: m.event_id,
        team_id: suspension.team_id,
        user_id: suspension.player_id,
        status: 'excused',
        absence_type: 'cards',
        source_type: 'tournament_suspension',
        source_id: suspension.id,
        locked_by_source: true,
        is_coach_confirmed: false,
        has_excuse: true,
        excuse_reason: suspension.notes || suspension.reason || null,
        admin_note: suspension.notes || suspension.reason || null,
        marked_by: suspension.created_by || null,
        updated_at: new Date().toISOString(),
      }))

    if (!records.length) return { count: 0 }
    const { error } = await supabase.from('attendance')
      .upsert(records, { onConflict: 'event_id,user_id' })
    return { count: records.length, error }
  },

  async createSuspension(params: {
    tournamentId?: string; teamId: string; playerId: string
    reason: string; suspensionType: 'matches' | 'dates'
    matchesCount?: number; fromDate?: string; toDate?: string
    notes?: string; createdBy?: string
  }) {
    const { data: susp, error } = await supabase.from('tournament_suspensions')
      .insert({
        tournament_id: params.tournamentId || null,
        team_id: params.teamId, player_id: params.playerId,
        reason: params.reason, suspension_type: params.suspensionType,
        matches_count: params.matchesCount || null,
        from_date: params.fromDate || null, to_date: params.toDate || null,
        is_completed: false, notes: params.notes || null,
        created_by: params.createdBy || null,
      }).select().single()
    if (error || !susp) return { error }

    // طبّق على attendance
    if (params.suspensionType === 'dates' && params.fromDate && params.toDate) {
      let specificEventIds: string[] | undefined
      if (params.tournamentId) {
        const { data: matches } = await supabase.from('matches')
          .select('event_id')
          .eq('team_id', params.teamId)
          .eq('tournament_id', params.tournamentId)
          .gte('match_date', `${params.fromDate}T00:00:00`)
          .lte('match_date', `${params.toDate}T23:59:59`)
        specificEventIds = (matches ?? []).map((m: any) => m.event_id).filter(Boolean)
      }
      await attendanceService.applyExcusedAbsence({
        teamId: params.teamId, userIds: [params.playerId],
        fromDate: params.fromDate, toDate: params.toDate,
        eventTypes: ['match'],
        specificEventIds,
        absenceType: 'cards', sourceType: 'tournament_suspension',
        sourceId: susp.id, reason: params.notes,
        markedBy: params.createdBy,
      })
    }
    // إذا كان بالمباريات (matches): يُطبَّق لاحقاً عند تأكيد كل مباراة

    if (params.suspensionType === 'matches') {
      await attendanceService.applySuspensionToUpcomingMatches(susp)
    }

    return { data: susp }
  },

  // ── البطولات: حساب البطاقات وإنشاء إيقاف تلقائي ─────────────────
  async processCardEvent(params: {
    teamId: string; playerId: string; tournamentId: string
    cardType: 'yellow' | 'double_yellow' | 'direct_red'
    matchEventId: string; createdBy?: string
  }) {
    const { teamId, playerId, tournamentId, cardType, createdBy } = params

    const rules = await attendanceService.getTournamentRules(tournamentId, teamId)
    if (!rules) return null

    if (cardType === 'double_yellow') {
      return attendanceService.createSuspension({
        tournamentId, teamId, playerId,
        reason: 'double_yellow',
        suspensionType: 'matches',
        matchesCount: rules.double_yellow_suspension,
        notes: 'إيقاف تلقائي - بطاقتان صفراوان في نفس المباراة',
        createdBy,
      })
    }

    if (cardType === 'direct_red') {
      return attendanceService.createSuspension({
        tournamentId, teamId, playerId,
        reason: 'direct_red',
        suspensionType: 'matches',
        matchesCount: rules.direct_red_suspension,
        notes: 'إيقاف تلقائي - كرت أحمر مباشر',
        createdBy,
      })
    }

    if (cardType === 'yellow') {
      // عدّ الصفراء في مباريات هذه البطولة تحديداً
      const { data: yellowEvents } = await supabase.from('match_events')
        .select('id, match_id').eq('team_id', teamId)
        .eq('player_id', playerId).eq('event_type', 'yellow_card')
      const matchIds = (yellowEvents ?? []).map((e: any) => e.match_id)
      if (!matchIds.length) return null
      // تحقق أن المباريات تنتمي لنفس البطولة (via matches.tournament_id)
      const { data: tournamentMatchData } = await supabase.from('matches')
        .select('id').eq('tournament_id', tournamentId).in('id', matchIds)
      const yellowsInTournament = (tournamentMatchData ?? []).length

      if (yellowsInTournament > 0 && yellowsInTournament % rules.yellow_cards_limit === 0) {
        return attendanceService.createSuspension({
          tournamentId, teamId, playerId,
          reason: 'yellow_accumulation',
          suspensionType: 'matches',
          matchesCount: rules.yellow_suspension_matches,
          notes: `إيقاف تلقائي - ${yellowsInTournament} بطاقات صفراء في البطولة`,
          createdBy,
        })
      }
    }

    return null
  },

  // ── جلب إيقافات اللاعب النشطة ────────────────────────────────────
  async getActiveSuspensions(teamId: string, playerId?: string) {
    let q = supabase.from('tournament_suspensions')
      .select('*, profile:profiles!player_id(id, full_name, avatar_url)')
      .eq('team_id', teamId).eq('is_completed', false)
      .order('created_at', { ascending: false })
    if (playerId) q = q.eq('player_id', playerId)
    const { data } = await q
    return data ?? []
  },
}

// ── CALENDAR MARKERS ──────────────────────────────────────────────────
export const calendarMarkerService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('calendar_markers').select('*')
      .eq('team_id', teamId).order('start_date')
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('calendar_markers').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('calendar_markers').update(data).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('calendar_markers').delete().eq('id', id)
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
  async markAllReadForTeam(teamId: string, userId: string) {
    return supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('team_id', teamId)
  },
  async getForTeam(teamId: string, userId: string) {
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', userId).eq('team_id', teamId)
      .order('created_at', { ascending: false }).limit(40)
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('notifications').insert(data)
  },
  async markMailThreadRead(teamId: string, userId: string, threadId: string) {
    return supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .eq('type', 'mail')
      .eq('is_read', false)
      .eq('link', `/team/${teamId}/mail?thread=${threadId}`)
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

// ── ADMIN DECISIONS ───────────────────────────────────────────────────
export const adminDecisionService = {
  async getAll(teamId: string) {
    const { data, error } = await supabase.from('admin_decisions')
      .select('*, creator:profiles!created_by(id, full_name, avatar_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
    if (error) { console.error('[adminDecisionService.getAll]', error); return [] }
    return data ?? []
  },
  async create(data: any) {
    const result = await supabase.from('admin_decisions').insert(data).select().single()
    if (result.data) {
      const { data: events } = await supabase.from('events').select('*')
        .eq('team_id', data.team_id)
        .gte('start_datetime', `${data.from_date}T00:00:00`)
        .lte('start_datetime', `${data.to_date}T23:59:59`)
      await applyAdminDecisionsToEvents(data.team_id, events ?? [], data.created_by)
    }
    return result
  },
  async update(id: string, data: any) {
    const result = await supabase.from('admin_decisions')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (result.data) {
      await supabase.from('attendance')
        .delete()
        .eq('source_type', 'absence')
        .eq('source_id', id)

      if (result.data.is_active !== false) {
        const { data: events } = await supabase.from('events').select('*')
          .eq('team_id', result.data.team_id)
          .gte('start_datetime', `${result.data.from_date}T00:00:00`)
          .lte('start_datetime', `${result.data.to_date}T23:59:59`)
        await applyAdminDecisionsToEvents(result.data.team_id, events ?? [], data.updated_by || data.created_by)
      }
    }
    return result
  },
  async applyToEvents(teamId: string, events: any[], markedBy?: string) {
    return applyAdminDecisionsToEvents(teamId, events, markedBy)
  }
}

// ── ABSENCES ──────────────────────────────────────────────────────────
export const absenceService = {
  async getAll(teamId: string) {
    const { data, error } = await supabase.from('absences').select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    if (error) { console.error('[absenceService.getAll]', error); return [] }
    if (!data?.length) return []
    const userIds   = [...new Set(data.map((a: any) => a.user_id))]
    const recIds    = [...new Set(data.map((a: any) => a.recorded_by).filter(Boolean))]
    const allIds    = [...new Set([...userIds, ...recIds])]
    const { data: profs } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', allIds)
    const pm: Record<string, any> = {}
    ;(profs ?? []).forEach((p: any) => { pm[p.id] = p })
    return data.map((a: any) => ({
      ...a,
      profile:  pm[a.user_id]    ?? null,
      recorder: pm[a.recorded_by] ?? null,
    }))
  },
  async create(payload: any) {
    return supabase.from('absences').insert([payload]).select().single()
  },
  async remove(id: string) {
    return supabase.from('absences').delete().eq('id', id)
  },
}

// ── COACH NOTES ───────────────────────────────────────────────────────
export const noteService = {
  // Coach sees all notes they wrote for this player
  async getPlayerNotesForCoach(teamId: string, playerId: string, coachId: string) {
    const { data, error } = await supabase.from('coach_notes')
      .select('*, coach:profiles!coach_notes_coach_id_fkey(id, full_name, avatar_url)')
      .eq('team_id', teamId).eq('player_id', playerId).eq('coach_id', coachId)
      .order('created_at', { ascending: false })
    if (error) console.error('noteService.getPlayerNotesForCoach:', error.message)
    return { data: data ?? [], error }
  },
  // Player sees only notes the coach marked as visible
  async getMyNotes(teamId: string, playerId: string) {
    const { data, error } = await supabase.from('coach_notes')
      .select('*, coach:profiles!coach_notes_coach_id_fkey(id, full_name, avatar_url)')
      .eq('team_id', teamId).eq('player_id', playerId)
      .eq('is_visible_to_player', true)
      .order('created_at', { ascending: false })
    if (error) console.error('noteService.getMyNotes:', error.message)
    return { data: data ?? [], error }
  },
  async create(data: any) {
    return supabase.from('coach_notes').insert(data).select().single()
  },
  async addPlayerReply(noteId: string, reply: string) {
    return supabase.from('coach_notes').update({
      player_reply: reply,
      player_replied_at: new Date().toISOString()
    }).eq('id', noteId)
  },
  async markRead(playerId: string, teamId: string) {
    return supabase.from('coach_notes')
      .update({ is_read: true }).eq('player_id', playerId).eq('team_id', teamId)
  },
  async getUnreadCount(teamId: string, playerId: string) {
    const { count } = await supabase.from('coach_notes')
      .select('id', { count: 'exact' })
      .eq('team_id', teamId).eq('player_id', playerId)
      .eq('is_read', false).eq('is_visible_to_player', true)
    return count ?? 0
  }
}

// ── INTERNAL MAIL ─────────────────────────────────────────────────────
const MAIL_SELECT = '*, sender:profiles!internal_mail_sender_id_fkey(id, full_name, avatar_url), receiver:profiles!internal_mail_receiver_id_fkey(id, full_name, avatar_url)'

export const mailService = {
  async getInbox(teamId: string, userId: string) {
    const { data: roots, error } = await supabase.from('internal_mail')
      .select(MAIL_SELECT)
      .eq('team_id', teamId).eq('receiver_id', userId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
    if (error) console.error('mailService.getInbox:', error.message)

    const { data: receivedReplies, error: replyError } = await supabase.from('internal_mail')
      .select('id, parent_id, sender_id, receiver_id, is_read, created_at')
      .eq('team_id', teamId)
      .eq('receiver_id', userId)
      .not('parent_id', 'is', null)
      .order('created_at', { ascending: false })
    if (replyError) console.error('mailService.getInbox replies:', replyError.message)

    const rootMap = new Map<string, any>()
    ;(roots ?? []).forEach((m: any) => rootMap.set(m.id, { ...m, thread_last_at: m.created_at }))

    const missingParentIds = [...new Set((receivedReplies ?? [])
      .map((r: any) => r.parent_id)
      .filter((id: string) => id && !rootMap.has(id)))]

    if (missingParentIds.length) {
      const { data: parentRoots, error: parentError } = await supabase.from('internal_mail')
        .select(MAIL_SELECT)
        .in('id', missingParentIds)
      if (parentError) console.error('mailService.getInbox parent roots:', parentError.message)
      ;(parentRoots ?? []).forEach((m: any) => rootMap.set(m.id, { ...m, thread_last_at: m.created_at }))
    }

    ;(receivedReplies ?? []).forEach((r: any) => {
      const root = rootMap.get(r.parent_id)
      if (!root) return
      if (new Date(r.created_at).getTime() > new Date(root.thread_last_at || root.created_at).getTime()) {
        root.thread_last_at = r.created_at
      }
      if (!r.is_read) root.has_unread_reply = true
    })

    const data = [...rootMap.values()].sort((a, b) =>
      new Date(b.thread_last_at || b.created_at).getTime() - new Date(a.thread_last_at || a.created_at).getTime()
    )
    return { data, error: error || replyError }
  },
  async getSent(teamId: string, userId: string) {
    const { data, error } = await supabase.from('internal_mail')
      .select(MAIL_SELECT)
      .eq('team_id', teamId).eq('sender_id', userId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
    if (error) console.error('mailService.getSent:', error.message)
    return { data: data ?? [], error }
  },
  async getStarred(teamId: string, userId: string) {
    const { data, error } = await supabase.from('internal_mail')
      .select(MAIL_SELECT)
      .eq('team_id', teamId).eq('receiver_id', userId)
      .eq('is_starred', true).is('parent_id', null)
      .order('created_at', { ascending: false })
    if (error) console.error('mailService.getStarred:', error.message)
    return { data: data ?? [], error }
  },
  async getReplies(parentId: string) {
    const { data, error } = await supabase.from('internal_mail')
      .select(MAIL_SELECT)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true })
    if (error) console.error('mailService.getReplies:', error.message)
    return { data: data ?? [], error }
  },
  async send(data: any) {
    return supabase.from('internal_mail').insert(data).select().single()
  },
  async reply(parentId: string, data: any) {
    return supabase.from('internal_mail').insert({ ...data, parent_id: parentId }).select().single()
  },
  async markRead(mailId: string) {
    return supabase.from('internal_mail').update({ is_read: true }).eq('id', mailId)
  },
  async markThreadRepliesRead(parentId: string, userId: string) {
    return supabase.from('internal_mail')
      .update({ is_read: true })
      .eq('parent_id', parentId)
      .eq('receiver_id', userId)
      .eq('is_read', false)
  },
  async toggleStar(mailId: string, starred: boolean) {
    return supabase.from('internal_mail').update({ is_starred: starred }).eq('id', mailId)
  },
  async getUnreadCount(teamId: string, userId: string) {
    const { count } = await supabase.from('internal_mail')
      .select('id', { count: 'exact' })
      .eq('team_id', teamId).eq('receiver_id', userId).eq('is_read', false)
    return count ?? 0
  },
  // Returns reply stubs (id, sender_id) for a list of parent message IDs
  async getReplyStubs(parentIds: string[]) {
    if (!parentIds.length) return []
    const { data } = await supabase.from('internal_mail')
      .select('id, parent_id, sender_id, receiver_id, is_read, created_at')
      .in('parent_id', parentIds)
    return data ?? []
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
    const { data, error } = await supabase.from('points_transactions')
      .select('*')
      .eq('team_id', teamId).order('created_at', { ascending: false }).limit(limit)
    if (error) { console.error('[getHistory]', error.message); return [] }
    if (!data?.length) return []
    const uids = [...new Set(data.map((r: any) => r.user_id))]
    const { data: profs } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', uids)
    const pm: Record<string, any> = {}
    ;(profs ?? []).forEach((p: any) => { pm[p.id] = p })
    return data.map((r: any) => ({ ...r, profile: pm[r.user_id] ?? null }))
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
  async getUserPointsTotal(teamId: string, userId: string) {
    const { data } = await supabase.from('points_transactions')
      .select('points').eq('team_id', teamId).eq('user_id', userId)
    return (data ?? []).reduce((s: number, r: any) => s + (r.points || 0), 0)
  },
  async getPlayerTransactions(teamId: string, userId: string) {
    const { data } = await supabase.from('points_transactions')
      .select('id, points, category, reason, is_auto, created_at')
      .eq('team_id', teamId).eq('user_id', userId)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async awardAttendancePoints(teamId: string, userId: string, eventId: string, points: number, reason: string) {
    return supabase.from('points_transactions').insert({
      team_id: teamId, user_id: userId, event_id: eventId,
      points, category: 'حضور', reason, is_auto: true
    })
  },
  async revokeAttendancePoints(teamId: string, userId: string, eventId: string) {
    return supabase.from('points_transactions')
      .delete()
      .eq('team_id', teamId).eq('user_id', userId)
      .eq('event_id', eventId).eq('is_auto', true)
  },
  async awardStreakPoints(teamId: string, userId: string, eventId: string, points: number, reason: string) {
    // Prevent double-awarding streak bonus for the same event
    const { data: existing } = await supabase.from('points_transactions')
      .select('id').eq('team_id', teamId).eq('user_id', userId)
      .eq('event_id', eventId).eq('category', 'سلسلة').limit(1)
    if (existing && existing.length > 0) return
    return supabase.from('points_transactions').insert({
      team_id: teamId, user_id: userId, event_id: eventId,
      points, category: 'سلسلة', reason, is_auto: true
    })
  }
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
  async create(teamId: string, email: string, role: string, invitedBy: string) {
    const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
    const { data, error } = await supabase.from('invitations')
      .insert({ team_id: teamId, email, role, invited_by: invitedBy, token, status: 'pending' })
      .select().single()
    return { data, error, token }
  },
  // Look up invite by token using SECURITY DEFINER RPC
  async getByToken(token: string) {
    const { data, error } = await supabase.rpc('get_invite_by_token', { p_token: token })
    if (error || !data) return null
    return data as any
  },
  // Accept invite: add user to team with pre-set role, mark accepted, notify admin
  async acceptByToken(token: string, userId: string, userName: string) {
    const { data: inv } = await supabase.from('invitations')
      .select('*').eq('token', token).eq('status', 'pending').maybeSingle()
    if (!inv) return { error: 'الدعوة غير موجودة أو تم استخدامها' }
    // Check not already member
    const { data: existing } = await supabase.from('team_members')
      .select('id').eq('team_id', inv.team_id).eq('user_id', userId).eq('status', 'active').maybeSingle()
    if (existing) return { error: 'أنت عضو في هذا الفريق بالفعل' }
    // Add to team with pre-set role
    await supabase.from('team_members')
      .insert({ team_id: inv.team_id, user_id: userId, role: inv.role, status: 'active', is_visible: true })
    // Mark invite as accepted
    await supabase.from('invitations').update({ status: 'accepted' }).eq('id', inv.id)
    // Notify admins
    const { data: admins } = await supabase.from('team_members')
      .select('user_id').eq('team_id', inv.team_id).eq('status', 'active')
      .in('role', ['owner', 'administrator', 'head_coach'])
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({
          user_id: a.user_id, team_id: inv.team_id,
          title: '✅ قبل دعوتك',
          body: `${userName} قبل دعوتك وانضم كـ ${inv.role}`,
          type: 'general', is_read: false
        }))
      )
    }
    return { teamId: inv.team_id, role: inv.role, error: null }
  },
  async getMyInvitations(email: string) {
    const { data } = await supabase.from('invitations')
      .select('*, team:teams(*)')
      .eq('email', email).eq('status', 'pending')
    return data ?? []
  },
  async cancelInvite(id: string) {
    return supabase.from('invitations').update({ status: 'cancelled' }).eq('id', id)
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
  async getOne(id: string) {
    const { data } = await supabase.from('matches').select('*').eq('id', id).single()
    return data
  },
  async getByEventId(eventId: string) {
    const { data } = await supabase.from('matches').select('id').eq('event_id', eventId).maybeSingle()
    return data
  },
  async getUpcoming(teamId: string) {
    const { data } = await supabase.from('matches').select('*')
      .eq('team_id', teamId).eq('status', 'upcoming')
      .gte('match_date', new Date().toISOString())
      .order('match_date', { ascending: true })
    return data ?? []
  },
  async create(matchData: any, userId: string) {
    // 1. Create a linked event so the match appears in the schedule
    const { data: event, error: evErr } = await supabase.from('events').insert({
      team_id: matchData.team_id,
      title: `مباراة ضد ${matchData.opponent}`,
      event_type: 'match',
      start_datetime: matchData.match_date,
      location: matchData.location || '',
      att_group: 'اللاعبون فقط',
      is_locked: false,
      default_status: 'uncertain',
      created_by: userId
    }).select().single()
    if (evErr) throw evErr
    // 2. Insert only CORE columns that are guaranteed to exist in the base schema
    const corePayload: any = {
      team_id: matchData.team_id,
      opponent: matchData.opponent,
      match_date: matchData.match_date,
      location: matchData.location || '',
      match_type: matchData.match_type || 'friendly',
      home_away: matchData.home_away || 'home',
      status: matchData.status || 'upcoming',
      tournament_id: matchData.tournament_id || null,
      notes: matchData.notes || '',
      event_id: event.id,
      created_by: userId
    }
    const { data: match, error: mErr } = await supabase.from('matches')
      .insert(corePayload).select().single()
    if (mErr) {
      // Clean up orphaned event so it doesn't appear in the calendar
      await supabase.from('events').delete().eq('id', event.id)
      throw mErr
    }
    // 3. Try extended columns (V_MATCHES_V2+) — silently skip if migration not yet applied
    const ext: any = {}
    if (matchData.map_url) ext.map_url = matchData.map_url
    if (matchData.leg && matchData.leg !== 'none') ext.leg = matchData.leg
    if (matchData.round_number) ext.round_number = parseInt(String(matchData.round_number))
    if (matchData.stage) ext.stage = matchData.stage
    if (Object.keys(ext).length > 0) {
      await supabase.from('matches').update(ext).eq('id', match.id)
    }
    return { data: match, error: null }
  },
  async update(id: string, data: any) {
    // Sync title/date/location to linked event if it exists
    const { data: match } = await supabase.from('matches').select('event_id,opponent').eq('id', id).single()
    if (match?.event_id) {
      const patch: any = {}
      if (data.match_date) patch.start_datetime = data.match_date
      if (data.location !== undefined) patch.location = data.location
      if (data.map_url !== undefined) patch.map_url = data.map_url
      if (data.opponent) patch.title = `مباراة ضد ${data.opponent}`
      if (Object.keys(patch).length) {
        await supabase.from('events').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', match.event_id)
      }
    }
    return supabase.from('matches').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async delete(id: string) {
    const { data: match } = await supabase.from('matches').select('event_id').eq('id', id).single()
    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) throw error
    if (match?.event_id) await supabase.from('events').delete().eq('id', match.event_id)
  },
  async syncCardCounts(matchId: string) {
    const { data: events } = await supabase.from('match_events')
      .select('event_type, player_id').eq('match_id', matchId)
    const yellow = (events ?? []).filter((e: any) => e.event_type === 'yellow_card').map((e: any) => e.player_id).filter(Boolean)
    const red = (events ?? []).filter((e: any) => e.event_type === 'red_card').map((e: any) => e.player_id).filter(Boolean)
    return supabase.from('matches').update({ yellow_cards: yellow, red_cards: red }).eq('id', matchId)
  }
}

// ── MATCH LINEUP ────────────────────────────────────────────────────────
export const matchLineupService = {
  async get(matchId: string) {
    const { data } = await supabase.from('match_lineup').select('*').eq('match_id', matchId).maybeSingle()
    return data
  },
  async save(matchId: string, teamId: string, formation: string, players: any[], userId: string) {
    return supabase.from('match_lineup').upsert(
      { match_id: matchId, team_id: teamId, formation, players, created_by: userId, updated_at: new Date().toISOString() },
      { onConflict: 'match_id' }
    )
  }
}

// ── MATCH EVENTS ────────────────────────────────────────────────────────
export const matchEventsService = {
  async getAll(matchId: string) {
    const { data } = await supabase.from('match_events')
      .select('*, player:profiles!player_id(id,full_name), player_out:profiles!player_out_id(id,full_name)')
      .eq('match_id', matchId).order('minute', { ascending: true })
    return data ?? []
  },
  async add(data: any) {
    return supabase.from('match_events').insert(data).select().single()
  },
  async remove(id: string) {
    return supabase.from('match_events').delete().eq('id', id)
  }
}

// ── MATCH STATS ─────────────────────────────────────────────────────────
export const matchStatsService = {
  async getTeamMatchStats(teamId: string) {
    const { data: matches } = await supabase.from('matches')
      .select('id, match_date, tournament_id, status, goals_for, goals_against, opponent, home_away, location, round_number')
      .eq('team_id', teamId)
    const matchIds = (matches ?? []).map((m: any) => m.id)
    if (matchIds.length === 0) return { matches: [], lineups: [], events: [] }
    const [lineupRes, eventRes] = await Promise.all([
      supabase.from('match_lineup').select('match_id, players').in('match_id', matchIds),
      supabase.from('match_events')
        .select('match_id, event_type, player_id, player_out_id, minute')
        .in('match_id', matchIds)
    ])
    return {
      matches: matches ?? [],
      lineups: lineupRes.data ?? [],
      events: eventRes.data ?? []
    }
  }
}

// ── MATCH NOTES ─────────────────────────────────────────────────────────
export const matchNotesService = {
  async getAll(matchId: string) {
    const { data } = await supabase.from('match_notes')
      .select('*').eq('match_id', matchId).order('created_at', { ascending: true })
    return data ?? []
  },
  async add(data: any) {
    return supabase.from('match_notes').insert(data).select().single()
  },
  async update(id: string, content: string, visibility: string) {
    return supabase.from('match_notes').update({ content, visibility, updated_at: new Date().toISOString() }).eq('id', id)
  },
  async remove(id: string) {
    return supabase.from('match_notes').delete().eq('id', id)
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
  async closePoll(pollId: string, winnerId: string, teamId: string, pts: number) {
    await supabase.from('best_player_polls').update({ status: 'closed', winner_id: winnerId, closed_at: new Date().toISOString() }).eq('id', pollId)
    // Award points
    await supabase.from('points_transactions').insert({ team_id: teamId, user_id: winnerId, points: pts, category: 'مكافأة', reason: 'أفضل لاعب', is_auto: true })
  },
  async vote(pollId: string, voterId: string, nomineeId: string) {
    return supabase.from('best_player_votes').upsert({ poll_id: pollId, voter_id: voterId, nominee_id: nomineeId }, { onConflict: 'poll_id,voter_id' })
  },
  async getVotes(pollId: string) {
    const { data } = await supabase.from('best_player_votes').select('*, nominee:profiles!nominee_id(id,full_name)').eq('poll_id', pollId)
    return data ?? []
  },
  async getMyVote(pollId: string, voterId: string) {
    const { data } = await supabase.from('best_player_votes').select('nominee_id').eq('poll_id', pollId).eq('voter_id', voterId).single()
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
  async set(teamId: string, userId: string, month: number, year: number, note: string, createdBy: string, announceNow: boolean) {
    return supabase.from('monthly_stars').upsert({
      team_id: teamId, user_id: userId, month, year,
      note: note || null, created_by: createdBy,
      announced_at: announceNow ? new Date().toISOString() : null
    }, { onConflict: 'team_id,month,year' })
      .select('*, player:profiles!user_id(id, full_name, avatar_url)').single()
  },
  async announce(id: string) {
    return supabase.from('monthly_stars').update({ announced_at: new Date().toISOString() }).eq('id', id)
  }
}


// ── TEAM EXPENSES ─────────────────────────────────────────────────────
export const teamExpensesService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('team_expenses')
      .select('*, creator:profiles!created_by(full_name)')
      .eq('team_id', teamId).order('expense_date', { ascending: false })
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('team_expenses').insert(data).select().single()
  },
  async update(id: string, data: any) {
    return supabase.from('team_expenses').update(data).eq('id', id)
  },
  async delete(id: string) {
    return supabase.from('team_expenses').delete().eq('id', id)
  },
  async uploadReceiptImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxW = 1200
          const scale = img.width > maxW ? maxW / img.width : 1
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.75))
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  },
}

// ── FIXED EXPENSES ────────────────────────────────────────────────────
export const fixedExpensesService = {
  async getItems(teamId: string) {
    const { data } = await supabase.from('fixed_expense_items')
      .select('*').eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async createItem(data: any) {
    return supabase.from('fixed_expense_items').insert(data).select().single()
  },
  async updateItem(id: string, data: any) {
    return supabase.from('fixed_expense_items').update(data).eq('id', id)
  },
  async deleteItem(id: string) {
    return supabase.from('fixed_expense_items').delete().eq('id', id)
  },
  async getPayments(teamId: string) {
    const { data } = await supabase.from('fixed_expense_payments')
      .select('*').eq('team_id', teamId).order('period_month', { ascending: false })
    return data ?? []
  },
  async createPayment(data: any) {
    return supabase.from('fixed_expense_payments').insert(data).select().single()
  },
  async editPayment(id: string, data: any) {
    return supabase.from('fixed_expense_payments').update(data).eq('id', id)
  },
}

// ── MEDICAL REPORTS ───────────────────────────────────────────────────
export const medicalService = {
  async getReports(teamId: string) {
    const { data } = await supabase.from('medical_reports')
      .select('*, player:profiles!player_id(id, full_name, avatar_url), submitter:profiles!submitted_by(full_name)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },
  async getMyReports(teamId: string, userId: string) {
    const { data } = await supabase.from('medical_reports')
      .select('*').eq('team_id', teamId).eq('player_id', userId)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async getPlayerReports(teamId: string, playerId: string) {
    const { data } = await supabase.from('medical_reports')
      .select('*, player:profiles!player_id(id, full_name, avatar_url), submitter:profiles!submitted_by(full_name)')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('created_at', { ascending: false })
    return data ?? []
  },
  async createReport(data: any) {
    return supabase.from('medical_reports').insert(data).select().single()
  },
  async updateReport(id: string, data: any) {
    return supabase.from('medical_reports').update(data).eq('id', id)
  },
  async getNotes(reportId: string) {
    const { data } = await supabase.from('medical_report_notes')
      .select('*, author:profiles!author_id(full_name, avatar_url)')
      .eq('report_id', reportId).order('created_at', { ascending: true })
    return data ?? []
  },
  async addNote(data: any) {
    return supabase.from('medical_report_notes').insert(data).select().single()
  },
  async uploadAttachment(file: File, path: string): Promise<{ url: string | null; error: string | null }> {
    try {
      const { data, error } = await supabase.storage.from('medical-files').upload(path, file, { upsert: true })
      if (error) return { url: null, error: error.message }
      const { data: { publicUrl } } = supabase.storage.from('medical-files').getPublicUrl(data.path)
      return { url: publicUrl, error: null }
    } catch (e: any) {
      return { url: null, error: e?.message || 'فشل رفع الملف' }
    }
  },

  // ── medical_cases (new structured system) ──────────────────────────────

  async getCases(teamId: string) {
    const { data } = await supabase.from('medical_cases')
      .select('*, player:profiles!player_id(id, full_name, avatar_url), submitter:profiles!submitted_by(full_name)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
  },

  async getMyCases(teamId: string, userId: string) {
    const { data } = await supabase.from('medical_cases')
      .select('*').eq('team_id', teamId).eq('player_id', userId)
      .order('created_at', { ascending: false })
    return data ?? []
  },

  async getPlayerCases(teamId: string, playerId: string) {
    const { data } = await supabase.from('medical_cases')
      .select('*, player:profiles!player_id(id, full_name, avatar_url), submitter:profiles!submitted_by(full_name)')
      .eq('team_id', teamId).eq('player_id', playerId)
      .order('created_at', { ascending: false })
    return data ?? []
  },

  async createCase(data: any) {
    return supabase.from('medical_cases').insert(data).select().single()
  },

  async updateCase(id: string, data: any) {
    return supabase.from('medical_cases')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  },

  async logAudit(entries: Array<{ case_id: string; team_id: string; changed_by: string; field_name: string; old_value: string | null; new_value: string | null }>) {
    if (!entries.length) return
    await supabase.from('medical_case_audit_logs').insert(entries)
  },

  async checkRecurrence(playerId: string, bodyRegion: string, bodySide: string, detailedDiagnosis: string, excludeId?: string) {
    let query = supabase.from('medical_cases')
      .select('id, onset_date, status, body_region, body_side, body_location, tissue_type, detailed_diagnosis, created_at')
      .eq('player_id', playerId)
      .eq('case_type', 'injury')
      .order('created_at', { ascending: false })
      .limit(10)
    if (bodyRegion) query = (query as any).eq('body_region', bodyRegion)
    if (excludeId) query = (query as any).neq('id', excludeId)
    const { data } = await query
    const all = (data ?? []) as any[]
    return all.filter((c: any) =>
      (!bodySide || c.body_side === bodySide) &&
      (!detailedDiagnosis || c.detailed_diagnosis === detailedDiagnosis)
    )
  },

  async getCaseNotes(caseId: string) {
    const { data } = await supabase.from('medical_case_notes')
      .select('*, author:profiles!author_id(full_name, avatar_url)')
      .eq('case_id', caseId).order('created_at', { ascending: true })
    return data ?? []
  },

  async addCaseNote(data: any) {
    return supabase.from('medical_case_notes').insert(data).select().single()
  },

  async deleteCase(id: string) {
    return supabase.from('medical_cases').delete().eq('id', id)
  },

  async getCaseStats(teamId: string) {
    const { data } = await supabase.from('medical_cases')
      .select('id, case_type, status, is_recurrence, onset_date, actual_return_date, absence_days')
      .eq('team_id', teamId)
    const cases = (data ?? []) as any[]
    const thisMonth = new Date().toISOString().slice(0, 7)
    return {
      total: cases.length,
      active: cases.filter(c => c.status === 'active').length,
      monitoring: cases.filter(c => c.status === 'monitoring').length,
      recovered: cases.filter(c => c.status === 'recovered').length,
      injuries: cases.filter(c => c.case_type === 'injury').length,
      illness: cases.filter(c => c.case_type === 'illness').length,
      recurrences: cases.filter(c => c.is_recurrence).length,
      recoveredThisMonth: cases.filter(c =>
        c.status === 'recovered' && (c.actual_return_date || '').startsWith(thisMonth)
      ).length,
      avgAbsenceDays: cases.length > 0
        ? Math.round(cases.reduce((s, c) => s + (c.absence_days || 0), 0) / cases.length)
        : 0,
    }
  },
}

// ── PLATFORM ADMIN ─────────────────────────────────────────────────────
export const adminService = {
  async isPlatformAdmin(userId: string) {
    const { data } = await supabase.from('profiles')
      .select('is_platform_admin').eq('id', userId).single()
    return !!(data as any)?.is_platform_admin
  },
  async getStats() {
    const { data, error } = await supabase.rpc('get_platform_stats')
    if (error) throw error
    return data as any
  },
  async getTeams(limit = 50, offset = 0) {
    const { data, error } = await supabase.rpc('admin_get_teams', { p_limit: limit, p_offset: offset })
    if (error) throw error
    return (data ?? []) as any[]
  },
  async getUsers(limit = 50, offset = 0, search = '') {
    const { data, error } = await supabase.rpc('admin_get_users', { p_limit: limit, p_offset: offset, p_search: search })
    if (error) throw error
    return (data ?? []) as any[]
  },
  async getTeamDetail(teamId: string) {
    const { data, error } = await supabase.rpc('admin_get_team_detail', { p_team_id: teamId })
    if (error) throw error
    return data as any
  },
  async toggleTeam(teamId: string, active: boolean) {
    return supabase.rpc('admin_toggle_team', { p_team_id: teamId, p_active: active })
  },
  async setPlatformAdmin(userId: string, value: boolean) {
    return supabase.rpc('admin_set_platform_admin', { p_user_id: userId, p_value: value })
  },
}

// ── SUBSCRIPTIONS ──────────────────────────────────────────────────────
export const subscriptionService = {
  async getTeamSubscriptions(teamId: string) {
    const { data } = await supabase.rpc('get_team_subscriptions', { p_team_id: teamId })
    return (data ?? []) as any[]
  },

  async getTeamSubscriptionsAll(teamId: string) {
    const { data } = await supabase.rpc('get_team_subscriptions_all', { p_team_id: teamId })
    return (data ?? []) as any[]
  },

  async renewSubscription(teamId: string, playerId: string, opts: {
    months: number
    startDate: string
    originalAmount: number
    discountType: 'percent' | 'fixed' | null
    discountValue: number
    paymentStatus: 'paid' | 'partial' | 'unpaid'
    paidAmount: number | null
    notes: string
    renewedBy: string
  }) {
    const startDate = new Date(opts.startDate)
    const endDate = new Date(opts.startDate)
    endDate.setMonth(endDate.getMonth() + opts.months)

    let finalAmount = opts.originalAmount * opts.months
    if (opts.discountType === 'percent')
      finalAmount = finalAmount * (1 - opts.discountValue / 100)
    else if (opts.discountType === 'fixed')
      finalAmount = Math.max(0, finalAmount - opts.discountValue)
    finalAmount = Math.round(finalAmount * 100) / 100

    const paidAmt = opts.paymentStatus === 'paid' ? finalAmount
      : opts.paymentStatus === 'partial' ? (opts.paidAmount || 0)
      : 0

    return supabase.from('member_subscriptions').insert({
      team_id: teamId,
      player_id: playerId,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      months: opts.months,
      original_amount: opts.originalAmount,
      discount_type: opts.discountType,
      discount_value: opts.discountValue,
      final_amount: finalAmount,
      payment_status: opts.paymentStatus,
      paid_amount: paidAmt,
      notes: opts.notes || null,
      renewed_by: opts.renewedBy,
    })
  },

  async getMySubscription(teamId: string, playerId: string) {
    const { data } = await supabase
      .from('member_subscriptions')
      .select('*')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  },

  async checkNotifications(teamId: string) {
    await supabase.rpc('check_subscription_notifications', { p_team_id: teamId })
  },
}

// ── MEMBER FREEZE ──────────────────────────────────────────────────────
export const memberFreezeService = {
  async toggleFreeze(teamId: string, userId: string, freeze: boolean) {
    return supabase.rpc('toggle_member_freeze', {
      p_team_id: teamId,
      p_user_id: userId,
      p_freeze: freeze,
    })
  },
}

// ── MEASUREMENTS ───────────────────────────────────────────────────────
export const measurementService = {
  // Returns all players (player/coach roles) with their full measurement history for the team
  async getPlayersWithMeasurements(teamId: string) {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role, profile:profiles!user_id(id, full_name, avatar_url, date_of_birth)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)
      .in('role', ['player', 'head_coach', 'assistant_coach', 'medical'])
    if (!members?.length) return []

    const playerIds = members.map((m: any) => m.user_id)
    const { data: measurements } = await supabase
      .from('player_basic_measurements')
      .select('*')
      .eq('team_id', teamId)
      .in('player_id', playerIds)
      .is('deleted_at', null)
      .order('measurement_date', { ascending: false })

    const byPlayer: Record<string, any[]> = {}
    ;(measurements ?? []).forEach((m: any) => {
      if (!byPlayer[m.player_id]) byPlayer[m.player_id] = []
      byPlayer[m.player_id].push(m)
    })

    return members.map((m: any) => ({
      ...(m.profile as any),
      role: m.role,
      measurements: byPlayer[m.user_id] ?? [],
    }))
  },

  async getPlayerMeasurements(teamId: string, playerId: string) {
    const { data } = await supabase
      .from('player_basic_measurements')
      .select('*')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .is('deleted_at', null)
      .order('measurement_date', { ascending: false })
    return data ?? []
  },

  async addMeasurement(record: any) {
    const { data, error } = await supabase
      .from('player_basic_measurements')
      .insert(record)
      .select()
      .single()
    if (data && !error) {
      await supabase.from('player_basic_measurement_audits').insert({
        measurement_id: data.id,
        team_id: data.team_id,
        player_id: data.player_id,
        action: 'create',
        changed_by: record.created_by,
        new_values: record,
      })
    }
    return { data, error }
  },

  async updateMeasurement(id: string, teamId: string, playerId: string, updates: any, editReason: string, changedBy: string) {
    const { data: old } = await supabase
      .from('player_basic_measurements')
      .select('*')
      .eq('id', id)
      .single()
    if (!old) return { data: null, error: new Error('السجل غير موجود') }
    if ((old.edit_count ?? 0) >= 3) return { data: null, error: new Error('MAX_EDITS') }
    const { data, error } = await supabase
      .from('player_basic_measurements')
      .update({ ...updates, updated_at: new Date().toISOString(), edit_count: (old.edit_count ?? 0) + 1 })
      .eq('id', id)
      .select()
      .single()
    if (!error) {
      await supabase.from('player_basic_measurement_audits').insert({
        measurement_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'edit',
        changed_by: changedBy,
        reason: editReason,
        old_values: old,
        new_values: updates,
      })
    }
    return { data, error }
  },

  async deleteMeasurement(id: string, teamId: string, playerId: string, deleteReason: string, deletedBy: string) {
    const { data: old } = await supabase
      .from('player_basic_measurements')
      .select('*')
      .eq('id', id)
      .single()
    const { error } = await supabase
      .from('player_basic_measurements')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, delete_reason: deleteReason })
      .eq('id', id)
    if (!error && old) {
      await supabase.from('player_basic_measurement_audits').insert({
        measurement_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'delete',
        changed_by: deletedBy,
        reason: deleteReason,
        old_values: old,
      })
    }
    return { error }
  },
}

// ── FITNESS MEASUREMENTS ───────────────────────────────────────────────
export const fitnessService = {
  async getLatestFitnessResultsForTeam(teamId: string) {
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, role, profile:profiles!user_id(id, full_name, avatar_url, date_of_birth, jersey_number, position)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)
      .in('role', ['player', 'head_coach', 'assistant_coach', 'medical'])
    if (!members) return []

    const playerIds = members.map((m: any) => m.user_id)
    const { data: results } = await supabase
      .from('player_fitness_test_results')
      .select('*')
      .eq('team_id', teamId)
      .in('player_id', playerIds)
      .is('deleted_at', null)
      .order('test_date', { ascending: false })

    const allResults: any[] = results ?? []

    return members.map((m: any) => ({
      ...m.profile,
      role: m.role,
      results: allResults.filter((r: any) => r.player_id === m.user_id),
    }))
  },

  async getPlayerFitnessResults(teamId: string, playerId: string) {
    const { data } = await supabase
      .from('player_fitness_test_results')
      .select('*')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .is('deleted_at', null)
      .order('test_date', { ascending: false })
    return data ?? []
  },

  async getPlayerFitnessResultsByTest(teamId: string, playerId: string, testKey: string) {
    const { data } = await supabase
      .from('player_fitness_test_results')
      .select('*')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('test_key', testKey)
      .is('deleted_at', null)
      .order('test_date', { ascending: false })
    return data ?? []
  },

  async checkSameDayResult(teamId: string, playerId: string, testKey: string, testDate: string, excludeId?: string) {
    let q = supabase
      .from('player_fitness_test_results')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('test_key', testKey)
      .eq('test_date', testDate)
      .is('deleted_at', null)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q
    return (data ?? []).length > 0
  },

  async addFitnessTestResult(record: any) {
    const { data, error } = await supabase
      .from('player_fitness_test_results')
      .insert(record)
      .select()
      .single()
    if (!error && data) {
      await supabase.from('player_fitness_test_audit_logs').insert({
        result_id: data.id,
        team_id: data.team_id,
        player_id: data.player_id,
        action: 'create',
        changed_by: record.created_by,
        new_values: record,
      })
    }
    return { data, error }
  },

  async updateFitnessTestResult(
    id: string,
    teamId: string,
    playerId: string,
    updates: any,
    editReason: string,
    changedBy: string
  ) {
    const { data: old } = await supabase
      .from('player_fitness_test_results')
      .select('*')
      .eq('id', id)
      .single()
    if (!old) return { data: null, error: new Error('السجل غير موجود') }
    if ((old.edit_count ?? 0) >= 3) return { data: null, error: new Error('MAX_EDITS') }
    const { data, error } = await supabase
      .from('player_fitness_test_results')
      .update({ ...updates, updated_at: new Date().toISOString(), edit_count: (old.edit_count ?? 0) + 1 })
      .eq('id', id)
      .select()
      .single()
    if (!error) {
      await supabase.from('player_fitness_test_audit_logs').insert({
        result_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'edit',
        changed_by: changedBy,
        reason: editReason,
        old_values: old,
        new_values: updates,
      })
    }
    return { data, error }
  },

  async deleteFitnessTestResult(
    id: string,
    teamId: string,
    playerId: string,
    deleteReason: string,
    deletedBy: string
  ) {
    const { data: old } = await supabase
      .from('player_fitness_test_results')
      .select('*')
      .eq('id', id)
      .single()
    const { error } = await supabase
      .from('player_fitness_test_results')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, delete_reason: deleteReason })
      .eq('id', id)
    if (!error && old) {
      await supabase.from('player_fitness_test_audit_logs').insert({
        result_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'delete',
        changed_by: deletedBy,
        reason: deleteReason,
        old_values: old,
      })
    }
    return { error }
  },
}

// ── REGULATIONS ────────────────────────────────────────────────────────
export const regulationsService = {
  async getAll(teamId: string) {
    const { data } = await supabase.from('regulations')
      .select('*, author:profiles!created_by(full_name)')
      .eq('team_id', teamId).order('published_at', { ascending: false })
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

// ── TECHNICAL EVALUATIONS ─────────────────────────────────────────────
export const technicalEvalService = {
  async getSettings(teamId: string) {
    const { data } = await supabase
      .from('team_evaluation_settings')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle()
    if (!data) {
      return {
        show_overall_score: true,
        show_strength_average: true,
        show_development_average: true,
        minimum_indicators_for_overall_score: 5,
        require_note_for_score: true,
        require_evidence_for_indicator: true,
        allow_coach_to_hide_overall_score: true,
      }
    }
    return data
  },

  async saveSettings(teamId: string, settings: any, userId: string) {
    const { data: existing } = await supabase
      .from('team_evaluation_settings')
      .select('id')
      .eq('team_id', teamId)
      .maybeSingle()
    if (existing) {
      return supabase
        .from('team_evaluation_settings')
        .update({ ...settings, updated_by: userId, updated_at: new Date().toISOString() })
        .eq('team_id', teamId)
    } else {
      return supabase
        .from('team_evaluation_settings')
        .insert({ team_id: teamId, ...settings, updated_by: userId })
    }
  },

  async getPlayersForTeam(teamId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('user_id, role, profile:profiles!user_id(id, full_name, avatar_url, date_of_birth)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .is('removed_at', null)
      .eq('role', 'player')
    return (data ?? []).map((m: any) => ({
      ...(m.profile as any),
      role: m.role,
    }))
  },

  async getAllTeamIndicatorSummaries(teamId: string, season: string) {
    const { data } = await supabase
      .from('player_development_indicators')
      .select('id, player_id, indicator_type, current_score, start_score, created_at')
      .eq('team_id', teamId)
      .eq('season', season)
      .is('deleted_at', null)
    return data ?? []
  },

  async getPlayerIndicators(teamId: string, playerId: string, season: string) {
    const { data } = await supabase
      .from('player_development_indicators')
      .select('*, reviews:player_indicator_reviews(id, review_date, review_type, score, note, evidence, next_action, reviewed_by, created_at, deleted_at, deleted_by, delete_reason)')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('season', season)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    return data ?? []
  },

  async addIndicator(record: any, userId: string) {
    const { data, error } = await supabase
      .from('player_development_indicators')
      .insert({ ...record, created_by: userId })
      .select()
      .single()
    if (!error && data) {
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: data.id,
        team_id: record.team_id,
        player_id: record.player_id,
        action: 'create_indicator',
        new_values: record,
        changed_by: userId,
      })
    }
    return { data, error }
  },

  async updateIndicator(id: string, teamId: string, playerId: string, updates: any, reason: string, userId: string) {
    const { data: old } = await supabase
      .from('player_development_indicators')
      .select('*')
      .eq('id', id)
      .single()
    const { data, error } = await supabase
      .from('player_development_indicators')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (!error) {
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'update_indicator',
        old_values: old,
        new_values: updates,
        reason,
        changed_by: userId,
      })
    }
    return { data, error }
  },

  async softDeleteIndicator(id: string, teamId: string, playerId: string, reason: string, userId: string) {
    const { data: old } = await supabase
      .from('player_development_indicators')
      .select('*')
      .eq('id', id)
      .single()
    const { error } = await supabase
      .from('player_development_indicators')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId, delete_reason: reason })
      .eq('id', id)
    if (!error) {
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: id,
        team_id: teamId,
        player_id: playerId,
        action: 'delete_indicator',
        old_values: old,
        reason,
        changed_by: userId,
      })
    }
    return { error }
  },

  async addReview(record: any, userId: string) {
    const { data, error } = await supabase
      .from('player_indicator_reviews')
      .insert({ ...record, reviewed_by: userId })
      .select()
      .single()
    if (!error && data) {
      await supabase
        .from('player_development_indicators')
        .update({ current_score: record.score, updated_at: new Date().toISOString() })
        .eq('id', record.indicator_id)
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: record.indicator_id,
        review_id: data.id,
        team_id: record.team_id,
        player_id: record.player_id,
        action: 'add_review',
        new_values: record,
        changed_by: userId,
      })
    }
    return { data, error }
  },

  async updateReview(reviewId: string, indicatorId: string, teamId: string, playerId: string, updates: any, reason: string, userId: string) {
    const { data: old } = await supabase
      .from('player_indicator_reviews')
      .select('*')
      .eq('id', reviewId)
      .single()
    const { data, error } = await supabase
      .from('player_indicator_reviews')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .select()
      .single()
    if (!error) {
      await technicalEvalService.recalculateCurrentScore(indicatorId)
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: indicatorId,
        review_id: reviewId,
        team_id: teamId,
        player_id: playerId,
        action: 'update_review',
        old_values: old,
        new_values: updates,
        reason,
        changed_by: userId,
      })
    }
    return { data, error }
  },

  async softDeleteReview(reviewId: string, indicatorId: string, teamId: string, playerId: string, reason: string, userId: string) {
    const { data: old } = await supabase
      .from('player_indicator_reviews')
      .select('*')
      .eq('id', reviewId)
      .single()
    const { error } = await supabase
      .from('player_indicator_reviews')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId, delete_reason: reason })
      .eq('id', reviewId)
    if (!error) {
      await technicalEvalService.recalculateCurrentScore(indicatorId)
      await supabase.from('player_indicator_audit_logs').insert({
        indicator_id: indicatorId,
        review_id: reviewId,
        team_id: teamId,
        player_id: playerId,
        action: 'delete_review',
        old_values: old,
        reason,
        changed_by: userId,
      })
    }
    return { error }
  },

  async getTeamCustomIndicators(teamId: string) {
    const { data } = await supabase
      .from('player_development_indicators')
      .select('indicator_name, category')
      .eq('team_id', teamId)
      .eq('custom_indicator', true)
      .is('deleted_at', null)
    if (!data) return []
    const seen = new Set<string>()
    return (data as any[]).filter(i => {
      if (seen.has(i.indicator_name)) return false
      seen.add(i.indicator_name)
      return true
    })
  },

  async getTeamAllIndicatorsForComparison(teamId: string, season: string) {
    const { data } = await supabase
      .from('player_development_indicators')
      .select('id, player_id, indicator_name, indicator_type, category, custom_indicator, start_score, current_score, reviews:player_indicator_reviews(id, score, review_date, created_at, deleted_at)')
      .eq('team_id', teamId)
      .eq('season', season)
      .is('deleted_at', null)
      .order('indicator_name')
    return data ?? []
  },

  async recalculateCurrentScore(indicatorId: string) {
    const { data: indicator } = await supabase
      .from('player_development_indicators')
      .select('start_score')
      .eq('id', indicatorId)
      .single()
    const { data: reviews } = await supabase
      .from('player_indicator_reviews')
      .select('score, created_at')
      .eq('indicator_id', indicatorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const latestScore = reviews?.[0]?.score ?? indicator?.start_score ?? 1
    await supabase
      .from('player_development_indicators')
      .update({ current_score: latestScore, updated_at: new Date().toISOString() })
      .eq('id', indicatorId)
  },
}

// ── REWARDS ────────────────────────────────────────────────────────────
export const rewardService = {
  async getAll(teamId: string) {
    const { data, error } = await supabase.from('rewards')
      .select('*').eq('team_id', teamId)
      .order('created_at', { ascending: false })
    if (error) { console.error('[rewardService.getAll]', error.message); return [] }
    if (!data?.length) return []
    const uids = [...new Set(data.map((r: any) => r.user_id))]
    const { data: profs } = await supabase.from('profiles')
      .select('id, full_name, avatar_url').in('id', uids)
    const pm: Record<string, any> = {}
    ;(profs ?? []).forEach((p: any) => { pm[p.id] = p })
    return data.map((r: any) => ({ ...r, profile: pm[r.user_id] ?? null }))
  },
  async getPlayerRewards(teamId: string, userId: string) {
    const { data, error } = await supabase.from('rewards')
      .select('id, title, notes, amount, created_at')
      .eq('team_id', teamId).eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) console.error('[getPlayerRewards]', error.message)
    return data ?? []
  },
  async create(record: any) {
    return supabase.from('rewards').insert(record).select().single()
  },
  async delete(id: string) {
    return supabase.from('rewards').delete().eq('id', id)
  },
}
