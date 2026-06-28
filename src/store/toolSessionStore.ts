import { create } from 'zustand'

import { BUILT_IN_TOOL_PRESETS } from '../domain/logic/toolPresets'
import { ToolPresetSchema, ToolSessionRequestSchema } from '../domain/schemas/toolSession.schema'
import type { ToolPreset, ToolSessionRequest, ToolSessionResult } from '../domain/types'
import type { CreateToolRunInput, ToolRunStatus } from '../domain/types/longTermMemory'
import { LocalToolPresetService } from '../services/toolSessions/localToolPresetService'
import type { IToolPresetService, ToolPresetUpdate } from '../services/toolSessions/IToolPresetService'
import { getConfiguredAIService } from './aiStore'
import { recordLongTermToolRun, useLongTermMemoryStore } from './longTermMemoryStore'

export type ToolSessionStore = {
  error: string | null
  isLoadingPresets: boolean
  isRunning: boolean
  presets: ToolPreset[]
  result: ToolSessionResult | null
  clearResult: () => void
  deletePreset: (id: string) => Promise<void>
  duplicatePreset: (id: string) => Promise<ToolPreset>
  loadPresets: () => Promise<ToolPreset[]>
  reset: () => void
  runSession: (request: ToolSessionRequest) => Promise<ToolSessionResult>
  updatePreset: (id: string, changes: ToolPresetUpdate) => Promise<ToolPreset>
}

let toolPresetService: IToolPresetService = new LocalToolPresetService()

function mergePresets(customPresets: ToolPreset[]): ToolPreset[] {
  return [...BUILT_IN_TOOL_PRESETS, ...customPresets.filter((preset) => !preset.isBuiltIn)]
}

function createPresetId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${normalized || 'tool-preset'}-${Date.now()}`
}

export function configureToolPresetService(service: IToolPresetService) {
  toolPresetService = service
}

function summarizeInputs(inputs: Record<string, string>): string {
  const summary = Object.entries(inputs)
    .filter(([_key, value]) => value.trim())
    .map(([key, value]) => `${key}: ${value.trim()}`)
    .join('; ')

  return truncate(summary || 'No user inputs provided.', 300)
}

function summarizeResult(result: ToolSessionResult): string {
  const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join('; ')}` : ''
  return truncate(`${result.summary} Generated ${result.events.length} event draft(s).${warningText}`, 500)
}

function summarizeFailure(message: string): string {
  return truncate(`Tool session failed: ${message}`, 500)
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

function planningContext() {
  const memory = useLongTermMemoryStore.getState()
  return {
    related_goal_id: memory.selectedGoalId || undefined,
    related_project_id: memory.selectedProjectId || undefined,
  }
}

function toolRunInput(
  request: ToolSessionRequest,
  status: ToolRunStatus,
  outputSummary: string,
  output: Record<string, unknown>,
  error?: string,
): CreateToolRunInput {
  return {
    ...planningContext(),
    error,
    input: {
      focusedDate: request.focusedDate,
      inputs: request.inputs,
      llmOptions: request.llmOptions,
      outputSchemaKey: request.outputSchemaKey,
      presetId: request.presetId,
      today: request.today,
    },
    input_summary: summarizeInputs(request.inputs),
    intent: `Run ${request.presetLabel}`,
    output,
    output_summary: outputSummary,
    status,
    tool_name: request.presetLabel,
  }
}

export const useToolSessionStore = create<ToolSessionStore>((set, get) => ({
  error: null,
  isLoadingPresets: false,
  isRunning: false,
  presets: BUILT_IN_TOOL_PRESETS,
  result: null,
  clearResult: () => set({ result: null }),
  deletePreset: async (id) => {
    const existing = get().presets.find((preset) => preset.id === id)
    if (existing?.isBuiltIn) throw new Error('Built-in presets cannot be deleted')

    await toolPresetService.deletePreset(id)
    const presets = mergePresets(await toolPresetService.getCustomPresets())
    set({ error: null, presets })
  },
  duplicatePreset: async (id) => {
    const source = get().presets.find((preset) => preset.id === id)
    if (!source) throw new Error(`Tool preset not found: ${id}`)

    const timestamp = new Date().toISOString()
    const preset = ToolPresetSchema.parse({
      ...source,
      createdAt: timestamp,
      id: createPresetId(`${source.label} copy`),
      isBuiltIn: false,
      label: `${source.label} Copy`,
      updatedAt: timestamp,
    })
    const saved = await toolPresetService.savePreset(preset)
    const presets = mergePresets(await toolPresetService.getCustomPresets())

    set({ error: null, presets })
    return saved
  },
  loadPresets: async () => {
    set({ error: null, isLoadingPresets: true })
    try {
      const presets = mergePresets(await toolPresetService.getCustomPresets())
      set({ isLoadingPresets: false, presets })
      return presets
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load tool presets'
      set({ error: message, isLoadingPresets: false })
      throw error
    }
  },
  reset: () =>
    set({
      error: null,
      isLoadingPresets: false,
      isRunning: false,
      presets: BUILT_IN_TOOL_PRESETS,
      result: null,
    }),
  runSession: async (request) => {
    const service = getConfiguredAIService()
    const parsedRequest = ToolSessionRequestSchema.parse(request)
    if (!service) {
      const message = 'AI service is not configured'
      set({ error: message })
      await recordLongTermToolRun(
        toolRunInput(parsedRequest, 'failed', summarizeFailure(message), { error: message }, message),
      )
      throw new Error(message)
    }
    if (parsedRequest.llmOptions.provider !== 'local' && !service.isAvailable()) {
      const message = 'AI API service is not configured'
      set({ error: message })
      await recordLongTermToolRun(
        toolRunInput(parsedRequest, 'failed', summarizeFailure(message), { error: message }, message),
      )
      throw new Error(message)
    }

    set({ error: null, isRunning: true, result: null })
    try {
      const result = await service.runToolSession(parsedRequest)
      const status: ToolRunStatus = result.warnings.length ? 'needs_user_confirmation' : 'success'
      await recordLongTermToolRun(
        toolRunInput(parsedRequest, status, summarizeResult(result), {
          eventCount: result.events.length,
          summary: result.summary,
          warnings: result.warnings,
        }),
      )
      set({ isRunning: false, result })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run tool session'
      await recordLongTermToolRun(
        toolRunInput(parsedRequest, 'failed', summarizeFailure(message), { error: message }, message),
      )
      set({ error: message, isRunning: false })
      throw error
    }
  },
  updatePreset: async (id, changes) => {
    const existing = get().presets.find((preset) => preset.id === id)
    if (!existing) throw new Error(`Tool preset not found: ${id}`)
    if (existing.isBuiltIn) throw new Error('Built-in presets cannot be edited')

    const updated = ToolPresetSchema.parse({
      ...existing,
      ...changes,
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    })
    const saved = await toolPresetService.savePreset(updated)
    const presets = mergePresets(await toolPresetService.getCustomPresets())

    set({ error: null, presets })
    return saved
  },
}))
