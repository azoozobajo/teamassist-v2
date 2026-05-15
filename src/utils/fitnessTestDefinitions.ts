export type BestRule = 'lowest' | 'highest'
export type FieldType = 'number' | 'integer' | 'time_seconds'
export type ResultType = 'time' | 'distance' | 'count' | 'score' | 'level'

export interface TestField {
  key: string
  label: string
  unit: string
  type: FieldType
  min?: number
  max?: number
  required?: boolean
  placeholder?: string
}

export interface AttemptConfig {
  count: number
  label: string
}

export interface CalculatedFieldDef {
  key: string
  label: string
  unit: string
}

export interface TestDefinition {
  test_key: string
  name_ar: string
  category: string
  result_unit: string
  result_type: ResultType
  best_rule: BestRule
  side_specific: boolean
  attempts: AttemptConfig
  fields: TestField[]
  calculated: CalculatedFieldDef[]
  unusual_min?: number
  unusual_max?: number
  description?: string
  guide?: string
}

export const FITNESS_CATEGORIES = [
  'سرعة',
  'تحمل',
  'قوة انفجارية',
  'رشاقة',
  'قوة',
  'مرونة',
  'توازن',
  'تحمل تكراري',
] as const

export const FITNESS_TESTS: TestDefinition[] = [
  // ── SPEED ──────────────────────────────────────────────────────────────
  {
    test_key: 'sprint_30m',
    name_ar: 'سرعة 30 متر',
    category: 'سرعة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 2, max: 20, required: true, placeholder: 'مثال: 4.25' },
    ],
    calculated: [],
    unusual_min: 2.9,
    unusual_max: 8,
    description: 'سرعة العدو 30 متراً — أفضل محاولة (الأقل زمناً)',
    guide: 'يقيس السرعة القصوى للاعب.\n\n🏃 الطريقة: اللاعب يقف خلف خط البداية ثم يعدو بأقصى سرعة 30 متراً. يُسمح بالبدء من وقوف أو من حركة.\n\n🛠 الأدوات: شريط قياس أو ملعب مقاس + ساعة إيقاف أو بوابات ضوئية.\n\n📋 التسجيل: محاولتان — تُعتمد الأقل زمناً.',
  },
  {
    test_key: 'sprint_10m',
    name_ar: 'سرعة 10 متر',
    category: 'سرعة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 1, max: 10, required: true, placeholder: 'مثال: 1.85' },
    ],
    calculated: [],
    unusual_min: 1.4,
    unusual_max: 3.5,
    description: 'سرعة العدو 10 متراً — أفضل محاولة (الأقل زمناً)',
    guide: 'يقيس الانطلاق والتسارع الأولي — أهم مرحلة في كرة القدم.\n\n🏃 الطريقة: اللاعب يقف خلف خط البداية ثم يعدو بأقصى سرعة 10 أمتار.\n\n🛠 الأدوات: شريط قياس + ساعة إيقاف أو بوابات ضوئية.\n\n📋 التسجيل: محاولتان — تُعتمد الأقل زمناً.',
  },
  {
    test_key: 'sprint_60m',
    name_ar: 'سرعة 60 متر',
    category: 'سرعة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 5, max: 30, required: true, placeholder: 'مثال: 7.8' },
    ],
    calculated: [],
    unusual_min: 6.5,
    unusual_max: 15,
    guide: 'يقيس السرعة القصوى على مسافة أطول تعكس التحمل السريع.\n\n🏃 الطريقة: اللاعب يعدو بأقصى سرعة 60 متراً من وقوف ثابت.\n\n🛠 الأدوات: ملعب مقاس + ساعة إيقاف أو بوابات ضوئية.\n\n📋 التسجيل: محاولتان — تُعتمد الأقل زمناً.',
  },

  // ── ENDURANCE ──────────────────────────────────────────────────────────
  {
    test_key: 'yoyo_ir1',
    name_ar: 'يويو IR1',
    category: 'تحمل',
    result_unit: 'متر',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'level', label: 'المستوى', unit: '', type: 'integer', min: 1, max: 23, required: true, placeholder: 'مثال: 16' },
      { key: 'shuttle', label: 'عدد الشاتل', unit: '', type: 'integer', min: 1, max: 16, required: true, placeholder: 'مثال: 4' },
      { key: 'distance_m', label: 'المسافة الإجمالية', unit: 'متر', type: 'number', min: 40, max: 4000, required: true, placeholder: 'مثال: 1200' },
    ],
    calculated: [
      { key: 'vo2max', label: 'VO₂max تقديري', unit: 'مل/كغ/دقيقة' },
    ],
    unusual_min: 200,
    unusual_max: 3600,
    description: 'اختبار يويو للتحمل المتقطع — المستوى الأول. المسافة = النتيجة الرسمية.',
    guide: 'يقيس اللياقة الهوائية والقدرة على التعافي بين الجهود المتقطعة.\n\n🏃 الطريقة: اللاعب يجري ذهاباً وإياباً 20 متراً حسب صوت البيب المتسارع، مع راحة 10 ثوانٍ بين كل جولة. يتوقف عند عجزه عن مواكبة الصوت مرتين.\n\n🛠 الأدوات: ملعب 20م + تسجيل صوتي يويو IR1.\n\n📋 التسجيل: المستوى + عدد الشاتل + المسافة الإجمالية (بالمتر).',
  },
  {
    test_key: 'yoyo_ir2',
    name_ar: 'يويو IR2',
    category: 'تحمل',
    result_unit: 'متر',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'level', label: 'المستوى', unit: '', type: 'integer', min: 1, max: 23, required: true, placeholder: 'مثال: 12' },
      { key: 'shuttle', label: 'عدد الشاتل', unit: '', type: 'integer', min: 1, max: 16, required: true, placeholder: 'مثال: 6' },
      { key: 'distance_m', label: 'المسافة الإجمالية', unit: 'متر', type: 'number', min: 40, max: 2400, required: true, placeholder: 'مثال: 640' },
    ],
    calculated: [
      { key: 'vo2max', label: 'VO₂max تقديري', unit: 'مل/كغ/دقيقة' },
    ],
    unusual_min: 80,
    unusual_max: 2200,
    description: 'اختبار يويو للتحمل المتقطع — المستوى الثاني. أشد من IR1.',
    guide: 'نسخة أشد من IR1 — مخصصة للرياضيين المتقدمين. تبدأ بشدة أعلى مع فترة راحة 5 ثوانٍ فقط.\n\n🏃 الطريقة: نفس IR1 — جري مكوكي 20م حسب البيب مع راحة 5 ثوانٍ. يتوقف عند الفشل مرتين.\n\n🛠 الأدوات: ملعب 20م + تسجيل صوتي يويو IR2.\n\n📋 التسجيل: المستوى + الشاتل + المسافة الكلية.',
  },
  {
    test_key: 'beep_test',
    name_ar: 'اختبار بيب (20م)',
    category: 'تحمل',
    result_unit: 'مستوى',
    result_type: 'level',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'level', label: 'المستوى', unit: '', type: 'integer', min: 1, max: 21, required: true, placeholder: 'مثال: 10' },
      { key: 'shuttle', label: 'عدد الشاتل في المستوى', unit: '', type: 'integer', min: 1, max: 16, required: true, placeholder: 'مثال: 5' },
    ],
    calculated: [
      { key: 'vo2max', label: 'VO₂max تقديري', unit: 'مل/كغ/دقيقة' },
    ],
    unusual_min: 3,
    unusual_max: 21,
    description: 'اختبار الجري المكوكي بصوت البيب — نتيجته المستوى ثم عدد الشاتل.',
    guide: 'يقيس اللياقة الهوائية القصوى بدون راحة بين الجولات.\n\n🏃 الطريقة: اللاعب يجري مكوكياً 20متراً حسب صوت البيب المتسارع بدون توقف. يُستبعد عند تأخره عن الصوت مرتين متتاليتين.\n\n🛠 الأدوات: ملعب 20م + تسجيل صوتي اختبار البيب (Beep Test).\n\n📋 التسجيل: المستوى الأخير الذي وصله + عدد الشاتل في ذلك المستوى.',
  },
  {
    test_key: 'cooper_test',
    name_ar: 'اختبار كوبر 12 دقيقة',
    category: 'تحمل',
    result_unit: 'متر',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'distance_m', label: 'المسافة المقطوعة', unit: 'متر', type: 'number', min: 500, max: 5000, required: true, placeholder: 'مثال: 2800' },
    ],
    calculated: [
      { key: 'vo2max', label: 'VO₂max تقديري', unit: 'مل/كغ/دقيقة' },
    ],
    unusual_min: 1000,
    unusual_max: 4200,
    description: 'الجري لأقصى مسافة في 12 دقيقة.',
    guide: 'يقيس اللياقة الهوائية القصوى عبر الجهد المستمر.\n\n🏃 الطريقة: اللاعب يجري بأقصى جهد يستطيع الحفاظ عليه لمدة 12 دقيقة كاملة متواصلة.\n\n🛠 الأدوات: مضمار مقاس (400م يُفضَّل) أو ملعب + ساعة توقيت.\n\n📋 التسجيل: المسافة الكلية المقطوعة بالمتر.',
  },

  // ── EXPLOSIVE POWER / JUMPING ──────────────────────────────────────────
  {
    test_key: 'cmj',
    name_ar: 'قفز CMJ (بالتجهيز)',
    category: 'قوة انفجارية',
    result_unit: 'سم',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 3, label: 'محاولة' },
    fields: [
      { key: 'height_cm', label: 'الارتفاع', unit: 'سم', type: 'number', min: 5, max: 120, required: true, placeholder: 'مثال: 48.5' },
    ],
    calculated: [],
    unusual_min: 15,
    unusual_max: 90,
    description: 'القفز العمودي مع التجهيز (Counter Movement Jump) — أعلى محاولة.',
    guide: 'يقيس القوة الانفجارية للأطراف السفلية مع الاستفادة من دورة التمطط والتقصير.\n\n🏃 الطريقة: اللاعب يقف مستقيماً، يثني ركبتيه بسرعة للأسفل (التجهيز) ثم يقفز بأقصى ارتفاع. الذراعان حرتان لمساعدة الارتفاع.\n\n🛠 الأدوات: حصيرة قفز إلكترونية أو تطبيق (MyJump2) أو منصة قياس.\n\n📋 التسجيل: 3 محاولات — تُعتمد أعلى ارتفاع.',
  },
  {
    test_key: 'squat_jump',
    name_ar: 'قفز SJ (بدون تجهيز)',
    category: 'قوة انفجارية',
    result_unit: 'سم',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 3, label: 'محاولة' },
    fields: [
      { key: 'height_cm', label: 'الارتفاع', unit: 'سم', type: 'number', min: 5, max: 120, required: true, placeholder: 'مثال: 42.0' },
    ],
    calculated: [],
    unusual_min: 10,
    unusual_max: 80,
    description: 'القفز العمودي من وضع الجلوس (Squat Jump) بدون تجهيز.',
    guide: 'يقيس القوة الانفجارية الصافية دون الاستفادة من دورة التمطط — يكشف القوة العضلية الحقيقية.\n\n🏃 الطريقة: اللاعب يبدأ من وضع القرفصاء (الركبة 90°) ويثبت 2 ثانية ثم يقفز مباشرة. اليدان ثابتتان على الخصر طوال الوقت.\n\n🛠 الأدوات: حصيرة قفز أو تطبيق قياس.\n\n📋 التسجيل: 3 محاولات — تُعتمد أعلى ارتفاع.',
  },
  {
    test_key: 'standing_broad_jump',
    name_ar: 'القفز الأفقي',
    category: 'قوة انفجارية',
    result_unit: 'سم',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 3, label: 'محاولة' },
    fields: [
      { key: 'distance_cm', label: 'المسافة', unit: 'سم', type: 'number', min: 50, max: 400, required: true, placeholder: 'مثال: 210' },
    ],
    calculated: [],
    unusual_min: 80,
    unusual_max: 320,
    description: 'القفز الأفقي من الوقوف — أبعد محاولة.',
    guide: 'يقيس القوة الانفجارية الأفقية للأطراف السفلية.\n\n🏃 الطريقة: اللاعب يقف عند خط البداية بالقدمين معاً، يثني ركبتيه ويتأرجح بذراعيه ثم يقفز للأمام بأقصى مسافة مع الهبوط على القدمين.\n\n🛠 الأدوات: أرضية مستوية + شريط قياس.\n\n📋 التسجيل: يُقاس من الخط إلى نقطة هبوط الكعب الأقرب. 3 محاولات — تُعتمد الأبعد.',
  },

  // ── AGILITY ────────────────────────────────────────────────────────────
  {
    test_key: 't_test',
    name_ar: 'اختبار T للرشاقة',
    category: 'رشاقة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 4, max: 30, required: true, placeholder: 'مثال: 9.5' },
    ],
    calculated: [],
    unusual_min: 7,
    unusual_max: 18,
    description: 'اختبار T للرشاقة — أفضل محاولة (الأقل زمناً).',
    guide: 'يقيس الرشاقة والتحرك في اتجاهات متعددة (أمام، خلف، جانبي).\n\n🏃 الطريقة: 4 مخاريط على شكل T. اللاعب يعدو 9.14م للأمام، يتحرك جانبياً 4.57م يساراً ثم 9.14م يميناً ثم يعود 4.57م للوسط ثم يرجع للخلف. يُمنع تقاطع القدمين في التحرك الجانبي.\n\n🛠 الأدوات: 4 مخاريط + شريط قياس + ساعة إيقاف.\n\n📋 التسجيل: محاولتان — الأقل زمناً.',
  },
  {
    test_key: 'agility_505',
    name_ar: 'رشاقة 505',
    category: 'رشاقة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: true,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 1.5, max: 8, required: true, placeholder: 'مثال: 2.30' },
    ],
    calculated: [
      { key: 'asymmetry_pct', label: 'عدم التماثل', unit: '%' },
    ],
    unusual_min: 1.8,
    unusual_max: 4.5,
    description: 'اختبار 505 للرشاقة — اليمين واليسار منفصلَيْن.',
    guide: 'يقيس القدرة على تغيير الاتجاه 180° بسرعة، ويكشف عدم التماثل بين الجهتين.\n\n🏃 الطريقة: اللاعب يعدو 10م ثم يدور 180° عند المخروط ويعود 5م. يُقاس وقت الـ 5م الأخيرة فقط (باستخدام بوابتَي توقيت على المسافة 5م). يُنفَّذ لكل جهة (يمين/يسار) بشكل منفصل.\n\n🛠 الأدوات: مخاريط + بوابات ضوئية أو ساعة إيقاف.\n\n📋 التسجيل: محاولتان لكل جهة — الأقل زمناً لكل منهما.',
  },
  {
    test_key: 'illinois_agility',
    name_ar: 'اختبار إيلينوي',
    category: 'رشاقة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 10, max: 30, required: true, placeholder: 'مثال: 15.2' },
    ],
    calculated: [],
    unusual_min: 13,
    unusual_max: 22,
    description: 'اختبار إيلينوي للرشاقة — أفضل محاولة.',
    guide: 'يقيس الرشاقة العامة بمسار معقد يجمع السرعة والالتفاف.\n\n🏃 الطريقة: مسار بطول 10.23م وعرض 4.57م مع 8 مخاريط. اللاعب يبدأ من الأرض مستلقياً ثم ينهض ويجري المسار المحدد بالتعرج بين المخاريط بأسرع ما يمكن.\n\n🛠 الأدوات: 8 مخاريط + شريط قياس + ساعة إيقاف.\n\n📋 التسجيل: محاولتان — الأقل زمناً.',
  },

  // ── STRENGTH ────────────────────────────────────────────────────────────
  {
    test_key: 'grip_strength',
    name_ar: 'قوة القبضة',
    category: 'قوة',
    result_unit: 'كغ',
    result_type: 'score',
    best_rule: 'highest',
    side_specific: true,
    attempts: { count: 3, label: 'محاولة' },
    fields: [
      { key: 'force_kg', label: 'القوة', unit: 'كغ', type: 'number', min: 1, max: 100, required: true, placeholder: 'مثال: 42.0' },
    ],
    calculated: [
      { key: 'asymmetry_pct', label: 'عدم التماثل', unit: '%' },
    ],
    unusual_min: 10,
    unusual_max: 80,
    description: 'قياس قوة القبضة بالديناموميتر — اليد اليمنى واليسرى. أعلى محاولة لكل يد.',
    guide: 'يقيس قوة القبضة كمؤشر للقوة العضلية العامة وعدم التماثل بين اليدين.\n\n🏃 الطريقة: اللاعب يقف بالذراع بجانب الجسم والكوع مفروداً، يمسك الجهاز ويعصره بأقصى قوة لمدة 3 ثوانٍ دون تحريك الذراع. تُضبط الأداة على حجم اليد.\n\n🛠 الأدوات: ديناموميتر يدوي قابل للضبط (Grip Dynamometer).\n\n📋 التسجيل: 3 محاولات لكل يد (يمين/يسار) — الأعلى قيمة لكل منهما.',
  },
  {
    test_key: 'push_ups',
    name_ar: 'الضغط (دقيقة)',
    category: 'قوة',
    result_unit: 'تكرار',
    result_type: 'count',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'reps', label: 'عدد التكرارات', unit: 'تكرار', type: 'integer', min: 0, max: 200, required: true, placeholder: 'مثال: 35' },
    ],
    calculated: [],
    unusual_min: 5,
    unusual_max: 120,
    description: 'أقصى عدد ضغط في دقيقة واحدة.',
    guide: 'يقيس تحمل قوة عضلات الصدر والكتفين والذراعين.\n\n🏃 الطريقة: اللاعب يؤدي ضغطاً بشكل صحيح — الصدر يلمس الأرض أو يقترب منها، والذراعان تمتدان بالكامل في كل تكرار. الجسم مستقيم طوال الوقت. يُعدّ فقط التكرار الصحيح.\n\n🛠 الأدوات: أرضية مستوية + ساعة توقيت.\n\n📋 التسجيل: عدد التكرارات الصحيحة في دقيقة واحدة.',
  },
  {
    test_key: 'sit_ups',
    name_ar: 'البطن (دقيقة)',
    category: 'قوة',
    result_unit: 'تكرار',
    result_type: 'count',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'reps', label: 'عدد التكرارات', unit: 'تكرار', type: 'integer', min: 0, max: 200, required: true, placeholder: 'مثال: 40' },
    ],
    calculated: [],
    unusual_min: 5,
    unusual_max: 120,
    description: 'أقصى عدد جلوس بطن في دقيقة واحدة.',
    guide: 'يقيس تحمل قوة عضلات البطن والمركز.\n\n🏃 الطريقة: اللاعب يستلقي على ظهره، الركبتان مثنيتان والقدمان مثبَّتتان على الأرض، اليدان خلف الرأس. يرفع الجذع حتى الجلوس الكامل ثم يعود. يُعدّ فقط التكرار الصحيح.\n\n🛠 الأدوات: أرضية مستوية (يفضل حصيرة) + ساعة توقيت.\n\n📋 التسجيل: عدد التكرارات الصحيحة في دقيقة واحدة.',
  },
  {
    test_key: 'plank',
    name_ar: 'البلانك',
    category: 'قوة',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'time_s', label: 'المدة', unit: 'ثانية', type: 'number', min: 1, max: 3600, required: true, placeholder: 'مثال: 90' },
    ],
    calculated: [],
    unusual_min: 10,
    unusual_max: 600,
    description: 'تثبيت البلانك — أطول مدة.',
    guide: 'يقيس تحمل قوة عضلات الجذع والأساس (Core).\n\n🏃 الطريقة: اللاعب يثبّت جسمه على المرفقين وأطراف القدمين. الجسم مستقيم تماماً — بطن مشدود، الأرداف لا تُرفع ولا تنخفض. يُوقَف عند الانهيار أو تشوّه الوضعية.\n\n🛠 الأدوات: أرضية مستوية (حصيرة) + ساعة توقيت.\n\n📋 التسجيل: المدة بالثانية حتى التوقف.',
  },

  // ── FLEXIBILITY ────────────────────────────────────────────────────────
  {
    test_key: 'sit_and_reach',
    name_ar: 'الجلوس والمد',
    category: 'مرونة',
    result_unit: 'سم',
    result_type: 'distance',
    best_rule: 'highest',
    side_specific: false,
    attempts: { count: 2, label: 'محاولة' },
    fields: [
      { key: 'reach_cm', label: 'المسافة', unit: 'سم', type: 'number', min: -30, max: 60, required: true, placeholder: 'مثال: 12.5 (سلبي إذا لم يصل)' },
    ],
    calculated: [],
    unusual_min: -20,
    unusual_max: 50,
    description: 'اختبار الجلوس والمد — قياس مرونة الجذع وعضلات الفخذ الخلفية.',
    guide: 'يقيس مرونة عضلات الفخذ الخلفية والجذع السفلي.\n\n🏃 الطريقة: اللاعب يجلس بساقين ممدودتين أمامه ويضع قدميه على حافة صندوق القياس. يمد يديه للأمام ببطء دون أن يثني ركبتيه ويصل بأصابعه إلى أبعد نقطة ممكنة ويثبّت 2 ثانية.\n\n🛠 الأدوات: صندوق اختبار الجلوس والمد (Sit-and-Reach Box) أو خط مرسوم على الأرض مع شريط قياس.\n\n📋 التسجيل: محاولتان — القيمة بالسنتيمتر (سلبية إذا لم تصل الأصابع لمستوى القدم).',
  },

  // ── BALANCE ────────────────────────────────────────────────────────────
  {
    test_key: 'y_balance',
    name_ar: 'اختبار Y للتوازن',
    category: 'توازن',
    result_unit: '%',
    result_type: 'score',
    best_rule: 'highest',
    side_specific: true,
    attempts: { count: 1, label: 'محاولة' },
    fields: [
      { key: 'leg_length_cm', label: 'طول الطرف', unit: 'سم', type: 'number', min: 30, max: 120, required: true, placeholder: 'مثال: 89.0' },
      { key: 'anterior_cm', label: 'الأمامي (A)', unit: 'سم', type: 'number', min: 20, max: 150, required: true, placeholder: 'مثال: 72.5' },
      { key: 'posteromedial_cm', label: 'الخلفي الداخلي (PM)', unit: 'سم', type: 'number', min: 20, max: 180, required: true, placeholder: 'مثال: 100.0' },
      { key: 'posterolateral_cm', label: 'الخلفي الخارجي (PL)', unit: 'سم', type: 'number', min: 20, max: 180, required: true, placeholder: 'مثال: 95.5' },
    ],
    calculated: [
      { key: 'composite_score', label: 'النتيجة المركبة', unit: '%' },
      { key: 'asymmetry_pct', label: 'عدم التماثل', unit: '%' },
    ],
    unusual_min: 50,
    unusual_max: 120,
    description: 'اختبار Y للتوازن الديناميكي — ثلاثة اتجاهات. النتيجة المركبة = (A+PM+PL) / (3 × طول الطرف) × 100.',
    guide: 'يقيس التوازن الديناميكي وثبات المفاصل واكتشاف خطر الإصابة.\n\n🏃 الطريقة: اللاعب يقف على قدم واحدة عند مركز جهاز Y ثم يمد القدم الأخرى في ثلاثة اتجاهات: أمامي (A)، خلفي داخلي (PM)، خلفي خارجي (PL)، يلمس الخط بأطراف أصابعه فقط دون التحميل. تُقاس كل جهة (يمين/يسار) على حدة.\n\n🛠 الأدوات: جهاز Y-Balance Test أو رسم الاتجاهات على الأرض مع شريط قياس.\n\n📋 التسجيل: طول الطرف + قراءات الاتجاهات الثلاثة. النتيجة المركبة = (A+PM+PL) ÷ (3 × طول الطرف) × 100.',
  },

  // ── REPEATED SPRINT ABILITY ────────────────────────────────────────────
  {
    test_key: 'rsa',
    name_ar: 'القدرة على التكرار (RSA)',
    category: 'تحمل تكراري',
    result_unit: 'ثانية',
    result_type: 'time',
    best_rule: 'lowest',
    side_specific: false,
    attempts: { count: 6, label: 'سبرنت' },
    fields: [
      { key: 'time_s', label: 'الزمن', unit: 'ثانية', type: 'number', min: 1, max: 30, required: true, placeholder: 'مثال: 4.35' },
    ],
    calculated: [
      { key: 'best_s', label: 'أفضل سبرنت', unit: 'ثانية' },
      { key: 'worst_s', label: 'أسوأ سبرنت', unit: 'ثانية' },
      { key: 'average_s', label: 'المتوسط', unit: 'ثانية' },
      { key: 'total_s', label: 'المجموع', unit: 'ثانية' },
      { key: 'fatigue_index', label: 'مؤشر الإجهاد', unit: '%' },
    ],
    unusual_min: 3,
    unusual_max: 8,
    description: 'اختبار القدرة على التكرار — 6 سبرنتات. النتيجة = أفضل سبرنت (الأقل).',
    guide: 'يقيس قدرة اللاعب على الحفاظ على السرعة عبر سبرنتات متكررة مع راحة قصيرة — حاسم في كرة القدم.\n\n🏃 الطريقة: 6 سبرنتات 30 متراً (أو 35م) بفاصل راحة 20–25 ثانية بين كل سبرنت. اللاعب يعدو بأقصى جهد في كل تكرار.\n\n🛠 الأدوات: مضمار مقاس 30م + بوابات ضوئية أو ساعة إيقاف + شريط قياس.\n\n📋 التسجيل: زمن كل سبرنت من الـ6. تُحسب تلقائياً: أفضل سبرنت، أسوأ سبرنت، المتوسط، المجموع، ومؤشر الإجهاد.',
  },
]

export function getTestDef(testKey: string): TestDefinition | undefined {
  return FITNESS_TESTS.find(t => t.test_key === testKey)
}

export function getTestsByCategory(category: string): TestDefinition[] {
  return FITNESS_TESTS.filter(t => t.category === category)
}
