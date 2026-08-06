import { agentLearningTool, fitnessAITool, seoLearningTool } from './ai-demo'
import { fridgeTool } from './fridge'
import { goalPlannerTool } from './goal-planner'
import { settingsTool } from './settings'
import { toolSessionsTool } from './toolSessions'
import type { ToolDefinition } from './types'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  settingsTool,
  toolSessionsTool,
  fitnessAITool,
  agentLearningTool,
  seoLearningTool,
  fridgeTool,
  goalPlannerTool,
]
