import { useEffect, useState } from 'react'

import type { QuestionBatchItem } from '../../domain/types/goalControl'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

type AnswerDraft = { selected: string[]; custom: string; skipped: boolean }
type SubmittedAnswer = {
  selected: string[]
  custom?: string
  skipped?: boolean
  accuracyImpact?: string
  label?: string
}

export default function QuestionBatch({
  questions,
  onSubmit,
  onSkip,
  disabled = false,
}: {
  questions: QuestionBatchItem[]
  onSubmit: (answers: Record<string, SubmittedAnswer>) => Promise<void> | void
  onSkip?: () => Promise<void> | void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setAnswers({}), [questions])
  const controlsDisabled = disabled || submitting

  function toggle(question: QuestionBatchItem, choiceId: string) {
    setAnswers((current) => {
      const answer = current[question.id] ?? { selected: [], custom: '', skipped: false }
      const selected =
        question.selectionMode === 'single'
          ? [choiceId]
          : answer.selected.includes(choiceId)
            ? answer.selected.filter((id) => id !== choiceId)
            : [...answer.selected, choiceId]
      return { ...current, [question.id]: { ...answer, selected, skipped: false } }
    })
  }

  function skipOptional(question: QuestionBatchItem) {
    if (question.required !== false) return
    setAnswers((current) => ({
      ...current,
      [question.id]: { selected: [], custom: '', skipped: true },
    }))
  }

  const complete = questions.every((question) => {
    const answer = answers[question.id]
    const answered = Boolean(answer?.selected.length || answer?.custom.trim())
    return question.required === false ? answered || Boolean(answer?.skipped) : answered
  })

  async function submitAnswers() {
    if (!complete || controlsDisabled) return
    setSubmitting(true)
    try {
      await onSubmit(
        Object.fromEntries(
          questions.map((question) => {
            const answer = answers[question.id]
            return [
              question.id,
              {
                selected: answer?.selected ?? [],
                ...(answer?.custom.trim() ? { custom: answer.custom.trim() } : {}),
                ...(answer?.skipped
                  ? {
                      skipped: true,
                      accuracyImpact: question.accuracyImpact ?? '',
                      label: question.prompt,
                    }
                  : {}),
              },
            ]
          }),
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function skipCheckIn() {
    if (!onSkip || controlsDisabled || !window.confirm(t('checkIn.skipConfirm'))) return
    setSubmitting(true)
    try {
      await onSkip()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submitAnswers()
      }}
    >
      {questions.map((question) => {
        const skipped = answers[question.id]?.skipped ?? false
        return (
          <fieldset className="space-y-2" key={question.id}>
            <legend className="text-sm font-semibold text-emerald-950">
              {question.prompt}
              {question.required === false ? (
                <span className="ml-2 text-xs font-normal text-emerald-700">
                  {t('ai.optionalQuestion')}
                </span>
              ) : null}
            </legend>
            {question.required === false && question.accuracyImpact ? (
              <p className="text-xs text-amber-800">{question.accuracyImpact}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {question.choices.map((choice) => {
                const selected = answers[question.id]?.selected.includes(choice.id) ?? false
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-md border px-3 py-2 text-left text-xs ${selected ? 'border-emerald-700 bg-white text-emerald-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
                    disabled={controlsDisabled}
                    key={choice.id}
                    onClick={() => toggle(question, choice.id)}
                    type="button"
                  >
                    <span className="font-medium">{choice.label}</span>
                    {choice.description ? (
                      <span className="mt-1 block text-emerald-700">{choice.description}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {question.allowCustom ? (
              <input
                aria-label={`${question.prompt} custom answer`}
                className="h-9 w-full rounded-md border border-emerald-200 bg-white px-3 text-sm"
                disabled={controlsDisabled}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: {
                      selected: current[question.id]?.selected ?? [],
                      custom: event.target.value,
                      skipped: false,
                    },
                  }))
                }
                placeholder={t('checkIn.customPlaceholder')}
                value={answers[question.id]?.custom ?? ''}
              />
            ) : null}
            {question.required === false ? (
              <Button
                disabled={controlsDisabled}
                onClick={() => skipOptional(question)}
                type="button"
                variant={skipped ? 'primary' : 'secondary'}
              >
                {skipped ? t('ai.optionalSkipped') : t('ai.skipOptional')}
              </Button>
            ) : null}
          </fieldset>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!complete || controlsDisabled} type="submit" variant="primary">
          {submitting ? t('checkIn.submitting') : t('checkIn.continue')}
        </Button>
        {onSkip ? (
          <Button
            disabled={controlsDisabled}
            onClick={() => void skipCheckIn()}
            type="button"
            variant="secondary"
          >
            {t('checkIn.skip')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
