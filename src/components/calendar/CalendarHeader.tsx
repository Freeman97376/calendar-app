import type { ReactNode } from 'react'

import { useI18n } from '../../hooks/useI18n'

type CalendarHeaderProps = {
  title: string
  subtitle: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  children?: ReactNode
}

export default function CalendarHeader({
  title,
  subtitle,
  onPrevious,
  onNext,
  onToday,
  children,
}: CalendarHeaderProps) {
  const { t } = useI18n()

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-emerald-700">{subtitle}</p>
        <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">{title}</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {children}

        <div className="flex items-center gap-2">
          <button
            aria-label={t('calendar.previousRange')}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={onPrevious}
            type="button"
          >
            {t('calendar.prev')}
          </button>
          <button
            className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
            onClick={onToday}
            type="button"
          >
            {t('calendar.today')}
          </button>
          <button
            aria-label={t('calendar.nextRange')}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={onNext}
            type="button"
          >
            {t('calendar.next')}
          </button>
        </div>
      </div>
    </header>
  )
}
