import { describe, expect, it } from 'vitest'

import { TOOL_DEFINITIONS } from '../../../../src/components/tools/registry'

describe('tools registry', () => {
  it('registers each Tools panel tool through a module entry', () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.id)).toEqual([
      'settings',
      'tool-sessions',
      'fitness-ai',
      'agent-learning',
      'seo-learning',
      'fridge',
      'goal-planner',
    ])
    expect(TOOL_DEFINITIONS.every((tool) => tool.label && tool.Component)).toBe(true)
    expect(
      TOOL_DEFINITIONS.filter((tool) => tool.category === 'ai-demo').map((tool) => tool.id),
    ).toEqual(['fitness-ai', 'agent-learning', 'seo-learning'])
    expect(
      TOOL_DEFINITIONS.filter((tool) => tool.category !== 'system').every(
        (tool) => tool.instantiable === true && Boolean(tool.adapterId),
      ),
    ).toBe(true)
    expect(TOOL_DEFINITIONS.find((tool) => tool.id === 'settings')).toMatchObject({
      instantiable: false,
    })
  })
})
