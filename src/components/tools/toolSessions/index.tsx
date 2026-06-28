import ToolSessionsPanel from './ToolSessionsPanel'
import type { ToolDefinition } from '../types'

export const toolSessionsTool: ToolDefinition = {
  id: 'tool-sessions',
  label: 'Tool Sessions',
  Component: ToolSessionsPanel,
}
