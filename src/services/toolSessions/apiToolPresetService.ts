import { ToolPresetSchema } from '../../domain/schemas/toolSession.schema'
import type { ToolPreset } from '../../domain/types'
import { apiUrl, authenticatedFetch } from '../appApiClient'
import type { IToolPresetService } from './IToolPresetService'

async function readPayload(response: Response): Promise<unknown> {
  const data = (await response.json()) as unknown
  if (!response.ok) throw new Error(`Tool preset API request failed with status ${response.status}`)
  return data
}

export class ApiToolPresetService implements IToolPresetService {
  async deletePreset(id: string): Promise<void> {
    await readPayload(
      await authenticatedFetch(apiUrl(`/api/tool-presets/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      }),
    )
  }

  async getCustomPresets(): Promise<ToolPreset[]> {
    const data = (await readPayload(await authenticatedFetch(apiUrl('/api/tool-presets')))) as {
      presets: unknown[]
    }
    return ToolPresetSchema.array().parse(data.presets)
  }

  async savePreset(preset: ToolPreset): Promise<ToolPreset> {
    const data = (await readPayload(
      await authenticatedFetch(apiUrl('/api/tool-presets'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ToolPresetSchema.parse(preset)),
      }),
    )) as { preset: unknown }
    return ToolPresetSchema.parse(data.preset)
  }
}
