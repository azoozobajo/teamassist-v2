import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Send, MessageCircle, Lock, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { chatService, dmService, teamService } from '../../services'
import { Spinner, PageHeader } from '../../components/ui'
import { formatTimeAgo } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

// ── Group Chat Tab ─────────────────────────────────────────────────────
function GroupChatTab({ teamId, user }: { teamId: string; user: any }) {
  const [msgs, setMsgs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatService.getMessages(teamId).then(m => { setMsgs(m); setLoading(false) })
    channelRef.current = chatService.subscribeToMessages(teamId, (newMsg: any) => {
      setMsgs(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
    })
    return () => { channelRef.current?.unsubscribe() }
  }, [teamId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const trimmed = text.trim()
    setText('')
    await chatService.send({ team_id: teamId, sender_id: user.id, content: trimmed })
    setSending(false)
    inputRef.current?.focus()
  }

  const grouped = msgs.reduce((acc: any[], msg, i) => {
    const prev = msgs[i - 1]
    const showSender = !prev || prev.sender_id !== msg.sender_id
    return [...acc, { ...msg, showSender }]
  }, [])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5" style={{ background: '#FAFBFC' }}>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-3xl flex items-center justify-center mb-4">
              <MessageCircle size={28} className="text-brand-500" />
            </div>
            <p className="font-extrabold text-slate-600 text-base">ابدأ المحادثة الأولى 👋</p>
            <p className="text-sm text-slate-400 mt-1">أرسل رسالة لبدء النقاش مع الفريق</p>
          </div>
        ) : (
          grouped.map(m => {
            const isMe = m.sender_id === user?.id
            return (
              <div key={m.id}
                className={`flex gap-2.5 items-end ${isMe ? 'flex-row-reverse' : 'flex-row'} ${m.showSender ? 'mt-4' : 'mt-0.5'}`}>
                {!isMe && (
                  m.showSender ? (
                    <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                      {m.sender?.full_name?.[0] || '?'}
                    </div>
                  ) : <div className="w-8 flex-shrink-0" />
                )}
                <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!isMe && m.showSender && (
                    <div className="text-xs font-bold text-slate-500 mb-1 mr-1">{m.sender?.full_name}</div>
                  )}
                  <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>{m.content}</div>
                  {m.showSender && (
                    <div className={`text-[11px] text-slate-400 mt-1 ${isMe ? 'text-left' : 'mr-1'}`}>
                      {formatTimeAgo(m.created_at)}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2.5 bg-white">
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="اكتب رسالة للفريق..."
          className="form-input flex-1 py-3" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="btn btn-primary btn-icon w-12 h-12 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
          {sending ? <Spinner size="sm" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}

// ── DM Tab ─────────────────────────────────────────────────────────────
function DMTab({ teamId, user }: { teamId: string; user: any }) {
  const [members, setMembers]   = useState<any[]>([])
  const [selMember, setSelMember] = useState<any>(null)
  const [msgs, setMsgs]         = useState<any[]>([])
  const [convs, setConvs]       = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    teamService.getMembers(teamId).then(m => setMembers(m.filter((x: any) => x.user_id !== user.id)))
    loadConvs()
    channelRef.current = supabase.channel(`dm:${teamId}:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `team_id=eq.${teamId}` },
        async (payload) => {
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function loadConvs() {
    const c = await dmService.getConversations(teamId, user.id)
    setConvs(c)
  }

  async function selectMember(m: any) {
    setSelMember(m); setLoading(true)
    const messages = await dmService.getMessages(teamId, user.id, m.user_id)
    setMsgs(messages); setLoading(false)
    await dmService.markRead(teamId, m.user_id, user.id)
    loadConvs()
  }

  async function send() {
    if (!text.trim() || !selMember) return
    setSending(true)
    const content = text.trim(); setText('')
    await dmService.send({ team_id: teamId, sender_id: user.id, receiver_id: selMember.user_id, content, is_read: false })
    const updated = await dmService.getMessages(teamId, user.id, selMember.user_id)
    setMsgs(updated); setSending(false)
  }

  const getUnread = (userId: string) => convs.find(c => c.partnerId === userId)?.unread || 0

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Members sidebar */}
      <div className="w-52 border-l border-slate-100 flex flex-col flex-shrink-0 bg-slate-50/50">
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-1.5">
          <Lock size={11} className="text-brand-500" />
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">المحادثات</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {members.length === 0
            ? <div className="p-4 text-xs text-slate-400 text-center mt-6">لا يوجد أعضاء آخرون</div>
            : members.map(m => {
                const unread = getUnread(m.user_id)
                const conv = convs.find(c => c.partnerId === m.user_id)
                const isActive = selMember?.id === m.id
                return (
                  <button key={m.id} onClick={() => selectMember(m)}
                    className={`w-full text-right px-3 py-3 border-b border-slate-50 hover:bg-white transition-colors ${isActive ? 'bg-white border-r-2 border-brand-500' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${isActive ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'}`}>
                        {m.profile?.full_name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs truncate font-bold ${isActive ? 'text-brand-800' : 'text-slate-700'}`}>
                          {m.profile?.full_name}
                        </div>
                        {conv?.lastMsg
                          ? <div className="text-xs text-slate-400 truncate">{conv.lastMsg.content}</div>
                          : <div className="text-xs text-slate-300">ابدأ المحادثة</div>}
                      </div>
                      {unread > 0 && (
                        <span className="w-5 h-5 bg-red-500 text-white text-xs font-extrabold rounded-full flex items-center justify-center flex-shrink-0 animate-pulse-soft">
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
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
            <div className="w-16 h-16 bg-brand-50 rounded-3xl flex items-center justify-center">
              <Lock size={28} className="text-brand-400" />
            </div>
            <p className="font-extrabold text-slate-600">اختر محادثة</p>
            <p className="text-xs text-slate-400">اختر عضواً من القائمة لبدء محادثة خاصة سرية</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-white">
              <div className="w-9 h-9 bg-brand-500 text-white rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                {selMember.profile?.full_name?.[0]}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm text-slate-800">{selMember.profile?.full_name}</div>
                <div className="text-xs text-slate-400 flex items-center gap-1"><Lock size={10} /> سرية</div>
              </div>
              <span className="badge badge-gray text-xs">خاص</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: '#FAFBFC' }}>
              {loading ? <div className="flex justify-center py-8"><Spinner /></div>
                : msgs.length === 0
                  ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                      <div className="text-3xl">👋</div>
                      <p className="text-sm font-bold text-slate-500">ابدأ المحادثة</p>
                    </div>
                  )
                  : msgs.map(m => {
                      const isMe = m.sender_id === user?.id
                      return (
                        <div key={m.id} className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`w-7 h-7 rounded-2xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${isMe ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'}`}>
                            {isMe ? (user as any)?.email?.[0]?.toUpperCase() : selMember.profile?.full_name?.[0]}
                          </div>
                          <div className="max-w-[72%]">
                            <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>{m.content}</div>
                            <div className={`text-[11px] text-slate-400 mt-0.5 ${isMe ? 'text-left' : ''}`}>{formatTimeAgo(m.created_at)}</div>
                          </div>
                        </div>
                      )
                    })}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-slate-100 p-3 flex gap-2.5 bg-white">
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={`رسالة لـ ${selMember.profile?.full_name}...`}
                className="form-input flex-1 py-3" />
              <button onClick={send} disabled={sending || !text.trim()}
                className="btn btn-primary btn-icon w-12 h-12 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <Spinner size="sm" /> : <Send size={16} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────
export default function ChatPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [tab, setTab] = useState<'group' | 'dm'>('group')

  if (!teamId || !user) return null

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      <PageHeader title="التواصل الداخلي" subtitle="شات الفريق والرسائل الخاصة" />

      <div className="card flex-1 flex flex-col p-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-white flex-shrink-0">
          <button
            onClick={() => setTab('group')}
            className={`flex items-center gap-2 flex-1 justify-center py-3 text-sm font-bold transition-all border-b-2 ${
              tab === 'group' ? 'border-brand-500 text-brand-700 bg-brand-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            <Users size={16} />
            شات الفريق
          </button>
          <button
            onClick={() => setTab('dm')}
            className={`flex items-center gap-2 flex-1 justify-center py-3 text-sm font-bold transition-all border-b-2 ${
              tab === 'dm' ? 'border-brand-500 text-brand-700 bg-brand-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            <Lock size={16} />
            رسائل خاصة
          </button>
        </div>

        {tab === 'group'
          ? <GroupChatTab teamId={teamId} user={user} />
          : <DMTab teamId={teamId} user={user} />
        }
      </div>
    </div>
  )
}
