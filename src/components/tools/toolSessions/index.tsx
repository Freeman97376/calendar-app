import { toolSessionsToolMetadata } from '../../../domain/types/toolTemplateMetadata'
import ToolSessionsPanel from './ToolSessionsPanel'
import type { ToolDefinition } from '../types'

export const toolSessionsTool: ToolDefinition = {
  ...toolSessionsToolMetadata,
  Component: ToolSessionsPanel,
}
