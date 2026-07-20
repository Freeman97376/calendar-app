import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/App'
import {
  RuntimeConfigService,
  BackendConfigApiService,
} from '../../src/services/config/runtimeConfigService'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
import { configureConfigServices, useConfigStore } from '../../src/store/configStore'
import { configureEventTypeService, useEventTypeStore } from '../../src/store/eventTypeStore'
import {
  configureLongTermMemoryClient,
  type LongTermMemoryClientContract,
} from '../../src/store/longTermMemoryStore'
import { useUIStore } from '../../src/store/uiStore'

function backendStatusResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      deepseek: {
        configured: false,
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      },
      fridge: {
        data_dir: 'test-fridge-data',
      },
    }),
    {
      headers: { 'content-type': 'application/json' },
      status: 200,
    },
  )
}

describe('Tools panel', () => {
  beforeEach(() => {
    localStorage.clear()
    configureConfigServices(
      new RuntimeConfigService(localStorage, 'test_tools_runtime_config'),
      new BackendConfigApiService(
        () => 'http://test.local',
        vi.fn(async () => backendStatusResponse()),
      ),
    )
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_tools_event_types'))
    configureLongTermMemoryClient({
      listGoals: vi.fn(async () => []),
      listProjects: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract)
    useConfigStore.getState().reset()
    useEventTypeStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('opens Tool Templates from the workspace navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    expect(screen.getByRole('heading', { name: 'Tool Templates' })).toBeInTheDocument()
  })

  it('closes back to the workspace home from the panel header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tool Templates' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('heading', { name: 'Tool Templates' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('opens Settings from the workspace navigation', async () => {
    const user = userEvent.setup()
    render(<App />)
    const settingsShortcut = screen.getByRole('button', { name: 'Settings' })

    await user.click(settingsShortcut)
    expect(screen.getByText('Frontend Runtime')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Frontend Runtime')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument()
  })
})
