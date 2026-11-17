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

  it('shows both languages in settings, switches, and remembers the choice', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }))
    expect(screen.getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('so.lang')).toBe('en')
    expect(document.documentElement.lang).toBe('en')

    fireEvent.click(screen.getByRole('button', { name: '한국어' })) // restore for later tests
  })
})
