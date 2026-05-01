import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Upload, Download, Edit2, Trash2, Calendar, MapPin, Trophy, Filter } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { matchService, teamService, tournamentService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, Tabs, EmptyState, ConfirmDialog } from '../../components/ui'
import { canManageEvents, formatDate } from '../../utils/helpers'

const MATCH_TYPES: Record<string,string> = { league:'دوري', cup:'كأس', friendly:'ودية', playoff:'إقصائي', other:'أخرى' }
const HOME_AWAY: Record<string,string> = { home:'ملعبنا', away:'ملعب الخصم', neutral:'ملعب محايد' }
const STATUS_STYLE: Record<string,string> = { upcoming:'bg-blue-100 text-blue-700', live:'bg-red-100 text-red-700', finished:'bg-slate-100 text-slate-600', cancelled:'bg-slate-50 text-slate-400' }
const STATUS_LABEL: Record<string,string> = { upcoming:'قادمة', live:'🔴 مباشرة', finished:'منتهية', cancelled:'ملغاة' }
const emptyForm = { opponent:'', match_date:'', map_url:'', match_type:'league', home_away:'home', status:'upcoming', tournament_id:'', goals_for:'', goals_against:'', notes:'' }

export default function MatchesPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const [matches, setMatches] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [mainTab, setMainTab] = useState('matches')
  const [matchTab, setMatchTab] = useState('upcoming')
  const [filterTourn, setFilterTourn] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showTournAdd, setShowTournAdd] = useState(false)
  const [editMatch, setEditMatch] = useState<any>(null)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [form, setForm] = useState<any>(emptyForm)
  const [scorers, setScorers]   = useState<{uid:string;goals:number}[]>([])
  const [assisters, setAssisters] = useState<{uid:string;count:number}[]>([])
  const [yellows, setYellows]   = useState<{uid:string;count:number}[]>([])
  const [reds, setReds]         = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [tournForm, setTournForm] = useState({name:'',season:'',description:''})
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k:string,v:any) => setForm((p:any)=>({...p,[k]:v}))

  useEffect(()=>{
    if(!teamId||!user) return
    teamService.getMyRole(teamId,user.id).then(r=>setMyRole(r||''))
    teamService.getMembers(teamId).then(m=>setMembers(m.filter((x:any)=>x.role!=='parent')))
    load()
  },[teamId,user])

  async function load(){
    if(!teamId) return
    setLoading(true)
    const [m,t]=await Promise.all([matchService.getAll(teamId),tournamentService.getAll(teamId)])
    setMatches(m); setTournaments(t); setLoading(false)
  }

  const getName=(uid:string)=>members.find(m=>m.user_id===uid)?.profile?.full_name||uid

  function buildPayload(){
    return {
      team_id:teamId, created_by:user!.id,
      opponent:form.opponent, match_date:form.match_date,
      map_url:form.map_url||'', location:'',
      match_type:form.match_type, home_away:form.home_away, status:form.status,
      tournament_id:form.tournament_id||null,
      goals_for: form.goals_for!==''?parseInt(form.goals_for):null,
      goals_against: form.goals_against!==''?parseInt(form.goals_against):null,
      scorers:   scorers.flatMap(s=>Array(s.goals).fill(getName(s.uid))),
      assisters: assisters.flatMap(a=>Array(a.count).fill(getName(a.uid))),
      yellow_cards:yellows.flatMap(y=>Array(y.count).fill(getName(y.uid))),
      red_cards: reds.map(uid=>getName(uid)),
      notes:form.notes
    }
  }

  async function saveMatch(){
    if(!form.opponent.trim()||!form.match_date||!teamId||!user) return
    setSaving(true)
    const payload=buildPayload()
    if(editMatch) await matchService.update(editMatch.id,payload)
    else await matchService.create(payload)
    await load(); setShowAdd(false); setEditMatch(null); setForm(emptyForm)
    setScorers([]); setAssisters([]); setYellows([]); setReds([])
    setSaving(false)
  }

  function openEdit(m:any){
    setEditMatch(m)
    setForm({opponent:m.opponent||'',match_date:m.match_date?.slice(0,16)||'',map_url:m.map_url||'',match_type:m.match_type||'league',home_away:m.home_away||'home',status:m.status||'upcoming',tournament_id:m.tournament_id||'',goals_for:m.goals_for??'',goals_against:m.goals_against??'',notes:m.notes||''})
    setScorers([]); setAssisters([]); setYellows([]); setReds([])
    setShowAdd(true)
  }

  async function saveTournament(){
    if(!tournForm.name.trim()||!teamId||!user) return
    setSaving(true)
    await tournamentService.create({...tournForm,team_id:teamId,created_by:user.id})
    await load(); setShowTournAdd(false); setTournForm({name:'',season:'',description:''}); setSaving(false)
  }

  async function downloadTemplate(){
    try{
      const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs' as any)
      const data=[
        {'اسم الخصم':'نادي الهلال','التاريخ (YYYY-MM-DDTHH:MM)':'2025-09-15T16:30','رابط Google Maps':'https://maps.google.com/?q=24.68,46.72','نوع المباراة':'دوري','الأرض':'ملعبنا','الحالة':'قادمة'},
        {'اسم الخصم':'نادي النصر','التاريخ (YYYY-MM-DDTHH:MM)':'2025-09-22T18:00','رابط Google Maps':'https://maps.google.com/?q=24.70,46.74','نوع المباراة':'كأس','الأرض':'ملعب الخصم','الحالة':'قادمة'},
      ]
      const ws=XLSX.utils.json_to_sheet(data)
      ws['!cols']=[{wch:20},{wch:25},{wch:40},{wch:14},{wch:16},{wch:12}]
      // Data validation dropdowns
      if(!ws['!dataValidations']) ws['!dataValidations']=[]
      ws['!dataValidations'].push(
        {sqref:'D2:D100',type:'list',formula1:'"دوري,كأس,ودية,إقصائي,أخرى"'},
        {sqref:'E2:E100',type:'list',formula1:'"ملعبنا,ملعب الخصم,ملعب محايد"'},
        {sqref:'F2:F100',type:'list',formula1:'"قادمة,منتهية,ملغاة"'},
      )
      const wb=XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb,ws,'المباريات')
      XLSX.writeFile(wb,'قالب_المباريات.xlsx')
    }catch{alert('خطأ في التحميل')}
  }

  async function handleImport(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file||!teamId||!user) return
    try{
      const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs' as any)
      const ab=await file.arrayBuffer()
      const wb=XLSX.read(ab)
      const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      const typeMap:Record<string,string>={'دوري':'league','كأس':'cup','ودية':'friendly','إقصائي':'playoff'}
      const homeMap:Record<string,string>={'ملعبنا':'home','ملعب الخصم':'away','ملعب محايد':'neutral'}
      let cnt=0
      for(const row of rows){
        const opponent=row['اسم الخصم']||row['opponent']; if(!opponent) continue
        await matchService.create({team_id:teamId,created_by:user.id,opponent,
          match_date:row['التاريخ (YYYY-MM-DDTHH:MM)']||row['التاريخ']||new Date().toISOString(),
          map_url:row['رابط Google Maps']||'',location:'',
          match_type:typeMap[row['نوع المباراة']]||'league',
          home_away:homeMap[row['الأرض']]||'home',
          status:row['الحالة']==='منتهية'?'finished':'upcoming',
          tournament_id:filterTourn||null
        }); cnt++
      }
      await load(); alert(`تم استيراد ${cnt} مباريات ✅`)
    }catch{alert('خطأ في قراءة الملف')}
    if(fileRef.current) fileRef.current.value=''
  }

  const canManage=canManageEvents(myRole)
  const filt=matches.filter(m=>!filterTourn||m.tournament_id===filterTourn)
  const upcoming=filt.filter(m=>m.status==='upcoming'||m.status==='live')
  const finished=filt.filter(m=>m.status==='finished'||m.status==='cancelled')
  const list=matchTab==='upcoming'?upcoming:finished
  const played=matches.filter(m=>m.status==='finished'&&m.goals_for!==null)
  const wins=played.filter(m=>m.goals_for>m.goals_against).length
  const draws=played.filter(m=>m.goals_for===m.goals_against).length
  const losses=played.filter(m=>m.goals_for<m.goals_against).length
  const pts=wins*3+draws
  const gf=played.reduce((s,m)=>s+(m.goals_for||0),0)
  const ga=played.reduce((s,m)=>s+(m.goals_against||0),0)
  const getResult=(m:any)=>{
    if(m.goals_for===null||m.goals_against===null) return null
    if(m.goals_for>m.goals_against) return {label:'فوز',cls:'bg-emerald-100 text-emerald-700'}
    if(m.goals_for===m.goals_against) return {label:'تعادل',cls:'bg-amber-100 text-amber-700'}
    return {label:'خسارة',cls:'bg-red-100 text-red-700'}
  }

  const MemberSelect=({uid,onChange}:{uid:string;onChange:(v:string)=>void})=>(
    <select className="form-input text-xs py-1.5" value={uid} onChange={e=>onChange(e.target.value)} style={{minWidth:130}}>
      <option value="">اختر لاعباً...</option>
      {members.map(m=><option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
    </select>
  )
  const Counter=({val,min,max,onChange}:{val:number;min:number;max:number;onChange:(n:number)=>void})=>(
    <div className="flex items-center gap-1">
      <button onClick={()=>onChange(Math.max(min,val-1))} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-lg border-none cursor-pointer">−</button>
      <span className="w-7 text-center text-sm font-bold">{val}</span>
      <button onClick={()=>onChange(Math.min(max,val+1))} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-lg border-none cursor-pointer">+</button>
    </div>
  )

  return (
    <div>
      <PageHeader title="المباريات والبطولات"
        action={canManage&&(
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}><Download size={13}/>القالب</button>
            <label className="btn btn-ghost btn-sm cursor-pointer"><Upload size={13}/>استيراد
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport}/>
            </label>
            <button className="btn btn-primary btn-sm" onClick={()=>{setForm(emptyForm);setEditMatch(null);setScorers([]);setAssisters([]);setYellows([]);setReds([]);setShowAdd(true)}}>
              <Plus size={13}/>مباراة
            </button>
          </div>
        )}/>
      <Tabs tabs={[{key:'matches',label:'المباريات'},{key:'tournaments',label:`البطولات (${tournaments.length})`}]} active={mainTab} onChange={setMainTab}/>

      {mainTab==='matches'&&(<>
        {played.length>0&&(
          <div className="card mb-4 bg-gradient-to-l from-slate-700 to-slate-900 text-white">
            <div className="text-xs opacity-50 mb-2 text-center">إحصائيات الموسم · {played.length} مباراة · {tournaments.length} بطولة</div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {[['فوز',wins,'text-emerald-400'],['تعادل',draws,'text-amber-400'],['خسارة',losses,'text-red-400'],['نقاط',pts,'text-blue-300'],['أهداف',`${gf}-${ga}`,'']].map(([l,v,c])=>(
                <div key={String(l)}><div className={`text-xl font-bold ${c}`}>{v}</div><div className="text-xs opacity-50">{l}</div></div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} className="text-slate-400 flex-shrink-0"/>
          <select className="form-input text-xs" value={filterTourn} onChange={e=>setFilterTourn(e.target.value)}>
            <option value="">كل المباريات</option>
            {tournaments.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {filterTourn&&<button onClick={()=>setFilterTourn('')} className="text-xs text-red-500 hover:underline">مسح الفلتر</button>}
        </div>
        <Tabs tabs={[{key:'upcoming',label:`القادمة (${upcoming.length})`},{key:'finished',label:`المنتهية (${finished.length})`}]} active={matchTab} onChange={setMatchTab}/>
        {loading?<div className="flex justify-center py-10"><Spinner/></div>
          :list.length===0?<div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا توجد مباريات"
            action={canManage&&<button className="btn btn-primary btn-sm mt-2" onClick={()=>{setForm(emptyForm);setEditMatch(null);setShowAdd(true)}}><Plus size={13}/>إضافة مباراة</button>}/></div>
          :<div className="space-y-3">{list.map(m=>{
            const result=getResult(m)
            const tourney=tournaments.find(t=>t.id===m.tournament_id)
            return(
              <div key={m.id} className="card mb-0 cursor-pointer hover:shadow-md transition-all" onClick={()=>setShowDetail(m)}>
                <div className="flex items-center gap-3">
                  <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${result?.label==='فوز'?'bg-emerald-50':result?.label==='خسارة'?'bg-red-50':result?.label==='تعادل'?'bg-amber-50':'bg-slate-50'}`}>
                    {m.goals_for!==null&&m.goals_against!==null?<><span className="text-xl font-bold">{m.goals_for}-{m.goals_against}</span>{result&&<span className={`text-xs font-bold px-1.5 rounded-full ${result.cls}`}>{result.label}</span>}</>:<span className="text-3xl">⚽</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{m.home_away==='home'?`فريقنا ضد ${m.opponent}`:`${m.opponent} ضد فريقنا`}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Calendar size={11}/>{formatDate(m.match_date)} · {m.match_date?.slice(11,16)}</div>
                    {m.map_url&&<a href={m.map_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-xs text-blue-500 flex items-center gap-1 hover:underline"><MapPin size={11}/>الموقع</a>}
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <span className={`badge ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                      <span className="badge badge-gray">{MATCH_TYPES[m.match_type]}</span>
                      <span className="badge badge-gray">{HOME_AWAY[m.home_away]}</span>
                      {tourney&&<span className="badge badge-purple">{tourney.name}</span>}
                    </div>
                  </div>
                  {canManage&&<div className="flex gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>openEdit(m)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13}/></button>
                    <button onClick={()=>setConfirmDelete(m)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13}/></button>
                  </div>}
                </div>
              </div>
            )
          })}</div>}
      </>)}

      {mainTab==='tournaments'&&(<>
        {canManage&&<div className="flex justify-end mb-3"><button className="btn btn-primary btn-sm" onClick={()=>setShowTournAdd(true)}><Plus size={13}/>بطولة جديدة</button></div>}
        {tournaments.length===0?<div className="card"><EmptyState icon={<Trophy size={24}/>} title="لا توجد بطولات" description="أضف بطولة ثم خصص لها المباريات"/></div>
          :<div className="space-y-3">{tournaments.map(t=>{
            const tMatches=matches.filter(m=>m.tournament_id===t.id)
            const tPlayed=tMatches.filter(m=>m.status==='finished'&&m.goals_for!==null)
            const tWins=tPlayed.filter(m=>m.goals_for>m.goals_against).length
            return(
              <div key={t.id} className="card mb-0">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">🏆</span>
                  <div className="flex-1">
                    <div className="font-bold">{t.name}</div>
                    {t.season&&<div className="text-xs text-slate-400">الموسم: {t.season}</div>}
                    {t.description&&<div className="text-xs text-slate-500 mt-1">{t.description}</div>}
                    <div className="flex gap-2 mt-2">
                      <span className="badge badge-gray">{tMatches.length} مباراة</span>
                      <span className="badge badge-green">{tWins} فوز</span>
                      <span className={`badge ${t.status==='active'?'badge-blue':'badge-gray'}`}>{t.status==='active'?'جارية':'منتهية'}</span>
                    </div>
                  </div>
                  <button onClick={()=>{setFilterTourn(t.id);setMainTab('matches')}} className="btn btn-ghost btn-sm text-xs">عرض المباريات</button>
                </div>
              </div>
            )
          })}</div>}
      </>)}

      {/* Detail Modal */}
      <Modal open={!!showDetail} onClose={()=>setShowDetail(null)}
        title={showDetail?`${showDetail.home_away==='home'?'فريقنا':showDetail.opponent} ضد ${showDetail.home_away==='home'?showDetail.opponent:'فريقنا'}`:''}>
        {showDetail&&(<div>
          <div className="text-center py-4 mb-4">
            {showDetail.goals_for!==null?<div className="text-5xl font-bold mb-2">{showDetail.goals_for} - {showDetail.goals_against}</div>:<div className="text-2xl mb-2">⚽</div>}
            <div className="flex justify-center gap-2 flex-wrap">
              <span className={`badge ${STATUS_STYLE[showDetail.status]}`}>{STATUS_LABEL[showDetail.status]}</span>
              <span className="badge badge-gray">{MATCH_TYPES[showDetail.match_type]}</span>
              <span className="badge badge-gray">{HOME_AWAY[showDetail.home_away]}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-400 mb-0.5">التاريخ</div><div className="font-bold">{formatDate(showDetail.match_date)} · {showDetail.match_date?.slice(11,16)}</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-400 mb-0.5">الموقع</div>
              {showDetail.map_url?<a href={showDetail.map_url} target="_blank" rel="noreferrer" className="font-bold text-blue-500 underline flex items-center gap-1"><MapPin size={10}/>افتح الخريطة</a>:<span className="text-slate-400">—</span>}
            </div>
          </div>
          {[{label:'⚽ الهدافون',list:showDetail.scorers},{label:'🎯 الصناعات',list:showDetail.assisters},{label:'🟡 الصفراء',list:showDetail.yellow_cards},{label:'🔴 الحمراء',list:showDetail.red_cards}]
            .filter(s=>s.list?.length>0).map(s=>(
            <div key={s.label} className="mb-3">
              <div className="text-xs font-bold text-slate-500 mb-1.5">{s.label}</div>
              <div className="flex flex-wrap gap-1.5">{s.list.map((n:string,i:number)=><span key={i} className="badge badge-gray">{n}</span>)}</div>
            </div>
          ))}
          {showDetail.notes&&<div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600"><div className="font-bold mb-1">ملاحظات</div>{showDetail.notes}</div>}
          {canManage&&<button onClick={()=>{openEdit(showDetail);setShowDetail(null)}} className="btn btn-primary w-full justify-center mt-4"><Edit2 size={14}/>تعديل</button>}
        </div>)}
      </Modal>

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={()=>{setShowAdd(false);setEditMatch(null)}} title={editMatch?'تعديل المباراة':'إضافة مباراة'} width="max-w-lg">
        <FormField label="اسم الخصم" required><input className="form-input" value={form.opponent} onChange={e=>set('opponent',e.target.value)} placeholder="نادي الهلال"/></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="التاريخ والوقت" required><input className="form-input" type="datetime-local" value={form.match_date} onChange={e=>set('match_date',e.target.value)}/></FormField>
          <FormField label="رابط Google Maps"><input className="form-input" value={form.map_url} onChange={e=>set('map_url',e.target.value)} placeholder="https://maps.google.com/..."/></FormField>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FormField label="النوع"><select className="form-input text-xs" value={form.match_type} onChange={e=>set('match_type',e.target.value)}>{Object.entries(MATCH_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="الأرض"><select className="form-input text-xs" value={form.home_away} onChange={e=>set('home_away',e.target.value)}>{Object.entries(HOME_AWAY).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="الحالة"><select className="form-input text-xs" value={form.status} onChange={e=>set('status',e.target.value)}><option value="upcoming">قادمة</option><option value="live">مباشرة</option><option value="finished">منتهية</option><option value="cancelled">ملغاة</option></select></FormField>
        </div>
        <FormField label="البطولة">
          <select className="form-input" value={form.tournament_id} onChange={e=>set('tournament_id',e.target.value)}>
            <option value="">بدون بطولة</option>
            {tournaments.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </FormField>
        {(form.status==='finished'||form.status==='live')&&(
          <div className="grid grid-cols-2 gap-3">
            <FormField label="أهدافنا"><input className="form-input" type="number" min="0" value={form.goals_for} onChange={e=>set('goals_for',e.target.value)}/></FormField>
            <FormField label="أهداف الخصم"><input className="form-input" type="number" min="0" value={form.goals_against} onChange={e=>set('goals_against',e.target.value)}/></FormField>
          </div>
        )}
        {/* SCORERS */}
        <div className="form-group">
          <label className="form-label">⚽ الهدافون</label>
          {scorers.map((s,i)=>(
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <select className="form-input text-xs flex-1 py-1.5" value={s.uid} onChange={e=>{const a=[...scorers];a[i]={...a[i],uid:e.target.value};setScorers(a)}}>
                <option value="">اختر لاعباً...</option>
                {members.map(m=><option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <button onClick={()=>{const a=[...scorers];a[i]={...a[i],goals:Math.max(1,s.goals-1)};setScorers(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">−</button>
                <span className="w-7 text-center text-sm font-bold">{s.goals}</span>
                <button onClick={()=>{const a=[...scorers];a[i]={...a[i],goals:Math.min(10,s.goals+1)};setScorers(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">+</button>
              </div>
              <span className="text-xs text-slate-400">{s.goals===1?'هدف':'أهداف'}</span>
              <button onClick={()=>setScorers(scorers.filter((_,j)=>j!==i))} className="text-red-400 text-xl border-none cursor-pointer bg-transparent">×</button>
            </div>
          ))}
          <button onClick={()=>setScorers([...scorers,{uid:'',goals:1}])} className="btn btn-ghost btn-xs">+ هداف</button>
        </div>
        {/* ASSISTERS */}
        <div className="form-group">
          <label className="form-label">🎯 الصناعات</label>
          {assisters.map((s,i)=>(
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <select className="form-input text-xs flex-1 py-1.5" value={s.uid} onChange={e=>{const a=[...assisters];a[i]={...a[i],uid:e.target.value};setAssisters(a)}}>
                <option value="">اختر لاعباً...</option>
                {members.map(m=><option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <button onClick={()=>{const a=[...assisters];a[i]={...a[i],count:Math.max(1,s.count-1)};setAssisters(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">−</button>
                <span className="w-7 text-center text-sm font-bold">{s.count}</span>
                <button onClick={()=>{const a=[...assisters];a[i]={...a[i],count:Math.min(5,s.count+1)};setAssisters(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">+</button>
              </div>
              <button onClick={()=>setAssisters(assisters.filter((_,j)=>j!==i))} className="text-red-400 text-xl border-none cursor-pointer bg-transparent">×</button>
            </div>
          ))}
          <button onClick={()=>setAssisters([...assisters,{uid:'',count:1}])} className="btn btn-ghost btn-xs">+ صناعة</button>
        </div>
        {/* YELLOW */}
        <div className="form-group">
          <label className="form-label">🟡 البطاقات الصفراء</label>
          {yellows.map((s,i)=>(
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <select className="form-input text-xs flex-1 py-1.5" value={s.uid} onChange={e=>{const a=[...yellows];a[i]={...a[i],uid:e.target.value};setYellows(a)}}>
                <option value="">اختر لاعباً...</option>
                {members.map(m=><option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <button onClick={()=>{const a=[...yellows];a[i]={...a[i],count:Math.max(1,s.count-1)};setYellows(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">−</button>
                <span className="w-7 text-center text-sm font-bold">{s.count}</span>
                <button onClick={()=>{const a=[...yellows];a[i]={...a[i],count:Math.min(2,s.count+1)};setYellows(a)}} className="w-7 h-7 rounded-lg bg-slate-100 font-bold border-none cursor-pointer text-slate-700">+</button>
              </div>
              <span className="text-xs text-slate-400">صفراء</span>
              <button onClick={()=>setYellows(yellows.filter((_,j)=>j!==i))} className="text-red-400 text-xl border-none cursor-pointer bg-transparent">×</button>
            </div>
          ))}
          <button onClick={()=>setYellows([...yellows,{uid:'',count:1}])} className="btn btn-ghost btn-xs">+ صفراء</button>
        </div>
        {/* RED */}
        <div className="form-group">
          <label className="form-label">🔴 البطاقات الحمراء <span className="text-slate-400 font-normal">(واحدة لكل لاعب دائماً)</span></label>
          {reds.map((uid,i)=>(
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <select className="form-input text-xs flex-1 py-1.5" value={uid} onChange={e=>{const a=[...reds];a[i]=e.target.value;setReds(a)}}>
                <option value="">اختر لاعباً...</option>
                {members.map(m=><option key={m.id} value={m.user_id}>{m.profile?.full_name}</option>)}
              </select>
              <span className="badge badge-red text-xs">حمراء ×1</span>
              <button onClick={()=>setReds(reds.filter((_,j)=>j!==i))} className="text-red-400 text-xl border-none cursor-pointer bg-transparent">×</button>
            </div>
          ))}
          <button onClick={()=>setReds([...reds,''])} className="btn btn-ghost btn-xs">+ حمراء</button>
        </div>
        <FormField label="ملاحظات"><textarea className="form-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={()=>{setShowAdd(false);setEditMatch(null)}}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveMatch} disabled={saving}>{saving?<Spinner size="sm"/>:editMatch?'حفظ':'إضافة'}</button>
        </div>
      </Modal>

      {/* Tournament Modal */}
      <Modal open={showTournAdd} onClose={()=>setShowTournAdd(false)} title="إضافة بطولة جديدة">
        <FormField label="اسم البطولة" required><input className="form-input" value={tournForm.name} onChange={e=>setTournForm(p=>({...p,name:e.target.value}))} placeholder="دوري الشباب 2025"/></FormField>
        <FormField label="الموسم"><input className="form-input" value={tournForm.season} onChange={e=>setTournForm(p=>({...p,season:e.target.value}))} placeholder="2024/2025"/></FormField>
        <FormField label="وصف اختياري"><textarea className="form-input" rows={2} value={tournForm.description} onChange={e=>setTournForm(p=>({...p,description:e.target.value}))}/></FormField>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn btn-ghost" onClick={()=>setShowTournAdd(false)}>إلغاء</button>
          <button className="btn btn-primary" onClick={saveTournament} disabled={saving}>{saving?<Spinner size="sm"/>:'إنشاء البطولة'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="حذف المباراة" danger
        message={`هل تريد حذف مباراة "${confirmDelete?.opponent}"؟`}
        onConfirm={async()=>{await matchService.delete(confirmDelete.id);await load();setConfirmDelete(null)}}
        onCancel={()=>setConfirmDelete(null)}/>
    </div>
  )
}
