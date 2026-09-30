import { PersonalAIStatusSchema, type PersonalAIUpdate } from '../domain/schemas/personalAI.schema'
import { apiErrorFromResponse, apiUrl, authenticatedFetch } from './appApiClient'

export async function personalAIRequest(
  method: 'GET' | 'PATCH' | 'DELETE',
  update?: PersonalAIUpdate,
) {
  const response = await authenticatedFetch(apiUrl('/api/ai/settings'), {
    method,
    cache: 'no-store',
    ...(update
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) }
      : {}),
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
  return PersonalAIStatusSchema.parse(await response.json())
}
