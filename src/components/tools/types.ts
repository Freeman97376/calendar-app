import type { ComponentType } from 'react'

export type ToolDefinition = {
  capabilityTags?: string[]
  category?: 'system' | 'planning' | 'ai-demo'
  description?: string
  id: string
  label: string
  Component: ComponentType
}
