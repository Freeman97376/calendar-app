import type { ComponentType } from 'react'

import type { ToolTemplateMetadata } from '../../domain/types/toolTemplateMetadata'

export type ToolDefinition = ToolTemplateMetadata & {
  Component: ComponentType
}
