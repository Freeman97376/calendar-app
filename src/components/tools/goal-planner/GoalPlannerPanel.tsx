import { useState, type FormEvent } from 'react'

import type {
  ActionItemStatus,
  GoalStatus,
  MilestoneStatus,
  ProgressLogType,
  ProjectStatus,
} from '../../../domain/types/longTermMemory'
import { useGoalPlannerMemory } from '../../../hooks/useGoalPlannerMemory'
import Button from '../../ui/Button'

const inputClass =
  'mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const textareaClass =
  'mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'

const goalStatuses: GoalStatus[] = ['active', 'paused', 'completed', 'archived']
const projectStatuses: ProjectStatus[] = ['active', 'paused', 'completed']
const milestoneStatuses: MilestoneStatus[] = ['not_started', 'in_progress', 'done', 'blocked']
const actionStatuses: ActionItemStatus[] = ['todo', 'scheduled', 'done', 'blocked']
const progressLogTypes: ProgressLogType[] = ['update', 'decision', 'blocker', 'review', 'tool_result']

function label(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function GoalPlannerPanel() {
  const memory = useGoalPlannerMemory()
  const [goalDraft, setGoalDraft] = useState({ description: '', title: '' })
  const [projectDraft, setProjectDraft] = useState({ description: '', title: '' })
  const [milestoneDraft, setMilestoneDraft] = useState({ dueDate: '', title: '' })
  const [actionDraft, setActionDraft] = useState({ dueDate: '', title: '' })
  const [progressDraft, setProgressDraft] = useState<{
    details: string
    logType: ProgressLogType
    summary: string
  }>({ details: '', logType: 'update', summary: '' })
  const [status, setStatus] = useState<string | null>(null)

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!goalDraft.title.trim()) return

    const goal = await memory.createGoal({
      description: goalDraft.description,
      title: goalDraft.title.trim(),
    })
    setGoalDraft({ description: '', title: '' })
    setStatus(`Created goal ${goal.title}`)
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memory.selectedGoal || !projectDraft.title.trim()) return

    const project = await memory.createProject({
      description: projectDraft.description,
      goal_id: memory.selectedGoal.goal_id,
      title: projectDraft.title.trim(),
    })
    setProjectDraft({ description: '', title: '' })
    setStatus(`Created project ${project.title}`)
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memory.selectedProject || !milestoneDraft.title.trim()) return

    const milestone = await memory.createMilestone({
      due_date: milestoneDraft.dueDate || undefined,
      project_id: memory.selectedProject.project_id,
      title: milestoneDraft.title.trim(),
    })
    setMilestoneDraft({ dueDate: '', title: '' })
    setStatus(`Added milestone ${milestone.title}`)
  }

  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memory.selectedProject || !actionDraft.title.trim()) return

    const action = await memory.createAction({
      due_date: actionDraft.dueDate || undefined,
      project_id: memory.selectedProject.project_id,
      title: actionDraft.title.trim(),
    })
    setActionDraft({ dueDate: '', title: '' })
    setStatus(`Added action ${action.title}`)
  }

  async function createProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memory.selectedProject || !progressDraft.summary.trim()) return

    const progress = await memory.createProgress({
      details: progressDraft.details,
      log_type: progressDraft.logType,
      project_id: memory.selectedProject.project_id,
      summary: progressDraft.summary.trim(),
    })
    setProgressDraft({ details: '', logType: 'update', summary: '' })
    setStatus(`Logged ${label(progress.log_type)}`)
  }

  return (
    <div aria-label="Goal planner" className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-950">Goal Planner</h3>
        {memory.isLoading ? <p className="text-sm text-slate-500">Loading memory...</p> : null}
        {memory.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{memory.error}</p>
        ) : null}
        {status ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-950">Goals</h4>
        <form className="space-y-3" onSubmit={(event) => void createGoal(event)}>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="goal-title">
              Goal title
            </label>
            <input
              className={inputClass}
              id="goal-title"
              onChange={(event) =>
                setGoalDraft((current) => ({ ...current, title: event.target.value }))
              }
              value={goalDraft.title}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="goal-description">
              Goal description
            </label>
            <textarea
              className={textareaClass}
              id="goal-description"
              onChange={(event) =>
                setGoalDraft((current) => ({ ...current, description: event.target.value }))
              }
              value={goalDraft.description}
            />
          </div>
          <Button disabled={!goalDraft.title.trim()} type="submit" variant="primary">
            Create goal
          </Button>
        </form>

        <div className="space-y-2">
          {memory.goals.map((goal) => (
            <article
              className={[
                'rounded-md border p-3',
                goal.goal_id === memory.selectedGoalId
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white',
              ].join(' ')}
              key={goal.goal_id}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="min-w-0 text-left"
                  onClick={() => memory.selectGoal(goal.goal_id)}
                  type="button"
                >
                  <p className="truncate text-sm font-semibold text-slate-950">{goal.title}</p>
                  {goal.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{goal.description}</p>
                  ) : null}
                </button>
                <select
                  aria-label={`Goal status for ${goal.title}`}
                  className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs"
                  onChange={(event) =>
                    void memory.updateGoalStatus(goal.goal_id, event.target.value as GoalStatus)
                  }
                  value={goal.status}
                >
                  {goalStatuses.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {label(candidate)}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
          {!memory.goals.length && !memory.isLoading ? (
            <p className="text-sm text-slate-500">No goals yet.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-4">
        <h4 className="text-sm font-semibold text-slate-950">Projects</h4>
        {memory.selectedGoal ? (
          <form className="space-y-3" onSubmit={(event) => void createProject(event)}>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="project-title">
                Project title
              </label>
              <input
                className={inputClass}
                id="project-title"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, title: event.target.value }))
                }
                value={projectDraft.title}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="project-description"
              >
                Project description
              </label>
              <textarea
                className={textareaClass}
                id="project-description"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, description: event.target.value }))
                }
                value={projectDraft.description}
              />
            </div>
            <Button disabled={!projectDraft.title.trim()} type="submit" variant="primary">
              Create project
            </Button>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Select or create a goal first.</p>
        )}

        <div className="space-y-2">
          {memory.goalProjects.map((project) => (
            <article
              className={[
                'rounded-md border p-3',
                project.project_id === memory.selectedProjectId
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white',
              ].join(' ')}
              key={project.project_id}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  className="min-w-0 text-left"
                  onClick={() => memory.selectProject(project.project_id)}
                  type="button"
                >
                  <p className="truncate text-sm font-semibold text-slate-950">{project.title}</p>
                  {project.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{project.description}</p>
                  ) : null}
                </button>
                <select
                  aria-label={`Project status for ${project.title}`}
                  className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs"
                  onChange={(event) =>
                    void memory.updateProjectStatus(
                      project.project_id,
                      event.target.value as ProjectStatus,
                    )
                  }
                  value={project.status}
                >
                  {projectStatuses.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {label(candidate)}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
          {memory.selectedGoal && !memory.goalProjects.length ? (
            <p className="text-sm text-slate-500">No projects for this goal.</p>
          ) : null}
        </div>
      </section>

      {memory.selectedProject ? (
        <section className="space-y-5 border-t border-slate-200 pt-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">{memory.selectedProject.title}</h4>
            {memory.isDetailLoading ? (
              <p className="mt-1 text-sm text-slate-500">Loading project details...</p>
            ) : null}
          </div>

          <section className="space-y-3">
            <h5 className="text-sm font-semibold text-slate-950">Tool History</h5>
            <div className="space-y-2">
              {memory.toolRuns.map((toolRun) => (
                <article className="rounded-md border border-slate-200 p-3" key={toolRun.tool_run_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {toolRun.tool_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {label(toolRun.status)} - {formatDateTime(toolRun.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                      {label(toolRun.status)}
                    </span>
                  </div>
                  {toolRun.intent ? (
                    <p className="mt-2 text-xs text-slate-700">Intent: {toolRun.intent}</p>
                  ) : null}
                  {toolRun.output_summary ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                      {toolRun.output_summary}
                    </p>
                  ) : null}
                </article>
              ))}
              {!memory.toolRuns.length ? (
                <p className="text-sm text-slate-500">No tool runs recorded for this project.</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-semibold text-slate-950">Milestones</h5>
            <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void createMilestone(event)}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="milestone-title">
                  Milestone
                </label>
                <input
                  className={inputClass}
                  id="milestone-title"
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  value={milestoneDraft.title}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="milestone-due-date">
                  Due date
                </label>
                <input
                  className={inputClass}
                  id="milestone-due-date"
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  type="date"
                  value={milestoneDraft.dueDate}
                />
              </div>
              <Button className="sm:col-span-2" disabled={!milestoneDraft.title.trim()} type="submit">
                Add milestone
              </Button>
            </form>
            <div className="space-y-2">
              {memory.milestones.map((milestone) => (
                <div className="rounded-md border border-slate-200 p-3" key={milestone.milestone_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{milestone.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {milestone.due_date ? `Due ${milestone.due_date}` : 'No due date'}
                      </p>
                    </div>
                    <select
                      aria-label={`Milestone status for ${milestone.title}`}
                      className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs"
                      onChange={(event) =>
                        void memory.updateMilestoneStatus(
                          milestone.milestone_id,
                          event.target.value as MilestoneStatus,
                        )
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
                </div>
              ))}
              {!memory.milestones.length ? (
                <p className="text-sm text-slate-500">No milestones yet.</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-semibold text-slate-950">Action Items</h5>
            <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void createAction(event)}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="action-title">
                  Action item
                </label>
                <input
                  className={inputClass}
                  id="action-title"
                  onChange={(event) =>
                    setActionDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  value={actionDraft.title}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="action-due-date">
                  Due date
                </label>
                <input
                  className={inputClass}
                  id="action-due-date"
                  onChange={(event) =>
                    setActionDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  type="date"
                  value={actionDraft.dueDate}
                />
              </div>
              <Button className="sm:col-span-2" disabled={!actionDraft.title.trim()} type="submit">
                Add action
              </Button>
            </form>
            <div className="space-y-2">
              {memory.actions.map((action) => (
                <div className="rounded-md border border-slate-200 p-3" key={action.action_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{action.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {action.due_date ? `Due ${action.due_date}` : 'No due date'}
                      </p>
                    </div>
                    <select
                      aria-label={`Action status for ${action.title}`}
                      className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs"
                      onChange={(event) =>
                        void memory.updateActionStatus(
                          action.action_id,
                          event.target.value as ActionItemStatus,
                        )
                      }
                      value={action.status}
                    >
                      {actionStatuses.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {label(candidate)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {!memory.actions.length ? (
                <p className="text-sm text-slate-500">No action items yet.</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-semibold text-slate-950">Progress Log</h5>
            <form className="space-y-3" onSubmit={(event) => void createProgress(event)}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="progress-type">
                  Log type
                </label>
                <select
                  className={inputClass}
                  id="progress-type"
                  onChange={(event) =>
                    setProgressDraft((current) => ({
                      ...current,
                      logType: event.target.value as ProgressLogType,
                    }))
                  }
                  value={progressDraft.logType}
                >
                  {progressLogTypes.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {label(candidate)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="progress-summary">
                  Summary
                </label>
                <input
                  className={inputClass}
                  id="progress-summary"
                  onChange={(event) =>
                    setProgressDraft((current) => ({ ...current, summary: event.target.value }))
                  }
                  value={progressDraft.summary}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="progress-details">
                  Details
                </label>
                <textarea
                  className={textareaClass}
                  id="progress-details"
                  onChange={(event) =>
                    setProgressDraft((current) => ({ ...current, details: event.target.value }))
                  }
                  value={progressDraft.details}
                />
              </div>
              <Button disabled={!progressDraft.summary.trim()} type="submit">
                Add progress log
              </Button>
            </form>
            <div className="space-y-2">
              {memory.progress.map((entry) => (
                <div className="rounded-md border border-slate-200 p-3" key={entry.progress_id}>
                  <p className="text-sm font-semibold text-slate-950">{entry.summary}</p>
                  <p className="mt-1 text-xs uppercase text-slate-500">{label(entry.log_type)}</p>
                  {entry.details ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{entry.details}</p>
                  ) : null}
                </div>
              ))}
              {!memory.progress.length ? (
                <p className="text-sm text-slate-500">No progress logs yet.</p>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  )
}
