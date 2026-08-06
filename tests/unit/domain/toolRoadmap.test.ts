import { describe, expect, it } from 'vitest'

import {
  buildToolRoadmap,
  implementationPathFromText,
  implementationPathToText,
} from '../../../src/domain/logic/toolRoadmap'
import {
  activeToolFromProject,
  createActiveToolMetadata,
} from '../../../src/domain/logic/enabledTools'
import type {
  LongTermActionItem,
  LongTermGoal,
  LongTermMilestone,
  LongTermProgressLog,
  LongTermProject,
  LongTermToolRun,
} from '../../../src/domain/types/longTermMemory'

const now = '2026-07-08T12:00:00.000Z'

function goal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    created_at: now,
    description: 'Ship the launch workflow',
    goal_id: 'goal-1',
    metadata: {},
    status: 'active',
    title: 'Launch goal',
    updated_at: now,
    ...overrides,
  }
}

function project(overrides: Partial<LongTermProject> = {}): LongTermProject {
  return {
    created_at: now,
    description: 'Plan the launch',
    goal_id: 'goal-1',
    metadata: {},
    project_id: 'project-1',
    status: 'active',
    title: 'Launch project',
    updated_at: now,
    ...overrides,
  }
}

function milestone(overrides: Partial<LongTermMilestone> = {}): LongTermMilestone {
  return {
    created_at: now,
    description: '',
    due_date: null,
    metadata: {},
    milestone_id: 'milestone-1',
    project_id: 'project-1',
    status: 'not_started',
    title: 'Milestone',
    updated_at: now,
    ...overrides,
  }
}

function action(overrides: Partial<LongTermActionItem> = {}): LongTermActionItem {
  return {
    action_id: 'action-1',
    created_at: now,
    description: '',
    due_date: null,
    metadata: {},
    milestone_id: null,
    project_id: 'project-1',
    status: 'todo',
    title: 'Action',
    updated_at: now,
    ...overrides,
  }
}

describe('buildToolRoadmap', () => {
  it('uses saved implementation path metadata before milestone fallback', () => {
    const roadmap = buildToolRoadmap(
      goal(),
      project({
        metadata: {
          implementationPath: [
            { id: 'step-2', order: 2, title: 'Beta' },
            { description: 'Define the launch', id: 'step-1', order: 1, title: 'Alpha' },
          ],
          longTermGoalLabel: 'Customer launch',
        },
      }),
      [milestone({ title: 'Ignored fallback' })],
      [],
      [],
      [],
    )

    expect(roadmap.goalTitle).toBe('Customer launch')
    expect(roadmap.pathSource).toBe('metadata')
    expect(roadmap.steps.map((step) => step.title)).toEqual(['Alpha', 'Beta'])
    expect(roadmap.steps[0]).toMatchObject({ description: 'Define the launch', order: 1 })
  })

  it('falls back to milestones grouped with their actions', () => {
    const roadmap = buildToolRoadmap(
      goal(),
      project(),
      [
        milestone({ due_date: '2026-07-20', milestone_id: 'milestone-2', title: 'Second' }),
        milestone({
          due_date: '2026-07-10',
          milestone_id: 'milestone-1',
          status: 'done',
          title: 'First',
        }),
      ],
      [
        action({ action_id: 'action-1', milestone_id: 'milestone-1', status: 'done' }),
        action({ action_id: 'action-2', milestone_id: 'milestone-1', status: 'skipped' }),
      ],
      [],
      [],
    )

    expect(roadmap.pathSource).toBe('milestones')
    expect(roadmap.steps.map((step) => step.title)).toEqual(['First', 'Second'])
    expect(roadmap.steps[0]).toMatchObject({
      actionCount: 1,
      completedActionCount: 1,
      status: 'done',
    })
    expect(roadmap.progressSummary).toEqual({
      completed: 1,
      percent: 100,
      source: 'actions',
      total: 1,
    })
  })

  it('falls back to actions and then activation summary', () => {
    const actionsRoadmap = buildToolRoadmap(
      goal(),
      project(),
      [],
      [action({ due_date: '2026-07-09', title: 'Write brief' })],
      [],
      [],
    )

    expect(actionsRoadmap.pathSource).toBe('actions')
    expect(actionsRoadmap.steps[0]).toMatchObject({ dueDate: '2026-07-09', title: 'Write brief' })

    const summaryRoadmap = buildToolRoadmap(
      null,
      project({ metadata: { activationSummary: 'Clarify and sequence the work' } }),
      [],
      [],
      [],
      [],
    )

    expect(summaryRoadmap.pathSource).toBe('summary')
    expect(summaryRoadmap.steps[0].title).toBe('Clarify and sequence the work')
  })

  it('returns recent progress and tool runs as progress memory', () => {
    const progress: LongTermProgressLog[] = [
      {
        action_id: null,
        created_at: '2026-07-07T12:00:00.000Z',
        details: '',
        goal_id: 'goal-1',
        log_type: 'update',
        metadata: {},
        progress_id: 'progress-1',
        project_id: 'project-1',
        summary: 'Older update',
        updated_at: now,
      },
      {
        action_id: null,
        created_at: '2026-07-08T12:00:00.000Z',
        details: '',
        goal_id: 'goal-1',
        log_type: 'review',
        metadata: {},
        progress_id: 'progress-2',
        project_id: 'project-1',
        summary: 'Latest update',
        updated_at: now,
      },
    ]
    const toolRuns: LongTermToolRun[] = [
      {
        created_at: now,
        error: '',
        goal_id: 'goal-1',
        id: 'tool-run-1',
        input: {},
        input_summary: '',
        intent: 'Review',
        output: {},
        output_summary: 'Reviewed roadmap',
        project_id: 'project-1',
        related_goal_id: 'goal-1',
        related_project_id: 'project-1',
        status: 'success',
        tool_name: 'Goal Planner',
        tool_run_id: 'tool-run-1',
        updated_at: now,
      },
    ]

    const roadmap = buildToolRoadmap(goal(), project(), [], [], progress, toolRuns)

    expect(roadmap.recentProgress.map((entry) => entry.summary)).toEqual([
      'Latest update',
      'Older update',
    ])
    expect(roadmap.recentToolRuns[0].output_summary).toBe('Reviewed roadmap')
  })
})

describe('implementation path helpers', () => {
  it('round trips path text into structured metadata', () => {
    const path = implementationPathFromText('Research | Decide constraints\nBuild')

    expect(path).toEqual([
      { description: 'Decide constraints', id: 'path-1', order: 1, title: 'Research' },
      { description: undefined, id: 'path-2', order: 2, title: 'Build' },
    ])
    expect(implementationPathToText(path)).toBe('Research | Decide constraints\nBuild')
  })
})

describe('active tool roadmap metadata', () => {
  it('parses new roadmap metadata while accepting legacy metadata', () => {
    const metadata = createActiveToolMetadata({
      activationSummary: 'Manage launch',
      implementationPath: [{ id: 'path-1', order: 1, title: 'Define' }],
      instanceAlias: 'Launch Ops',
      longTermGoalLabel: 'Launch',
      parentTemplateId: 'goal-planner',
      parentTemplateLabel: 'Goal Planner',
      toolName: 'Goal Planner',
    })

    const active = activeToolFromProject(project({ metadata }), [goal()])
    const legacy = activeToolFromProject(
      project({
        metadata: {
          activationSummary: 'Legacy',
          instanceAlias: 'Legacy Ops',
          parentTemplateId: 'goal-planner',
          sourceToolId: 'goal-planner',
          toolCategory: 'active-tool',
          toolName: 'Goal Planner',
        },
      }),
      [goal()],
    )

    expect(active).toMatchObject({
      implementationPath: [{ id: 'path-1', order: 1, title: 'Define' }],
      longTermGoalLabel: 'Launch',
      roadmapFormatVersion: 1,
    })
    expect(legacy).toMatchObject({
      implementationPath: [],
      roadmapFormatVersion: 1,
    })
  })
})
