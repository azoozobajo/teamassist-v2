import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { chatService } from '../../services'
import { Spinner, PageHeader } from '../../components/ui'
import { formatTimeAgo } from '../../utils/helpers'

export default function ChatPage() {
  const { teamId } = useParams()
  const { user, profile } = useAuth()
  const [msgs, setMsgs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!teamId) return
    chatService.getMessages(teamId).then(m => { setMsgs(m); setLoading(false) })

    // Realtime subscription
    channelRef.current = chatService.subscribeToMessages(teamId, (newMsg: any) => {
      setMsgs(prev => {
        if (prev.find(m => m.id === newMsg.id)) return prev
        return [...prev, newMsg]
      })
    })

    return () => { channelRef.current?.unsubscribe() }
  }, [teamId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    if (!text.trim() || !teamId || !user) return
    setSending(true)
    const trimmed = text.trim()
    setText('')
    await chatService.send({ team_id: teamId, sender_id: user.id, content: trimmed })
    setSending(false)
  }

  const grouped = msgs.reduce((acc: any[], msg, i) => {
    const prev = msgs[i - 1]
    const showSender = !prev || prev.sender_id !== msg.sender_id
    return [...acc, { ...msg, showSender }]
  }, [])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      <PageHeader title="شات الفريق" subtitle="مجموعة الفريق" />
      <div className="card flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading ? <div className="flex justify-center py-10"><Spinner/></div>
            : msgs.length === 0
              ? <div className="text-center text-slate-400 text-sm py-10">ابدأ المحادثة الأولى 👋</div>
              : grouped.map(m => {
                  const isMe = m.sender_id === user?.id
                  return (
                    <div key={m.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} ${m.showSender ? 'mt-3' : 'mt-0.5'}`}>
                      {!isMe && m.showSender && (
                        <div className="w-7 h-7 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-auto">
                          {m.sender?.full_name?.[0] || '?'}
                        </div>
                      )}
                      {!isMe && !m.showSender && <div className="w-7 flex-shrink-0"/>}
                      <div className={`max-w-[72%]`}>
                        {!isMe && m.showSender && (
                          <div className="text-xs text-slate-400 mb-0.5 mr-1">{m.sender?.full_name}</div>
                        )}
                        <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>
                          {m.content}
                        </div>
                        {m.showSender && (
                          <div className={`text-xs text-slate-300 mt-0.5 ${isMe ? 'text-left' : 'mr-1'}`}>
                            {formatTimeAgo(m.created_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
          <div ref={bottomRef}/>
        </div>
        <div className="border-t border-slate-100 p-3 flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="اكتب رسالة..." className="form-input flex-1"/>
          <button onClick={send} disabled={sending || !text.trim()} className="btn btn-primary btn-icon">
            {sending ? <Spinner size="sm"/> : <Send size={16}/>}
          </button>
        </div>
      </div>
    </div>
  )
}
