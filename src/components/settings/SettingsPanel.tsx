import { useEffect, useState, type FormEvent } from 'react'

import type { EventType, RuntimeConfig } from '../../domain/types'
import { useI18n } from '../../hooks/useI18n'
import { useAuth } from '../../hooks/useAuth'
import { useEventTypes } from '../../hooks/useEventTypes'
import { useSettings } from '../../hooks/useSettings'
import EventTypeSettings from '../eventTypes/EventTypeSettings'
import Button from '../ui/Button'
import DataPortabilityPanel from './DataPortabilityPanel'
import AIUsageSettings from './AIUsageSettings'
import DesktopUpdateSettings from './DesktopUpdateSettings'

type BackendDraft = {
  deepseekApiKey: string
  deepseekBaseUrl: string
  deepseekModel: string
  fridgeDataDir: string
}

const inputClass =
  'mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com'
const DEEPSEEK_API_MODEL = 'deepseek-chat'

function withSelectedEventType(
  options: EventType[],
  selectedId: string,
  eventTypesById: Map<string, EventType>,
): EventType[] {
  const selected = eventTypesById.get(selectedId)

  if (!selected || options.some((option) => option.id === selected.id)) return options

  return [selected, ...options]
}

export default function SettingsPanel() {
  const { t, translateForLanguage } = useI18n()
  const auth = useAuth()
  const settings = useSettings()
  const eventTypes = useEventTypes()
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeConfig>(settings.config)
  const [backendDraft, setBackendDraft] = useState<BackendDraft>({
    deepseekApiKey: '',
    deepseekBaseUrl: 'https://api.deepseek.com',
    deepseekModel: 'deepseek-chat',
    fridgeDataDir: '',
  })
  const [layoutPanelSizeInput, setLayoutPanelSizeInput] = useState(
    String(settings.config.layoutPanelSizePercent),
  )
  const [status, setStatus] = useState<string | null>(null)

  const calendarDefaultOptions = withSelectedEventType(
    eventTypes.calendarEventTypes,
    runtimeDraft.defaultEventTypeId,
    eventTypes.eventTypesById,
  )
  const todoDefaultOptions = withSelectedEventType(
    eventTypes.todoEventTypes,
    runtimeDraft.defaultTodoEventTypeId,
    eventTypes.eventTypesById,
  )

  useEffect(() => {
    setRuntimeDraft(settings.config)
    setLayoutPanelSizeInput(String(settings.config.layoutPanelSizePercent))
  }, [settings.config])

  useEffect(() => {
    if (!settings.backendStatus) return

    setBackendDraft((current) => ({
      ...current,
      deepseekBaseUrl: settings.backendStatus?.deepseek.base_url ?? current.deepseekBaseUrl,
      deepseekModel: settings.backendStatus?.deepseek.model ?? current.deepseekModel,
      fridgeDataDir: settings.backendStatus?.fridge.data_dir ?? current.fridgeDataDir,
    }))
  }, [settings.backendStatus])

  function saveRuntime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    settings.saveRuntimeConfig(runtimeDraft)
    setStatus(translateForLanguage(runtimeDraft.language, 'settings.saveFrontendStatus'))
  }

  function setAiApiProfile(profile: RuntimeConfig['aiApiProfile']) {
    setRuntimeDraft((current) =>
      profile === 'deepseek'
        ? {
            ...current,
            aiApiBaseUrl: DEEPSEEK_API_BASE_URL,
            aiApiModel: DEEPSEEK_API_MODEL,
            aiApiProfile: profile,
          }
        : { ...current, aiApiProfile: profile },
    )
  }

  function setLayoutPanelSize(value: string) {
    setLayoutPanelSizeInput(value)
    if (value.trim() === '') return

    const parsed = Number(value)
    const next = Number.isNaN(parsed) ? 20 : Math.min(40, Math.max(15, parsed))

    setRuntimeDraft((current) => ({ ...current, layoutPanelSizePercent: next }))
  }

  function restoreLayoutPanelSizeInput() {
    const parsed = Number(layoutPanelSizeInput)
    if (layoutPanelSizeInput.trim() === '' || Number.isNaN(parsed) || parsed < 15 || parsed > 40) {
      setLayoutPanelSizeInput(String(runtimeDraft.layoutPanelSizePercent))
    }
  }

  async function saveBackend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    try {
      await settings.saveBackendConfig({
        deepseek_api_key: backendDraft.deepseekApiKey || undefined,
        deepseek_base_url: backendDraft.deepseekBaseUrl,
        deepseek_model: backendDraft.deepseekModel,
        fridge_data_dir: backendDraft.fridgeDataDir,
      })
    } catch {
      // The config store exposes an actionable error in the settings panel.
      return
    }
    setBackendDraft((current) => ({ ...current, deepseekApiKey: '' }))
    setStatus(translateForLanguage(runtimeDraft.language, 'settings.saveBackendStatus'))
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-950">{t('settings.frontendRuntime')}</h3>
        <form className="space-y-5" onSubmit={saveRuntime}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-800">{t('settings.display')}</legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-language"
              >
                {t('language.label')}
              </label>
              <select
                className={inputClass}
                id="settings-language"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    language: event.target.value as RuntimeConfig['language'],
                  }))
                }
                value={runtimeDraft.language}
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </fieldset>

          <fieldset
            className="space-y-3 border-t border-slate-200 pt-4"
            hidden={auth.capabilities?.serverManagedAI ?? false}
          >
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.aiProviders')}
            </legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-ai-provider"
              >
                {t('settings.defaultAIProvider')}
              </label>
              <select
                className={inputClass}
                id="settings-ai-provider"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    aiProvider: event.target.value as RuntimeConfig['aiProvider'],
                  }))
                }
                value={runtimeDraft.aiProvider}
              >
                <option value="api">API</option>
                <option value="local">Local</option>
              </select>
            </div>

            {runtimeDraft.aiProvider === 'api' ? (
              <>
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="settings-ai-api-profile"
                  >
                    {t('settings.aiApiProfile')}
                  </label>
                  <select
                    className={inputClass}
                    id="settings-ai-api-profile"
                    onChange={(event) =>
                      setAiApiProfile(event.target.value as RuntimeConfig['aiApiProfile'])
                    }
                    value={runtimeDraft.aiApiProfile}
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="custom">Custom API</option>
                  </select>
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="settings-ai-api-key"
                  >
                    {t('settings.aiApiKey')}
                  </label>
                  <input
                    className={inputClass}
                    id="settings-ai-api-key"
                    onChange={(event) =>
                      setRuntimeDraft((current) => ({ ...current, aiApiKey: event.target.value }))
                    }
                    type="password"
                    value={runtimeDraft.aiApiKey}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="settings-ai-api-url"
                  >
                    {t('settings.aiApiBaseUrl')}
                  </label>
                  <input
                    className={inputClass}
                    id="settings-ai-api-url"
                    onChange={(event) =>
                      setRuntimeDraft((current) => ({
                        ...current,
                        aiApiBaseUrl: event.target.value,
                        aiApiProfile: 'custom',
                      }))
                    }
                    value={runtimeDraft.aiApiBaseUrl}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="settings-ai-api-model"
                  >
                    {t('settings.aiApiModel')}
                  </label>
                  <input
                    className={inputClass}
                    id="settings-ai-api-model"
                    onChange={(event) =>
                      setRuntimeDraft((current) => ({
                        ...current,
                        aiApiModel: event.target.value,
                        aiApiProfile: 'custom',
                      }))
                    }
                    value={runtimeDraft.aiApiModel}
                  />
                </div>
              </>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.enabledToolRouting')}
            </legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                checked={runtimeDraft.confirmEnabledToolRouting}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    confirmEnabledToolRouting: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>{t('settings.routingConfirmDescription')}</span>
            </label>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.workspaceLayout')}
            </legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-layout-position"
              >
                {t('settings.panelPosition')}
              </label>
              <select
                className={inputClass}
                id="settings-layout-position"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    layoutPanelPosition: event.target.value as RuntimeConfig['layoutPanelPosition'],
                  }))
                }
                value={runtimeDraft.layoutPanelPosition}
              >
                <option value="left">{t('settings.positionLeft')}</option>
                <option value="right">{t('settings.positionRight')}</option>
                <option value="top">{t('settings.positionTop')}</option>
                <option value="bottom">{t('settings.positionBottom')}</option>
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-layout-size"
              >
                {t('settings.panelSize')}
              </label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  className="h-2 min-w-0 flex-1 accent-emerald-700"
                  id="settings-layout-size"
                  max={40}
                  min={15}
                  onChange={(event) => setLayoutPanelSize(event.target.value)}
                  type="range"
                  value={runtimeDraft.layoutPanelSizePercent}
                />
                <input
                  aria-label="Panel size percent"
                  className="h-10 w-20 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  max={40}
                  min={15}
                  onChange={(event) => setLayoutPanelSize(event.target.value)}
                  type="number"
                  onBlur={restoreLayoutPanelSizeInput}
                  value={layoutPanelSizeInput}
                />
                <span className="text-sm text-slate-600">%</span>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.timeContext')}
            </legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-timezone-override"
              >
                {t('settings.timezoneOverride')}
              </label>
              <input
                className={inputClass}
                id="settings-timezone-override"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    timezoneOverride: event.target.value,
                  }))
                }
                placeholder="America/Los_Angeles"
                value={runtimeDraft.timezoneOverride}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.fridgeFrontend')}
            </legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-fridge-api"
              >
                {t('settings.fridgeApiBaseUrl')}
              </label>
              <input
                className={inputClass}
                id="settings-fridge-api"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    fridgeApiBaseUrl: event.target.value,
                  }))
                }
                value={runtimeDraft.fridgeApiBaseUrl}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">
              {t('settings.inputDefaults')}
            </legend>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-event-color"
              >
                {t('settings.defaultEventColor')}
              </label>
              <input
                className={inputClass}
                id="settings-event-color"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    defaultEventColor: event.target.value,
                  }))
                }
                type="color"
                value={runtimeDraft.defaultEventColor}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="settings-event-start"
                >
                  {t('settings.defaultEventStart')}
                </label>
                <input
                  className={inputClass}
                  id="settings-event-start"
                  onChange={(event) =>
                    setRuntimeDraft((current) => ({
                      ...current,
                      defaultEventStartTime: event.target.value,
                    }))
                  }
                  type="time"
                  value={runtimeDraft.defaultEventStartTime}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="settings-event-end"
                >
                  {t('settings.defaultEventEnd')}
                </label>
                <input
                  className={inputClass}
                  id="settings-event-end"
                  onChange={(event) =>
                    setRuntimeDraft((current) => ({
                      ...current,
                      defaultEventEndTime: event.target.value,
                    }))
                  }
                  type="time"
                  value={runtimeDraft.defaultEventEndTime}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-default-event-type"
              >
                {t('settings.defaultCalendarType')}
              </label>
              <select
                className={inputClass}
                id="settings-default-event-type"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    defaultEventTypeId: event.target.value,
                  }))
                }
                value={runtimeDraft.defaultEventTypeId}
              >
                {calendarDefaultOptions.length ? (
                  calendarDefaultOptions.map((eventType) => (
                    <option key={eventType.id} value={eventType.id}>
                      {eventType.label}
                    </option>
                  ))
                ) : (
                  <option value={runtimeDraft.defaultEventTypeId}>
                    {runtimeDraft.defaultEventTypeId}
                  </option>
                )}
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-default-todo-type"
              >
                {t('settings.defaultTaskType')}
              </label>
              <select
                className={inputClass}
                id="settings-default-todo-type"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    defaultTodoEventTypeId: event.target.value,
                  }))
                }
                value={runtimeDraft.defaultTodoEventTypeId}
              >
                {todoDefaultOptions.length ? (
                  todoDefaultOptions.map((eventType) => (
                    <option key={eventType.id} value={eventType.id}>
                      {eventType.label}
                    </option>
                  ))
                ) : (
                  <option value={runtimeDraft.defaultTodoEventTypeId}>
                    {runtimeDraft.defaultTodoEventTypeId}
                  </option>
                )}
              </select>
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-default-todo-priority"
              >
                {t('settings.defaultTaskPriority')}
              </label>
              <select
                className={inputClass}
                id="settings-default-todo-priority"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    defaultTodoPriority: event.target.value as RuntimeConfig['defaultTodoPriority'],
                  }))
                }
                value={runtimeDraft.defaultTodoPriority}
              >
                <option value="high">{t('settings.high')}</option>
                <option value="medium">{t('settings.medium')}</option>
                <option value="low">{t('settings.low')}</option>
              </select>
            </div>
          </fieldset>

          <Button type="submit" variant="primary">
            {t('settings.saveFrontendConfig')}
          </Button>
        </form>
      </section>

      <DesktopUpdateSettings />

      <AIUsageSettings />

      <EventTypeSettings title={t('settings.eventAndTaskTypes')} />

      {auth.capabilities?.dataPortability ? <DataPortabilityPanel /> : null}

      {auth.capabilities?.backendConfigEditable ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-950">
            {t('settings.backendDeepSeekFridge')}
          </h3>
          {settings.backendStatus ? (
            <p className="text-sm text-slate-600">
              {settings.backendStatus.deepseek.configured
                ? t('settings.deepSeekConfigured')
                : t('settings.deepSeekNotConfigured')}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {settings.isLoadingBackend
                ? t('settings.loadingBackendConfig')
                : t('settings.backendConfigUnavailable')}
            </p>
          )}

          <form className="space-y-3" onSubmit={(event) => void saveBackend(event)}>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-deepseek-key"
              >
                {t('settings.deepSeekApiKey')}
              </label>
              <input
                className={inputClass}
                id="settings-deepseek-key"
                onChange={(event) =>
                  setBackendDraft((current) => ({ ...current, deepseekApiKey: event.target.value }))
                }
                placeholder={t('settings.leaveBlankToKeepExistingKey')}
                type="password"
                value={backendDraft.deepseekApiKey}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-deepseek-url"
              >
                {t('settings.deepSeekBaseUrl')}
              </label>
              <input
                className={inputClass}
                id="settings-deepseek-url"
                onChange={(event) =>
                  setBackendDraft((current) => ({
                    ...current,
                    deepseekBaseUrl: event.target.value,
                  }))
                }
                value={backendDraft.deepseekBaseUrl}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-deepseek-model"
              >
                {t('settings.deepSeekModel')}
              </label>
              <input
                className={inputClass}
                id="settings-deepseek-model"
                onChange={(event) =>
                  setBackendDraft((current) => ({ ...current, deepseekModel: event.target.value }))
                }
                value={backendDraft.deepseekModel}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="settings-fridge-data"
              >
                {t('settings.fridgeDataDirectory')}
              </label>
              <input
                className={inputClass}
                id="settings-fridge-data"
                onChange={(event) =>
                  setBackendDraft((current) => ({ ...current, fridgeDataDir: event.target.value }))
                }
                value={backendDraft.fridgeDataDir}
              />
            </div>

            <Button disabled={settings.isLoadingBackend} type="submit" variant="primary">
              {t('settings.saveBackendConfig')}
            </Button>
          </form>
        </section>
      ) : (
        <section className="border-t border-slate-200 pt-4 text-sm text-slate-600">
          Server AI and storage configuration is managed by the operator. / 服务器 AI
          与存储配置由管理员在服务器端维护。
        </section>
      )}

      {settings.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{settings.error}</p>
      ) : null}
      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
    </div>
  )
}
