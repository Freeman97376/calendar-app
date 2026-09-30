import type { SchedulingWindow } from '../../domain/types'
import { useSchedulingSettings } from '../../hooks/useSchedulingSettings'
import Button from '../ui/Button'

const days: Array<{ code: SchedulingWindow['day']; label: string }> = [
  { code: 'mon', label: '周一' },
  { code: 'tue', label: '周二' },
  { code: 'wed', label: '周三' },
  { code: 'thu', label: '周四' },
  { code: 'fri', label: '周五' },
  { code: 'sat', label: '周六' },
  { code: 'sun', label: '周日' },
]

export default function SchedulingSettings() {
  const scheduling = useSchedulingSettings()

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">全局工具排程工作时段</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          只有这些时段会用于已激活工具；既有日历事件始终作为固定占用。可为同一天添加多个区间。
        </p>
      </div>
      <div className="space-y-2">
        {days.map((day) => {
          const indexes = scheduling.windows
            .map((window, index) => ({ index, window }))
            .filter((item) => item.window.day === day.code)
          return (
            <div className="rounded-md border border-slate-200 p-2" key={day.code}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{day.label}</span>
                <Button onClick={() => scheduling.addWindow(day.code)} variant="ghost">
                  添加时段
                </Button>
              </div>
              {indexes.length ? (
                <div className="mt-2 space-y-2">
                  {indexes.map(({ index, window }) => (
                    <div className="flex items-center gap-2" key={`${day.code}-${index}`}>
                      <input
                        aria-label={`${day.label}开始时间`}
                        className="h-9 rounded border border-slate-300 px-2 text-sm"
                        onChange={(event) =>
                          scheduling.updateWindow(index, 'start', event.target.value)
                        }
                        type="time"
                        value={window.start}
                      />
                      <span className="text-slate-400">—</span>
                      <input
                        aria-label={`${day.label}结束时间`}
                        className="h-9 rounded border border-slate-300 px-2 text-sm"
                        onChange={(event) =>
                          scheduling.updateWindow(index, 'end', event.target.value)
                        }
                        type="time"
                        value={window.end}
                      />
                      <Button
                        aria-label={`删除${day.label}时段`}
                        onClick={() => scheduling.removeWindow(index)}
                        variant="ghost"
                      >
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-400">不可排程</p>
              )}
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-700">
          最小时间块（分钟）
          <input
            className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
            min={5}
            onChange={(event) => scheduling.setMinBlockMinutes(Number(event.target.value))}
            type="number"
            value={scheduling.minBlockMinutes}
          />
        </label>
        <label className="text-sm text-slate-700">
          最大时间块（分钟）
          <input
            className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
            min={15}
            onChange={(event) => scheduling.setMaxBlockMinutes(Number(event.target.value))}
            type="number"
            value={scheduling.maxBlockMinutes}
          />
        </label>
      </div>
      {scheduling.validationMessage ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {scheduling.validationMessage}
        </p>
      ) : null}
      <Button
        disabled={scheduling.saving || !scheduling.canSave}
        onClick={() => void scheduling.save()}
        variant="primary"
      >
        {scheduling.saving ? '保存中…' : '保存并重新计算'}
      </Button>
      {scheduling.status ? <p className="text-sm text-slate-600">{scheduling.status}</p> : null}
    </section>
  )
}
