import { useToolsPanel } from '../../hooks/useToolsPanel'
import Button from '../ui/Button'
import { TOOL_DEFINITIONS } from './registry'

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
        <div className="mt-3 flex flex-wrap gap-2">
          {TOOL_DEFINITIONS.map((tool) => (
            <button
              aria-pressed={activeToolId === tool.id}
              className={[
                'h-9 rounded-md border px-3 text-sm font-medium shadow-sm',
                activeToolId === tool.id
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
              key={tool.id}
              onClick={() => toolsPanel.setActiveToolId(tool.id)}
              type="button"
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {ActiveToolComponent ? <ActiveToolComponent /> : null}
    </aside>
  )
}
