import AgentLearningTool from './AgentLearningTool'
import FitnessAITool from './FitnessAITool'
import type { ToolDefinition } from '../types'

export const fitnessAITool: ToolDefinition = {
  id: 'fitness-ai',
  label: 'Fitness AI',
  category: 'ai-demo',
  description: 'Memory-backed fitness planner with progress and calendar previews.',
  capabilityTags: ['memory', 'calendar', 'progress'],
  Component: FitnessAITool,
}

export const agentLearningTool: ToolDefinition = {
  id: 'agent-learning',
  label: 'Agent Learning',
  category: 'ai-demo',
  description: 'Memory-backed AI agent learning route with milestones.',
  capabilityTags: ['memory', 'learning', 'progress'],
  Component: AgentLearningTool,
}
