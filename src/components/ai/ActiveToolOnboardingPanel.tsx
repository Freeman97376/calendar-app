import type { ActiveToolOnboardingSeed } from '../../domain/types/goalControl'
import { useActiveToolOnboarding } from '../../hooks/useActiveToolOnboarding'
import Button from '../ui/Button'
import GlobalSchedulePanel from '../tools/GlobalSchedulePanel'
import InitialPlanReview from './InitialPlanReview'
import QuestionBatch from './QuestionBatch'

export default function ActiveToolOnboardingPanel({
  onClose,
  seed,
}: {
  onClose: () => void
  seed: ActiveToolOnboardingSeed
}) {
  const onboarding = useActiveToolOnboarding(seed)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Recommended template / 推荐模板
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">
            {seed.template.label} · Initial plan / 初始计划
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Request → up to three missing details → editable review → approval → Active Tool.
            Calendar changes remain a separate approval. / 请求 → 最多三个缺失问题 → 可编辑审阅 →
            批准 → Active Tool；日历变更仍需单独批准。
          </p>
        </div>
        <Button onClick={onClose} variant="ghost">
          Back to AI / 返回
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Original request / 原始请求</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{seed.originalRequest}</p>
          <p className="mt-2 text-xs text-slate-500">
            Draft saved locally in your account workspace · {seed.source}
          </p>
        </section>

        {onboarding.pendingQuestions ? (
          <QuestionBatch
            disabled={onboarding.busy}
            onSubmit={onboarding.submitAnswers}
            questions={onboarding.pendingQuestions}
          />
        ) : null}

        {onboarding.planReady && !onboarding.plan ? (
          <section className="rounded-md border border-sky-200 bg-sky-50 p-3">
            <p className="text-sm text-sky-950">
              The brief is ready. One {onboarding.selectedMode} planning call will create a JSON
              draft; it will not activate anything. / 信息已齐，将使用一次
              {onboarding.selectedMode} 规划调用生成 JSON 初稿，不会自动激活。
            </p>
            <Button
              className="mt-3"
              disabled={onboarding.busy}
              onClick={() => void onboarding.generatePlan()}
              variant="primary"
            >
              Generate initial plan / 生成初始计划
            </Button>
          </section>
        ) : null}

        {onboarding.plan && !onboarding.activationMessage ? (
          <InitialPlanReview
            blockingIssues={onboarding.blockingIssues}
            busy={onboarding.busy}
            onActivate={onboarding.activate}
            onChange={onboarding.setPlan}
            onRevise={onboarding.revisePlan}
            plan={onboarding.plan}
            requiresPlanningDate={onboarding.requiresPlanningDate}
          />
        ) : null}

        {onboarding.activationMessage ? (
          <>
            <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">激活成功</p>
              <p className="mt-1">{onboarding.activationMessage}</p>
              <Button className="mt-3" onClick={onClose} variant="primary">
                返回当前对话
              </Button>
            </section>
            <GlobalSchedulePanel />
          </>
        ) : null}

        {onboarding.busy ? (
          <p aria-live="polite" className="text-sm text-slate-500">
            Working… / 正在处理…
          </p>
        ) : null}
        {onboarding.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {onboarding.error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
