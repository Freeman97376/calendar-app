import { useState, type FormEvent } from 'react'

import type { ActiveToolPlanEditorValue } from '../../hooks/useEnabledTools'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

type ToolPlanEditorDialogProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (changes: ActiveToolPlanEditorValue) => Promise<void>
  value: ActiveToolPlanEditorValue
}

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'

function uniqueLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ]
}

export default function ToolPlanEditorDialog({
  isOpen,
  onClose,
  onSave,
  value,
}: ToolPlanEditorDialogProps) {
  const { t } = useI18n()
  const [goalDraft, setGoalDraft] = useState(value.longTermGoalLabel)
  const [purposeDraft, setPurposeDraft] = useState(value.activationSummary)
  const [featuresDraft, setFeaturesDraft] = useState(value.toolFeatures.join('\n'))
  const [pathDraft, setPathDraft] = useState(value.implementationPathText)
  const [routingDraft, setRoutingDraft] = useState(value.routeTags.join('\n'))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const canSave = Boolean(goalDraft.trim() && purposeDraft.trim() && pathDraft.trim())

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave({
        activationSummary: purposeDraft.trim(),
        implementationPathText: pathDraft,
        longTermGoalLabel: goalDraft.trim(),
        routeTags: uniqueLines(routingDraft),
        toolFeatures: uniqueLines(featuresDraft),
      })
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save the active tool plan.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('enabled.editPlanTitle')}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="active-tool-long-term-goal"
          >
            {t('enabled.longTermGoal')}
          </label>
          <input
            className={inputClass}
            id="active-tool-long-term-goal"
            onChange={(event) => setGoalDraft(event.target.value)}
            required
            value={goalDraft}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="active-tool-purpose">
            {t('enabled.toolPurpose')}
          </label>
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            id="active-tool-purpose"
            onChange={(event) => setPurposeDraft(event.target.value)}
            required
            value={purposeDraft}
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="active-tool-features"
          >
            {t('enabled.toolCharacteristics')}
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">{t('enabled.featuresHelp')}</p>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            id="active-tool-features"
            onChange={(event) => setFeaturesDraft(event.target.value)}
            value={featuresDraft}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="active-tool-plan">
            {t('enabled.implementationPath')}
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t('enabled.implementationPathHelp')}
          </p>
          <textarea
            className={`${inputClass} min-h-32 resize-y`}
            id="active-tool-plan"
            onChange={(event) => setPathDraft(event.target.value)}
            required
            value={pathDraft}
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="active-tool-routing-signals"
          >
            {t('enabled.routingSignals')}
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-500">{t('enabled.routingSignalsHelp')}</p>
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            id="active-tool-routing-signals"
            onChange={(event) => setRoutingDraft(event.target.value)}
            value={routingDraft}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          {saveError ? (
            <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          ) : null}
          <Button disabled={isSaving} onClick={onClose} variant="secondary">
            {t('enabled.cancel')}
          </Button>
          <Button disabled={!canSave || isSaving} type="submit" variant="primary">
            {t('enabled.savePlanAndFeatures')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
