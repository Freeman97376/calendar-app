import { useEffect } from 'react'

import type { EventDraft } from '../domain/logic/eventUtils'
import { getLocalTimeContext } from '../domain/logic/timeContext'
import { TOOL_SESSION_OUTPUT_SCHEMA_PREVIEW } from '../domain/logic/toolPresets'
import { ToolSessionFieldSchema } from '../domain/schemas/toolSession.schema'
import type { ToolPreset, ToolSessionLlmOptions } from '../domain/types'
import { useCalendarStore } from '../store/calendarStore'
import { useConfigStore } from '../store/configStore'
import { useEventStore } from '../store/eventStore'
import { useToolSessionStore } from '../store/toolSessionStore'

export function defaultInputsForPreset(preset: ToolPreset): Record<string, string> {
  return Object.fromEntries(preset.fields.map((field) => [field.id, field.defaultValue ?? '']))
}

export function parseToolSessionFieldsJson(json: string): ToolPreset['fields'] {
  return ToolSessionFieldSchema.array().parse(JSON.parse(json))
}

export function useToolSessions() {
  const error = useToolSessionStore((state) => state.error)
  const isLoadingPresets = useToolSessionStore((state) => state.isLoadingPresets)
  const isRunning = useToolSessionStore((state) => state.isRunning)
  const presets = useToolSessionStore((state) => state.presets)
  const result = useToolSessionStore((state) => state.result)
  const clearResult = useToolSessionStore((state) => state.clearResult)
  const deletePreset = useToolSessionStore((state) => state.deletePreset)
  const duplicatePreset = useToolSessionStore((state) => state.duplicatePreset)
  const loadPresets = useToolSessionStore((state) => state.loadPresets)
  const runSession = useToolSessionStore((state) => state.runSession)
  const updatePreset = useToolSessionStore((state) => state.updatePreset)
  const config = useConfigStore((state) => state.config)
  const focusedDate = useCalendarStore((state) => state.focusedDate)
  const createEvent = useEventStore((state) => state.createEvent)

  useEffect(() => {
    loadPresets().catch(() => undefined)
  }, [loadPresets])

  async function runToolSession(
    preset: ToolPreset,
    inputs: Record<string, string>,
    llmOptions: ToolSessionLlmOptions,
  ) {
    const timeContext = getLocalTimeContext(new Date(), config.timezoneOverride)

    return runSession({
      ...timeContext,
      focusedDate,
      inputs,
      llmOptions,
      outputSchemaKey: preset.outputSchemaKey,
      presetId: preset.id,
      presetLabel: preset.label,
      prompt: preset.prompt,
      today: timeContext.currentDate,
    })
  }

  async function applyResult() {
    if (!result) return []

    const created = []
    for (const draft of result.events) {
      created.push(await createEvent(draft as EventDraft))
    }
    clearResult()
    return created
  }

  return {
    applyResult,
    clearResult,
    deletePreset,
    duplicatePreset,
    error,
    isLoadingPresets,
    isRunning,
    outputSchemaPreview: TOOL_SESSION_OUTPUT_SCHEMA_PREVIEW,
    presets,
    result,
    runToolSession,
    updatePreset,
  }
}
