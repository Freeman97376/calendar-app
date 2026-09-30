import type { PersonalAIUpdate } from '../domain/schemas/personalAI.schema'
import { ApiError } from '../services/appApiClient'
import { personalAIRequest } from '../services/personalAIService'
import { useAuthStore } from './authStore'

// Secrets stay in the mounted form. This request boundary has no persisted key state.
export async function requestPersonalAISettings(
  userId: string,
  method: 'GET' | 'PATCH' | 'DELETE',
  update?: PersonalAIUpdate,
) {
  const sameAccount = () =>
    useAuthStore.getState().user?.id === userId &&
    useAuthStore.getState().status === 'authenticated'
  if (!sameAccount()) throw new DOMException('Account changed.', 'AbortError')
  const result = await personalAIRequest(method, update)
  if (!sameAccount()) throw new DOMException('Account changed.', 'AbortError')
  return result
}

export function personalAIErrorKind(error: unknown): 'unavailable' | 'save' {
  return error instanceof ApiError && error.code === 'ai_settings_unavailable'
    ? 'unavailable'
    : 'save'
}
