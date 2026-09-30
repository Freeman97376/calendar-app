import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PersonalAISettings from '../../../src/components/settings/PersonalAISettings'
import { useAuthStore } from '../../../src/store/authStore'
import { useConfigStore } from '../../../src/store/configStore'
import { server } from '../support/mocks/server'

const empty = {
  success: true,
  editable: true,
  personalKeyConfigured: false,
  keyConfigured: false,
  source: 'none',
  baseUrl: 'https://api.deepseek.com',
  routineModel: 'deepseek-chat',
  planningModel: 'deepseek-reasoner',
}
const saved = { ...empty, personalKeyConfigured: true, keyConfigured: true, source: 'personal' }

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({
    mode: 'server',
    status: 'authenticated',
    user: { id: 'alice', username: 'alice', role: 'user' },
  })
  useConfigStore.setState((state) => ({
    config: { ...state.config, language: 'en' },
    aiRuntime: { ...state.aiRuntime, keyConfigured: false },
  }))
  server.use(http.get('http://localhost/api/ai/settings', () => HttpResponse.json(empty)))
})
afterEach(cleanup)

async function open() {
  const user = userEvent.setup()
  const view = render(<PersonalAISettings userId="alice" />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save API settings' })).toBeEnabled(),
  )
  return { user, ...view }
}

describe('personal AI settings', () => {
  it('keeps a failed draft for retry, then clears the key without storing it in the browser', async () => {
    let calls = 0
    server.use(
      http.patch('http://localhost/api/ai/settings', async ({ request }) => {
        const body = await request.json()
        expect(body).toMatchObject({ apiKey: 'synthetic-private-key' })
        calls += 1
        return calls === 1
          ? HttpResponse.json(
              { error: { code: 'temporary', message: 'Try again' } },
              { status: 503 },
            )
          : HttpResponse.json(saved)
      }),
    )
    const { user } = await open()
    await user.type(screen.getByLabelText('API Key'), 'synthetic-private-key')
    await user.click(screen.getByRole('button', { name: 'Save API settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm')
    expect(screen.getByLabelText('API Key')).toHaveValue('synthetic-private-key')
    await user.click(screen.getByRole('button', { name: 'Save API settings' }))
    expect(await screen.findByText('Settings saved. Connection has not been tested.')).toBeVisible()
    expect(screen.getByLabelText('API Key')).toHaveValue('')
    expect(JSON.stringify(localStorage)).not.toContain('synthetic-private-key')
    expect(useConfigStore.getState().config.aiApiKey).not.toBe('synthetic-private-key')
    expect(calls).toBe(2)
  })

  it('never fills an existing secret and requires confirmation before removing it', async () => {
    let deletes = 0
    server.use(
      http.get('http://localhost/api/ai/settings', () => HttpResponse.json(saved)),
      http.delete('http://localhost/api/ai/settings', () => {
        deletes += 1
        return HttpResponse.json(empty)
      }),
    )
    const { user } = await open()
    expect(screen.getByLabelText('API Key')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Remove personal key' }))
    expect(deletes).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('Personal key removed.')).toBeVisible()
    expect(deletes).toBe(1)
    expect(screen.queryByRole('button', { name: 'Remove personal key' })).not.toBeInTheDocument()
  })

  it('serializes saves and ignores a response arriving after an account switch', async () => {
    let release!: () => void
    let calls = 0
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('http://localhost/api/ai/settings', async () => {
        calls += 1
        await gate
        return HttpResponse.json(saved)
      }),
    )
    const { user, rerender } = await open()
    await user.type(screen.getByLabelText('API Key'), 'synthetic-alice-key')
    await user.dblClick(screen.getByRole('button', { name: 'Save API settings' }))
    await waitFor(() => expect(calls).toBe(1))
    act(() => {
      useAuthStore.setState({ user: { id: 'bob', username: 'bob', role: 'user' } })
    })
    rerender(<PersonalAISettings key="bob" userId="bob" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save API settings' })).toBeEnabled(),
    )
    await act(async () => {
      release()
      await gate
    })
    expect(screen.getByLabelText('API Key')).toHaveValue('')
    expect(
      screen.queryByText('Settings saved. Connection has not been tested.'),
    ).not.toBeInTheDocument()
    expect(useConfigStore.getState().aiRuntime.keyConfigured).toBe(false)
  })

  it('rejects an empty new key without submitting and provides a labelled error', async () => {
    let calls = 0
    server.use(
      http.patch('http://localhost/api/ai/settings', () => {
        calls += 1
        return HttpResponse.json(saved)
      }),
    )
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Save API settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an API key')
    expect(screen.getByLabelText('API Key')).toHaveFocus()
    expect(calls).toBe(0)
  })
})
