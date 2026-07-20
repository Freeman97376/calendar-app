import { z } from 'zod'

import type {
  CalendarBackup,
  ImportConflictChoice,
  ImportPreview,
  ImportReport,
} from '../domain/types/dataPortability'
import { apiErrorFromResponse, apiUrl, authenticatedFetch } from './appApiClient'

const CalendarBackupSchema = z
  .object({
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    entities: z.record(z.unknown()),
    exportedAt: z.string(),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
  })
  .strict()

const ImportEntityCountsSchema = z
  .object({
    conflicts: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
  })
  .strict()

const ImportPreviewSchema: z.ZodType<ImportPreview> = z
  .object({
    backupChecksum: z.string().regex(/^[0-9a-f]{64}$/),
    canImport: z.boolean(),
    conflicts: z.array(
      z
        .object({
          backupUpdatedAt: z.string().nullable(),
          entity: z.string(),
          id: z.string(),
          key: z.string(),
          label: z.string(),
          localUpdatedAt: z.string().nullable(),
        })
        .strict(),
    ),
    counts: z.record(ImportEntityCountsSchema),
    currentChecksum: z.string().regex(/^[0-9a-f]{64}$/),
    formatVersion: z.number().int(),
    ignoredItems: z.array(
      z
        .object({
          entity: z.string(),
          id: z.string(),
          reason: z.string(),
        })
        .strict(),
    ),
    relationshipErrors: z.array(z.string()),
  })
  .strict()

const ImportReportSchema: z.ZodType<ImportReport> = z
  .object({
    counts: z.record(z.number().int().nonnegative()),
    ignoredPreferenceKeys: z.array(z.string()),
    mode: z.union([z.literal('merge'), z.literal('replace')]),
    preview: z
      .object({
        backupChecksum: z.string(),
        counts: z.record(ImportEntityCountsSchema),
        currentChecksum: z.string(),
      })
      .strict()
      .optional(),
    replayed: z.boolean(),
    skipped: z.boolean(),
  })
  .passthrough()

async function parsed(response: Response): Promise<unknown> {
  if (!response.ok) throw await apiErrorFromResponse(response)
  return response.json()
}

export function parseCalendarBackup(input: unknown): CalendarBackup {
  return CalendarBackupSchema.parse(input)
}

export async function exportCalendarBackup(): Promise<CalendarBackup> {
  const payload = z
    .object({ backup: CalendarBackupSchema, success: z.literal(true) })
    .parse(await parsed(await authenticatedFetch(apiUrl('/api/data/export'))))
  return payload.backup
}

export async function previewCalendarBackup(
  backup: CalendarBackup,
  mode: 'merge' | 'replace',
): Promise<ImportPreview> {
  const response = await authenticatedFetch(apiUrl('/api/data/import/preview'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backup, mode }),
  })
  return z
    .object({ preview: ImportPreviewSchema, success: z.literal(true) })
    .parse(await parsed(response)).preview
}

export async function importCalendarBackup(
  backup: CalendarBackup,
  mode: 'merge' | 'replace',
  preview: ImportPreview,
  conflictChoices: Record<string, ImportConflictChoice>,
): Promise<ImportReport> {
  const payload = z.object({ report: ImportReportSchema, success: z.literal(true) }).parse(
    await parsed(
      await authenticatedFetch(apiUrl('/api/data/import'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          backup,
          conflictChoices,
          currentDataChecksum: preview.currentChecksum,
          expectedBackupChecksum: preview.backupChecksum,
          mode,
          replaceConfirmed: mode === 'replace',
          source: 'user-file',
        }),
      }),
    ),
  )
  return payload.report
}

export async function createDesktopRestoreSnapshot(
  currentVersion: string,
): Promise<{ checksum: string; fileName: string }> {
  const response = await authenticatedFetch(apiUrl('/api/data/pre-update-backup'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromVersion: currentVersion, toVersion: currentVersion }),
  })
  const payload = z
    .object({
      backup: z.object({ checksum: z.string(), fileName: z.string() }).passthrough(),
      success: z.literal(true),
    })
    .parse(await parsed(response))
  return payload.backup
}
