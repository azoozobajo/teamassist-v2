import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { teamService, regulationsService, regulationAgreementsService } from '../services'
import { Alert, Spinner, PageHeader } from '../components/ui'
import { Search, Shield, CheckCircle, FileText, ChevronRight, ChevronLeft } from 'lucide-react'

export default function JoinTeamPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') || '')
  const [team, setTeam] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // Required docs state
  const [requiredDocs, setRequiredDocs] = useState<any[]>([])
  const [readingDoc, setReadingDoc] = useState<any>(null)
  const [agreedIds, setAgreedIds] = useState<Set<string>>(new Set())

  const allAgreed = requiredDocs.every(d => agreedIds.has(d.id))

  async function search() {
    if (!code.trim()) return
    setLoading(true); setError(''); setTeam(null); setRequiredDocs([]); setAgreedIds(new Set())
    const t = await teamService.getByInviteCode(code)
    if (!t) { setError('لم يتم العثور على فريق بهذا الكود، أو الكود غير مفعّل'); setLoading(false); return }
    const docs = await regulationsService.getRequired(t.id)
    setTeam(t); setRequiredDocs(docs)
    setLoading(false)
  }

  async function join() {
    if (!team || !user) return
    if (!allAgreed) return
    setJoining(true)
    const role = await teamService.getMyRole(team.id, user.id)
    if (role) { setError('أنت عضو في هذا الفريق بالفعل'); setJoining(false); return }
    await teamService.joinTeamByCode(team.id, user.id, team.require_approval)
    // Save agreements
    for (const docId of Array.from(agreedIds)) {
      await regulationAgreementsService.agree(team.id, docId, user.id)
    }
    setDone(true); setJoining(false)
  }

  // ── Doc reader view ──
  if (readingDoc) return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setReadingDoc(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 font-bold transition-colors">
          <ChevronRight size={16}/> العودة
        </button>
        <span className="text-xs text-slate-400 font-bold">
          {agreedIds.has(readingDoc.id) ? '✅ تمت الموافقة' : 'اقرأ ووافق للمتابعة'}
        </span>
      </div>

      <div className="card px-6 py-6 mb-4" style={{ minHeight: '60vh' }}>
        <div className="pb-5 mb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0f766e,#1D9E75)' }}>
              {team?.name?.[0] || 'T'}
            </div>
            <div>
              <div className="font-extrabold text-slate-700">{team?.name}</div>
              <div className="text-xs text-slate-400">وثيقة رسمية إلزامية</div>
            </div>
          </div>
          <h1 className="text-xl font-black text-slate-800 text-center mb-3">{readingDoc.title}</h1>
          <div className="text-right text-xs text-slate-400 font-bold">📅 {readingDoc.published_at}</div>
        </div>
        <div dir="rtl" className="text-slate-700 leading-8 text-sm regulations-body"
          dangerouslySetInnerHTML={{ __html: readingDoc.content || '<p class="text-slate-400 text-center">لا يوجد محتوى</p>' }}/>
      </div>

      {!agreedIds.has(readingDoc.id) ? (
        <button onClick={() => {
          setAgreedIds(prev => new Set([...prev, readingDoc.id]))
          setReadingDoc(null)
        }} className="btn btn-primary w-full justify-center py-3 text-base font-extrabold">
          <CheckCircle size={18}/> قرأت ما جاء فيه وأوافق عليه
        </button>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 font-bold text-sm">
          <CheckCircle size={16}/> تمت الموافقة على هذا المستند
        </div>
      )}
    </div>
  )

  // ── Done view ──
  if (done) return (
    <div className="max-w-sm mx-auto text-center py-16">
      <CheckCircle size={56} className="text-brand-500 mx-auto mb-4"/>
      <h2 className="text-xl font-bold mb-2">
        {team.require_approval ? 'تم إرسال طلب الانضمام' : 'تم الانضمام بنجاح!'}
      </h2>
      <p className="text-slate-400 text-sm mb-6">
        {team.require_approval ? 'سيتم إشعارك عند قبول طلبك من مسؤول الفريق' : `مرحباً بك في ${team.name}`}
      </p>
      <button onClick={() => navigate(team.require_approval ? '/' : `/team/${team.id}`)} className="btn btn-primary">
        {team.require_approval ? 'العودة للرئيسية' : 'الذهاب للفريق'}
      </button>
    </div>
  )

  // ── Main search view ──
  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="الانضمام لفريق" subtitle="أدخل كود الدعوة للانضمام" back={() => navigate('/')}/>
      <div className="card">
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')}/></div>}
        <div className="flex gap-2 mb-5">
          <input className="form-input flex-1" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="أدخل كود الدعوة" onKeyDown={e => e.key === 'Enter' && search()}/>
          <button onClick={search} disabled={loading} className="btn btn-primary px-4">
            {loading ? <Spinner size="sm"/> : <Search size={16}/>}
          </button>
        </div>

        {team && (
          <div className="space-y-3">
            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600 overflow-hidden">
                  {team.logo_url ? <img src={team.logo_url} className="w-full h-full object-cover"/> : team.name[0]}
                </div>
                <div>
                  <div className="font-bold text-base">{team.name}</div>
                  <div className="text-sm text-slate-500">{team.sport_type} · {team.city}</div>
                  {team.require_approval && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <Shield size={11}/> يتطلب موافقة المسؤول
                    </div>
                  )}
                </div>
              </div>

              {/* Required docs section */}
              {requiredDocs.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-extrabold text-slate-600 mb-2 flex items-center gap-1.5">
                    <FileText size={13} className="text-brand-600"/>
                    يجب الموافقة على اللوائح قبل الانضمام ({agreedIds.size}/{requiredDocs.length})
                  </p>
                  <div className="space-y-2">
                    {requiredDocs.map(doc => {
                      const agreed = agreedIds.has(doc.id)
                      return (
                        <div key={doc.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${agreed ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-brand-300'}`}
                          onClick={() => setReadingDoc(doc)}>
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${agreed ? 'bg-emerald-500' : 'bg-slate-100'}`}>
                            {agreed
                              ? <CheckCircle size={14} className="text-white"/>
                              : <FileText size={13} className="text-slate-500"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold truncate ${agreed ? 'text-emerald-700' : 'text-slate-700'}`}>{doc.title}</div>
                            <div className="text-xs text-slate-400">{agreed ? '✅ تمت الموافقة' : 'اضغط للقراءة والموافقة'}</div>
                          </div>
                          {!agreed && <ChevronLeft size={14} className="text-slate-400 flex-shrink-0"/>}
                        </div>
                      )
                    })}
                  </div>
                  {!allAgreed && (
                    <p className="text-xs text-amber-600 mt-2 text-center font-bold">
                      ⚠️ يجب الموافقة على جميع المستندات أعلاه للمتابعة
                    </p>
                  )}
                </div>
              )}

              <button onClick={join} disabled={joining || !allAgreed} className="btn btn-primary w-full justify-center">
                {joining ? <Spinner size="sm"/> : team.require_approval ? 'إرسال طلب انضمام' : 'انضمام للفريق'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
