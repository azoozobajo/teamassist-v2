export type UserRole = 'owner' | 'head_coach' | 'assistant_coach' | 'player' | 'administrator' | 'media' | 'medical' | 'parent' | 'guest'
export type AttendanceStatus = 'present' | 'absent' | 'uncertain' | 'late' | 'excused'
export type MatchExcuseType = 'injured' | 'suspended' | 'excluded' | 'other'
export type MatchEventType = 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'substitution' | 'clean_sheet'
export type FootballFormation = '4-4-2' | '4-3-3' | '4-2-3-1' | '4-1-4-1' | '4-5-1' | '4-4-1-1' | '4-3-1-2' | '3-5-2' | '3-4-3' | '3-4-2-1' | '5-3-2' | '5-4-1' | '5-2-3'
export type EventType = 'training' | 'match' | 'meeting' | 'camp' | 'other' | 'assessment'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'partial'
export type AdminDecisionType = 'suspension' | 'national_team' | 'injury' | 'penalty' | 'rest' | 'emergency' | 'other'
export type AdminDecisionTargetType = 'all' | 'specific'
export type NoteType = 'مدح' | 'توجيه' | 'تحذير' | 'تطوير'
export type PointCategory = 'مكافأة' | 'تطور' | 'تعاون' | 'مبادرة' | 'أداء' | 'نتائج'
export type ReportTag = 'إصابة' | 'مشكلة' | 'مكافأة' | 'موقف' | 'إنجاز' | 'تغيير' | 'ملاحظة' | 'طارئ'
export type InviteStatus = 'pending' | 'accepted' | 'rejected'
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'
export type AbsenceType = 'unexcused' | 'leave' | 'national_team' | 'admin_suspension' | 'emergency' | 'academic' | 'family' | 'injury' | 'cards' | 'other'
export type AbsenceApplyTo = 'match_only' | 'training_only' | 'meeting_only' | 'all' | 'match_training' | 'training_meeting' | 'match_training_meeting' | 'specific'
export type AttendanceSourceType = 'manual' | 'player_self' | 'leave' | 'admin_leave' | 'absence' | 'medical' | 'tournament_suspension'
export type SuspensionReason = 'yellow_accumulation' | 'double_yellow' | 'direct_red' | 'custom'
export type SuspensionType = 'matches' | 'dates'

export interface Profile {
  id: string
  full_name: string
  first_name?: string
  last_name?: string
  father_name?: string
  avatar_url?: string
  phone?: string
  date_of_birth?: string
  gender?: 'male' | 'female'
  email?: string
  profile_complete?: boolean
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  name: string
  sport_type: string
  age_category?: string
  city?: string
  description?: string
  logo_url?: string
  invite_code: string
  invite_code_enabled: boolean
  require_approval: boolean
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  is_visible: boolean
  joined_at: string
  removed_at?: string
  jersey_number?: number
  primary_position?: string
  secondary_positions?: string[] | string
  position_label?: string
  preferred_foot?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  home_address?: string | null
  profile?: Profile
}

export interface Event {
  id: string
  team_id: string
  recurrence_group_id?: string
  title: string
  event_type: EventType
  start_datetime: string
  end_datetime?: string
  location?: string
  map_url?: string
  description?: string
  att_group?: string
  is_locked?: boolean
  default_status?: AttendanceStatus
  created_by?: string
  created_at: string
  updated_at: string
}

export interface RecurrenceGroup {
  id: string
  team_id: string
  title: string
  event_type: EventType
  days_of_week: number[]
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  location?: string
  map_url?: string
  att_group?: string
  created_by?: string
  created_at: string
}

export interface Attendance {
  id: string
  event_id: string
  team_id: string
  user_id: string
  status: AttendanceStatus
  late_minutes?: number
  late_excuse?: string
  excuse_reason?: string
  has_excuse?: boolean
  member_note?: string
  admin_note?: string
  marked_by?: string
  locked?: boolean
  // حقول النظام الموحد الجديدة
  absence_type?: AbsenceType
  source_type?: AttendanceSourceType
  source_id?: string
  is_coach_confirmed?: boolean
  confirmed_by?: string
  locked_by_source?: boolean
  created_at: string
  updated_at: string
  profile?: Profile
}

export interface Announcement {
  id: string
  team_id: string
  title: string
  content: string
  announcement_type: string
  is_poll: boolean
  poll_options?: PollOption[]
  poll_limit?: number
  created_by?: string
  created_at: string
  profile?: Profile
}

export interface PollOption {
  id: string
  text: string
  votes: number
}

export interface FinancialObligation {
  id: string
  team_id: string
  title: string
  amount: number
  due_date?: string
  target_type: 'all' | 'role' | 'specific'
  target_role?: string
  target_user_ids?: string[]
  created_by?: string
  created_at: string
}

export interface Payment {
  id: string
  obligation_id: string
  team_id: string
  user_id: string
  amount: number
  paid_amount: number
  status: 'unpaid' | 'partial' | 'paid'
  paid_at?: string
  recorded_by?: string
  created_at: string
  profile?: Profile
}

export interface Leave {
  id: string
  team_id: string
  user_id: string
  reason: string
  leave_type?: AdminDecisionType
  from_date: string
  to_date: string
  status: LeaveStatus
  note?: string
  partial_days?: string[]
  attachment_url?: string
  appeal_text?: string
  appeal_attachment_url?: string
  appealed_at?: string
  reviewed_by?: string
  created_at: string
  profile?: Profile
}

export interface AdminDecision {
  id: string
  team_id: string
  title: string
  decision_type: AdminDecisionType
  target_type: AdminDecisionTargetType
  target_user_ids: string[]
  notes?: string
  from_date: string
  to_date: string
  created_by?: string
  is_active: boolean
  created_at: string
  creator?: Profile
}

export interface CoachNote {
  id: string
  team_id: string
  player_id: string
  coach_id: string
  note_type: NoteType
  content: string
  event_id?: string
  event_title?: string
  is_read: boolean
  created_at: string
  coach?: Profile
}

export interface Injury {
  id: string
  team_id: string
  player_id: string
  description: string
  injury_date: string
  recovery_status: 'يتعافى' | 'تعافى'
  notes?: string
  recorded_by?: string
  created_at: string
}

export interface PointsTransaction {
  id: string
  team_id: string
  user_id: string
  points: number
  category: PointCategory
  reason: string
  is_auto: boolean
  created_by?: string
  created_at: string
  profile?: Profile
}

export interface Competition {
  id: string
  team_id: string
  name: string
  from_date: string
  to_date: string
  prize: string
  winner_id?: string
  is_active: boolean
  created_at: string
  winner?: Profile
}

export interface TournamentRules {
  id: string
  tournament_id: string
  team_id: string
  yellow_cards_limit: number
  yellow_suspension_matches: number
  double_yellow_suspension: number
  direct_red_suspension: number
  created_by?: string
  created_at: string
}

export interface TournamentSuspension {
  id: string
  tournament_id?: string
  team_id: string
  player_id: string
  reason: SuspensionReason
  suspension_type: SuspensionType
  matches_count?: number
  matches_served: number
  from_date?: string
  to_date?: string
  is_completed: boolean
  notes?: string
  created_by?: string
  created_at: string
  profile?: Profile
}

export interface PlayerAttendanceStats {
  userId: string
  totalEvents: number
  present: number
  late: number
  absent: number
  excused: {
    total: number
    leave: number
    injury: number
    nationalTeam: number
    adminSuspension: number
    emergency: number
    academic: number
    family: number
    cards: number
    other: number
  }
  lateMinutesTotal: number
  lateAvgMinutes: number
  generalRate: number
  effectiveRate: number
  streak: number
}

export interface DirectMessage {
  id: string
  team_id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  created_at: string
  sender?: Profile
  receiver?: Profile
}

export interface SecretReport {
  id: string
  team_id: string
  title: string
  content: string
  tag: ReportTag
  visible_to: string
  created_by?: string
  created_at: string
  author?: Profile
}

export interface ChatMessage {
  id: string
  team_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: Profile
}

export interface Notification {
  id: string
  user_id: string
  team_id?: string
  title: string
  body?: string
  type: string
  link?: string
  is_read: boolean
  created_at: string
}

export interface Invitation {
  id: string
  team_id: string
  email: string
  role: UserRole
  status: InviteStatus
  token: string
  invited_by?: string
  created_at: string
  team?: Team
}

export interface JoinRequest {
  id: string
  team_id: string
  user_id: string
  status: JoinRequestStatus
  note?: string
  reviewed_by?: string
  created_at: string
  profile?: Profile
  team?: Team
}

export interface Absence {
  id: string
  team_id: string
  user_id: string
  absence_type: AbsenceType
  from_date: string
  to_date: string
  reason?: string
  notes?: string
  attachment_url?: string
  apply_to: AbsenceApplyTo
  specific_event_ids?: string[]
  recorded_by?: string
  created_at: string
  profile?: Profile
  recorder?: Profile
}

export interface FixedExpenseItem {
  id: string
  team_id: string
  item_type: 'راتب' | 'فاتورة' | 'التزام' | 'إيجار'
  name: string
  due_day: number
  recurrence_type: 'count' | 'continuous'
  recurrence_count?: number
  default_amount: number
  is_active: boolean
  created_by?: string
  created_at: string
}

export interface FixedExpensePayment {
  id: string
  item_id: string
  team_id: string
  period_month: string
  amount: number
  paid_at: string
  paid_by?: string
  original_amount?: number
  edit_reason?: string
  edited_by?: string
  edited_at?: string
  edited_by_name?: string
  team_expense_id?: string
  created_at: string
}

export interface LineupPlayer {
  position_index: number
  user_id: string
  jersey_number: number
  role: 'starter' | 'sub' | 'excluded'
  is_captain?: boolean
  exclusion_reason?: string
}

export interface MatchLineup {
  id: string
  match_id: string
  team_id: string
  formation: FootballFormation
  players: LineupPlayer[]
  created_by?: string
  created_at: string
  updated_at: string
}

export interface MatchEvent {
  id: string
  match_id: string
  team_id: string
  event_type: MatchEventType
  player_id?: string
  player_out_id?: string
  minute: number
  created_by?: string
  created_at: string
  player?: Profile
  player_out?: Profile
}
