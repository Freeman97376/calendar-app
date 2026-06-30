import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/App'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
import { LocalTodoService } from '../../src/services/todos/localTodoService'
import { useCalendarStore } from '../../src/store/calendarStore'
import { configureEventSync, useEventStore } from '../../src/store/eventStore'
import {
  configureEventTypeService,
  useEventTypeStore,
} from '../../src/store/eventTypeStore'
import { useAIStore } from '../../src/store/aiStore'
import { configureTodoService, useTodoStore } from '../../src/store/todoStore'
import { useUIStore } from '../../src/store/uiStore'

async function openTodoPanel() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Todos' }))
  await screen.findByRole('heading', { name: 'To-Do List' })
  return user
}

async function openWorkspaceEntry(user: ReturnType<typeof userEvent.setup>, name: string) {
  const directEntry = screen.queryByRole('button', { name })
  if (directEntry) {
    await user.click(directEntry)
    return
  }

  if (name === 'Todos' && screen.queryByRole('heading', { name: 'To-Do List' })) return
  if (screen.queryByRole('heading', { name })) return

  const closeButton = screen.queryByRole('button', { name: 'Close' })
  if (closeButton) {
    await user.click(closeButton)
  } else {
    const backButton = screen.queryByRole('button', { name: 'Back' })
    if (backButton) {
      await user.click(backButton)
    }
  }
  await user.click(await screen.findByRole('button', { name }))
}

describe('Todo panel', () => {
  beforeEach(() => {
    localStorage.clear()
    configureEventSync(null)
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_event_types_panel'))
    configureTodoService(new LocalTodoService(localStorage, 'test_todos_panel'))
    useCalendarStore.getState().reset({ focusedDate: '2026-06-07', view: 'month' })
    useEventStore.getState().reset()
    useEventTypeStore.getState().reset()
    useAIStore.getState().reset()
    useTodoStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('creates a todo from the panel', async () => {
    const user = await openTodoPanel()

    await user.type(screen.getByLabelText('Task'), 'Draft launch plan')
    await user.type(screen.getByLabelText('Due date'), '2026-06-10')
    await user.click(screen.getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Draft launch plan')).toBeInTheDocument()
    expect(useTodoStore.getState().todos[0]).toMatchObject({
      dueDate: '2026-06-10',
      title: 'Draft launch plan',
    })
  })

  it('keeps the todo type list editable by users', async () => {
    const user = await openTodoPanel()

    await user.type(screen.getByLabelText('New type label'), 'Client Work')
    await user.click(screen.getByRole('button', { name: 'Add type' }))

    await waitFor(() => {
      expect(useEventTypeStore.getState().eventTypes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            appliesTo: 'both',
            id: 'client-work',
            label: 'Client Work',
          }),
        ]),
      )
    })
    expect(screen.getByText('Added type Client Work')).toBeInTheDocument()
  })

  it('schedules a typed todo as a linked calendar event', async () => {
    const user = await openTodoPanel()

    await user.type(screen.getByLabelText('New type label'), 'Client Work')
    await user.click(screen.getByRole('button', { name: 'Add type' }))
    await user.selectOptions(screen.getByLabelText('Type'), 'client-work')
    await user.type(screen.getByLabelText('Task'), 'Prepare client deck')
    await user.type(screen.getByLabelText('Due date'), '2026-06-11')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await user.click(await screen.findByRole('button', { name: 'Schedule' }))

    await waitFor(() => {
      expect(useEventStore.getState().events).toHaveLength(1)
    })

    const todo = useTodoStore.getState().todos[0]
    const event = useEventStore.getState().events[0]

    expect(event).toMatchObject({
      eventTypeId: 'client-work',
      linkedTodoId: todo.id,
      title: 'Prepare client deck',
    })
    expect(todo.linkedEventId).toBe(event.id)
  })

  it('deletes a completed task from the completed list', async () => {
    const user = await openTodoPanel()

    await user.type(screen.getByLabelText('Task'), 'Archive completed task')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await user.click(await screen.findByRole('button', { name: /Mark task Archive completed task done/i }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toHaveLength(0)
    })
    expect(screen.getByText('Deleted Archive completed task')).toBeInTheDocument()
  })

  it('closes the todo list from the panel header', async () => {
    const user = await openTodoPanel()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('heading', { name: 'To-Do List' })).not.toBeInTheDocument()
  })

  it('renders expanded AI task details as individual steps', async () => {
    await useTodoStore.getState().createTodo({
      notes: [
        'AI Assistant action plan',
        '',
        'Summary: Prepare launch checklist.',
        '',
        'Actions:',
        '1. create_todo: Draft launch checklist (due 2026-06-20)',
        '2. create_event: Review launch checklist (2026-06-20T17:00:00.000Z - 2026-06-20T18:00:00.000Z)',
        '',
        'Warnings:',
        '- Review task owner.',
        '',
        'Full JSON:',
        '{"summary":"Prepare launch checklist."}',
      ].join('\n'),
      title: 'AI: Prepare launch checklist.',
    })
    const user = await openTodoPanel()

    await user.click(screen.getByText('Details'))

    expect(screen.getByText('Action 1')).toBeInTheDocument()
    expect(screen.getByText(/Draft launch checklist/i)).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('Review task owner.')).toBeInTheDocument()
    expect(screen.getByText('Full JSON')).toBeInTheDocument()
  })

  it('edits one expanded AI task step without changing the other steps', async () => {
    await useTodoStore.getState().createTodo({
      notes: [
        'AI Assistant goal breakdown',
        '',
        'Goal: Launch prep',
        '',
        'Steps:',
        '1. Draft launch checklist (45 min, high, day +0)',
        '2. Review launch checklist (30 min, medium, day +1)',
        '',
        'Full JSON:',
        '{"goal":"Launch prep"}',
      ].join('\n'),
      title: 'AI: Launch prep',
    })
    const user = await openTodoPanel()

    await user.click(screen.getByText('Details'))
    await user.click(screen.getByRole('button', { name: 'Edit step 2' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Step 2' })
    await user.clear(within(dialog).getByLabelText('Step details'))
    await user.type(within(dialog).getByLabelText('Step details'), 'Review final launch checklist with owner')
    await user.click(within(dialog).getByRole('button', { name: 'Save step' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos[0].notes).toContain(
        '2. Review final launch checklist with owner',
      )
    })
    expect(useTodoStore.getState().todos[0].notes).toContain('1. Draft launch checklist')
    expect(screen.getByText('Updated step 2.')).toBeInTheDocument()
    expect(screen.getByText('Review final launch checklist with owner')).toBeInTheDocument()
  })

  it('marks one expanded AI task step complete without completing the sibling steps', async () => {
    await useTodoStore.getState().createTodo({
      notes: [
        'AI Assistant goal breakdown',
        '',
        'Goal: Launch prep',
        '',
        'Steps:',
        '1. Draft launch checklist (45 min, high, day +0)',
        '2. Review launch checklist (30 min, medium, day +1)',
        '',
        'Full JSON:',
        '{"goal":"Launch prep"}',
      ].join('\n'),
      title: 'AI: Launch prep',
    })
    const user = await openTodoPanel()

    await user.click(screen.getByText('Details'))
    await user.click(screen.getByRole('button', { name: 'Mark step 2 done' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos[0].notes).toContain(
        '2. [x] Review launch checklist',
      )
    })
    expect(useTodoStore.getState().todos[0].notes).toContain('1. Draft launch checklist')
    expect(screen.getByText('Marked step 2 done.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen step 2' })).toBeInTheDocument()
  })

  it('keeps a generated AI step complete after editing that step', async () => {
    await useTodoStore.getState().createTodo({
      notes: [
        'AI Assistant goal step',
        '',
        'Goal: Prepare for interview',
        'Step 1: Research company',
        'Estimate: 45 minutes',
        '',
        'Step JSON:',
        '{"title":"Research company"}',
      ].join('\n'),
      title: 'Research company',
    })
    const user = await openTodoPanel()

    await user.click(screen.getByText('Details'))
    await user.click(screen.getByRole('button', { name: 'Mark step 1 done' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos[0].notes).toContain('Step 1: [x] Research company')
    })

    await user.click(screen.getByRole('button', { name: 'Edit step 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Step 1' })
    await user.clear(within(dialog).getByLabelText('Step details'))
    await user.type(within(dialog).getByLabelText('Step details'), 'Research company product updates')
    await user.click(within(dialog).getByRole('button', { name: 'Save step' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos[0].notes).toContain(
        'Step 1: [x] Research company product updates',
      )
    })
    expect(screen.getByRole('button', { name: 'Reopen step 1' })).toBeInTheDocument()
  })

  it('sends selected expanded task steps to the AI assistant conversation', async () => {
    await useTodoStore.getState().createTodo({
      notes: [
        'AI Assistant goal breakdown',
        '',
        'Goal: Launch prep',
        '',
        'Steps:',
        '1. Draft launch checklist (45 min, high, day +0)',
        '2. [x] Review launch checklist (30 min, medium, day +1)',
        '',
        'Full JSON:',
        '{"goal":"Launch prep"}',
      ].join('\n'),
      title: 'AI: Launch prep',
    })
    const user = await openTodoPanel()

    await user.click(screen.getByText('Details'))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('checkbox', { name: 'Select step 1 for AI' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select step 2 for AI' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('checkbox', { name: 'Select step 1 for AI' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select step 2 for AI' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: 'Send selected to AI' }))

    expect(await screen.findByRole('heading', { name: 'AI Assistant' })).toBeInTheDocument()
    expect(screen.getByText('Task refinement context')).toBeInTheDocument()
    expect(screen.getByText('AI: Launch prep')).toBeInTheDocument()
    expect(screen.getAllByText(/Step 1: Draft launch checklist/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Step 2 \(completed\): Review launch checklist/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/I have these selected task items/i)).toBeInTheDocument()
  })

  it('starts an independent AI conversation for each task selection', async () => {
    await useTodoStore.getState().createTodo({
      notes: ['AI Assistant goal breakdown', '', 'Steps:', '1. First task step'].join('\n'),
      title: 'AI: First prep',
    })
    await useTodoStore.getState().createTodo({
      notes: ['AI Assistant goal breakdown', '', 'Steps:', '1. Second task step'].join('\n'),
      title: 'AI: Second prep',
    })
    const user = await openTodoPanel()

    const firstCard = screen.getByText('AI: First prep').closest('div.rounded-md')
    expect(firstCard).not.toBeNull()
    await user.click(within(firstCard as HTMLElement).getByText('Details'))
    await user.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Select all' }))
    await user.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Send selected to AI' }))

    expect(await screen.findByText('AI: First prep')).toBeInTheDocument()

    await openWorkspaceEntry(user, 'Todos')
    const secondCard = screen.getByText('AI: Second prep').closest('div.rounded-md')
    expect(secondCard).not.toBeNull()
    await user.click(within(secondCard as HTMLElement).getByText('Details'))
    await user.click(within(secondCard as HTMLElement).getByRole('button', { name: 'Select all' }))
    await user.click(within(secondCard as HTMLElement).getByRole('button', { name: 'Send selected to AI' }))

    expect(await screen.findByText('AI: Second prep')).toBeInTheDocument()
    expect(screen.queryByText('AI: First prep')).not.toBeInTheDocument()
    expect(screen.queryByText(/First task step/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Second task step/i).length).toBeGreaterThan(0)
  })

  it('edits a task in a dialog', async () => {
    const user = await openTodoPanel()

    await user.type(screen.getByLabelText('Task'), 'Editable task')
    await user.type(screen.getByLabelText('Due date'), '2026-06-12')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Task' })
    await user.clear(within(dialog).getByLabelText('Task'))
    await user.type(within(dialog).getByLabelText('Task'), 'Edited task')
    await user.clear(within(dialog).getByLabelText('Due date'))
    await user.type(within(dialog).getByLabelText('Due date'), '2026-06-13')
    await user.click(within(dialog).getByRole('button', { name: 'Save task' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos[0]).toMatchObject({
        dueDate: '2026-06-13',
        title: 'Edited task',
      })
    })
    expect(screen.getByText('Updated Edited task')).toBeInTheDocument()
  })
})
