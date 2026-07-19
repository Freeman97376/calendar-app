import { useEffect, useState, type FormEvent } from 'react'

import type { AIAction, AIProvider } from '../../domain/types'
import { useApprovalDrawer } from '../../hooks/useApprovalDrawer'
import { useAI, type AIComposerOptions } from '../../hooks/useAI'
import { useI18n } from '../../hooks/useI18n'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig'
import { useWorkspacePanel } from '../../hooks/useWorkspacePanel'
import Button from '../ui/Button'
import AIMessageBubble from './AIMessageBubble'
import AIScheduleSuggestion from './AIScheduleSuggestion'
import GoalConversationPanel from './GoalConversationPanel'

type ComposerMode = 'chat' | 'plan' | 'goal'

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

function actionTitle(action: AIAction): string {
  if (action.type === 'create_event') return action.title
  if (action.type === 'update_event') return action.changes.title ?? `Update event ${action.eventId}`
  if (action.type === 'delete_event') return `Delete event ${action.eventId}`
  if (action.type === 'create_todo') return action.title
  if (action.type === 'update_todo') return action.changes.title ?? `Update task ${action.todoId}`
  if (action.type === 'delete_todo') return `Delete task ${action.todoId}`
  return `Schedule task ${action.todoId}`
}

function modeSubmitLabel(mode: ComposerMode, t: ReturnType<typeof useI18n>['t']): string {
  if (mode === 'goal') return t('ai.breakDownGoal')
  if (mode === 'plan') return t('ai.planActions')
  return t('ai.sendMessage')
}

function modePlaceholder(mode: ComposerMode, t: ReturnType<typeof useI18n>['t']): string {
  if (mode === 'goal') return t('ai.goal')
  if (mode === 'plan') return t('ai.commandPlaceholder')
  return t('ai.conversationPlaceholder')
}

export default function AIAssistantPanel() {
  const ai = useAI()
  const approvalDrawer = useApprovalDrawer()
  const runtimeConfig = useRuntimeConfig()
  const workspace = useWorkspacePanel()
  const { t } = useI18n()
  const [mode, setMode] = useState<ComposerMode>('chat')
  const [draft, setDraft] = useState('')
  const [modelDraft, setModelDraft] = useState(ai.model)
  const [allowActiveToolRouting, setAllowActiveToolRouting] = useState(true)
  const [confirmActiveToolRouting, setConfirmActiveToolRouting] = useState(
    runtimeConfig.confirmEnabledToolRouting,
  )
  const [includeCalendarContext, setIncludeCalendarContext] = useState(true)
  const [includeTodoContext, setIncludeTodoContext] = useState(true)
  const [taskStatus, setTaskStatus] = useState<string | null>(null)
  const [showGoalConversation, setShowGoalConversation] = useState(false)

  useEffect(() => {
    setModelDraft(ai.model)
  }, [ai.model, ai.provider])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return

    setTaskStatus(null)
    setDraft('')

    const options: AIComposerOptions = {
      allowActiveToolRouting,
      confirmActiveToolRouting,
      includeCalendarContext,
      includeTodoContext,
    }

    if (mode === 'goal') {
      await ai.sendGoal(content)
    } else if (mode === 'plan') {
      await ai.sendActionCommand(content, options)
    } else {
      await ai.sendConversationMessage(content, options)
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

  if (showGoalConversation) {
    return <GoalConversationPanel onClose={() => setShowGoalConversation(false)} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{t('ai.header')}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {providerLabels[ai.provider]} / {ai.model}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => workspace.openPanel('tools')} variant="ghost">
              Templates
            </Button>
            <Button onClick={() => setShowGoalConversation(true)} variant="primary">
              New long-term goal / 新长期目标
            </Button>
          </div>
        </div>

        <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {t('ai.settings')}
          </summary>
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

            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  checked={allowActiveToolRouting}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  onChange={(event) => setAllowActiveToolRouting(event.target.checked)}
                  type="checkbox"
                />
                {t('ai.enableActiveToolRouting')}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  checked={confirmActiveToolRouting}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  disabled={!allowActiveToolRouting}
                  onChange={(event) => setConfirmActiveToolRouting(event.target.checked)}
                  type="checkbox"
                />
                {t('settings.routingConfirmDescription')}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  checked={includeCalendarContext}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  onChange={(event) => setIncludeCalendarContext(event.target.checked)}
                  type="checkbox"
                />
                {t('ai.includeCalendarContext')}
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  checked={includeTodoContext}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  onChange={(event) => setIncludeTodoContext(event.target.checked)}
                  type="checkbox"
                />
                {t('ai.includeTodoContext')}
              </label>
            </div>

            <div className="rounded-md bg-white px-3 py-2 text-xs leading-5 text-slate-600">
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
        </details>
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
            <p className="text-xs leading-5 text-emerald-900">{t('ai.scopedDraftPlan')}</p>
          </section>
        ) : null}

        {ai.messages.length ? (
          <div className="space-y-2">
            {ai.messages.map((message) => (
              <AIMessageBubble key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {t('ai.conversationPlaceholder')}
          </p>
        )}

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
            <div className="space-y-1 text-xs text-slate-600">
              {ai.pendingActionPlan.actions.slice(0, 3).map((action, index) => (
                <p key={`${action.type}-${index}`}>
                  {index + 1}. {actionTitle(action)}
                </p>
              ))}
              {ai.pendingActionPlan.actions.length > 3 ? (
                <p>+{ai.pendingActionPlan.actions.length - 3} more actions</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => approvalDrawer.open('ai-action-plan')} variant="primary">
                {t('ai.reviewPlan')}
              </Button>
              <Button onClick={ai.clearActionPlan}>{t('ai.dismiss')}</Button>
            </div>
          </section>
        ) : null}

        {taskStatus ? (
          <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">{taskStatus}</p>
        ) : null}
      </div>

      <form className="space-y-3 border-t border-slate-200 p-4" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('ai.chatMode'), value: 'chat' },
            { label: t('ai.planMode'), value: 'plan' },
            { label: t('ai.goalMode'), value: 'goal' },
          ].map((option) => (
            <button
              aria-label={`Mode: ${option.label}`}
              aria-pressed={mode === option.value}
              className={[
                'h-8 rounded-md border px-3 text-xs font-medium',
                mode === option.value
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
              key={option.value}
              onClick={() => setMode(option.value as ComposerMode)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="ai-composer">
          {t('ai.composer')}
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-composer"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={modePlaceholder(mode, t)}
          value={draft}
        />
        <div className="flex items-center justify-between gap-3">
          {ai.messages.length ? (
            <Button disabled={ai.isLoading} onClick={ai.clearHistory} variant="ghost">
              {t('ai.clear')}
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={!ai.isAvailable || ai.isLoading || !draft.trim()}
            type="submit"
            variant="primary"
          >
            {ai.isLoading ? t('ai.thinking') : modeSubmitLabel(mode, t)}
          </Button>
        </div>
      </form>
    </div>
  )
}
