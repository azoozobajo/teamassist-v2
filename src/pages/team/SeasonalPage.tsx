import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FileText, Printer, Stethoscope } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, eventService, pointsService, medicalService, financeService } from '../../services'
import { Spinner, PageHeader, FormField, ProgressBar, EmptyState } from '../../components/ui'
import { formatDate, RIYAL, canManageTeam, ROLE_LABELS } from '../../utils/helpers'

const REPORT_TYPE_LABEL: Record<string, string> = {
  injury: '🦴 إصابة',
  checkup: '🩺 كشف دوري',
  followup: '📋 متابعة',
  other: '📝 أخرى',
}

const STATUS_COLOR: Record<string, string> = {
  active:     'bg-red-100 text-red-700',
  monitoring: 'bg-amber-100 text-amber-700',
  recovered:  'bg-emerald-100 text-emerald-700',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'نشط', monitoring: 'تحت المراقبة', recovered: 'متعافٍ',
}

export default function SeasonalPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [selPlayer, setSelPlayer] = useState('me')
  const [fromDate, setFromDate] = useState(new Date().getFullYear() + '-01-01')
  const [toDate, setToDate] = useState(new Date().getFullYear() + '-12-31')
  const [report, setReport] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
  }, [teamId, user])

  async function generate() {
    if (!teamId || !user) return
    setLoading(true); setGenerated(false)

    const isAdmin = canManageTeam(myRole)
    const targetMembers = (isAdmin && selPlayer === 'all')
      ? members
      : members.filter(m => selPlayer === 'me' ? m.user_id === user.id : m.user_id === selPlayer)

    // Load events, points, and ALL medical reports once (not per player)
    const [events, history, allMedReports] = await Promise.all([
      eventService.getTeamEvents(teamId),
      pointsService.getHistory(teamId),
      medicalService.getReports(teamId),
    ])

    const eventsInRange = events.filter(e => e.start_datetime >= fromDate && e.start_datetime <= toDate + 'T23:59')

    const reports = await Promise.all(targetMembers.map(async m => {
      const finance = await financeService.getPlayerFinance(teamId, m.user_id)

      // Attendance
      const att = await Promise.all(eventsInRange.map(e => eventService.getAttendance(e.id)))
      const myAtt = att.flat().filter((a: any) => a.user_id === m.user_id)
      const present = myAtt.filter((a: any) => a.status === 'present').length
      const late = myAtt.filter((a: any) => a.status === 'late').length
      const absent = myAtt.filter((a: any) => a.status === 'absent').length
      const excused = myAtt.filter((a: any) => a.status === 'excused').length
      const total = eventsInRange.length
      const effectiveTotal = Math.max(total - excused, 0)
      const attPct = effectiveTotal ? Math.round((present + late) / effectiveTotal * 100) : (total > 0 ? 100 : 0)

      // Points
      const myPts = history.filter((p: any) => p.user_id === m.user_id).reduce((s: number, p: any) => s + p.points, 0)
      const allPts: Record<string, number> = {}
      history.forEach((h: any) => { allPts[h.user_id] = (allPts[h.user_id] || 0) + h.points })
      const rank = Object.values(allPts).filter(v => v > myPts).length + 1

      // Finance
      const finTotal = finance.obligations.reduce((s: number, o: any) => s + o.amount, 0)
      const finPaid = finance.payments.reduce((s: number, p: any) => s + (p.paid_amount || 0), 0)

      // Medical reports: filter by this player + date range
      const playerMedReports = allMedReports
        .filter((r: any) => r.player_id === m.user_id)
        .filter((r: any) => {
          const d = r.injury_date || r.created_at?.slice(0, 10) || ''
          return (!fromDate || d >= fromDate) && (!toDate || d <= toDate)
        })
      const injuryCount = playerMedReports.filter((r: any) => r.report_type === 'injury').length

      return { member: m, attPct, present, late, absent, total, myPts, rank,
               playerMedReports, injuryCount, finTotal, finPaid }
    }))

    setReport(reports); setLoading(false); setGenerated(true)
  }

  const isAdmin = canManageTeam(myRole)

  return (
    <div>
      <PageHeader title="تقرير الموسم" subtitle="إحصائيات شاملة قابلة للطباعة"/>
      <div className="card mb-5">
        <div className="font-bold text-sm mb-3">اختر اللاعب والفترة</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <FormField label="اللاعب">
            <select className="form-input" value={selPlayer} onChange={e => setSelPlayer(e.target.value)}>
              <option value="me">تقريري الخاص</option>
              {isAdmin && <option value="all">كل الفريق</option>}
              {isAdmin && members.map(m => <option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
            </select>
          </FormField>
          <FormField label="من تاريخ">
            <input className="form-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}/>
          </FormField>
          <FormField label="إلى تاريخ">
            <input className="form-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)}/>
          </FormField>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? <Spinner size="sm"/> : <><FileText size={14}/> توليد التقرير</>}
        </button>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner/></div>}

      {generated && !loading && (
        report.length === 0
          ? <div className="card"><EmptyState title="لا توجد بيانات"/></div>
          : <div className="space-y-5">
              {report.map((r, i) => {
                const attColor = r.attPct >= 85 ? 'text-emerald-600' : r.attPct >= 70 ? 'text-amber-600' : 'text-red-600'
                return (
                  <div key={i} className="card border border-slate-200 print:break-after-page">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 bg-brand-100 text-brand-700 rounded-2xl flex items-center justify-center text-2xl font-bold">
                          {r.member.profile?.full_name?.[0] || '?'}
                        </div>
                        <div>
                          <div className="font-bold text-base">{r.member.profile?.full_name}</div>
                          <div className="text-xs text-slate-400">
                            {ROLE_LABELS[r.member.role] || r.member.role} · انضم {formatDate(r.member.joined_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-slate-400 mb-1">الفترة</div>
                        <div className="text-sm font-bold">{fromDate} ← {toDate}</div>
                        <button onClick={() => window.print()} className="btn btn-ghost btn-sm mt-1 no-print">
                          <Printer size={12}/> طباعة
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="stat-box">
                        <div className={`stat-value ${attColor}`}>{r.attPct}%</div>
                        <div className="stat-label">نسبة الحضور</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-value">{r.present}+{r.late}/{r.total}</div>
                        <div className="stat-label">الجلسات</div>
                      </div>
                      <div className="stat-box bg-yellow-50">
                        <div className="stat-value text-yellow-600">{r.myPts}</div>
                        <div className="stat-label">نقطة · #{r.rank}</div>
                      </div>
                      <div className={`stat-box ${r.finTotal > 0 && r.finPaid < r.finTotal ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div className={`stat-value text-base ${r.finTotal > 0 && r.finPaid < r.finTotal ? 'text-red-600' : 'text-slate-700'}`}>
                          {r.finTotal > 0 ? `${r.finPaid}/${r.finTotal}` : '—'}
                        </div>
                        <div className="stat-label">مالي ({RIYAL})</div>
                      </div>
                    </div>

                    {/* Attendance bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">نسبة الحضور</span>
                        <span className={`font-bold ${attColor}`}>{r.attPct}%</span>
                      </div>
                      <ProgressBar value={r.attPct} color={r.attPct >= 85 ? 'bg-emerald-500' : r.attPct >= 70 ? 'bg-amber-400' : 'bg-red-500'}/>
                      <div className="flex justify-between text-xs mt-1 text-slate-400">
                        <span>✓ حاضر: {r.present}</span>
                        <span>⏱ متأخر: {r.late}</span>
                        <span>✗ غائب: {r.absent}</span>
                      </div>
                    </div>

                    {/* Medical reports section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">
                            🤕 الإصابات في الفترة ({r.injuryCount})
                          </span>
                          {r.playerMedReports.length > r.injuryCount && (
                            <span className="text-xs text-slate-400">
                              · {r.playerMedReports.length} تقرير طبي إجمالاً
                            </span>
                          )}
                        </div>
                        {/* زيارة السجل الطبي — admin only (no-print) */}
                        {isAdmin && (
                          <button
                            onClick={() => nav(`/team/${teamId}/medical?player=${r.member.user_id}&from=${fromDate}&to=${toDate}`)}
                            className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                            <Stethoscope size={12}/>
                            زيارة السجل الطبي
                          </button>
                        )}
                      </div>

                      {r.playerMedReports.length === 0 ? (
                        <div className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
                          ✅ لا توجد تقارير طبية في هذه الفترة
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {r.playerMedReports.map((rep: any, j: number) => (
                            <div key={j} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0">
                              <span className="text-slate-500 flex-shrink-0">
                                {REPORT_TYPE_LABEL[rep.report_type] || rep.report_type}
                              </span>
                              <span className="flex-1 text-slate-700 font-bold truncate">{rep.title}</span>
                              <span className="text-slate-400 flex-shrink-0">
                                {rep.injury_date || rep.created_at?.slice(0, 10)}
                              </span>
                              <span className={`badge text-xs flex-shrink-0 ${STATUS_COLOR[rep.status] || 'bg-slate-100 text-slate-600'}`}>
                                {STATUS_LABEL[rep.status] || rep.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                      <span className="text-xs text-slate-300">TeamAssist · {new Date().toLocaleDateString('ar-SA')}</span>
                      <span className={`text-xs font-bold ${r.attPct >= 85 ? 'text-emerald-600' : r.attPct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                        {r.attPct >= 85 ? '🌟 ممتاز' : r.attPct >= 70 ? '👍 جيد' : '⚠️ يحتاج تحسين'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
      )}
    </div>
  )
}
