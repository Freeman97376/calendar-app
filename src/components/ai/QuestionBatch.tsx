import { useEffect, useState } from 'react'

import type { QuestionBatchItem } from '../../domain/types/goalControl'
import Button from '../ui/Button'

type AnswerDraft = { selected: string[]; custom: string }

export default function QuestionBatch({
  questions,
  onSubmit,
  disabled = false,
}: {
  questions: QuestionBatchItem[]
  onSubmit: (answers: Record<string, { selected: string[]; custom?: string }>) => Promise<void> | void
  disabled?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({})

  useEffect(() => setAnswers({}), [questions])

  function toggle(question: QuestionBatchItem, choiceId: string) {
    setAnswers((current) => {
      const answer = current[question.id] ?? { selected: [], custom: '' }
      const selected = question.selectionMode === 'single'
        ? [choiceId]
        : answer.selected.includes(choiceId)
          ? answer.selected.filter((id) => id !== choiceId)
          : [...answer.selected, choiceId]
      return { ...current, [question.id]: { ...answer, selected } }
    })
  }

  const complete = questions.every((question) => {
    const answer = answers[question.id]
    return Boolean(answer?.selected.length || answer?.custom.trim())
  })

  return (
    <form className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-3" onSubmit={(event) => {
      event.preventDefault()
      if (!complete) return
      void onSubmit(Object.fromEntries(questions.map((question) => [question.id, {
        selected: answers[question.id]?.selected ?? [],
        ...(answers[question.id]?.custom.trim() ? { custom: answers[question.id].custom.trim() } : {}),
      }])))
    }}>
      {questions.map((question) => (
        <fieldset className="space-y-2" key={question.id}>
          <legend className="text-sm font-semibold text-emerald-950">{question.prompt}</legend>
          <div className="flex flex-wrap gap-2">
            {question.choices.map((choice) => {
              const selected = answers[question.id]?.selected.includes(choice.id) ?? false
              return <button aria-pressed={selected} className={`rounded-md border px-3 py-2 text-left text-xs ${selected ? 'border-emerald-700 bg-white text-emerald-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} disabled={disabled} key={choice.id} onClick={() => toggle(question, choice.id)} type="button"><span className="font-medium">{choice.label}</span>{choice.description ? <span className="mt-1 block text-emerald-700">{choice.description}</span> : null}</button>
            })}
          </div>
          {question.allowCustom ? <input aria-label={`${question.prompt} custom answer`} className="h-9 w-full rounded-md border border-emerald-200 bg-white px-3 text-sm" disabled={disabled} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: { selected: current[question.id]?.selected ?? [], custom: event.target.value } }))} placeholder="Add your own answer / 添加自己的回答" value={answers[question.id]?.custom ?? ''} /> : null}
        </fieldset>
      ))}
      <Button disabled={!complete || disabled} type="submit" variant="primary">Continue / 继续</Button>
    </form>
  )
}
