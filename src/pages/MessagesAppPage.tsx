import { Send } from 'lucide-react'
import DashboardCard from '../components/sports/DashboardCard'
import { messages } from '../data/sportsAppData'

export default function MessagesAppPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-950">الرسائل</h1>
        <p className="text-[16px] font-bold text-slate-500">رسائل المدرب والتنبيهات المهمة</p>
      </div>
      <DashboardCard title="رسالة جماعية جديدة" icon={<Send size={21} />} tone="blue">
        <textarea className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[16px] outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100" placeholder="اكتب رسالتك..." />
        <button className="mt-3 min-h-12 rounded-2xl bg-blue-600 px-5 text-[16px] font-extrabold text-white">إرسال</button>
      </DashboardCard>
      <div className="space-y-3">
        {messages.map((message, index) => (
          <DashboardCard key={index}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-extrabold text-slate-950">{message.from}</p>
                <p className="text-[15px] font-bold text-slate-400">{message.time}</p>
              </div>
              {index === 0 && <span className="rounded-full bg-orange-100 px-3 py-1 text-[14px] font-extrabold text-orange-700">جديد</span>}
            </div>
            <p className="mt-3 text-[16px] leading-8 text-slate-600">{message.body}</p>
          </DashboardCard>
        ))}
      </div>
    </div>
  )
}
