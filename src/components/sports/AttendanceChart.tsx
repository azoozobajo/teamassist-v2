import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import DashboardCard from './DashboardCard'

const pieColors = ['#10b981', '#ef4444', '#f97316']

export function AttendanceLineChart({ data }: { data: any[] }) {
  return (
    <DashboardCard title="الحضور آخر 4 أسابيع">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="نسبة" stroke="#0f766e" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export function AttendanceBarChart({ data }: { data: any[] }) {
  return (
    <DashboardCard title="الحضور والغياب">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="حضور" fill="#10b981" radius={[8, 8, 0, 0]} />
            <Bar dataKey="غياب" fill="#ef4444" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export function AttendancePieChart({ data }: { data: any[] }) {
  return (
    <DashboardCard title="ردود اللاعبين">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={4}>
              {data.map((_, index) => <Cell key={index} fill={pieColors[index % pieColors.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[14px] font-bold">
        {data.map((item, index) => (
          <div key={item.name} className="rounded-2xl bg-slate-50 p-2">
            <span className="mx-auto mb-1 block h-2 w-8 rounded-full" style={{ background: pieColors[index] }} />
            {item.name}: {item.value}
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}

export function ProgressRing({ value }: { value: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="flex items-center gap-4">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="#10b981"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="62" textAnchor="middle" className="fill-slate-900 text-2xl font-extrabold">{value}%</text>
      </svg>
      <div>
        <p className="text-lg font-extrabold text-slate-950">نسبة الالتزام</p>
        <p className="text-[16px] leading-7 text-slate-500">واضحة وسهلة: كلما زاد اللون الأخضر كان الالتزام أفضل.</p>
      </div>
    </div>
  )
}
