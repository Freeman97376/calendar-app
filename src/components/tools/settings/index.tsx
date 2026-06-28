import SettingsPanel from '../../settings/SettingsPanel'
import type { ToolDefinition } from '../types'

export const settingsTool: ToolDefinition = {
  id: 'settings',
  label: 'Settings',
  Component: SettingsPanel,
}
