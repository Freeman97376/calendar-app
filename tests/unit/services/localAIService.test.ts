import { describe, expect, it } from 'vitest'

import type { AICalendarContext } from '../../../src/domain/types'
import { LocalAIService } from '../../../src/services/ai/localAIService'

const context: AICalendarContext = {
  currentDate: '2026-06-18',
  currentDateTime: '2026-06-18T20:00:00.000Z',
  currentLocalDateTime: '2026-06-18T13:00:00-07:00',
  events: [],
  eventTypes: [],
  focusedDate: '2026-05-25',
  locale: 'en-US',
  localDateTimeLabel: 'Jun 18, 2026, 1:00:00 PM PDT',
  timezone: 'America/Los_Angeles',
  timezoneOffsetLabel: 'UTC-07:00',
  timezoneOffsetMinutes: -420,
  today: '2026-06-18',
  todos: [],
}

describe('LocalAIService', () => {
  it('uses currentDateTime for near-term relative event times', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add study session in 2 hours', context)

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-18T23:00:00.000Z',
      startAt: '2026-06-18T22:00:00.000Z',
      title: 'study session',
      type: 'create_event',
    })
  })

  it('does not treat relative start time as event duration', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add planning block in 30 minutes', context)

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-18T21:30:00.000Z',
      startAt: '2026-06-18T20:30:00.000Z',
      type: 'create_event',
    })
  })

  it('does not default unspecific dinner requests to 7pm after local 7pm', async () => {
    const service = new LocalAIService()

    const result = await service.planCalendarActions('add dinner', {
      ...context,
      currentDateTime: '2026-06-19T02:05:00.000Z',
      currentLocalDateTime: '2026-06-18T19:05:00-07:00',
    })

    expect(result.actions[0]).toMatchObject({
      endAt: '2026-06-19T03:30:00.000Z',
      startAt: '2026-06-19T02:30:00.000Z',
      title: 'dinner',
      type: 'create_event',
    })
  })
})
