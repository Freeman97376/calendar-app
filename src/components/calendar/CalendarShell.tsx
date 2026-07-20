import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { useCalendar } from '../../hooks/useCalendar'
import { useDragDrop } from '../../hooks/useDragDrop'
import { useEvents } from '../../hooks/useEvents'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig'
import { useWorkspacePanel } from '../../hooks/useWorkspacePanel'
import CalendarHeader from './CalendarHeader'
import DayView from './DayView'
import EventDragOverlay from '../event/EventDragOverlay'
import MonthView from './MonthView'
import ViewSwitcher from './ViewSwitcher'
import WeekView from './WeekView'
import ApprovalDrawer from '../workspace/ApprovalDrawer'
import WorkspacePanel, { WorkspacePanelContent } from '../workspace/WorkspacePanel'

type LayoutStyle = CSSProperties & {
  '--workspace-panel-size': string
}

function shellClass(position: 'left' | 'right' | 'top' | 'bottom'): string {
  const base =
    'flex min-h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm'

  if (position === 'left') return `${base} flex-col xl:flex-row`
  if (position === 'right') return `${base} flex-col xl:flex-row-reverse`
  if (position === 'bottom') return `${base} flex-col-reverse`

  return `${base} flex-col`
}

function workspaceFrameClass(position: 'left' | 'right' | 'top' | 'bottom'): string {
  const base = 'min-h-0 min-w-0 shrink-0 bg-white'

  if (position === 'left')
    return `${base} h-80 border-t border-slate-200 xl:h-auto xl:border-r xl:border-t-0 xl:[width:var(--workspace-panel-size)]`
  if (position === 'right')
    return `${base} h-80 border-t border-slate-200 xl:h-auto xl:border-l xl:border-t-0 xl:[width:var(--workspace-panel-size)]`
  if (position === 'bottom')
    return `${base} border-t border-slate-200 [height:var(--workspace-panel-size)]`

  return `${base} border-b border-slate-200 [height:var(--workspace-panel-size)]`
}

export default function CalendarShell() {
  const calendar = useCalendar()
  const events = useEvents(calendar.visibleRange)
  const dragDrop = useDragDrop(events.visibleEvents)
  const runtimeConfig = useRuntimeConfig()
  const workspace = useWorkspacePanel()
  const position = runtimeConfig.layoutPanelPosition
  const calendarVisible = workspace.mainMode === 'calendar'
  const layoutStyle: LayoutStyle = {
    '--workspace-panel-size': `${runtimeConfig.layoutPanelSizePercent}%`,
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={dragDrop.handleDragCancel}
      onDragEnd={dragDrop.handleDragEnd}
      onDragStart={dragDrop.handleDragStart}
      sensors={dragDrop.sensors}
    >
      <div
        className={shellClass(position)}
        data-layout-position={position}
        data-testid="calendar-workspace-shell"
        style={layoutStyle}
      >
        <div className={workspaceFrameClass(position)}>
          <WorkspacePanel
            compact={position === 'left' || position === 'right'}
            mode={calendarVisible ? 'content' : 'drawer'}
          />
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col bg-white"
          data-testid={calendarVisible ? 'calendar-main-area' : 'workspace-main-area'}
        >
          {calendarVisible ? (
            <>
              <CalendarHeader
                onNext={calendar.goToNext}
                onPrevious={calendar.goToPrev}
                onToday={calendar.goToToday}
                subtitle={calendar.subtitle}
                title={calendar.title}
              >
                <ViewSwitcher onViewChange={calendar.setView} view={calendar.view} />
              </CalendarHeader>

              {events.isLoading ? (
                <div
                  aria-live="polite"
                  className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
                >
                  Loading events...
                </div>
              ) : null}

              {calendar.view === 'month' ? (
                <MonthView
                  eventsByDate={events.eventsByDate}
                  onSelectDate={events.openCreateEvent}
                  onSelectEvent={events.openEditEvent}
                  weeks={calendar.monthGrid}
                />
              ) : null}

              {calendar.view === 'week' ? (
                <WeekView
                  days={calendar.weekDays}
                  eventsByDate={events.eventsByDate}
                  onSelectDate={events.openCreateEvent}
                  onSelectEvent={events.openEditEvent}
                />
              ) : null}

              {calendar.view === 'day' ? (
                <DayView
                  day={calendar.day}
                  eventsByDate={events.eventsByDate}
                  onSelectDate={events.openCreateEvent}
                  onSelectEvent={events.openEditEvent}
                />
              ) : null}
            </>
          ) : (
            <WorkspacePanelContent panel={workspace.activePanel} />
          )}
        </div>
      </div>
      <DragOverlay>
        <EventDragOverlay event={dragDrop.activeEvent} />
      </DragOverlay>
      <ApprovalDrawer />
    </DndContext>
  )
}
