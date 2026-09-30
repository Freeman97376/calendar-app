import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../../src/App'
import { LocalEventTypeService } from '../../../src/services/eventTypes/localEventTypeService'
import { RuntimeConfigService } from '../../../src/services/config/runtimeConfigService'
import { useAuthStore } from '../../../src/store/authStore'
import { configureConfigServices, useConfigStore } from '../../../src/store/configStore'
import { configureEventTypeService, useEventTypeStore } from '../../../src/store/eventTypeStore'
import { useUIStore } from '../../../src/store/uiStore'
import { server } from '../support/mocks/server'

async function openSettings() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  return user
}

function enableGlobalScheduling() {
  const capabilities = useAuthStore.getState().capabilities
  if (!capabilities) throw new Error('Expected authenticated test capabilities.')
  useAuthStore.setState({ capabilities: { ...capabilities, globalScheduling: true } })
}

describe('Settings panel', () => {
  beforeEach(() => {
    localStorage.clear()
    configureConfigServices(new RuntimeConfigService(localStorage, 'test_runtime_config'))
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_event_types_settings'))
    useConfigStore.getState().reset()
    useEventTypeStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('saves frontend runtime config', async () => {
    const user = await openSettings()

    await user.clear(screen.getByLabelText('Fridge API base URL'))
    await user.type(screen.getByLabelText('Fridge API base URL'), 'http://127.0.0.1:9999')
    await user.selectOptions(screen.getByLabelText('Default AI provider'), 'api')
    await user.clear(screen.getByLabelText('AI API key'))
    await user.type(screen.getByLabelText('AI API key'), 'test-api-key')
    await user.clear(screen.getByLabelText('AI API base URL'))
    await user.type(screen.getByLabelText('AI API base URL'), 'https://api.deepseek.com')
    await user.clear(screen.getByLabelText('AI API model'))
    await user.type(screen.getByLabelText('AI API model'), 'deepseek-chat-test')
    await user.clear(screen.getByLabelText('Timezone override'))
    await user.type(screen.getByLabelText('Timezone override'), 'America/Los_Angeles')
    await user.clear(screen.getByLabelText('Default event start'))
    await user.type(screen.getByLabelText('Default event start'), '13:30')
    await user.clear(screen.getByLabelText('Default event end'))
    await user.type(screen.getByLabelText('Default event end'), '14:45')
    await user.selectOptions(screen.getByLabelText('Default task priority'), 'high')
    await user.selectOptions(screen.getByLabelText('Panel position'), 'right')
    await user.clear(screen.getByLabelText('Panel size percent'))
    await user.type(screen.getByLabelText('Panel size percent'), '30')
    await user.selectOptions(screen.getByLabelText('Language'), 'zh')
    await user.click(screen.getByRole('button', { name: 'Save frontend config' }))

    expect(useConfigStore.getState().config).toMatchObject({
      aiApiBaseUrl: 'https://api.deepseek.com',
      aiApiKey: 'test-api-key',
      aiApiModel: 'deepseek-chat-test',
      aiApiProfile: 'custom',
      aiProvider: 'api',
      fridgeApiBaseUrl: 'http://127.0.0.1:9999',
      defaultEventEndTime: '14:45',
      defaultEventStartTime: '13:30',
      defaultTodoPriority: 'high',
      language: 'zh',
      layoutPanelPosition: 'right',
      layoutPanelSizePercent: 30,
      timezoneOverride: 'America/Los_Angeles',
    })
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(screen.getByText('已保存前端运行配置。')).toBeInTheDocument()
  }, 10_000)

  it('resets API URL and model when the DeepSeek profile is selected', async () => {
    const user = await openSettings()

    await user.clear(screen.getByLabelText('AI API base URL'))
    await user.type(screen.getByLabelText('AI API base URL'), 'https://api.example.com/v1')
    await user.clear(screen.getByLabelText('AI API model'))
    await user.type(screen.getByLabelText('AI API model'), 'example-model')
    await user.selectOptions(screen.getByLabelText('AI API profile'), 'deepseek')
    await user.click(screen.getByRole('button', { name: 'Save frontend config' }))

    expect(screen.getByLabelText('AI API base URL')).toHaveValue('https://api.deepseek.com')
    expect(screen.getByLabelText('AI API model')).toHaveValue('deepseek-chat')
    expect(useConfigStore.getState().config).toMatchObject({
      aiApiBaseUrl: 'https://api.deepseek.com',
      aiApiModel: 'deepseek-chat',
      aiApiProfile: 'deepseek',
    })
  }, 10_000)

  it('hides API settings when the local provider is selected', async () => {
    const user = await openSettings()

    await user.selectOptions(screen.getByLabelText('Default AI provider'), 'local')

    expect(screen.queryByLabelText('AI API profile')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AI API key')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AI API base URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AI API model')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save frontend config' }))

    expect(useConfigStore.getState().config).toMatchObject({
      aiProvider: 'local',
    })
  }, 10_000)

  it('saves backend DeepSeek config through the local backend API', async () => {
    const user = await openSettings()

    await screen.findByText(/DeepSeek is not configured/i)
    await user.type(screen.getByLabelText('DeepSeek API key'), 'test-deepseek-key')
    await user.clear(screen.getByLabelText('DeepSeek model'))
    await user.type(screen.getByLabelText('DeepSeek model'), 'deepseek-chat')
    await user.click(screen.getByRole('button', { name: 'Save backend config' }))

    await waitFor(() => {
      expect(useConfigStore.getState().backendStatus?.deepseek.configured).toBe(true)
    })
    expect(screen.getByText(/Saved backend config/i)).toBeInTheDocument()
  })

  it('saves valid work windows before requesting one global recompute', async () => {
    enableGlobalScheduling()
    const calls: string[] = []
    let recomputeBody: Record<string, unknown> | null = null
    server.use(
      http.patch('*/api/me/preferences', async () => {
        calls.push('preferences')
        return HttpResponse.json({ success: true })
      }),
      http.post('*/api/scheduling/proposals/recompute', async ({ request }) => {
        calls.push('recompute')
        recomputeBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, proposal: null })
      }),
    )
    const user = await openSettings()

    await user.click(screen.getAllByRole('button', { name: '添加时段' })[0])
    await user.click(screen.getByRole('button', { name: '保存并重新计算' }))

    await waitFor(() => expect(calls).toEqual(['preferences', 'recompute']))
    expect(recomputeBody).toEqual({ reason: 'work_windows_changed' })
    expect(useConfigStore.getState().config.scheduling).toMatchObject({
      setupCompleted: true,
      workWindows: [{ day: 'mon', start: '09:00', end: '12:00' }],
    })
    expect(screen.getByText('工作时段已保存，并已生成最新排程提案。')).toBeInTheDocument()
  })

  it('blocks overlapping windows and invalid block limits without network requests', async () => {
    enableGlobalScheduling()
    let requestCount = 0
    server.use(
      http.patch('*/api/me/preferences', () => {
        requestCount += 1
        return HttpResponse.json({ success: true })
      }),
      http.post('*/api/scheduling/proposals/recompute', () => {
        requestCount += 1
        return HttpResponse.json({ success: true, proposal: null })
      }),
    )
    const user = await openSettings()
    const addMonday = screen.getAllByRole('button', { name: '添加时段' })[0]

    await user.click(addMonday)
    await user.click(addMonday)
    expect(screen.getByText('mon 的工作时段不能重叠。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存并重新计算' })).toBeDisabled()

    await user.click(screen.getAllByRole('button', { name: '删除周一时段' })[1])
    await user.clear(screen.getByLabelText('最小时间块（分钟）'))
    await user.type(screen.getByLabelText('最小时间块（分钟）'), '180')

    expect(screen.getByText('最小时间块不能大于最大时间块。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存并重新计算' })).toBeDisabled()
    expect(requestCount).toBe(0)
  })
})
