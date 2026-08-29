import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../../src/App'
import { RuntimeConfigService } from '../../../src/services/config/runtimeConfigService'
import { configureConfigServices, useConfigStore } from '../../../src/store/configStore'
import { useUIStore } from '../../../src/store/uiStore'

describe('Workspace layout', () => {
  beforeEach(() => {
    localStorage.clear()
    configureConfigServices(new RuntimeConfigService(localStorage, 'test_workspace_layout_config'))
    useConfigStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('renders the default left workspace panel with a 20 percent size', () => {
    render(<App />)

    const shell = screen.getByTestId('calendar-workspace-shell')
    expect(shell).toHaveAttribute('data-layout-position', 'left')
    expect(shell).toHaveStyle('--workspace-panel-size: 20%')
    expect(screen.getByTestId('calendar-main-area')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tool Templates' })).toBeInTheDocument()
  })

  it('focuses selected workspace content in the main area and lets the drawer show the calendar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Todos' }))

    expect(screen.getByTestId('workspace-main-area')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'To-Do List' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Month calendar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show calendar' }))

    expect(screen.getByTestId('calendar-main-area')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Month calendar' })).toBeInTheDocument()
  })

  it('updates layout when settings are saved', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.selectOptions(screen.getByLabelText('Panel position'), 'bottom')
    await user.clear(screen.getByLabelText('Panel size percent'))
    await user.type(screen.getByLabelText('Panel size percent'), '30')
    await user.click(screen.getByRole('button', { name: 'Save frontend config' }))

    const shell = screen.getByTestId('calendar-workspace-shell')
    expect(shell).toHaveAttribute('data-layout-position', 'bottom')
    expect(shell).toHaveStyle('--workspace-panel-size: 30%')
  })
})
