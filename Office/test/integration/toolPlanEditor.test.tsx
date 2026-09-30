import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ToolPlanEditorDialog from '../../../src/components/tools/ToolPlanEditorDialog'
import type { ActiveToolPlanEditorValue } from '../../../src/hooks/useEnabledTools'

const value: ActiveToolPlanEditorValue = {
  activationSummary: 'Maintain the project',
  actions: [
    {
      actionId: 'action-1',
      dependsOn: [],
      dueDate: '2026-10-01',
      estimatedMinutes: 90,
      executionTier: 'standard',
      priority: 'high',
      title: 'Review architecture',
    },
  ],
  availableDays: ['mon', 'wed'],
  bufferPercent: 20,
  implementationPathText: '1. Review\n2. Improve',
  longTermGoalLabel: 'Maintain quality',
  routeTags: ['quality'],
  targetDate: null,
  toolFeatures: ['review'],
  weeklyCapacityMinutes: 240,
}

describe('active tool plan editor', () => {
  it('shows scheduling fields and blocks a required action with no date', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ToolPlanEditorDialog isOpen onClose={() => undefined} onSave={onSave} value={value} />)

    expect(screen.getByText('排程约束')).toBeInTheDocument()
    expect(screen.getByLabelText('每周容量（分钟）')).toHaveValue(240)
    expect(screen.getByLabelText('周一')).toBeChecked()
    const dueDate = screen.getByLabelText('计划日期')
    await user.clear(dueDate)
    expect(screen.getByText('必要行动需要计划日期。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存|Save/ })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('执行档位'), 'stretch')
    expect(screen.queryByText('必要行动需要计划日期。')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /保存|Save/ }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [expect.objectContaining({ dueDate: null, executionTier: 'stretch' })],
        targetDate: null,
      }),
    )
  })
})
