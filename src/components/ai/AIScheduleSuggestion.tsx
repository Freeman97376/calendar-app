import type { AIBreakdownResult } from '../../domain/types'
import Button from '../ui/Button'

type AIScheduleSuggestionProps = {
  suggestion: AIBreakdownResult
  onAddToTasks: () => Promise<void>
  onDismiss: () => void
  onScheduleAll: () => Promise<void>
}

function formatStepTiming(dayOffset: number, hour: number | undefined): string {
  const day = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : `In ${dayOffset} days`
  return hour === undefined ? day : `${day} at ${hour}:00`
}

export default function AIScheduleSuggestion({
  suggestion,
  onAddToTasks,
  onDismiss,
  onScheduleAll,
}: AIScheduleSuggestionProps) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{suggestion.goal}</h2>
        {suggestion.notes ? <p className="mt-1 text-sm text-slate-600">{suggestion.notes}</p> : null}
      </div>

      <div className="space-y-2">
        {suggestion.steps.map((step) => (
          <article className="rounded-md border border-slate-100 bg-slate-50 p-2" key={step.title}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium text-slate-900">{step.title}</h3>
              <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs text-slate-600">
                {step.priority}
              </span>
            </div>
            {step.description ? (
              <p className="mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
            ) : null}
            <p className="mt-1 text-xs font-medium text-slate-500">
              {step.durationMinutes} min - {formatStepTiming(step.suggestedDayOffset, step.suggestedHour)}
            </p>
          </article>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void onScheduleAll()} variant="primary">
          Schedule All
        </Button>
        <Button onClick={() => void onAddToTasks()}>Add to Tasks</Button>
        <Button onClick={onDismiss}>Dismiss</Button>
      </div>
    </section>
  )
}
