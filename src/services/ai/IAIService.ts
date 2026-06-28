// src/services/ai/IAIService.ts
// Layer 2: Services — AI provider interface
// ⚠️ APPROVAL REQUIRED before editing this file
// See ADR-003: office/planning/decisions/adr-003-ai-structured-output.md

import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIProgressToolRequest,
  AIProgressToolResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../domain/types'
import type {
  AIConversationContext,
  AIConversationMessage,
} from '../../domain/types/aiConversation'

export type {
  AIConversationContext,
  AIConversationMessage,
} from '../../domain/types/aiConversation'

/**
 * All AI providers (API and local) implement this interface.
 * Consumers (useAI hook, aiStore) only depend on this interface, never on a concrete provider.
 */
export interface IAIService {
  /**
   * Takes a user's goal description and returns a structured breakdown of steps.
   * Output is always validated against AIBreakdownResultSchema (Zod) before returning.
   *
   * @throws ZodError if the AI returns a response that doesn't match the schema
   * @throws Error if the network request fails
   */
  breakdownGoal(goal: string): Promise<AIBreakdownResult>

  /**
   * Takes a natural-language command plus current frontend state and returns
   * explicit actions the UI can review and apply.
   */
  planCalendarActions(
    command: string,
    context: AICalendarContext,
  ): Promise<AICalendarActionPlan>

  /**
   * Runs a configured tool-session prompt and returns validated calendar event drafts.
   */
  runToolSession(request: ToolSessionRequest): Promise<ToolSessionResult>

  /**
   * Runs a memory-backed AI demo tool that can inspect compact calendar and
   * project progress context, then returns validated progress and calendar
   * recommendations for user review.
   */
  runProgressTool(request: AIProgressToolRequest): Promise<AIProgressToolResult>

  /**
   * Free-form multi-turn assistant conversation. When a context is provided,
   * the model should use it as grounding and ask clarifying questions before
   * suggesting edits if the user's instruction is ambiguous.
   */
  continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult>

  /** Returns true if the service is configured and ready to use */
  isAvailable(): boolean
}
