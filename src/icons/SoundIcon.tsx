import type { Category } from '../data/types'
import './icons.css'

// ponytail: assets/sound-icons/*.svg 원본을 Vite ?raw로 그대로 읽어 인라인한다. svgr 같은
// 플러그인도, SVG→TSX 코드젠 단계도 없다 — SVG 파일이 유일한 진실 소스로 남고 디자이너가
// 파일만 고치면 반영된다. 대신 dangerouslySetInnerHTML을 쓰는데, 입력이 100% 빌드타임에
// 번들된 로컬 정적 자산이라 사용자 입력이 끼어들 경로가 없다.
const files = import.meta.glob('../../assets/sound-icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const icons: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path.slice(path.lastIndexOf('/') + 1, -4),
    svg,
  ]),
)

/** 카테고리별 대표 아이콘. 개별 사운드 전용 아이콘이 없을 때의 2순위 폴백이며,
 *  파일명을 그대로 가리킨다(예: nature → wind.svg). */
const CATEGORY_ICON: Record<Category, string> = {
  water: 'stream',
  rain: 'rain',
  ocean: 'waves',
  nature: 'wind',
  animals: 'birds',
  whispers: 'whispers',
  asmr: 'asmr',
  music: 'music',
  binaural: 'binaural-theta',
  lucid: 'lucid',
  noise: 'noise-white',
  ambient: 'ambient',
  camping: 'campfire',
}

const FALLBACK = 'sound'

/**
 * soundId 전용 아이콘 → 카테고리 대표 아이콘 → 범용 아이콘 순으로 해결한다.
 * catalog.ts를 import하지 않으므로 카탈로그가 늘어나도 이 파일은 손댈 일이 없다 —
 * 신규 사운드는 assets/sound-icons/<id>.svg를 추가하기만 하면 1순위로 잡힌다.
 */
export function soundIconName(soundId: string, category?: Category): string {
  if (icons[soundId]) return soundId
  if (category && icons[CATEGORY_ICON[category]]) return CATEGORY_ICON[category]
  return FALLBACK
}

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
