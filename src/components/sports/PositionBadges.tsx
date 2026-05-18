import React from 'react'

export const PLAYER_POSITIONS = [
  'حارس مرمى',
  'ظهير أيمن',
  'ظهير أيسر',
  'قلب دفاع',
  'ليبرو',
  'محور دفاعي',
  'محور',
  'وسط أيمن',
  'وسط أيسر',
  'وسط هجومي',
  'صانع لعب',
  'جناح أيمن',
  'جناح أيسر',
  'مهاجم ثاني',
  'مهاجم',
  'رأس حربة',
]

export function getPrimaryPosition(member: any): string {
  return member?.primary_position || member?.position_label || ''
}

export function getSecondaryPositions(member: any): string[] {
  const primary = getPrimaryPosition(member)
  const raw = member?.secondary_positions ?? member?.secondary_position ?? []
  const positions = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.replace(/^\{|\}$/g, '').split(',').map(p => p.trim()).filter(Boolean)
      : []
  return positions.filter((p: string) => p && p !== primary).slice(0, 3)
}

export function PositionBadges({
  member,
  compact = false,
  primaryOnly = false,
}: {
  member: any
  compact?: boolean
  primaryOnly?: boolean
}) {
  const primary = getPrimaryPosition(member)
  const secondary = primaryOnly ? [] : getSecondaryPositions(member)
  if (!primary && secondary.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {primary && (
        <span className={`${compact ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} rounded-lg bg-brand-500 text-white font-extrabold`}>
          أساسي: {primary}
        </span>
      )}
      {secondary.map(pos => (
        <span key={pos} className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'} rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold`}>
          ثانوي: {pos}
        </span>
      ))}
    </div>
  )
}
