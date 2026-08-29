import { describe, expect, it } from 'vitest'

import { EventSchema } from '../../../../src/domain/schemas/event.schema'

const validEvent = {
  id: '0d0b8d75-4f4f-4e21-8f9f-bcf1f0b5c7b2',
  title: 'Planning session',
  description: 'Sketch the first calendar workflow.',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
  color: '#047857',
  createdAt: '2026-05-25T15:00:00.000Z',
  updatedAt: '2026-05-25T15:00:00.000Z',
}

describe('EventSchema', () => {
  it('valid event passes validation', () => {
    const parsed = EventSchema.parse(validEvent)

    expect(parsed.title).toBe('Planning session')
  })

  it('missing required title throws ZodError', () => {
    expect(() => EventSchema.parse({ ...validEvent, title: '' })).toThrow()
  })

  it('title exceeding max length throws ZodError', () => {
    expect(() => EventSchema.parse({ ...validEvent, title: 'x'.repeat(201) })).toThrow()
  })

  it('invalid datetime format for startAt throws ZodError', () => {
    expect(() => EventSchema.parse({ ...validEvent, startAt: 'May 25, 2026' })).toThrow()
  })

  it('endAt before startAt is flagged', () => {
    expect(() =>
      EventSchema.parse({
        ...validEvent,
        startAt: '2026-05-25T18:00:00.000Z',
        endAt: '2026-05-25T17:00:00.000Z',
      }),
    ).toThrow()
  })

  it('allDay defaults to false when omitted', () => {
    expect(EventSchema.parse(validEvent).allDay).toBe(false)
  })

  it('syncStatus defaults to pending when omitted', () => {
    expect(EventSchema.parse(validEvent).syncStatus).toBe('pending')
  })

  it('eventTypeId defaults to general when omitted', () => {
    expect(EventSchema.parse(validEvent).eventTypeId).toBe('general')
  })

  it('optional fields can be absent', () => {
    const { color: _color, description: _description, ...minimal } = validEvent

    expect(EventSchema.parse(minimal).description).toBeUndefined()
  })
})
