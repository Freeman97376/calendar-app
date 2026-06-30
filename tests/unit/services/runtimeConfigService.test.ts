import { beforeEach, describe, expect, it } from 'vitest'

import { RuntimeConfigService } from '../../../src/services/config/runtimeConfigService'

describe('RuntimeConfigService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy DeepSeek frontend settings into the unified API provider', () => {
    localStorage.setItem(
      'test_runtime_config',
      JSON.stringify({
        aiProvider: 'deepseek',
        deepseekApiKey: 'legacy-key',
        deepseekModel: 'legacy-model',
      }),
    )
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')

    expect(service.getConfig()).toMatchObject({
      aiApiKey: 'legacy-key',
      aiApiModel: 'legacy-model',
      aiApiProfile: 'custom',
      aiProvider: 'api',
    })
  })

  it('infers the DeepSeek API profile for default API URL and model', () => {
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')

    expect(service.getConfig()).toMatchObject({
      aiApiBaseUrl: 'https://api.deepseek.com',
      aiApiModel: 'deepseek-chat',
      aiApiProfile: 'deepseek',
      language: 'en',
      layoutPanelPosition: 'left',
      layoutPanelSizePercent: 20,
    })
  })

  it('persists a manual timezone override', () => {
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')
    const saved = service.saveConfig({
      ...service.getConfig(),
      timezoneOverride: 'America/Los_Angeles',
    })

    expect(saved.timezoneOverride).toBe('America/Los_Angeles')
    expect(service.getConfig().timezoneOverride).toBe('America/Los_Angeles')
  })

  it('persists the selected app language', () => {
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')
    service.saveConfig({
      ...service.getConfig(),
      language: 'zh',
    })

    expect(service.getConfig().language).toBe('zh')
  })

  it('infers a custom API profile for non-default API URL or model', () => {
    localStorage.setItem(
      'test_runtime_config',
      JSON.stringify({
        aiProvider: 'api',
        aiApiBaseUrl: 'https://api.example.com/v1',
        aiApiModel: 'example-model',
      }),
    )
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')

    expect(service.getConfig()).toMatchObject({
      aiApiBaseUrl: 'https://api.example.com/v1',
      aiApiModel: 'example-model',
      aiApiProfile: 'custom',
    })
  })

  it('persists workspace layout preferences and coerces saved size values', () => {
    const service = new RuntimeConfigService(localStorage, 'test_runtime_config')
    service.saveConfig({
      ...service.getConfig(),
      layoutPanelPosition: 'right',
      layoutPanelSizePercent: 30,
    })

    expect(service.getConfig()).toMatchObject({
      layoutPanelPosition: 'right',
      layoutPanelSizePercent: 30,
    })

    localStorage.setItem(
      'test_runtime_config',
      JSON.stringify({
        layoutPanelPosition: 'bottom',
        layoutPanelSizePercent: '25',
      }),
    )

    expect(service.getConfig()).toMatchObject({
      layoutPanelPosition: 'bottom',
      layoutPanelSizePercent: 25,
    })
  })
})
