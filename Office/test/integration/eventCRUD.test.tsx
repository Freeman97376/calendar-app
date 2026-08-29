import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../src/App'
import { useCalendarStore } from '../../../src/store/calendarStore'
import { useEventStore } from '../../../src/store/eventStore'
import { useUIStore } from '../../../src/store/uiStore'

const eventDraft = {
  title: 'Planning session',
  startAt: '2026-05-25T16:00:00.000Z',
  endAt: '2026-05-25T17:00:00.000Z',
}

describe('Event CRUD - integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
    useEventStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('clicking an empty date slot opens event details in create mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Mon, 2026-05-25/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create event' })).toBeInTheDocument()
  })

  it('filling the form and submitting creates the event on the calendar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Mon, 2026-05-25/i }))
    await user.type(screen.getByLabelText('Title'), 'Planning session')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getByRole('button', { name: /Edit event Planning session/i })).toBeInTheDocument()
  })

  it('clicking an event card opens event details in edit mode', async () => {
    await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Edit event Planning session/i }))

    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Planning session')
  })

  it('editing and submitting updates the event on the calendar', async () => {
    await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Edit event Planning session/i }))
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Updated planning session')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(
      screen.getByRole('button', { name: /Edit event Updated planning session/i }),
    ).toBeInTheDocument()
  })

  it('clicking delete and confirming removes the event', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Edit event Planning session/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(
      screen.queryByRole('button', { name: /Edit event Planning session/i }),
    ).not.toBeInTheDocument()
  })

  it('clicking delete and cancelling keeps the event', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await useEventStore.getState().createEvent(eventDraft)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Edit event Planning session/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: /Edit event Planning session/i })).toBeInTheDocument()
  })

  it('required title field does not submit if empty', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Mon, 2026-05-25/i }))
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(useEventStore.getState().events).toHaveLength(0)
  })
})
