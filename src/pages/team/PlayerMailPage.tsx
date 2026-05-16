import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { noteService } from '../../services'
import { formatDate } from '../../utils/helpers'

const NOTE_COLOR: Record<string, { bg: string; tc: string; border: string }> = {
  مدح:   { bg: 'bg-emerald-50', tc: 'text-emerald-700', border: 'border-emerald-200' },
  توجيه: { bg: 'bg-blue-50',    tc: 'text-blue-700',    border: 'border-blue-200' },
  تحذير: { bg: 'bg-red-50',     tc: 'text-red-700',     border: 'border-red-200' },
  تطوير: { bg: 'bg-amber-50',   tc: 'text-amber-700',   border: 'border-amber-200' },
}

export default function PlayerMailPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!teamId || !user) return
    noteService.getMyNotes(teamId, user.id).then(({ data }) => {
      setNotes(data)
      setLoading(false)
      noteService.markRead(user.id, teamId)
    })
  }, [teamId, user])

  async function submitReply(noteId: string) {
    if (!replyText.trim()) return
    setSending(true)
    await noteService.addPlayerReply(noteId, replyText)
    setNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, player_reply: replyText, player_replied_at: new Date().toISOString() } : n
    ))
    setReplyingTo(null)
    setReplyText('')
    setSending(false)
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-slate-800">📬 بريدي</h1>
        <p className="text-sm text-slate-400 mt-0.5">رسائل المدربين والإدارة — يمكنك الرد عليها</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/>
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3 text-3xl">📭</div>
          <p className="font-bold text-slate-600 mb-1">لا توجد رسائل</p>
          <p className="text-sm text-slate-400">ستظهر هنا الرسائل التي يرسلها المدربون والإدارة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => {
            const clr = NOTE_COLOR[n.note_type] ?? NOTE_COLOR['توجيه']
            const isReplying = replyingTo === n.id
            const unread = !n.is_read
            return (
              <div key={n.id} className={`rounded-2xl border-2 p-4 transition-all ${clr.bg} ${unread ? 'border-brand-400 shadow-sm' : clr.border}`}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 ${clr.tc}`}>
                      {n.note_type}
                    </span>
                    {unread && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">جديد</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(n.created_at)}</span>
                </div>

                <p className={`text-sm leading-relaxed font-medium ${clr.tc}`}>{n.content}</p>

                {n.event_title && (
                  <p className="text-xs text-slate-400 mt-1.5">🗓 {n.event_title}</p>
                )}
                {n.coach && (
                  <p className="text-xs text-slate-500 mt-1">— {n.coach.full_name}</p>
                )}

                {/* Player reply */}
                {n.player_reply && !isReplying ? (
                  <div className="mt-3 bg-white/70 rounded-xl p-3 border border-white/80">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">ردك · {formatDate(n.player_replied_at)}</p>
                    <p className="text-xs text-slate-700">{n.player_reply}</p>
                    <button onClick={() => { setReplyingTo(n.id); setReplyText(n.player_reply) }}
                      className="text-[11px] text-brand-600 mt-1.5 hover:underline">
                      تعديل الرد
                    </button>
                  </div>
                ) : isReplying ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none bg-white"
                      placeholder="اكتب ردك هنا..."/>
                    <div className="flex gap-2">
                      <button onClick={() => { setReplyingTo(null); setReplyText('') }}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-white/70">
                        إلغاء
                      </button>
                      <button onClick={() => submitReply(n.id)} disabled={sending || !replyText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-40">
                        <Send size={12}/> إرسال الرد
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setReplyingTo(n.id)}
                    className="mt-2.5 flex items-center gap-1.5 text-xs text-brand-600 font-bold hover:underline">
                    <Send size={11}/> رد على الرسالة
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
