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

const dayOptions = [
  ['mon', '周一'],
  ['tue', '周二'],
  ['wed', '周三'],
  ['thu', '周四'],
  ['fri', '周五'],
  ['sat', '周六'],
  ['sun', '周日'],
] as const

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
  const [targetDate, setTargetDate] = useState<string | null>(value.targetDate)
  const [weeklyCapacityMinutes, setWeeklyCapacityMinutes] = useState(value.weeklyCapacityMinutes)
  const [bufferPercent, setBufferPercent] = useState(value.bufferPercent)
  const [availableDays, setAvailableDays] = useState(value.availableDays)
  const [actionDrafts, setActionDrafts] = useState(value.actions)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const missingRequiredDates = actionDrafts.filter(
    (action) => action.executionTier !== 'stretch' && !action.dueDate,
  )
  const canSave = Boolean(
    goalDraft.trim() &&
    purposeDraft.trim() &&
    pathDraft.trim() &&
    weeklyCapacityMinutes >= 0 &&
    bufferPercent >= 0 &&
    bufferPercent <= 95 &&
    availableDays.length &&
    !missingRequiredDates.length,
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave || isSaving) return

    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave({
        activationSummary: purposeDraft.trim(),
        actions: actionDrafts,
        availableDays,
        bufferPercent,
        implementationPathText: pathDraft,
        longTermGoalLabel: goalDraft.trim(),
        routeTags: uniqueLines(routingDraft),
        targetDate,
        toolFeatures: uniqueLines(featuresDraft),
        weeklyCapacityMinutes,
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

        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">排程约束</h3>
            <p className="mt-1 text-xs text-slate-500">
              保存后只生成“计划变更＋全局重排影响”提案，确认前不会修改工具或日历。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              checked={targetDate === null}
              onChange={(event) =>
                setTargetDate(event.target.checked ? null : new Date().toISOString().slice(0, 10))
              }
              type="checkbox"
            />
            无硬期限（使用滚动四周系统日期）
          </label>
          {targetDate !== null ? (
            <label className="block text-sm font-medium text-slate-700">
              目标日期
              <input
                className={inputClass}
                onChange={(event) => setTargetDate(event.target.value || null)}
                type="date"
                value={targetDate}
              />
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              每周容量（分钟）
              <input
                className={inputClass}
                min={0}
                onChange={(event) => setWeeklyCapacityMinutes(Number(event.target.value))}
                type="number"
                value={weeklyCapacityMinutes}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              缓冲比例（%）
              <input
                className={inputClass}
                max={95}
                min={0}
                onChange={(event) => setBufferPercent(Number(event.target.value))}
                type="number"
                value={bufferPercent}
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">工具可执行日</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {dayOptions.map(([code, label]) => (
                <label className="flex items-center gap-1 text-sm text-slate-700" key={code}>
                  <input
                    checked={availableDays.includes(code)}
                    onChange={(event) =>
                      setAvailableDays((current) =>
                        event.target.checked
                          ? [...new Set([...current, code])]
                          : current.filter((day) => day !== code),
                      )
                    }
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
            {!availableDays.length ? (
              <p className="mt-1 text-xs text-red-700">至少选择一个工具可执行日。</p>
            ) : null}
          </fieldset>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">行动</h3>
            <p className="mt-1 text-xs text-slate-500">
              Minimum / Standard 必须有计划日期；手工改动的日期视为固定日期。
            </p>
          </div>
          {actionDrafts.map((action, index) => {
            const missingDate = action.executionTier !== 'stretch' && !action.dueDate
            const updateAction = (patch: Partial<(typeof actionDrafts)[number]>) =>
              setActionDrafts((current) =>
                current.map((item, position) =>
                  position === index ? { ...item, ...patch } : item,
                ),
              )
            return (
              <div
                className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2"
                key={action.actionId}
              >
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                  行动名称
                  <input
                    className={inputClass}
                    onChange={(event) => updateAction({ title: event.target.value })}
                    value={action.title}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  计划日期
                  <input
                    aria-invalid={missingDate}
                    className={`${inputClass} ${missingDate ? 'border-red-500' : ''}`}
                    onChange={(event) => updateAction({ dueDate: event.target.value || null })}
                    type="date"
                    value={action.dueDate ?? ''}
                  />
                  {missingDate ? (
                    <span className="mt-1 block text-xs text-red-700">必要行动需要计划日期。</span>
                  ) : null}
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  预计分钟
                  <input
                    className={inputClass}
                    min={5}
                    onChange={(event) =>
                      updateAction({ estimatedMinutes: Number(event.target.value) })
                    }
                    type="number"
                    value={action.estimatedMinutes}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  执行档位
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      updateAction({
                        executionTier: event.target.value as typeof action.executionTier,
                      })
                    }
                    value={action.executionTier}
                  >
                    <option value="minimum">Minimum / 最低</option>
                    <option value="standard">Standard / 标准</option>
                    <option value="stretch">Stretch / 挑战</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  优先级
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      updateAction({ priority: event.target.value as typeof action.priority })
                    }
                    value={action.priority}
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </label>
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-medium text-slate-700">前置行动</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {actionDrafts
                      .filter((candidate) => candidate.actionId !== action.actionId)
                      .map((candidate) => (
                        <label
                          className="flex items-center gap-1 text-xs text-slate-700"
                          key={candidate.actionId}
                        >
                          <input
                            checked={action.dependsOn.includes(candidate.actionId)}
                            onChange={(event) =>
                              updateAction({
                                dependsOn: event.target.checked
                                  ? [...new Set([...action.dependsOn, candidate.actionId])]
                                  : action.dependsOn.filter(
                                      (actionId) => actionId !== candidate.actionId,
                                    ),
                              })
                            }
                            type="checkbox"
                          />
                          {candidate.title}
                        </label>
                      ))}
                  </div>
                </fieldset>
              </div>
            )
          })}
        </section>

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
