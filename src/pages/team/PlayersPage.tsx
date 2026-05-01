import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { teamService, noteService, injuryService, financeService, pointsService } from '../../services'
import { Spinner, PageHeader, SearchBox, Avatar, Modal, FormField, EmptyState, ProgressBar } from '../../components/ui'
import { NOTE_TYPES, canManageEvents, formatDate, RIYAL } from '../../utils/helpers'

const NOTE_COLOR: Record<string, { bg: string; tc: string }> = {
  مدح:   { bg: 'bg-emerald-50', tc: 'text-emerald-700' },
  توجيه: { bg: 'bg-blue-50',    tc: 'text-blue-700' },
  تحذير: { bg: 'bg-red-50',     tc: 'text-red-700' },
  تطوير: { bg: 'bg-amber-50',   tc: 'text-amber-700' },
}

export default function PlayersPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState('')
  const [q, setQ] = useState('')
  const [selPlayer, setSelPlayer] = useState<any>(null)
  const [playerNotes, setPlayerNotes] = useState<any[]>([])
  const [playerInjuries, setPlayerInjuries] = useState<any[]>([])
  const [playerFinance, setPlayerFinance] = useState<{ obligations: any[]; payments: any[] }>({ obligations: [], payments: [] })
  const [playerPts, setPlayerPts] = useState(0)
  const [unreadNotes, setUnreadNotes] = useState<Record<string, number>>({})
  const [showNote, setShowNote] = useState(false)
  const [showInjury, setShowInjury] = useState(false)
  const [noteForm, setNoteForm] = useState({ note_type: 'مدح' as any, content: '', event_title: '' })
  const [injuryForm, setInjuryForm] = useState({ description: '', injury_date: '', recovery_status: 'يتعافى' as any, notes: '' })
  const [saving, setSaving] = useState(false)
  const [detailTab, setDetailTab] = useState('notes')

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(async m => {
      setMembers(m)
      // Load unread counts for notes
      const counts: Record<string, number> = {}
      for (const mem of m) {
        if (teamId) counts[mem.user_id] = await noteService.getUnreadCount(teamId, mem.user_id)
      }
      setUnreadNotes(counts)
      setLoading(false)
    })
  }, [teamId, user])

  async function openPlayer(m: any) {
    setSelPlayer(m); setDetailTab('notes')
    if (!teamId) return
    const [notes, injuries, finance, pts] = await Promise.all([
      noteService.getPlayerNotes(teamId, m.user_id),
      injuryService.getPlayerInjuries(teamId, m.user_id),
      financeService.getPlayerFinance(teamId, m.user_id),
      pointsService.getUserPoints ? pointsService.getUserPoints(teamId, m.user_id) : Promise.resolve(0)
    ])
    setPlayerNotes(notes); setPlayerInjuries(injuries)
    setPlayerFinance(finance); setPlayerPts(pts as number)
    // Mark notes as read
    await noteService.markRead(m.user_id, teamId)
    setUnreadNotes(p => ({ ...p, [m.user_id]: 0 }))
  }

  async function saveNote() {
    if (!noteForm.content.trim() || !selPlayer || !teamId || !user) return
    setSaving(true)
    await noteService.create({ ...noteForm, team_id: teamId, player_id: selPlayer.user_id, coach_id: user.id, is_read: false })
    const notes = await noteService.getPlayerNotes(teamId, selPlayer.user_id)
    setPlayerNotes(notes); setShowNote(false)
    setNoteForm({ note_type: 'مدح', content: '', event_title: '' }); setSaving(false)
  }

  async function saveInjury() {
    if (!injuryForm.description || !selPlayer || !teamId || !user) return
    setSaving(true)
    await injuryService.create({ ...injuryForm, team_id: teamId, player_id: selPlayer.user_id, recorded_by: user.id })
    const injuries = await injuryService.getPlayerInjuries(teamId, selPlayer.user_id)
    setPlayerInjuries(injuries); setShowInjury(false)
    setInjuryForm({ description: '', injury_date: '', recovery_status: 'يتعافى', notes: '' }); setSaving(false)
  }

  const isCoach = canManageEvents(myRole)
  const filtered = members.filter(m => m.profile?.full_name?.includes(q))

  // Finance helpers
  const getMyPaid = (obId: string) => {
    const p = playerFinance.payments.find(p => p.obligation_id === obId)
    return p?.paid_amount || 0
  }
  const totalRequired = playerFinance.obligations.reduce((s, o) => s + o.amount, 0)
  const totalPaid = playerFinance.obligations.reduce((s, o) => s + getMyPaid(o.id), 0)

  if (selPlayer) return (
    <div>
      <button onClick={() => setSelPlayer(null)}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 mb-4 cursor-pointer">
        ← العودة للقائمة
      </button>

      {/* Player Card */}
      <div className="bg-gradient-to-l from-brand-600 to-brand-800 rounded-2xl p-5 text-white mb-4 flex items-center gap-4">
        <Avatar name={selPlayer.profile?.full_name || '?'} src={selPlayer.profile?.avatar_url} size="xl"
          className="ring-4 ring-white/30"/>
        <div className="flex-1">
          <div className="text-xl font-bold">{selPlayer.profile?.full_name}</div>
          <div className="text-sm opacity-80">{selPlayer.role}</div>
          <div className="text-xs opacity-60 mt-1">انضم: {formatDate(selPlayer.joined_at)}</div>
        </div>
        <div className="text-center bg-white/15 px-4 py-3 rounded-xl">
          <div className="text-2xl font-bold text-yellow-300">{playerPts}</div>
          <div className="text-xs opacity-80">نقطة</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
        {[['notes','✏️ ملاحظات'],['injuries','🤕 إصابات'],['finance',`${RIYAL} المالية`]].map(([k,l]) => (
          <button key={k} onClick={() => setDetailTab(k)}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${detailTab===k ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Notes Tab */}
      {detailTab === 'notes' && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">ملاحظات المدرب ({playerNotes.length})</h3>
            {isCoach && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowNote(true)}><Plus size={12}/>ملاحظة</button>
            )}
          </div>
          {playerNotes.length === 0 ? <EmptyState title="لا توجد ملاحظات"/>
            : <div className="space-y-2">
                {playerNotes.map(n => {
                  const clr = NOTE_COLOR[n.note_type] || NOTE_COLOR['توجيه']
                  return (
                    <div key={n.id} className={`rounded-xl p-3 ${clr.bg}`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className={`badge text-xs ${clr.bg} ${clr.tc} border border-current/20`}>{n.note_type}</span>
                        <div className="text-right">
                          {n.event_title && <span className="text-xs text-slate-400">{n.event_title} · </span>}
                          <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                        </div>
                      </div>
                      <p className={`text-sm leading-relaxed ${clr.tc}`}>{n.content}</p>
                      {n.coach && <div className="text-xs text-slate-400 mt-1.5">— {n.coach.full_name}</div>}
                    </div>
                  )
                })}
              </div>}
        </div>
      )}

      {/* Injuries Tab */}
      {detailTab === 'injuries' && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">سجل الإصابات ({playerInjuries.length})</h3>
            {isCoach && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInjury(true)}>+ إصابة</button>
            )}
          </div>
          {playerInjuries.length === 0
            ? <div className="text-center py-6 text-emerald-600 text-sm">✅ لا توجد إصابات مسجلة</div>
            : <div className="space-y-2">
                {playerInjuries.map(inj => (
                  <div key={inj.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="flex-1">
                      <div className="font-bold text-sm">{inj.description}</div>
                      <div className="text-xs text-slate-400">{inj.injury_date}</div>
                      {inj.notes && <div className="text-xs text-slate-500 mt-0.5">{inj.notes}</div>}
                    </div>
                    <span className={`badge ${inj.recovery_status==='تعافى' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inj.recovery_status}
                    </span>
                  </div>
                ))}
              </div>}
        </div>
      )}

      {/* Finance Tab */}
      {detailTab === 'finance' && (
        <div className="card">
          <h3 className="font-bold text-sm mb-3">المستحقات المالية</h3>
          {playerFinance.obligations.length === 0
            ? <div className="text-center py-6 text-slate-400 text-sm">لا توجد مستحقات مالية</div>
            : <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="stat-box"><div className="stat-value text-base">{totalRequired} {RIYAL}</div><div className="stat-label">المطلوب</div></div>
                  <div className="stat-box"><div className="stat-value text-base text-emerald-600">{totalPaid} {RIYAL}</div><div className="stat-label">المسدد</div></div>
                  <div className="stat-box"><div className="stat-value text-base text-red-600">{(totalRequired - totalPaid).toFixed(0)} {RIYAL}</div><div className="stat-label">المتبقي</div></div>
                </div>
                <div className="space-y-3">
                  {playerFinance.obligations.map(o => {
                    const paid = getMyPaid(o.id)
                    const pct = Math.round(paid / o.amount * 100)
                    return (
                      <div key={o.id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold">{o.title}</span>
                          <span className="text-slate-500">{paid}/{o.amount} {RIYAL}</span>
                        </div>
                        <ProgressBar value={pct} color={paid >= o.amount ? 'bg-emerald-500' : 'bg-amber-400'}/>
                        {o.due_date && <div className="text-xs text-slate-400 mt-0.5">الاستحقاق: {o.due_date}</div>}
                      </div>
                    )
                  })}
                </div>
              </>}
        </div>
      )}

      {/* Note Modal */}
      <Modal open={showNote} onClose={() => setShowNote(false)} title={`ملاحظة لـ ${selPlayer.profile?.full_name}`}>
        <div className="form-group">
          <label className="form-label">نوع الملاحظة</label>
          <div className="flex gap-2 flex-wrap">
            {NOTE_TYPES.map(t => (
              <button key={t} onClick={() => setNoteForm(p => ({ ...p, note_type: t }))}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${noteForm.note_type===t ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <FormField label="مرتبطة بحدث (اختياري)">
          <input className="form-input" value={noteForm.event_title}
            onChange={e => setNoteForm(p => ({ ...p, event_title: e.target.value }))} placeholder="تدريب الثلاثاء..."/>
        </FormField>
        <FormField label="نص الملاحظة" required>
          <textarea className="form-input" rows={3} value={noteForm.content}
            onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} placeholder="اكتب ملاحظتك هنا..."/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowNote(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveNote} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button>
        </div>
      </Modal>

      {/* Injury Modal */}
      <Modal open={showInjury} onClose={() => setShowInjury(false)} title="تسجيل إصابة">
        <FormField label="وصف الإصابة" required>
          <input className="form-input" value={injuryForm.description}
            onChange={e => setInjuryForm(p => ({ ...p, description: e.target.value }))}/>
        </FormField>
        <FormField label="تاريخ الإصابة">
          <input className="form-input" type="date" value={injuryForm.injury_date}
            onChange={e => setInjuryForm(p => ({ ...p, injury_date: e.target.value }))}/>
        </FormField>
        <FormField label="الحالة">
          <select className="form-input" value={injuryForm.recovery_status}
            onChange={e => setInjuryForm(p => ({ ...p, recovery_status: e.target.value as any }))}>
            <option value="يتعافى">يتعافى</option>
            <option value="تعافى">تعافى</option>
          </select>
        </FormField>
        <FormField label="ملاحظات">
          <textarea className="form-input" rows={2} value={injuryForm.notes}
            onChange={e => setInjuryForm(p => ({ ...p, notes: e.target.value }))}/>
        </FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={() => setShowInjury(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveInjury} disabled={saving}>{saving ? <Spinner size="sm"/> : 'حفظ'}</button>
        </div>
      </Modal>
    </div>
  )

  return (
    <div>
      <PageHeader title="بطاقات اللاعبين"/>
      <SearchBox placeholder="ابحث عن لاعب..." value={q} onChange={setQ}/>
      {loading ? <div className="flex justify-center py-10"><Spinner/></div>
        : filtered.length === 0 ? <div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا يوجد لاعبون"/></div>
        : <div className="grid md:grid-cols-2 gap-3">
            {filtered.map(m => {
              const unread = unreadNotes[m.user_id] || 0
              return (
                <div key={m.id} className="card-hover mb-0" onClick={() => openPlayer(m)}>
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={m.profile?.full_name || '?'} src={m.profile?.avatar_url} size="md" badge={unread}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{m.profile?.full_name}</div>
                      <div className="text-xs text-slate-400">{m.role}</div>
                      {m.position_label && <div className="text-xs text-brand-600 font-medium">{m.position_label}</div>}
                    </div>
                    <div className="text-xs text-slate-400">←</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 rounded-xl p-2 text-center">
                      <div className="text-sm font-bold text-brand-600">—%</div>
                      <div className="text-xs text-slate-400">حضور</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-2 text-center">
                      <div className="text-sm font-bold text-yellow-600">—</div>
                      <div className="text-xs text-slate-400">نقاط</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2 text-center">
                      <div className="text-sm font-bold text-slate-600">انضم {formatDate(m.joined_at).split('/')[2] || '—'}</div>
                      <div className="text-xs text-slate-400">السنة</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>}
    </div>
  )
}
