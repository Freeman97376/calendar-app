import { describe, expect, it } from 'vitest'

import { buildActiveToolPromptFramework } from '../../../../src/domain/logic/activeToolPrompt'
import {
  activeToolFromProject,
  activeToolRouteSummary,
  createActiveToolMetadata,
} from '../../../../src/domain/logic/enabledTools'
import type { LongTermGoal, LongTermProject } from '../../../../src/domain/types/longTermMemory'

const now = '2026-07-14T12:00:00.000Z'

describe('active tool prompt framework', () => {
  it('includes the mock long-term goal, tool characteristics, and ordered plan', () => {
    const mockPlan = [
      {
        description: 'Map the current process and constraints',
        id: 'path-1',
        order: 1,
        title: 'Audit workflow',
      },
      {
        description: 'Release the validated automation',
        id: 'path-2',
        order: 2,
        title: 'Ship rollout',
      },
    ]
    const goal: LongTermGoal = {
      created_at: now,
      description: 'Make recurring planning reliable',
      goal_id: 'goal-1',
      metadata: {},
      status: 'active',
      title: 'Reliable planning operations',
      updated_at: now,
    }
    const project: LongTermProject = {
      created_at: now,
      description: 'Coordinate the planning workflow',
      goal_id: goal.goal_id,
      metadata: createActiveToolMetadata({
        activationSummary: 'Turn a long-term outcome into reviewable weekly work.',
        implementationPath: mockPlan,
        instanceAlias: 'Planning Copilot',
        longTermGoalLabel: 'Build a repeatable planning system',
        parentTemplateId: 'goal-planner',
        parentTemplateLabel: 'Goal Planner',
        routeTags: ['planning', 'weekly review'],
        toolFeatures: ['Durable progress memory', 'Preview-only calendar drafts'],
        toolName: 'Goal Planner',
      }),
      project_id: 'project-1',
      status: 'active',
      title: 'Planning Copilot',
      updated_at: now,
    }
    const instance = activeToolFromProject(project, [goal])

    expect(instance).not.toBeNull()
    const prompt = buildActiveToolPromptFramework(instance!)

    expect(prompt).toContain('Active Tool Prompt Framework v1')
    expect(prompt).toContain('[long_term_goal]\nBuild a repeatable planning system')
    expect(prompt).toContain('- Durable progress memory')
    expect(prompt).toContain('- Preview-only calendar drafts')
    expect(prompt).toContain('1. Audit workflow — Map the current process and constraints')
    expect(prompt).toContain('2. Ship rollout — Release the validated automation')

    expect(activeToolRouteSummary(instance!)).toMatchObject({
      implementationPlan: [
        'Audit workflow: Map the current process and constraints',
        'Ship rollout: Release the validated automation',
      ],
      longTermGoalLabel: 'Build a repeatable planning system',
      toolFeatures: ['Durable progress memory', 'Preview-only calendar drafts'],
    })
  })
})
