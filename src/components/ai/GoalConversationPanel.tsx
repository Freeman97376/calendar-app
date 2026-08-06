import { useState } from 'react'

import type { GoalConversationMessage, QuestionBatchItem } from '../../domain/types/goalControl'
import { useGoalConversation } from '../../hooks/useGoalConversation'
import Button from '../ui/Button'
import QuestionBatch from './QuestionBatch'

const currentSituationQuestions: QuestionBatchItem[] = [
  {
    id: 'current_stage',
    prompt: 'Where are you starting from right now? / 你目前处于什么阶段？',
    selectionMode: 'single',
    allowCustom: true,
    choices: [
      { id: 'starting', label: 'Starting from scratch / 刚开始' },
      { id: 'returning', label: 'Returning after a break / 中断后恢复' },
      { id: 'inconsistent', label: 'Some experience, inconsistent / 有经验但不稳定' },
      { id: 'progressing', label: 'Already progressing consistently / 已稳定推进' },
    ],
  },
  {
    id: 'current_evidence',
    prompt: 'What current evidence or measurements do you have? / 你目前有哪些数据或事实依据？',
    selectionMode: 'multiple',
    allowCustom: true,
    choices: [
      {
        id: 'recent_numbers',
        label: 'Recent measurements / 有近期数据',
        description:
          'Add the actual values in your own answer when possible. / 可在自定义回答中填写具体数值。',
      },
      { id: 'recent_activity', label: 'Recent activity history / 有近期执行记录' },
      { id: 'qualitative', label: 'Only a qualitative estimate / 只有主观判断' },
      { id: 'needs_baseline', label: 'Need a baseline check / 需要先做基线测量' },
    ],
  },
  {
    id: 'current_constraints',
    prompt: 'Which constraints must the plan respect now? / 当前计划必须尊重哪些限制？',
    selectionMode: 'multiple',
    allowCustom: true,
    choices: [
      { id: 'schedule', label: 'Schedule or energy / 时间或精力' },
      { id: 'safety', label: 'Health or safety / 健康或安全' },
      { id: 'resources', label: 'Equipment or resources / 设备或资源' },
      { id: 'responsibilities', label: 'Work or family duties / 工作或家庭责任' },
      { id: 'none', label: 'No major constraint / 暂无重大限制' },
    ],
  },
]

const outcomeQuestions: QuestionBatchItem[] = [
  {
    id: 'outcome',
    prompt: 'What result matters most? / 你最看重什么结果？',
    selectionMode: 'single',
    allowCustom: true,
    choices: [
      { id: 'reach', label: 'Reach a target / 达到目标' },
      { id: 'improve', label: 'Improve steadily / 持续提升' },
      { id: 'build', label: 'Build a habit / 建立习惯' },
    ],
  },
  {
    id: 'deadline',
    prompt: 'What is the planning horizon? / 计划周期？',
    selectionMode: 'single',
    allowCustom: true,
    choices: [
      { id: '4w', label: '4 weeks' },
      { id: '8w', label: '8 weeks' },
      { id: '12w', label: '12 weeks' },
      { id: 'open', label: 'No fixed date / 暂无期限' },
    ],
  },
  {
    id: 'capacity',
    prompt: 'How much time is realistically available each week? / 每周现实可用时间？',
    selectionMode: 'single',
    allowCustom: true,
    choices: [
      { id: '120', label: '2 hours' },
      { id: '240', label: '4 hours' },
      { id: '360', label: '6 hours' },
      { id: '480', label: '8 hours' },
    ],
  },
]

const controlQuestions: QuestionBatchItem[] = [
  {
    id: 'measurement',
    prompt: 'How should progress be measured? / 如何衡量进展？',
    selectionMode: 'multiple',
    allowCustom: true,
    choices: [
      { id: 'completion', label: 'Completion rate / 完成率' },
      { id: 'time', label: 'Time invested / 实际投入' },
      { id: 'outcome', label: 'Outcome metric / 结果指标' },
    ],
  },
  {
    id: 'tier',
    prompt: 'Which execution level should be the default? / 默认执行档位？',
    selectionMode: 'single',
    allowCustom: false,
    choices: [
      { id: 'minimum', label: 'Minimum / 最低' },
      { id: 'standard', label: 'Standard / 标准' },
      { id: 'stretch', label: 'Stretch / 冲刺' },
    ],
  },
  {
    id: 'pause',
    prompt: 'When should the plan suggest pausing? / 什么情况下建议暂停？',
    selectionMode: 'multiple',
    allowCustom: true,
    choices: [
      { id: 'safety', label: 'Safety boundary / 安全边界' },
      { id: 'capacity', label: 'Capacity overload / 容量超载' },
      { id: 'blocked', label: 'Critical blocker / 关键阻碍' },
    ],
  },
]

const allQuestions = [...currentSituationQuestions, ...outcomeQuestions, ...controlQuestions]
const questionsById = new Map(allQuestions.map((question) => [question.id, question]))
const currentSituationIds = new Set(currentSituationQuestions.map((question) => question.id))

type AnswerRow = { id: string; prompt: string; value: string }

function questionBatch(message?: GoalConversationMessage): QuestionBatchItem[] | null {
  return message?.structured.kind === 'question_batch' &&
    Array.isArray(message.structured.questions)
    ? (message.structured.questions as QuestionBatchItem[])
    : null
}

function answerRows(message: GoalConversationMessage): AnswerRow[] {
  if (message.structured.kind !== 'question_answers') return []
  const raw = message.structured.answers
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []

  return Object.entries(raw).flatMap(([id, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const answer = value as { selected?: unknown; custom?: unknown }
    const question = questionsById.get(id)
    const selected = Array.isArray(answer.selected)
      ? answer.selected.filter((item): item is string => typeof item === 'string')
      : []
    const labels = selected.map(
      (choiceId) => question?.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId,
    )
    const custom = typeof answer.custom === 'string' ? answer.custom.trim() : ''
    const values = [...labels, ...(custom ? [custom] : [])]
    if (!values.length) return []
    return [{ id, prompt: question?.prompt ?? id, value: values.join(' · ') }]
  })
}

export default function GoalConversationPanel({ onClose }: { onClose: () => void }) {
  const goal = useGoalConversation()
  const [title, setTitle] = useState('')
  const pendingQuestions = questionBatch(goal.messages.at(-1))
  const situationRows = goal.messages
    .flatMap(answerRows)
    .filter((row) => currentSituationIds.has(row.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Long-term goal conversation / 长期目标对话
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Current situation → outcome and capacity → measurement and control → confirmed plan.
          </p>
        </div>
        <Button onClick={onClose} variant="ghost">
          Back to AI / 返回
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {goal.threads.length ? (
          <div className="flex flex-wrap gap-2">
            {goal.threads.map((item) => (
              <button
                className={`rounded border px-2 py-1 text-xs ${goal.thread?.thread_id === item.thread_id ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'}`}
                key={item.thread_id}
                onClick={() => void goal.selectThread(item)}
                type="button"
              >
                {item.title} · {item.status}
              </button>
            ))}
          </div>
        ) : null}

        {!goal.thread ? (
          <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
            <label
              className="block text-sm font-medium text-slate-800"
              htmlFor="long-term-goal-title"
            >
              What long-term goal do you want to work on? / 你想推进什么长期目标？
            </label>
            <input
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              id="long-term-goal-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="For example: improve fitness over 12 weeks"
              value={title}
            />
            <p className="text-xs text-slate-600">
              The next step anchors the plan to your real starting point before asking for targets.
            </p>
            <Button
              disabled={goal.busy || !title.trim()}
              onClick={() => void goal.start(title, currentSituationQuestions)}
              variant="primary"
            >
              Start with current situation / 从当前情况开始
            </Button>
          </section>
        ) : null}

        {situationRows.length ? (
          <section
            className="rounded-md border border-amber-200 bg-amber-50 p-3"
            aria-label="Current situation anchor"
          >
            <h3 className="text-sm font-semibold text-amber-950">
              Current situation anchor / 当前情况锚点
            </h3>
            <p className="mt-1 text-xs text-amber-800">
              The model must preserve these facts or ask before changing them.
            </p>
            <dl className="mt-3 grid gap-2 md:grid-cols-3">
              {situationRows.map((row) => (
                <div className="rounded bg-white p-2" key={row.id}>
                  <dt className="text-[11px] text-amber-700">{row.prompt}</dt>
                  <dd className="mt-1 text-xs font-medium text-slate-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {goal.messages
          .filter((message) => message.content)
          .map((message) => {
            const rows = answerRows(message)
            return (
              <article
                className={`max-w-3xl rounded-md p-3 text-sm ${message.role === 'user' ? 'ml-auto bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}
                key={message.message_id}
              >
                {rows.length ? (
                  <ul className="space-y-1">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <span className="font-medium">{row.prompt}</span>
                        <span className="block text-xs opacity-80">{row.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </article>
            )
          })}

        {pendingQuestions ? (
          <QuestionBatch
            disabled={goal.busy}
            onSubmit={(answers) =>
              goal.submitAnswers(answers, [outcomeQuestions, controlQuestions])
            }
            questions={pendingQuestions}
          />
        ) : null}
        {goal.planReady && !goal.plan ? (
          <section className="rounded-md border border-sky-200 bg-sky-50 p-3">
            <p className="text-sm text-sky-900">
              Planning uses the {goal.selectedMode} mode and one planning-model call. Confirmed
              current-situation answers remain included even when recent chat is compressed.
            </p>
            <Button
              className="mt-3"
              disabled={goal.busy}
              onClick={() => void goal.generatePlan()}
              variant="primary"
            >
              Generate anchored plan / 生成锚定当前情况的计划
            </Button>
          </section>
        ) : null}
        {goal.plan ? (
          <section className="space-y-4 rounded-md border border-emerald-300 bg-white p-4">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Plan preview · confirmation required
              </p>
              <input
                className="mt-2 h-10 w-full rounded border border-slate-300 px-3 text-lg font-semibold"
                onChange={(event) =>
                  goal.setPlan((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                value={goal.plan.title}
              />
              <textarea
                className="mt-2 min-h-20 w-full rounded border border-slate-300 p-3 text-sm"
                onChange={(event) =>
                  goal.setPlan((current) =>
                    current ? { ...current, summary: event.target.value } : current,
                  )
                }
                value={goal.plan.summary}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <PlanList
                title="Metrics / 指标"
                values={goal.plan.metrics.map((item) => item.name)}
              />
              <PlanList
                title="Milestones"
                values={goal.plan.milestones.map((item) => item.title)}
              />
              <PlanList title="Actions" values={goal.plan.actions.map((item) => item.title)} />
            </div>
            <div className="flex gap-2">
              <Button disabled={goal.busy} onClick={() => void goal.activate()} variant="primary">
                Confirm and activate / 确认并激活
              </Button>
              <Button disabled={goal.busy} onClick={() => void goal.generatePlan()}>
                Regenerate / 重新生成
              </Button>
            </div>
          </section>
        ) : null}
        {goal.busy ? <p className="text-sm text-slate-500">Working…</p> : null}
        {goal.error ? (
          <p className="rounded bg-red-50 p-3 text-sm text-red-800">{goal.error}</p>
        ) : null}
      </div>
    </div>
  )
}

function PlanList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ol className="mt-2 space-y-1 text-xs text-slate-600">
        {values.map((value, index) => (
          <li key={`${value}-${index}`}>
            {index + 1}. {value}
          </li>
        ))}
      </ol>
    </div>
  )
}
