import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/App'
import { useCalendarStore } from '../../src/store/calendarStore'
import { useEventStore } from '../../src/store/eventStore'
import { useUIStore } from '../../src/store/uiStore'

async function createDailyStandup() {
  await useEventStore.getState().createEvent({
    title: 'Daily standup',
    startAt: '2026-05-25T16:00:00.000Z',
    endAt: '2026-05-25T16:30:00.000Z',
    recurrenceRule: {
      frequency: 'daily',
      interval: 1,
      endCondition: { type: 'count', occurrences: 3 },
    },
  })
}

describe('Recurring events - integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
    useEventStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('creates a daily recurring event and renders each occurrence in the month view', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Mon, 2026-05-25/i }))
    await user.type(screen.getByLabelText('Title'), 'Daily standup')
    await user.selectOptions(screen.getByLabelText('Repeat frequency'), 'daily')
    await user.selectOptions(screen.getByLabelText('Ends'), 'count')
    await user.clear(screen.getByLabelText('Occurrences'))
    await user.type(screen.getByLabelText('Occurrences'), '3')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(3)
  })

  it('editing this occurrence creates an exception without changing the full series', async () => {
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[0])
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'One-off standup')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getByRole('button', { name: /Edit event One-off standup/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(2)
  })

  it('editing this and following splits the series at the selected occurrence', async () => {
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[1])
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Shifted standup')
    await user.click(screen.getByLabelText('This and following'))
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.getAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Edit event Shifted standup/i })).toHaveLength(2)
  })

  it('editing all occurrences updates the full series', async () => {
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[0])
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Company standup')
    await user.click(screen.getByLabelText('All events'))
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(screen.queryAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /Edit event Company standup/i })).toHaveLength(3)
  })

  it('deleting this occurrence hides only that occurrence', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[0])
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(2)
  })

  it('deleting this and following removes the selected occurrence and future instances', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[1])
    await user.click(screen.getByLabelText('This and following'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(1)
  })

  it('deleting all occurrences removes the full series', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await createDailyStandup()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: /Edit event Daily standup/i })[0])
    await user.click(screen.getByLabelText('All events'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.queryAllByRole('button', { name: /Edit event Daily standup/i })).toHaveLength(0)
  })
})
