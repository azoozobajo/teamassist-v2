import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  Plus, Stethoscope, ChevronDown, ChevronUp, Paperclip, Send,
  AlertCircle, X, FileText, Image, Filter, Activity,
  RotateCcw, ChevronRight, ChevronLeft, ShieldAlert, CheckCircle,
  Pencil, Trash2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { medicalService, teamService, permissionService, attendanceService } from '../../services'
import { Spinner, PageHeader, Modal, FormField, EmptyState, Tabs } from '../../components/ui'
import { canManageTeam, hasPermission } from '../../utils/helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const BODY_REGIONS = [
  { key: 'head_face',    label: 'الرأس والوجه' },
  { key: 'neck',         label: 'الرقبة' },
  { key: 'shoulder',     label: 'الكتف' },
  { key: 'upper_arm',    label: 'الذراع' },
  { key: 'elbow',        label: 'الكوع' },
  { key: 'forearm',      label: 'الساعد' },
  { key: 'wrist',        label: 'الرسغ' },
  { key: 'hand_fingers', label: 'اليد والأصابع' },
  { key: 'chest',        label: 'الصدر والأضلاع' },
  { key: 'back',         label: 'الظهر' },
  { key: 'abdomen',      label: 'البطن' },
  { key: 'pelvis',       label: 'الحوض' },
  { key: 'hip',          label: 'الورك' },
  { key: 'adductors',    label: 'الأربية / العضلة الضامة / داخل الفخذ (Adductors)' },
  { key: 'quadriceps',   label: 'الفخذ الأمامي / العضلة الرباعية (Quadriceps)' },
  { key: 'hamstrings',   label: 'الفخذ الخلفي / العضلة الخلفية (Hamstrings)' },
  { key: 'knee',         label: 'الركبة' },
  { key: 'lower_leg',    label: 'الساق / بطة الساق' },
  { key: 'achilles',     label: 'وتر أخيل (Achilles Tendon)' },
  { key: 'ankle',        label: 'الكاحل' },
  { key: 'foot',         label: 'القدم' },
  { key: 'toes',         label: 'أصابع القدم' },
  { key: 'femur',        label: 'عظمة الفخذ (Femur)' },
  { key: 'other_region', label: 'أخرى' },
]

const BODY_LOCATIONS: Record<string, { key: string; label: string }[]> = {
  head_face:    [{ key: 'head', label: 'الرأس' }, { key: 'face', label: 'الوجه' }, { key: 'jaw', label: 'الفك' }, { key: 'eye_area', label: 'منطقة العين' }, { key: 'nose', label: 'الأنف' }, { key: 'other', label: 'أخرى' }],
  neck:         [{ key: 'neck_muscles', label: 'عضلات الرقبة' }, { key: 'cervical_spine', label: 'العمود الفقري العنقي (Cervical)' }, { key: 'other', label: 'أخرى' }],
  shoulder:     [{ key: 'shoulder_joint', label: 'مفصل الكتف' }, { key: 'rotator_cuff', label: 'الكفة المدورة (Rotator Cuff)' }, { key: 'clavicle', label: 'الترقوة (Clavicle)' }, { key: 'ac_joint', label: 'مفصل أخرمي ترقوي (AC Joint)' }, { key: 'other', label: 'أخرى' }],
  upper_arm:    [{ key: 'biceps', label: 'عضلة الذراع الأمامية (Biceps)' }, { key: 'triceps', label: 'عضلة الذراع الخلفية (Triceps)' }, { key: 'humerus', label: 'عظمة العضد (Humerus)' }, { key: 'other', label: 'أخرى' }],
  elbow:        [{ key: 'elbow_joint', label: 'مفصل الكوع' }, { key: 'lateral_epicondyle', label: 'الجانب الخارجي (Tennis Elbow)' }, { key: 'medial_epicondyle', label: 'الجانب الداخلي (Golfer\'s Elbow)' }, { key: 'other', label: 'أخرى' }],
  forearm:      [{ key: 'forearm_muscles', label: 'عضلات الساعد' }, { key: 'radius', label: 'عظمة الكعبرة (Radius)' }, { key: 'ulna', label: 'عظمة الزند (Ulna)' }, { key: 'other', label: 'أخرى' }],
  wrist:        [{ key: 'wrist_joint', label: 'مفصل الرسغ' }, { key: 'wrist_sprain', label: 'التواء الرسغ' }, { key: 'wrist_fracture', label: 'كسر في الرسغ' }, { key: 'other', label: 'أخرى' }],
  hand_fingers: [{ key: 'fingers', label: 'الأصابع' }, { key: 'thumb', label: 'الإبهام' }, { key: 'metacarpals', label: 'عظام المشط' }, { key: 'other', label: 'أخرى' }],
  chest:        [{ key: 'ribs', label: 'الأضلاع' }, { key: 'sternum', label: 'القص (Sternum)' }, { key: 'pectorals', label: 'عضلات الصدر' }, { key: 'other', label: 'أخرى' }],
  back:         [{ key: 'upper_back', label: 'الظهر العلوي' }, { key: 'lower_back', label: 'أسفل الظهر' }, { key: 'lumbar_spine', label: 'العمود الفقري القطني (Lumbar)' }, { key: 'thoracic_spine', label: 'العمود الفقري الصدري (Thoracic)' }, { key: 'back_muscles', label: 'عضلات الظهر' }, { key: 'sacrum', label: 'العجز (Sacrum)' }, { key: 'other', label: 'أخرى' }],
  abdomen:      [{ key: 'abdominal_muscles', label: 'عضلات البطن' }, { key: 'obliques', label: 'العضلات المائلة (Obliques)' }, { key: 'other', label: 'أخرى' }],
  pelvis:       [{ key: 'pelvis_bone', label: 'عظم الحوض' }, { key: 'pubic_bone', label: 'عظمة العانة (Pubis)' }, { key: 'other', label: 'أخرى' }],
  hip:          [{ key: 'hip_joint', label: 'مفصل الورك' }, { key: 'glutes', label: 'عضلات الأرداف (Glutes)' }, { key: 'it_band', label: 'الحزمة الظنبوبية الحرقفية (IT Band)' }, { key: 'other', label: 'أخرى' }],
  adductors:    [{ key: 'add_groin_pain', label: 'ألم الأربية' }, { key: 'add_strain', label: 'شد في العضلة الضامة' }, { key: 'add_tear', label: 'تمزق في العضلة الضامة' }, { key: 'add_inner_thigh', label: 'ألم داخل الفخذ' }, { key: 'add_hernia', label: 'فتق رياضي / ألم منطقة العانة' }, { key: 'other', label: 'أخرى' }],
  quadriceps:   [{ key: 'quad_strain', label: 'شد في الفخذ الأمامي / العضلة الرباعية' }, { key: 'quad_tear', label: 'تمزق في الفخذ الأمامي / العضلة الرباعية' }, { key: 'quad_contusion', label: 'كدمة عضلية في الفخذ الأمامي' }, { key: 'quad_soreness', label: 'ألم عضلي بعد الجهد في الفخذ الأمامي' }, { key: 'other', label: 'أخرى' }],
  hamstrings:   [{ key: 'ham_strain', label: 'شد في العضلة الخلفية' }, { key: 'ham_tear', label: 'تمزق في العضلة الخلفية' }, { key: 'ham_proximal', label: 'إصابة العضلة الخلفية قرب الحوض' }, { key: 'ham_distal', label: 'إصابة العضلة الخلفية قرب الركبة' }, { key: 'ham_soreness', label: 'ألم عضلي بعد الجهد في العضلة الخلفية' }, { key: 'other', label: 'أخرى' }],
  knee:         [{ key: 'knee_acl', label: 'إصابة الرباط الصليبي الأمامي (ACL)' }, { key: 'knee_pcl', label: 'إصابة الرباط الصليبي الخلفي (PCL)' }, { key: 'knee_mcl', label: 'إصابة الرباط الجانبي الداخلي للركبة (MCL)' }, { key: 'knee_lcl', label: 'إصابة الرباط الجانبي الخارجي للركبة (LCL)' }, { key: 'knee_meniscus', label: 'إصابة الغضروف الهلالي (Meniscus)' }, { key: 'knee_anterior_pain', label: 'ألم أمام الركبة' }, { key: 'knee_patella_tendon', label: 'إصابة وتر الرضفة' }, { key: 'knee_patella_disloc', label: 'خلع / عدم ثبات الرضفة' }, { key: 'knee_contusion', label: 'كدمة ركبة' }, { key: 'knee_swelling', label: 'التهاب / تورم مفصل الركبة' }, { key: 'other', label: 'أخرى' }],
  lower_leg:    [{ key: 'calf_strain', label: 'شد عضلة السمانة / بطة الساق' }, { key: 'calf_tear', label: 'تمزق عضلة السمانة / بطة الساق' }, { key: 'shin_splints', label: 'ألم قصبة الساق / التهاب السمحاق (Shin Splints)' }, { key: 'leg_stress_fx', label: 'إجهاد عظمة الساق' }, { key: 'leg_contusion', label: 'كدمة في الساق' }, { key: 'leg_cramp', label: 'تشنج عضلي' }, { key: 'other', label: 'أخرى' }],
  achilles:     [{ key: 'ach_pain', label: 'ألم وتر أخيل' }, { key: 'ach_tendinitis', label: 'التهاب وتر أخيل' }, { key: 'ach_tendinopathy', label: 'ألم مزمن في وتر أخيل (Tendinopathy)' }, { key: 'ach_partial_tear', label: 'تمزق جزئي في وتر أخيل' }, { key: 'ach_rupture', label: 'تمزق كامل في وتر أخيل' }, { key: 'other', label: 'أخرى' }],
  ankle:        [{ key: 'ank_lateral', label: 'التواء كاحل خارجي' }, { key: 'ank_medial', label: 'التواء كاحل داخلي' }, { key: 'ank_ligament', label: 'إصابة أربطة الكاحل' }, { key: 'ank_high_sprain', label: 'التواء الكاحل العالي (Syndesmosis / High Ankle Sprain)' }, { key: 'ank_contusion', label: 'كدمة كاحل' }, { key: 'ank_chronic', label: 'ألم كاحل مزمن' }, { key: 'other', label: 'أخرى' }],
  foot:         [{ key: 'plantar_fascia', label: 'لفافة أخمص القدم (Plantar Fascia)' }, { key: 'metatarsals', label: 'عظام مشط القدم' }, { key: 'heel', label: 'الكعب' }, { key: 'other', label: 'أخرى' }],
  toes:         [{ key: 'toes_general', label: 'أصابع القدم عامة' }, { key: 'big_toe', label: 'الإبهام (الأصبع الكبير)' }, { key: 'toe_fracture', label: 'كسر في أصبع القدم' }, { key: 'toe_blister', label: 'فقاعة جلدية / نفطة في الأصابع (Blister)' }, { key: 'other', label: 'أخرى' }],
  femur:        [{ key: 'fem_fracture', label: 'كسر عظمة الفخذ' }, { key: 'fem_stress', label: 'شرخ في عظمة الفخذ' }, { key: 'fem_bruise', label: 'كدمة عظمية في عظمة الفخذ' }, { key: 'fem_stress_fx', label: 'إجهاد عظمي في عظمة الفخذ' }, { key: 'fem_pain', label: 'ألم عظمي غير محدد' }, { key: 'other', label: 'أخرى' }],
  other_region: [{ key: 'other', label: 'أخرى / منطقة غير مذكورة' }],
}

const TISSUE_TYPES = [
  { key: 'muscle',       label: 'عضلية / إصابة في العضلة' },
  { key: 'tendon',       label: 'وترية / إصابة في الوتر' },
  { key: 'ligament',     label: 'رباطية / إصابة في الرباط' },
  { key: 'joint',        label: 'مفصلية / إصابة في المفصل' },
  { key: 'bone',         label: 'عظمية / إصابة في العظم' },
  { key: 'cartilage',    label: 'غضروفية / إصابة في الغضروف أو الغضروف الهلالي' },
  { key: 'nerve',        label: 'عصبية / إصابة أو ضغط على العصب' },
  { key: 'skin',         label: 'جلدية / جرح أو خدش' },
  { key: 'concussion',   label: 'ارتجاج / إصابة رأس' },
  { key: 'contusion',    label: 'كدمة' },
  { key: 'inflammation', label: 'التهاب / تهيج' },
  { key: 'overload',     label: 'إجهاد / حمل زائد' },
  { key: 'unknown',      label: 'غير محدد' },
  { key: 'other',        label: 'أخرى' },
]

const DIAGNOSES: Record<string, { key: string; label: string }[]> = {
  muscle: [
    { key: 'muscle_strain',    label: 'شد عضلي' },
    { key: 'strain_g1',        label: 'تمزق عضلي بسيط - درجة 1' },
    { key: 'strain_g2',        label: 'تمزق عضلي متوسط - درجة 2' },
    { key: 'strain_g3',        label: 'تمزق عضلي شديد - درجة 3' },
    { key: 'contusion',        label: 'كدمة عضلية' },
    { key: 'cramp',            label: 'تشنج عضلي' },
    { key: 'delayed_soreness', label: 'ألم عضلي بعد الجهد' },
    { key: 'recurrent_muscle', label: 'إصابة عضلية متكررة' },
    { key: 'other',            label: 'أخرى' },
  ],
  tendon: [
    { key: 'tendinitis',       label: 'التهاب وتر' },
    { key: 'tendinopathy',     label: 'ألم أو التهاب مزمن في الوتر (Tendinopathy)' },
    { key: 'partial_tear',     label: 'تمزق وتر جزئي' },
    { key: 'rupture',          label: 'تمزق وتر كامل' },
    { key: 'tenosynovitis',    label: 'التهاب غمد الوتر' },
    { key: 'enthesopathy',     label: 'إصابة موضع اتصال الوتر بالعظم' },
    { key: 'other',            label: 'أخرى' },
  ],
  ligament: [
    { key: 'sprain_g1',        label: 'التواء رباط بسيط - درجة 1' },
    { key: 'sprain_g2',        label: 'التواء رباط متوسط - درجة 2' },
    { key: 'sprain_g3',        label: 'التواء رباط شديد - درجة 3' },
    { key: 'partial_tear',     label: 'تمزق رباط جزئي' },
    { key: 'rupture',          label: 'تمزق رباط كامل' },
    { key: 'instability',      label: 'عدم ثبات مفصل' },
    { key: 'other',            label: 'أخرى' },
  ],
  joint: [
    { key: 'dislocation',      label: 'خلع مفصلي' },
    { key: 'subluxation',      label: 'انزلاق مفصلي جزئي' },
    { key: 'joint_pain',       label: 'ألم مفصلي عام' },
    { key: 'joint_swelling',   label: 'تورم مفصل' },
    { key: 'stiffness',        label: 'تيبس مفصل' },
    { key: 'other',            label: 'أخرى' },
  ],
  bone: [
    { key: 'fracture',         label: 'كسر' },
    { key: 'stress_fracture',  label: 'شرخ عظمي' },
    { key: 'bone_stress',      label: 'إجهاد عظمي' },
    { key: 'bone_bruise',      label: 'كدمة عظمية' },
    { key: 'shin_splints_bone',label: 'ألم قصبة الساق / التهاب السمحاق (Shin Splints)' },
    { key: 'bone_pain',        label: 'ألم عظمي غير محدد' },
    { key: 'other',            label: 'أخرى' },
  ],
  cartilage: [
    { key: 'meniscus_tear',    label: 'إصابة الغضروف الهلالي (Meniscus)' },
    { key: 'articular_damage', label: 'إصابة غضروف المفصل' },
    { key: 'labrum_tear',      label: 'إصابة غضروف حافة المفصل (Labrum)' },
    { key: 'cartilage_wear',   label: 'تآكل / تهيج غضروفي' },
    { key: 'other',            label: 'أخرى' },
  ],
  nerve: [
    { key: 'neuropathy',       label: 'اعتلال عصبي' },
    { key: 'compression',      label: 'ضغط على العصب' },
    { key: 'neuralgia',        label: 'ألم عصبي' },
    { key: 'other',            label: 'أخرى' },
  ],
  skin: [
    { key: 'laceration',       label: 'جرح' },
    { key: 'abrasion',         label: 'خدش' },
    { key: 'bleeding',         label: 'نزيف' },
    { key: 'blister',          label: 'فقاعة جلدية / نفطة (Blister)' },
    { key: 'friction_burn',    label: 'حرق احتكاك' },
    { key: 'other',            label: 'أخرى' },
  ],
  concussion: [
    { key: 'concussion_sus',   label: 'اشتباه ارتجاج' },
    { key: 'concussion_conf',  label: 'ارتجاج مؤكد' },
    { key: 'post_headache',    label: 'صداع بعد اصطدام' },
    { key: 'dizziness',        label: 'دوخة' },
    { key: 'nausea',           label: 'غثيان بعد اصطدام' },
    { key: 'loss_conscious',   label: 'فقدان وعي' },
    { key: 'other',            label: 'أخرى' },
  ],
  contusion: [
    { key: 'muscle_bruise',    label: 'كدمة عضلية' },
    { key: 'bone_bruise',      label: 'كدمة عظمية' },
    { key: 'hematoma',         label: 'ورم دموي' },
    { key: 'general_bruise',   label: 'كدمة عامة' },
    { key: 'other',            label: 'أخرى' },
  ],
  inflammation: [
    { key: 'bursitis',         label: 'التهاب الجراب' },
    { key: 'synovitis',        label: 'التهاب الغشاء الزليلي' },
    { key: 'general_inflam',   label: 'التهاب عام' },
    { key: 'other',            label: 'أخرى' },
  ],
  overload: [
    { key: 'overuse',          label: 'إفراط في الاستخدام' },
    { key: 'fatigue_injury',   label: 'إجهاد جسدي' },
    { key: 'compartment',      label: 'متلازمة الحجرة' },
    { key: 'other',            label: 'أخرى' },
  ],
  unknown: [
    { key: 'unknown_pain',     label: 'ألم غير محدد السبب' },
    { key: 'other',            label: 'أخرى' },
  ],
  other: [
    { key: 'other',            label: 'أخرى / غير مصنف' },
  ],
}

// ─── Region → allowed tissue type keys (keeps choices relevant per body area) ─

const REGION_TISSUE_MAP: Record<string, string[]> = {
  head_face:    ['concussion', 'skin', 'contusion', 'bone', 'unknown', 'other'],
  neck:         ['muscle', 'bone', 'nerve', 'joint', 'inflammation', 'unknown', 'other'],
  shoulder:     ['joint', 'tendon', 'ligament', 'muscle', 'bone', 'contusion', 'unknown', 'other'],
  upper_arm:    ['muscle', 'tendon', 'bone', 'skin', 'contusion', 'unknown', 'other'],
  elbow:        ['joint', 'ligament', 'tendon', 'bone', 'skin', 'contusion', 'unknown', 'other'],
  forearm:      ['muscle', 'tendon', 'bone', 'skin', 'contusion', 'unknown', 'other'],
  wrist:        ['joint', 'ligament', 'tendon', 'bone', 'skin', 'contusion', 'unknown', 'other'],
  hand_fingers: ['joint', 'ligament', 'tendon', 'bone', 'skin', 'contusion', 'unknown', 'other'],
  chest:        ['bone', 'muscle', 'contusion', 'inflammation', 'unknown', 'other'],
  back:         ['muscle', 'bone', 'nerve', 'joint', 'overload', 'inflammation', 'unknown', 'other'],
  abdomen:      ['muscle', 'contusion', 'inflammation', 'skin', 'unknown', 'other'],
  pelvis:       ['bone', 'muscle', 'joint', 'inflammation', 'unknown', 'other'],
  hip:          ['joint', 'muscle', 'tendon', 'bone', 'contusion', 'inflammation', 'unknown', 'other'],
  adductors:    ['muscle', 'tendon', 'overload', 'joint', 'bone', 'unknown', 'other'],
  quadriceps:   ['muscle', 'tendon', 'contusion', 'overload', 'bone', 'unknown', 'other'],
  hamstrings:   ['muscle', 'tendon', 'contusion', 'overload', 'bone', 'unknown', 'other'],
  knee:         ['ligament', 'cartilage', 'tendon', 'joint', 'bone', 'contusion', 'inflammation', 'unknown', 'other'],
  lower_leg:    ['muscle', 'tendon', 'bone', 'contusion', 'overload', 'inflammation', 'unknown', 'other'],
  achilles:     ['tendon', 'inflammation', 'overload', 'unknown', 'other'],
  ankle:        ['ligament', 'tendon', 'joint', 'bone', 'contusion', 'inflammation', 'unknown', 'other'],
  foot:         ['bone', 'joint', 'ligament', 'tendon', 'skin', 'contusion', 'overload', 'unknown', 'other'],
  toes:         ['bone', 'joint', 'ligament', 'tendon', 'skin', 'contusion', 'unknown', 'other'],
  femur:        ['bone', 'contusion', 'unknown', 'other'],
  other_region: ['muscle', 'tendon', 'ligament', 'joint', 'bone', 'cartilage', 'nerve', 'skin',
                 'concussion', 'contusion', 'inflammation', 'overload', 'unknown', 'other'],
}

// ─── Region+tissue specific diagnoses (overrides DIAGNOSES[tissue] when more precise options are needed) ─

const REGION_TISSUE_DIAGNOSES: Record<string, Record<string, { key: string; label: string }[]>> = {
  knee: {
    ligament: [
      { key: 'knee_acl_injury',   label: 'إصابة الرباط الصليبي الأمامي (ACL)' },
      { key: 'knee_pcl_injury',   label: 'إصابة الرباط الصليبي الخلفي (PCL)' },
      { key: 'knee_mcl_injury',   label: 'إصابة الرباط الجانبي الداخلي للركبة (MCL)' },
      { key: 'knee_lcl_injury',   label: 'إصابة الرباط الجانبي الخارجي للركبة (LCL)' },
      { key: 'sprain_g1',         label: 'التواء رباط بسيط - درجة 1' },
      { key: 'partial_tear',      label: 'تمزق رباط جزئي' },
      { key: 'rupture',           label: 'تمزق رباط كامل' },
      { key: 'instability',       label: 'عدم ثبات مفصل الركبة' },
      { key: 'other',             label: 'أخرى' },
    ],
    cartilage: [
      { key: 'meniscus_tear',     label: 'إصابة الغضروف الهلالي (Meniscus)' },
      { key: 'articular_damage',  label: 'إصابة غضروف مفصل الركبة' },
      { key: 'cartilage_wear',    label: 'تهيج / تآكل غضروفي' },
      { key: 'labrum_tear',       label: 'إصابة حافة الغضروف' },
      { key: 'other',             label: 'أخرى' },
    ],
    tendon: [
      { key: 'tendinitis',        label: 'التهاب وتر الرضفة (Patellar Tendinitis)' },
      { key: 'tendinopathy',      label: 'ألم مزمن في وتر الرضفة (Tendinopathy)' },
      { key: 'partial_tear',      label: 'تمزق وتر جزئي' },
      { key: 'rupture',           label: 'تمزق وتر كامل' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  hamstrings: {
    muscle: [
      { key: 'muscle_strain',     label: 'شد في العضلة الخلفية' },
      { key: 'strain_g1',         label: 'تمزق عضلي بسيط - درجة 1' },
      { key: 'strain_g2',         label: 'تمزق عضلي متوسط - درجة 2' },
      { key: 'strain_g3',         label: 'تمزق عضلي شديد - درجة 3' },
      { key: 'contusion',         label: 'كدمة عضلية في الفخذ الخلفي' },
      { key: 'delayed_soreness',  label: 'ألم عضلي بعد الجهد' },
      { key: 'recurrent_muscle',  label: 'إصابة متكررة في العضلة الخلفية' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  quadriceps: {
    muscle: [
      { key: 'muscle_strain',     label: 'شد في الفخذ الأمامي / العضلة الرباعية' },
      { key: 'strain_g1',         label: 'تمزق عضلي بسيط - درجة 1' },
      { key: 'strain_g2',         label: 'تمزق عضلي متوسط - درجة 2' },
      { key: 'strain_g3',         label: 'تمزق عضلي شديد - درجة 3' },
      { key: 'contusion',         label: 'كدمة عضلية في الفخذ الأمامي' },
      { key: 'delayed_soreness',  label: 'ألم عضلي بعد الجهد' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  adductors: {
    muscle: [
      { key: 'muscle_strain',     label: 'شد في العضلة الضامة / الأربية' },
      { key: 'strain_g1',         label: 'تمزق عضلي بسيط - درجة 1' },
      { key: 'strain_g2',         label: 'تمزق عضلي متوسط - درجة 2' },
      { key: 'strain_g3',         label: 'تمزق عضلي شديد - درجة 3' },
      { key: 'contusion',         label: 'كدمة عضلية في منطقة الأربية' },
      { key: 'delayed_soreness',  label: 'ألم عضلي بعد الجهد' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  achilles: {
    tendon: [
      { key: 'tendinitis',        label: 'التهاب وتر أخيل' },
      { key: 'tendinopathy',      label: 'ألم مزمن في وتر أخيل (Tendinopathy)' },
      { key: 'partial_tear',      label: 'تمزق جزئي في وتر أخيل' },
      { key: 'rupture',           label: 'تمزق كامل في وتر أخيل' },
      { key: 'enthesopathy',      label: 'التهاب موضع اتصال الوتر بالعظم' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  abdomen: {
    muscle: [
      { key: 'muscle_strain',     label: 'شد في عضلات البطن' },
      { key: 'strain_g1',         label: 'تمزق عضلي بسيط - درجة 1' },
      { key: 'strain_g2',         label: 'تمزق عضلي متوسط - درجة 2' },
      { key: 'delayed_soreness',  label: 'ألم عضلي بعد الجهد' },
      { key: 'other',             label: 'أخرى' },
    ],
    skin: [
      { key: 'laceration',        label: 'جرح' },
      { key: 'abrasion',          label: 'خدش' },
      { key: 'general_bruise',    label: 'كدمة سطحية' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  femur: {
    bone: [
      { key: 'fracture',          label: 'كسر عظمة الفخذ' },
      { key: 'stress_fracture',   label: 'شرخ في عظمة الفخذ' },
      { key: 'bone_stress',       label: 'إجهاد عظمي في عظمة الفخذ' },
      { key: 'bone_bruise',       label: 'كدمة عظمية في عظمة الفخذ' },
      { key: 'bone_pain',         label: 'ألم عظمي غير محدد' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  lower_leg: {
    muscle: [
      { key: 'muscle_strain',     label: 'شد عضلة السمانة / بطة الساق' },
      { key: 'strain_g1',         label: 'تمزق عضلي بسيط - درجة 1' },
      { key: 'strain_g2',         label: 'تمزق عضلي متوسط - درجة 2' },
      { key: 'strain_g3',         label: 'تمزق عضلي شديد - درجة 3' },
      { key: 'cramp',             label: 'تشنج عضلي' },
      { key: 'delayed_soreness',  label: 'ألم عضلي بعد الجهد' },
      { key: 'other',             label: 'أخرى' },
    ],
    bone: [
      { key: 'shin_splints_bone', label: 'ألم قصبة الساق / التهاب السمحاق (Shin Splints)' },
      { key: 'stress_fracture',   label: 'شرخ عظمي في الساق' },
      { key: 'fracture',          label: 'كسر في الساق' },
      { key: 'bone_stress',       label: 'إجهاد عظمي' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  ankle: {
    ligament: [
      { key: 'sprain_g1',         label: 'التواء كاحل بسيط - درجة 1' },
      { key: 'sprain_g2',         label: 'التواء كاحل متوسط - درجة 2' },
      { key: 'sprain_g3',         label: 'التواء كاحل شديد - درجة 3' },
      { key: 'partial_tear',      label: 'تمزق رباط كاحل جزئي' },
      { key: 'rupture',           label: 'تمزق رباط كاحل كامل' },
      { key: 'instability',       label: 'عدم ثبات الكاحل المزمن' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
  back: {
    nerve: [
      { key: 'compression',       label: 'ضغط على العصب / انزلاق' },
      { key: 'neuropathy',        label: 'اعتلال عصبي في الظهر' },
      { key: 'neuralgia',         label: 'ألم عصبي / عرق النسا' },
      { key: 'other',             label: 'أخرى' },
    ],
  },
}

const INJURY_CONTEXTS = [
  { key: 'training', label: 'خلال التدريب' },
  { key: 'match',    label: 'خلال المباراة' },
  { key: 'personal', label: 'خارج النشاط الرياضي' },
  { key: 'unknown',  label: 'غير محدد' },
]

const INJURY_MECHANISMS = [
  { key: 'contact',     label: 'تماس / اصطدام' },
  { key: 'non_contact', label: 'بدون تماس' },
  { key: 'overuse',     label: 'إفراط في الاستخدام' },
  { key: 'fatigue',     label: 'إجهاد / تعب' },
  { key: 'unknown',     label: 'غير محدد' },
]

const BODY_SIDES = [
  { key: 'right',     label: 'يمين' },
  { key: 'left',      label: 'يسار' },
  { key: 'bilateral', label: 'كلا الجانبين' },
  { key: 'central',   label: 'مركزي (لا ينطبق)' },
]

const SEVERITY_CONFIG: Record<string, { label: string; color: string; days: string }> = {
  minimal:   { label: 'بسيطة جداً', color: 'bg-green-100 text-green-700',   days: '1–3 أيام' },
  mild:      { label: 'بسيطة',       color: 'bg-lime-100 text-lime-700',    days: '4–7 أيام' },
  moderate:  { label: 'متوسطة',      color: 'bg-amber-100 text-amber-700',  days: '8–21 يوم' },
  severe:    { label: 'شديدة',        color: 'bg-orange-100 text-orange-700',days: '22–84 يوم' },
  very_severe:{ label: 'شديدة جداً', color: 'bg-red-100 text-red-700',     days: '+84 يوم' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:     { label: 'نشطة',           color: 'bg-red-100 text-red-700' },
  monitoring: { label: 'تحت المراقبة',   color: 'bg-amber-100 text-amber-700' },
  recovered:  { label: 'تعافٍ',          color: 'bg-emerald-100 text-emerald-700' },
}

const ILLNESS_TYPES = [
  { key: 'viral_respiratory', label: 'التهاب تنفسي فيروسي' },
  { key: 'flu',               label: 'إنفلونزا' },
  { key: 'gastroenteritis',   label: 'التهاب معدة وأمعاء' },
  { key: 'bacterial',         label: 'عدوى بكتيرية' },
  { key: 'fever',             label: 'حمى' },
  { key: 'heat_exhaustion',   label: 'ضربة حرارة / إجهاد حراري' },
  { key: 'fatigue_syndrome',  label: 'متلازمة الإجهاد' },
  { key: 'other',             label: 'أخرى' },
]

const CASE_NOTE_TYPES = [
  { key: 'comment',      label: 'تعليق عام' },
  { key: 'followup',     label: 'متابعة' },
  { key: 'prescription', label: 'وصفة دوائية' },
  { key: 'xray',         label: 'أشعة / MRI' },
  { key: 'therapy',      label: 'جلسات علاج' },
  { key: 'rehab',        label: 'خطة تأهيل' },
]

const STEP_LABELS = [
  'معلومات الإصابة',
  'تصنيف الإصابة',
  'الغياب والجاهزية',
  'التكرار والتنبيه',
  'المتابعة والمرفقات',
]

const INITIAL_INJURY = {
  player_id: '', injury_context: '', injury_mechanism: '', onset_date: '', notes: '',
  body_region: '', body_side: '', body_location: '', tissue_type: '', detailed_diagnosis: '',
  severity: 'moderate', status: 'active', absence_days: '', expected_return_date: '',
  practitioner_name: '', imaging_done: false, imaging_type: '', imaging_notes: '', rehab_plan: '',
}

const INITIAL_ILLNESS = {
  player_id: '', illness_type: '', onset_date: '', severity: 'mild',
  status: 'active', absence_days: '', expected_return_date: '', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
}

function FileIcon({ name }: { name: string }) {
  return name.toLowerCase().endsWith('.pdf')
    ? <FileText size={14} className="text-red-500 flex-shrink-0"/>
    : <Image size={14} className="text-blue-500 flex-shrink-0"/>
}

function labelOf(list: { key: string; label: string }[], key: string) {
  return list.find(x => x.key === key)?.label ?? key
}

function getTissueTypes(bodyRegion: string) {
  const keys = REGION_TISSUE_MAP[bodyRegion]
  if (!keys) return TISSUE_TYPES
  return keys.map(k => TISSUE_TYPES.find(t => t.key === k)).filter(Boolean) as typeof TISSUE_TYPES
}

function getDetailedDiagnoses(bodyRegion: string, tissueType: string) {
  return REGION_TISSUE_DIAGNOSES[bodyRegion]?.[tissueType] ?? DIAGNOSES[tissueType] ?? []
}

function getDiagnosisLabel(tissueType: string, diagKey: string, bodyRegion?: string) {
  if (bodyRegion) {
    const found = REGION_TISSUE_DIAGNOSES[bodyRegion]?.[tissueType]?.find(d => d.key === diagKey)
    if (found) return found.label
  }
  return DIAGNOSES[tissueType]?.find(d => d.key === diagKey)?.label ?? diagKey
}

function MiniBar({ label, count, max, color = 'bg-brand-500' }: { label: string; count: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-slate-600 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden min-w-0">
        <div className={color + ' h-2 rounded-full transition-all duration-300'} style={{ width: pct + '%' }}/>
      </div>
      <span className="w-5 text-right font-bold text-slate-700 flex-shrink-0">{count}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MedicalPage() {
  const { teamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlPlayer = searchParams.get('player') || ''
  const urlFrom   = searchParams.get('from')   || ''
  const urlTo     = searchParams.get('to')     || ''

  // List state
  const [cases, setCases]       = useState<any[]>([])
  const [oldReports, setOldReports] = useState<any[]>([])
  const [members, setMembers]   = useState<any[]>([])
  const [myRole, setMyRole]     = useState('')
  const [myPerms, setMyPerms]   = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState<any>(null)
  const [showOldReports, setShowOldReports] = useState(false)
  const [wellbeingRows, setWellbeingRows] = useState<any[]>([])
  const [wellbeingLoading, setWellbeingLoading] = useState(false)
  const [wellbeingFrom, setWellbeingFrom] = useState('')
  const [wellbeingTo, setWellbeingTo] = useState('')

  // Tabs & filters
  const [tab, setTab]             = useState('all')

  // Case detail
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const [caseNotes, setCaseNotes]           = useState<Record<string, any[]>>({})
  const [loadingNotes, setLoadingNotes]     = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null)

  // Note form
  const [noteText, setNoteText]           = useState('')
  const [noteType, setNoteType]           = useState('followup')
  const [noteAttach, setNoteAttach]       = useState<File | null>(null)
  const [noteAttachKey, setNoteAttachKey] = useState(0)
  const [noteAttachError, setNoteAttachError] = useState('')
  const [noteUploading, setNoteUploading] = useState(false)
  const [sendingNote, setSendingNote]     = useState(false)

  // Add case modal
  const [showAdd, setShowAdd]           = useState(false)
  const [caseType, setCaseType]         = useState<'injury' | 'illness'>('injury')
  const [step, setStep]                 = useState(1)
  const [injuryForm, setInjuryForm]     = useState({ ...INITIAL_INJURY })
  const [illnessForm, setIllnessForm]   = useState({ ...INITIAL_ILLNESS })
  const [recurrences, setRecurrences]   = useState<any[]>([])
  const [checkingRec, setCheckingRec]   = useState(false)
  const [saving, setSaving]             = useState(false)
  const [attachFile, setAttachFile]     = useState<File | null>(null)
  const [attachError, setAttachError]   = useState('')
  const [attachUploading, setAttachUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const setInj = (k: string, v: any) => setInjuryForm(p => ({ ...p, [k]: v }))
  const setIll = (k: string, v: any) => setIllnessForm(p => ({ ...p, [k]: v }))

  // Edit / delete state
  const [showEdit, setShowEdit]                   = useState(false)
  const [editingCase, setEditingCase]             = useState<any>(null)
  const [editForm, setEditForm]                   = useState<any>({})
  const [savingEdit, setSavingEdit]               = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId]               = useState<string | null>(null)
  const setEF = (k: string, v: any) => setEditForm((p: any) => ({ ...p, [k]: v }))

  // Roster / كشف state
  const [rosterSearch, setRosterSearch]           = useState('')
  const [rosterExpandedId, setRosterExpandedId]   = useState<string | null>(null)
  const [rosterSubTab, setRosterSubTab]           = useState<'players' | 'report'>('players')

  // ── Permissions ──────────────────────────────────────────────────────────

  const isAdminUser = canManageTeam(myRole)
  const isDoctor = myRole === 'medical'
    || hasPermission(myPerms, myRole, 'manage_medical' as any)
    || hasPermission(myPerms, myRole, 'view_medical' as any)
  const canWrite = isAdminUser || isDoctor
  const canViewTeamWellbeing = canWrite || ['head_coach', 'assistant_coach'].includes(myRole)

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!teamId || !user) return
    Promise.all([
      teamService.getMyRole(teamId, user.id),
      teamService.getMembers(teamId),
      permissionService.getUserPermissions(teamId, user.id),
    ]).then(async ([role, mems, perms]) => {
      const r = role || ''
      setMyRole(r)
      setMembers(mems.filter((x: any) => x.role === 'player'))
      setMyPerms(perms)
      const adm = canManageTeam(r)
      const doc = r === 'medical'
        || (perms as string[]).includes('manage_medical')
        || (perms as string[]).includes('view_medical')
      setLoading(true)
      try {
        const [caseData, repData, statsData, wellbeingData] = await Promise.all([
          adm || doc ? medicalService.getCases(teamId) : medicalService.getMyCases(teamId, user.id),
          adm || doc ? medicalService.getReports(teamId) : medicalService.getMyReports(teamId, user.id),
          medicalService.getCaseStats(teamId),
          (adm || doc || ['head_coach', 'assistant_coach'].includes(r)) ? medicalService.getTeamWellbeing(teamId) : Promise.resolve([]),
        ])
        setCases(caseData)
        setOldReports(repData)
        setStats(statsData)
        setWellbeingRows(wellbeingData)
      } catch { setCases([]); setOldReports([]) }
      setLoading(false)
    })
  }, [teamId, user])

  async function reload() {
    if (!teamId || !user) return
    try {
      const [caseData, statsData] = await Promise.all([
        isAdminUser || isDoctor
          ? medicalService.getCases(teamId)
          : medicalService.getMyCases(teamId, user.id),
        medicalService.getCaseStats(teamId),
      ])
      setCases(caseData)
      setStats(statsData)
    } catch {}
  }

  async function loadWellbeing() {
    if (!teamId || !canViewTeamWellbeing) return
    setWellbeingLoading(true)
    const rows = await medicalService.getTeamWellbeing(teamId, wellbeingFrom || undefined, wellbeingTo || undefined)
    setWellbeingRows(rows)
    setWellbeingLoading(false)
  }

  // ── Roster computed data ─────────────────────────────────────────────────

  const rosterStats = useMemo(() => {
    const map: Record<string, any> = {}
    cases.forEach(mc => {
      const pid = mc.player_id
      if (!map[pid]) {
        const mem = members.find((m: any) => m.user_id === pid)
        map[pid] = {
          playerId: pid,
          name: mc.player?.full_name || mem?.profile?.full_name || '—',
          avatar: mc.player?.avatar_url || mem?.profile?.avatar_url || null,
          cases: [] as any[],
          activeCases: 0,
          totalAbsenceDays: 0,
          recurrences: 0,
        }
      }
      const e = map[pid]
      e.cases.push(mc)
      e.totalAbsenceDays += mc.absence_days || 0
      if (mc.status === 'active' || mc.status === 'monitoring') e.activeCases++
      if (mc.is_recurrence) e.recurrences++
    })
    return (Object.values(map) as any[]).sort((a, b) =>
      b.activeCases !== a.activeCases
        ? b.activeCases - a.activeCases
        : b.cases.length - a.cases.length
    )
  }, [cases, members])

  const injuryAnalytics = useMemo(() => {
    const inj = cases.filter(c => c.case_type === 'injury')
    const countBy = (key: string) => inj.reduce((acc: Record<string, number>, c) => {
      const k = c[key] || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc
    }, {})
    const topN = (rec: Record<string, number>, n = 5) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n) as [string, number][]
    const maxVal = (arr: [string, number][]) => arr[0]?.[1] || 1
    const byContext   = topN(countBy('injury_context'))
    const byMechanism = topN(countBy('injury_mechanism'))
    const byRegion    = topN(countBy('body_region'), 6)
    const byTissue    = topN(countBy('tissue_type'), 6)
    return {
      total: inj.length,
      active: inj.filter(c => c.status === 'active' || c.status === 'monitoring').length,
      recovered: inj.filter(c => c.status === 'recovered').length,
      recurrences: inj.filter(c => c.is_recurrence).length,
      byContext, maxContext: maxVal(byContext),
      byMechanism, maxMechanism: maxVal(byMechanism),
      byRegion, maxRegion: maxVal(byRegion),
      byTissue, maxTissue: maxVal(byTissue),
    }
  }, [cases])

  const wellbeingDashboard = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const players = members.map((m: any) => {
      const entries = wellbeingRows
        .filter((e: any) => e.player_id === m.user_id)
        .sort((a: any, b: any) => String(b.entry_date).localeCompare(String(a.entry_date)))
      const todayEntry = entries.find((e: any) => e.entry_date === today)
      const latest = todayEntry || entries[0] || null
      const avgScore = entries.length
        ? Math.round(entries.reduce((s: number, e: any) => s + Number(e.readiness_score || 0), 0) / entries.length)
        : null
      const repeated: string[] = []
      const last3 = entries.slice(0, 3)
      if (last3.filter((e: any) => e.fatigue_level >= 4).length >= 2) repeated.push('إرهاق متكرر')
      if (last3.filter((e: any) => e.sleep_quality <= 2).length >= 2) repeated.push('نوم منخفض')
      if (last3.filter((e: any) => e.muscle_soreness >= 4).length >= 2) repeated.push('ألم عضلي متكرر')
      if (last3.filter((e: any) => e.stress_level >= 4).length >= 2) repeated.push('ضغط مرتفع')
      if (last3.length >= 3 && last3.every((e: any) => e.readiness_score < 72)) repeated.push('جاهزية منخفضة 3 قراءات')
      return {
        playerId: m.user_id,
        name: m.profile?.full_name || 'لاعب',
        avatar: m.profile?.avatar_url,
        latest,
        todayEntry,
        entries,
        avgScore,
        repeated,
      }
    })
    const withToday = players.filter(p => p.todayEntry)
    const red = withToday.filter(p => p.todayEntry?.status === 'red')
    const yellow = withToday.filter(p => p.todayEntry?.status === 'yellow')
    const green = withToday.filter(p => p.todayEntry?.status === 'green')
    const repeatedAlerts = players.filter(p => p.repeated.length > 0)
    const avgToday = withToday.length
      ? Math.round(withToday.reduce((s, p) => s + Number(p.todayEntry?.readiness_score || 0), 0) / withToday.length)
      : 0
    return {
      today,
      players,
      withToday,
      missing: players.filter(p => !p.todayEntry),
      red,
      yellow,
      green,
      repeatedAlerts,
      avgToday,
    }
  }, [members, wellbeingRows])

  // ── Case detail / notes ──────────────────────────────────────────────────

  async function expandCase(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setNoteText(''); setNoteAttach(null); setNoteAttachKey(k => k + 1); setNoteAttachError('')
    if (!caseNotes[id]) {
      setLoadingNotes(id)
      const data = await medicalService.getCaseNotes(id)
      setCaseNotes(prev => ({ ...prev, [id]: data }))
      setLoadingNotes(null)
    }
  }

  async function addNote(caseId: string) {
    if (!noteText.trim() || !user || !teamId) return
    setSendingNote(true); setNoteAttachError('')
    let attachment_url: string | null = null
    if (noteAttach) {
      setNoteUploading(true)
      const path = `${teamId}/notes/${Date.now()}_${sanitizeFileName(noteAttach.name)}`
      const { url, error } = await medicalService.uploadAttachment(noteAttach, path)
      setNoteUploading(false)
      if (error || !url) { setNoteAttachError('فشل رفع الملف: ' + (error || 'خطأ')); setSendingNote(false); return }
      attachment_url = url
    }
    await medicalService.addCaseNote({ case_id: caseId, team_id: teamId, author_id: user.id, note: noteText, note_type: noteType, attachment_url })
    const updated = await medicalService.getCaseNotes(caseId)
    setCaseNotes(prev => ({ ...prev, [caseId]: updated }))
    setNoteText(''); setNoteAttach(null); setNoteAttachKey(k => k + 1); setNoteAttachError('')
    setSendingNote(false)
  }

  async function updateStatus(caseId: string, status: string, mc: any) {
    setUpdatingStatus(caseId)
    const patch: any = { status }
    if (status === 'recovered') patch.actual_return_date = new Date().toISOString().slice(0, 10)
    await medicalService.updateCase(caseId, patch)
    if (user && teamId) {
      await medicalService.logAudit([{
        case_id: caseId, team_id: teamId, changed_by: user.id,
        field_name: 'status', old_value: mc.status, new_value: status,
      }])
      if (status === 'recovered') {
        await attendanceService.removeExcusedBySource('medical', caseId)
      }
    }
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, ...patch } : c))
    setUpdatingStatus(null)
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openAdd() {
    setCaseType('injury')
    setStep(1)
    setInjuryForm({ ...INITIAL_INJURY })
    setIllnessForm({ ...INITIAL_ILLNESS })
    setRecurrences([])
    setAttachFile(null)
    setAttachError('')
    if (fileRef.current) fileRef.current.value = ''
    setShowAdd(true)
  }

  function closeAdd() {
    setShowAdd(false)
  }

  function openEdit(mc: any) {
    setEditingCase(mc)
    setEditForm({
      status: mc.status,
      severity: mc.severity,
      onset_date: mc.onset_date || '',
      expected_return_date: mc.expected_return_date || '',
      actual_return_date: mc.actual_return_date || '',
      absence_days: mc.absence_days ?? 0,
      practitioner_name: mc.practitioner_name || '',
      imaging_done: mc.imaging_done || false,
      imaging_type: mc.imaging_type || '',
      imaging_notes: mc.imaging_notes || '',
      rehab_plan: mc.rehab_plan || '',
      notes: mc.notes || '',
    })
    setShowEdit(true)
  }

  async function saveEdit() {
    if (!editingCase || !user || !teamId) return
    setSavingEdit(true)
    const patch: any = {}
    const auditEntries: any[] = []
    const fields = ['status','severity','onset_date','expected_return_date','actual_return_date','absence_days',
                    'practitioner_name','imaging_done','imaging_type','imaging_notes','rehab_plan','notes']
    for (const f of fields) {
      const oldVal = String(editingCase[f] ?? '')
      const newVal = String(editForm[f] ?? '')
      if (oldVal !== newVal) {
        patch[f] = editForm[f] === '' ? null : editForm[f]
        auditEntries.push({ case_id: editingCase.id, team_id: teamId, changed_by: user.id,
          field_name: f, old_value: oldVal || null, new_value: newVal || null })
      }
    }
    if (Object.keys(patch).length > 0) {
      await medicalService.updateCase(editingCase.id, patch)
      if (auditEntries.length) await medicalService.logAudit(auditEntries)
      if (patch.status === 'recovered') {
        await attendanceService.removeExcusedBySource('medical', editingCase.id)
      }
      setCases(prev => prev.map(c => c.id === editingCase.id ? { ...c, ...patch } : c))
    }
    setShowEdit(false)
    setEditingCase(null)
    setSavingEdit(false)
  }

  async function handleDelete(caseId: string) {
    setDeletingId(caseId)
    await medicalService.deleteCase(caseId)
    setCases(prev => prev.filter(c => c.id !== caseId))
    if (expandedId === caseId) setExpandedId(null)
    setConfirmingDeleteId(null)
    setDeletingId(null)
  }

  async function nextStep() {
    if (step === 3) {
      // Auto-check recurrence when entering step 4
      const { body_region, body_side, detailed_diagnosis, player_id } = injuryForm
      const pid = player_id || user?.id || ''
      if (pid && body_region) {
        setCheckingRec(true)
        const hits = await medicalService.checkRecurrence(pid, body_region, body_side, detailed_diagnosis)
        setRecurrences(hits)
        if (hits.length > 0) setInj('is_recurrence', true)
        setCheckingRec(false)
      }
    }
    setStep(s => s + 1)
  }

  function prevStep() { setStep(s => s - 1) }

  async function saveInjury() {
    if (!teamId || !user) return
    setSaving(true); setAttachError('')

    let attachment_url: string | null = null
    if (attachFile) {
      setAttachUploading(true)
      const path = `${teamId}/${user.id}/${Date.now()}_${sanitizeFileName(attachFile.name)}`
      const { url, error } = await medicalService.uploadAttachment(attachFile, path)
      setAttachUploading(false)
      if (error || !url) { setAttachError('فشل رفع الملف: ' + (error || 'خطأ')); setSaving(false); return }
      attachment_url = url
    }

    const playerId = (isAdminUser || isDoctor) ? (injuryForm.player_id || user.id) : user.id
    const { data: newCase } = await medicalService.createCase({
      team_id: teamId,
      player_id: playerId,
      case_type: 'injury',
      injury_context: injuryForm.injury_context || null,
      injury_mechanism: injuryForm.injury_mechanism || null,
      onset_date: injuryForm.onset_date || null,
      notes: injuryForm.notes || null,
      body_region: injuryForm.body_region || null,
      body_side: injuryForm.body_side || null,
      body_location: injuryForm.body_location || null,
      tissue_type: injuryForm.tissue_type || null,
      detailed_diagnosis: injuryForm.detailed_diagnosis || null,
      severity: injuryForm.severity,
      status: injuryForm.status,
      absence_days: parseInt(injuryForm.absence_days as string) || 0,
      expected_return_date: injuryForm.expected_return_date || null,
      is_recurrence: recurrences.length > 0,
      practitioner_name: injuryForm.practitioner_name || null,
      imaging_done: injuryForm.imaging_done,
      imaging_type: injuryForm.imaging_type || null,
      imaging_notes: injuryForm.imaging_notes || null,
      rehab_plan: injuryForm.rehab_plan || null,
      attachment_url,
      submitted_by: user.id,
    })

    if (newCase && injuryForm.status === 'active' && injuryForm.onset_date) {
      const today = new Date().toISOString().slice(0, 10)
      const fromDate = injuryForm.onset_date > today ? injuryForm.onset_date : today
      const toDate = injuryForm.expected_return_date
        || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
      await attendanceService.applyExcusedAbsence({
        teamId, userIds: [playerId],
        fromDate, toDate,
        absenceType: 'injury', sourceType: 'medical',
        sourceId: newCase.id, reason: 'إصابة رياضية', markedBy: user.id,
      })
    }

    await reload()
    closeAdd()
    setSaving(false)
  }

  async function saveIllness() {
    if (!teamId || !user) return
    setSaving(true); setAttachError('')

    let attachment_url: string | null = null
    if (attachFile) {
      setAttachUploading(true)
      const path = `${teamId}/${user.id}/${Date.now()}_${sanitizeFileName(attachFile.name)}`
      const { url, error } = await medicalService.uploadAttachment(attachFile, path)
      setAttachUploading(false)
      if (error || !url) { setAttachError('فشل رفع الملف: ' + (error || 'خطأ')); setSaving(false); return }
      attachment_url = url
    }

    const playerId = (isAdminUser || isDoctor) ? (illnessForm.player_id || user.id) : user.id
    const { data: newCase } = await medicalService.createCase({
      team_id: teamId,
      player_id: playerId,
      case_type: 'illness',
      illness_type: illnessForm.illness_type || null,
      onset_date: illnessForm.onset_date || null,
      severity: illnessForm.severity,
      status: illnessForm.status,
      absence_days: parseInt(illnessForm.absence_days as string) || 0,
      expected_return_date: illnessForm.expected_return_date || null,
      notes: illnessForm.notes || null,
      attachment_url,
      submitted_by: user.id,
    })

    if (newCase && illnessForm.status === 'active' && illnessForm.onset_date) {
      const today = new Date().toISOString().slice(0, 10)
      const fromDate = illnessForm.onset_date > today ? illnessForm.onset_date : today
      const toDate = illnessForm.expected_return_date
        || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
      await attendanceService.applyExcusedAbsence({
        teamId, userIds: [playerId],
        fromDate, toDate,
        absenceType: 'other', sourceType: 'medical',
        sourceId: newCase.id, reason: 'مرض / وعكة صحية', markedBy: user.id,
      })
    }

    await reload()
    closeAdd()
    setSaving(false)
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const baseCases = (() => {
    let r = cases
    if (urlPlayer) r = r.filter(c => c.player_id === urlPlayer)
    if (urlFrom)   r = r.filter(c => (c.onset_date || c.created_at?.slice(0, 10) || '') >= urlFrom)
    if (urlTo)     r = r.filter(c => (c.onset_date || c.created_at?.slice(0, 10) || '') <= urlTo)
    return r
  })()

  const filtered = tab === 'all'
    ? baseCases
    : tab === 'injury' || tab === 'illness'
      ? baseCases.filter(c => c.case_type === tab)
      : baseCases.filter(c => c.status === tab)

  const tabCounts = {
    all:       baseCases.length,
    injury:    baseCases.filter(c => c.case_type === 'injury').length,
    illness:   baseCases.filter(c => c.case_type === 'illness').length,
    active:    baseCases.filter(c => c.status === 'active').length,
    monitoring:baseCases.filter(c => c.status === 'monitoring').length,
    recovered: baseCases.filter(c => c.status === 'recovered').length,
  }

  const filteredPlayerName = urlPlayer
    ? (members.find((m: any) => m.user_id === urlPlayer)?.profile?.full_name || '...')
    : ''

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="الحالات الطبية"
        action={
          canWrite
            ? <button className="btn btn-primary btn-sm" onClick={openAdd}>
                <Plus size={13}/> إضافة حالة
              </button>
            : undefined
        }
      />

      {/* URL filter banner */}
      {(urlPlayer || urlFrom || urlTo) && (
        <div className="flex items-center gap-2 mb-3 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5 text-xs text-brand-700">
          <Filter size={13} className="flex-shrink-0"/>
          <span className="flex-1">
            <strong>فلتر: </strong>
            {filteredPlayerName && <span>اللاعب: <strong>{filteredPlayerName}</strong> </span>}
            {urlFrom && <span>· من: <strong>{urlFrom}</strong> </span>}
            {urlTo && <span>· إلى: <strong>{urlTo}</strong></span>}
          </span>
          <button onClick={() => setSearchParams({})}
            className="flex-shrink-0 text-brand-500 hover:text-brand-700 font-bold border-none bg-transparent cursor-pointer">
            ✕ إزالة الفلتر
          </button>
        </div>
      )}

      {!canWrite && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex gap-2 text-xs text-blue-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
          <span>يمكنك الاطلاع على حالاتك الطبية. تواصل مع الطاقم الطبي لأي مستجدات.</span>
        </div>
      )}

      {/* Stats cards — admin/doctor only */}
      {stats && (isAdminUser || isDoctor) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <Activity size={18} className="text-red-600"/>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{stats.active + stats.monitoring}</div>
              <div className="text-xs text-slate-500">حالات نشطة</div>
            </div>
          </div>
          <div className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Stethoscope size={18} className="text-orange-600"/>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{stats.injuries}</div>
              <div className="text-xs text-slate-500">إصابة رياضية</div>
            </div>
          </div>
          <div className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <RotateCcw size={18} className="text-blue-600"/>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{stats.recurrences}</div>
              <div className="text-xs text-slate-500">إصابة متكررة</div>
            </div>
          </div>
          <div className="card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={18} className="text-emerald-600"/>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{stats.recoveredThisMonth}</div>
              <div className="text-xs text-slate-500">تعافوا هذا الشهر</div>
            </div>
          </div>
        </div>
      )}

      <Tabs tabs={[
        { key: 'all',        label: `الكل (${tabCounts.all})` },
        { key: 'injury',     label: `🦴 إصابة (${tabCounts.injury})` },
        { key: 'illness',    label: `🤒 مرض (${tabCounts.illness})` },
        { key: 'active',     label: `🔴 نشط (${tabCounts.active})` },
        { key: 'monitoring', label: `🟡 مراقبة (${tabCounts.monitoring})` },
        { key: 'recovered',  label: `🟢 تعافٍ (${tabCounts.recovered})` },
        ...(canViewTeamWellbeing ? [{ key: 'wellbeing', label: `جاهزية الفريق (${wellbeingDashboard.red.length + wellbeingDashboard.yellow.length})` }] : []),
        ...(canWrite ? [{ key: 'roster', label: '📋 كشف' }] : []),
      ]} active={tab} onChange={t => { setTab(t); if (t !== 'roster') { setRosterSearch(''); setRosterExpandedId(null) } else { setRosterSubTab('players') } }}/>

      {/* ── Roster / كشف ─────────────────────────────────────────────────── */}
      {tab === 'wellbeing' && canViewTeamWellbeing && (
        <div className="mt-3 space-y-4">
          <div className="card">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
              <div>
                <h3 className="font-extrabold text-slate-800">جاهزية الفريق والرفاهية</h3>
                <p className="text-xs text-slate-400 mt-1">قراءة موجزة لجاهزية اللاعبين اليوم مع تنبيهات التكرار خلال الفترة المحددة.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <FormField label="من تاريخ">
                  <input className="form-input text-xs" type="date" value={wellbeingFrom} onChange={e => setWellbeingFrom(e.target.value)}/>
                </FormField>
                <FormField label="إلى تاريخ">
                  <input className="form-input text-xs" type="date" value={wellbeingTo} onChange={e => setWellbeingTo(e.target.value)}/>
                </FormField>
                <button className="btn btn-primary btn-sm self-end" onClick={loadWellbeing} disabled={wellbeingLoading}>
                  {wellbeingLoading ? <Spinner size="sm"/> : 'تطبيق'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="card p-3 bg-slate-900 text-white"><div className="text-2xl font-extrabold">{wellbeingDashboard.avgToday}%</div><div className="text-xs opacity-75 mt-1">متوسط جاهزية اليوم</div></div>
            <div className="card p-3 bg-emerald-50 text-emerald-700 border-emerald-100"><div className="text-2xl font-extrabold">{wellbeingDashboard.green.length}</div><div className="text-xs font-bold opacity-75 mt-1">جاهز</div></div>
            <div className="card p-3 bg-amber-50 text-amber-700 border-amber-100"><div className="text-2xl font-extrabold">{wellbeingDashboard.yellow.length}</div><div className="text-xs font-bold opacity-75 mt-1">يحتاج متابعة</div></div>
            <div className="card p-3 bg-red-50 text-red-700 border-red-100"><div className="text-2xl font-extrabold">{wellbeingDashboard.red.length}</div><div className="text-xs font-bold opacity-75 mt-1">غير جاهز</div></div>
            <div className="card p-3 bg-blue-50 text-blue-700 border-blue-100"><div className="text-2xl font-extrabold">{wellbeingDashboard.withToday.length}/{members.length}</div><div className="text-xs font-bold opacity-75 mt-1">أدخلوا قراءة اليوم</div></div>
          </div>

          {(wellbeingDashboard.red.length > 0 || wellbeingDashboard.repeatedAlerts.length > 0) && (
            <div className="grid lg:grid-cols-2 gap-3">
              <div className="card border-r-4 border-red-500">
                <div className="flex items-center gap-2 text-sm font-extrabold text-red-700 mb-2"><AlertCircle size={16}/> يحتاجون انتباه اليوم</div>
                {wellbeingDashboard.red.length === 0 ? <p className="text-xs text-slate-400">لا توجد قراءات حمراء اليوم.</p> : (
                  <div className="space-y-2">
                    {wellbeingDashboard.red.map(p => (
                      <div key={p.playerId} className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                        <div className="font-bold text-sm text-red-700">{p.name} - {p.latest?.readiness_score}%</div>
                        <div className="text-xs text-red-600 mt-0.5">{[p.latest?.pain_area && `منطقة ألم: ${p.latest.pain_area}`, p.latest?.notes].filter(Boolean).join(' - ') || 'راجع مؤشرات النوم/الإرهاق/الألم'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card border-r-4 border-amber-500">
                <div className="flex items-center gap-2 text-sm font-extrabold text-amber-700 mb-2"><RotateCcw size={16}/> تنبيهات تكرار المؤشرات</div>
                {wellbeingDashboard.repeatedAlerts.length === 0 ? <p className="text-xs text-slate-400">لا توجد مؤشرات متكررة في الفترة الحالية.</p> : (
                  <div className="space-y-2">
                    {wellbeingDashboard.repeatedAlerts.slice(0, 8).map(p => (
                      <div key={p.playerId} className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                        <div className="font-bold text-sm text-amber-800">{p.name}</div>
                        <div className="text-xs text-amber-700 mt-0.5">{p.repeated.join('، ')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div><div className="font-extrabold text-sm text-slate-800">جدول جاهزية اللاعبين</div><div className="text-[11px] text-slate-400 mt-0.5">آخر قراءة داخل الفترة، مع تمييز قراءة اليوم والتنبيهات المتكررة.</div></div>
              {wellbeingLoading && <Spinner size="sm"/>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead><tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-right py-2 px-3">اللاعب</th><th className="text-right py-2">آخر تاريخ</th><th className="text-right py-2">الحالة</th><th className="text-right py-2">الجاهزية</th><th className="text-right py-2">النوم</th><th className="text-right py-2">الإرهاق</th><th className="text-right py-2">الألم</th><th className="text-right py-2">الضغط</th><th className="text-right py-2">تكرار</th><th className="text-right py-2 px-3">ملاحظة</th>
                </tr></thead>
                <tbody>
                  {wellbeingDashboard.players.map(p => {
                    const latest = p.latest
                    const statusClass = latest?.status === 'red' ? 'bg-red-50 text-red-700' : latest?.status === 'yellow' ? 'bg-amber-50 text-amber-700' : latest?.status === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    return (
                      <tr key={p.playerId} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-bold text-slate-800">{p.name}</td>
                        <td className="py-2 text-slate-500">{latest ? latest.entry_date : 'لا يوجد'}</td>
                        <td className="py-2"><span className={`rounded-lg px-2 py-0.5 font-bold ${statusClass}`}>{latest ? latest.status === 'red' ? 'غير جاهز' : latest.status === 'yellow' ? 'متابعة' : 'جاهز' : 'لم يدخل'}</span></td>
                        <td className="py-2 font-extrabold text-slate-800">{latest ? `${latest.readiness_score}%` : '—'}</td>
                        <td className="py-2">{latest ? `${latest.sleep_quality}/5` : '—'}</td>
                        <td className="py-2">{latest ? `${latest.fatigue_level}/5` : '—'}</td>
                        <td className="py-2">{latest ? `${latest.muscle_soreness}/5` : '—'}</td>
                        <td className="py-2">{latest ? `${latest.stress_level}/5` : '—'}</td>
                        <td className="py-2 max-w-[180px]">{p.repeated.length ? <span className="text-amber-700 font-bold">{p.repeated.join('، ')}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="py-2 px-3 max-w-[240px] truncate text-slate-500">{latest ? ([latest.pain_area && `ألم: ${latest.pain_area}`, latest.notes].filter(Boolean).join(' - ') || '—') : 'لم يتم إدخال قراءة في الفترة'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'roster' && canWrite && (
        <div className="mt-3">
          {/* Sub-tabs */}
          <div className="flex gap-2 mb-4">
            {(['players', 'report'] as const).map(st => (
              <button key={st} onClick={() => setRosterSubTab(st)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${rosterSubTab === st ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                {st === 'players' ? '👥 قائمة اللاعبين' : '📊 تقرير الإصابات'}
              </button>
            ))}
          </div>

          {/* ── Players sub-tab ─────────────── */}
          {rosterSubTab === 'players' && (
            <>
              <input className="form-input mb-3 text-sm" placeholder="🔍 ابحث باسم اللاعب..."
                value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}/>

              {loading ? (
                <div className="flex justify-center py-10"><Spinner/></div>
              ) : rosterStats.filter((p: any) => !rosterSearch || p.name.includes(rosterSearch)).length === 0 ? (
                <div className="card"><EmptyState icon={<Stethoscope size={24}/>} title="لا توجد بيانات طبية للاعبين"/></div>
              ) : (
                <div className="space-y-2">
                  {rosterStats
                    .filter((p: any) => !rosterSearch || p.name.includes(rosterSearch))
                    .map((p: any) => {
                      const isExp = rosterExpandedId === p.playerId
                      const activeCase = p.cases.find((c: any) => c.status === 'active')
                      const monitoringCase = p.cases.find((c: any) => c.status === 'monitoring')
                      const statusDot = activeCase
                        ? { color: 'bg-red-500', label: 'إصابة نشطة' }
                        : monitoringCase
                          ? { color: 'bg-amber-400', label: 'تحت المراقبة' }
                          : { color: 'bg-emerald-500', label: 'بصحة جيدة' }

                      return (
                        <div key={p.playerId} className="card mb-0 p-0 overflow-hidden">
                          <div className="p-3 flex items-center gap-3">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden">
                              {p.avatar
                                ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover"/>
                                : p.name?.[0] || '?'}
                            </div>

                            {/* Name + status */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-sm text-slate-800 truncate">{p.name}</span>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot.color}`}/>
                                <span className="text-xs text-slate-500">{statusDot.label}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                                <span>🩹 {p.cases.length} حالة</span>
                                {p.totalAbsenceDays > 0 && <span>📅 {p.totalAbsenceDays} يوم غياب</span>}
                                {p.recurrences > 0 && (
                                  <span className="text-purple-600 font-bold">
                                    <RotateCcw size={10} className="inline ml-0.5"/> {p.recurrences} متكررة
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => { setSearchParams({ player: p.playerId }); setTab('all') }}
                                className="text-xs text-brand-600 font-bold border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-1 hover:bg-brand-100 border-none cursor-pointer whitespace-nowrap">
                                المزيد
                              </button>
                              <button onClick={() => setRosterExpandedId(isExp ? null : p.playerId)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 border-none cursor-pointer flex-shrink-0">
                                {isExp ? <ChevronUp size={14} className="text-slate-500"/> : <ChevronDown size={14} className="text-slate-500"/>}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: player's cases */}
                          {isExp && (
                            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2.5 space-y-1.5">
                              {p.cases.map((mc: any) => {
                                const stC = STATUS_CONFIG[mc.status as keyof typeof STATUS_CONFIG]
                                const svC = SEVERITY_CONFIG[mc.severity as keyof typeof SEVERITY_CONFIG]
                                return (
                                  <div key={mc.id} className="flex items-start gap-2 bg-white rounded-xl p-2.5 border border-slate-100">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                                        <span className={`badge text-xs ${mc.case_type === 'injury' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                          {mc.case_type === 'injury' ? '🦴' : '🤒'}
                                        </span>
                                        <span className={`badge text-xs ${stC?.color}`}>{stC?.label}</span>
                                        {svC && <span className={`badge text-xs ${svC.color}`}>{svC.label}</span>}
                                        {mc.is_recurrence && (
                                          <span className="badge text-xs bg-purple-100 text-purple-700 flex items-center gap-0.5">
                                            <RotateCcw size={9}/> متكررة
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs font-bold text-slate-700">
                                        {mc.case_type === 'injury'
                                          ? [labelOf(BODY_REGIONS, mc.body_region), mc.body_side && mc.body_side !== 'central' ? labelOf(BODY_SIDES, mc.body_side) : ''].filter(Boolean).join(' · ')
                                          : (mc.illness_type ? labelOf(ILLNESS_TYPES, mc.illness_type) : 'مرض')}
                                      </div>
                                      {mc.onset_date && <div className="text-xs text-slate-400 mt-0.5">📅 {mc.onset_date}{mc.absence_days > 0 ? ` · ${mc.absence_days} يوم` : ''}</div>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </>
          )}

          {/* ── Report sub-tab ──────────────── */}
          {rosterSubTab === 'report' && (
            <div>
              {injuryAnalytics.total === 0 ? (
                <div className="card"><EmptyState icon={<Activity size={24}/>} title="لا توجد إصابات مسجلة بعد"/></div>
              ) : (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-slate-800">{injuryAnalytics.total}</div>
                      <div className="text-xs text-slate-500 mt-0.5">إجمالي الإصابات</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-red-600">{injuryAnalytics.active}</div>
                      <div className="text-xs text-slate-500 mt-0.5">إصابات نشطة</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-600">{injuryAnalytics.recovered}</div>
                      <div className="text-xs text-slate-500 mt-0.5">تعافوا بالكامل</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-purple-600">{injuryAnalytics.recurrences}</div>
                      <div className="text-xs text-slate-500 mt-0.5">إصابة متكررة</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* By context */}
                    <div className="card p-4">
                      <div className="text-xs font-bold text-slate-600 mb-3">📍 ظرف الإصابة</div>
                      <div className="space-y-2">
                        {injuryAnalytics.byContext.map(([k, v]: [string, number]) => (
                          <MiniBar key={k} label={labelOf(INJURY_CONTEXTS, k)} count={v} max={injuryAnalytics.maxContext} color="bg-brand-400"/>
                        ))}
                      </div>
                    </div>

                    {/* By mechanism */}
                    <div className="card p-4">
                      <div className="text-xs font-bold text-slate-600 mb-3">⚡ آلية الإصابة</div>
                      <div className="space-y-2">
                        {injuryAnalytics.byMechanism.map(([k, v]: [string, number]) => (
                          <MiniBar key={k} label={labelOf(INJURY_MECHANISMS, k)} count={v} max={injuryAnalytics.maxMechanism} color="bg-orange-400"/>
                        ))}
                      </div>
                    </div>

                    {/* By body region */}
                    <div className="card p-4">
                      <div className="text-xs font-bold text-slate-600 mb-3">🦴 أكثر مناطق الجسم إصابةً</div>
                      <div className="space-y-2">
                        {injuryAnalytics.byRegion.map(([k, v]: [string, number]) => (
                          <MiniBar key={k} label={labelOf(BODY_REGIONS, k)} count={v} max={injuryAnalytics.maxRegion} color="bg-red-400"/>
                        ))}
                      </div>
                    </div>

                    {/* By tissue / injury type */}
                    <div className="card p-4">
                      <div className="text-xs font-bold text-slate-600 mb-3">🔬 نوع الإصابة الأكثر شيوعاً</div>
                      <div className="space-y-2">
                        {injuryAnalytics.byTissue.map(([k, v]: [string, number]) => (
                          <MiniBar key={k} label={labelOf(TISSUE_TYPES, k)} count={v} max={injuryAnalytics.maxTissue} color="bg-blue-400"/>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Cases list (non-roster tabs) ────────────────────────────────────── */}
      {tab !== 'roster' && tab !== 'wellbeing' && loading ? (
        <div className="flex justify-center py-12"><Spinner/></div>
      ) : tab !== 'roster' && tab !== 'wellbeing' && filtered.length === 0 ? (
        <div className="card mt-3"><EmptyState icon={<Stethoscope size={28}/>} title="لا توجد حالات طبية"/></div>
      ) : tab !== 'roster' && tab !== 'wellbeing' ? (
        <div className="space-y-3 mt-3">
          {filtered.map(mc => {
            const stConf = STATUS_CONFIG[mc.status as keyof typeof STATUS_CONFIG]
            const svConf = SEVERITY_CONFIG[mc.severity as keyof typeof SEVERITY_CONFIG]
            const isExp  = expandedId === mc.id
            const notes  = caseNotes[mc.id] || []

            return (
              <div key={mc.id} className="card mb-0 p-0 overflow-hidden">
                {/* Card header */}
                <button className="w-full text-right p-4 border-none bg-transparent cursor-pointer"
                  onClick={() => expandCase(mc.id)}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={`badge text-xs ${mc.case_type === 'injury' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {mc.case_type === 'injury' ? '🦴 إصابة' : '🤒 مرض'}
                        </span>
                        <span className={`badge text-xs ${stConf?.color}`}>{stConf?.label}</span>
                        {svConf && <span className={`badge text-xs ${svConf.color}`}>{svConf.label}</span>}
                        {mc.is_recurrence && (
                          <span className="badge text-xs bg-purple-100 text-purple-700 flex items-center gap-0.5">
                            <RotateCcw size={9}/> متكررة
                          </span>
                        )}
                        {(isDoctor || isAdminUser) && mc.player?.full_name && (
                          <span className="text-xs text-slate-500">👤 {mc.player.full_name}</span>
                        )}
                      </div>

                      {/* Injury classification or illness type */}
                      {mc.case_type === 'injury' ? (
                        <div>
                          {mc.body_region && (
                            <div className="font-bold text-sm text-slate-800">
                              {labelOf(BODY_REGIONS, mc.body_region)}
                              {mc.body_side && mc.body_side !== 'central' && (
                                <span className="font-normal text-slate-500"> · {labelOf(BODY_SIDES, mc.body_side)}</span>
                              )}
                              {mc.body_location && (
                                <span className="font-normal text-slate-500">
                                  {' '}&rsaquo; {BODY_LOCATIONS[mc.body_region]?.find(x => x.key === mc.body_location)?.label || mc.body_location}
                                </span>
                              )}
                            </div>
                          )}
                          {mc.tissue_type && (
                            <div className="text-xs text-slate-600 mt-0.5">
                              {labelOf(TISSUE_TYPES, mc.tissue_type)}
                              {mc.detailed_diagnosis && (
                                <span className="text-slate-500">
                                  {' '}— {getDiagnosisLabel(mc.tissue_type, mc.detailed_diagnosis, mc.body_region)}
                                </span>
                              )}
                            </div>
                          )}
                          {mc.injury_context && (
                            <div className="text-xs text-slate-400 mt-0.5">{labelOf(INJURY_CONTEXTS, mc.injury_context)}</div>
                          )}
                        </div>
                      ) : (
                        <div className="font-bold text-sm text-slate-800">
                          {mc.illness_type ? labelOf(ILLNESS_TYPES, mc.illness_type) : 'مرض / وعكة صحية'}
                        </div>
                      )}

                      {/* Notes text */}
                      {mc.notes && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{mc.notes}</div>
                      )}

                      {/* Dates and absence */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                        {mc.onset_date && <span>📅 {mc.onset_date}</span>}
                        {mc.expected_return_date && !mc.actual_return_date && (
                          <span>🗓️ عودة متوقعة: {mc.expected_return_date}</span>
                        )}
                        {mc.actual_return_date && (
                          <span className="text-emerald-600">✅ عاد: {mc.actual_return_date}</span>
                        )}
                        {mc.absence_days > 0 && (
                          <span className="bg-slate-100 rounded-lg px-1.5 py-0.5 font-bold text-slate-600">{mc.absence_days} يوم غياب</span>
                        )}
                        {notes.length > 0 && <span>💬 {notes.length} متابعة</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {mc.attachment_url && (
                        <button onClick={e => { e.stopPropagation(); setPreviewUrl(mc.attachment_url) }}
                          className="text-brand-500 hover:text-brand-700 border-none bg-transparent cursor-pointer p-0.5">
                          <Paperclip size={15}/>
                        </button>
                      )}
                      {canWrite && confirmingDeleteId === mc.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleDelete(mc.id)}
                            disabled={deletingId === mc.id}
                            className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-lg font-bold border-none cursor-pointer disabled:opacity-50">
                            {deletingId === mc.id ? '...' : 'تأكيد'}
                          </button>
                          <button onClick={() => setConfirmingDeleteId(null)}
                            className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-lg font-bold border-none cursor-pointer">
                            إلغاء
                          </button>
                        </div>
                      ) : canWrite && (
                        <>
                          <button onClick={e => { e.stopPropagation(); openEdit(mc) }}
                            className="text-slate-400 hover:text-brand-500 border-none bg-transparent cursor-pointer p-0.5">
                            <Pencil size={14}/>
                          </button>
                          <button onClick={e => { e.stopPropagation(); setConfirmingDeleteId(mc.id) }}
                            className="text-slate-400 hover:text-red-500 border-none bg-transparent cursor-pointer p-0.5">
                            <Trash2 size={14}/>
                          </button>
                        </>
                      )}
                      {isExp ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExp && (
                  <div className="border-t border-slate-100">
                    {/* Full details block */}
                    {mc.case_type === 'injury' && (mc.injury_mechanism || mc.practitioner_name || mc.rehab_plan || mc.imaging_done) && (
                      <div className="px-4 py-3 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                        {mc.injury_mechanism && <div><span className="font-bold">آلية الإصابة: </span>{labelOf(INJURY_MECHANISMS, mc.injury_mechanism)}</div>}
                        {mc.practitioner_name && <div><span className="font-bold">الطبيب/المعالج: </span>{mc.practitioner_name}</div>}
                        {mc.imaging_done && <div><span className="font-bold">تصوير: </span>{mc.imaging_type || 'نعم'}{mc.imaging_notes && ` — ${mc.imaging_notes}`}</div>}
                        {mc.rehab_plan && <div className="sm:col-span-2"><span className="font-bold">خطة التأهيل: </span>{mc.rehab_plan}</div>}
                      </div>
                    )}

                    {/* Status update */}
                    {canWrite && (
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">تحديث الحالة:</span>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button key={key}
                            disabled={mc.status === key || updatingStatus === mc.id}
                            onClick={() => updateStatus(mc.id, key, mc)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${mc.status === key ? cfg.color + ' border-transparent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            {updatingStatus === mc.id ? <Spinner size="sm"/> : cfg.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Notes thread */}
                    <div className="px-4 py-3 space-y-3">
                      {loadingNotes === mc.id ? (
                        <div className="flex justify-center py-4"><Spinner/></div>
                      ) : notes.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-2">لا توجد متابعات بعد</p>
                      ) : (
                        notes.map((n: any) => {
                          const ntConf = CASE_NOTE_TYPES.find(t => t.key === n.note_type)
                          return (
                            <div key={n.id} className="flex gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {n.author?.full_name?.[0] || '?'}
                              </div>
                              <div className="flex-1 bg-slate-50 rounded-xl p-2.5">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-slate-700">{n.author?.full_name}</span>
                                  {ntConf && <span className="badge bg-brand-50 text-brand-700 text-xs">{ntConf.label}</span>}
                                  <span className="text-xs text-slate-400 mr-auto">{new Date(n.created_at).toLocaleDateString('ar-SA')}</span>
                                </div>
                                <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
                                {n.attachment_url && (
                                  <button onClick={() => setPreviewUrl(n.attachment_url)}
                                    className="inline-flex items-center gap-1 text-xs text-brand-600 mt-1.5 hover:bg-brand-100 bg-brand-50 rounded-lg px-2 py-1 border-none cursor-pointer">
                                    <Paperclip size={11}/> عرض المرفق
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}

                      {/* Add note form — canWrite (doctor/admin) OR player on own case */}
                      {(canWrite || user?.id === mc.player_id) && (
                        <div className="border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {(canWrite ? CASE_NOTE_TYPES : CASE_NOTE_TYPES.filter(t => t.key === 'comment')).map(t => (
                              <button key={t.key} onClick={() => setNoteType(t.key)}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${noteType === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {noteAttach && (
                            <div className="flex items-center gap-2 mb-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                              <FileIcon name={noteAttach.name}/>
                              <span className="text-xs text-brand-700 font-bold flex-1 truncate">{noteAttach.name}</span>
                              <button onClick={() => { setNoteAttach(null); setNoteAttachKey(k => k + 1); setNoteAttachError('') }}
                                className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer flex-shrink-0">
                                <X size={13}/>
                              </button>
                            </div>
                          )}
                          {noteAttachError && (
                            <div className="flex items-center gap-2 mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                              <AlertCircle size={12} className="flex-shrink-0"/>{noteAttachError}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)}
                              placeholder="اكتب متابعة أو ملاحظة..."
                              className="form-input flex-1 resize-none text-xs"/>
                            <div className="flex flex-col gap-1">
                              <label className={`cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg transition-colors border-none ${noteAttach ? 'bg-brand-100' : 'bg-slate-100 hover:bg-slate-200'}`}>
                                {noteUploading ? <Spinner size="sm"/> : <Paperclip size={14} className={noteAttach ? 'text-brand-600' : 'text-slate-500'}/>}
                                <input key={noteAttachKey} type="file" className="hidden" accept="image/*,.pdf"
                                  onChange={e => { setNoteAttach(e.target.files?.[0] || null); setNoteAttachError('') }}/>
                              </label>
                              <button onClick={() => addNote(mc.id)}
                                disabled={sendingNote || !noteText.trim() || noteUploading}
                                className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white hover:bg-brand-600 border-none cursor-pointer disabled:opacity-50">
                                {sendingNote ? <Spinner size="sm"/> : <Send size={13}/>}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Old reports section */}
      {oldReports.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowOldReports(v => !v)}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 border-none bg-transparent cursor-pointer mb-2">
            {showOldReports ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            التقارير الطبية السابقة ({oldReports.length})
          </button>
          {showOldReports && (
            <div className="space-y-2">
              {oldReports.map((r: any) => (
                <div key={r.id} className="card p-3 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="badge text-xs bg-slate-100 text-slate-600">{r.report_type}</span>
                      <span className={`badge text-xs ${STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG]?.color || ''}`}>
                        {STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG]?.label || r.status}
                      </span>
                      {(isDoctor || isAdminUser) && r.player?.full_name && (
                        <span className="text-xs text-slate-500">👤 {r.player.full_name}</span>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-700">{r.title}</div>
                    {r.description && <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{r.description}</div>}
                    {r.injury_date && <div className="text-xs text-slate-400 mt-0.5">📅 {r.injury_date}</div>}
                  </div>
                  {r.attachment_url && (
                    <button onClick={() => setPreviewUrl(r.attachment_url)}
                      className="text-brand-500 hover:text-brand-700 border-none bg-transparent cursor-pointer p-0.5 flex-shrink-0">
                      <Paperclip size={15}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add Case Modal ─────────────────────────────────────────────── */}
      <Modal open={showAdd} onClose={closeAdd}
        title={caseType === 'injury'
          ? `🦴 إصابة رياضية — الخطوة ${step} من 5: ${STEP_LABELS[step - 1]}`
          : '🤒 مرض / وعكة صحية'}
        width="max-w-lg">

        {/* Case type selector — only on step 1 */}
        {(caseType === 'illness' || step === 1) && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setCaseType('injury'); setStep(1) }}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${caseType === 'injury' ? 'bg-orange-500 text-white border-orange-500' : 'border-slate-200 hover:bg-slate-50'}`}>
              🦴 إصابة رياضية
            </button>
            <button onClick={() => setCaseType('illness')}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${caseType === 'illness' ? 'bg-blue-500 text-white border-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}>
              🤒 مرض / وعكة
            </button>
          </div>
        )}

        {/* ── Illness form (single step) ─────────── */}
        {caseType === 'illness' && (
          <>
            {(isAdminUser || isDoctor) && members.length > 0 && (
              <FormField label="اللاعب">
                <select className="form-input" value={illnessForm.player_id} onChange={e => setIll('player_id', e.target.value)}>
                  <option value="">— اختر لاعباً (أو اتركه فارغاً لنفسك) —</option>
                  {members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="نوع المرض" required>
              <select className="form-input" value={illnessForm.illness_type} onChange={e => setIll('illness_type', e.target.value)}>
                <option value="">— اختر —</option>
                {ILLNESS_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="تاريخ البدء" required>
                <input className="form-input" type="date" value={illnessForm.onset_date} onChange={e => setIll('onset_date', e.target.value)}/>
              </FormField>
              <FormField label="العودة المتوقعة">
                <input className="form-input" type="date" value={illnessForm.expected_return_date} onChange={e => setIll('expected_return_date', e.target.value)}/>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="الشدة">
                <select className="form-input" value={illnessForm.severity} onChange={e => setIll('severity', e.target.value)}>
                  {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormField>
              <FormField label="أيام الغياب">
                <input className="form-input" type="number" min="0" value={illnessForm.absence_days}
                  onChange={e => setIll('absence_days', e.target.value)} placeholder="0"/>
              </FormField>
            </div>
            <FormField label="الحالة">
              <div className="flex gap-2">
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <button key={k} onClick={() => setIll('status', k)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${illnessForm.status === k ? v.color + ' border-transparent' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="ملاحظات">
              <textarea className="form-input" rows={2} value={illnessForm.notes}
                onChange={e => setIll('notes', e.target.value)} placeholder="وصف الحالة أو ملاحظات إضافية..."/>
            </FormField>
            <FormField label="إرفاق صورة أو تقرير (اختياري)">
              {attachFile ? (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                  <FileIcon name={attachFile.name}/>
                  <span className="text-xs text-brand-700 font-bold flex-1 truncate">{attachFile.name}</span>
                  <button onClick={() => { setAttachFile(null); setAttachError(''); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer"><X size={13}/></button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30">
                  <Paperclip size={15} className="text-slate-400"/>
                  <span className="text-xs text-slate-500">اضغط لاختيار ملف (صورة أو PDF)</span>
                  <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf"
                    onChange={e => { setAttachFile(e.target.files?.[0] || null); setAttachError('') }}/>
                </label>
              )}
              {attachError && <div className="flex items-center gap-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700"><AlertCircle size={12}/>{attachError}</div>}
              {attachUploading && <div className="flex items-center gap-2 mt-2 text-xs text-brand-600"><Spinner size="sm"/> جارٍ الرفع...</div>}
            </FormField>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={closeAdd}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveIllness} disabled={saving || attachUploading || !illnessForm.illness_type || !illnessForm.onset_date}>
                {saving ? <Spinner size="sm"/> : 'حفظ الحالة'}
              </button>
            </div>
          </>
        )}

        {/* ── Injury form (5 steps) ──────────────── */}
        {caseType === 'injury' && (
          <>
            {/* Step indicators */}
            <div className="flex items-center gap-1 mb-5">
              {STEP_LABELS.map((_, i) => (
                <React.Fragment key={i}>
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                    i + 1 < step ? 'bg-brand-500 text-white' :
                    i + 1 === step ? 'bg-brand-600 text-white ring-2 ring-brand-200' :
                    'bg-slate-200 text-slate-400'
                  }`}>{i + 1 < step ? '✓' : i + 1}</div>
                  {i < 4 && <div className={`flex-1 h-0.5 transition-all ${i + 1 < step ? 'bg-brand-500' : 'bg-slate-200'}`}/>}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: معلومات الإصابة */}
            {step === 1 && (
              <>
                {(isAdminUser || isDoctor) && members.length > 0 && (
                  <FormField label="اللاعب">
                    <select className="form-input" value={injuryForm.player_id} onChange={e => setInj('player_id', e.target.value)}>
                      <option value="">— اختر لاعباً (أو اتركه فارغاً لنفسك) —</option>
                      {members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name}</option>)}
                    </select>
                  </FormField>
                )}
                <FormField label="تاريخ الإصابة" required>
                  <input className="form-input" type="date" value={injuryForm.onset_date}
                    onChange={e => setInj('onset_date', e.target.value)}/>
                </FormField>
                <FormField label="ظرف الإصابة">
                  <div className="grid grid-cols-2 gap-1.5">
                    {INJURY_CONTEXTS.map(c => (
                      <button key={c.key} onClick={() => setInj('injury_context', injuryForm.injury_context === c.key ? '' : c.key)}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${injuryForm.injury_context === c.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                <FormField label="آلية الإصابة">
                  <div className="grid grid-cols-2 gap-1.5">
                    {INJURY_MECHANISMS.map(m => (
                      <button key={m.key} onClick={() => setInj('injury_mechanism', injuryForm.injury_mechanism === m.key ? '' : m.key)}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${injuryForm.injury_mechanism === m.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                <FormField label="ملاحظات أولية">
                  <textarea className="form-input" rows={2} value={injuryForm.notes}
                    onChange={e => setInj('notes', e.target.value)} placeholder="وصف مبدئي للإصابة..."/>
                </FormField>
              </>
            )}

            {/* Step 2: تصنيف الإصابة */}
            {step === 2 && (
              <>
                <FormField label="منطقة الجسم" required>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                    {BODY_REGIONS.map(r => (
                      <button key={r.key} onClick={() => { setInj('body_region', r.key); setInj('body_location', ''); setInj('tissue_type', ''); setInj('detailed_diagnosis', '') }}
                        className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all text-right ${injuryForm.body_region === r.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                {injuryForm.body_region && (
                  <FormField label="الموقع التفصيلي">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(BODY_LOCATIONS[injuryForm.body_region] || []).map(l => (
                        <button key={l.key} onClick={() => setInj('body_location', injuryForm.body_location === l.key ? '' : l.key)}
                          className={`py-1.5 px-2 rounded-xl border text-xs font-bold transition-all text-right ${injuryForm.body_location === l.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </FormField>
                )}
                <FormField label="الجانب">
                  <div className="grid grid-cols-2 gap-1.5">
                    {BODY_SIDES.map(s => (
                      <button key={s.key} onClick={() => setInj('body_side', injuryForm.body_side === s.key ? '' : s.key)}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${injuryForm.body_side === s.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                <FormField label="نوع الإصابة" required>
                  <div className="grid grid-cols-2 gap-1.5">
                    {getTissueTypes(injuryForm.body_region).map(t => (
                      <button key={t.key} onClick={() => { setInj('tissue_type', t.key); setInj('detailed_diagnosis', '') }}
                        className={`py-2 rounded-xl border text-xs font-bold transition-all ${injuryForm.tissue_type === t.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                {injuryForm.tissue_type && (
                  <FormField label="التشخيص التفصيلي" required>
                    <div className="space-y-1">
                      {getDetailedDiagnoses(injuryForm.body_region, injuryForm.tissue_type).map(d => (
                        <button key={d.key} onClick={() => setInj('detailed_diagnosis', injuryForm.detailed_diagnosis === d.key ? '' : d.key)}
                          className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all text-right ${injuryForm.detailed_diagnosis === d.key ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </FormField>
                )}
              </>
            )}

            {/* Step 3: الغياب والجاهزية */}
            {step === 3 && (
              <>
                <FormField label="شدة الإصابة" required>
                  <div className="space-y-1.5">
                    {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                      <button key={k} onClick={() => setInj('severity', k)}
                        className={`w-full flex items-center justify-between py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${injuryForm.severity === k ? v.color + ' border-transparent' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <span>{v.label}</span>
                        <span className="font-normal text-slate-500">{v.days}</span>
                      </button>
                    ))}
                  </div>
                </FormField>
                <FormField label="الحالة الحالية">
                  <div className="flex gap-2">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <button key={k} onClick={() => setInj('status', k)}
                        className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${injuryForm.status === k ? v.color + ' border-transparent' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="أيام الغياب المقدرة">
                    <input className="form-input" type="number" min="0" value={injuryForm.absence_days}
                      onChange={e => setInj('absence_days', e.target.value)} placeholder="0"/>
                  </FormField>
                  <FormField label="تاريخ العودة المتوقع">
                    <input className="form-input" type="date" value={injuryForm.expected_return_date}
                      onChange={e => setInj('expected_return_date', e.target.value)}/>
                  </FormField>
                </div>
              </>
            )}

            {/* Step 4: التكرار والتنبيه */}
            {step === 4 && (
              <>
                {checkingRec ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Spinner size="sm"/> جارٍ فحص السجل الطبي...
                  </div>
                ) : recurrences.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <ShieldAlert size={20} className="text-purple-600 flex-shrink-0 mt-0.5"/>
                      <div>
                        <div className="font-bold text-sm text-purple-800 mb-1">تنبيه: إصابة متكررة</div>
                        <p className="text-xs text-purple-700">
                          توجد إصابة سابقة مشابهة لهذا اللاعب في نفس المنطقة والجهة.
                          قد تكون هذه إصابة متكررة.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-600 mb-1">الإصابات السابقة المشابهة:</div>
                      {recurrences.map((r: any) => (
                        <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-700">
                              {labelOf(BODY_REGIONS, r.body_region)}
                              {r.body_side && <span className="font-normal text-slate-500"> · {labelOf(BODY_SIDES, r.body_side)}</span>}
                            </span>
                            <span className={`badge text-xs ${STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG]?.color}`}>
                              {STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG]?.label}
                            </span>
                          </div>
                          {r.detailed_diagnosis && r.tissue_type && (
                            <div className="text-slate-500 mt-0.5">
                              {DIAGNOSES[r.tissue_type]?.find((x: any) => x.key === r.detailed_diagnosis)?.label || r.detailed_diagnosis}
                            </div>
                          )}
                          {r.onset_date && <div className="text-slate-400 mt-0.5">📅 {r.onset_date}</div>}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">سيتم تسجيل هذه الإصابة تلقائياً كإصابة متكررة.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle size={28} className="text-emerald-600"/>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-700">لا توجد إصابات سابقة مشابهة</div>
                      <div className="text-xs text-slate-500 mt-0.5">هذه أول إصابة مسجلة في هذه المنطقة لهذا اللاعب.</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 5: المتابعة والمرفقات */}
            {step === 5 && (
              <>
                <FormField label="اسم الطبيب / المعالج">
                  <input className="form-input" value={injuryForm.practitioner_name}
                    onChange={e => setInj('practitioner_name', e.target.value)}
                    placeholder="د. محمد الأحمد..."/>
                </FormField>
                <FormField label="التصوير الطبي">
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={injuryForm.imaging_done}
                        onChange={e => setInj('imaging_done', e.target.checked)}
                        className="rounded border-slate-300"/>
                      <span className="text-sm">تم إجراء تصوير طبي</span>
                    </label>
                  </div>
                  {injuryForm.imaging_done && (
                    <div className="grid grid-cols-2 gap-2">
                      <input className="form-input text-sm" value={injuryForm.imaging_type}
                        onChange={e => setInj('imaging_type', e.target.value)}
                        placeholder="أشعة سينية / MRI / سونار..."/>
                      <input className="form-input text-sm" value={injuryForm.imaging_notes}
                        onChange={e => setInj('imaging_notes', e.target.value)}
                        placeholder="نتيجة التصوير..."/>
                    </div>
                  )}
                </FormField>
                <FormField label="خطة التأهيل">
                  <textarea className="form-input" rows={3} value={injuryForm.rehab_plan}
                    onChange={e => setInj('rehab_plan', e.target.value)}
                    placeholder="تمارين التأهيل، الجلسات، التعليمات..."/>
                </FormField>
                <FormField label="إرفاق صورة أو تقرير (اختياري)">
                  {attachFile ? (
                    <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                      <FileIcon name={attachFile.name}/>
                      <span className="text-xs text-brand-700 font-bold flex-1 truncate">{attachFile.name}</span>
                      <button onClick={() => { setAttachFile(null); setAttachError(''); if (fileRef.current) fileRef.current.value = '' }}
                        className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer"><X size={13}/></button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30">
                      <Paperclip size={15} className="text-slate-400"/>
                      <span className="text-xs text-slate-500">اضغط لاختيار ملف (صورة أو PDF)</span>
                      <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf"
                        onChange={e => { setAttachFile(e.target.files?.[0] || null); setAttachError('') }}/>
                    </label>
                  )}
                  {attachError && <div className="flex items-center gap-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700"><AlertCircle size={12}/>{attachError}</div>}
                  {attachUploading && <div className="flex items-center gap-2 mt-2 text-xs text-brand-600"><Spinner size="sm"/> جارٍ الرفع...</div>}
                </FormField>
              </>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-2 justify-between mt-5 pt-4 border-t border-slate-100">
              <button className="btn btn-ghost flex items-center gap-1" onClick={step === 1 ? closeAdd : prevStep}>
                {step === 1 ? 'إلغاء' : <><ChevronRight size={14}/> السابق</>}
              </button>
              {step < 5 ? (
                <button className="btn btn-primary flex items-center gap-1"
                  onClick={nextStep}
                  disabled={
                    (step === 1 && !injuryForm.onset_date) ||
                    (step === 2 && (!injuryForm.body_region || !injuryForm.tissue_type || !injuryForm.detailed_diagnosis)) ||
                    checkingRec
                  }>
                  التالي <ChevronLeft size={14}/>
                </button>
              ) : (
                <button className="btn btn-primary" onClick={saveInjury} disabled={saving || attachUploading}>
                  {saving ? <Spinner size="sm"/> : 'حفظ الحالة'}
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ── Edit Case Modal ───────────────────────────────────────── */}
      <Modal open={showEdit} onClose={() => { setShowEdit(false); setEditingCase(null) }}
        title="تعديل الحالة الطبية" width="max-w-lg">
        {editingCase && (
          <>
            <div className="mb-3">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">الحالة</label>
              <div className="flex gap-1.5">
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <button key={k} onClick={() => setEF('status', k)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${editForm.status === k ? (v as any).color + ' border-transparent' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {(v as any).label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="الشدة">
                <select className="form-input" value={editForm.severity} onChange={e => setEF('severity', e.target.value)}>
                  {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{(v as any).label}</option>)}
                </select>
              </FormField>
              <FormField label="أيام الغياب">
                <input className="form-input" type="number" min="0" value={editForm.absence_days}
                  onChange={e => setEF('absence_days', parseInt(e.target.value) || 0)}/>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="تاريخ البدء">
                <input className="form-input" type="date" value={editForm.onset_date}
                  onChange={e => setEF('onset_date', e.target.value)}/>
              </FormField>
              <FormField label="العودة المتوقعة">
                <input className="form-input" type="date" value={editForm.expected_return_date}
                  onChange={e => setEF('expected_return_date', e.target.value)}/>
              </FormField>
            </div>
            <FormField label="تاريخ العودة الفعلية">
              <input className="form-input" type="date" value={editForm.actual_return_date}
                onChange={e => setEF('actual_return_date', e.target.value)}/>
            </FormField>
            {editingCase.case_type === 'injury' && (
              <>
                <FormField label="الطبيب / المعالج">
                  <input className="form-input" value={editForm.practitioner_name}
                    onChange={e => setEF('practitioner_name', e.target.value)}
                    placeholder="اسم الطبيب أو المعالج الرياضي"/>
                </FormField>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" id="edit_imaging_done" checked={editForm.imaging_done}
                    onChange={e => setEF('imaging_done', e.target.checked)} className="w-4 h-4 rounded"/>
                  <label htmlFor="edit_imaging_done" className="text-xs font-bold text-slate-700 cursor-pointer">تم التصوير الطبي</label>
                </div>
                {editForm.imaging_done && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <FormField label="نوع التصوير">
                      <input className="form-input" value={editForm.imaging_type}
                        onChange={e => setEF('imaging_type', e.target.value)}
                        placeholder="X-Ray / MRI / CT..."/>
                    </FormField>
                    <FormField label="ملاحظات التصوير">
                      <input className="form-input" value={editForm.imaging_notes}
                        onChange={e => setEF('imaging_notes', e.target.value)}/>
                    </FormField>
                  </div>
                )}
                <FormField label="خطة التأهيل">
                  <textarea className="form-input" rows={2} value={editForm.rehab_plan}
                    onChange={e => setEF('rehab_plan', e.target.value)}
                    placeholder="وصف خطة التأهيل والتمارين..."/>
                </FormField>
              </>
            )}
            <FormField label="ملاحظات">
              <textarea className="form-input" rows={2} value={editForm.notes}
                onChange={e => setEF('notes', e.target.value)}
                placeholder="ملاحظات إضافية..."/>
            </FormField>
            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-ghost" onClick={() => { setShowEdit(false); setEditingCase(null) }}>إلغاء</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? <Spinner size="sm"/> : 'حفظ التعديلات'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Attachment Preview Modal ─────────────────────────────── */}
      {previewUrl && (() => {
        const isPdf = previewUrl.toLowerCase().includes('.pdf') || previewUrl.toLowerCase().includes('application/pdf')
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setPreviewUrl(null)}>
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden"
              style={{ maxWidth: '92vw', maxHeight: '92vh', width: isPdf ? '800px' : 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  {isPdf ? <FileText size={15} className="text-red-500"/> : <Image size={15} className="text-blue-500"/>}
                  {isPdf ? 'مستند PDF' : 'صورة المرفق'}
                </span>
                <div className="flex items-center gap-2">
                  <a href={previewUrl} download target="_blank" rel="noreferrer"
                    className="text-xs text-brand-600 hover:text-brand-800 font-bold border border-brand-200 bg-brand-50 rounded-lg px-2.5 py-1 no-underline">
                    تنزيل
                  </a>
                  <button onClick={() => setPreviewUrl(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-500 border-none cursor-pointer font-bold">
                    ✕
                  </button>
                </div>
              </div>
              {isPdf ? (
                <iframe src={previewUrl} title="PDF" style={{ width: '800px', maxWidth: '92vw', height: '80vh' }} className="block border-0"/>
              ) : (
                <div className="flex items-center justify-center p-3 bg-slate-900">
                  <img src={previewUrl} alt="مرفق"
                    style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain' }}
                    className="rounded-xl block"/>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
