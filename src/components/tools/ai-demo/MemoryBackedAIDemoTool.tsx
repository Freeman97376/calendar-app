import { useEffect, useState, type FormEvent } from 'react'

import type { AIProgressToolKind } from '../../../domain/types'
import type {
  ActionItemStatus,
  MilestoneStatus,
} from '../../../domain/types/longTermMemory'
import { useMemoryBackedAIDemoTool } from '../../../hooks/useMemoryBackedAIDemoTool'
import Button from '../../ui/Button'

type Field =
  | {
      id: string
      label: string
      placeholder?: string
      type: 'text' | 'number' | 'time' | 'textarea'
      defaultValue?: string
    }
  | {
      id: string
      label: string
      type: 'select'
      defaultValue?: string
      options: Array<{ label: string; value: string }>
    }

type MemoryBackedAIDemoToolProps = {
  defaultProjectDescription: string
  defaultProjectTitle: string
  fields: Field[]
  sourceToolId: string
  toolKind: AIProgressToolKind
  toolName: string
}

const inputClass =
  'mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const textareaClass =
  'mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const actionStatuses: ActionItemStatus[] = ['todo', 'scheduled', 'done', 'blocked', 'skipped']
const milestoneStatuses: MilestoneStatus[] = ['not_started', 'in_progress', 'done', 'blocked', 'skipped']

function defaultForm(fields: Field[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.id, field.defaultValue ?? '']))
}

function label(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusClass(status: string): string {
  if (status === 'done') return 'bg-emerald-50 text-emerald-800'
  if (status === 'blocked') return 'bg-red-50 text-red-800'
  if (status === 'skipped') return 'bg-slate-100 text-slate-600'
  if (status === 'scheduled' || status === 'in_progress') return 'bg-sky-50 text-sky-800'
  return 'bg-white text-slate-600'
}

export default function MemoryBackedAIDemoTool({
  defaultProjectDescription,
  defaultProjectTitle,
  fields,
  sourceToolId,
  toolKind,
  toolName,
}: MemoryBackedAIDemoToolProps) {
  const tool = useMemoryBackedAIDemoTool({
    defaultProjectDescription,
    defaultProjectTitle,
    sourceToolId,
    toolKind,
    toolName,
  })
  const [form, setForm] = useState(() => defaultForm(fields))
  const [draftMessage, setDraftMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setForm(defaultForm(fields))
  }, [fields])

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    const result = await tool.sendConversationMessage(
      form,
      'Confirm current requirements and generate or adjust the plan.',
    )
    if (result) setStatus(result.summary)
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    const result = await tool.sendConversationMessage(form, draftMessage)
    if (result) {
      setDraftMessage('')
      setStatus(result.summary)
    }
  }

  async function applyEvents() {
    const created = await tool.applyCalendarEvents()
    setStatus(`Applied ${created.length} calendar event${created.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-950">{toolName}</h3>
        {tool.projects.length ? (
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor={`${sourceToolId}-project`}>
              Project
            </label>
            <select
              className={inputClass}
              id={`${sourceToolId}-project`}
              onChange={(event) => tool.setSelectedProjectId(event.target.value)}
              value={tool.selectedProjectId}
            >
              {tool.projects.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No saved project yet. Generate a plan to create one in SQLite Memory.
          </p>
        )}
      </section>

      <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={(event) => void run(event)}>
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-slate-700" htmlFor={`${sourceToolId}-${field.id}`}>
              {field.label}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                className={textareaClass}
                id={`${sourceToolId}-${field.id}`}
                onChange={(event) => setForm((current) => ({ ...current, [field.id]: event.target.value }))}
                placeholder={field.placeholder}
                value={form[field.id] ?? ''}
              />
            ) : field.type === 'select' ? (
              <select
                className={inputClass}
                id={`${sourceToolId}-${field.id}`}
                onChange={(event) => setForm((current) => ({ ...current, [field.id]: event.target.value }))}
                value={form[field.id] ?? ''}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                id={`${sourceToolId}-${field.id}`}
                onChange={(event) => setForm((current) => ({ ...current, [field.id]: event.target.value }))}
                placeholder={field.placeholder}
                type={field.type}
                value={form[field.id] ?? ''}
              />
            )}
          </div>
        ))}
        <Button disabled={tool.isRunning} type="submit" variant="primary">
          {tool.isRunning ? 'Generating...' : 'Generate / Adjust plan'}
        </Button>
      </form>

      <section className="space-y-3 border-t border-slate-200 pt-4">
        <h4 className="text-sm font-semibold text-slate-950">Conversation</h4>
        <div className="space-y-2">
          {tool.conversation.length ? (
            tool.conversation.map((message) => (
              <article
                className={[
                  'rounded-md border p-3',
                  message.role === 'assistant'
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-950'
                    : 'border-slate-200 bg-white text-slate-700',
                ].join(' ')}
                key={message.id}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {message.role === 'assistant' ? toolName : 'You'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Ready to confirm requirements.
            </p>
          )}
        </div>
        <form className="space-y-2" onSubmit={(event) => void sendMessage(event)}>
          <label className="block text-sm font-medium text-slate-700" htmlFor={`${sourceToolId}-conversation`}>
            Conversation message
          </label>
          <textarea
            className={textareaClass}
            id={`${sourceToolId}-conversation`}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder="Make this lower impact and move the next block to evening."
            value={draftMessage}
          />
          <Button disabled={tool.isRunning || !draftMessage.trim()} type="submit" variant="primary">
            {tool.isRunning ? 'Updating...' : 'Send'}
          </Button>
        </form>
      </section>

      {tool.selectedProject ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-slate-950">{tool.selectedProject.title}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {tool.progressSummary.completed}/{tool.progressSummary.total} complete from {tool.progressSummary.source}
              </p>
            </div>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {tool.progressSummary.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              aria-label={`${toolName} progress`}
              className="h-full rounded-full bg-emerald-700"
              style={{ width: `${tool.progressSummary.percent}%` }}
            />
          </div>
        </section>
      ) : null}

      {tool.milestones.length ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-950">Milestones</h4>
          <div className="space-y-2">
            {tool.milestones.map((milestone) => (
              <article className="rounded-md border border-slate-200 p-3" key={milestone.milestone_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{milestone.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {milestone.due_date ? `Due ${milestone.due_date}` : 'No due date'}
                    </p>
                    {milestone.description ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600">{milestone.description}</p>
                    ) : null}
                  </div>
                  <select
                    aria-label={`Milestone status for ${milestone.title}`}
                    className={`h-8 shrink-0 rounded-md border border-slate-200 px-2 text-xs ${statusClass(milestone.status)}`}
                    onChange={(event) =>
                      void tool.setMilestoneStatus(milestone, event.target.value as MilestoneStatus)
                    }
                    value={milestone.status}
                  >
                    {milestoneStatuses.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {label(candidate)}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tool.actions.length ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-950">Actions</h4>
          <div className="space-y-2">
            {tool.actions.map((action) => (
              <article className="rounded-md border border-slate-200 p-3" key={action.action_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{action.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {action.due_date ? `Due ${action.due_date}` : 'No due date'}
                    </p>
                    {action.description ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600">{action.description}</p>
                    ) : null}
                  </div>
                  <select
                    aria-label={`Action status for ${action.title}`}
                    className={`h-8 shrink-0 rounded-md border border-slate-200 px-2 text-xs ${statusClass(action.status)}`}
                    onChange={(event) => void tool.setActionStatus(action, event.target.value as ActionItemStatus)}
                    value={action.status}
                  >
                    {actionStatuses.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {label(candidate)}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tool.progress.length ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-950">Progress Log</h4>
          <div className="space-y-2">
            {tool.progress.slice(0, 5).map((entry) => (
              <article className="rounded-md border border-slate-200 p-3" key={entry.progress_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{entry.summary}</p>
                    {entry.details ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{entry.details}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {label(entry.log_type)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tool.result ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          {tool.result.confirmedRequirements.length ? (
            <div>
              <h4 className="text-sm font-semibold text-slate-950">Confirmed Requirements</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {tool.result.confirmedRequirements.map((requirement) => (
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700" key={requirement}>
                    {requirement}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <h4 className="text-sm font-semibold text-slate-950">Current Recommendation</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {tool.result.currentRecommendation}
            </p>
          </div>
          {tool.result.needsUserConfirmation ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Waiting for confirmation before applying calendar events.
            </p>
          ) : null}
          {tool.result.calendarEvents.length ? (
            <div className="space-y-2">
              <h5 className="text-sm font-semibold text-slate-950">Calendar Preview</h5>
              {tool.result.calendarEvents.map((event, index) => (
                <article className="rounded-md border border-slate-200 bg-slate-50 p-3" key={`${event.title}-${index}`}>
                  <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDateTime(event.startAt)} - {formatDateTime(event.endAt)}
                  </p>
                  {event.displayDetails ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {event.displayDetails}
                    </p>
                  ) : null}
                </article>
              ))}
              <Button disabled={tool.isApplyingEvents} onClick={() => void applyEvents()} variant="primary">
                {tool.isApplyingEvents ? 'Applying...' : 'Apply events'}
              </Button>
            </div>
          ) : null}
          {tool.result.warnings.length ? (
            <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {tool.result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tool.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{tool.error}</p>
      ) : null}
      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
      {tool.isDetailLoading || tool.isLoading ? <p className="text-sm text-slate-500">Loading memory...</p> : null}
    </div>
  )
}
