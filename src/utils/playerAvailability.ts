export type PlayerAvailability = 'ready' | 'injured' | 'suspended'

export function getPlayerAvailability(params: {
  medicalCases?: any[]
  medicalReports?: any[]
  suspensions?: any[]
  adminDecisions?: any[]
  today?: string
}): PlayerAvailability {
  const {
    medicalCases = [],
    medicalReports = [],
    suspensions = [],
    adminDecisions = [],
    today = new Date().toISOString().slice(0, 10),
  } = params

  const isInjured = medicalCases.some(c =>
    c.case_type === 'injury' && (c.status === 'active' || c.status === 'monitoring')
  ) || medicalReports.some(r =>
    r.report_type === 'injury' && (r.status === 'active' || r.status === 'monitoring')
  )

  if (isInjured) return 'injured'

  const isSuspended = suspensions.some(s => {
    if (s.is_completed) return false
    if (s.suspension_type === 'dates') {
      if (s.from_date && s.to_date) return s.from_date <= today && s.to_date >= today
      return false
    }
    return true
  }) || adminDecisions.some(d => {
    if (d.is_active === false) return false
    if (d.from_date && d.to_date) return d.from_date <= today && d.to_date >= today
    return true
  })

  return isSuspended ? 'suspended' : 'ready'
}

export function buildAvailabilityMap(params: {
  playerIds: string[]
  medicalCases?: any[]
  medicalReports?: any[]
  suspensions?: any[]
  adminDecisions?: any[]
  today?: string
}) {
  const { playerIds, medicalCases = [], medicalReports = [], suspensions = [], adminDecisions = [], today } = params
  const map: Record<string, PlayerAvailability> = {}
  for (const playerId of playerIds) {
    map[playerId] = getPlayerAvailability({
      medicalCases: medicalCases.filter(c => c.player_id === playerId),
      medicalReports: medicalReports.filter(r => r.player_id === playerId),
      suspensions: suspensions.filter(s => s.player_id === playerId),
      adminDecisions: adminDecisions.filter(d =>
        d.target_type === 'all' || (d.target_user_ids || []).includes(playerId)
      ),
      today,
    })
  }
  return map
}
