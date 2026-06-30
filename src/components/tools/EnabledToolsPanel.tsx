import { useEnabledTools } from '../../hooks/useEnabledTools'
import type {
  ActionItemStatus,
  MilestoneStatus,
  ProjectStatus,
} from '../../domain/types/longTermMemory'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

const actionStatuses: ActionItemStatus[] = ['todo', 'scheduled', 'done', 'blocked', 'skipped']
const milestoneStatuses: MilestoneStatus[] = ['not_started', 'in_progress', 'done', 'blocked', 'skipped']
const projectStatuses: ProjectStatus[] = ['active', 'paused', 'completed']

function statusLabel(value: string, t: ReturnType<typeof useI18n>['t']): string {
  const key = `status.${value}` as Parameters<ReturnType<typeof useI18n>['t']>[0]
  const translated = t(key)
  return translated === key ? value.replace(/_/g, ' ') : translated
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusClass(status: string): string {
  if (status === 'done' || status === 'completed') return 'bg-emerald-50 text-emerald-800'
  if (status === 'blocked') return 'bg-red-50 text-red-800'
  if (status === 'skipped' || status === 'paused') return 'bg-slate-100 text-slate-600'
  if (status === 'scheduled' || status === 'in_progress') return 'bg-sky-50 text-sky-800'
  return 'bg-white text-slate-600'
}

export default function EnabledToolsPanel() {
  const { locale, t } = useI18n()
  const enabledTools = useEnabledTools()
  const activeInstance = enabledTools.activeInstance

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold text-slate-950">{t('enabled.header')}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t('enabled.description')}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {enabledTools.instances.length ? (
          <section className="space-y-2">
            {enabledTools.instances.map((instance) => {
              const active = activeInstance?.projectId === instance.projectId

              return (
                <article
                  className={[
                    'rounded-md border p-3',
                    active ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white',
                  ].join(' ')}
                  key={instance.projectId}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => enabledTools.setActiveProjectId(instance.projectId)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {instance.instanceAlias}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{instance.activationSummary}</p>
                      </div>
                      <span className="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-600">
                        {instance.toolName}
                      </span>
                    </div>
                  </button>
                  {active ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          checked={instance.routingEnabled}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                          onChange={() => void enabledTools.toggleRouting(instance)}
                          type="checkbox"
                        />
                        {t('enabled.routingEnabled')}
                      </label>
                      <select
                        aria-label={`Enabled tool status for ${instance.instanceAlias}`}
                        className={`h-8 rounded-md border border-slate-200 px-2 text-xs ${statusClass(instance.status)}`}
                        onChange={(event) =>
                          void enabledTools.updateProjectStatus(
                            instance.projectId,
                            event.target.value as ProjectStatus,
                          )
                        }
                        value={instance.status}
                      >
                        {projectStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </section>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {t('enabled.noEnabledTools')}
          </p>
        )}

        {activeInstance ? (
          <section className="space-y-4 border-t border-slate-200 pt-4">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950">
                    {activeInstance.instanceAlias}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{activeInstance.toolName}</p>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {enabledTools.progressSummary.percent}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  aria-label={`${activeInstance.instanceAlias} progress`}
                  className="h-full rounded-full bg-emerald-700"
                  style={{ width: `${enabledTools.progressSummary.percent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('enabled.completeFrom', {
                  completed: enabledTools.progressSummary.completed,
                  source: enabledTools.progressSummary.source,
                  total: enabledTools.progressSummary.total,
                })}
              </p>
            </div>

            {activeInstance.routeTags.length ? (
              <div className="flex flex-wrap gap-1">
                {activeInstance.routeTags.map((tag) => (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {enabledTools.milestones.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-950">{t('enabled.milestones')}</h4>
                {enabledTools.milestones.map((milestone) => (
                  <article className="rounded-md border border-slate-200 bg-white p-3" key={milestone.milestone_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{milestone.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {milestone.due_date
                            ? `${t('todo.dueDate')}: ${milestone.due_date}`
                            : t('enabled.noDueDate')}
                        </p>
                        {milestone.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">{milestone.description}</p>
                        ) : null}
                      </div>
                      <select
                        aria-label={`Milestone status for ${milestone.title}`}
                        className={`h-8 shrink-0 rounded-md border border-slate-200 px-2 text-xs ${statusClass(milestone.status)}`}
                        onChange={(event) =>
                          void enabledTools.setMilestoneStatus(
                            milestone.milestone_id,
                            milestone.title,
                            event.target.value as MilestoneStatus,
                          )
                        }
                        value={milestone.status}
                      >
                        {milestoneStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {enabledTools.actions.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-950">{t('enabled.actions')}</h4>
                {enabledTools.actions.map((action) => (
                  <article className="rounded-md border border-slate-200 bg-white p-3" key={action.action_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{action.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {action.due_date
                            ? `${t('todo.dueDate')}: ${action.due_date}`
                            : t('enabled.noDueDate')}
                        </p>
                        {action.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">{action.description}</p>
                        ) : null}
                      </div>
                      <select
                        aria-label={`Action status for ${action.title}`}
                        className={`h-8 shrink-0 rounded-md border border-slate-200 px-2 text-xs ${statusClass(action.status)}`}
                        onChange={(event) =>
                          void enabledTools.setActionStatus(
                            action.action_id,
                            action.title,
                            event.target.value as ActionItemStatus,
                          )
                        }
                        value={action.status}
                      >
                        {actionStatuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {enabledTools.calendarDrafts.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-950">{t('enabled.calendarPreview')}</h4>
                  <Button
                    disabled={enabledTools.isApplyingCalendarDrafts}
                    onClick={() => void enabledTools.applyCalendarDrafts()}
                    variant="primary"
                  >
                    {enabledTools.isApplyingCalendarDrafts ? t('enabled.applying') : t('enabled.applyToCalendar')}
                  </Button>
                </div>
                {enabledTools.calendarDrafts.map((draft, index) => (
                  <article className="rounded-md border border-slate-200 bg-slate-50 p-3" key={`${draft.title}-${index}`}>
                    <p className="text-sm font-medium text-slate-900">{draft.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(draft.startAt, locale)} - {formatDateTime(draft.endAt, locale)}
                    </p>
                    {draft.displayDetails ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                        {draft.displayDetails}
                      </p>
                    ) : null}
                  </article>
                ))}
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t('enabled.draftsPreviewOnly')}
                </p>
                {enabledTools.applyStatus ? (
                  <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {enabledTools.applyStatus}
                  </p>
                ) : null}
              </div>
            ) : null}

            {enabledTools.progress.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-950">{t('enabled.progressLog')}</h4>
                {enabledTools.progress.slice(0, 5).map((entry) => (
                  <article className="rounded-md border border-slate-200 bg-white p-3" key={entry.progress_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{entry.summary}</p>
                        {entry.details ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                            {entry.details}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        {entry.log_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {enabledTools.toolRuns.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-950">{t('enabled.toolRuns')}</h4>
                {enabledTools.toolRuns.slice(0, 5).map((toolRun) => (
                  <article className="rounded-md border border-slate-200 bg-white p-3" key={toolRun.tool_run_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{toolRun.intent}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{toolRun.output_summary}</p>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-1 text-xs ${statusClass(toolRun.status)}`}>
                        {statusLabel(toolRun.status, t)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {enabledTools.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{enabledTools.error}</p>
        ) : null}
        {enabledTools.isLoading || enabledTools.isDetailLoading ? (
          <p className="text-sm text-slate-500">{t('enabled.loadingMemory')}</p>
        ) : null}
      </div>
    </div>
  )
}
