import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function readEnv(path) {
  if (!fs.existsSync(path)) return {}
  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index)
        const value = line.slice(index + 1).replace(/^"|"$/g, '')
        return [key, value]
      })
  )
}

const env = { ...readEnv('.env'), ...readEnv('.env.local'), ...process.env }
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const baseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const accounts = [
  { name: 'سعود العتيبي', email: 'bajo.player01@test.teamassist.local', password: 'Bajo1234!01', role: 'player', position: 'حارس مرمى', jersey: 1 },
  { name: 'فهد القحطاني', email: 'bajo.player02@test.teamassist.local', password: 'Bajo1234!02', role: 'player', position: 'قلب دفاع', jersey: 2 },
  { name: 'ماجد الدوسري', email: 'bajo.player03@test.teamassist.local', password: 'Bajo1234!03', role: 'player', position: 'ظهير أيمن', jersey: 3 },
  { name: 'ناصر الشهري', email: 'bajo.player04@test.teamassist.local', password: 'Bajo1234!04', role: 'player', position: 'ظهير أيسر', jersey: 4 },
  { name: 'عبدالعزيز الحربي', email: 'bajo.player05@test.teamassist.local', password: 'Bajo1234!05', role: 'player', position: 'قلب دفاع', jersey: 5 },
  { name: 'تركي المطيري', email: 'bajo.player06@test.teamassist.local', password: 'Bajo1234!06', role: 'player', position: 'محور', jersey: 6 },
  { name: 'خالد الغامدي', email: 'bajo.player07@test.teamassist.local', password: 'Bajo1234!07', role: 'player', position: 'جناح أيمن', jersey: 7 },
  { name: 'عبدالله الزهراني', email: 'bajo.player08@test.teamassist.local', password: 'Bajo1234!08', role: 'player', position: 'وسط هجومي', jersey: 8 },
  { name: 'محمد السبيعي', email: 'bajo.player09@test.teamassist.local', password: 'Bajo1234!09', role: 'player', position: 'مهاجم', jersey: 9 },
  { name: 'راكان اليامي', email: 'bajo.player10@test.teamassist.local', password: 'Bajo1234!10', role: 'player', position: 'صانع لعب', jersey: 10 },
  { name: 'سلطان العنزي', email: 'bajo.player11@test.teamassist.local', password: 'Bajo1234!11', role: 'player', position: 'جناح أيسر', jersey: 11 },
  { name: 'يزيد المالكي', email: 'bajo.player12@test.teamassist.local', password: 'Bajo1234!12', role: 'player', position: 'حارس مرمى', jersey: 12 },
  { name: 'ريان الحارثي', email: 'bajo.player13@test.teamassist.local', password: 'Bajo1234!13', role: 'player', position: 'مدافع', jersey: 13 },
  { name: 'بندر الشمري', email: 'bajo.player14@test.teamassist.local', password: 'Bajo1234!14', role: 'player', position: 'وسط', jersey: 14 },
  { name: 'فيصل الشهراني', email: 'bajo.player15@test.teamassist.local', password: 'Bajo1234!15', role: 'player', position: 'محور دفاعي', jersey: 15 },
  { name: 'مهند القرني', email: 'bajo.player16@test.teamassist.local', password: 'Bajo1234!16', role: 'player', position: 'وسط أيمن', jersey: 16 },
  { name: 'حسن العمري', email: 'bajo.player17@test.teamassist.local', password: 'Bajo1234!17', role: 'player', position: 'وسط أيسر', jersey: 17 },
  { name: 'وليد البيشي', email: 'bajo.player18@test.teamassist.local', password: 'Bajo1234!18', role: 'player', position: 'مهاجم ثاني', jersey: 18 },
  { name: 'صالح الرشيدي', email: 'bajo.player19@test.teamassist.local', password: 'Bajo1234!19', role: 'player', position: 'جناح', jersey: 19 },
  { name: 'مشاري البقمي', email: 'bajo.player20@test.teamassist.local', password: 'Bajo1234!20', role: 'player', position: 'مهاجم', jersey: 20 },
  { name: 'يوسف السالم', email: 'bajo.coach@test.teamassist.local', password: 'Bajo1234!21', role: 'head_coach', position: 'مدرب رئيسي' },
  { name: 'أحمد الفراج', email: 'bajo.assistant@test.teamassist.local', password: 'Bajo1234!22', role: 'assistant_coach', position: 'مساعد مدرب' },
  { name: 'نايف الجهني', email: 'bajo.fitness@test.teamassist.local', password: 'Bajo1234!23', role: 'assistant_coach', position: 'مدرب لياقة' },
  { name: 'عمر المولد', email: 'bajo.gkcoach@test.teamassist.local', password: 'Bajo1234!24', role: 'assistant_coach', position: 'مدرب حراس' },
  { name: 'د. سامي الأنصاري', email: 'bajo.doctor@test.teamassist.local', password: 'Bajo1234!25', role: 'medical', position: 'طبيب الفريق' },
  { name: 'إبراهيم المطرفي', email: 'bajo.admin@test.teamassist.local', password: 'Bajo1234!26', role: 'administrator', position: 'إداري الفريق' },
  { name: 'زياد الحربي', email: 'bajo.media@test.teamassist.local', password: 'Bajo1234!27', role: 'media', position: 'مسؤول إعلامي' },
  { name: 'عبدالرحمن والد سعود', email: 'bajo.parent@test.teamassist.local', password: 'Bajo1234!28', role: 'parent', position: 'ولي أمر', linkedTo: 'bajo.player01@test.teamassist.local' },
  { name: 'ضيف تجربة باجو', email: 'bajo.guest@test.teamassist.local', password: 'Bajo1234!29', role: 'guest', position: 'ضيف' },
]

async function getBajoTeam() {
  const { data, error } = await baseClient
    .from('teams')
    .select('id,name,city,sport_type')
    .or('name.ilike.%باجو%,name.ilike.%bajo%')
    .limit(10)

  if (error) throw error
  if (!data?.length) throw new Error('No team matching "باجو" or "bajo" was found.')
  return data.find((team) => team.name === 'باجو') ?? data[0]
}

async function createOrSignIn(account) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const signedUp = await client.auth.signUp({
    email: account.email,
    password: account.password,
    options: { data: { full_name: account.name } },
  })

  if (signedUp.error && !/already|registered|exists/i.test(signedUp.error.message)) {
    throw signedUp.error
  }

  const signedIn = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })

  if (signedIn.error) {
    throw new Error(`${account.email}: ${signedIn.error.message}`)
  }

  return { client, userId: signedIn.data.user.id }
}

async function ensureProfile(client, userId, account) {
  const { error } = await client
    .from('profiles')
    .update({
      full_name: account.name,
      first_name: account.name.split(' ')[0] ?? account.name,
      email: account.email,
      profile_complete: true,
    })
    .eq('id', userId)

  if (error) throw error
}

async function ensureMembership(client, teamId, userId, account, linkedPlayerId) {
  const payload = {
    team_id: teamId,
    user_id: userId,
    role: account.role,
    status: 'active',
    is_visible: true,
    position_label: account.position ?? null,
    jersey_number: account.jersey ?? null,
    linked_player_id: linkedPlayerId ?? null,
  }

  const { error } = await client.from('team_members').insert(payload)
  if (error && !/duplicate key|team_members_team_id_user_id_key/i.test(error.message)) {
    throw error
  }
}

const team = await getBajoTeam()
console.log(`Team: ${team.name} (${team.id})`)

const usersByEmail = new Map()
const results = []

for (const account of accounts) {
  const { client, userId } = await createOrSignIn(account)
  usersByEmail.set(account.email, { userId, client })
  await ensureProfile(client, userId, account)
  results.push({ ...account, userId })
  console.log(`Auth ready: ${account.email}`)
}

for (const account of accounts) {
  const current = usersByEmail.get(account.email)
  const linkedPlayerId = account.linkedTo ? usersByEmail.get(account.linkedTo)?.userId : null
  await ensureMembership(current.client, team.id, current.userId, account, linkedPlayerId)
  console.log(`Member ready: ${account.name} - ${account.role}`)
}

console.log('\nLOGIN ACCOUNTS')
console.table(results.map(({ name, email, password, role, position }) => ({
  name,
  email,
  password,
  role,
  position,
})))
