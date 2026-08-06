import { useEffect, useState } from 'react'

import type { RecurrenceRule, Weekday } from '../../domain/types'
import { useI18n } from '../../hooks/useI18n'

type RecurrenceSelectorProps = {
  value?: RecurrenceRule
  startDate: string
  onChange: (rule: RecurrenceRule | undefined) => void
}

const weekdays: Array<{
  value: Weekday
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]
}> = [
  { value: 'mon', labelKey: 'repeat.weekdayMon' },
  { value: 'tue', labelKey: 'repeat.weekdayTue' },
  { value: 'wed', labelKey: 'repeat.weekdayWed' },
  { value: 'thu', labelKey: 'repeat.weekdayThu' },
  { value: 'fri', labelKey: 'repeat.weekdayFri' },
  { value: 'sat', labelKey: 'repeat.weekdaySat' },
  { value: 'sun', labelKey: 'repeat.weekdaySun' },
]

function defaultRule(startDate: string): RecurrenceRule {
  const start = new Date(`${startDate}T00:00:00`)
  const weekdayIndex = start.getDay() === 0 ? 6 : start.getDay() - 1

  return {
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [weekdays[weekdayIndex].value],
    dayOfMonth: Number(startDate.slice(8, 10)),
    endCondition: { type: 'never' },
  }
}

function toUntilDate(rule: RecurrenceRule | undefined): string {
  if (!rule || rule.endCondition.type !== 'date') return ''
  return rule.endCondition.until.slice(0, 10)
}

function withEndDate(date: string): RecurrenceRule['endCondition'] {
  return {
    type: 'date',
    until: new Date(`${date}T23:59:59.999`).toISOString(),
  }
}

export default function RecurrenceSelector({
  value,
  startDate,
  onChange,
}: RecurrenceSelectorProps) {
  const { t } = useI18n()
  const rule = value ?? defaultRule(startDate)
  const repeats = Boolean(value)
  const currentDayOfMonth = rule.dayOfMonth ?? Number(startDate.slice(8, 10))
  const occurrenceCount =
    rule.endCondition.type === 'count' ? rule.endCondition.occurrences : undefined
  const [intervalInput, setIntervalInput] = useState(String(rule.interval))
  const [dayOfMonthInput, setDayOfMonthInput] = useState(String(currentDayOfMonth))
  const [occurrenceInput, setOccurrenceInput] = useState(
    occurrenceCount ? String(occurrenceCount) : '',
  )

  useEffect(() => {
    setIntervalInput(String(rule.interval))
  }, [rule.interval])

  useEffect(() => {
    setDayOfMonthInput(String(currentDayOfMonth))
  }, [currentDayOfMonth])

  useEffect(() => {
    setOccurrenceInput(occurrenceCount ? String(occurrenceCount) : '')
  }, [occurrenceCount])

  function updateRule(next: Partial<RecurrenceRule>) {
    onChange({ ...rule, ...next })
  }

  function toPositiveInteger(value: string): number {
    return Math.max(1, Math.trunc(Number(value) || 1))
  }

  function toggleWeekday(day: Weekday) {
    const days = new Set(rule.daysOfWeek ?? [])

    if (days.has(day)) {
      days.delete(day)
    } else {
      days.add(day)
    }

    updateRule({ daysOfWeek: Array.from(days).length ? Array.from(days) : [day] })
  }

  return (
    <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{t('repeat.repeat')}</legend>

      <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-frequency">
        {t('repeat.frequency')}
        <select
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          id="repeat-frequency"
          onChange={(event) => {
            if (event.target.value === 'none') {
              onChange(undefined)
              return
            }

            updateRule({ frequency: event.target.value as RecurrenceRule['frequency'] })
          }}
          value={repeats ? rule.frequency : 'none'}
        >
          <option value="none">{t('repeat.doesNotRepeat')}</option>
          <option value="daily">{t('repeat.daily')}</option>
          <option value="weekly">{t('repeat.weekly')}</option>
          <option value="monthly">{t('repeat.monthly')}</option>
          <option value="custom">{t('repeat.customWeekly')}</option>
        </select>
      </label>

      {repeats ? (
        <>
          <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-interval">
            {t('repeat.every')}
          </label>
          <div className="flex items-center gap-2">
            <input
              className="h-10 w-24 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="repeat-interval"
              min={1}
              onBlur={() => {
                if (!intervalInput) {
                  setIntervalInput('1')
                  updateRule({ interval: 1 })
                }
              }}
              onChange={(event) => {
                setIntervalInput(event.target.value)
                if (event.target.value)
                  updateRule({ interval: toPositiveInteger(event.target.value) })
              }}
              type="number"
              value={intervalInput}
            />
            <span className="text-sm text-slate-600">
              {rule.frequency === 'daily'
                ? t('repeat.days')
                : rule.frequency === 'monthly'
                  ? t('repeat.months')
                  : t('repeat.weeks')}
            </span>
          </div>

          {rule.frequency === 'weekly' || rule.frequency === 'custom' ? (
            <div className="flex flex-wrap gap-2">
              {weekdays.map((day) => (
                <label
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
                  key={day.value}
                >
                  <input
                    checked={rule.daysOfWeek?.includes(day.value) ?? false}
                    onChange={() => toggleWeekday(day.value)}
                    type="checkbox"
                  />
                  {t(day.labelKey)}
                </label>
              ))}
            </div>
          ) : null}

          {rule.frequency === 'monthly' ? (
            <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-day">
              {t('repeat.dayOfMonth')}
              <input
                className="mt-1 h-10 w-24 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="repeat-day"
                max={31}
                min={1}
                onBlur={() => {
                  if (!dayOfMonthInput) {
                    setDayOfMonthInput(String(currentDayOfMonth))
                    updateRule({ dayOfMonth: currentDayOfMonth })
                  }
                }}
                onChange={(event) => {
                  setDayOfMonthInput(event.target.value)
                  if (event.target.value) {
                    updateRule({ dayOfMonth: Math.min(31, toPositiveInteger(event.target.value)) })
                  }
                }}
                type="number"
                value={dayOfMonthInput}
              />
            </label>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-end">
              {t('repeat.ends')}
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="repeat-end"
                onChange={(event) => {
                  if (event.target.value === 'never')
                    updateRule({ endCondition: { type: 'never' } })
                  if (event.target.value === 'date')
                    updateRule({ endCondition: withEndDate(startDate) })
                  if (event.target.value === 'count') {
                    updateRule({ endCondition: { type: 'count', occurrences: 5 } })
                  }
                }}
                value={rule.endCondition.type}
              >
                <option value="never">{t('repeat.never')}</option>
                <option value="date">{t('repeat.onDate')}</option>
                <option value="count">{t('repeat.afterCount')}</option>
              </select>
            </label>

            {rule.endCondition.type === 'date' ? (
              <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-until">
                {t('repeat.until')}
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="repeat-until"
                  onChange={(event) =>
                    updateRule({ endCondition: withEndDate(event.target.value) })
                  }
                  type="date"
                  value={toUntilDate(rule)}
                />
              </label>
            ) : null}

            {rule.endCondition.type === 'count' ? (
              <label className="block text-sm font-medium text-slate-700" htmlFor="repeat-count">
                {t('repeat.occurrences')}
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="repeat-count"
                  min={1}
                  onBlur={() => {
                    if (!occurrenceInput) {
                      setOccurrenceInput('1')
                      updateRule({ endCondition: { type: 'count', occurrences: 1 } })
                    }
                  }}
                  onChange={(event) => {
                    setOccurrenceInput(event.target.value)
                    if (event.target.value) {
                      updateRule({
                        endCondition: {
                          type: 'count',
                          occurrences: toPositiveInteger(event.target.value),
                        },
                      })
                    }
                  }}
                  type="number"
                  value={occurrenceInput}
                />
              </label>
            ) : null}
          </div>
        </>
      ) : null}
    </fieldset>
  )
}
