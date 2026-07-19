import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../../src/App'
import { useAuthStore } from '../../src/store/authStore'

describe('server authentication gate', () => {
  it('shows the bilingual login form without a registration action', () => {
    useAuthStore.setState({
      authRequired: true,
      mode: 'server',
      status: 'unauthenticated',
      user: null,
    })

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Sign in / 登录' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username / 账号')).toBeInTheDocument()
    expect(screen.getByLabelText('Password / 密码')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
