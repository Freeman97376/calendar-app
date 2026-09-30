import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import Modal from '../../../../src/components/ui/Modal'

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open plan editor</button>
      <a href="#background">Background link</a>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Plan editor">
        <label>
          Plan name
          <input autoFocus />
        </label>
        <button>Save</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('traps keyboard focus and restores it after Escape closes the dialog', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    const opener = screen.getByRole('button', { name: 'Open plan editor' })
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Plan editor' })
    const input = screen.getByRole('textbox', { name: 'Plan name' })
    const save = screen.getByRole('button', { name: 'Save' })
    const close = screen.getByRole('button', { name: 'Close modal' })

    expect(dialog).toContainElement(input)
    expect(input).toHaveFocus()
    await user.tab()
    expect(save).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(input).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())
  })
})
