import GoalPlannerPanel from './GoalPlannerPanel'
import type { ToolDefinition } from '../types'

export const goalPlannerTool: ToolDefinition = {
  id: 'goal-planner',
  label: 'Goal Planner',
  Component: GoalPlannerPanel,
}
