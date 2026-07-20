import FitnessAITool from './FitnessAITool'
import { AgentLearningTool, SeoLearningTool } from './LearningAssistantTool'
import type { ToolDefinition } from '../types'

export const fitnessAITool: ToolDefinition = {
  id: 'fitness-ai',
  label: 'Fitness AI',
  category: 'ai-demo',
  description: 'Memory-backed fitness planner with progress and calendar previews.',
  activationPrompt:
    'Describe the training goal, level, equipment, limits, weekly frequency, and session length.',
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'calendar', 'progress'],
  instantiable: true,
  routeTags: ['fitness', 'workout', 'training', 'exercise', 'gym', 'strength', 'running'],
  toolKind: 'fitness',
  toolName: 'Fitness AI',
  Component: FitnessAITool,
}

export const agentLearningTool: ToolDefinition = {
  id: 'agent-learning',
  label: 'Agent Learning',
  category: 'ai-demo',
  description: 'Learning Assistant alias for AI agent learning milestones.',
  activationPrompt:
    'Describe the agent skill goal, current level, weekly time, and target learning outcome.',
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'learning', 'progress'],
  instantiable: true,
  routeTags: ['agent', 'learning', 'prompt', 'tool use', 'retrieval', 'memory', 'evaluation'],
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
  Component: AgentLearningTool,
}

export const seoLearningTool: ToolDefinition = {
  id: 'seo-learning',
  label: 'SEO Learning',
  category: 'ai-demo',
  description: 'Learning Assistant alias for SEO learning milestones.',
  activationPrompt:
    'Describe the SEO learning goal, current level, weekly time, and target outcome.',
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'learning', 'progress', 'seo'],
  instantiable: true,
  routeTags: [
    'seo',
    'keyword',
    'search engine',
    'ranking',
    'content',
    'technical seo',
    'analytics',
  ],
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
  Component: SeoLearningTool,
}
