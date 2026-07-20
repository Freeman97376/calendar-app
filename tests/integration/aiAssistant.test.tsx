import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/App'
import type {
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  AIEnabledToolRouteRequest,
  AIEnabledToolRouteResult,
  AIProgressToolRequest,
  AIProgressToolResult,
  AIToolActivationRequest,
  AIToolActivationResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../src/domain/types'
import type {
  AIConversationContext,
  AIConversationMessage,
  IAIService,
} from '../../src/services/ai/IAIService'
import { configureAIService, useAIStore } from '../../src/store/aiStore'
import { useCalendarStore } from '../../src/store/calendarStore'
import { configureEventSync, useEventStore } from '../../src/store/eventStore'
import { configureEventTypeService, useEventTypeStore } from '../../src/store/eventTypeStore'
import { LocalEventTypeService } from '../../src/services/eventTypes/localEventTypeService'
import { LocalTodoService } from '../../src/services/todos/localTodoService'
import { configureTodoService, useTodoStore } from '../../src/store/todoStore'
import {
  configureLongTermMemoryClient,
  type LongTermMemoryClientContract,
} from '../../src/store/longTermMemoryStore'
import { useUIStore } from '../../src/store/uiStore'

const suggestion: AIBreakdownResult = {
  goal: 'Prepare for interview',
  steps: [
    {
      title: 'Research company',
      description: 'Review product pages and recent news.',
      durationMinutes: 45,
      energyNeeded: 'high',
      suggestedDayOffset: 0,
      suggestedHour: 9,
      priority: 'high',
    },
    {
      title: 'Practice answers',
      durationMinutes: 60,
      energyNeeded: 'medium',
      suggestedDayOffset: 1,
      suggestedHour: 10,
      priority: 'medium',
    },
  ],
  totalEstimatedHours: 1.75,
}

class MockAIService implements IAIService {
  constructor(
    private readonly result: () => Promise<AIBreakdownResult>,
    private readonly actionPlan: (
      context: AICalendarContext,
    ) => Promise<AICalendarActionPlan> = async () => ({
      summary: 'No actions',
      actions: [
        {
          type: 'create_event',
          title: 'Default action',
          startAt: '2026-05-25T16:00:00.000Z',
          endAt: '2026-05-25T17:00:00.000Z',
          allDay: false,
        },
      ],
      warnings: [],
    }),
    private readonly available = true,
    private readonly conversation: (
      messages: AIConversationMessage[],
      context: AICalendarContext,
      conversationContext?: AIConversationContext,
    ) => Promise<AIConversationResult> = async (messages) => ({
      reply: `Mock reply: ${messages[messages.length - 1]?.content ?? ''}`,
    }),
  ) {}

  isAvailable(): boolean {
    return this.available
  }

  async breakdownGoal(): Promise<AIBreakdownResult> {
    return this.result()
  }

  async planCalendarActions(
    _command: string,
    context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    return this.actionPlan(context)
  }

  async runToolSession(_request: ToolSessionRequest): Promise<ToolSessionResult> {
    return {
      summary: 'Tool session',
      events: [
        {
          title: 'Generated event',
          startAt: '2026-05-25T16:00:00.000Z',
          endAt: '2026-05-25T17:00:00.000Z',
          allDay: false,
        },
      ],
      warnings: [],
    }
  }

  async runProgressTool(_request: AIProgressToolRequest): Promise<AIProgressToolResult> {
    throw new Error('Not used')
  }

  async runToolActivation(_request: AIToolActivationRequest): Promise<AIToolActivationResult> {
    throw new Error('Not used')
  }

  async routeEnabledTool(_request: AIEnabledToolRouteRequest): Promise<AIEnabledToolRouteResult> {
    return {
      confidence: 0,
      matchedProjectId: null,
      needsConfirmation: true,
      reason: 'No active tool matched.',
      rewrittenInstruction: 'No route',
    }
  }

  async continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult> {
    return this.conversation(messages, context, conversationContext)
  }
}

function deferredSuggestion() {
  let resolve!: (value: AIBreakdownResult) => void
  const promise = new Promise<AIBreakdownResult>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

async function openPanel() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'AI Assistant' }))
  return user
}

async function submitComposer(
  user: ReturnType<typeof userEvent.setup>,
  mode: 'chat' | 'plan' | 'goal',
  message: string,
) {
  const modeLabel = mode === 'chat' ? 'Chat' : mode === 'plan' ? 'Plan actions' : 'Break down goal'
  const submitLabel =
    mode === 'chat' ? 'Send message' : mode === 'plan' ? 'Plan actions' : 'Break down goal'

  await user.click(screen.getByRole('button', { name: `Mode: ${modeLabel}` }))
  await user.type(screen.getByLabelText('AI message'), message)
  await user.click(screen.getByRole('button', { name: submitLabel }))
}

async function reviewPlan() {
  await screen.findByRole('button', { name: 'Review plan' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Review plan' }))
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

describe('AI Assistant - integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    configureAIService(null)
    configureEventSync(null)
    configureEventTypeService(new LocalEventTypeService(localStorage, 'test_ai_event_types'))
    configureTodoService(new LocalTodoService(localStorage, 'test_ai_todos'))
    configureLongTermMemoryClient({
      listGoals: vi.fn(async () => []),
      listProjects: vi.fn(async () => []),
    } as unknown as LongTermMemoryClientContract)
    useAIStore.getState().reset()
    useCalendarStore.getState().reset({ focusedDate: '2026-05-25', view: 'month' })
    useEventStore.getState().reset()
    useEventTypeStore.getState().reset()
    useTodoStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('typing a goal and submitting shows loading state', async () => {
    const deferred = deferredSuggestion()
    configureAIService(new MockAIService(() => deferred.promise))
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')

    expect(screen.getAllByText('Thinking...')).not.toHaveLength(0)
    deferred.resolve(suggestion)
    expect(await screen.findByText('Research company')).toBeInTheDocument()
  })

  it('valid AI response shows step cards in the panel', async () => {
    configureAIService(new MockAIService(async () => suggestion))
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')

    expect(await screen.findByText('Research company')).toBeInTheDocument()
    expect(screen.getByText('Practice answers')).toBeInTheDocument()
  })

  it('clicking Schedule All creates events in the calendar', async () => {
    configureAIService(new MockAIService(async () => suggestion))
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')
    await user.click(await screen.findByRole('button', { name: 'Schedule All' }))

    await waitFor(() => {
      expect(useEventStore.getState().events).toHaveLength(2)
    })
    expect(screen.getByRole('button', { name: /Edit event Research company/i })).toBeInTheDocument()
  })

  it('supports multi-turn conversation messages for clarification', async () => {
    let capturedMessages: AIConversationMessage[] = []
    let capturedContext: AICalendarContext | null = null
    configureAIService(
      new MockAIService(
        async () => suggestion,
        undefined,
        true,
        async (messages, context) => {
          capturedMessages = messages
          capturedContext = context
          return {
            reply: 'Which deadline and level of detail should I use?',
            actionPlan: {
              summary: 'Draft clarified event.',
              actions: [
                {
                  type: 'create_event',
                  title: 'Clarified planning block',
                  startAt: '2026-05-26T16:00:00.000Z',
                  endAt: '2026-05-26T17:00:00.000Z',
                  allDay: false,
                },
              ],
              warnings: [],
            },
          }
        },
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'chat', 'Help me clarify this task')

    expect(
      await screen.findByText('Which deadline and level of detail should I use?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Draft clarified event.')).toBeInTheDocument()
    await reviewPlan()
    expect(screen.getByText('Clarified planning block')).toBeInTheDocument()
    expect(capturedMessages.at(-1)).toMatchObject({
      content: 'Help me clarify this task',
      role: 'user',
    })
    expect(capturedContext).toMatchObject({
      focusedDate: '2026-05-25',
    })
  })

  it('plans and applies event create, update, and delete actions', async () => {
    const eventToUpdate = await useEventStore.getState().createEvent({
      title: 'Planning session',
      startAt: '2026-05-25T16:00:00.000Z',
      endAt: '2026-05-25T17:00:00.000Z',
    })
    const eventToDelete = await useEventStore.getState().createEvent({
      title: 'Canceled lunch',
      startAt: '2026-05-25T18:00:00.000Z',
      endAt: '2026-05-25T19:00:00.000Z',
    })
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async () => ({
          summary: 'Change calendar events.',
          actions: [
            {
              type: 'create_event',
              title: 'Dinner with friend',
              startAt: '2026-05-29T02:00:00.000Z',
              endAt: '2026-05-29T03:00:00.000Z',
              allDay: false,
              eventTypeId: 'general',
            },
            {
              type: 'update_event',
              eventId: eventToUpdate.id,
              changes: { title: 'Updated planning session' },
            },
            {
              type: 'delete_event',
              eventId: eventToDelete.id,
            },
          ],
          warnings: [],
        }),
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'make calendar changes')
    await reviewPlan()
    await user.click(await screen.findByRole('button', { name: 'Apply Actions' }))

    await waitFor(() => {
      expect(useEventStore.getState().events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Dinner with friend' }),
          expect.objectContaining({ id: eventToUpdate.id, title: 'Updated planning session' }),
        ]),
      )
    })
    expect(useEventStore.getState().events.some((event) => event.id === eventToDelete.id)).toBe(
      false,
    )
  })

  it('plans and applies todo create, update, delete, and schedule actions', async () => {
    const todoToUpdate = await useTodoStore.getState().createTodo({ title: 'Draft proposal' })
    const todoToDelete = await useTodoStore.getState().createTodo({ title: 'Old task' })
    const todoToSchedule = await useTodoStore.getState().createTodo({
      dueDate: '2026-05-28',
      eventTypeId: 'project',
      title: 'Prepare deck',
    })
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async () => ({
          summary: 'Change tasks.',
          actions: [
            {
              type: 'create_todo',
              title: 'Follow up with client',
              dueDate: '2026-05-27',
              etaMinutes: 30,
              energyNeeded: 'medium',
              priority: 'high',
              eventTypeId: 'project',
            },
            {
              type: 'update_todo',
              todoId: todoToUpdate.id,
              changes: { status: 'done' },
            },
            {
              type: 'schedule_todo',
              todoId: todoToSchedule.id,
              date: '2026-05-28',
            },
            {
              type: 'delete_todo',
              todoId: todoToDelete.id,
            },
          ],
          warnings: [],
        }),
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'make task changes')
    await reviewPlan()
    await user.click(await screen.findByRole('button', { name: 'Apply Actions' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Follow up with client' }),
          expect.objectContaining({ id: todoToUpdate.id, status: 'done' }),
          expect.objectContaining({ id: todoToSchedule.id, linkedEventId: expect.any(String) }),
        ]),
      )
    })
    expect(useTodoStore.getState().todos.some((todo) => todo.id === todoToDelete.id)).toBe(false)
    expect(useEventStore.getState().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventTypeId: 'project',
          linkedTodoId: todoToSchedule.id,
          title: 'Prepare deck',
        }),
      ]),
    )
  })

  it('plans and applies an action with the local provider when no API key is configured', async () => {
    const user = await openPanel()

    await user.click(screen.getByText('Chat settings'))
    await user.selectOptions(screen.getByLabelText('AI provider'), 'local')
    await submitComposer(user, 'plan', 'add dinner with friend tomorrow at 7pm')
    await reviewPlan()
    await user.click(await screen.findByLabelText('I reviewed and confirmed the near-term times.'))
    await user.click(await screen.findByRole('button', { name: 'Apply Actions' }))

    await waitFor(() => {
      expect(useEventStore.getState().events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining('dinner with friend'),
          }),
        ]),
      )
    })
  })

  it('requires confirmation before applying near-term event times', async () => {
    const start = new Date(Date.now() + 60 * 60_000)
    const end = new Date(start.getTime() + 60 * 60_000)
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async () => ({
          summary: 'Create near-term event.',
          actions: [
            {
              type: 'create_event',
              title: 'Near-term meeting',
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              allDay: false,
            },
          ],
          warnings: [],
        }),
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'add meeting in one hour')
    await reviewPlan()

    const applyButton = await screen.findByRole('button', { name: 'Apply Actions' })
    expect(screen.getByText(/Near-term meeting is scheduled for/i)).toBeInTheDocument()
    expect(applyButton).toBeDisabled()

    await user.click(screen.getByLabelText('I reviewed and confirmed the near-term times.'))
    expect(applyButton).toBeEnabled()
    await user.click(applyButton)

    await waitFor(() => {
      expect(useEventStore.getState().events).toEqual(
        expect.arrayContaining([expect.objectContaining({ title: 'Near-term meeting' })]),
      )
    })
  })

  it('adds each current AI action plan item as its own editable task', async () => {
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async () => ({
          summary: 'Prepare launch checklist.',
          actions: [
            {
              type: 'create_todo',
              title: 'Draft launch checklist',
              dueDate: '2026-06-20',
              etaMinutes: 30,
              energyNeeded: 'medium',
              priority: 'high',
            },
            {
              type: 'create_event',
              title: 'Review launch checklist',
              startAt: '2026-06-21T17:00:00.000Z',
              endAt: '2026-06-21T18:00:00.000Z',
              allDay: false,
            },
          ],
          warnings: ['Review task owner.'],
        }),
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'make a launch checklist')
    await reviewPlan()
    await user.click(await screen.findByRole('button', { name: 'Add to Tasks' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dueDate: '2026-06-20',
            notes: expect.stringContaining('Action 1: create_todo'),
            title: 'Draft launch checklist',
          }),
          expect.objectContaining({
            dueDate: '2026-06-21',
            notes: expect.stringContaining('Action 2: create_event'),
            title: 'Review launch checklist',
          }),
        ]),
      )
    })
    expect(screen.getByText('Added 2 tasks from AI result.')).toBeInTheDocument()

    await openWorkspaceEntry(user, 'Todos')
    const reviewCheckbox = await screen.findByRole('button', {
      name: /Mark task Review launch checklist done/i,
    })
    const reviewCard = reviewCheckbox.closest('div.rounded-md')
    expect(reviewCard).not.toBeNull()

    await user.click(within(reviewCard as HTMLElement).getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Task' })
    await user.clear(within(dialog).getByLabelText('Task'))
    await user.type(within(dialog).getByLabelText('Task'), 'Review launch checklist with owner')
    await user.click(within(dialog).getByRole('button', { name: 'Save task' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Draft launch checklist' }),
          expect.objectContaining({ title: 'Review launch checklist with owner' }),
        ]),
      )
    })
  })

  it('adds each AI goal breakdown step as its own editable task', async () => {
    configureAIService(new MockAIService(async () => suggestion))
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')
    await user.click(await screen.findByRole('button', { name: 'Add to Tasks' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notes: expect.stringContaining('Step 1: Research company'),
            title: 'Research company',
          }),
          expect.objectContaining({
            notes: expect.stringContaining('Step 2: Practice answers'),
            title: 'Practice answers',
          }),
        ]),
      )
    })
    expect(screen.getByText('Added 2 tasks from AI result.')).toBeInTheDocument()

    await openWorkspaceEntry(user, 'Todos')
    const researchCheckbox = await screen.findByRole('button', {
      name: /Mark task Research company done/i,
    })
    const researchCard = researchCheckbox.closest('div.rounded-md')
    expect(researchCard).not.toBeNull()

    await user.click(within(researchCard as HTMLElement).getByText('Details'))
    await user.click(
      within(researchCard as HTMLElement).getByRole('button', { name: 'Edit step 1' }),
    )

    const dialog = await screen.findByRole('dialog', { name: 'Edit Step 1' })
    await user.clear(within(dialog).getByLabelText('Step details'))
    await user.type(
      within(dialog).getByLabelText('Step details'),
      'Research company product updates',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save step' }))

    await waitFor(() => {
      expect(useTodoStore.getState().todos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notes: expect.stringContaining('Step 1: Research company product updates'),
            title: 'Research company',
          }),
          expect.objectContaining({ title: 'Practice answers' }),
        ]),
      )
    })
  })

  it('blocks applying overlapping AI event actions', async () => {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60_000)
    const end = new Date(start.getTime() + 60 * 60_000)
    const overlapStart = new Date(start.getTime() + 30 * 60_000)
    const overlapEnd = new Date(start.getTime() + 90 * 60_000)
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async () => ({
          summary: 'Create overlapping events.',
          actions: [
            {
              type: 'create_event',
              title: 'First block',
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              allDay: false,
            },
            {
              type: 'create_event',
              title: 'Second block',
              startAt: overlapStart.toISOString(),
              endAt: overlapEnd.toISOString(),
              allDay: false,
            },
          ],
          warnings: [],
        }),
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'create overlapping blocks')
    await reviewPlan()

    const applyButton = await screen.findByRole('button', { name: 'Apply Actions' })
    expect(screen.getByText(/First block.*overlaps.*Second block/i)).toBeInTheDocument()
    expect(screen.getByText(/must be fixed before applying/i)).toBeInTheDocument()
    expect(applyButton).toBeDisabled()
    expect(useEventStore.getState().events).toHaveLength(0)
  })

  it('sends current date separately from the focused calendar date', async () => {
    let capturedContext: AICalendarContext | null = null
    configureAIService(
      new MockAIService(
        async () => suggestion,
        async (context) => {
          capturedContext = context
          return {
            summary: 'Create event.',
            actions: [
              {
                type: 'create_event',
                title: 'Context check',
                startAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
                endAt: new Date(Date.now() + 7 * 24 * 60 * 60_000 + 60 * 60_000).toISOString(),
                allDay: false,
              },
            ],
            warnings: [],
          }
        },
      ),
    )
    const user = await openPanel()

    await submitComposer(user, 'plan', 'add context check')

    await waitFor(() => {
      expect(capturedContext).toMatchObject({
        focusedDate: '2026-05-25',
      })
    })
    const context = capturedContext as unknown as AICalendarContext
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(context.currentDate).toBe(context.today)
    expect(context.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(context.currentLocalDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(context.localDateTimeLabel).toEqual(expect.any(String))
    expect(context.timezone).toEqual(expect.any(String))
    expect(context.timezoneName).toEqual(expect.any(String))
    expect(context.timezoneOffsetLabel).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
    expect(context.timezoneOffsetMinutes).toEqual(expect.any(Number))
  })

  it('clicking Dismiss clears the suggestion without creating events', async () => {
    configureAIService(new MockAIService(async () => suggestion))
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Research company')).not.toBeInTheDocument()
    expect(useEventStore.getState().events).toHaveLength(0)
  })

  it('API error shows error message in the panel', async () => {
    configureAIService(
      new MockAIService(async () => {
        throw new Error('AI unavailable')
      }),
    )
    const user = await openPanel()

    await submitComposer(user, 'goal', 'Prepare for interview')

    expect(await screen.findByText('AI unavailable')).toBeInTheDocument()
  })

  it('no API key shows setup instructions, not an error', async () => {
    await openPanel()

    expect(screen.getByText(/AI service is not configured/i)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mode: Break down goal' }))
    expect(screen.getByRole('button', { name: 'Break down goal' })).toBeDisabled()
    expect(useAIStore.getState().error).toBeNull()
  })
})
