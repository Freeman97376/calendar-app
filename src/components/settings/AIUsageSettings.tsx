import type { FormEvent } from 'react'

import type { AIUsageMode } from '../../domain/types/goalControl'
import { useAIUsageSettings } from '../../hooks/useAIUsageSettings'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

const modeOrder: AIUsageMode[] = ['economy', 'balanced', 'quality']
const modeEstimate: Record<AIUsageMode, { monthly: string; context: string }> = {
  economy: { monthly: '150k–500k tokens / 5 active goals', context: '2 messages · 1 Check-in' },
  balanced: { monthly: '500k–1.2m tokens / 5 active goals', context: '6 messages · 2 Check-ins' },
  quality: { monthly: '1m–2m tokens / 5 active goals', context: '12 messages · 4 Check-ins' },
}

const copy = {
  en: {
    title: 'AI usage mode',
    description:
      'Controls how often AI is called and how much recent context is included. Existing results are never rerun.',
    labels: { economy: 'Economy', balanced: 'Balanced', quality: 'Quality first' },
    details: {
      economy:
        'Rules handle ordinary check-ins. AI is reserved for ambiguity, reviews, and confirmed planning.',
      balanced:
        'At most one routine call per answered check-in, with planning calls for confirmed plan work.',
      quality:
        'Richer recent context and planning limits, still bounded by the monthly hard limit.',
    },
    selected: 'Global default',
    maximum: 'Administrator maximum',
    effective: 'Currently effective',
    usage: 'This month',
    routine: 'Routine',
    planning: 'Planning',
    budget: 'Monthly budget',
    soft: 'Soft limit',
    hard: 'Hard limit',
    save: 'Save AI usage',
    degraded:
      'Hard limit reached: AI calls are paused; rule-based and manual features remain available.',
  },
  zh: {
    title: 'AI 用量模式',
    description: '控制 AI 调用频率和近期上下文范围；切换后从下一次调用生效，不会重跑已有结果。',
    labels: { economy: '节省', balanced: '平衡', quality: '质量优先' },
    details: {
      economy: '普通 Check-in 由规则处理；仅在歧义、复盘和已确认规划时调用 AI。',
      balanced: '每个已回答 Check-in 最多一次常规调用；已确认的规划使用规划模型。',
      quality: '使用更丰富但仍受限的近期上下文，并始终受月度 Hard limit 限制。',
    },
    selected: '全局默认',
    maximum: '管理员最高模式',
    effective: '当前生效',
    usage: '本月用量',
    routine: 'Routine',
    planning: 'Planning',
    budget: '月度额度',
    soft: 'Soft limit',
    hard: 'Hard limit',
    save: '保存 AI 用量设置',
    degraded: '已达到 Hard limit：AI 调用暂停，规则功能和手动功能仍可使用。',
  },
}

function tokens(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: 'compact' }).format(
    value,
  )
}

export default function AIUsageSettings() {
  const { locale } = useI18n()
  const text = locale.startsWith('zh') ? copy.zh : copy.en
  const settings = useAIUsageSettings()
  const {
    capabilities,
    hardLimit,
    mode,
    setHardLimit,
    setMode,
    setSoftLimit,
    softLimit,
    status,
    usage,
  } = settings

  async function submit(event: FormEvent) {
    event.preventDefault()
    await settings.save(locale.startsWith('zh') ? '已保存。' : 'Saved.')
  }

  return (
    <section
      className="space-y-4 border-t border-slate-200 pt-4"
      aria-labelledby="ai-usage-settings-title"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-950" id="ai-usage-settings-title">
          {text.title}
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{text.description}</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-2 md:grid-cols-3">
          {modeOrder.map((value) => {
            const allowed = capabilities?.aiUsageModes?.includes(value) ?? value !== 'quality'
            return (
              <label
                className={`rounded-md border p-3 ${mode === value ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'} ${allowed ? '' : 'opacity-50'}`}
                key={value}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <input
                    checked={mode === value}
                    disabled={!allowed}
                    name="ai-usage-mode"
                    onChange={() => setMode(value)}
                    type="radio"
                    value={value}
                  />
                  {text.labels[value]}
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-600">
                  {text.details[value]}
                </span>
                <span className="mt-2 block text-[11px] font-medium text-slate-500">
                  {modeEstimate[value].context}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {modeEstimate[value].monthly}
                </span>
              </label>
            )
          })}
        </div>
        <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-3">
          <p>
            <span className="block text-xs text-slate-500">{text.selected}</span>
            {text.labels[mode]}
          </p>
          <p>
            <span className="block text-xs text-slate-500">{text.maximum}</span>
            {text.labels[capabilities?.aiMaximumUsageMode || 'balanced']}
          </p>
          <p>
            <span className="block text-xs text-slate-500">{text.effective}</span>
            {text.labels[usage?.effective_mode || mode]}
          </p>
        </div>
        {usage ? (
          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <strong>{text.usage}</strong>
              <span>
                {tokens(usage.total_tokens)} / {tokens(usage.hard_limit)} ({usage.percent_used}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full ${usage.degraded ? 'bg-red-600' : usage.warning ? 'bg-amber-500' : 'bg-emerald-600'}`}
                style={{ width: `${Math.min(100, usage.percent_used)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>
                {text.routine}: {tokens(usage.routine_input_tokens)} in ·{' '}
                {tokens(usage.routine_output_tokens)} out
              </p>
              <p>
                {text.planning}: {tokens(usage.planning_input_tokens)} in ·{' '}
                {tokens(usage.planning_output_tokens)} out
              </p>
            </div>
            {usage.reset_at ? (
              <p className="text-[11px] text-slate-500">
                UTC reset: {new Date(usage.reset_at).toLocaleString()}
              </p>
            ) : null}
            {usage.degraded ? (
              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">{text.degraded}</p>
            ) : null}
          </div>
        ) : null}
        {capabilities?.aiBudgetEditable ? (
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium text-slate-800">{text.budget}</legend>
            <label className="text-xs text-slate-600">
              {text.soft}
              <input
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
                min={1}
                onChange={(event) => setSoftLimit(Number(event.target.value))}
                type="number"
                value={softLimit}
              />
            </label>
            <label className="text-xs text-slate-600">
              {text.hard}
              <input
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
                min={1}
                onChange={(event) => setHardLimit(Number(event.target.value))}
                type="number"
                value={hardLimit}
              />
            </label>
          </fieldset>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary">
            {text.save}
          </Button>
          {status ? <p className="text-xs text-slate-600">{status}</p> : null}
        </div>
      </form>
    </section>
  )
}
