import FridgeTool from './FridgeTool'
import type { ToolDefinition } from '../types'

export const fridgeTool: ToolDefinition = {
  id: 'fridge',
  label: 'Fridge',
  category: 'planning',
  description: 'Receipt and fridge planning helper.',
  activationPrompt: 'Describe the fridge, receipt, meal planning, or inventory workflow this enabled tool should manage.',
  adapterId: 'generic',
  capabilityTags: ['receipt', 'inventory'],
  instantiable: true,
  routeTags: ['fridge', 'receipt', 'inventory', 'meal planning', 'grocery', 'food'],
  toolName: 'Fridge',
  Component: FridgeTool,
}
