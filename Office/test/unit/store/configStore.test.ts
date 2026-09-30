import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiRuntime } from '../../../../src/services/appApiClient'
import { RuntimeConfigService } from '../../../../src/services/config/runtimeConfigService'
import { getConfiguredAIService } from '../../../../src/store/aiStore'
import {
  configureConfigServices,
  configureRuntimeEnvironment,
  initializeRuntimeConfig,
  useConfigStore,
} from '../../../../src/store/configStore'

describe('runtime AI proxy configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    configureApiRuntime({ baseUrl: 'http://calendar.local', csrfToken: '', desktopToken: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes chat through the Calendar API instead of connecting to DeepSeek from the browser', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    goal: 'Test',
                    steps: [
                      {
                        title: 'First step',
                        durationMinutes: 30,
                        energyNeeded: 'medium',
                        priority: 'medium',
                        suggestedDayOffset: 0,
                        suggestedHour: 9,
                      },
                    ],
                    totalEstimatedHours: 0.5,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetcher)

    configureRuntimeEnvironment({
      authoritativePreferences: true,
      persistPreferences: true,
      serverManagedAI: true,
    })
    initializeRuntimeConfig({})

    await getConfiguredAIService()!.breakdownGoal('Test')

    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('http://calendar.local/api/ai/chat/completions')
  })

  it('keeps AI backend-managed even when legacy browser preferences request local mode', () => {
    configureRuntimeEnvironment({
      aiRuntime: {
        editable: false,
        keyConfigured: true,
        mode: 'backend-managed',
        planningModel: 'planning-model',
        provider: 'deepseek-compatible',
        routineModel: 'routine-model',
        ruleBasedFallback: false,
      },
      serverManagedAI: false,
    })
    initializeRuntimeConfig({ aiProvider: 'local', aiApiModel: 'browser-model' })

    expect(useConfigStore.getState().aiRuntime).toMatchObject({
      editable: false,
      mode: 'backend-managed',
      routineModel: 'routine-model',
    })
    expect(getConfiguredAIService()?.isAvailable()).toBe(true)
  })

  it('saves backend configuration to the injected Calendar API instead of the editable fridge URL', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            success: true,
            deepseek: {
              configured: true,
              base_url: 'https://api.deepseek.com',
              model: 'deepseek-chat',
            },
            fridge: { data_dir: 'backend/data' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    vi.stubGlobal('fetch', fetcher)
    configureApiRuntime({
      baseUrl: 'http://127.0.0.1:49152',
      csrfToken: '',
      desktopToken: 'launch-token',
    })
    configureConfigServices(new RuntimeConfigService(localStorage, 'test_runtime_config'))
    initializeRuntimeConfig({ fridgeApiBaseUrl: 'http://wrong-fridge-host:9999' })

    await useConfigStore.getState().saveBackendConfig({ deepseek_model: 'deepseek-chat' })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:49152/api/config')
    expect(useConfigStore.getState().aiRuntime).toMatchObject({
      keyConfigured: true,
      routineModel: 'deepseek-chat',
    })
  })

  it('does not let an older settings response overwrite a newer account configuration', async () => {
    let release!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending),
    )
    configureConfigServices(new RuntimeConfigService(localStorage, 'test_runtime_config'))
    const oldLoad = useConfigStore.getState().loadBackendStatus()
    configureRuntimeEnvironment({
      aiRuntime: {
        ...useConfigStore.getState().aiRuntime,
        keyConfigured: false,
        routineModel: 'new-account-model',
      },
    })
    release(
      new Response(
        JSON.stringify({
          success: true,
          deepseek: {
            configured: true,
            base_url: 'https://api.deepseek.com',
            model: 'old-account-model',
          },
          fridge: { data_dir: 'server-managed' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    await oldLoad
    expect(useConfigStore.getState().aiRuntime).toMatchObject({
      keyConfigured: false,
      routineModel: 'new-account-model',
    })
  })
})
