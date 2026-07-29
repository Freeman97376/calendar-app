// src/domain/types/index.ts
// Layer 1: Domain — TypeScript types derived from Zod schemas
// ⚠️ APPROVAL REQUIRED before editing this file
//
// All types are re-exported from here for easy import.
// Do NOT define types manually — always derive them from the Zod schemas via z.infer<>.

export type { Event } from '../schemas/event.schema'
export type { EventType } from '../schemas/eventType.schema'
export type { RecurrenceRule, Weekday } from '../schemas/recurrence.schema'
export type { Todo, TodoLongProject } from '../schemas/todo.schema'
export type {
  AIAction,
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIEnabledToolRouteRequest,
  AIEnabledToolRouteResult,
  AIProgressToolActionUpsert,
  AIProgressToolEventDraft,
  AIProgressToolKind,
  AIProgressToolMilestoneUpsert,
  AIProgressToolRequest,
  AIProgressToolResult,
  AIToolActivationField,
  AIToolActivationRequest,
  AIToolActivationResult,
  AIStep,
} from '../schemas/ai.schema'
export type {
  AIProvider,
  BackendConfigStatus,
  BackendConfigUpdate,
  RuntimeConfig,
} from '../schemas/config.schema'
export type {
  FridgeInventoryItem,
  FridgeItemCandidate,
  FridgeReceiptAnalysisResponse,
  FridgeReminderSuggestion,
  FridgeShelfLifePrediction,
} from '../schemas/fridge.schema'
export type {
  ToolPreset,
  ToolSessionEventDraft,
  ToolSessionField,
  ToolSessionLlmOptions,
  ToolSessionProvider,
  ToolSessionRequest,
  ToolSessionResult,
} from '../schemas/toolSession.schema'
export type { AppCapabilities, AppUser, BootstrapResponse } from '../schemas/auth.schema'
export type {
  DesktopDistribution,
  DesktopUpdateInfo,
  DesktopUpdateProgress,
  DesktopUpdateStatus,
  PreUpdateBackup,
} from './desktopUpdate'

// ── Utility types ────────────────────────────────────────────────────────────

/** A date range used for querying events within a view window */
export interface DateRange {
  start: string // ISO datetime string
  end: string // ISO datetime string
}

/** Calendar view modes */
export type CalendarView = 'month' | 'week' | 'day'
