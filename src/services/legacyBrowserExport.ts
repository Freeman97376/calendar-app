import type { CalendarBackup } from '../domain/types/dataPortability'

const SAFE_PREFERENCES = new Set([
  'confirmEnabledToolRouting',
  'defaultEventColor',
  'defaultEventEndTime',
  'defaultEventStartTime',
  'defaultEventTypeId',
  'defaultTodoEventTypeId',
  'defaultTodoPriority',
  'language',
  'layoutPanelPosition',
  'layoutPanelSizePercent',
  'timezoneOverride',
])

function readValue(storage: Storage, key: string, fallback: unknown): unknown {
  const raw = storage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    )
  }
  return value
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export async function exportLegacyBrowserData(storage: Storage = localStorage): Promise<CalendarBackup> {
  const rawPreferences = readValue(storage, 'calendar_runtime_config', {})
  const preferences = Object.fromEntries(
    Object.entries(
      rawPreferences && typeof rawPreferences === 'object'
        ? (rawPreferences as Record<string, unknown>)
        : {},
    ).filter(([key]) => SAFE_PREFERENCES.has(key)),
  )
  const entities = {
    actions: [],
    eventTypes: arrayValue(readValue(storage, 'calendar_event_types', [])),
    events: arrayValue(readValue(storage, 'calendar_events', [])),
    fridgeItems: [],
    goals: [],
    milestones: [],
    planningRuns: [],
    preferences,
    progress: [],
    projects: [],
    todos: arrayValue(readValue(storage, 'calendar_todos', [])),
    toolPresets: arrayValue(readValue(storage, 'calendar_tool_presets', [])),
    toolRuns: [],
  }
  return {
    checksum: await sha256(entities),
    entities,
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
  }
}
