import { ToolPresetSchema } from '../../domain/schemas/toolSession.schema'
import type { ToolPreset } from '../../domain/types'
import type { IToolPresetService } from './IToolPresetService'

export class LocalToolPresetService implements IToolPresetService {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly key = 'calendar_tool_presets',
  ) {}

  async deletePreset(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((preset) => preset.id !== id))
  }

  async getCustomPresets(): Promise<ToolPreset[]> {
    return this.readAll()
  }

  async savePreset(preset: ToolPreset): Promise<ToolPreset> {
    const parsed = ToolPresetSchema.parse({ ...preset, isBuiltIn: false })
    const presets = this.readAll()
    const index = presets.findIndex((candidate) => candidate.id === parsed.id)
    const next = [...presets]

    if (index >= 0) {
      next[index] = parsed
    } else {
      next.push(parsed)
    }

    this.writeAll(next)
    return parsed
  }

  private readAll(): ToolPreset[] {
    const raw = this.storage.getItem(this.key)

    if (!raw) return []

    try {
      return ToolPresetSchema.array()
        .parse(JSON.parse(raw))
        .filter((preset) => !preset.isBuiltIn)
    } catch {
      return []
    }
  }

  private writeAll(presets: ToolPreset[]) {
    this.storage.setItem(
      this.key,
      JSON.stringify(
        ToolPresetSchema.array().parse(presets.map((preset) => ({ ...preset, isBuiltIn: false }))),
      ),
    )
  }
}
