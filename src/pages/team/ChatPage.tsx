import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Send, MessageCircle, Lock, Users, Baby } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { chatService, dmService, teamService, permissionService } from '../../services'
import { Spinner, PageHeader } from '../../components/ui'
import { formatTimeAgo } from '../../utils/helpers'
import { supabase } from '../../lib/supabase'

const STAFF_ROLES = ['owner', 'head_coach', 'assistant_coach', 'administrator']

// ── Reusable Chat Panel ────────────────────────────────────────────────
function ChatPanel({
  teamId, user, chatType, placeholder, emptyTitle
}: {
  teamId: string; user: any
  chatType: 'general' | 'parents'
  placeholder: string; emptyTitle: string
}) {
  const [msgs, setMsgs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatService.getMessages(teamId, chatType).then(m => { setMsgs(m); setLoading(false) })
    channelRef.current = chatService.subscribeToMessages(teamId, chatType, (newMsg: any) => {
      setMsgs(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
    })
    return () => { channelRef.current?.unsubscribe() }
  }, [teamId, chatType])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const trimmed = text.trim(); setText('')
    await chatService.send({ team_id: teamId, sender_id: user.id, content: trimmed, chat_type: chatType })
    setSending(false)
    inputRef.current?.focus()
  }

  const grouped = msgs.reduce((acc: any[], msg, i) => {
    const prev = msgs[i - 1]
    return [...acc, { ...msg, showSender: !prev || prev.sender_id !== msg.sender_id }]
  }, [])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5" style={{ background: '#FAFBFC' }}>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg"/></div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-3xl flex items-center justify-center mb-4">
              {chatType === 'parents' ? <Baby size={28} className="text-brand-500"/> : <MessageCircle size={28} className="text-brand-500"/>}
            </div>
            <p className="font-extrabold text-slate-600 text-base">{emptyTitle}</p>
            <p className="text-sm text-slate-400 mt-1">أرسل رسالة لبدء الحديث</p>
          </div>
        ) : grouped.map(m => {
          const isMe = m.sender_id === user?.id
          return (
            <div key={m.id}
              className={`flex gap-2.5 items-end ${isMe ? 'flex-row-reverse' : 'flex-row'} ${m.showSender ? 'mt-4' : 'mt-0.5'}`}>
              {!isMe && (
                m.showSender
                  ? <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0">{m.sender?.full_name?.[0] || '?'}</div>
                  : <div className="w-8 flex-shrink-0"/>
              )}
              <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMe && m.showSender && <div className="text-xs font-bold text-slate-500 mb-1 mr-1">{m.sender?.full_name}</div>}
                <div className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}>{m.content}</div>
                {m.showSender && <div className={`text-[11px] text-slate-400 mt-1 ${isMe ? 'text-left' : 'mr-1'}`}>{formatTimeAgo(m.created_at)}</div>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef}/>
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2.5 bg-white">
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={placeholder} className="form-input flex-1 py-3"/>
        <button onClick={send} disabled={sending || !text.trim()}
          className="btn btn-primary btn-icon w-12 h-12 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
          {sending ? <Spinner size="sm"/> : <Send size={18}/>}
        </button>
      </div>
    </div>
  )
}

// ── Contact DM Panel ───────────────────────────────────────────────────
function DMTab({ teamId, user, allowedContactIds, headerIcon, emptyContactMsg, chatLabel }: {
  teamId: string; user: any; allowedContactIds?: string[]
  headerIcon?: React.ReactNode; emptyContactMsg?: string; chatLabel?: string
}) {
  const [members, setMembers]     = useState<any[]>([])
  const [selMember, setSelMember] = useState<any>(null)
  const [msgs, setMsgs]           = useState<any[]>([])
  const [convs, setConvs]         = useState<any[]>([])
  const [loading, setLoading]     = useState(false)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const channelRef   = useRef<any>(null)
  const selMemberRef = useRef<any>(null)

  useEffect(() => {
    teamService.getMembers(teamId).then(m => {
      let list = m.filter((x: any) => x.user_id !== user.id)
      if (allowedContactIds !== undefined) list = list.filter((x: any) => allowedContactIds.includes(x.user_id))
      setMembers(list)
    })
  }, [teamId, user, allowedContactIds])

  useEffect(() => {
    loadConvs()
    const channelKey = chatLabel ? `dm-${chatLabel}:${teamId}:${user.id}` : `dm:${teamId}:${user.id}`
    channelRef.current = supabase.channel(channelKey)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `team_id=eq.${teamId}` },
        async (payload) => {
          const msg = payload.new as any
          const cur = selMemberRef.current
          if (msg.receiver_id === user.id || msg.sender_id === user.id) {
            if (cur && (msg.sender_id === cur.user_id || msg.receiver_id === cur.user_id)) {
              setMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
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

  // Sort contacts: those with messages first (newest → oldest), then alphabetical
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const aTime = convs.find(c => c.partnerId === a.user_id)?.lastMsg?.created_at || ''
      const bTime = convs.find(c => c.partnerId === b.user_id)?.lastMsg?.created_at || ''
      if (aTime && bTime) return bTime.localeCompare(aTime)
      if (aTime) return -1
      if (bTime) return 1
      return (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '')
    })
  }, [members, convs])

  async function selectMember(m: any) {
    setSelMember(m); selMemberRef.current = m; setLoading(true)
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

  const getUnread = (uid: string) => convs.find(c => c.partnerId === uid)?.unread || 0

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Contact list sidebar ── */}
      <div className="w-56 border-l border-slate-100 flex flex-col flex-shrink-0 bg-slate-50/50">
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-1.5">
          {headerIcon || <Lock size={11} className="text-brand-500"/>}
          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            {chatLabel || 'المحادثات'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedMembers.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 text-center mt-8 leading-relaxed">
              {emptyContactMsg || 'لا توجد جهات تواصل'}
            </div>
          ) : sortedMembers.map(m => {
            const unread  = getUnread(m.user_id)
            const conv    = convs.find(c => c.partnerId === m.user_id)
            const isActive = selMember?.user_id === m.user_id
            const hasMsg   = !!conv?.lastMsg
            return (
              <button key={m.user_id} onClick={() => selectMember(m)}
                className={`w-full text-right px-3 py-3 border-b border-slate-50 hover:bg-white transition-colors ${isActive ? 'bg-white border-r-2 border-brand-500' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${isActive ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'}`}>
                    {m.profile?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate font-bold ${isActive ? 'text-brand-700' : unread > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                      {m.profile?.full_name || '—'}
                    </div>
                    {hasMsg
                      ? <div className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>{conv.lastMsg.content}</div>
                      : <div className="text-xs text-slate-300 mt-0.5">ابدأ المحادثة</div>}
                  </div>
                  {unread > 0 && (
                    <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center flex-shrink-0">
                      {unread}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selMember ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
            <div className="w-16 h-16 bg-brand-50 rounded-3xl flex items-center justify-center">
              {headerIcon
                ? <span className="scale-150">{headerIcon}</span>
                : <Lock size={28} className="text-brand-400"/>}
            </div>
            <p className="font-extrabold text-slate-600">اختر محادثة</p>
            <p className="text-xs text-slate-400">اختر شخصاً من القائمة لبدء المحادثة</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-white">
              <div className="w-9 h-9 bg-brand-500 text-white rounded-2xl flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                {selMember.profile?.full_name?.[0]}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-sm text-slate-800">{selMember.profile?.full_name}</div>
                <div className="text-xs text-slate-400 flex items-center gap-1"><Lock size={10}/> خاص</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: '#FAFBFC' }}>
              {loading ? <div className="flex justify-center py-8"><Spinner/></div>
                : msgs.length === 0
                  ? <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                      <div className="text-3xl">👋</div>
                      <p className="text-sm font-bold text-slate-500">ابدأ المحادثة</p>
                    </div>
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
              <div ref={bottomRef}/>
            </div>
            <div className="border-t border-slate-100 p-3 flex gap-2.5 bg-white">
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={`رسالة لـ ${selMember.profile?.full_name}...`}
                className="form-input flex-1 py-3"/>
              <button onClick={send} disabled={sending || !text.trim()}
                className="btn btn-primary btn-icon w-12 h-12 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <Spinner size="sm"/> : <Send size={16}/>}
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
  const [myRole, setMyRole]                             = useState('')
  const [myPerms, setMyPerms]                           = useState<string[]>([])
  const [unreadDM, setUnreadDM]                         = useState(0)
  const [allowedContactIds, setAllowedContactIds]       = useState<string[] | undefined>(undefined)
  const [parentChatContactIds, setParentChatContactIds] = useState<string[] | undefined>(undefined)
  const [tab, setTab]                                   = useState<string>('')

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(async r => {
      const role = r || ''
      setMyRole(role)
      setTab(role === 'parent' ? 'parents' : 'general')
      const [perms, allMembers] = await Promise.all([
        permissionService.getUserPermissions(teamId, user.id),
        teamService.getMembers(teamId),
      ])
      setMyPerms(perms)

      // Compute who this user can chat with in the parents tab
      if (role === 'parent') {
        // Parent → can message staff (coaches + admins)
        const staffIds = allMembers
          .filter((m: any) => STAFF_ROLES.includes(m.role))
          .map((m: any) => m.user_id)
        setParentChatContactIds(staffIds)
        // DM tab: specific contacts from permissions, or all staff if none configured
        const dmIds = perms.filter((p: string) => p.startsWith('parent_dm:')).map((p: string) => p.replace('parent_dm:', ''))
        setAllowedContactIds(dmIds.length > 0 ? dmIds : undefined)
      } else if (STAFF_ROLES.includes(role)) {
        // Staff → can message all parents in parents tab
        const parentIds = allMembers
          .filter((m: any) => m.role === 'parent')
          .map((m: any) => m.user_id)
        setParentChatContactIds(parentIds)
      }
    })
    dmService.getConversations(teamId, user.id).then(convs =>
      setUnreadDM(convs.reduce((s: number, c: any) => s + c.unread, 0)))
  }, [teamId, user])

  if (!teamId || !user || !myRole) return null

  const isParentRole = myRole === 'parent'
  const isPlayerRole = myRole === 'player'
  const isManagerRole = ['owner', 'head_coach', 'assistant_coach', 'administrator'].includes(myRole)
  // Managers and parents always see parent chat; others need explicit view_parent_chat permission
  const canSeeParentChat = isParentRole || isManagerRole || myPerms.includes('view_parent_chat')

  // Build tab list
  const tabList = [
    ...(!isParentRole ? [{ key: 'general', icon: <Users size={15}/>, label: 'شات الفريق' }] : []),
    ...(canSeeParentChat ? [{ key: 'parents', icon: <Baby size={15}/>, label: 'شات أولياء الأمور' }] : []),
    { key: 'dm', icon: <Lock size={15}/>, label: 'رسائل خاصة', badge: unreadDM },
  ]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
      <PageHeader title="التواصل الداخلي" subtitle="شات الفريق والرسائل الخاصة"/>
      <div className="card flex-1 flex flex-col p-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-white flex-shrink-0">
          {tabList.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-2 flex-1 justify-center py-3 text-sm font-bold transition-all border-b-2 ${
                tab === t.key ? 'border-brand-500 text-brand-700 bg-brand-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              {(t as any).badge > 0 && (
                <span className="absolute top-1.5 left-3 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center">
                  {(t as any).badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <ChatPanel teamId={teamId} user={user} chatType="general"
            placeholder="اكتب رسالة للفريق..." emptyTitle="ابدأ المحادثة الأولى 👋"/>
        )}
        {tab === 'parents' && (
          <DMTab
            teamId={teamId} user={user}
            allowedContactIds={parentChatContactIds}
            headerIcon={<Baby size={11} className="text-brand-500"/>}
            chatLabel="أولياء الأمور"
            emptyContactMsg={
              isParentRole
                ? 'لا يوجد مشرفون مسجلون في الفريق'
                : 'لا يوجد أولياء أمور مسجلون في الفريق'
            }
          />
        )}
        {tab === 'dm' && (
          <DMTab
            teamId={teamId} user={user}
            allowedContactIds={allowedContactIds}
            headerIcon={<Lock size={11} className="text-brand-500"/>}
            chatLabel="خاص"
            emptyContactMsg="لا توجد جهات تواصل مسموح بها"
          />
        )}
      </div>
    </div>
  )
}
