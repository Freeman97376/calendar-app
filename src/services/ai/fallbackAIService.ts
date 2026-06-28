import type {
  AIProvider,
  AIBreakdownResult,
  AICalendarActionPlan,
  AICalendarContext,
  AIConversationResult,
  ToolSessionRequest,
  ToolSessionResult,
} from '../../domain/types'
import type { AIConversationContext, AIConversationMessage, IAIService } from './IAIService'
import { LocalAIService } from './localAIService'

type ProviderMap = {
  api?: IAIService | null
  defaultProvider?: AIProvider
  local?: IAIService
}

export class FallbackAIService implements IAIService {
  private readonly api: IAIService | null
  private readonly defaultProvider: AIProvider
  private readonly local: IAIService

  constructor(providers: ProviderMap = {}) {
    this.api = providers.api ?? null
    this.defaultProvider = providers.defaultProvider ?? 'api'
    this.local = providers.local ?? new LocalAIService()
  }

  isAvailable(): boolean {
    return Boolean(this.providerFor(this.defaultProvider)?.isAvailable())
  }

  async breakdownGoal(goal: string): Promise<AIBreakdownResult> {
    return this.runWithProvider(this.defaultProvider, (service) => service.breakdownGoal(goal))
  }

  async planCalendarActions(
    command: string,
    context: AICalendarContext,
  ): Promise<AICalendarActionPlan> {
    return this.runWithProvider(this.defaultProvider, (service) =>
      service.planCalendarActions(command, context),
    )
  }

  async runToolSession(request: ToolSessionRequest): Promise<ToolSessionResult> {
    const provider = request.llmOptions.provider

    if (provider === 'local') return this.local.runToolSession(request)
    const selectedProvider = provider === 'global' ? this.defaultProvider : provider

    return this.runWithProvider(selectedProvider, (service) => service.runToolSession(request))
  }

  async continueConversation(
    messages: AIConversationMessage[],
    context: AICalendarContext,
    conversationContext?: AIConversationContext,
  ): Promise<AIConversationResult> {
    return this.runWithProvider(this.defaultProvider, (service) =>
      service.continueConversation(messages, context, conversationContext),
    )
  }

  private async runWithProvider<T>(
    provider: AIProvider,
    operation: (service: IAIService) => Promise<T>,
  ): Promise<T> {
    const service = this.providerFor(provider)

    if (!service) {
      throw new Error(`AI provider "${provider}" is not configured.`)
    }

    return operation(service)
  }

  private providerFor(provider: AIProvider): IAIService | null {
    if (provider === 'local') return this.local
    return this.api
  }
}
