import { apiUrl, authenticatedFetch } from './appApiClient'
import type { CalendarBackup } from '../domain/types/dataPortability'

async function parsed(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined
    throw new Error(error?.message ?? `Data API request failed with status ${response.status}`)
  }
  return payload
}

export async function exportCalendarBackup(): Promise<CalendarBackup> {
  const payload = await parsed(await authenticatedFetch(apiUrl('/api/data/export')))
  return payload.backup as CalendarBackup
}

export async function importCalendarBackup(
  backup: CalendarBackup,
  mode: 'merge' | 'replace',
): Promise<Record<string, unknown>> {
  const payload = await parsed(
    await authenticatedFetch(apiUrl('/api/data/import'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backup, mode, replaceConfirmed: mode === 'replace', source: 'user-file' }),
    }),
  )
  return payload.report as Record<string, unknown>
}
