import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import '../i18n'

afterEach(cleanup)

describe('App', () => {
  it('renders the mixer screen by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'SleepRings' })).toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
  })

  it('opens the settings screen from the header button and returns to the mixer on close', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
    expect(document.querySelector('.mixer-field')).toBeInTheDocument()
  })

  it('toggles language from within the settings screen', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: '한국어' })).toBeInTheDocument()
  })
})
