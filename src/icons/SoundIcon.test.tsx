import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SoundIcon } from './SoundIcon'
import { catalog } from '../library/catalog'
import { soundIconName } from './soundIcons'

describe('soundIconName', () => {
  it('prefers a sound-specific icon when one exists', () => {
    // noise-*/binaural-*는 카테고리 색을 공유하므로 반드시 개별 아이콘으로 잡혀야 한다.
    expect(soundIconName('noise-brown', 'noise')).toBe('noise-brown')
    expect(soundIconName('binaural-alpha', 'binaural')).toBe('binaural-alpha')
  })

  it('falls back to the category icon when the sound has none', () => {
    expect(soundIconName('nature-wind', 'nature')).toBe('wind')
    expect(soundIconName('womb', 'asmr')).toBe('asmr')
  })

  it('gives every sound in a category a different icon', () => {
    // 같은 카테고리는 색이 같으므로 아이콘이 유일한 구분 수단이다.
    for (const category of new Set(catalog.map((s) => s.category))) {
      const names = catalog.filter((s) => s.category === category).map((s) => soundIconName(s.id, s.category))
      expect(new Set(names).size, `${category}: ${names.join(', ')}`).toBe(names.length)
    }
  })

  it('falls back to the generic icon for an unknown sound with no category', () => {
    expect(soundIconName('not-a-real-sound')).toBe('sound')
  })
})

describe('SoundIcon', () => {
  it('renders an svg and stays hidden from assistive tech', () => {
    const { container } = render(<SoundIcon soundId="rain" category="rain" />)
    const wrapper = container.querySelector('.so-icon')

    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    expect(wrapper?.querySelector('svg')).toBeInTheDocument()
  })
})
