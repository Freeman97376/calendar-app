import type { ToolPreset } from '../../domain/types'

export type ToolPresetUpdate = Partial<
  Pick<ToolPreset, 'defaultLlmOptions' | 'description' | 'fields' | 'label' | 'prompt'>
>

export interface IToolPresetService {
  deletePreset(id: string): Promise<void>
  getCustomPresets(): Promise<ToolPreset[]>
  savePreset(preset: ToolPreset): Promise<ToolPreset>
}
