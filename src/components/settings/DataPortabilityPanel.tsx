import { useState } from 'react'

import type { ImportConflictChoice } from '../../domain/types/dataPortability'
import { useDataPortability } from '../../hooks/useDataPortability'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

export default function DataPortabilityPanel() {
  const data = useDataPortability()
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [previewedFile, setPreviewedFile] = useState<File | null>(null)
  const [choices, setChoices] = useState<Record<string, ImportConflictChoice>>({})
  const activePreview = previewedFile === file ? data.preview : null
  const missingChoices = activePreview?.conflicts.filter((item) => !choices[item.key]) ?? []

  async function runPreview(mode: 'merge' | 'replace') {
    if (!file) return
    setChoices({})
    setPreviewedFile(null)
    try {
      await data.previewBackup(file, mode)
      setPreviewedFile(file)
    } catch {
      // The hook exposes a localized-safe error region below.
    }
  }

  async function runImport() {
    try {
      await data.executeImport(choices, () => window.confirm(t('backup.replaceConfirm')))
      setPreviewedFile(null)
    } catch {
      // The hook keeps the preview mounted and shows the error for recovery.
    }
  }

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">{t('backup.title')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('backup.description')}</p>
      </div>
      <Button disabled={data.isBusy} onClick={() => void data.exportBackup()} variant="secondary">
        {t('backup.export')}
      </Button>
      <Button disabled={data.isBusy} onClick={() => void data.exportLegacy()} variant="secondary">
        {t('backup.exportLegacy')}
      </Button>
      <input
        accept="application/json,.json"
        aria-label={t('backup.choose')}
        className="block w-full text-sm text-slate-700"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null)
          setPreviewedFile(null)
          setChoices({})
        }}
        type="file"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!file || data.isBusy}
          onClick={() => void runPreview('merge')}
          variant="primary"
        >
          {t('backup.previewMerge')}
        </Button>
        <Button
          disabled={!file || data.isBusy}
          onClick={() => void runPreview('replace')}
          variant="danger"
        >
          {t('backup.previewReplace')}
        </Button>
      </div>

      {activePreview ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <h4 className="font-semibold text-slate-950">{t('backup.previewTitle')}</h4>
            <p className="text-xs text-slate-600">
              v{activePreview.formatVersion} · {activePreview.backupChecksum.slice(0, 12)}…
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th>{t('backup.entity')}</th>
                  <th>{t('backup.new')}</th>
                  <th>{t('backup.updated')}</th>
                  <th>{t('backup.unchanged')}</th>
                  <th>{t('backup.conflicts')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(activePreview.counts)
                  .filter(([, count]) => Object.values(count).some(Boolean))
                  .map(([entity, count]) => (
                    <tr className="border-t border-slate-200" key={entity}>
                      <td className="py-1 pr-2 font-medium">{entity}</td>
                      <td>{count.new}</td>
                      <td>{count.updated}</td>
                      <td>{count.unchanged}</td>
                      <td>{count.conflicts}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {activePreview.relationshipErrors.length ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              <strong>{t('backup.relationshipErrors')}</strong>
              <ul className="list-disc pl-5">
                {activePreview.relationshipErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {activePreview.conflicts.map((conflict) => (
            <fieldset
              className="rounded border border-amber-300 bg-amber-50 p-2 text-sm"
              key={conflict.key}
            >
              <legend className="px-1 font-medium">
                {conflict.entity}: {conflict.label}
              </legend>
              <label className="mr-4 inline-flex items-center gap-1">
                <input
                  checked={choices[conflict.key] === 'local'}
                  disabled={data.isBusy}
                  name={conflict.key}
                  onChange={() =>
                    setChoices((current) => ({ ...current, [conflict.key]: 'local' }))
                  }
                  type="radio"
                />
                {t('backup.keepLocal')}
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  checked={choices[conflict.key] === 'backup'}
                  disabled={data.isBusy}
                  name={conflict.key}
                  onChange={() =>
                    setChoices((current) => ({ ...current, [conflict.key]: 'backup' }))
                  }
                  type="radio"
                />
                {t('backup.useBackup')}
              </label>
            </fieldset>
          ))}
          {activePreview.ignoredItems.length ? (
            <p className="text-xs text-slate-600">
              {t('backup.ignored', { count: activePreview.ignoredItems.length })}
            </p>
          ) : null}
          <Button
            disabled={data.isBusy || !activePreview.canImport || missingChoices.length > 0}
            onClick={() => void runImport()}
            variant={data.pendingMode === 'replace' ? 'danger' : 'primary'}
          >
            {data.isBusy
              ? t('backup.importing')
              : data.pendingMode === 'replace'
                ? t('backup.applyReplace')
                : t('backup.applyMerge')}
          </Button>
          {missingChoices.length ? (
            <p className="text-xs text-amber-800">{t('backup.chooseAllConflicts')}</p>
          ) : null}
        </div>
      ) : null}

      {data.error ? <p className="text-sm text-red-700">{data.error}</p> : null}
      {data.safetyBackup ? (
        <p className="text-xs text-slate-600">
          {t('backup.safetyCreated')}: {data.safetyBackup}
        </p>
      ) : null}
      {data.report ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
          <strong>{t('backup.complete')}</strong>
          <p>
            {t('backup.report', {
              applied: Object.values(data.report.counts).reduce((sum, value) => sum + value, 0),
              ignored: data.report.ignoredPreferenceKeys.length,
            })}
          </p>
        </div>
      ) : null}
    </section>
  )
}
