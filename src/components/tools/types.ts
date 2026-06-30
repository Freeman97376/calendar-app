import type { ComponentType } from 'react'

export type ToolDefinition = {
  activationPrompt?: string
  adapterId?: 'ai-progress' | 'generic'
  capabilityTags?: string[]
  category?: 'system' | 'planning' | 'ai-demo'
  description?: string
  id: string
  instantiable?: boolean
  label: string
  routeTags?: string[]
  toolKind?: 'fitness' | 'agent-learning'
  toolName?: string
  Component: ComponentType
}
