export type UserRole = 'owner' | 'head_coach' | 'assistant_coach' | 'player' | 'administrator' | 'media' | 'medical' | 'parent' | 'guest'
export type AttendanceStatus = 'present' | 'absent' | 'uncertain' | 'late'
export type EventType = 'training' | 'match' | 'meeting' | 'camp' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'partial'
export type NoteType = 'مدح' | 'توجيه' | 'تحذير' | 'تطوير'
export type PointCategory = 'مكافأة' | 'تطور' | 'تعاون' | 'مبادرة' | 'أداء' | 'نتائج'
export type ReportTag = 'إصابة' | 'مشكلة' | 'مكافأة' | 'موقف' | 'إنجاز' | 'تغيير' | 'ملاحظة' | 'طارئ'
export type InviteStatus = 'pending' | 'accepted' | 'rejected'
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

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
  has_excuse?: boolean
  member_note?: string
  admin_note?: string
  marked_by?: string
  locked?: boolean
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
  from_date: string
  to_date: string
  status: LeaveStatus
  note?: string
  partial_days?: string[]
  reviewed_by?: string
  created_at: string
  profile?: Profile
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
