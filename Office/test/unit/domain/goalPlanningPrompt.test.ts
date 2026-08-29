import { describe, expect, it } from 'vitest'

import {
  GOAL_PLANNING_SYSTEM_PROMPT,
  buildCheckInSummaryPrompt,
  buildGoalPlanningPrompt,
  parseGoalActivationPlan,
} from '../../../../src/domain/logic/goalPlanningPrompt'
import type { GoalConversationMessage } from '../../../../src/domain/types/goalControl'

function message(index: number): GoalConversationMessage {
  return {
    content: `message-${index}`,
    created_at: `2026-07-14T00:00:${String(index).padStart(2, '0')}Z`,
    message_id: `message-${index}`,
    role: index % 2 ? 'user' : 'assistant',
    structured: {},
    thread_id: 'thread-1',
    updated_at: `2026-07-14T00:00:${String(index).padStart(2, '0')}Z`,
  }
}

describe('goal planning prompt framework', () => {
  it('compresses recent messages according to the active usage mode', () => {
    const messages = Array.from({ length: 20 }, (_value, index) => message(index))
    for (const [mode, expected] of [
      ['economy', 2],
      ['balanced', 6],
      ['quality', 12],
    ] as const) {
      const prompt = buildGoalPlanningPrompt({ mode, threadTitle: 'Build strength', messages })
      const request = JSON.parse(prompt[1].content) as { recentConversation: unknown[] }
      expect(request.recentConversation).toHaveLength(expected)
    }
  })

  it('keeps approval, capacity, safety, and no-hidden-reasoning constraints in the system frame', () => {
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('80%')
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('Never auto-apply')
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('Safety')
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('hidden reasoning')
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('current situation')
    expect(GOAL_PLANNING_SYSTEM_PROMPT).toContain('Never invent a numeric baseline')
  })

  it('keeps confirmed current-situation answers even in economy context', () => {
    const messages = Array.from({ length: 10 }, (_value, index) => message(index))
    messages.unshift({
      ...message(30),
      content: '{"current_stage":{"selected":["returning"]}}',
      role: 'user',
      structured: {
        kind: 'question_answers',
        answers: {
          current_stage: { selected: ['returning'] },
          current_evidence: { selected: ['recent_numbers'], custom: 'Current weight 82 kg' },
          current_constraints: { selected: ['schedule'] },
        },
      },
    })

    const prompt = buildGoalPlanningPrompt({
      mode: 'economy',
      threadTitle: 'Improve fitness',
      messages,
    })
    const request = JSON.parse(prompt[1].content) as {
      confirmedUserContext: { currentSituation: Record<string, unknown> }
      recentConversation: unknown[]
    }

    expect(request.recentConversation).toHaveLength(2)
    expect(request.confirmedUserContext.currentSituation).toMatchObject({
      current_stage: { selected: ['returning'] },
      current_evidence: { selected: ['recent_numbers'], custom: 'Current weight 82 kg' },
      current_constraints: { selected: ['schedule'] },
    })
  })

  it('parses a complete mocked planning response', () => {
    const plan = parseGoalActivationPlan(
      JSON.stringify({
        title: 'Mock fitness plan',
        summary: 'Track completion and weight weekly.',
        policy: { active_tier: 'standard', weekly_capacity_minutes: 240 },
        metrics: [{ name: 'Training completion' }],
        milestones: [{ title: 'Complete base phase' }],
        actions: [{ title: 'Train three times' }],
      }),
    )
    expect(plan.title).toBe('Mock fitness plan')
    expect(plan.metrics[0].name).toBe('Training completion')
  })

  it('keeps economy check-ins rule-only and bounds richer check-in context', () => {
    const messages = Array.from({ length: 20 }, (_value, index) => message(index))
    expect(
      buildCheckInSummaryPrompt({ mode: 'economy', checkIn: {}, recentMessages: messages }),
    ).toBeNull()
    const balanced = buildCheckInSummaryPrompt({
      mode: 'balanced',
      checkIn: { status: 'answered' },
      recentMessages: messages,
    })!
    const quality = buildCheckInSummaryPrompt({
      mode: 'quality',
      checkIn: { status: 'answered' },
      recentMessages: messages,
    })!
    expect(
      (JSON.parse(balanced[1].content) as { recentConversation: unknown[] }).recentConversation,
    ).toHaveLength(6)
    expect(
      (JSON.parse(quality[1].content) as { recentConversation: unknown[] }).recentConversation,
    ).toHaveLength(12)
    expect(balanced[0].content).toContain('Do not change the plan')
  })
})
