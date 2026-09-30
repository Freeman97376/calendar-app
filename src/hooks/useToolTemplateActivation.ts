import { useEffect, useMemo, useState } from 'react'

import { isReviewFirstTemplate } from '../domain/logic/activeToolOnboarding'
import { activeToolsFromProjects, createActiveToolMetadata } from '../domain/logic/enabledTools'
import { getConfiguredAIService } from '../store/aiStore'
import { goalControlGateway } from '../store/goalControlStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { requestScheduleRecompute } from '../store/schedulingStore'
import { useUIStore } from '../store/uiStore'
import { templateToolName, type ToolTemplateMetadata } from '../domain/logic/toolTemplateMetadata'
import { useEnabledToolsPanel } from './useEnabledToolsPanel'

export type TemplateActivationMessage = {
  content: string
  role: 'assistant' | 'user'
}

export type TemplateActivationResult = {
  activationForm: Record<string, string>
  activationSummary: string
  routeTags: string[]
  suggestedInstanceAlias: string
  warnings: string[]
}

export function useToolTemplateActivation(activeTemplate: ToolTemplateMetadata | null) {
  const activeToolsPanel = useEnabledToolsPanel()
  const goals = useLongTermMemoryStore((state) => state.goals)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const createGoalProject = useLongTermMemoryStore((state) => state.createGoalProject)
  const error = useLongTermMemoryStore((state) => state.error)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const startActiveToolOnboarding = useUIStore((state) => state.startActiveToolOnboarding)
  const activeTools = useMemo(() => activeToolsFromProjects(projects, goals), [goals, projects])
  const matchingActiveTool = useMemo(
    () =>
      activeTemplate
        ? (activeTools.find(
            (instance) =>
              instance.status === 'active' && instance.sourceToolId === activeTemplate.id,
          ) ?? null)
        : null,
    [activeTemplate, activeTools],
  )
  const [messages, setMessages] = useState<TemplateActivationMessage[]>([])
  const [aliasDraft, setAliasDraft] = useState('')
  const [activationResult, setActivationResult] = useState<TemplateActivationResult | null>(null)
  const [createAnother, setCreateAnother] = useState(false)
  const [journeyId, setJourneyId] = useState('')
  const [isActivating, setIsActivating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    loadOverview().catch(() => undefined)
  }, [loadOverview])

  useEffect(() => {
    setMessages([])
    setAliasDraft('')
    setActivationResult(null)
    setCreateAnother(false)
    setJourneyId('')
    setLocalError(null)
    setStatus(null)
  }, [activeTemplate?.id])

  async function sendRequirement(content: string) {
    if (!activeTemplate) return

    const trimmed = content.trim()
    if (!trimmed) return

    const nextMessages = [...messages, { content: trimmed, role: 'user' as const }]
    setMessages(nextMessages)
    setIsActivating(true)
    setLocalError(null)
    setStatus(null)

    const currentJourneyId =
      journeyId || globalThis.crypto?.randomUUID?.() || 'journey-' + Date.now()
    setJourneyId(currentJourneyId)
    await goalControlGateway
      .recordFunnelEvent({
        eventName: 'tool_creation_request_submitted',
        journeyId: currentJourneyId,
        source: 'template-library',
        templateId: activeTemplate.id,
      })
      .catch(() => undefined)

    const service = getConfiguredAIService()
    if (!service?.isAvailable()) {
      await goalControlGateway
        .recordFunnelEvent({
          errorCategory: 'provider',
          eventName: 'journey_failed',
          journeyId: currentJourneyId,
          source: 'template-library',
          stage: 'recommendation',
          templateId: activeTemplate.id,
        })
        .catch(() => undefined)
      setLocalError('Selected AI provider is not configured.')
      setIsActivating(false)
      return
    }

    try {
      const result = await service.runToolActivation({
        activationFields: activeTemplate.activationFields ?? [],
        activationFormDraft: {},
        capabilityTags: activeTemplate.capabilityTags ?? [],
        existingInstanceAliases: activeTools.map((instance) => instance.instanceAlias),
        messages: nextMessages,
        routeTags: activeTemplate.routeTags ?? [],
        sourceToolId: activeTemplate.id,
        templateDescription: activeTemplate.description ?? '',
        templateId: activeTemplate.id,
        templateLabel: activeTemplate.label,
        toolName: templateToolName(activeTemplate),
      })
      setMessages((current) => [...current, { content: result.assistantReply, role: 'assistant' }])
      setActivationResult({
        activationForm: result.activationForm,
        activationSummary: result.activationSummary,
        routeTags: result.routeTags,
        suggestedInstanceAlias: result.suggestedInstanceAlias,
        warnings: result.warnings,
      })
      setAliasDraft(result.suggestedInstanceAlias)
      await goalControlGateway
        .recordFunnelEvent({
          eventName: 'template_recommendation_shown',
          journeyId: currentJourneyId,
          source: 'template-library',
          templateId: activeTemplate.id,
        })
        .catch(() => undefined)
    } catch (activationError) {
      await goalControlGateway
        .recordFunnelEvent({
          errorCategory: 'provider',
          eventName: 'journey_failed',
          journeyId: currentJourneyId,
          source: 'template-library',
          stage: 'recommendation',
          templateId: activeTemplate.id,
        })
        .catch(() => undefined)
      setLocalError(
        activationError instanceof Error
          ? activationError.message
          : 'Unable to activate this tool template',
      )
    } finally {
      setIsActivating(false)
    }
  }

  async function createEnabledTool() {
    if (!activeTemplate || !activationResult) return

    const alias = aliasDraft.trim() || activationResult.suggestedInstanceAlias
    if (isReviewFirstTemplate(activeTemplate.id)) {
      if (matchingActiveTool && !createAnother) {
        const existingJourneyId =
          journeyId || globalThis.crypto?.randomUUID?.() || 'journey-' + Date.now()
        await Promise.allSettled([
          goalControlGateway.recordFunnelEvent({
            eventName: 'template_recommendation_accepted',
            journeyId: existingJourneyId,
            metadata: { matchedExisting: true },
            source: 'template-library',
            templateId: activeTemplate.id,
          }),
          goalControlGateway.recordFunnelEvent({
            eventName: 'active_tool_workspace_opened',
            journeyId: existingJourneyId,
            metadata: { matchedExisting: true },
            projectId: matchingActiveTool.projectId,
            source: 'template-library',
            templateId: activeTemplate.id,
          }),
        ])
        setStatus(`Opened existing active tool ${matchingActiveTool.instanceAlias}.`)
        activeToolsPanel.open(matchingActiveTool.projectId)
        return
      }
      const originalRequest =
        [...messages].reverse().find((message) => message.role === 'user')?.content ||
        activationResult.activationSummary
      startActiveToolOnboarding({
        activationForm: activationResult.activationForm,
        activationSummary: activationResult.activationSummary,
        journeyId: journeyId || globalThis.crypto?.randomUUID?.() || 'journey-' + Date.now(),
        originalRequest,
        routeTags: activationResult.routeTags.length
          ? activationResult.routeTags
          : (activeTemplate.routeTags ?? []),
        source: 'template-library',
        suggestedInstanceAlias: alias,
        template: activeTemplate,
      })
      setStatus('Opened initial plan review for ' + alias + '.')
      return
    }

    const metadata = createActiveToolMetadata({
      activationForm: activationResult.activationForm,
      activationSummary: activationResult.activationSummary,
      adapterId: activeTemplate.adapterId ?? 'generic',
      instanceAlias: alias,
      parentTemplateId: activeTemplate.id,
      parentTemplateLabel: activeTemplate.label,
      parentTemplateToolName: templateToolName(activeTemplate),
      routeTags: activationResult.routeTags.length
        ? activationResult.routeTags
        : (activeTemplate.routeTags ?? []),
      routingEnabled: true,
      sourceToolId: activeTemplate.id,
      templateId: activeTemplate.id,
      toolFeatures: activeTemplate.capabilityTags ?? [],
      toolKind: activeTemplate.toolKind,
      toolName: templateToolName(activeTemplate),
    })

    setLocalError(null)
    setStatus(null)
    try {
      const { project } = await createGoalProject({
        goal: {
          description: activationResult.activationSummary,
          metadata,
          title: alias,
        },
        project: {
          description: activationResult.activationSummary,
          metadata,
          title: alias,
        },
      })
      await loadOverview()
      requestScheduleRecompute('active_tool_activated')
      setStatus(`Registered active tool ${alias}.`)
      activeToolsPanel.open(project.project_id)
    } catch (createError) {
      setLocalError(
        createError instanceof Error ? createError.message : 'Unable to register active tool',
      )
    }
  }

  return {
    activationResult,
    aliasDraft,
    createAnother,
    createEnabledTool,
    error: localError ?? error,
    isActivating,
    isLoading,
    matchingActiveTool,
    messages,
    reviewFirst: Boolean(activeTemplate && isReviewFirstTemplate(activeTemplate.id)),
    sendRequirement,
    setAliasDraft,
    setCreateAnother,
    status,
  }
}
