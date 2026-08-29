import { useState } from 'react'

import type {
  GoalActivationPlan,
  GoalPlanAction,
  GoalPlanMilestone,
  GoalPlanMissingInformation,
  GoalPlanRisk,
} from '../../domain/types/goalControl'
import Button from '../ui/Button'

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item))
}

function withoutAt<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index)
}

function draftId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}

const emptyMilestone = (): GoalPlanMilestone => ({
  title: '',
  description: '',
  due_date: null,
  status: 'not_started',
})

const emptyAction = (): GoalPlanAction => ({
  title: '',
  description: '',
  milestone_id: null,
  milestone_title: null,
  due_date: null,
  estimated_minutes: 30,
  priority: 'medium',
  energy_needed: 'medium',
  execution_tier: 'standard',
  status: 'todo',
})

export default function InitialPlanReview({
  blockingIssues,
  busy,
  onActivate,
  onChange,
  onRevise,
  plan,
}: {
  blockingIssues: string[]
  busy: boolean
  onActivate: () => Promise<void> | void
  onChange: (plan: GoalActivationPlan) => void
  onRevise: (instruction: string) => Promise<void> | void
  plan: GoalActivationPlan
}) {
  const [revision, setRevision] = useState('')
  const weeklyCapacity = Number(plan.policy.weekly_capacity_minutes ?? 0)

  function update<K extends keyof GoalActivationPlan>(key: K, value: GoalActivationPlan[K]) {
    onChange({ ...plan, [key]: value })
  }

  return (
    <section className="space-y-5 rounded-lg border border-emerald-300 bg-white p-4 shadow-sm">
      <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {plan.template_label ?? plan.template_id} · Initial plan review / 初始计划审阅
          </p>
          <h2 className="mt-1 text-base font-semibold text-emerald-950">{plan.title}</h2>
          <p className="mt-1 text-xs text-emerald-800">
            Confidence / 置信度：{plan.confidence.level} · Blocking / 阻塞：
            {blockingIssues.length}
          </p>
        </div>
        <Button
          disabled={busy || Boolean(blockingIssues.length)}
          onClick={() => void onActivate()}
          variant="primary"
        >
          Approve and create Active Tool / 批准并创建
        </Button>
      </div>

      <p className="text-sm text-slate-600">
        Edit every confirmed field directly or ask AI for one focused revision. Nothing is activated
        until approval. / 可直接编辑所有确认字段，或让 AI 定向修改；批准前不会激活。
      </p>

      {blockingIssues.length ? <BlockingIssues issues={blockingIssues} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tool title / 工具名称">
          <input
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            onChange={(event) => update('title', event.target.value)}
            value={plan.title}
          />
        </Field>
        <Field label="Target date / 目标日期">
          <input
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            onChange={(event) => update('target_date', event.target.value || null)}
            type="date"
            value={plan.target_date ?? ''}
          />
        </Field>
      </div>

      <Field label="Outcome and summary / 目标与摘要">
        <textarea
          className="min-h-24 w-full rounded border border-slate-300 p-3 text-sm"
          onChange={(event) => update('summary', event.target.value)}
          value={plan.summary}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Assumptions, one per line / 假设（每行一项）">
          <textarea
            className="min-h-28 w-full rounded border border-slate-300 p-3 text-sm"
            onChange={(event) => update('assumptions', lines(event.target.value))}
            value={plan.assumptions.join('\n')}
          />
        </Field>
        <Field label="Constraints, one per line / 限制（每行一项）">
          <textarea
            className="min-h-28 w-full rounded border border-slate-300 p-3 text-sm"
            onChange={(event) => update('constraints', lines(event.target.value))}
            value={plan.constraints.join('\n')}
          />
        </Field>
      </div>

      <EditableList
        addLabel="Add missing information / 添加缺失信息"
        onAdd={() =>
          update('missing_information', [
            ...plan.missing_information,
            { id: draftId('missing'), label: '', impact: '', blocking: false },
          ])
        }
        title="Missing information / 缺失信息"
      >
        {plan.missing_information.map((item, index) => (
          <MissingInformationEditor
            item={item}
            key={item.id}
            onChange={(value) =>
              update('missing_information', replaceAt(plan.missing_information, index, value))
            }
            onRemove={() =>
              update('missing_information', withoutAt(plan.missing_information, index))
            }
          />
        ))}
      </EditableList>

      <EditableList
        addLabel="Add risk / 添加风险"
        onAdd={() =>
          update('risks', [...plan.risks, { label: '', severity: 'medium', mitigation: '' }])
        }
        title="Risks and mitigations / 风险与缓解措施"
      >
        {plan.risks.map((item, index) => (
          <RiskEditor
            item={item}
            key={`${item.label}-${index}`}
            onChange={(value) => update('risks', replaceAt(plan.risks, index, value))}
            onRemove={() => update('risks', withoutAt(plan.risks, index))}
          />
        ))}
      </EditableList>

      <EditableList
        addLabel="Add Milestone / 添加里程碑"
        onAdd={() => update('milestones', [...plan.milestones, emptyMilestone()])}
        title="Milestones / 里程碑"
      >
        {plan.milestones.map((item, index) => (
          <MilestoneEditor
            item={item}
            key={item.milestone_id ?? `${item.title}-${index}`}
            onChange={(value) => update('milestones', replaceAt(plan.milestones, index, value))}
            onRemove={() => update('milestones', withoutAt(plan.milestones, index))}
          />
        ))}
      </EditableList>

      <EditableList
        addLabel="Add Action / 添加行动"
        onAdd={() => update('actions', [...plan.actions, emptyAction()])}
        title="Initial Actions / 初始行动"
      >
        {plan.actions.map((item, index) => (
          <ActionEditor
            item={item}
            key={item.action_id ?? `${item.title}-${index}`}
            milestones={plan.milestones}
            onChange={(value) => update('actions', replaceAt(plan.actions, index, value))}
            onRemove={() => update('actions', withoutAt(plan.actions, index))}
          />
        ))}
      </EditableList>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Review cadence / 复盘频率">
          <select
            className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"
            onChange={(event) =>
              update('review_cadence', {
                ...plan.review_cadence,
                frequency: event.target.value as GoalActivationPlan['review_cadence']['frequency'],
              })
            }
            value={plan.review_cadence.frequency}
          >
            <option value="daily">Daily / 每日</option>
            <option value="weekly">Weekly / 每周</option>
            <option value="biweekly">Biweekly / 每两周</option>
            <option value="monthly">Monthly / 每月</option>
          </select>
        </Field>
        <Field label="Review time / 复盘时间">
          <input
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            onChange={(event) =>
              update('review_cadence', {
                ...plan.review_cadence,
                local_time: event.target.value || undefined,
              })
            }
            type="time"
            value={plan.review_cadence.local_time ?? ''}
          />
        </Field>
        <Field label="Timezone / 时区">
          <input
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            onChange={(event) =>
              update('review_cadence', {
                ...plan.review_cadence,
                timezone: event.target.value || undefined,
              })
            }
            placeholder="America/Los_Angeles"
            value={plan.review_cadence.timezone ?? ''}
          />
        </Field>
        <Field label="Weekly capacity minutes / 每周容量（分钟）">
          <input
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm"
            min={0}
            onChange={(event) =>
              update('policy', {
                ...plan.policy,
                weekly_capacity_minutes: Number(event.target.value) || 0,
              })
            }
            type="number"
            value={weeklyCapacity}
          />
        </Field>
        <Field label="Confidence / 置信度">
          <select
            className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"
            onChange={(event) =>
              update('confidence', {
                ...plan.confidence,
                level: event.target.value as GoalActivationPlan['confidence']['level'],
              })
            }
            value={plan.confidence.level}
          >
            <option value="low">Low / 低</option>
            <option value="medium">Medium / 中</option>
            <option value="high">High / 高</option>
          </select>
        </Field>
        <Field label="Confidence reasons / 置信度原因">
          <textarea
            className="min-h-20 w-full rounded border border-slate-300 p-2 text-sm"
            onChange={(event) =>
              update('confidence', { ...plan.confidence, reasons: lines(event.target.value) })
            }
            value={plan.confidence.reasons.join('\n')}
          />
        </Field>
      </div>

      {Object.keys(plan.activation_form ?? {}).length ? (
        <section className="rounded-md bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Template-specific fields / 模板专属字段
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {Object.entries(plan.activation_form ?? {}).map(([key, value]) => (
              <Field key={key} label={key}>
                <input
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm"
                  onChange={(event) =>
                    update('activation_form', {
                      ...plan.activation_form,
                      [key]: event.target.value,
                    })
                  }
                  value={value}
                />
              </Field>
            ))}
          </div>
        </section>
      ) : null}

      {plan.template_id === 'fitness-ai' ? (
        <label className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <input
            checked={plan.safety_confirmation}
            onChange={(event) => update('safety_confirmation', event.target.checked)}
            type="checkbox"
          />
          I explicitly confirmed known injury, pain, medical, and movement constraints (or none
          known). / 我已明确确认已知伤痛、医疗与动作限制（或暂无已知限制）。
        </label>
      ) : null}

      <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
        <Field label="Revise with AI / 使用 AI 修改当前计划">
          <textarea
            className="min-h-20 w-full rounded border border-sky-200 bg-white p-3 text-sm"
            onChange={(event) => setRevision(event.target.value)}
            placeholder="Example: reduce weekly workload to three hours and preserve confirmed safety constraints."
            value={revision}
          />
        </Field>
        <Button
          className="mt-2"
          disabled={busy || !revision.trim()}
          onClick={async () => {
            await onRevise(revision)
            setRevision('')
          }}
        >
          Revise plan / 修改计划
        </Button>
      </div>
    </section>
  )
}

function EditableList({
  addLabel,
  children,
  onAdd,
  title,
}: {
  addLabel: string
  children: React.ReactNode
  onAdd: () => void
  title: string
}) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <Button onClick={onAdd} type="button" variant="secondary">
          {addLabel}
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function MissingInformationEditor({
  item,
  onChange,
  onRemove,
}: {
  item: GoalPlanMissingInformation
  onChange: (value: GoalPlanMissingInformation) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
      <Field label="Missing detail / 缺失信息">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, label: event.target.value })}
          value={item.label}
        />
      </Field>
      <Field label="Accuracy impact / 准确度影响">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, impact: event.target.value })}
          value={item.impact}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          checked={item.blocking}
          onChange={(event) => onChange({ ...item, blocking: event.target.checked })}
          type="checkbox"
        />
        Blocking before activation / 激活前必须解决
      </label>
      <Button onClick={onRemove} type="button" variant="ghost">
        Remove / 删除
      </Button>
    </div>
  )
}

function RiskEditor({
  item,
  onChange,
  onRemove,
}: {
  item: GoalPlanRisk
  onChange: (value: GoalPlanRisk) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
      <Field label="Risk / 风险">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, label: event.target.value })}
          value={item.label}
        />
      </Field>
      <Field label="Severity / 等级">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...item, severity: event.target.value as GoalPlanRisk['severity'] })
          }
          value={item.severity}
        >
          <option value="low">Low / 低</option>
          <option value="medium">Medium / 中</option>
          <option value="high">High / 高</option>
        </select>
      </Field>
      <Field label="Mitigation / 缓解措施">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, mitigation: event.target.value })}
          value={item.mitigation ?? ''}
        />
      </Field>
      <Button onClick={onRemove} type="button" variant="ghost">
        Remove / 删除
      </Button>
    </div>
  )
}

function MilestoneEditor({
  item,
  onChange,
  onRemove,
}: {
  item: GoalPlanMilestone
  onChange: (value: GoalPlanMilestone) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
      <Field label="Title / 标题">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          value={item.title}
        />
      </Field>
      <Field label="Due date / 截止日期">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, due_date: event.target.value || null })}
          type="date"
          value={item.due_date ?? ''}
        />
      </Field>
      <Field label="Description / 描述">
        <textarea
          className="min-h-20 w-full rounded border border-slate-300 bg-white p-2 text-sm"
          onChange={(event) => onChange({ ...item, description: event.target.value })}
          value={item.description}
        />
      </Field>
      <Field label="Status / 状态">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...item, status: event.target.value as GoalPlanMilestone['status'] })
          }
          value={item.status ?? 'not_started'}
        >
          <option value="not_started">Not started / 未开始</option>
          <option value="in_progress">In progress / 进行中</option>
          <option value="blocked">Blocked / 受阻</option>
          <option value="done">Done / 完成</option>
        </select>
      </Field>
      <Button onClick={onRemove} type="button" variant="ghost">
        Remove / 删除
      </Button>
    </div>
  )
}

function ActionEditor({
  item,
  milestones,
  onChange,
  onRemove,
}: {
  item: GoalPlanAction
  milestones: GoalPlanMilestone[]
  onChange: (value: GoalPlanAction) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
      <Field label="Title / 标题">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          value={item.title}
        />
      </Field>
      <Field label="Milestone / 里程碑">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...item, milestone_id: null, milestone_title: event.target.value || null })
          }
          value={item.milestone_title ?? ''}
        >
          <option value="">Unassigned / 未关联</option>
          {milestones.map((milestone, index) => (
            <option
              key={milestone.milestone_id ?? `${milestone.title}-${index}`}
              value={milestone.title}
            >
              {milestone.title || `Milestone ${index + 1}`}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Due date / 截止日期">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) => onChange({ ...item, due_date: event.target.value || null })}
          type="date"
          value={item.due_date ?? ''}
        />
      </Field>
      <Field label="Description / 描述">
        <textarea
          className="min-h-20 w-full rounded border border-slate-300 bg-white p-2 text-sm"
          onChange={(event) => onChange({ ...item, description: event.target.value })}
          value={item.description}
        />
      </Field>
      <Field label="Estimated minutes / 预计分钟">
        <input
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          min={5}
          onChange={(event) =>
            onChange({ ...item, estimated_minutes: Number(event.target.value) || 0 })
          }
          type="number"
          value={item.estimated_minutes}
        />
      </Field>
      <Field label="Priority / 优先级">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...item, priority: event.target.value as GoalPlanAction['priority'] })
          }
          value={item.priority}
        >
          <option value="high">High / 高</option>
          <option value="medium">Medium / 中</option>
          <option value="low">Low / 低</option>
        </select>
      </Field>
      <Field label="Energy / 精力">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({
              ...item,
              energy_needed: event.target.value as GoalPlanAction['energy_needed'],
            })
          }
          value={item.energy_needed}
        >
          <option value="high">High / 高</option>
          <option value="medium">Medium / 中</option>
          <option value="low">Low / 低</option>
        </select>
      </Field>
      <Field label="Execution tier / 执行层级">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({
              ...item,
              execution_tier: event.target.value as GoalPlanAction['execution_tier'],
            })
          }
          value={item.execution_tier}
        >
          <option value="minimum">Minimum / 最低</option>
          <option value="standard">Standard / 标准</option>
          <option value="stretch">Stretch / 挑战</option>
        </select>
      </Field>
      <Field label="Status / 状态">
        <select
          className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...item, status: event.target.value as GoalPlanAction['status'] })
          }
          value={item.status ?? 'todo'}
        >
          <option value="todo">To do / 待办</option>
          <option value="in_progress">In progress / 进行中</option>
          <option value="blocked">Blocked / 受阻</option>
          <option value="done">Done / 完成</option>
          <option value="skipped">Skipped / 跳过</option>
        </select>
      </Field>
      <Button onClick={onRemove} type="button" variant="ghost">
        Remove / 删除
      </Button>
    </div>
  )
}

function BlockingIssues({ issues }: { issues: string[] }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="font-semibold">Resolve before activation / 激活前需解决</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-1 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  )
}
