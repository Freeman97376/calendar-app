import type { CalendarView } from '../../domain/types'
import type { KeyboardEvent } from 'react'

import { useI18n } from '../../hooks/useI18n'

type ViewSwitcherProps = {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
}

const optionValues: CalendarView[] = ['month', 'week', 'day']

export default function ViewSwitcher({ view, onViewChange }: ViewSwitcherProps) {
  const { t } = useI18n()
  const options: Array<{ value: CalendarView; label: string }> = [
    { value: 'month', label: t('calendar.month') },
    { value: 'week', label: t('calendar.week') },
    { value: 'day', label: t('calendar.day') },
  ]

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = optionValues.findIndex((option) => option === view)

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onViewChange(optionValues[(currentIndex + 1) % optionValues.length])
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onViewChange(optionValues[(currentIndex + optionValues.length - 1) % optionValues.length])
    }
  }

  return (
    <div
      aria-label={t('calendar.view')}
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
