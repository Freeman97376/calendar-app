import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../../src/App'

describe('App', () => {
  it('renders the calendar app shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /calendar app/i })).toBeInTheDocument()
  })
})
