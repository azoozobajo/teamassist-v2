import { supabase } from '../lib/supabase'
import { addDays, format, parseISO, getDay, eachDayOfInterval } from 'date-fns'

// ── TEAMS ─────────────────────────────────────────────────────────────
export const teamService = {
  async getMyTeams(userId: string) {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, role, teams(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('removed_at', null)
    return (data ?? []).map((r: any) => ({ ...r.teams, myRole: r.role }))
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
      .select('*, profile:profiles(*)')
      .eq('team_id', teamId).eq('status', 'active').is('removed_at', null)
      .order('joined_at', { ascending: true })
    return data ?? []
  },
  async getVisibleMembers(teamId: string) {
    const { data } = await supabase.from('team_members')
      .select('*, profile:profiles(*)')
      .eq('team_id', teamId).eq('status', 'active').eq('is_visible', true).is('removed_at', null)
    return data ?? []
  },
  async updateMemberRole(memberId: string, role: string) {
    return supabase.from('team_members').update({ role }).eq('id', memberId)
  },
  async removeMember(memberId: string) {
    return supabase.from('team_members')
      .update({ status: 'inactive', removed_at: new Date().toISOString() }).eq('id', memberId)
  },
  async getMyRole(teamId: string, userId: string) {
    const { data } = await supabase.from('team_members').select('role')
      .eq('team_id', teamId).eq('user_id', userId).eq('status', 'active').single()
    return data?.role ?? null
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
  async reviewJoinRequest(id: string, status: 'approved' | 'rejected', teamId: string, userId: string, reviewerId: string) {
    await supabase.from('join_requests').update({ status, reviewed_by: reviewerId }).eq('id', id)
    if (status === 'approved') {
      await supabase.from('team_members')
        .insert({ team_id: teamId, user_id: userId, role: 'player', status: 'active', is_visible: true })
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
      .select('*, profile:profiles(*)').eq('event_id', eventId)
    return data ?? []
  },
  async setAttendance(data: any) {
    return supabase.from('attendance')
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' })
  },
  async getMyAttendance(teamId: string, userId: string) {
    const { data } = await supabase.from('attendance')
      .select('*, event:events(*)').eq('team_id', teamId).eq('user_id', userId)
    return data ?? []
  },
  async getTeamAttendanceStats(teamId: string) {
    const { data } = await supabase.from('attendance')
      .select('user_id, status, profiles(full_name)').eq('team_id', teamId)
    return data ?? []
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
  async createForTeam(teamId: string, title: string, body: string, type: string, excludeUserId?: string) {
    const { data: members } = await supabase.from('team_members')
      .select('user_id').eq('team_id', teamId).eq('status', 'active')
    if (!members) return
    const notifs = members
      .filter((m: any) => m.user_id !== excludeUserId)
      .map((m: any) => ({ user_id: m.user_id, team_id: teamId, title, body, type, is_read: false }))
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
    const { data } = await supabase.from('leaves')
      .select('*, profile:profiles(*)')
      .eq('team_id', teamId).order('created_at', { ascending: false })
    return data ?? []
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
      .select('*, profile:profiles(*)')
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
      .select('*, sender:profiles(*)')
      .eq('team_id', teamId)
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
      .order('created_at', { ascending: true })
    return data ?? []
  },
  async send(data: any) {
    return supabase.from('direct_messages').insert(data).select().single()
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
    return data ?? []
  },
  async create(data: any) {
    return supabase.from('secret_reports').insert(data).select().single()
  }
}

// ── CHAT ──────────────────────────────────────────────────────────────
export const chatService = {
  async getMessages(teamId: string, limit = 100) {
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:profiles(*)')
      .eq('team_id', teamId).order('created_at', { ascending: true }).limit(limit)
    return data ?? []
  },
  async send(data: any) {
    return supabase.from('chat_messages').insert(data).select('*, sender:profiles(*)').single()
  },
  subscribeToMessages(teamId: string, onMessage: (msg: any) => void) {
    return supabase.channel(`chat:${teamId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `team_id=eq.${teamId}`
      }, async (payload) => {
        // Fetch with profile
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
