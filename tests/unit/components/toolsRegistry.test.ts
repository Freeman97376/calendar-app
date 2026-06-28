import { describe, expect, it } from 'vitest'

import { TOOL_DEFINITIONS } from '../../../src/components/tools/registry'

describe('tools registry', () => {
  it('registers each Tools panel tool through a module entry', () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.id)).toEqual([
      'settings',
      'tool-sessions',
      'fridge',
      'goal-planner',
    ])
    expect(TOOL_DEFINITIONS.every((tool) => tool.label && tool.Component)).toBe(true)
  })
})
