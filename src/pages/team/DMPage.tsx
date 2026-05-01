import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Send, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { dmService, teamService } from '../../services'
import { Spinner, PageHeader, EmptyState } from '../../components/ui'
import { formatTimeAgo } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

export default function DMPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [selMember, setSelMember] = useState<any>(null)
  const [msgs, setMsgs] = useState<any[]>([])
  const [convs, setConvs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMembers(teamId).then(m => setMembers(m.filter((x: any) => x.user_id !== user.id)))
    loadConvs()

    // Realtime for incoming DMs
    channelRef.current = supabase.channel(`dm:${teamId}:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `team_id=eq.${teamId}`
      }, async (payload) => {
        const msg = payload.new as any
        if (msg.receiver_id === user.id || msg.sender_id === user.id) {
          if (selMember && (msg.sender_id === selMember.user_id || msg.receiver_id === selMember.user_id)) {
            setMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender: { full_name: selMember.profile?.full_name } }])
          }
          loadConvs()
        }
      }).subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [teamId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function loadConvs() {
    if (!teamId || !user) return
    const c = await dmService.getConversations(teamId, user.id)
    setConvs(c)
  }

  async function selectMember(m: any) {
    setSelMember(m); setLoading(true)
    if (!teamId || !user) return
    const messages = await dmService.getMessages(teamId, user.id, m.user_id)
    setMsgs(messages); setLoading(false)
    await dmService.markRead(teamId, m.user_id, user.id)
    loadConvs()
  }

  async function send() {
    if (!text.trim() || !teamId || !user || !selMember) return
    setSending(true)
    const content = text.trim()
    setText('')
    await dmService.send({ team_id: teamId, sender_id: user.id, receiver_id: selMember.user_id, content, is_read: false })
    const updated = await dmService.getMessages(teamId, user.id, selMember.user_id)
    setMsgs(updated); setSending(false)
  }

  const getUnread = (userId: string) => {
    const conv = convs.find(c => c.partnerId === userId)
    return conv?.unread || 0
  }

  return (
    <div>
      <PageHeader title="الرسائل الخاصة" subtitle="محادثات سرية — لا يراها أحد سواكم"/>
      <div className="card p-0 overflow-hidden flex" style={{ height: 'calc(100vh - 190px)' }}>
        {/* Members sidebar */}
        <div className="w-52 border-l border-slate-100 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-100 text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Lock size={11}/> المحادثات
          </div>
          <div className="flex-1 overflow-y-auto">
            {members.length === 0
              ? <div className="p-4 text-xs text-slate-400 text-center mt-4">لا يوجد أعضاء</div>
              : members.map(m => {
                  const unread = getUnread(m.user_id)
                  const conv = convs.find(c => c.partnerId === m.user_id)
                  return (
                    <button key={m.id} onClick={() => selectMember(m)}
                      className={`w-full text-right p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selMember?.id === m.id ? 'bg-brand-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {m.profile?.full_name?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs truncate ${selMember?.id === m.id ? 'font-bold text-brand-800' : 'font-bold'}`}>
                            {m.profile?.full_name}
                          </div>
                          {conv?.lastMsg && (
                            <div className="text-xs text-slate-400 truncate">{conv.lastMsg.content}</div>
                          )}
                        </div>
                        {unread > 0 && (
                          <span className="w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selMember ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={<Lock size={28}/>} title="اختر محادثة" description="اختر عضواً لبدء محادثة خاصة"/>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                <Lock size={13} className="text-slate-400"/>
                <span className="font-bold text-sm">{selMember.profile?.full_name}</span>
                <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full mr-auto">سري</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading ? <div className="flex justify-center py-8"><Spinner/></div>
                  : msgs.length === 0
                    ? <div className="text-center text-slate-400 text-sm py-8">ابدأ المحادثة 👋</div>
                    : msgs.map(m => {
                        const isMe = m.sender_id === user?.id
                        return (
                          <div key={m.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className="w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-auto">
                              {isMe ? (user as any)?.email?.[0]?.toUpperCase() : selMember.profile?.full_name?.[0]}
                            </div>
                            <div className="max-w-[72%]">
                              <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>{m.content}</div>
                              <div className="text-xs text-slate-300 mt-0.5">{formatTimeAgo(m.created_at)}</div>
                            </div>
                          </div>
                        )
                      })}
                <div ref={bottomRef}/>
              </div>
              <div className="border-t border-slate-100 p-3 flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="رسالة خاصة..." className="form-input flex-1"/>
                <button onClick={send} disabled={sending || !text.trim()} className="btn btn-primary btn-icon">
                  {sending ? <Spinner size="sm"/> : <Send size={15}/>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
