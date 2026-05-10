import React, { useEffect, useState } from 'react'
import {
  Users, Shield, Calendar, MessageCircle, Activity,
  Stethoscope, TrendingUp, UserCheck, Trophy, DollarSign,
  BookOpen, AlertCircle, CheckCircle, Layers, Dumbbell
} from 'lucide-react'
import { adminService } from '../../services'

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-white">{value ?? '—'}</div>
        <div className="text-slate-400 text-xs mt-0.5">{label}</div>
        {sub && <div className="text-emerald-400 text-xs mt-1">{sub}</div>}
      </div>
    </div>
  )
}

const ROLE_AR: Record<string, string> = {
  owner: 'مالك', head_coach: 'مدرب رئيسي', assistant_coach: 'مدرب مساعد',
  player: 'لاعب', administrator: 'إداري', media: 'إعلام',
  medical: 'طبيب', parent: 'ولي أمر', guest: 'ضيف',
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-purple-600', head_coach: 'bg-blue-600', assistant_coach: 'bg-blue-500',
  player: 'bg-emerald-600', administrator: 'bg-orange-500', media: 'bg-pink-500',
  medical: 'bg-red-500', parent: 'bg-yellow-500', guest: 'bg-slate-500',
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminService.getStats()
      .then(setStats)
      .catch(e => setError(e.message || 'خطأ في تحميل الإحصائيات'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full"/>
    </div>
  )

  if (error) return (
    <div className="bg-red-900/30 border border-red-700 rounded-2xl p-6 text-red-300 text-center">
      <AlertCircle size={40} className="mx-auto mb-3"/>
      <p className="font-bold">{error}</p>
      <p className="text-sm mt-1 text-red-400">تأكد من تشغيل V13 SQL Migration وأن حسابك مُعيَّن كـ platform admin</p>
    </div>
  )

  const roleBreakdown: Record<string, number> = stats?.role_breakdown ?? {}
  const roles = Object.entries(roleBreakdown).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white">لوحة إدارة المنصة</h1>
        <p className="text-slate-400 text-sm mt-1">إحصائيات شاملة لجميع بيانات TeamAssist</p>
      </div>

      {/* Growth cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-900/40 border border-emerald-700 rounded-2xl p-4 text-center">
          <div className="text-3xl font-extrabold text-emerald-300">{stats?.new_teams_30d ?? 0}</div>
          <div className="text-emerald-400 text-xs mt-1">فريق جديد (30 يوم)</div>
        </div>
        <div className="bg-blue-900/40 border border-blue-700 rounded-2xl p-4 text-center">
          <div className="text-3xl font-extrabold text-blue-300">{stats?.new_users_30d ?? 0}</div>
          <div className="text-blue-400 text-xs mt-1">مستخدم جديد (30 يوم)</div>
        </div>
        <div className="bg-purple-900/40 border border-purple-700 rounded-2xl p-4 text-center">
          <div className="text-3xl font-extrabold text-purple-300">{stats?.new_members_30d ?? 0}</div>
          <div className="text-purple-400 text-xs mt-1">عضو انضم لفريق (30 يوم)</div>
        </div>
      </div>

      {/* Main KPIs */}
      <div>
        <h2 className="text-slate-400 text-xs font-extrabold uppercase tracking-widest mb-3">إحصائيات المنصة الكلية</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard icon={Shield}       label="إجمالي الفرق النشطة"   value={stats?.total_teams}        color="bg-emerald-600"/>
          <StatCard icon={Users}        label="إجمالي المستخدمين"      value={stats?.total_users}        color="bg-blue-600"/>
          <StatCard icon={UserCheck}    label="أعضاء نشطون في فرق"    value={stats?.total_members}      color="bg-purple-600"/>
          <StatCard icon={Calendar}     label="إجمالي المواعيد"        value={stats?.total_events}       color="bg-orange-500"/>
          <StatCard icon={Trophy}       label="إجمالي المباريات"       value={stats?.total_matches}      color="bg-yellow-500"/>
          <StatCard icon={Activity}     label="جلسات تدريبية"         value={stats?.total_training}     color="bg-teal-600"/>
          <StatCard icon={MessageCircle}label="رسائل المحادثات"        value={stats?.total_messages}     color="bg-pink-600"/>
          <StatCard icon={Stethoscope}  label="تقارير طبية"           value={stats?.total_injuries}     sub={`${stats?.active_injuries ?? 0} نشطة`} color="bg-red-600"/>
          <StatCard icon={CheckCircle}  label="سجلات الحضور"          value={stats?.total_attendance}   color="bg-lime-600"/>
          <StatCard icon={TrendingUp}   label="معاملات النقاط"         value={stats?.total_points_tx}    color="bg-cyan-600"/>
          <StatCard icon={BookOpen}     label="طلبات الإجازات"         value={stats?.total_leaves}       color="bg-indigo-500"/>
          <StatCard icon={DollarSign}   label="الالتزامات المالية"     value={stats?.total_finance}      color="bg-green-600"/>
        </div>
      </div>

      {/* Role breakdown */}
      <div>
        <h2 className="text-slate-400 text-xs font-extrabold uppercase tracking-widest mb-3">توزيع الأدوار عبر المنصة</h2>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 divide-y divide-slate-700 overflow-hidden">
          {roles.length === 0 && (
            <div className="p-6 text-center text-slate-500 text-sm">لا توجد بيانات أدوار بعد</div>
          )}
          {roles.map(([role, count]) => {
            const total = stats?.total_members || 1
            const pct = Math.round((count / total) * 100)
            return (
              <div key={role} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ROLE_COLOR[role] ?? 'bg-slate-500'}`}/>
                <span className="text-white text-sm font-semibold w-32 flex-shrink-0">
                  {ROLE_AR[role] ?? role}
                </span>
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${ROLE_COLOR[role] ?? 'bg-slate-500'}`}
                       style={{ width: `${pct}%` }}/>
                </div>
                <span className="text-slate-300 text-sm font-bold w-12 text-left">{count}</span>
                <span className="text-slate-500 text-xs w-10 text-left">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick health */}
      <div>
        <h2 className="text-slate-400 text-xs font-extrabold uppercase tracking-widest mb-3">مؤشرات صحة المنصة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <div className="text-slate-400 text-xs mb-2">متوسط أعضاء الفريق</div>
            <div className="text-2xl font-extrabold text-white">
              {stats?.avg_members_per_team ?? '—'}
            </div>
            <div className="text-slate-500 text-xs">عضو / فريق</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <div className="text-slate-400 text-xs mb-2">الإصابات النشطة</div>
            <div className={`text-2xl font-extrabold ${(stats?.active_injuries ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {stats?.active_injuries ?? 0}
            </div>
            <div className="text-slate-500 text-xs">من أصل {stats?.total_injuries ?? 0} تقرير طبي</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <div className="text-slate-400 text-xs mb-2">مستخدمون في فرق</div>
            <div className="text-2xl font-extrabold text-emerald-400">{stats?.users_in_team ?? 0}</div>
            <div className="text-slate-500 text-xs">من أصل {stats?.total_users ?? 0} مستخدم</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
            <div className="text-slate-400 text-xs mb-2">بدون فريق</div>
            <div className="text-2xl font-extrabold text-amber-400">{stats?.users_no_team ?? 0}</div>
            <div className="text-slate-500 text-xs">مستخدمون غير منضمين</div>
          </div>
        </div>
      </div>

      {/* Age & Sport breakdowns */}
      {(stats?.age_category_breakdown || stats?.sport_type_breakdown) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Age category breakdown */}
          {stats?.age_category_breakdown && Object.keys(stats.age_category_breakdown).length > 0 && (
            <div>
              <h2 className="text-slate-400 text-xs font-extrabold uppercase tracking-widest mb-3">توزيع الفئات العمرية</h2>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 divide-y divide-slate-700 overflow-hidden">
                {Object.entries(stats.age_category_breakdown as Record<string,number>)
                  .sort((a,b) => b[1] - a[1])
                  .map(([cat, count]) => {
                    const total = stats.total_teams || 1
                    const pct = Math.round((count / total) * 100)
                    return (
                      <div key={cat} className="flex items-center gap-3 px-4 py-3">
                        <Layers size={14} className="text-slate-400 flex-shrink-0"/>
                        <span className="text-white text-sm font-semibold flex-1">{cat}</span>
                        <div className="w-24 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }}/>
                        </div>
                        <span className="text-slate-300 text-sm font-bold w-8 text-left">{count as number}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Sport type breakdown */}
          {stats?.sport_type_breakdown && Object.keys(stats.sport_type_breakdown).length > 0 && (
            <div>
              <h2 className="text-slate-400 text-xs font-extrabold uppercase tracking-widest mb-3">توزيع أنواع الرياضة</h2>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 divide-y divide-slate-700 overflow-hidden">
                {Object.entries(stats.sport_type_breakdown as Record<string,number>)
                  .sort((a,b) => b[1] - a[1])
                  .map(([sport, count]) => {
                    const total = stats.total_teams || 1
                    const pct = Math.round((count / total) * 100)
                    return (
                      <div key={sport} className="flex items-center gap-3 px-4 py-3">
                        <Dumbbell size={14} className="text-slate-400 flex-shrink-0"/>
                        <span className="text-white text-sm font-semibold flex-1">{sport}</span>
                        <div className="w-24 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/>
                        </div>
                        <span className="text-slate-300 text-sm font-bold w-8 text-left">{count as number}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-slate-600 text-xs">TeamAssist Platform Admin • بيانات محدّثة لحظياً من قاعدة البيانات</p>
      </div>
    </div>
  )
}
