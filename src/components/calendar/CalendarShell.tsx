import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'

import { useAIPanel } from '../../hooks/useAIPanel'
import { useCalendar } from '../../hooks/useCalendar'
import { useDragDrop } from '../../hooks/useDragDrop'
import { useEvents } from '../../hooks/useEvents'
import { useDebugPanel } from '../../hooks/useDebugPanel'
import { useTodoPanel } from '../../hooks/useTodoPanel'
import { useToolsPanel } from '../../hooks/useToolsPanel'
import CalendarHeader from './CalendarHeader'
import DayView from './DayView'
import AIAssistantPanel from '../ai/AIAssistantPanel'
import DebugPanel from '../debug/DebugPanel'
import EventDragOverlay from '../event/EventDragOverlay'
import EventModal from '../event/EventModal'
import MonthView from './MonthView'
import TodoPanel from '../todo/TodoPanel'
import ToolsPanel from '../tools/ToolsPanel'
import ViewSwitcher from './ViewSwitcher'
import WeekView from './WeekView'

export default function CalendarShell() {
  const calendar = useCalendar()
  const events = useEvents(calendar.visibleRange)
  const dragDrop = useDragDrop(events.visibleEvents)
  const aiPanel = useAIPanel()
  const debugPanel = useDebugPanel()
  const todoPanel = useTodoPanel()
  const toolsPanel = useToolsPanel()

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={dragDrop.handleDragCancel}
      onDragEnd={dragDrop.handleDragEnd}
      onDragStart={dragDrop.handleDragStart}
      sensors={dragDrop.sensors}
    >
      <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <CalendarHeader
            onNext={calendar.goToNext}
            onPrevious={calendar.goToPrev}
            onToday={calendar.goToToday}
            subtitle={calendar.subtitle}
            title={calendar.title}
          >
            <ViewSwitcher onViewChange={calendar.setView} view={calendar.view} />
            <button
              aria-pressed={aiPanel.isOpen}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={aiPanel.toggle}
              type="button"
            >
              AI Assistant
            </button>
            <button
              aria-pressed={todoPanel.isOpen}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={todoPanel.toggle}
              type="button"
            >
              Todos
            </button>
            <button
              aria-pressed={toolsPanel.isOpen && toolsPanel.activeToolId === 'settings'}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => {
                if (toolsPanel.isOpen && toolsPanel.activeToolId === 'settings') {
                  toolsPanel.close()
                  return
                }

                toolsPanel.open('settings')
              }}
              type="button"
            >
              Settings
            </button>
            <button
              aria-pressed={toolsPanel.isOpen}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={toolsPanel.toggle}
              type="button"
            >
              Tools
            </button>
            <button
              aria-pressed={debugPanel.isOpen}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={debugPanel.toggle}
              type="button"
            >
              Debug
            </button>
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

          <EventModal />
        </div>
        {aiPanel.isOpen ? <AIAssistantPanel /> : null}
        {todoPanel.isOpen ? <TodoPanel /> : null}
        {toolsPanel.isOpen ? <ToolsPanel /> : null}
        {debugPanel.isOpen ? <DebugPanel /> : null}
      </div>
      <DragOverlay>
        <EventDragOverlay event={dragDrop.activeEvent} />
      </DragOverlay>
    </DndContext>
  )
}
