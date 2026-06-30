import { useWorkspacePanel, type WorkspacePanelId } from '../../hooks/useWorkspacePanel'
import { useI18n } from '../../hooks/useI18n'
import AIAssistantPanel from '../ai/AIAssistantPanel'
import DebugPanel from '../debug/DebugPanel'
import EventDetailsPanel from '../event/EventDetailsPanel'
import SettingsPanel from '../settings/SettingsPanel'
import TodoPanel from '../todo/TodoPanel'
import EnabledToolsPanel from '../tools/EnabledToolsPanel'
import ToolsPanel from '../tools/ToolsPanel'
import Button from '../ui/Button'

type WorkspacePanelProps = {
  compact?: boolean
  mode?: 'content' | 'drawer'
}

const panelTitleKeys: Record<WorkspacePanelId, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  ai: 'panel.ai',
  debug: 'panel.debug',
  'enabled-tools': 'panel.enabledTools',
  'event-details': 'panel.eventDetails',
  home: 'panel.home',
  settings: 'panel.settings',
  todos: 'panel.todos',
  tools: 'panel.toolTemplates',
}

const entries: Array<{
  descriptionKey: Parameters<ReturnType<typeof useI18n>['t']>[0]
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]
  panel: WorkspacePanelId
}> = [
  {
    descriptionKey: 'workspace.entryAiDescription',
    labelKey: 'panel.ai',
    panel: 'ai',
  },
  {
    descriptionKey: 'workspace.entryTodosDescription',
    labelKey: 'panel.todos',
    panel: 'todos',
  },
  {
    descriptionKey: 'workspace.entryToolsDescription',
    labelKey: 'panel.tools',
    panel: 'tools',
  },
  {
    descriptionKey: 'workspace.entryEnabledToolsDescription',
    labelKey: 'panel.enabledTools',
    panel: 'enabled-tools',
  },
  {
    descriptionKey: 'workspace.entrySettingsDescription',
    labelKey: 'panel.settings',
    panel: 'settings',
  },
  {
    descriptionKey: 'workspace.entryDebugDescription',
    labelKey: 'panel.debug',
    panel: 'debug',
  },
]

function WorkspaceHome() {
  const { openPanel } = useWorkspacePanel()
  const { t } = useI18n()

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-950">{t('panel.home')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('workspace.homeDescription')}</p>
      </div>
      <div className="grid gap-2">
        {entries.map((entry) => {
          const label = t(entry.labelKey)

          return (
            <button
              aria-label={label}
              className="rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm hover:bg-slate-50"
              key={entry.panel}
              onClick={() => openPanel(entry.panel)}
              type="button"
            >
              <span className="block text-sm font-semibold text-slate-950">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                {t(entry.descriptionKey)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WorkspaceDrawer() {
  const { activePanel, focusPanel, mainMode, openPanel, showCalendar } = useWorkspacePanel()
  const { t } = useI18n()
  const panelTitle = t(panelTitleKeys[activePanel])
  const panelIsFocused = activePanel !== 'home' && mainMode === 'panel'
  const calendarIsVisible = mainMode === 'calendar'

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-950">
          {activePanel === 'home' ? t('panel.home') : panelTitle}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {activePanel === 'home'
            ? t('workspace.drawerDescription')
            : panelIsFocused
              ? t('workspace.drawerFocused')
              : t('workspace.drawerCalendarVisible')}
        </p>
        {activePanel !== 'home' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {calendarIsVisible ? (
              <Button onClick={focusPanel} variant="secondary">
                {t('workspace.focusPanel')}
              </Button>
            ) : (
              <Button onClick={showCalendar} variant="secondary">
                {t('workspace.showCalendar')}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-950">{t('panel.home')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('workspace.switchDescription')}</p>
      </div>
      <div className="grid gap-2">
        {entries.map((entry) => {
          const label = t(entry.labelKey)

          return (
            <button
              aria-current={entry.panel === activePanel ? 'page' : undefined}
              aria-label={label}
              className={[
                'rounded-md border p-3 text-left shadow-sm',
                entry.panel === activePanel
                  ? 'border-emerald-700 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              ].join(' ')}
              key={entry.panel}
              onClick={() => openPanel(entry.panel)}
              type="button"
            >
              <span className="block text-sm font-semibold text-slate-950">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                {t(entry.descriptionKey)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WorkspacePanelContent({ panel }: { panel: WorkspacePanelId }) {
  if (panel === 'ai') return <AIAssistantPanel />
  if (panel === 'todos') return <TodoPanel />
  if (panel === 'tools') return <ToolsPanel />
  if (panel === 'enabled-tools') return <EnabledToolsPanel />
  if (panel === 'settings') return <SettingsPanel />
  if (panel === 'debug') return <DebugPanel />
  if (panel === 'event-details') return <EventDetailsPanel />

  return <WorkspaceHome />
}

export default function WorkspacePanel({ compact = false, mode = 'content' }: WorkspacePanelProps) {
  const { activePanel, canGoBack, close, goBack, mainMode } = useWorkspacePanel()
  const { t } = useI18n()
  const isDrawer = mode === 'drawer'

  return (
    <aside
      aria-label={t('panel.home')}
      className={[
        'flex min-h-0 min-w-0 flex-col border-slate-200 bg-white',
        compact ? 'border-t' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">
            {isDrawer && mainMode === 'panel' ? t('workspace.drawer') : t(panelTitleKeys[activePanel])}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isDrawer ? t('workspace.navigationAndContext') : t('workspace.navigationAndDetails')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canGoBack ? (
            <Button onClick={goBack} variant="ghost">
              {t('workspace.back')}
            </Button>
          ) : null}
          {activePanel !== 'home' ? (
            <Button onClick={close} variant="ghost">
              {t('workspace.close')}
            </Button>
          ) : null}
        </div>
      </div>
      {isDrawer ? <WorkspaceDrawer /> : <WorkspacePanelContent panel={activePanel} />}
    </aside>
  )
}
