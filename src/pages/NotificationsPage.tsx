import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { notificationService } from '../services'
import { PageHeader, EmptyState, Spinner } from '../components/ui'
import { formatTimeAgo } from '../utils/helpers'

const TYPE_ICON: Record<string, string> = {
  event: '📅', attendance: '✅', announcement: '📢', payment: '﷼',
  leave: '🏖️', note: '✏️', dm: '💬', poll: '🗳️', general: '🔔'
}
const TYPE_LINK: Record<string, (teamId?: string) => string> = {
  leave:        (t) => t ? `/team/${t}/leaves` : '/',
  event:        (t) => t ? `/team/${t}/events` : '/',
  attendance:   (t) => t ? `/team/${t}/attendance` : '/',
  payment:      (t) => t ? `/team/${t}/finance` : '/',
  announcement: (t) => t ? `/team/${t}/announcements` : '/',
  poll:         (t) => t ? `/team/${t}/announcements` : '/',
  dm:           (t) => t ? `/team/${t}/dm` : '/',
  note:         (t) => t ? `/team/${t}/players` : '/',
  general:      ()  => '/',
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    notificationService.getAll(user.id).then(n => { setNotifs(n); setLoading(false) })
  }, [user])

  const markRead = async (n: any) => {
    await notificationService.markRead(n.id)
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    const linkFn = TYPE_LINK[n.type] || TYPE_LINK['general']
    const link = linkFn(n.team_id)
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
      <PageHeader title="الإشعارات"
        subtitle={unread > 0 ? `${unread} غير مقروء` : 'كل الإشعارات مقروءة'}
        action={unread > 0 && (
          <button onClick={markAll} className="btn btn-ghost btn-sm">الكل كمقروء</button>
        )} />

      {loading ? <div className="flex justify-center py-10"><Spinner /></div>
        : notifs.length === 0
          ? <div className="card"><EmptyState icon={<BellOff size={28} />} title="لا توجد إشعارات" /></div>
          : <div className="space-y-2">
              {notifs.map(n => {
                const hasLink = !!n.team_id || n.type === 'general'
                return (
                  <div key={n.id}
                    onClick={() => markRead(n)}
                    className={`card mb-0 cursor-pointer hover:border-slate-200 transition-colors ${!n.is_read ? 'border-r-4 border-brand-400 bg-brand-50/30' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5 flex-shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{n.title}</div>
                        {n.body && <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>}
                        <div className="text-xs text-slate-400 mt-1">{formatTimeAgo(n.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!n.is_read && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                        {hasLink && <ArrowLeft size={14} className="text-slate-300" />}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>}
    </div>
  )
}
