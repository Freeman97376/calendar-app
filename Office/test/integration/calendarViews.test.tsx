import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../../src/App'
import { useCalendarStore } from '../../../src/store/calendarStore'
import { useEventStore } from '../../../src/store/eventStore'
import { useUIStore } from '../../../src/store/uiStore'

describe('Calendar views', () => {
  beforeEach(() => {
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
    useEventStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('renders the month view by default', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mon, 2026-05-25/i })).toBeInTheDocument()
  })

  it('switches between month, week, and day views', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getByRole('heading', { name: 'May 25-31, 2026' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Day' }))
    expect(screen.getByRole('heading', { name: 'Monday, May 25, 2026' })).toBeInTheDocument()
  })

  it('navigates to the next visible date range', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Next date range' }))

    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument()
  })

  it.each(['Week', 'Day'])('prefills the clicked hour in %s view', async (view) => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: view }))
    const timeSlotButton = screen.getByRole('button', {
      name: 'Add event on May 25 at 3 PM',
    })
    expect(timeSlotButton).toHaveClass(
      'focus-visible:opacity-100',
      'focus-visible:ring-2',
      'focus-visible:ring-emerald-700',
    )
    await user.click(timeSlotButton)

    expect(screen.getByLabelText('Start time')).toHaveValue('15:00')
    expect(screen.getByLabelText('End time')).toHaveValue('16:00')
  })
})
