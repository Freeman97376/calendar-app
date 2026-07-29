import { fridgeToolMetadata } from '../../../domain/types/toolTemplateMetadata'
import FridgeTool from './FridgeTool'
import type { ToolDefinition } from '../types'

export const fridgeTool: ToolDefinition = {
  ...fridgeToolMetadata,
  Component: FridgeTool,
}
