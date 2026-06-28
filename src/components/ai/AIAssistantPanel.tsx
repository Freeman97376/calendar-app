import { useEffect, useState, type FormEvent } from 'react'

import type { AIAction, AIProvider } from '../../domain/types'
import {
  TIME_CONFIRMATION_WARNING_PREFIX,
  TIME_CONFLICT_WARNING_PREFIX,
} from '../../domain/types/aiWarnings'
import { useAI } from '../../hooks/useAI'
import Button from '../ui/Button'
import AIMessageBubble from './AIMessageBubble'
import AIScheduleSuggestion from './AIScheduleSuggestion'

const providerLabels: Record<AIProvider, string> = {
  api: 'API',
  local: 'Local',
}

function setupMessage(provider: AIProvider, model: string): string {
  if (provider === 'local') {
    return 'Local AI planner is unavailable.'
  }

  return `API provider is selected but no API key is configured. Add VITE_AI_API_KEY or VITE_DEEPSEEK_API_KEY to .env.local, or save it in Tools > Settings. Current model: ${model}.`
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function actionTimeLabel(action: AIAction): string | null {
  if (action.type === 'create_event') {
    return `${formatDateTime(action.startAt)} - ${formatDateTime(action.endAt)}`
  }

  if (action.type === 'update_event' && action.changes.startAt) {
    return action.changes.endAt
      ? `${formatDateTime(action.changes.startAt)} - ${formatDateTime(action.changes.endAt)}`
      : formatDateTime(action.changes.startAt)
  }

  if (action.type === 'create_todo' && action.dueDate) return `Due ${action.dueDate}`
  if (action.type === 'update_todo' && action.changes.dueDate) return `Due ${action.changes.dueDate}`
  if (action.type === 'schedule_todo' && action.date) return `Schedule ${action.date}`

  return null
}

export default function AIAssistantPanel() {
  const ai = useAI()
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
      setApplyStatus('Fix overlapping or duplicate action times before applying.')
      return
    }

    if (requiresTimeConfirmation && !timeConfirmed) {
      setApplyStatus('Confirm the near-term action times before applying.')
      return
    }

    try {
      await ai.applyActionPlan()
      setApplyStatus('Applied AI actions.')
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
    <aside
      aria-label="AI assistant"
      className="flex w-full flex-col border-t border-slate-200 bg-white xl:max-w-sm xl:border-l xl:border-t-0"
    >
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold text-slate-950">AI Assistant</h2>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="ai-provider">
              AI provider
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
              AI model
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
            <p>Local time: {ai.timeContext.localDateTimeLabel}</p>
            <p>
              Timezone: {ai.timeContext.timezone} ({ai.timeContext.timezoneName},{' '}
              {ai.timeContext.timezoneOffsetLabel})
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {!ai.isAvailable ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {setupMessage(ai.provider, ai.model)}
          </div>
        ) : null}

        {ai.conversationContext?.kind === 'todo-step-refinement' ? (
          <section className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Task refinement context</h3>
                <p className="mt-1 text-xs text-sky-800">{ai.conversationContext.todoTitle}</p>
              </div>
              <Button className="h-8 px-2 text-xs" onClick={ai.clearHistory} variant="ghost">
                Clear
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
                <h3 className="font-semibold">Draft plan conversation</h3>
                <p className="mt-1 text-xs text-emerald-800">{ai.conversationContext.title}</p>
              </div>
              <Button className="h-8 px-2 text-xs" onClick={ai.clearHistory} variant="ghost">
                Clear
              </Button>
            </div>
            <p className="text-xs leading-5 text-emerald-900">
              This conversation is scoped to the current unapplied action plan.
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

        {ai.isLoading ? <p className="text-sm text-slate-500">Thinking...</p> : null}
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

        {ai.pendingActionPlan ? (
          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Action Plan</h3>
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
                  {actionTimeLabel(action) ? (
                    <p className="mt-1 text-xs text-slate-700">Time: {actionTimeLabel(action)}</p>
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
                Overlapping or duplicate times must be fixed before applying.
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
                <span>I reviewed and confirmed the near-term times.</span>
              </label>
            ) : null}
            <div className="flex gap-2">
              <Button
                disabled={hasTimeConflict || (requiresTimeConfirmation && !timeConfirmed)}
                onClick={() => void handleApplyActions()}
                variant="primary"
              >
                Apply Actions
              </Button>
              <Button onClick={() => void handleAddResultToTasks()}>Add to Tasks</Button>
              <Button onClick={ai.clearActionPlan}>Dismiss</Button>
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
            Conversation
          </label>
          {ai.messages.length ? (
            <Button disabled={ai.isLoading} onClick={ai.clearHistory} variant="ghost">
              Clear
            </Button>
          ) : null}
        </div>
        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-chat-message"
          onChange={(event) => setChatMessage(event.target.value)}
          placeholder="Ask a question, clarify unclear details, or ask AI to rewrite selected task steps."
          value={chatMessage}
        />
        <Button
          disabled={!ai.isAvailable || ai.isLoading || !chatMessage.trim()}
          type="submit"
          variant="primary"
        >
          {ai.isLoading ? 'Thinking...' : 'Send message'}
        </Button>
      </form>

      <form className="space-y-2 border-t border-slate-200 p-4" onSubmit={handleCommandSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="ai-command">
          Calendar or task command
        </label>
        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-command"
          onChange={(event) => setCommand(event.target.value)}
          placeholder='Examples: "add dinner with friend this Friday at 7pm", "create todo draft proposal tomorrow", "delete event Planning session"'
          value={command}
        />
        <Button
          disabled={!ai.isAvailable || ai.isLoading || !command.trim()}
          type="submit"
          variant="primary"
        >
          {ai.isLoading ? 'Thinking...' : 'Plan actions'}
        </Button>
      </form>

      <form className="space-y-2 border-t border-slate-200 p-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="ai-goal">
          Goal
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
          disabled={!ai.isAvailable || ai.isLoading}
          id="ai-goal"
          onChange={(event) => setGoal(event.target.value)}
          value={goal}
        />
        <Button disabled={!ai.isAvailable || ai.isLoading || !goal.trim()} type="submit" variant="primary">
          {ai.isLoading ? 'Thinking...' : 'Break down goal'}
        </Button>
      </form>
    </aside>
  )
}
