import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import LoginPage from '../../../src/components/auth/LoginPage'
import { server } from '../support/mocks/server'

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
    expect(
      screen.queryByRole('button', { name: /Create account|注册账号/ }),
    ).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('\u8bed\u8a00'), 'en')
  })
})

function enableRegistration() {
  useAuthStore.setState({
    authRequired: true,
    capabilities: { ...useAuthStore.getState().capabilities!, registration: true },
    mode: 'server',
    status: 'unauthenticated',
    user: null,
  })
}

async function fillRegistration(confirm = 'synthetic-password-123') {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  await user.type(screen.getByLabelText(/Username/), 'new-user')
  await user.type(screen.getByLabelText(/^Password/), 'synthetic-password-123')
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.type(screen.getByLabelText('Invitation code'), 'shared-synthetic-code')
  return user
}

describe('invitation registration', () => {
  it('creates an account, clears secrets and returns to sign in without authenticating', async () => {
    enableRegistration()
    const received = vi.fn()
    server.use(
      http.post('http://localhost/api/auth/register', async ({ request }) => {
        received(await request.json())
        return HttpResponse.json(
          { success: true, user: { id: 'new-id', username: 'new-user', role: 'user' } },
          { status: 201 },
        )
      }),
    )
    render(<LoginPage />)
    const user = await fillRegistration()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Account created.')
    expect(received).toHaveBeenCalledExactlyOnceWith({
      username: 'new-user',
      password: 'synthetic-password-123',
      inviteCode: 'shared-synthetic-code',
    })
    expect(screen.getByLabelText('Username')).toHaveValue('new-user')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().user).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByLabelText('Invitation code')).toHaveValue('')
    expect(screen.getByLabelText('Confirm password')).toHaveValue('')
  })

  it('rejects mismatched confirmation before sending a request', async () => {
    enableRegistration()
    const received = vi.fn()
    server.use(
      http.post('http://localhost/api/auth/register', () => {
        received()
        return HttpResponse.json({}, { status: 500 })
      }),
    )
    render(<LoginPage />)
    const user = await fillRegistration('different-password-123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByLabelText(/Confirm password/)).toHaveAttribute('aria-invalid', 'true')
    expect(received).not.toHaveBeenCalled()
  })

  it('shows invalid-code errors in Chinese and leaves the form ready to retry', async () => {
    enableRegistration()
    server.use(
      http.post('http://localhost/api/auth/register', () =>
        HttpResponse.json(
          { error: { code: 'invalid_invite_code', message: 'Invalid code' } },
          { status: 403 },
        ),
      ),
    )
    render(<LoginPage />)
    const user = await fillRegistration()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation code is invalid.')
    expect(screen.getByLabelText(/Invitation code/)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
    await user.selectOptions(screen.getByLabelText('Language'), 'zh')
    expect(screen.getByRole('alert')).toHaveTextContent('邀请码无效')
    await user.selectOptions(screen.getByLabelText('语言'), 'en')
  })

  it('honors the server retry countdown and prevents duplicate submits', async () => {
    enableRegistration()
    let finish: (() => void) | undefined
    const received = vi.fn()
    server.use(
      http.post('http://localhost/api/auth/register', async () => {
        received()
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        return HttpResponse.json(
          { error: { code: 'register_rate_limited', message: 'Limited', retryAfterSeconds: 60 } },
          { status: 429 },
        )
      }),
    )
    render(<LoginPage />)
    const user = await fillRegistration()
    await user.dblClick(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(received).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeDisabled()
    finish?.()
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many registration attempts.')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  it('never offers registration while restoring an existing account session', () => {
    enableRegistration()
    useAuthStore.setState({
      status: 'reauth-required',
      user: { id: 'alice', username: 'alice', role: 'user' },
    })
    render(<LoginPage overlay />)
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })
})
