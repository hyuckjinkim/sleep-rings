import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SoundIcon, soundIconName } from './SoundIcon'

describe('soundIconName', () => {
  it('prefers a sound-specific icon when one exists', () => {
    // noise-*/binaural-*는 카테고리 색을 공유하므로 반드시 개별 아이콘으로 잡혀야 한다.
    expect(soundIconName('noise-brown', 'noise')).toBe('noise-brown')
    expect(soundIconName('binaural-alpha', 'binaural')).toBe('binaural-alpha')
  })

  it('falls back to the category icon when the sound has none', () => {
    expect(soundIconName('nature-wind', 'nature')).toBe('wind')
    expect(soundIconName('seaside', 'ocean')).toBe('waves')
    expect(soundIconName('night-stream', 'water')).toBe('stream')
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
