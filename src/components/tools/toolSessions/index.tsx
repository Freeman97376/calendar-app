import ToolSessionsPanel from './ToolSessionsPanel'
import type { ToolDefinition } from '../types'

export const toolSessionsTool: ToolDefinition = {
  id: 'tool-sessions',
  label: 'Tool Sessions',
  category: 'planning',
  description: 'Reusable prompt presets that create calendar event drafts.',
  activationPrompt: 'Describe the recurring planning workflow this enabled tool should manage.',
  adapterId: 'generic',
  capabilityTags: ['llm', 'calendar'],
  instantiable: true,
  routeTags: ['tool session', 'preset', 'calendar draft', 'planning session'],
  toolName: 'Tool Sessions',
  Component: ToolSessionsPanel,
}
