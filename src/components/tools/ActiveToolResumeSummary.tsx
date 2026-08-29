import { useEffect, useMemo, useState } from 'react'

import type { GoalControlDashboard } from '../../domain/types/goalControl'
import { useActiveToolWorkspaceTracking } from '../../hooks/useActiveToolWorkspaceTracking'
import Button from '../ui/Button'

function visitKey(projectId: string) {
  return `calendar.activeTool.lastVisit.${projectId}`
}

function priorVisit(projectId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(visitKey(projectId)) ?? null
  } catch {
    return null
  }
}

function rememberVisit(projectId: string) {
  try {
    globalThis.localStorage?.setItem(visitKey(projectId), new Date().toISOString())
  } catch {
    // The summary still works when private browsing blocks local storage.
  }
}

function timestamp(value: unknown) {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN
}

function changedLabel(item: Record<string, unknown>) {
  return String(item.title ?? item.summary ?? item.action_id ?? item.milestone_id ?? 'Plan version')
}

export default function ActiveToolResumeSummary({
  dashboard,
}: {
  dashboard: GoalControlDashboard
}) {
  const projectId = dashboard.project.project_id
  useActiveToolWorkspaceTracking(dashboard)
  const [lastVisit] = useState(() => priorVisit(projectId))
  const today = new Date().toISOString().slice(0, 10)

  const openActions = useMemo(
    () =>
      dashboard.actions
        .filter((action) => !['done', 'skipped'].includes(action.status))
        .sort((left, right) =>
          String(left.due_date || '9999-12-31').localeCompare(
            String(right.due_date || '9999-12-31'),
          ),
        ),
    [dashboard.actions],
  )
  const overdueActions = openActions.filter((action) => action.due_date && action.due_date < today)
  const dueNextActions = openActions.slice(0, 3)
  const blockedItems = [
    ...dashboard.actions
      .filter((item) => item.status === 'blocked')
      .map((item) => `Action: ${item.title}`),
    ...dashboard.milestones
      .filter((item) => item.status === 'blocked')
      .map((item) => `Milestone: ${item.title}`),
  ]
  const pendingProposals = dashboard.proposals.filter((proposal) => proposal.status === 'pending')
  const lastVisitTime = lastVisit ? Date.parse(lastVisit) : Number.NaN
  const changedItems = lastVisit
    ? [...dashboard.actions, ...dashboard.milestones, ...dashboard.versions]
        .filter((item) => timestamp(item.updated_at ?? item.created_at) > lastVisitTime)
        .sort(
          (left, right) =>
            timestamp(right.updated_at ?? right.created_at) -
            timestamp(left.updated_at ?? left.created_at),
        )
        .slice(0, 3)
    : []
  const nextAction = openActions[0]
  const nextStep = dashboard.review.safety_warnings.length
    ? 'Review the safety warning / 查看安全警告'
    : overdueActions[0]
      ? `Work overdue action: ${overdueActions[0].title}`
      : dashboard.pending_check_in
        ? 'Complete the pending check-in / 完成待处理复盘'
        : pendingProposals[0]
          ? 'Review the pending plan change / 审核计划变更'
          : nextAction
            ? `Continue: ${nextAction.title}`
            : 'Review the full plan / 检查完整计划'

  useEffect(() => {
    rememberVisit(projectId)
  }, [projectId])

  function openFullWorkspace() {
    document.getElementById(`active-tool-dashboard-${projectId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <section className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Resume summary / 恢复摘要
          </p>
          <h3 className="mt-1 text-sm font-semibold text-indigo-950">{dashboard.project.title}</h3>
        </div>
        <span className="rounded bg-white px-2 py-1 text-xs text-indigo-800">
          {dashboard.health.status.replace('_', ' ')}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SummaryBlock title="Overdue and due next / 逾期与近期行动">
          {dueNextActions.length ? (
            <ul className="space-y-1">
              {dueNextActions.map((action) => {
                const overdue = Boolean(action.due_date && action.due_date < today)
                return (
                  <li className={overdue ? 'font-medium text-red-700' : ''} key={action.action_id}>
                    {action.title}
                    {action.due_date ? ` · ${overdue ? 'Overdue' : 'Due'} ${action.due_date}` : ''}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>No open action / 暂无未完成行动</p>
          )}
        </SummaryBlock>

        <SummaryBlock title="Pending decisions / 待处理事项">
          <p>Check-in / 复盘：{dashboard.pending_check_in ? 1 : 0}</p>
          <p>Plan changes / 计划变更：{pendingProposals.length}</p>
        </SummaryBlock>

        <SummaryBlock title="Blockers and safety / 阻碍与安全">
          {[...blockedItems, ...dashboard.review.safety_warnings.map((item) => item.label)]
            .length ? (
            <ul className="space-y-1 text-amber-800">
              {[...blockedItems, ...dashboard.review.safety_warnings.map((item) => item.label)]
                .slice(0, 3)
                .map((label) => (
                  <li key={label}>{label}</li>
                ))}
            </ul>
          ) : (
            <p>No blocker or safety warning / 暂无阻碍或安全警告</p>
          )}
        </SummaryBlock>

        <SummaryBlock title="Changed since last visit / 上次访问后的变化">
          {!lastVisit ? (
            <p>First visit — baseline saved now. / 首次访问，现已记录基线。</p>
          ) : changedItems.length ? (
            <ul className="space-y-1">
              {changedItems.map((item, index) => (
                <li key={String(item.action_id ?? item.milestone_id ?? item.version_id ?? index)}>
                  {changedLabel(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No recorded change / 暂无记录到的变化</p>
          )}
        </SummaryBlock>
      </div>

      {dashboard.review.triggers.length ? (
        <p className="rounded bg-white p-2 text-xs text-indigo-900">
          Review attention / 复盘提示：
          {dashboard.review.triggers.map((item) => item.label).join(' · ')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-indigo-950 p-3 text-white">
        <p className="text-sm font-semibold">One next step / 唯一下一步：{nextStep}</p>
        <Button
          className="border-white bg-white text-indigo-950 hover:bg-indigo-100"
          onClick={openFullWorkspace}
        >
          Open full workspace / 打开完整工作区
        </Button>
      </div>
    </section>
  )
}

function SummaryBlock({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <article className="rounded bg-white p-3 text-xs text-indigo-900">
      <h4 className="mb-2 font-semibold">{title}</h4>
      {children}
    </article>
  )
}
