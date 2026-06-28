import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_TOOL_PRESETS,
  getBuiltInToolPreset,
} from '../../../src/domain/logic/toolSessionPresets/registry'

describe('tool session preset registry', () => {
  it('loads built-in presets from individual preset modules', () => {
    expect(BUILT_IN_TOOL_PRESETS.map((preset) => preset.id)).toEqual([
      'dining-planner',
      'workout-planner',
    ])
    expect(getBuiltInToolPreset('dining-planner')?.label).toBe('Dining Planner')
    expect(getBuiltInToolPreset('workout-planner')?.label).toBe('Workout Planner')
  })
})
