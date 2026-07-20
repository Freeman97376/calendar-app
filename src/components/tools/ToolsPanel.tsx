import { useMemo, useState, type FormEvent } from 'react'

import { useI18n } from '../../hooks/useI18n'
import { useToolTemplateActivation } from '../../hooks/useToolTemplateActivation'
import { useToolsPanel } from '../../hooks/useToolsPanel'
import Button from '../ui/Button'
import { TOOL_DEFINITIONS } from './registry'
import type { ToolDefinition } from './types'

const categoryLabelKeys: Record<
  NonNullable<ToolDefinition['category']>,
  Parameters<ReturnType<typeof useI18n>['t']>[0]
> = {
  'ai-demo': 'tools.aiDemo',
  planning: 'tools.planning',
  system: 'tools.system',
}

function instantiableTools() {
  return TOOL_DEFINITIONS.filter(
    (tool) => tool.category !== 'system' && tool.instantiable !== false,
  )
}

function groupedTemplates() {
  const groups: Array<{
    category: NonNullable<ToolDefinition['category']>
    tools: ToolDefinition[]
  }> = [
    { category: 'ai-demo', tools: [] },
    { category: 'planning', tools: [] },
  ]

  for (const tool of instantiableTools()) {
    const category = tool.category ?? 'planning'
    groups.find((group) => group.category === category)?.tools.push(tool)
  }

  return groups.filter((group) => group.tools.length)
}

function templateToolName(tool: ToolDefinition): string {
  return tool.toolName ?? tool.label
}

function defaultPrompt(tool: ToolDefinition, t: ReturnType<typeof useI18n>['t']): string {
  return tool.activationPrompt ?? t('tools.defaultPrompt', { label: tool.label })
}

export default function ToolsPanel() {
  const { t } = useI18n()
  const toolsPanel = useToolsPanel()
  const templates = useMemo(() => instantiableTools(), [])
  const activeSystemTool = TOOL_DEFINITIONS.find(
    (tool) => tool.category === 'system' && tool.id === toolsPanel.activeToolId,
  )
  const activeTemplate =
    templates.find((tool) => tool.id === toolsPanel.activeToolId) ?? templates[0] ?? null
  const ActiveSystemComponent = activeSystemTool?.Component
  const activation = useToolTemplateActivation(activeSystemTool ? null : activeTemplate)
  const [draft, setDraft] = useState('')

  async function runActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return

    setDraft('')
    await activation.sendRequirement(content)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{t('tools.header')}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {activeSystemTool ? activeSystemTool.label : t('tools.templateLibrary')}
            </p>
          </div>
        </div>
      </div>

      {ActiveSystemComponent ? (
        <ActiveSystemComponent />
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          <section className="space-y-3">
            {groupedTemplates().map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  {t(categoryLabelKeys[group.category])}
                </p>
                <div className="grid gap-2">
                  {group.tools.map((tool) => (
                    <button
                      aria-label={tool.label}
                      aria-pressed={activeTemplate?.id === tool.id}
                      className={[
                        'rounded-md border p-3 text-left shadow-sm',
                        activeTemplate?.id === tool.id
                          ? 'border-emerald-700 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50',
                      ].join(' ')}
                      key={tool.id}
                      onClick={() => toolsPanel.setActiveToolId(tool.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {tool.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">{tool.description}</p>
                        </div>
                        <span className="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-600">
                          {templateToolName(tool)}
                        </span>
                      </div>
                      {tool.capabilityTags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tool.capabilityTags.map((tag) => (
                            <span
                              className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {activeTemplate ? (
            <section className="space-y-3 border-t border-slate-200 pt-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  {t('tools.configure', { label: activeTemplate.label })}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {defaultPrompt(activeTemplate, t)}
                </p>
              </div>

              <div className="space-y-2">
                {activation.messages.length ? (
                  activation.messages.map((message, index) => (
                    <article
                      className={[
                        'rounded-md border p-3',
                        message.role === 'assistant'
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-950'
                          : 'border-slate-200 bg-white text-slate-700',
                      ].join(' ')}
                      key={`${message.role}-${index}`}
                    >
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        {message.role === 'assistant'
                          ? t('tools.templateAssistant')
                          : t('tools.you')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    {t('tools.startDescribe')}
                  </p>
                )}
              </div>

              <form className="space-y-2" onSubmit={(event) => void runActivation(event)}>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="tool-template-message"
                >
                  {t('tools.requirements')}
                </label>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  disabled={activation.isActivating}
                  id="tool-template-message"
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={defaultPrompt(activeTemplate, t)}
                  value={draft}
                />
                <Button
                  disabled={activation.isActivating || !draft.trim()}
                  type="submit"
                  variant="primary"
                >
                  {activation.isActivating ? t('tools.confirming') : t('tools.sendRequirement')}
                </Button>
              </form>

              {activation.activationResult ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                  <div>
                    <label
                      className="block text-sm font-medium text-slate-700"
                      htmlFor="enabled-tool-alias"
                    >
                      {t('tools.enabledToolAlias')}
                    </label>
                    <input
                      className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                      id="enabled-tool-alias"
                      onChange={(event) => activation.setAliasDraft(event.target.value)}
                      value={activation.aliasDraft}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {t('tools.toolName')}
                    </p>
                    <p className="mt-1 text-sm text-slate-800">
                      {templateToolName(activeTemplate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {t('tools.activationSummary')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {activation.activationResult.activationSummary}
                    </p>
                  </div>
                  {activation.activationResult.routeTags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {activation.activationResult.routeTags.map((tag) => (
                        <span
                          className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {activation.activationResult.warnings.length ? (
                    <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                      {activation.activationResult.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    disabled={!activation.aliasDraft.trim()}
                    onClick={() => void activation.createEnabledTool()}
                    variant="primary"
                  >
                    {t('tools.createEnabledTool')}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {activation.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {activation.error}
            </p>
          ) : null}
          {activation.status ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {activation.status}
            </p>
          ) : null}
          {activation.isLoading ? (
            <p className="text-sm text-slate-500">{t('tools.loadingTemplates')}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
