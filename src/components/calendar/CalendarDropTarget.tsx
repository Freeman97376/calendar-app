import { useDroppable } from '@dnd-kit/core'
import type { HTMLAttributes, ReactNode } from 'react'

import { getDropTargetId, type CalendarDropTarget } from '../../hooks/useDragDrop'

type CalendarDropTargetProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  target: CalendarDropTarget
}

export default function CalendarDropTarget({
  children,
  className = '',
  target,
  ...props
}: CalendarDropTargetProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: getDropTargetId(target),
    data: {
      type: 'calendar-drop-target',
      target,
    },
  })

  return (
    <div
      {...props}
      className={[
        className,
        isOver ? 'outline outline-2 outline-offset-[-2px] outline-emerald-500' : '',
      ].join(' ')}
      data-testid={getDropTargetId(target)}
      ref={setNodeRef}
    >
      {children}
    </div>
  )
}
