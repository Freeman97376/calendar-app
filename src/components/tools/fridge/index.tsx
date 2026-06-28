import FridgeTool from './FridgeTool'
import type { ToolDefinition } from '../types'

export const fridgeTool: ToolDefinition = {
  id: 'fridge',
  label: 'Fridge',
  category: 'planning',
  description: 'Receipt and fridge planning helper.',
  capabilityTags: ['receipt', 'inventory'],
  Component: FridgeTool,
}
