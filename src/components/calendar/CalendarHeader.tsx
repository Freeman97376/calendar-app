import type { ReactNode } from 'react'

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
            aria-label="Previous date range"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={onPrevious}
            type="button"
          >
            Prev
          </button>
          <button
            className="h-9 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
            onClick={onToday}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Next date range"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={onNext}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </header>
  )
}
