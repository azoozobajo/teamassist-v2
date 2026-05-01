export type UserRole = 'player' | 'coach' | 'admin'
export type AttendanceStatus = 'present' | 'absent' | 'pending'

export const currentUser = {
  playerName: 'عمر فهد',
  coachName: 'الكابتن سامي',
  teamName: 'أكاديمية النخبة U13',
  avatar: 'ع',
}

export const upcomingTraining = {
  title: 'تدريب مهارات وتمرير',
  day: 'اليوم',
  date: 'الأحد 3 مايو',
  time: '05:30 م',
  location: 'ملعب الأكاديمية الرئيسي',
  type: 'تدريب فني',
  notes: 'الوصول قبل الموعد بـ 15 دقيقة',
}

export const nextMatch = {
  opponent: 'نجوم الرياض',
  date: 'الجمعة 8 مايو',
  time: '07:00 م',
  location: 'ملعب الحي الرياضي',
  kit: 'الطقم الأزرق',
}

export const playerStats = {
  weeklyStatus: 'ملتزم هذا الأسبوع',
  monthlyAttendance: 88,
  attendedTrainings: 14,
  absences: 2,
  commitment: 92,
}

export const weeklyAttendance = [
  { week: 'الأسبوع 1', حضور: 3, غياب: 0, نسبة: 100 },
  { week: 'الأسبوع 2', حضور: 2, غياب: 1, نسبة: 67 },
  { week: 'الأسبوع 3', حضور: 3, غياب: 0, نسبة: 100 },
  { week: 'الأسبوع 4', حضور: 2, غياب: 1, نسبة: 67 },
]

export const coachTasks = [
  { id: 1, text: 'إحضار الحذاء المناسب للعشب الصناعي', done: false },
  { id: 2, text: 'الوصول قبل التدريب بـ 15 دقيقة', done: true },
  { id: 3, text: 'مشاهدة فيديو التمرير القصير', done: false },
]

export const coachMessage = {
  from: 'الكابتن سامي',
  time: 'منذ 20 دقيقة',
  body: 'ممتاز يا أبطال. تدريب اليوم مهم للتمرير تحت الضغط، نحتاج حضور الجميع في الوقت.',
}

export const players = [
  { id: 1, name: 'عمر فهد', age: 12, position: 'وسط', attendance: 88, status: 'present' as AttendanceStatus, lastActivity: 'أكد الحضور الآن' },
  { id: 2, name: 'عبدالله ناصر', age: 11, position: 'حارس', attendance: 94, status: 'present' as AttendanceStatus, lastActivity: 'حضر آخر تدريب' },
  { id: 3, name: 'سلمان خالد', age: 13, position: 'دفاع', attendance: 76, status: 'absent' as AttendanceStatus, lastActivity: 'اعتذر قبل ساعة' },
  { id: 4, name: 'محمد علي', age: 10, position: 'هجوم', attendance: 81, status: 'pending' as AttendanceStatus, lastActivity: 'لم يرد بعد' },
  { id: 5, name: 'يزن ماجد', age: 12, position: 'جناح', attendance: 90, status: 'present' as AttendanceStatus, lastActivity: 'أكد الحضور أمس' },
]

export const coachSummary = {
  trainingsToday: 2,
  expectedPlayers: 14,
  absentPlayers: 3,
  pendingPlayers: 4,
}

export const attendanceSplit = [
  { name: 'حضور', value: 14 },
  { name: 'غياب', value: 3 },
  { name: 'لم يرد', value: 4 },
]

export const scheduleEvents = [
  { id: 1, kind: 'training', title: 'تدريب مهارات وتمرير', date: 'الأحد 3 مايو', time: '05:30 م', location: 'ملعب الأكاديمية الرئيسي' },
  { id: 2, kind: 'training', title: 'تدريب لياقة وسرعة', date: 'الثلاثاء 5 مايو', time: '06:00 م', location: 'ملعب اللياقة' },
  { id: 3, kind: 'match', title: 'مباراة ضد نجوم الرياض', date: 'الجمعة 8 مايو', time: '07:00 م', location: 'ملعب الحي الرياضي' },
  { id: 4, kind: 'training', title: 'تدريب تكتيكي', date: 'الأحد 10 مايو', time: '05:30 م', location: 'ملعب الأكاديمية الرئيسي' },
]

export const messages = [
  coachMessage,
  { from: 'إدارة الفريق', time: 'أمس', body: 'تم تحديث موقع مباراة الجمعة. الرجاء مراجعة صفحة الجدول.' },
  { from: 'الكابتن سامي', time: 'قبل يومين', body: 'اللاعبون الذين لديهم إصابة خفيفة يرسلون ملاحظة قبل التدريب.' },
]
