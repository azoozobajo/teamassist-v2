import React, { useEffect, useState, useCallback } from 'react'
import {
  Users, Search, Shield, ShieldCheck, UserX,
  RefreshCw, AlertCircle, CheckCircle, Mail
} from 'lucide-react'
import { adminService } from '../../services'
import { useAuth } from '../../contexts/AuthContext'
import { ROLE_LABELS } from '../../utils/helpers'

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-purple-700 text-purple-100',
  head_coach: 'bg-blue-700 text-blue-100',
  assistant_coach: 'bg-blue-600 text-blue-100',
  player: 'bg-emerald-700 text-emerald-100',
  administrator: 'bg-orange-700 text-orange-100',
  media: 'bg-pink-700 text-pink-100',
  medical: 'bg-red-700 text-red-100',
  parent: 'bg-yellow-700 text-yellow-100',
  guest: 'bg-slate-600 text-slate-200',
}

export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const LIMIT = 50

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await adminService.getUsers(LIMIT, offset, debouncedSearch)
      setUsers(data)
    } catch (e: any) {
      setError(e.message || 'خطأ في تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }, [offset, debouncedSearch])

  useEffect(() => { load() }, [load])

  async function toggleAdmin(userId: string, current: boolean) {
    if (userId === me?.id) return // can't demote self
    setTogglingId(userId)
    try {
      await adminService.setPlatformAdmin(userId, !current)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_platform_admin: !current } : u))
      setSuccessMsg(current ? 'تم إلغاء صلاحية الأدمن' : 'تم منح صلاحية الأدمن')
      setTimeout(() => setSuccessMsg(''), 2500)
    } catch {}
    setTogglingId(null)
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-white">المستخدمون</h1>
          <p className="text-slate-400 text-sm">{users.length} مستخدم محمّل</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-all">
          <RefreshCw size={15}/> تحديث
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو البريد الإلكتروني..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"/>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-3 flex items-center gap-2 text-emerald-300 text-sm">
          <CheckCircle size={16}/> {successMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 flex items-center gap-2">
          <AlertCircle size={16}/> {error}
        </div>
      )}

      {/* Admin hint */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-400 flex items-start gap-2">
        <Shield size={14} className="text-emerald-400 flex-shrink-0 mt-0.5"/>
        <span>مستخدمو المنصة مع شارة <span className="text-emerald-400 font-bold">Admin</span> لديهم وصول كامل للوحة إدارة المنصة هذه. فقط منح صلاحية الأدمن لأشخاص موثوقين من فريق الشركة.</span>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full"/>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Users size={40} className="mx-auto mb-3 opacity-30"/>
            <p>لا توجد نتائج</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">المستخدم</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3 hidden md:table-cell">البريد</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">الفرق</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">الأدوار</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3 hidden lg:table-cell">انضم</th>
                  <th className="text-right text-slate-400 font-semibold px-4 py-3">الصلاحية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt=""/>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
                            {u.full_name?.[0] ?? '?'}
                          </div>
                        )}
                        <div>
                          <div className="text-white font-semibold text-sm">
                            {u.full_name || 'بدون اسم'}
                            {u.is_platform_admin && (
                              <span className="mr-2 text-[10px] bg-emerald-700 text-emerald-100 px-1.5 py-0.5 rounded-full font-bold">Admin</span>
                            )}
                          </div>
                          {u.phone && <div className="text-slate-500 text-xs">{u.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Mail size={12}/>
                        <span className="truncate max-w-[180px]">{u.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300 font-semibold">{u.team_count ?? 0}</span>
                      <span className="text-slate-500 text-xs mr-1">فريق</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles ?? []).length === 0 ? (
                          <span className="text-slate-600 text-xs">بدون أدوار</span>
                        ) : (u.roles as string[]).slice(0, 3).map((r: string) => (
                          <span key={r} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_COLOR[r] ?? 'bg-slate-600 text-slate-200'}`}>
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                        {(u.roles ?? []).length > 3 && (
                          <span className="text-xs text-slate-500">+{u.roles.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ar-SA') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {u.id === me?.id ? (
                        <span className="text-emerald-400 text-xs font-bold">أنت</span>
                      ) : (
                        <button
                          onClick={() => toggleAdmin(u.id, u.is_platform_admin)}
                          disabled={togglingId === u.id}
                          title={u.is_platform_admin ? 'إلغاء صلاحية الأدمن' : 'منح صلاحية الأدمن'}
                          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                            u.is_platform_admin
                              ? 'bg-red-900/40 hover:bg-red-900/70 text-red-400'
                              : 'bg-emerald-900/30 hover:bg-emerald-900/60 text-emerald-400'
                          } disabled:opacity-50`}>
                          {u.is_platform_admin ? <UserX size={13}/> : <ShieldCheck size={13}/>}
                          {u.is_platform_admin ? 'إلغاء أدمن' : 'منح أدمن'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination hint */}
      {users.length === LIMIT && (
        <div className="text-center">
          <button onClick={() => setOffset(o => o + LIMIT)}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-xl transition-all">
            تحميل المزيد
          </button>
        </div>
      )}
    </div>
  )
}
