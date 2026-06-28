import { useEffect, useState, type FormEvent } from 'react'

import type { EventType, RuntimeConfig } from '../../domain/types'
import { useEventTypes } from '../../hooks/useEventTypes'
import { useSettings } from '../../hooks/useSettings'
import EventTypeSettings from '../eventTypes/EventTypeSettings'
import Button from '../ui/Button'

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
  const settings = useSettings()
  const eventTypes = useEventTypes()
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeConfig>(settings.config)
  const [backendDraft, setBackendDraft] = useState<BackendDraft>({
    deepseekApiKey: '',
    deepseekBaseUrl: 'https://api.deepseek.com',
    deepseekModel: 'deepseek-chat',
    fridgeDataDir: '',
  })
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
    setStatus('Saved frontend runtime config.')
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

  async function saveBackend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await settings.saveBackendConfig({
      deepseek_api_key: backendDraft.deepseekApiKey || undefined,
      deepseek_base_url: backendDraft.deepseekBaseUrl,
      deepseek_model: backendDraft.deepseekModel,
      fridge_data_dir: backendDraft.fridgeDataDir,
    })
    setBackendDraft((current) => ({ ...current, deepseekApiKey: '' }))
    setStatus('Saved backend config. DeepSeek will be used by new fridge analyses.')
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-950">Frontend Runtime</h3>
        <form className="space-y-5" onSubmit={saveRuntime}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-800">AI providers</legend>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-ai-provider">
                Default AI provider
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
                  <label className="block text-sm font-medium text-slate-700" htmlFor="settings-ai-api-profile">
                    AI API profile
                  </label>
                  <select
                    className={inputClass}
                    id="settings-ai-api-profile"
                    onChange={(event) => setAiApiProfile(event.target.value as RuntimeConfig['aiApiProfile'])}
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
                    AI API key
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
                    AI API base URL
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
                  <label className="block text-sm font-medium text-slate-700" htmlFor="settings-ai-api-model">
                    AI API model
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
            <legend className="text-sm font-medium text-slate-800">Time context</legend>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-timezone-override">
                Timezone override
              </label>
              <input
                className={inputClass}
                id="settings-timezone-override"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, timezoneOverride: event.target.value }))
                }
                placeholder="America/Los_Angeles"
                value={runtimeDraft.timezoneOverride}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">Firebase startup config</legend>
            <p className="text-xs text-slate-500">
              These values mirror Vite environment variables and apply after the app restarts.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-api-key">
                Firebase API key
              </label>
              <input
                className={inputClass}
                id="settings-firebase-api-key"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, firebaseApiKey: event.target.value }))
                }
                type="password"
                value={runtimeDraft.firebaseApiKey}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-auth-domain">
                Firebase auth domain
              </label>
              <input
                className={inputClass}
                id="settings-firebase-auth-domain"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, firebaseAuthDomain: event.target.value }))
                }
                value={runtimeDraft.firebaseAuthDomain}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-project">
                Firebase project ID
              </label>
              <input
                className={inputClass}
                id="settings-firebase-project"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, firebaseProjectId: event.target.value }))
                }
                value={runtimeDraft.firebaseProjectId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-storage">
                Firebase storage bucket
              </label>
              <input
                className={inputClass}
                id="settings-firebase-storage"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    firebaseStorageBucket: event.target.value,
                  }))
                }
                value={runtimeDraft.firebaseStorageBucket}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-sender">
                Firebase messaging sender ID
              </label>
              <input
                className={inputClass}
                id="settings-firebase-sender"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({
                    ...current,
                    firebaseMessagingSenderId: event.target.value,
                  }))
                }
                value={runtimeDraft.firebaseMessagingSenderId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-firebase-app">
                Firebase app ID
              </label>
              <input
                className={inputClass}
                id="settings-firebase-app"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, firebaseAppId: event.target.value }))
                }
                value={runtimeDraft.firebaseAppId}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">Fridge frontend</legend>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-fridge-api">
                Fridge API base URL
              </label>
              <input
                className={inputClass}
                id="settings-fridge-api"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, fridgeApiBaseUrl: event.target.value }))
                }
                value={runtimeDraft.fridgeApiBaseUrl}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-medium text-slate-800">Input defaults</legend>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-event-color">
                Default event color
              </label>
              <input
                className={inputClass}
                id="settings-event-color"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, defaultEventColor: event.target.value }))
                }
                type="color"
                value={runtimeDraft.defaultEventColor}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="settings-event-start">
                  Default event start
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
                <label className="block text-sm font-medium text-slate-700" htmlFor="settings-event-end">
                  Default event end
                </label>
                <input
                  className={inputClass}
                  id="settings-event-end"
                  onChange={(event) =>
                    setRuntimeDraft((current) => ({ ...current, defaultEventEndTime: event.target.value }))
                  }
                  type="time"
                  value={runtimeDraft.defaultEventEndTime}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-default-event-type">
                Default calendar type
              </label>
              <select
                className={inputClass}
                id="settings-default-event-type"
                onChange={(event) =>
                  setRuntimeDraft((current) => ({ ...current, defaultEventTypeId: event.target.value }))
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
                  <option value={runtimeDraft.defaultEventTypeId}>{runtimeDraft.defaultEventTypeId}</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-default-todo-type">
                Default task type
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
              <label className="block text-sm font-medium text-slate-700" htmlFor="settings-default-todo-priority">
                Default task priority
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
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </fieldset>

          <Button type="submit" variant="primary">
            Save frontend config
          </Button>
        </form>
      </section>

      <EventTypeSettings title="Event and task types" />

      <section className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-950">Backend DeepSeek / Fridge</h3>
        {settings.backendStatus ? (
          <p className="text-sm text-slate-600">
            DeepSeek is {settings.backendStatus.deepseek.configured ? 'configured' : 'not configured'}.
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            {settings.isLoadingBackend ? 'Loading backend config...' : 'Backend config unavailable.'}
          </p>
        )}

        <form className="space-y-3" onSubmit={(event) => void saveBackend(event)}>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="settings-deepseek-key">
              DeepSeek API key
            </label>
            <input
              className={inputClass}
              id="settings-deepseek-key"
              onChange={(event) =>
                setBackendDraft((current) => ({ ...current, deepseekApiKey: event.target.value }))
              }
              placeholder="Leave blank to keep existing key"
              type="password"
              value={backendDraft.deepseekApiKey}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="settings-deepseek-url">
              DeepSeek base URL
            </label>
            <input
              className={inputClass}
              id="settings-deepseek-url"
              onChange={(event) =>
                setBackendDraft((current) => ({ ...current, deepseekBaseUrl: event.target.value }))
              }
              value={backendDraft.deepseekBaseUrl}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="settings-deepseek-model">
              DeepSeek model
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
            <label className="block text-sm font-medium text-slate-700" htmlFor="settings-fridge-data">
              Fridge data directory
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
            Save backend config
          </Button>
        </form>
      </section>

      {settings.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{settings.error}</p>
      ) : null}
      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
    </div>
  )
}
