import type { Category } from '../data/types'
import './icons.css'
import { icons, soundIconName } from './soundIcons'

interface SoundIconProps {
  soundId: string
  category?: Category
  className?: string
}

/**
 * 장식용 아이콘 — 항상 aria-hidden이다. 접근 가능한 이름은 이 아이콘을 감싸는
 * 오브/칩 버튼의 aria-label이 책임진다(visual-theme-v2.md §1.4).
 */
export function SoundIcon({ soundId, category, className }: SoundIconProps) {
  return (
    <span
      className={className ? `so-icon ${className}` : 'so-icon'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[soundIconName(soundId, category)] }}
    />
  )
}
