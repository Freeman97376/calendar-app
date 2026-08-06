import { useEffect, useState, type ReactNode } from 'react'

import type { AIAction } from '../../domain/types'
import {
  TIME_CONFIRMATION_WARNING_PREFIX,
  TIME_CONFLICT_WARNING_PREFIX,
} from '../../domain/types/aiWarnings'
import { useApprovalDrawer } from '../../hooks/useApprovalDrawer'
import { useAI } from '../../hooks/useAI'
import { useEnabledTools } from '../../hooks/useEnabledTools'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

function isTimeConfirmationWarning(warning: string): boolean {
  return warning.startsWith(TIME_CONFIRMATION_WARNING_PREFIX)
}

function isTimeConflictWarning(warning: string): boolean {
  return warning.startsWith(TIME_CONFLICT_WARNING_PREFIX)
}

function warningLabel(warning: string): string {
  if (isTimeConfirmationWarning(warning)) {
    return warning.slice(TIME_CONFIRMATION_WARNING_PREFIX.length).trim()
  }

  if (isTimeConflictWarning(warning)) {
    return warning.slice(TIME_CONFLICT_WARNING_PREFIX.length).trim()
  }

  return warning
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function actionTitle(action: AIAction): string {
  if (action.type === 'create_event') return action.title
  if (action.type === 'update_event')
    return action.changes.title ?? `Update event ${action.eventId}`
  if (action.type === 'delete_event') return `Delete event ${action.eventId}`
  if (action.type === 'create_todo') return action.title
  if (action.type === 'update_todo') return action.changes.title ?? `Update task ${action.todoId}`
  if (action.type === 'delete_todo') return `Delete task ${action.todoId}`
  return `Schedule task ${action.todoId}`
}

function actionTimeLabel(
  action: AIAction,
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
): string | null {
  if (action.type === 'create_event') {
    return `${formatDateTime(action.startAt, locale)} - ${formatDateTime(action.endAt, locale)}`
  }

  if (action.type === 'update_event' && action.changes.startAt) {
    return action.changes.endAt
      ? `${formatDateTime(action.changes.startAt, locale)} - ${formatDateTime(action.changes.endAt, locale)}`
      : formatDateTime(action.changes.startAt, locale)
  }

  if (action.type === 'create_todo' && action.dueDate)
    return `${t('todo.dueDate')}: ${action.dueDate}`
  if (action.type === 'update_todo' && action.changes.dueDate) {
    return `${t('todo.dueDate')}: ${action.changes.dueDate}`
  }
  if (action.type === 'schedule_todo' && action.startAt) {
    return action.endAt
      ? `${formatDateTime(action.startAt, locale)} - ${formatDateTime(action.endAt, locale)}`
      : formatDateTime(action.startAt, locale)
  }
  if (action.type === 'schedule_todo' && action.date) return `${t('todo.schedule')}: ${action.date}`

  return null
}

type DrawerFrameProps = {
  children: ReactNode
  footer: ReactNode
  title: string
}

function DrawerFrame({ children, footer, title }: DrawerFrameProps) {
  const { t } = useI18n()
  const approvalDrawer = useApprovalDrawer()

  return (
    <aside
      aria-label={t('approval.title')}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{t('approval.title')}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
        </div>
        <Button onClick={approvalDrawer.close} variant="ghost">
          {t('approval.close')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">{children}</div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">{footer}</div>
    </aside>
  )
}

function AIPlanApprovalDrawer() {
  const { locale, t } = useI18n()
  const ai = useAI()
  const [status, setStatus] = useState<string | null>(null)
  const [timeConfirmed, setTimeConfirmed] = useState(false)
  const plan = ai.pendingActionPlan
  const requiresTimeConfirmation = plan?.warnings.some(isTimeConfirmationWarning) ?? false
  const hasTimeConflict = plan?.warnings.some(isTimeConflictWarning) ?? false

  useEffect(() => {
    setStatus(null)
    setTimeConfirmed(false)
  }, [plan])

  async function applyAIPlan() {
    setStatus(null)
    if (hasTimeConflict) {
      setStatus(t('ai.fixTimeConflicts'))
      return
    }

    if (requiresTimeConfirmation && !timeConfirmed) {
      setStatus(t('ai.reviewTimesBeforeApply'))
      return
    }

    try {
      const result = await ai.applyActionPlan()
      setStatus(
        `Applied ${result.appliedCount} AI action${result.appliedCount === 1 ? '' : 's'}.${
          result.skippedDuplicateCount
            ? ` Skipped ${result.skippedDuplicateCount} duplicate event${
                result.skippedDuplicateCount === 1 ? '' : 's'
              }.`
            : ''
        }`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to apply AI actions')
    }
  }

  async function addAIPlanToTasks() {
    setStatus(null)
    try {
      const todos = await ai.addAssistantResultToTodo()
      setStatus(
        todos.length === 1
          ? `Added task ${todos[0].title}.`
          : `Added ${todos.length} tasks from AI result.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to add AI result to tasks')
    }
  }

  return (
    <DrawerFrame
      footer={
        <>
          <Button onClick={() => void addAIPlanToTasks()}>{t('ai.addToTasks')}</Button>
          <Button
            disabled={!plan || hasTimeConflict || (requiresTimeConfirmation && !timeConfirmed)}
            onClick={() => void applyAIPlan()}
            variant="primary"
          >
            {t('ai.applyActions')}
          </Button>
        </>
      }
      title={t('approval.aiPlan')}
    >
      {plan ? (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-950">{plan.summary}</h3>
            <div className="space-y-2">
              {plan.actions.map((action, index) => (
                <article
                  className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  key={`${action.type}-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{actionTitle(action)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {action.type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-600">
                      #{index + 1}
                    </span>
                  </div>
                  {actionTimeLabel(action, locale, t) ? (
                    <p className="mt-2 text-xs text-slate-700">
                      {t('ai.time', { value: actionTimeLabel(action, locale, t) ?? '' })}
                    </p>
                  ) : null}
                  {'reason' in action && action.reason ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600">{action.reason}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {plan.warnings.length ? (
            <div className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              {plan.warnings.map((warning) => (
                <p key={warning}>{warningLabel(warning)}</p>
              ))}
            </div>
          ) : null}
          {hasTimeConflict ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {t('ai.timeConflictsMustBeFixed')}
            </p>
          ) : null}
          {requiresTimeConfirmation ? (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
              <input
                checked={timeConfirmed}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-emerald-700 focus:ring-emerald-600"
                onChange={(event) => setTimeConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>{t('ai.confirmTimes')}</span>
            </label>
          ) : null}
        </>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {t('approval.empty')}
        </p>
      )}

      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
    </DrawerFrame>
  )
}

function ActiveToolPlanApprovalDrawer() {
  const { locale, t } = useI18n()
  const activeTools = useEnabledTools()
  const [status, setStatus] = useState<string | null>(null)

  async function applyActiveToolPlan() {
    setStatus(null)
    try {
      await activeTools.applyCalendarDrafts()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to apply calendar drafts')
    }
  }

  return (
    <DrawerFrame
      footer={
        <Button
          disabled={!activeTools.calendarDrafts.length || activeTools.isApplyingCalendarDrafts}
          onClick={() => void applyActiveToolPlan()}
          variant="primary"
        >
          {activeTools.isApplyingCalendarDrafts
            ? t('enabled.applying')
            : t('enabled.applyToCalendar')}
        </Button>
      }
      title={t('approval.activeToolPlan')}
    >
      {activeTools.calendarDrafts.length ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {activeTools.activeInstance?.instanceAlias ?? t('enabled.header')}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {activeTools.calendarDrafts.length} calendar draft
              {activeTools.calendarDrafts.length === 1 ? '' : 's'} ready for approval.
            </p>
          </div>
          <div className="space-y-2">
            {activeTools.calendarDrafts.map((draft, index) => (
              <article
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
                key={`${draft.title}-${index}`}
              >
                <p className="text-sm font-semibold text-slate-950">{draft.title}</p>
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
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('enabled.draftsPreviewOnly')}
          </p>
        </section>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {t('approval.empty')}
        </p>
      )}

      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
      {activeTools.applyStatus ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {activeTools.applyStatus}
        </p>
      ) : null}
      {activeTools.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{activeTools.error}</p>
      ) : null}
    </DrawerFrame>
  )
}

export default function ApprovalDrawer() {
  const approvalDrawer = useApprovalDrawer()

  if (!approvalDrawer.isOpen || !approvalDrawer.source) return null
  if (approvalDrawer.source === 'active-tool-calendar-drafts')
    return <ActiveToolPlanApprovalDrawer />

  return <AIPlanApprovalDrawer />
}
