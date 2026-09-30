import { describe, expect, it } from 'vitest'

import {
  actionNeedsPlanningDate,
  applyActionScheduleAnswer,
  scheduleGoalPlan,
  userConfirmedNoFixedDeadline,
} from '../../../../src/domain/logic/goalActionScheduling'
import type { GoalActivationPlan, GoalPlanAction } from '../../../../src/domain/types/goalControl'

function action(title: string, patch: Partial<GoalPlanAction> = {}): GoalPlanAction {
  return {
    description: '',
    energy_needed: 'medium',
    estimated_minutes: 60,
    execution_tier: 'standard',
    priority: 'medium',
    status: 'todo',
    title,
    ...patch,
  }
}

function plan(patch: Partial<GoalActivationPlan> = {}): GoalActivationPlan {
  return {
    actions: [action('Review schema'), action('Implement persistence')],
    assumptions: [],
    confidence: { level: 'high', reasons: [] },
    constraints: [],
    dependencies: [
      { predecessor_title: 'Review schema', successor_title: 'Implement persistence' },
    ],
    metrics: [],
    milestones: [
      {
        description: '',
        due_date: '2026-09-27',
        status: 'not_started',
        title: 'Ship foundation',
      },
    ],
    missing_information: [],
    policy: {
      active_tier: 'standard',
      available_days: [],
      buffer_percent: 20,
      weekly_capacity_minutes: 120,
    },
    review_cadence: { frequency: 'weekly', timezone: 'UTC' },
    risks: [],
    safety_confirmation: true,
    summary: 'Build the foundation.',
    target_date: '2026-09-27',
    template_id: 'goal-planner',
    title: 'Foundation plan',
    ...patch,
  }
}

describe('goal action scheduling', () => {
  it('fills missing required dates in dependency and buffered-capacity order', () => {
    const result = scheduleGoalPlan(plan(), { today: '2026-08-31' })

    expect(result.status).toBe('ready')
    expect(result.plan.actions.map((item) => item.due_date)).toEqual(['2026-09-06', '2026-09-13'])
    expect(result.plan.actions[0].metadata).toMatchObject({
      due_date_flexibility: 'flexible',
      due_date_source: 'system_planned',
    })
  })

  it('uses the last configured execution day and preserves existing valid dates', () => {
    const result = scheduleGoalPlan(
      plan({
        actions: [
          action('Review schema', { due_date: '2026-09-02' }),
          action('Implement persistence'),
        ],
        policy: {
          active_tier: 'standard',
          available_days: ['Tuesday', 'Thursday'],
          buffer_percent: 20,
          weekly_capacity_minutes: 180,
        },
      }),
      { today: '2026-08-31' },
    )

    expect(result.status).toBe('ready')
    expect(result.plan.actions[0].due_date).toBe('2026-09-02')
    expect(result.plan.actions[0].metadata).toBeUndefined()
    expect(result.plan.actions[1].due_date).toBe('2026-09-03')
  })

  it('allows undated stretch, done, and skipped actions', () => {
    const actions = [
      action('Optional', { execution_tier: 'stretch' }),
      action('Finished', { status: 'done' }),
      action('Skipped', { status: 'skipped' }),
    ]
    const result = scheduleGoalPlan(plan({ actions, dependencies: [] }), {
      today: '2026-08-31',
    })

    expect(actions.every((item) => !actionNeedsPlanningDate(item))).toBe(true)
    expect(result.status).toBe('ready')
    expect(result.changed).toBe(false)
  })

  it('asks one horizon question when a required action has no target or milestone bound', () => {
    const result = scheduleGoalPlan(
      plan({
        actions: [action('Review schema', { milestone_title: null })],
        dependencies: [],
        milestones: [{ description: '', title: 'Open milestone' }],
        target_date: null,
      }),
      { today: '2026-08-31' },
    )

    expect(result.status).toBe('needs_clarification')
    expect(result.question?.id).toBe('action_schedule')
    expect(result.questionContext).toMatchObject({
      context: 'action_schedule',
      issueCodes: ['missing_horizon'],
    })
  })

  it('uses a rolling four-week plan and moves overflow low-priority work to stretch', () => {
    const actions = Array.from({ length: 5 }, (_value, index) =>
      action(`Rolling action ${index + 1}`, {
        estimated_minutes: 30,
        priority: index === 4 ? 'low' : 'medium',
      }),
    )
    const result = scheduleGoalPlan(
      plan({
        actions,
        dependencies: [],
        milestones: [{ description: '', title: 'Rolling milestone' }],
        policy: {
          active_tier: 'standard',
          available_days: [],
          buffer_percent: 20,
          weekly_capacity_minutes: 60,
        },
        target_date: null,
      }),
      { rollingWithoutDeadline: true, today: '2026-08-31' },
    )

    expect(result.status).toBe('ready')
    expect(result.plan.target_date).toBeNull()
    expect(result.plan.actions.slice(0, 4).every((item) => Boolean(item.due_date))).toBe(true)
    expect(result.plan.actions[4]).toMatchObject({
      due_date: null,
      execution_tier: 'stretch',
      metadata: { rolling_backlog: true },
    })
  })

  it('applies a no-deadline answer deterministically and recognizes confirmed rolling intent', () => {
    const unresolved = scheduleGoalPlan(
      plan({
        actions: [action('Review schema', { milestone_title: null })],
        dependencies: [],
        milestones: [{ description: '', title: 'Open milestone' }],
        target_date: null,
      }),
      { today: '2026-08-31' },
    )
    const answer = applyActionScheduleAnswer(
      unresolved.plan,
      { selected: ['rolling_4w'] },
      unresolved.questionContext!,
      '2026-08-31',
    )

    expect(answer.rollingWithoutDeadline).toBe(true)
    expect(
      userConfirmedNoFixedDeadline(
        [
          {
            role: 'user',
            structured: {
              answers: { deadline: { selected: ['open'] } },
              kind: 'question_answers',
            },
          },
        ],
        '',
      ),
    ).toBe(true)
  })

  it('treats three same-date actions as deadlines and spreads capacity across prior weeks', () => {
    const result = scheduleGoalPlan(
      plan({
        actions: [
          action('Review database schema', { due_date: '2026-09-20', estimated_minutes: 120 }),
          action('Implement migration', { due_date: '2026-09-20', estimated_minutes: 120 }),
          action('Verify data integrity', { due_date: '2026-09-20', estimated_minutes: 120 }),
        ],
        dependencies: [],
        policy: {
          active_tier: 'standard',
          available_days: ['sun'],
          buffer_percent: 20,
          weekly_capacity_minutes: 150,
        },
        target_date: '2026-09-20',
      }),
      { today: '2026-08-31' },
    )

    expect(result.status).toBe('ready')
    expect(result.issues).toEqual([])
    expect(result.plan.actions.every((item) => item.due_date === '2026-09-20')).toBe(true)
  })

  it('rolls an expired system date but blocks an expired user-fixed date', () => {
    const system = scheduleGoalPlan(
      plan({
        actions: [
          action('System date', {
            due_date: '2026-08-01',
            metadata: { due_date_flexibility: 'flexible', due_date_source: 'system_planned' },
          }),
        ],
        dependencies: [],
      }),
      { today: '2026-08-31' },
    )
    expect(system.plan.actions[0].due_date).not.toBe('2026-08-01')
    expect(system.plan.actions[0].metadata).toMatchObject({ due_date_source: 'system_planned' })

    const fixed = scheduleGoalPlan(
      plan({
        actions: [
          action('Fixed date', {
            due_date: '2026-08-01',
            metadata: { due_date_flexibility: 'fixed', due_date_source: 'user_fixed' },
          }),
        ],
        dependencies: [],
      }),
      { today: '2026-08-31' },
    )
    expect(fixed.status).toBe('needs_clarification')
    expect(fixed.issues.some((issue) => issue.message.includes('已过去的固定日期'))).toBe(true)
  })
})
