import ToolSessionsPanel from './ToolSessionsPanel'
import type { ToolDefinition } from '../types'

export const toolSessionsTool: ToolDefinition = {
  id: 'tool-sessions',
  label: 'Tool Sessions',
  category: 'planning',
  description: 'Reusable prompt presets that create calendar event drafts.',
  capabilityTags: ['llm', 'calendar'],
  Component: ToolSessionsPanel,
}
