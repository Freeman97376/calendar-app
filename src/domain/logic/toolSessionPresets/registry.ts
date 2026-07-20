import { ToolPresetSchema } from '../../schemas/toolSession.schema'
import type { ToolPreset } from '../../types'
import { diningPlannerPreset } from './diningPlanner'
import {
  TOOL_SESSION_OUTPUT_SCHEMA_KEY,
  TOOL_SESSION_OUTPUT_SCHEMA_PREVIEW,
} from './shared/outputSchema'
import { workoutPlannerPreset } from './workoutPlanner'

export { TOOL_SESSION_OUTPUT_SCHEMA_KEY, TOOL_SESSION_OUTPUT_SCHEMA_PREVIEW }

export const BUILT_IN_TOOL_PRESETS: ToolPreset[] = ToolPresetSchema.array().parse([
  diningPlannerPreset,
  workoutPlannerPreset,
])

export function getBuiltInToolPreset(id: string): ToolPreset | undefined {
  return BUILT_IN_TOOL_PRESETS.find((preset) => preset.id === id)
}
