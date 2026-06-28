import { useToolsPanel } from '../../hooks/useToolsPanel'
import Button from '../ui/Button'
import { TOOL_DEFINITIONS } from './registry'
import type { ToolDefinition } from './types'

const categoryLabels: Record<NonNullable<ToolDefinition['category']>, string> = {
  'ai-demo': 'AI Demo',
  planning: 'Planning',
  system: 'System',
}

function groupedTools() {
  const groups: Array<{
    category: NonNullable<ToolDefinition['category']>
    tools: ToolDefinition[]
  }> = [
    { category: 'ai-demo', tools: [] },
    { category: 'planning', tools: [] },
    { category: 'system', tools: [] },
  ]

  for (const tool of TOOL_DEFINITIONS) {
    const category = tool.category ?? 'planning'
    groups.find((group) => group.category === category)?.tools.push(tool)
  }

  return groups.filter((group) => group.tools.length)
}

export default function ToolsPanel() {
  const toolsPanel = useToolsPanel()
  const activeToolId = toolsPanel.activeToolId || TOOL_DEFINITIONS[0]?.id
  const activeTool =
    TOOL_DEFINITIONS.find((tool) => tool.id === activeToolId) ?? TOOL_DEFINITIONS[0]
  const ActiveToolComponent = activeTool?.Component

  return (
    <aside
      aria-label="Tools"
      className="flex w-full flex-col border-t border-slate-200 bg-white xl:max-w-md xl:border-l xl:border-t-0"
    >
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">Tools</h2>
          <Button onClick={toolsPanel.close} variant="ghost">
            Close
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {groupedTools().map((group) => (
            <div key={group.category}>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                {categoryLabels[group.category]}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.tools.map((tool) => (
                  <button
                    aria-pressed={activeToolId === tool.id}
                    className={[
                      'min-h-9 rounded-md border px-3 py-2 text-left text-sm font-medium shadow-sm',
                      activeToolId === tool.id
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                    key={tool.id}
                    onClick={() => toolsPanel.setActiveToolId(tool.id)}
                    title={tool.description}
                    type="button"
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {ActiveToolComponent ? <ActiveToolComponent /> : null}
    </aside>
  )
}
