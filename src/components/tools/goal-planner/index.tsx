import { goalPlannerToolMetadata } from '../../../domain/types/toolTemplateMetadata'
import GoalPlannerPanel from './GoalPlannerPanel'
import type { ToolDefinition } from '../types'

export const goalPlannerTool: ToolDefinition = {
  ...goalPlannerToolMetadata,
  Component: GoalPlannerPanel,
}
