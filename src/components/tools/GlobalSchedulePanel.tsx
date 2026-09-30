import { useGlobalScheduleProposal } from '../../hooks/useGlobalScheduleProposal'
import { useWorkspacePanel } from '../../hooks/useWorkspacePanel'
import Button from '../ui/Button'

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0
}

export default function GlobalSchedulePanel() {
  const workspace = useWorkspacePanel()
  const { error, isLoading, proposal, recompute, resolve } = useGlobalScheduleProposal()

  const body = proposal?.proposal
  return (
    <section
      id="global-schedule-review"
      tabIndex={-1}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">全局工具排程提案</h3>
          <p className="mt-1 text-xs text-slate-600">所有变更都先在此审核；接受前不会写入日历。</p>
        </div>
        <Button
          disabled={isLoading}
          onClick={() => void recompute('manual').catch(() => undefined)}
          variant="ghost"
        >
          {isLoading ? '计算中…' : '重新计算'}
        </Button>
      </div>

      {!proposal && !isLoading ? (
        <p className="text-sm text-slate-500">尚未生成排程提案。</p>
      ) : null}
      {body ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded px-2 py-1 ${proposal.status === 'pending' ? 'bg-amber-100 text-amber-900' : proposal.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700'}`}
            >
              {proposal.status}
            </span>
            {body.timezone ? <span className="text-slate-500">时区：{body.timezone}</span> : null}
          </div>
          <p className="text-sm text-slate-700">{body.message}</p>
          {body.planChange && typeof body.planChange === 'object' ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
              工具计划变更：
              {text((body.planChange as Record<string, unknown>).projectTitle, '已激活工具')}
              <span className="mt-1 block text-xs">将与下面的全局日历重排一次确认、原子生效。</span>
            </div>
          ) : null}
          {body.kind === 'setup_required' ? (
            <Button onClick={() => workspace.openPanel('settings')} variant="primary">
              设置工作时段
            </Button>
          ) : null}
          {body.conflicts.length ? (
            <div className="rounded bg-red-50 p-2 text-sm text-red-800">
              <p className="font-medium">需要处理的冲突</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {body.conflicts.map((item, index) => (
                  <li key={`${text(item.code)}-${index}`}>
                    {text(item.message, '存在未解决冲突')}
                    {item.earliestFeasibleDate ? (
                      <span className="block text-xs">
                        最早可行日期：{text(item.earliestFeasibleDate)}
                      </span>
                    ) : null}
                    {item.minimumWeeklyCapacityMinutes ? (
                      <span className="block text-xs">
                        最低每周容量：{number(item.minimumWeeklyCapacityMinutes)} 分钟
                      </span>
                    ) : null}
                    {Array.isArray(item.stretchCandidates) && item.stretchCandidates.length ? (
                      <span className="block text-xs">
                        可改为 Stretch：
                        {item.stretchCandidates
                          .filter((value): value is string => typeof value === 'string')
                          .join('、')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {body.toolImpacts.length ? (
            <div>
              <p className="text-xs font-semibold text-slate-700">受影响工具</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {body.toolImpacts.map((item, index) => (
                  <li key={`${text(item.projectId)}-${index}`}>
                    {text(item.projectTitle, '工具')}：{number(item.scheduledMinutes)} 分钟，
                    {number(item.unscheduledCount)} 个未排程行动
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {body.capacityBorrowing.length ? (
            <div className="rounded bg-amber-50 p-2 text-xs text-amber-900">
              {body.capacityBorrowing.map((item, index) => (
                <p key={`${text(item.projectId)}-${text(item.week)}-${index}`}>
                  {text(item.projectTitle)} · {text(item.week)}：借用 {number(item.borrowedMinutes)}{' '}
                  分钟
                </p>
              ))}
            </div>
          ) : null}
          {body.changes.length ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                查看 {body.changes.length} 项日历变更
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-slate-600">
                {body.changes.map((change, index) => (
                  <li key={`${change.eventId}-${index}`}>
                    {change.operation.toUpperCase()} · {text(change.event?.title, change.actionId)}
                    {change.event?.startAt ? ` · ${text(change.event.startAt)}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {proposal.status === 'pending' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isLoading}
                onClick={() => void resolve('accept').catch(() => undefined)}
                variant="primary"
              >
                确认并写入日历
              </Button>
              <Button
                disabled={isLoading}
                onClick={() => void resolve('reject').catch(() => undefined)}
              >
                拒绝提案
              </Button>
            </div>
          ) : null}
          {proposal.status === 'blocked' && body.planChange ? (
            <Button
              disabled={isLoading}
              onClick={() => void resolve('reject').catch(() => undefined)}
            >
              放弃本次工具编辑
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p> : null}
    </section>
  )
}
