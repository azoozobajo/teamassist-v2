import { supabase } from '../lib/supabase'
import { addDays, format, parseISO, getDay, eachDayOfInterval } from 'date-fns'

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
    const { data, error } = await supabase.from('internal_mail')
      .select(MAIL_SELECT)
      .eq('team_id', teamId).eq('receiver_id', userId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
    if (error) console.error('mailService.getInbox:', error.message)
    return { data: data ?? [], error }
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
      .select('id, parent_id, sender_id, created_at')
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
  }
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
