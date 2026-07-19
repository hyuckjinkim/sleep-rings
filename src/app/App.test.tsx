import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import '../i18n'

describe('App', () => {
  it('renders the default-language title and toggles to the other language', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Sleep Mixer' })).toBeInTheDocument()
    expect(screen.getByText('야간 사운드 믹서')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByText('Night sound mixer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '한국어' })).toBeInTheDocument()
  })
})
