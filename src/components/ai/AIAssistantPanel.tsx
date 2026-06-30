import { useEffect, useState, type FormEvent } from 'react'

import type { AIAction, AIProvider } from '../../domain/types'
import {
  TIME_CONFIRMATION_WARNING_PREFIX,
  TIME_CONFLICT_WARNING_PREFIX,
} from '../../domain/types/aiWarnings'
import { useAI } from '../../hooks/useAI'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'
import AIMessageBubble from './AIMessageBubble'
import AIScheduleSuggestion from './AIScheduleSuggestion'

const providerLabels: Record<AIProvider, string> = {
  api: 'API',
  local: 'Local',
}

function setupMessage(
  provider: AIProvider,
  model: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (provider === 'local') {
    return t('ai.providerLocalUnavailable')
  }

  return t('ai.noApiKey', { model })
}

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

  if (action.type === 'create_todo' && action.dueDate) return `${t('todo.dueDate')}: ${action.dueDate}`
  if (action.type === 'update_todo' && action.changes.dueDate) {
    return `${t('todo.dueDate')}: ${action.changes.dueDate}`
  }
  if (action.type === 'schedule_todo' && action.date) return `${t('todo.schedule')}: ${action.date}`

  return null
}

export default function AIAssistantPanel() {
  const ai = useAI()
  const { locale, t } = useI18n()
  const [chatMessage, setChatMessage] = useState('')
  const [goal, setGoal] = useState('')
  const [command, setCommand] = useState('')
  const [modelDraft, setModelDraft] = useState(ai.model)
  const [applyStatus, setApplyStatus] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<string | null>(null)
  const [timeConfirmed, setTimeConfirmed] = useState(false)
  const requiresTimeConfirmation =
    ai.pendingActionPlan?.warnings.some(isTimeConfirmationWarning) ?? false
  const hasTimeConflict = ai.pendingActionPlan?.warnings.some(isTimeConflictWarning) ?? false

  useEffect(() => {
    setModelDraft(ai.model)
  }, [ai.model, ai.provider])

  useEffect(() => {
    setTimeConfirmed(false)
  }, [ai.pendingActionPlan])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTaskStatus(null)
    await ai.sendGoal(goal)
    setGoal('')
  }

  async function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setApplyStatus(null)
    setTaskStatus(null)
    await ai.sendActionCommand(command)
    setCommand('')
  }

  async function handleConversationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setApplyStatus(null)
    setTaskStatus(null)
    await ai.sendConversationMessage(chatMessage)
    setChatMessage('')
  }

  async function handleApplyActions() {
    setApplyStatus(null)
    if (hasTimeConflict) {
      setApplyStatus(t('ai.fixTimeConflicts'))
      return
    }

    if (requiresTimeConfirmation && !timeConfirmed) {
      setApplyStatus(t('ai.reviewTimesBeforeApply'))
      return
    }

    try {
      const result = await ai.applyActionPlan()
      setApplyStatus(
        `Applied ${result.appliedCount} AI action${result.appliedCount === 1 ? '' : 's'}.${
          result.skippedDuplicateCount
            ? ` Skipped ${result.skippedDuplicateCount} duplicate event${
                result.skippedDuplicateCount === 1 ? '' : 's'
              }.`
            : ''
        }`,
      )
    } catch (error) {
      setApplyStatus(error instanceof Error ? error.message : 'Unable to apply AI actions')
    }
  }

  async function handleAddResultToTasks() {
    setTaskStatus(null)

    try {
      const todos = await ai.addAssistantResultToTodo()
      setTaskStatus(
        todos.length === 1
          ? `Added task ${todos[0].title}.`
          : `Added ${todos.length} tasks from AI result.`,
      )
    } catch (error) {
      setTaskStatus(error instanceof Error ? error.message : 'Unable to add AI result to tasks')
    }
  }

  function handleProviderChange(provider: AIProvider) {
    setApplyStatus(null)
    ai.setProvider(provider)
  }

  function commitModel() {
    const nextModel = modelDraft.trim()
    if (!nextModel) {
      setModelDraft(ai.model)
      return
    }

    ai.setModel(nextModel)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold text-slate-950">{t('ai.header')}</h2>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="ai-provider">
              {t('ai.provider')}
            </label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              disabled={ai.loading}
              id="ai-provider"
              onChange={(event) => handleProviderChange(event.target.value as AIProvider)}
              value={ai.provider}
            >
              <option value="api">API</option>
              <option value="local">Local</option>
            </select>
          </div>

          {ai.provider === 'api' ? (
            <div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="ai-model">
              {t('ai.model')}
            </label>
            <input
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              disabled={ai.loading}
              id="ai-model"
              onBlur={commitModel}
              onChange={(event) => setModelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              value={modelDraft}
            />
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            {providerLabels[ai.provider]} / {ai.model}
          </p>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            <p>{t('ai.localTime', { value: ai.timeContext.localDateTimeLabel })}</p>
            <p>
              {t('ai.timezone', {
                name: ai.timeContext.timezoneName,
                offset: ai.timeContext.timezoneOffsetLabel,
                value: ai.timeContext.timezone,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {!ai.isAvailable ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {setupMessage(ai.provider, ai.model, t)}
          </div>
        ) : null}

        {ai.conversationContext?.kind === 'todo-step-refinement' ? (
          <section className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{t('ai.taskRefinementContext')}</h3>
                <p className="mt-1 text-xs text-sky-800">{ai.conversationContext.todoTitle}</p>
              </div>
              <Button className="h-8 px-2 text-xs" onClick={ai.clearHistory} variant="ghost">
                {t('ai.clear')}
              </Button>
            </div>
            <ul className="space-y-1 text-xs leading-5 text-sky-900">
              {ai.conversationContext.selectedItems.map((item) => (
                <li key={`${item.itemLabel}-${item.itemIndex}`}>
                  {item.itemLabel} {item.itemIndex + 1}
                  {item.completed ? ' (completed)' : ''}: {item.value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ai.conversationContext?.kind === 'draft-action-plan' ? (
          <section className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{t('ai.draftPlanContext')}</h3>
                <p className="mt-1 text-xs text-emerald-800">{ai.conversationContext.title}</p>
              </div>
              <Button className="h-8 px-2 text-xs" onClick={ai.clearHistory} variant="ghost">
                {t('ai.clear')}
              </Button>
            </div>
            <p className="text-xs leading-5 text-emerald-900">
              {t('ai.scopedDraftPlan')}
            </p>
          </section>
        ) : null}

        {ai.messages.length ? (
          <div className="space-y-2">
            {ai.messages.map((message) => (
              <AIMessageBubble key={message.id} message={message} />
            ))}
          </div>
        ) : null}

        {ai.isLoading ? <p className="text-sm text-slate-500">{t('ai.thinking')}</p> : null}
        {ai.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{ai.error}</p>
        ) : null}

        {ai.pendingSuggestion ? (
          <AIScheduleSuggestion
            onAddToTasks={handleAddResultToTasks}
            onDismiss={ai.dismissSuggestion}
            onScheduleAll={ai.acceptSuggestion}
            suggestion={ai.pendingSuggestion}
          />
        ) : null}

        {ai.pendingEnabledToolRoute ? (
          <section className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-950">{t('ai.enabledToolRoute')}</h3>
              <p className="mt-1 text-sm text-emerald-900">
                {ai.pendingEnabledToolRoute.instanceAlias} | {ai.pendingEnabledToolRoute.toolName}
              </p>
              <p className="mt-2 text-xs leading-5 text-emerald-800">
                {ai.pendingEnabledToolRoute.reason}
              </p>
            </div>
            <div className="rounded-md bg-white p-2 text-xs leading-5 text-slate-700">
              {ai.pendingEnabledToolRoute.rewrittenInstruction}
            </div>
            <div className="flex gap-2">
              <Button disabled={ai.isLoading} onClick={() => void ai.confirmEnabledToolRoute()} variant="primary">
                {t('ai.dispatch')}
              </Button>
              <Button disabled={ai.isLoading} onClick={ai.clearEnabledToolRoute}>
                {t('ai.cancel')}
              </Button>
            </div>
          </section>
        ) : null}

        {ai.pendingActionPlan ? (
          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">{t('ai.actionPlan')}</h3>
              <p className="mt-1 text-sm text-slate-600">{ai.pendingActionPlan.summary}</p>
            </div>
            <div className="space-y-2">
              {ai.pendingActionPlan.actions.map((action, index) => (
                <article
                  className="rounded-md border border-slate-100 bg-slate-50 p-2"
                  key={`${action.type}-${index}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium text-slate-900">{action.type.replace(/_/g, ' ')}</h4>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">
                      #{index + 1}
                    </span>
                  </div>
                  {'title' in action ? (
                    <p className="mt-1 text-xs font-medium text-slate-700">{action.title}</p>
                  ) : null}
                  {'changes' in action && 'title' in action.changes && action.changes.title ? (
                    <p className="mt-1 text-xs font-medium text-slate-700">{action.changes.title}</p>
                  ) : null}
                  {actionTimeLabel(action, locale, t) ? (
                    <p className="mt-1 text-xs text-slate-700">
                      {t('ai.time', { value: actionTimeLabel(action, locale, t) ?? '' })}
                    </p>
                  ) : null}
                  {'reason' in action && action.reason ? (
                    <p className="mt-1 text-xs leading-5 text-slate-600">{action.reason}</p>
                  ) : null}
                  <pre className="mt-2 overflow-auto rounded bg-white p-2 text-xs text-slate-600">
                    {JSON.stringify(action, null, 2)}
                  </pre>
                </article>
              ))}
            </div>
            {ai.pendingActionPlan.warnings.length ? (
              <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                {ai.pendingActionPlan.warnings.map((warning) => (
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
            <div className="flex gap-2">
              <Button
                disabled={hasTimeConflict || (requiresTimeConfirmation && !timeConfirmed)}
                onClick={() => void handleApplyActions()}
                variant="primary"
              >
                {t('ai.applyActions')}
              </Button>
              <Button onClick={() => void handleAddResultToTasks()}>{t('ai.addToTasks')}</Button>
              <Button onClick={ai.clearActionPlan}>{t('ai.dismiss')}</Button>
            </div>
          </section>
        ) : null}

        {applyStatus ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {applyStatus}
          </p>
        ) : null}
        {taskStatus ? (
          <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">{taskStatus}</p>
        ) : null}
      </div>

      <form className="space-y-2 border-t border-slate-200 p-4" onSubmit={handleConversationSubmit}>
        <div className="flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-slate-700" htmlFor="ai-chat-message">
            {t('ai.conversation')}
          </label>
          {ai.messages.length ? (
            <Button disabled={ai.isLoading} onClick={ai.clearHistory} variant="ghost">
              {t('ai.clear')}
            </Button>
          ) : null}
        </div>
        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-chat-message"
          onChange={(event) => setChatMessage(event.target.value)}
          placeholder={t('ai.conversationPlaceholder')}
          value={chatMessage}
        />
        <Button
          disabled={!ai.isAvailable || ai.isLoading || !chatMessage.trim()}
          type="submit"
          variant="primary"
        >
          {ai.isLoading ? t('ai.thinking') : t('ai.sendMessage')}
        </Button>
      </form>

      <form className="space-y-2 border-t border-slate-200 p-4" onSubmit={handleCommandSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="ai-command">
          {t('ai.command')}
        </label>
        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-command"
          onChange={(event) => setCommand(event.target.value)}
          placeholder={t('ai.commandPlaceholder')}
          value={command}
        />
        <Button
          disabled={!ai.isAvailable || ai.isLoading || !command.trim()}
          type="submit"
          variant="primary"
        >
          {ai.isLoading ? t('ai.thinking') : t('ai.planActions')}
        </Button>
      </form>

      <form className="space-y-2 border-t border-slate-200 p-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="ai-goal">
          {t('ai.goal')}
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-goal"
          onChange={(event) => setGoal(event.target.value)}
          value={goal}
        />
        <Button disabled={!ai.isAvailable || ai.isLoading || !goal.trim()} type="submit" variant="primary">
          {ai.isLoading ? t('ai.thinking') : t('ai.breakDownGoal')}
        </Button>
      </form>
    </div>
  )
}
