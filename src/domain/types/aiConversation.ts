import type { AICalendarActionPlan } from '../schemas/ai.schema'

export type AIConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AIConversationContext =
  | {
      kind: 'general'
    }
  | {
      kind: 'draft-action-plan'
      actionPlan: AICalendarActionPlan
      title: string
    }
  | {
      kind: 'todo-step-refinement'
      todoId: string
      todoTitle: string
      selectedItems: Array<{
        completed: boolean
        itemIndex: number
        itemLabel: 'Action' | 'Step'
        value: string
      }>
    }
