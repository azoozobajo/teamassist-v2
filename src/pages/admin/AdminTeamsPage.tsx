import React, { useEffect, useState, useCallback } from 'react'
import {
  Shield, Users, Trophy, Search,
  Power, AlertCircle, Eye, RefreshCw
} from 'lucide-react'
import { adminService } from '../../services'
import { Modal } from '../../components/ui'
import { ROLE_LABELS } from '../../utils/helpers'

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
      active ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
              : 'bg-slate-700 text-slate-400 border border-slate-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-500'}`}/>
      {active ? 'نشط' : 'موقوف'}
    </span>
  )
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [sort, setSort] = useState<'newest' | 'members' | 'name'>('newest')
  const [offset, setOffset] = useState(0)
  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await adminService.getTeams(LIMIT, offset)
      setTeams(data)
    } catch (e: any) {
      setError(e.message || 'خطأ في تحميل الفرق')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => { load() }, [load])

  const filtered = teams
    .filter(t => !search || t.name?.toLowerCase().includes(search.toLowerCase())
      || t.owner_name?.toLowerCase().includes(search.toLowerCase())
      || t.city?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'members') return b.member_count - a.member_count
      if (sort === 'name') return (a.name ?? '').localeCompare(b.name ?? '')
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  async function viewDetail(teamId: string) {
    setDetailLoading(true)
    try {
      const d = await adminService.getTeamDetail(teamId)
      setDetail(d)
    } catch {}
    setDetailLoading(false)
  }

  async function toggleTeam(teamId: string, current: boolean) {
    setTogglingId(teamId)
    await adminService.toggleTeam(teamId, !current)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_active: !current } : t))
    setTogglingId(null)
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-white">الفرق المسجلة</h1>
          <p className="text-slate-400 text-sm">{teams.length} فريق محمّل</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-all">
          <RefreshCw size={15}/> تحديث
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم الفريق أو المالك أو المدينة..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"/>
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500">
          <option value="newest">الأحدث أولاً</option>
          <option value="members">الأكثر أعضاء</option>
          <option value="name">الاسم أبجدياً</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 flex items-center gap-2">
          <AlertCircle size={16}/> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full"/>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Shield size={40} className="mx-auto mb-3 opacity-30"/>
            <p>لا توجد فرق</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">اسم الفريق</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">المالك</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3 hidden md:table-cell">الرياضة / الفئة</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">الأعضاء</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3 hidden lg:table-cell">المباريات</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3 hidden lg:table-cell">تاريخ الإنشاء</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">الحالة</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-semibold">{t.name}</div>
                      {t.city && <div className="text-slate-500 text-xs">{t.city}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300 text-sm">{t.owner_name || '—'}</div>
                      {t.owner_email && <div className="text-slate-500 text-xs">{t.owner_email}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-slate-300 text-sm">{t.sport_type || '—'}</div>
                      {t.age_category && <div className="text-slate-500 text-xs">{t.age_category}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Users size={14} className="text-slate-500"/>
                        {t.member_count}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Trophy size={14} className="text-slate-500"/>
                        {t.match_count}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('ar-SA') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge active={t.is_active}/>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => viewDetail(t.id)}
                          className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-all"
                          title="عرض التفاصيل">
                          <Eye size={14}/>
                        </button>
                        <button onClick={() => toggleTeam(t.id, t.is_active)}
                          disabled={togglingId === t.id}
                          className={`p-1.5 rounded-lg transition-all ${
                            t.is_active
                              ? 'bg-red-900/40 hover:bg-red-900/70 text-red-400'
                              : 'bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-400'
                          }`}
                          title={t.is_active ? 'تعطيل الفريق' : 'تفعيل الفريق'}>
                          <Power size={14}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Team detail modal */}
      {(detail !== null || detailLoading) && (
        <Modal open={true} title="تفاصيل الفريق" onClose={() => setDetail(null)}>
          {detailLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full"/>
            </div>
          ) : detail && (
            <div className="space-y-4" dir="rtl">
              {/* Team info */}
              <div className="bg-slate-100 rounded-xl p-4">
                <h3 className="font-extrabold text-slate-800 text-lg">{detail.team?.name}</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-600">
                  {detail.team?.sport_type && <span>🏅 {detail.team.sport_type}</span>}
                  {detail.team?.city && <span>📍 {detail.team.city}</span>}
                  {detail.team?.age_category && <span>👥 {detail.team.age_category}</span>}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['المباريات', detail.stats?.matches, '🏆'],
                  ['التدريبات', detail.stats?.trainings, '⚽'],
                  ['المواعيد', detail.stats?.events, '📅'],
                  ['الرسائل', detail.stats?.messages, '💬'],
                  ['التقارير الطبية', detail.stats?.injuries, '🏥'],
                  ['الإجازات', detail.stats?.leaves, '📋'],
                ].map(([l, v, e]) => (
                  <div key={l as string} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                    <div className="text-lg">{e}</div>
                    <div className="font-extrabold text-slate-800">{v ?? 0}</div>
                    <div className="text-xs text-slate-500">{l}</div>
                  </div>
                ))}
              </div>

              {/* Members */}
              <div>
                <h4 className="font-bold text-slate-700 mb-2">الأعضاء ({detail.members?.length ?? 0})</h4>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {(detail.members ?? []).map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                        {m.full_name?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{m.full_name}</div>
                        {m.email && <div className="text-xs text-slate-400 truncate">{m.email}</div>}
                      </div>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
