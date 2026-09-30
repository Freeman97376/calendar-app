import { describe, expect, it } from 'vitest'

import {
  activeToolClarificationQuestions,
  applySkippedClarificationImpact,
  fitnessSafetyWasConfirmed,
  planBlockingIssues,
} from '../../../../src/domain/logic/activeToolOnboarding'
import { GoalActivationPlanSchema } from '../../../../src/domain/schemas/goalActivationPlan.schema'
import {
  fitnessAIToolMetadata,
  goalPlannerToolMetadata,
} from '../../../../src/domain/types/toolTemplateMetadata'
import type {
  ActiveToolOnboardingSeed,
  GoalActivationPlan,
} from '../../../../src/domain/types/goalControl'

function seed(
  template: ActiveToolOnboardingSeed['template'],
  originalRequest: string,
): ActiveToolOnboardingSeed {
  return {
    activationForm: {},
    journeyId: 'journey-1',
    originalRequest,
    source: 'ai-assistant',
    template,
  }
}

function plan(patch: Partial<GoalActivationPlan> = {}): GoalActivationPlan {
  return {
    actions: [
      {
        description: '',
        due_date: '2026-09-01',
        energy_needed: 'medium',
        estimated_minutes: 30,
        execution_tier: 'standard',
        priority: 'medium',
        title: 'Do the next action',
      },
    ],
    assumptions: [],
    confidence: { level: 'medium', reasons: [] },
    constraints: [],
    metrics: [],
    milestones: [{ description: '', due_date: '2026-09-01', title: 'Reach the milestone' }],
    missing_information: [],
    policy: {},
    review_cadence: { frequency: 'weekly' },
    risks: [],
    safety_confirmation: true,
    summary: 'A measurable plan.',
    template_id: 'goal-planner',
    title: 'Plan title',
    ...patch,
  }
}

describe('active tool onboarding rules', () => {
  it('asks at most three missing Goal Planner questions and skips explicit facts', () => {
    expect(
      activeToolClarificationQuestions(seed(goalPlannerToolMetadata, 'Launch a project')),
    ).toHaveLength(3)

    const explicit = activeToolClarificationQuestions(
      seed(
        goalPlannerToolMetadata,
        'Launch in 8 weeks with 4 hours per week; the budget is the main constraint.',
      ),
    )
    expect(explicit).toEqual([])
  })

  it('requires explicit fitness safety information and recognizes its answer', () => {
    const fitnessSeed = seed(fitnessAIToolMetadata, 'Build a three-day fitness routine')
    expect(activeToolClarificationQuestions(fitnessSeed)[0].id).toBe('fitness_safety_constraints')
    expect(fitnessSafetyWasConfirmed([], fitnessSeed)).toBe(false)
    expect(
      fitnessSafetyWasConfirmed(
        [
          {
            structured: {
              answers: {
                fitness_safety_constraints: { selected: ['none_known'] },
              },
              kind: 'question_answers',
            },
          },
        ],
        fitnessSeed,
      ),
    ).toBe(true)
  })

  it('blocks incomplete plans and Fitness AI plans without safety confirmation', () => {
    expect(
      planBlockingIssues(
        plan({
          actions: [],
          missing_information: [
            { blocking: true, id: 'capacity', impact: 'Cannot size work', label: 'Capacity' },
          ],
          safety_confirmation: false,
          template_id: 'fitness-ai',
        }),
      ),
    ).toEqual([
      'At least one Action is required.',
      'Resolve blocking missing information before activation.',
      'Fitness safety constraints require explicit confirmation.',
    ])
  })

  it('blocks required actions without a planning date but allows undated stretch work', () => {
    const required = plan({
      actions: [{ ...plan().actions[0], due_date: null, title: 'Review current schema' }],
    })
    const stretch = plan({
      actions: [
        {
          ...plan().actions[0],
          due_date: null,
          execution_tier: 'stretch',
          title: 'Optional polish',
        },
      ],
    })

    expect(planBlockingIssues(required)).toContain('必要行动缺少计划完成日：Review current schema')
    expect(planBlockingIssues(stretch)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('计划完成日')]),
    )
  })

  it('marks only material non-safety questions as optional', () => {
    const goalQuestions = activeToolClarificationQuestions(seed(goalPlannerToolMetadata, 'Launch'))
    expect(goalQuestions.every((question) => question.required === false)).toBe(true)
    expect(activeToolClarificationQuestions(seed(fitnessAIToolMetadata, 'Train'))[0].required).toBe(
      true,
    )
  })

  it('accepts safety facts that the user explicitly supplied in the original request', () => {
    expect(
      fitnessSafetyWasConfirmed(
        [],
        seed(fitnessAIToolMetadata, 'Train twice weekly with knee pain'),
      ),
    ).toBe(true)
  })

  it('does not mistake an ordinary scheduling limit for fitness safety confirmation', () => {
    const fitnessSeed = seed(fitnessAIToolMetadata, '每周训练3次，每次45分钟，限制在晚上')

    expect(activeToolClarificationQuestions(fitnessSeed)[0].id).toBe('fitness_safety_constraints')
    expect(fitnessSafetyWasConfirmed([], fitnessSeed)).toBe(false)
  })

  it('accepts an explicit Chinese no-injury statement as fitness safety confirmation', () => {
    const fitnessSeed = seed(fitnessAIToolMetadata, '每周训练3次，没有已知伤病')

    expect(
      activeToolClarificationQuestions(fitnessSeed).some(
        (question) => question.id === 'fitness_safety_constraints',
      ),
    ).toBe(false)
    expect(fitnessSafetyWasConfirmed([], fitnessSeed)).toBe(true)
  })

  it('keeps skipped optional facts visible and lowers confidence', () => {
    const impacted = applySkippedClarificationImpact(
      plan({ confidence: { level: 'high', reasons: [] } }),
      [
        {
          structured: {
            answers: {
              capacity: {
                accuracyImpact: 'Workload may be less realistic.',
                label: 'Weekly capacity',
                skipped: true,
              },
            },
            kind: 'question_answers',
          },
        },
      ],
    )
    expect(impacted.missing_information).toContainEqual({
      blocking: false,
      id: 'skipped-capacity',
      impact: 'Workload may be less realistic.',
      label: 'Weekly capacity',
    })
    expect(impacted.confidence.level).toBe('medium')
  })

  it('rejects unknown AI fields at the root and nested levels', () => {
    expect(GoalActivationPlanSchema.safeParse({ ...plan(), model_reply: 'hidden' }).success).toBe(
      false,
    )
    expect(
      GoalActivationPlanSchema.safeParse({
        ...plan(),
        actions: [{ ...plan().actions[0], calendar_write: true }],
      }).success,
    ).toBe(false)
  })
})
