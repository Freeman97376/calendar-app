import type { AIConversationContext } from '../domain/types/aiConversation'
import { useAIStore } from '../store/aiStore'
import { useUIStore } from '../store/uiStore'

type TodoStepRefinementContext = Extract<AIConversationContext, { kind: 'todo-step-refinement' }>

export function useTaskStepAIRefinement() {
  const openAIPanel = useUIStore((state) => state.openAIPanel)
  const startTodoStepConversation = useAIStore((state) => state.startTodoStepConversation)

  function sendToAI(context: TodoStepRefinementContext) {
    startTodoStepConversation(context)
    openAIPanel()
  }

  return { sendToAI }
}
