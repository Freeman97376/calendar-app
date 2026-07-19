import { useEffect, useMemo, useState } from 'react'

import { activeToolsFromProjects, createActiveToolMetadata } from '../domain/logic/enabledTools'
import { getConfiguredAIService } from '../store/aiStore'
import { useLongTermMemoryStore } from '../store/longTermMemoryStore'
import { useEnabledToolsPanel } from './useEnabledToolsPanel'

type ToolTemplate = {
  activationPrompt?: string
  adapterId?: 'ai-progress' | 'generic'
  capabilityTags?: string[]
  description?: string
  id: string
  label: string
  routeTags?: string[]
  toolKind?: 'fitness' | 'agent-learning'
  toolName?: string
}

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

function templateToolName(tool: ToolTemplate): string {
  return tool.toolName ?? tool.label
}

export function useToolTemplateActivation(activeTemplate: ToolTemplate | null) {
  const activeToolsPanel = useEnabledToolsPanel()
  const goals = useLongTermMemoryStore((state) => state.goals)
  const projects = useLongTermMemoryStore((state) => state.projects)
  const createGoal = useLongTermMemoryStore((state) => state.createGoal)
  const createProject = useLongTermMemoryStore((state) => state.createProject)
  const error = useLongTermMemoryStore((state) => state.error)
  const isLoading = useLongTermMemoryStore((state) => state.isLoading)
  const loadOverview = useLongTermMemoryStore((state) => state.loadOverview)
  const activeTools = useMemo(
    () => activeToolsFromProjects(projects, goals),
    [goals, projects],
  )
  const [messages, setMessages] = useState<TemplateActivationMessage[]>([])
  const [aliasDraft, setAliasDraft] = useState('')
  const [activationResult, setActivationResult] = useState<TemplateActivationResult | null>(null)
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
    setLocalError(null)
    setStatus(null)
  }, [activeTemplate?.id])

  async function sendRequirement(content: string) {
    if (!activeTemplate) return

    const trimmed = content.trim()
    if (!trimmed) return

    const service = getConfiguredAIService()
    if (!service?.isAvailable()) {
      setLocalError('Selected AI provider is not configured.')
      return
    }

    const nextMessages = [...messages, { content: trimmed, role: 'user' as const }]
    setMessages(nextMessages)
    setIsActivating(true)
    setLocalError(null)
    setStatus(null)

    try {
      const result = await service.runToolActivation({
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
    } catch (activationError) {
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
        : activeTemplate.routeTags ?? [],
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
      const goal = await createGoal({
        description: activationResult.activationSummary,
        metadata,
        title: alias,
      })
      const project = await createProject({
        description: activationResult.activationSummary,
        goal_id: goal.goal_id,
        metadata,
        title: alias,
      })
      await loadOverview()
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
    createEnabledTool,
    error: localError ?? error,
    isActivating,
    isLoading,
    messages,
    sendRequirement,
    setAliasDraft,
    status,
  }
}
