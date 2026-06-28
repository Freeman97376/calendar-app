import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/App'
import { useCalendarStore } from '../../src/store/calendarStore'
import { useEventStore } from '../../src/store/eventStore'
import { useTodoStore } from '../../src/store/todoStore'
import { useUIStore } from '../../src/store/uiStore'

describe('Debug panel', () => {
  beforeEach(() => {
    useCalendarStore.getState().reset({ focusedDate: '2026-06-17', view: 'week' })
    useEventStore.getState().reset()
    useTodoStore.getState().reset([
      {
        completedAt: undefined,
        createdAt: '2026-06-17T00:00:00.000Z',
        dueDate: '2026-06-18',
        eventTypeId: 'general',
        id: 'todo-debug-1',
        priority: 'medium',
        status: 'todo',
        title: 'Debug task',
        updatedAt: '2026-06-17T00:00:00.000Z',
      },
    ])
    useUIStore.getState().reset()
  })

  it('shows key calendar, AI, time, and task state beside the page', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Debug' }))

    expect(screen.getByRole('heading', { name: 'Debug' })).toBeInTheDocument()
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0)
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('week')).toBeInTheDocument()
    expect(screen.getByText('2026-06-17')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('closes from the panel header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Debug' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('heading', { name: 'Debug' })).not.toBeInTheDocument()
  })
})
