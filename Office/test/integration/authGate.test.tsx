import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from '../../../src/App'
import { useAuthStore } from '../../../src/store/authStore'

describe('server authentication gate', () => {
  it('switches the pre-auth language without exposing a registration action', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      authRequired: true,
      mode: 'server',
      status: 'unauthenticated',
      user: null,
    })

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Language'), 'zh')
    expect(screen.getByRole('heading', { name: '\u767b\u5f55' })).toBeInTheDocument()
    expect(screen.getByLabelText('\u7528\u6237\u540d')).toBeInTheDocument()
    expect(screen.getByLabelText('\u5bc6\u7801')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('\u8bed\u8a00'), 'en')
  })
})
