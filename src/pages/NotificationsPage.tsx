import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff, ArrowLeft, CheckCheck, Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { notificationService } from '../services'
import { PageHeader, EmptyState, Spinner } from '../components/ui'
import { formatTimeAgo } from '../utils/helpers'

const TYPE_ICON: Record<string, string> = {
  event:        '📅',
  attendance:   '✅',
  announcement: '📢',
  payment:      '﷼',
  leave:        '🏖️',
  note:         '✏️',
  dm:           '💬',
  poll:         '🗳️',
  general:      '🔔',
}

const TYPE_LINK: Record<string, (teamId?: string) => string> = {
  leave:        t => t ? `/team/${t}/leaves`        : '/',
  event:        t => t ? `/team/${t}/events`         : '/',
  attendance:   t => t ? `/team/${t}/attendance`     : '/',
  payment:      t => t ? `/team/${t}/finance`        : '/',
  announcement: t => t ? `/team/${t}/announcements`  : '/',
  poll:         t => t ? `/team/${t}/announcements`  : '/',
  dm:           t => t ? `/team/${t}/dm`             : '/',
  note:         t => t ? `/team/${t}/players`        : '/',
  general:      ()  => '/',
}

export default function NotificationsPage() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [notifs, setNotifs]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    notificationService.getAll(user.id).then(n => { setNotifs(n); setLoading(false) })
  }, [user])

  const markRead = async (n: any) => {
    await notificationService.markRead(n.id)
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    const link = (TYPE_LINK[n.type] || TYPE_LINK.general)(n.team_id)
    navigate(link)
  }

  const markAll = async () => {
    if (!user) return
    await notificationService.markAllRead(user.id)
    setNotifs(n => n.map(x => ({ ...x, is_read: true })))
  }

  const unread = notifs.filter(n => !n.is_read).length

  return (
    <div className="max-w-lg mx-auto">
      <PageHeader
        title="الإشعارات"
        subtitle={unread > 0 ? `${unread} إشعار غير مقروء` : 'كل الإشعارات مقروءة'}
        action={unread > 0 && (
          <button onClick={markAll} className="btn btn-ghost btn-sm gap-1.5">
            <CheckCheck size={14} />
            تعليم الكل كمقروء
          </button>
        )}
      />

      {/* Unread summary pill */}
      {unread > 0 && (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-2xl px-4 py-2.5 mb-4">
          <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bell size={16} className="text-white" />
          </div>
          <p className="text-sm font-bold text-brand-700">
            لديك <span className="text-brand-600">{unread}</span> إشعار جديد
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : notifs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BellOff size={32} />}
            title="لا توجد إشعارات"
            description="ستظهر هنا إشعارات المواعيد والحضور والرسائل"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={`card cursor-pointer transition-all duration-150 active:scale-[0.99] ${
                !n.is_read
                  ? 'border-r-4 border-brand-400 bg-brand-50/40 hover:bg-brand-50'
                  : 'hover:bg-slate-50'
              }`}>
              <div className="flex items-center gap-3">
                {/* Icon bubble */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl ${
                  !n.is_read ? 'bg-brand-100' : 'bg-slate-100'
                }`}>
                  {TYPE_ICON[n.type] || '🔔'}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${!n.is_read ? 'font-extrabold text-slate-900' : 'font-bold text-slate-700'}`}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</div>
                  )}
                  <div className="text-[11px] text-slate-400 mt-1">{formatTimeAgo(n.created_at)}</div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!n.is_read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse-soft" />
                  )}
                  <ArrowLeft size={15} className="text-slate-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
