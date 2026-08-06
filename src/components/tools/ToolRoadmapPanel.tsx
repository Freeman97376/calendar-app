import type { ToolRoadmapViewModel } from '../../domain/types/toolRoadmap'
import { useI18n } from '../../hooks/useI18n'

type ToolRoadmapPanelProps = {
  roadmap: ToolRoadmapViewModel
}

function statusClass(status: string): string {
  if (status === 'done' || status === 'completed') return 'bg-emerald-50 text-emerald-800'
  if (status === 'blocked') return 'bg-red-50 text-red-800'
  if (status === 'skipped' || status === 'paused') return 'bg-slate-100 text-slate-600'
  if (status === 'scheduled' || status === 'in_progress') return 'bg-sky-50 text-sky-800'
  return 'bg-white text-slate-600'
}

function statusLabel(value: string, t: ReturnType<typeof useI18n>['t']): string {
  const key = `status.${value}` as Parameters<ReturnType<typeof useI18n>['t']>[0]
  const translated = t(key)
  return translated === key ? value.replace(/_/g, ' ') : translated
}

function sourceLabel(
  value: ToolRoadmapViewModel['pathSource'],
  t: ReturnType<typeof useI18n>['t'],
) {
  const key = `enabled.pathSource.${value}` as Parameters<ReturnType<typeof useI18n>['t']>[0]
  const translated = t(key)
  return translated === key ? value : translated
}

export default function ToolRoadmapPanel({ roadmap }: ToolRoadmapPanelProps) {
  const { t } = useI18n()
  const latestMemory =
    roadmap.recentProgress[0]?.summary || roadmap.recentToolRuns[0]?.output_summary

  return (
    <section
      aria-label={t('enabled.roadmap')}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {t('enabled.longTermPlan')}
          </p>
          <h4 className="mt-1 truncate text-sm font-semibold text-slate-950">
            {roadmap.goalTitle}
          </h4>
          {roadmap.goalSummary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
              {roadmap.goalSummary}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded bg-white px-2 py-1 text-xs font-medium text-slate-700">
          {roadmap.progressSummary.percent}%
        </span>
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div
            aria-label={`${roadmap.goalTitle} progress`}
            className="h-full rounded-full bg-emerald-700"
            style={{ width: `${roadmap.progressSummary.percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {t('enabled.completeFrom', {
            completed: roadmap.progressSummary.completed,
            source: roadmap.progressSummary.source,
            total: roadmap.progressSummary.total,
          })}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h5 className="text-sm font-semibold text-slate-950">
            {t('enabled.implementationPath')}
          </h5>
          <span className="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-500">
            {sourceLabel(roadmap.pathSource, t)}
          </span>
        </div>
        <ol className="space-y-2">
          {roadmap.steps.map((step) => (
            <li className="rounded-md border border-slate-200 bg-white p-3" key={step.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {step.order}. {step.title}
                  </p>
                  {step.description ? (
                    <p className="mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {step.actionCount
                      ? `${step.completedActionCount}/${step.actionCount} ${t('enabled.actions').toLowerCase()}`
                      : t('enabled.noPathYet')}
                    {step.dueDate ? ` - ${t('todo.dueDate')}: ${step.dueDate}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-xs ${statusClass(step.status)}`}>
                  {statusLabel(step.status, t)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {latestMemory ? (
        <div className="rounded-md bg-white px-3 py-2">
          <p className="text-xs font-semibold text-slate-500">{t('enabled.progressMemory')}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{latestMemory}</p>
        </div>
      ) : null}
    </section>
  )
}
