import type { ComponentType } from 'react'

export type ToolDefinition = {
  id: string
  label: string
  Component: ComponentType
}
