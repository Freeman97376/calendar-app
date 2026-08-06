import SettingsPanel from '../../settings/SettingsPanel'
import type { ToolDefinition } from '../types'

export const settingsTool: ToolDefinition = {
  id: 'settings',
  label: 'Settings',
  category: 'system',
  description: 'Runtime provider and app configuration.',
  capabilityTags: ['config'],
  instantiable: false,
  toolName: 'Settings',
  Component: SettingsPanel,
}
