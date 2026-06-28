import type { CalendarView } from '../../domain/types'
import type { KeyboardEvent } from 'react'

type ViewSwitcherProps = {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
}

const options: Array<{ value: CalendarView; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
]

export default function ViewSwitcher({ view, onViewChange }: ViewSwitcherProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = options.findIndex((option) => option.value === view)

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onViewChange(options[(currentIndex + 1) % options.length].value)
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onViewChange(options[(currentIndex + options.length - 1) % options.length].value)
    }
  }

  return (
    <div
      aria-label="Calendar view"
      className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm"
      onKeyDown={handleKeyDown}
      role="tablist"
    >
      {options.map((option) => {
        const isSelected = option.value === view

        return (
          <button
            aria-selected={isSelected}
            className={[
              'h-9 rounded px-3 text-sm font-medium transition',
              isSelected
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
            ].join(' ')}
            key={option.value}
            onClick={() => onViewChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
