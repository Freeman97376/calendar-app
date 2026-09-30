import { useEffect, useState } from 'react'

import type {
  ActionItemStatus,
  MilestoneStatus,
  ProjectStatus,
} from '../../domain/types/longTermMemory'
import { useApprovalDrawer } from '../../hooks/useApprovalDrawer'
import { useActiveToolSummaries } from '../../hooks/useActiveToolSummaries'
import { useEnabledTools } from '../../hooks/useEnabledTools'
import { useI18n } from '../../hooks/useI18n'
import { useWorkspacePanel } from '../../hooks/useWorkspacePanel'
import Button from '../ui/Button'
import ToolPlanEditorDialog from './ToolPlanEditorDialog'
import ToolRoadmapPanel from './ToolRoadmapPanel'
import GoalControlDashboardPanel from './GoalControlDashboard'
import ActiveToolResumeSummary from './ActiveToolResumeSummary'
import GlobalSchedulePanel from './GlobalSchedulePanel'

const actionStatuses: ActionItemStatus[] = ['todo', 'scheduled', 'done', 'blocked', 'skipped']
const milestoneStatuses: MilestoneStatus[] = [
  'not_started',
  'in_progress',
  'done',
  'blocked',
  'skipped',
]
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
  const approvalDrawer = useApprovalDrawer()
  const workspace = useWorkspacePanel()
  const activeInstance = enabledTools.activeInstance
  const summaries = useActiveToolSummaries(
    enabledTools.instances.map((instance) => instance.projectId),
  )
  const [aliasDraft, setAliasDraft] = useState('')
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false)
  const [isPromptDetailsOpen, setIsPromptDetailsOpen] = useState(false)

  useEffect(() => {
    setAliasDraft(activeInstance?.instanceAlias ?? '')
    setIsPlanEditorOpen(false)
    setIsPromptDetailsOpen(false)
  }, [activeInstance?.instanceAlias, activeInstance?.projectId])

  const canSaveAlias = Boolean(
    activeInstance && aliasDraft.trim() && aliasDraft.trim() !== activeInstance.instanceAlias,
  )
  const visibleToolFeatures = activeInstance?.toolFeatures.length
    ? activeInstance.toolFeatures
    : (activeInstance?.routeTags ?? [])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{t('enabled.header')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('enabled.description')}</p>
          </div>
          <Button onClick={() => workspace.openPanel('tools')} variant="ghost">
            Templates
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <GlobalSchedulePanel />
        {enabledTools.pendingToolEdit ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
            <p>请先接受或放弃现有工具修改，再开始下一次编辑。</p>
            <Button
              onClick={() => {
                const review = document.getElementById('global-schedule-review')
                review?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                review?.focus()
              }}
            >
              查看并处理现有提案
            </Button>
          </div>
        ) : null}
        {enabledTools.instances.length ? (
          <section className="space-y-2">
            {enabledTools.instances.map((instance) => {
              const active = activeInstance?.projectId === instance.projectId
              const summary = summaries[instance.projectId]
              const nextMilestone = summary?.milestones
                .filter((milestone) => !['done', 'skipped'].includes(milestone.status))
                .sort((left, right) =>
                  String(left.due_date || '9999').localeCompare(String(right.due_date || '9999')),
                )[0]
              const plannedMinutes =
                summary?.actions.reduce(
                  (total, action) => total + Number(action.estimated_minutes || 0),
                  0,
                ) ?? 0

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
                        <p className="mt-1 text-xs text-slate-500">
                          {t('enabled.parentTemplate')}: {instance.parentTemplateLabel}
                        </p>
                        {summary ? (
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-600">
                            <span className="rounded bg-white px-1.5 py-0.5">
                              {summary.health.status.replace('_', ' ')}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              {summary.policy.active_tier}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              AI {summary.usage.effective_mode}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              {summary.metrics.length} metrics
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              {plannedMinutes}/{summary.policy.weekly_capacity_minutes} min
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5">
                              {
                                summary.actions.filter(
                                  (action) => !['done', 'skipped'].includes(action.status),
                                ).length
                              }{' '}
                              open
                            </span>
                            {nextMilestone ? (
                              <span className="rounded bg-white px-1.5 py-0.5">
                                Next: {nextMilestone.title}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
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
                        aria-label={`Active tool status for ${instance.instanceAlias}`}
                        className={`h-8 rounded-md border border-slate-200 px-2 text-xs ${statusClass(instance.status)}`}
                        onChange={(event) =>
                          void enabledTools
                            .updateProjectStatus(
                              instance.projectId,
                              event.target.value as ProjectStatus,
                            )
                            .catch(() => undefined)
                        }
                        disabled={enabledTools.pendingToolEdit}
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
            {summaries[activeInstance.projectId] ? (
              <ActiveToolResumeSummary dashboard={summaries[activeInstance.projectId]} />
            ) : null}
            <GoalControlDashboardPanel projectId={activeInstance.projectId} />
            <details
              className="rounded-md border border-slate-200 bg-white p-3"
              onToggle={(event) => setIsPromptDetailsOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                How AI assists this plan / LLM 如何协助计划
              </summary>
              {isPromptDetailsOpen ? (
                <>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    This is the user-facing operating prompt. System prompts, hidden reasoning,
                    keys, and complete internal context are never shown here.
                  </p>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                    {enabledTools.promptFramework}
                  </pre>
                </>
              ) : null}
            </details>
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950">
                    {activeInstance.instanceAlias}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">{activeInstance.toolName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t('enabled.parentTemplate')}: {activeInstance.parentTemplateLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs ${statusClass(activeInstance.status)}`}
                >
                  {statusLabel(activeInstance.status, t)}
                </span>
              </div>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!activeInstance || !canSaveAlias) return
                  void enabledTools
                    .renameActiveTool(activeInstance, aliasDraft)
                    .catch(() => undefined)
                }}
              >
                <label className="sr-only" htmlFor="active-tool-alias">
                  {t('enabled.activeToolName')}
                </label>
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="active-tool-alias"
                  onChange={(event) => setAliasDraft(event.target.value)}
                  value={aliasDraft}
                />
                <Button disabled={!canSaveAlias || enabledTools.pendingToolEdit} type="submit">
                  {t('enabled.saveName')}
                </Button>
              </form>
            </div>

            <section
              aria-label={t('enabled.toolCharacteristics')}
              className="space-y-3 rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {t('enabled.toolCharacteristics')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {activeInstance.parentTemplateLabel}
                    {activeInstance.adapterId ? ` · ${activeInstance.adapterId}` : ''}
                  </p>
                </div>
                <Button
                  disabled={enabledTools.pendingToolEdit}
                  onClick={() => setIsPlanEditorOpen(true)}
                  variant="ghost"
                >
                  {t('enabled.editPlanAndFeatures')}
                </Button>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700">{t('enabled.toolPurpose')}</h4>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">
                  {activeInstance.activationSummary}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700">
                  {t('enabled.toolCharacteristics')}
                </h4>
                {visibleToolFeatures.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {visibleToolFeatures.map((feature) => (
                      <li className="flex gap-2" key={feature}>
                        <span aria-hidden="true" className="text-emerald-700">
                          •
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">{t('enabled.noCharacteristics')}</p>
                )}
              </div>

              {activeInstance.routeTags.length ? (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">
                    {t('enabled.routingSignals')}
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activeInstance.routeTags.map((tag) => (
                      <span
                        className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {enabledTools.roadmap ? <ToolRoadmapPanel roadmap={enabledTools.roadmap} /> : null}

            {enabledTools.milestones.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-950">{t('enabled.milestones')}</h4>
                {enabledTools.milestones.map((milestone) => (
                  <article
                    className="rounded-md border border-slate-200 bg-white p-3"
                    key={milestone.milestone_id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {milestone.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {milestone.due_date
                            ? `${t('todo.dueDate')}: ${milestone.due_date}`
                            : t('enabled.noDueDate')}
                        </p>
                        {milestone.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {milestone.description}
                          </p>
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
                  <article
                    className="rounded-md border border-slate-200 bg-white p-3"
                    key={action.action_id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {action.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {action.due_date
                            ? `${t('todo.dueDate')}: ${action.due_date}`
                            : t('enabled.noDueDate')}
                        </p>
                        {action.description ? (
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {action.description}
                          </p>
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
                  <h4 className="text-sm font-semibold text-slate-950">
                    {t('enabled.calendarPreview')}
                  </h4>
                  <Button
                    disabled={enabledTools.isDetailLoading || !enabledTools.calendarDraftToolRunId}
                    onClick={() =>
                      approvalDrawer.open({
                        drafts: enabledTools.calendarDrafts,
                        projectId: activeInstance.projectId,
                        source: 'active-tool-calendar-drafts',
                        toolName: activeInstance.toolName,
                        toolRunId: enabledTools.calendarDraftToolRunId,
                      })
                    }
                    variant="primary"
                  >
                    {t('enabled.reviewPlan')}
                  </Button>
                </div>
                {enabledTools.calendarDrafts.slice(0, 3).map((draft, index) => (
                  <article
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                    key={`${draft.title}-${index}`}
                  >
                    <p className="text-sm font-medium text-slate-900">{draft.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(draft.startAt, locale)} -{' '}
                      {formatDateTime(draft.endAt, locale)}
                    </p>
                    {draft.displayDetails ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                        {draft.displayDetails}
                      </p>
                    ) : null}
                  </article>
                ))}
                {enabledTools.calendarDrafts.length > 3 ? (
                  <p className="text-xs font-medium text-slate-500">
                    +{enabledTools.calendarDrafts.length - 3} more in review
                  </p>
                ) : null}
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
                  <article
                    className="rounded-md border border-slate-200 bg-white p-3"
                    key={entry.progress_id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {entry.summary}
                        </p>
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
                  <article
                    className="rounded-md border border-slate-200 bg-white p-3"
                    key={toolRun.tool_run_id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {toolRun.intent}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {toolRun.output_summary}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-2 py-1 text-xs ${statusClass(toolRun.status)}`}
                      >
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
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {enabledTools.error}
          </p>
        ) : null}
        {enabledTools.isLoading || enabledTools.isDetailLoading ? (
          <p className="text-sm text-slate-500">{t('enabled.loadingMemory')}</p>
        ) : null}
      </div>

      {activeInstance && enabledTools.planEditorValue && isPlanEditorOpen ? (
        <ToolPlanEditorDialog
          isOpen
          onClose={() => setIsPlanEditorOpen(false)}
          onSave={(changes) => enabledTools.updateActiveToolPlan(activeInstance, changes)}
          value={enabledTools.planEditorValue}
        />
      ) : null}
    </div>
  )
}
