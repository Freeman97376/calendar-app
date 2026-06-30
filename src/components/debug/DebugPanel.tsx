import type { ReactNode } from 'react'

import { useDebugInfo } from '../../hooks/useDebugPanel'

function Field({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="max-w-40 break-words text-right text-xs text-slate-800">{String(value)}</dd>
    </div>
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3">
      <h3 className="text-xs font-semibold uppercase tracking-normal text-slate-500">{title}</h3>
      <dl className="mt-2">{children}</dl>
    </section>
  )
}

export default function DebugPanel() {
  const debug = useDebugInfo()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <h2 className="text-base font-semibold text-slate-950">Debug</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        <Section title="Time">
          <Field label="Local" value={debug.time.localDateTimeLabel} />
          <Field label="Zone" value={debug.time.timezone} />
          <Field label="Name" value={debug.time.timezoneName} />
          <Field label="Offset" value={debug.time.timezoneOffsetLabel} />
          <Field label="Override" value={debug.config.timezoneOverride} />
        </Section>

        <Section title="AI">
          <Field label="Provider" value={debug.ai.provider} />
          <Field label="Model" value={debug.ai.model} />
          <Field label="Available" value={debug.ai.available} />
          <Field label="Loading" value={debug.ai.loading} />
          <Field label="Service" value={debug.ai.serviceConfigured} />
          <Field label="Actions" value={debug.ai.pendingActions} />
          <Field label="Warnings" value={debug.ai.warnings} />
          <Field label="Goal steps" value={debug.ai.pendingSuggestionSteps} />
        </Section>

        <Section title="Calendar">
          <Field label="View" value={debug.calendar.view} />
          <Field label="Focus" value={debug.calendar.focusedDate} />
          <Field label="Events" value={debug.counts.events} />
        </Section>

        <Section title="Tasks">
          <Field label="Total" value={debug.counts.todos} />
          <Field label="Open" value={debug.counts.openTodos} />
          <Field label="Done" value={debug.counts.doneTodos} />
        </Section>

        <Section title="Panels">
          <Field label="Workspace" value={debug.ui.activeWorkspacePanel} />
          <Field label="AI" value={debug.ui.aiPanelOpen} />
          <Field label="Todos" value={debug.ui.todoPanelOpen} />
          <Field label="Tools" value={debug.ui.toolsPanelOpen} />
          <Field label="Debug" value={debug.ui.debugPanelOpen} />
          <Field label="Tool" value={debug.ui.activeToolId} />
        </Section>

        {debug.errors.length ? (
          <section className="rounded-md border border-red-200 bg-red-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-normal text-red-700">Errors</h3>
            <ul className="mt-2 space-y-1 text-xs text-red-800">
              {debug.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
