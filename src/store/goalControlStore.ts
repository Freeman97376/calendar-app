import { buildCheckInSummaryPrompt, buildGoalPlanningPrompt, parseGoalActivationPlan } from '../domain/logic/goalPlanningPrompt'
import type { AIUsageMode, GoalConversationMessage } from '../domain/types/goalControl'
import { apiUrl, authenticatedFetch, savePreferences } from '../services/appApiClient'
import { notifyPendingGoalCheckIns } from '../services/desktopNotification'
import { goalControlClient } from '../services/goalControlClient'

export const goalControlGateway = {
  ...goalControlClient,
  savePreferences,
  notifyPendingGoalCheckIns,
  async answerCheckIn(checkInId: string, answers: Record<string, unknown>) {
    const result = await goalControlClient.answerCheckIn(checkInId, answers)
    if (!result.summary?.requires_ai_summary) return result
    try {
      const dashboard = await goalControlClient.dashboard(result.project_id)
      const mode = dashboard.usage.effective_mode
      const thread = result.thread_id ? await goalControlClient.getThread(result.thread_id) : null
      const messages = buildCheckInSummaryPrompt({ mode, checkIn: result, recentMessages: thread?.messages ?? [] })
      if (!messages) return result
      const operation = result.includes_review && mode === 'quality' ? 'weekly_review' : result.includes_review ? 'review' : 'routine'
      const response = await authenticatedFetch(apiUrl('/api/ai/chat/completions'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ _calendarOperation: operation, _calendarProjectId: result.project_id, _calendarThreadId: result.thread_id || undefined, messages }),
      })
      if (!response.ok) return result
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const content = payload.choices?.[0]?.message?.content?.trim()
      if (content && result.thread_id) await goalControlClient.addMessage(result.thread_id, { role: 'assistant', content, structured: { kind: 'check_in_summary', check_in_id: checkInId } })
    } catch {
      // The check-in is already safely stored. AI summarization is optional and must not block manual control.
    }
    return result
  },
  async generatePlan(input: {
    mode: AIUsageMode
    threadId: string
    threadTitle: string
    rollingSummary: string
    messages: GoalConversationMessage[]
  }) {
    const response = await authenticatedFetch(apiUrl('/api/ai/chat/completions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        _calendarOperation: 'goal_plan',
        _calendarThreadId: input.threadId,
        messages: buildGoalPlanningPrompt({ mode: input.mode, threadTitle: input.threadTitle, rollingSummary: input.rollingSummary, messages: input.messages }),
        response_format: { type: 'json_object' },
      }),
    })
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || `Planning failed (${response.status})`)
    return parseGoalActivationPlan(payload.choices?.[0]?.message?.content || '')
  },
}
