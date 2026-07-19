import { useCheckInInbox } from '../../hooks/useCheckInInbox'
import QuestionBatch from '../ai/QuestionBatch'

export default function CheckInInbox() {
  const inbox = useCheckInInbox()
  if (!inbox.items.length && !inbox.error) return null

  const current = inbox.items[0]
  return <section className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-emerald-950">Check-in inbox / Check-in 收件箱</h3><p className="mt-1 text-xs text-emerald-800">{inbox.items.length} goal{inbox.items.length === 1 ? '' : 's'} waiting. Questions are rule-generated and do not call AI.</p></div>{current ? <button className="text-xs font-medium text-emerald-800 underline" onClick={() => inbox.openEnabledTools(current.project_id)} type="button">Open full goal</button> : null}</div>{current ? <><p className="text-sm font-medium text-emerald-950">{current.project_title || 'Long-term goal'}{current.includes_review ? ' · periodic review' : ''}</p><QuestionBatch questions={current.questions} onSubmit={(answers) => inbox.answer(current.check_in_id, answers)} /></> : null}{inbox.error ? <p className="text-xs text-red-700">{inbox.error}</p> : null}</section>
}
