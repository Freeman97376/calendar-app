import {
  agentLearningToolMetadata,
  fitnessAIToolMetadata,
  seoLearningToolMetadata,
} from '../../../domain/types/toolTemplateMetadata'
import FitnessAITool from './FitnessAITool'
import { AgentLearningTool, SeoLearningTool } from './LearningAssistantTool'
import type { ToolDefinition } from '../types'

export const fitnessAITool: ToolDefinition = {
  ...fitnessAIToolMetadata,
  Component: FitnessAITool,
}

export const agentLearningTool: ToolDefinition = {
  ...agentLearningToolMetadata,
  Component: AgentLearningTool,
}

export const seoLearningTool: ToolDefinition = {
  ...seoLearningToolMetadata,
  Component: SeoLearningTool,
}
