import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Inbox, Send, Star, Plus, X, Paperclip, ChevronDown,
  ChevronUp, CornerDownLeft
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { mailService, teamService, notificationService } from '../../services'
import { Avatar, Spinner, EmptyState, PageHeader } from '../../components/ui'
import { canManageEvents, canManageTeam, isParent } from '../../utils/helpers'

type Tab = 'inbox' | 'sent' | 'starred'

const STAFF_ROLES = ['owner', 'coach', 'admin', 'medical']

function relativeDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} س`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ي`
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })
}

export default function MailPage() {
  const { teamId } = useParams()
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('inbox')
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, any[]>>({})
  const [loadingReplies, setLoadingReplies] = useState<string | null>(null)

  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const [members, setMembers] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')

  const [compose, setCompose] = useState(false)
  const [composeForm, setComposeForm] = useState({ receiver_id: '', title: '', content: '', attachment_url: '' })
  const [sending, setSending] = useState(false)
  const [composeError, setComposeError] = useState('')

  const [togglingStarId, setTogglingStarId] = useState<string | null>(null)
  const [replyStubs, setReplyStubs] = useState<any[]>([])

  useEffect(() => {
    if (!teamId || !user) return
    teamService.getMyRole(teamId, user.id).then(r => setMyRole(r || ''))
    teamService.getMembers(teamId).then(setMembers)
  }, [teamId, user])

  useEffect(() => {
    loadMessages()
  }, [tab, teamId, user])

  async function loadMessages() {
    if (!teamId || !user) return
    setLoading(true)
    setLoadError('')
    setExpandedId(null)

    let result: { data: any[]; error: any }
    if (tab === 'inbox') result = await mailService.getInbox(teamId, user.id)
    else if (tab === 'sent') result = await mailService.getSent(teamId, user.id)
    else result = await mailService.getStarred(teamId, user.id)

    if (result.error) {
      setLoadError(result.error.message || 'خطأ في تحميل الرسائل')
    } else {
      setMessages(result.data)
      // Load reply stubs to show reply indicators on cards
      const ids = result.data.map((m: any) => m.id)
      const stubs = await mailService.getReplyStubs(ids)
      setReplyStubs(stubs)
    }
    setLoading(false)
  }

  async function expandMessage(msg: any) {
    const id = msg.id
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setReplyingTo(null); setReplyText('')

    // mark read if received & unread
    if (tab !== 'sent' && !msg.is_read && user && msg.receiver_id === user.id) {
      await mailService.markRead(id)
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
    }

    // load replies if not loaded
    if (!replies[id]) {
      setLoadingReplies(id)
      const { data } = await mailService.getReplies(id)
      setReplies(prev => ({ ...prev, [id]: data }))
      setLoadingReplies(null)
    }
  }

  async function sendReply(parentMsg: any) {
    if (!replyText.trim() || !user || !teamId) return
    setSendingReply(true)
    const otherId = parentMsg.sender_id === user.id ? parentMsg.receiver_id : parentMsg.sender_id
    const { data, error } = await mailService.reply(parentMsg.id, {
      team_id: teamId,
      sender_id: user.id,
      receiver_id: otherId,
      title: `رد: ${parentMsg.title}`,
      content: replyText,
    })
    if (error) {
      console.error('reply error:', error.message)
    } else if (data) {
      // Add full reply to the expanded thread
      setReplies(prev => ({ ...prev, [parentMsg.id]: [...(prev[parentMsg.id] || []), data] }))
      // Update reply stubs so badge increments immediately
      setReplyStubs(prev => [...prev, { id: data.id, parent_id: parentMsg.id, sender_id: user.id, created_at: data.created_at }])
      notificationService.create({
        user_id: otherId,
        team_id: teamId,
        title: '↩ رد جديد على رسالتك',
        body: `رد على: ${parentMsg.title}`,
        type: 'mail',
        is_read: false,
      })
    }
    setReplyText(''); setSendingReply(false); setReplyingTo(null)
  }

  async function toggleStar(msg: any) {
    setTogglingStarId(msg.id)
    const next = !msg.is_starred
    await mailService.toggleStar(msg.id, next)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_starred: next } : m))
    setTogglingStarId(null)
  }

  async function sendCompose() {
    if (!composeForm.receiver_id || !composeForm.title.trim() || !composeForm.content.trim()) {
      setComposeError('يرجى اختيار المستلم وملء العنوان والمحتوى')
      return
    }
    if (!user || !teamId) return
    setSending(true); setComposeError('')
    const { data: sent, error } = await mailService.send({
      team_id: teamId,
      sender_id: user.id,
      receiver_id: composeForm.receiver_id,
      title: composeForm.title,
      content: composeForm.content,
      attachment_url: composeForm.attachment_url || null,
    })
    if (error) {
      setComposeError(`فشل الإرسال: ${error.message}`)
      setSending(false); return
    }
    notificationService.create({
      user_id: composeForm.receiver_id,
      team_id: teamId,
      title: '📬 رسالة جديدة',
      body: composeForm.title,
      type: 'mail',
      is_read: false,
    })
    // Optimistically add to sent list if on sent tab, otherwise reload inbox
    if (tab === 'sent' && sent) {
      setMessages(prev => [sent, ...prev])
    }
    setSending(false)
    setCompose(false)
    setComposeForm({ receiver_id: '', title: '', content: '', attachment_url: '' })
    if (tab === 'sent') loadMessages()
  }

  // Filter recipients based on role
  const isPlayer = myRole === 'player'
  const recipientOptions = members.filter(m => {
    if (m.user_id === user?.id) return false // no self
    if (isPlayer) return STAFF_ROLES.includes(m.role) // players → staff only
    return true // others → everyone
  })

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'inbox',   label: 'الوارد',  icon: <Inbox size={15}/> },
    { key: 'sent',    label: 'المرسل',  icon: <Send size={15}/> },
    { key: 'starred', label: 'المهم',   icon: <Star size={15}/> },
  ]

  return (
    <div dir="rtl">
      <PageHeader
        title="البريد الداخلي"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setCompose(true)}>
            <Plus size={14}/> رسالة جديدة
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all
              ${tab === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Message list */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner/></div>
      ) : loadError ? (
        <div className="card p-5">
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-2xl">⚠️</div>
            <div>
              <p className="font-bold text-red-700 text-sm mb-1">لم يتم إعداد جدول البريد في قاعدة البيانات</p>
              <p className="text-xs text-slate-500">يجب تشغيل ملف <code className="bg-slate-100 px-1 rounded">supabase/internal_mail_setup.sql</code> في Supabase Dashboard</p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">{loadError}</p>
            </div>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="card py-10">
          <EmptyState title={tab === 'inbox' ? 'لا توجد رسائل واردة' : tab === 'sent' ? 'لا توجد رسائل مرسلة' : 'لا توجد رسائل مهمة'}/>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => {
            const isExpanded = expandedId === msg.id
            const isReceived = msg.receiver_id === user?.id
            const other = isReceived ? msg.sender : msg.receiver
            const unread = isReceived && !msg.is_read
            const msgReplies = replies[msg.id] || []

            // Reply stubs fetched separately after loading messages
            const msgReplyStubs = replyStubs.filter((r: any) => r.parent_id === msg.id)
            const replyCount = msgReplyStubs.length
            // Has a reply from the OTHER party (not me)
            const hasOtherReply = msgReplyStubs.some((r: any) => r.sender_id !== user?.id)

            return (
              <div key={msg.id} className={`rounded-2xl border transition-all ${isExpanded ? 'border-brand-200 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                {/* Message header row */}
                <button
                  onClick={() => expandMessage(msg)}
                  className="w-full flex items-center gap-3 p-3.5 text-right bg-transparent border-none cursor-pointer"
                >
                  {/* Unread dot or reply indicator */}
                  <div className="flex-shrink-0 w-2 flex justify-center">
                    {unread
                      ? <span className="w-2 h-2 rounded-full bg-brand-500 block"/>
                      : hasOtherReply && !isExpanded
                        ? <span className="w-2 h-2 rounded-full bg-emerald-400 block"/>
                        : null
                    }
                  </div>

                  <Avatar name={other?.full_name || '?'} src={other?.avatar_url} size="sm" className="flex-shrink-0"/>

                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm truncate ${unread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {msg.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400 truncate">
                        {isReceived ? `من: ${other?.full_name}` : `إلى: ${other?.full_name}`}
                      </span>
                      {replyCount > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-bold
                          ${hasOtherReply ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                          <CornerDownLeft size={9}/> {replyCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-slate-400">{relativeDate(msg.created_at)}</span>

                    {/* Star button (received only) */}
                    {tab !== 'sent' && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleStar(msg) }}
                        disabled={togglingStarId === msg.id}
                        className={`p-1 rounded-lg transition-colors border-none bg-transparent cursor-pointer ${msg.is_starred ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
                      >
                        <Star size={14} fill={msg.is_starred ? 'currentColor' : 'none'}/>
                      </button>
                    )}

                    {isExpanded ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-4">
                    {/* Content */}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mb-3">{msg.content}</p>

                    {/* Attachment */}
                    {msg.attachment_url && (
                      <a href={msg.attachment_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5 no-underline hover:bg-brand-100 transition-colors mb-3">
                        <Paperclip size={12}/> عرض المرفق
                      </a>
                    )}

                    {/* Replies thread */}
                    {loadingReplies === msg.id ? (
                      <div className="flex justify-center py-3"><Spinner/></div>
                    ) : msgReplies.length > 0 && (
                      <div className="space-y-2.5 mb-3 pr-2 border-r-2 border-slate-100">
                        {msgReplies.map((r: any) => {
                          const isMine = r.sender_id === user?.id
                          return (
                            <div key={r.id} className={`rounded-xl p-3 ${isMine ? 'bg-brand-50 ml-4' : 'bg-slate-50 mr-4'}`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-slate-700">{r.sender?.full_name}</span>
                                <span className="text-[10px] text-slate-400">{relativeDate(r.created_at)}</span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Reply box — only for received messages */}
                    {isReceived && (
                      replyingTo === msg.id ? (
                        <div className="mt-3">
                          <textarea
                            rows={3}
                            className="form-input w-full resize-none text-sm mb-2"
                            placeholder="اكتب ردك هنا..."
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                          />
                          <div className="flex gap-2 justify-end">
                            <button className="btn btn-ghost btn-sm" onClick={() => { setReplyingTo(null); setReplyText('') }}>إلغاء</button>
                            <button className="btn btn-primary btn-sm" onClick={() => sendReply(msg)} disabled={sendingReply || !replyText.trim()}>
                              {sendingReply ? <Spinner size="sm"/> : <><CornerDownLeft size={13}/> إرسال الرد</>}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setReplyingTo(msg.id)}
                          className="mt-1 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-bold border-none bg-transparent cursor-pointer">
                          <CornerDownLeft size={13}/> رد
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Compose Modal ── */}
      {compose && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-800">رسالة جديدة</h3>
              <button onClick={() => { setCompose(false); setComposeError(''); setComposeForm({ receiver_id: '', title: '', content: '', attachment_url: '' }) }}
                className="p-2 rounded-xl hover:bg-slate-100 border-none bg-transparent cursor-pointer">
                <X size={16}/>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isPlayer && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700">
                  ⚠️ يمكنك إرسال رسائل للمدربين والإداريين والكادر الطبي فقط.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">إلى</label>
                <select className="form-input"
                  value={composeForm.receiver_id}
                  onChange={e => setComposeForm(p => ({ ...p, receiver_id: e.target.value }))}>
                  <option value="">اختر المستلم...</option>
                  {recipientOptions.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">العنوان</label>
                <input className="form-input" value={composeForm.title}
                  onChange={e => setComposeForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="موضوع الرسالة..."/>
              </div>

              <div className="form-group">
                <label className="form-label">المحتوى</label>
                <textarea className="form-input" rows={5} value={composeForm.content}
                  onChange={e => setComposeForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="اكتب رسالتك هنا..."/>
              </div>

              <div className="form-group">
                <label className="form-label">رابط المرفق (اختياري)</label>
                <input className="form-input" value={composeForm.attachment_url}
                  onChange={e => setComposeForm(p => ({ ...p, attachment_url: e.target.value }))}
                  placeholder="https://..."/>
              </div>

              {composeError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                  {composeError}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => { setCompose(false); setComposeError(''); setComposeForm({ receiver_id: '', title: '', content: '', attachment_url: '' }) }}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={sendCompose} disabled={sending}>
                {sending ? <Spinner size="sm"/> : <><Send size={14}/> إرسال</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
