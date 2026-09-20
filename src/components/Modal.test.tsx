// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

afterEach(() => cleanup())

function Harness({ onCloseSpy }: { onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open modal</button>
      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false)
          onCloseSpy?.()
        }}
        title="Validate this in your account"
      >
        <button>First</button>
        <button>Second</button>
      </Modal>
    </div>
  )
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Why" children={<p>content</p>} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders as an accessible dialog when open', () => {
    render(<Modal isOpen onClose={vi.fn()} title="Validate this in your account" children={<p>content</p>} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Validate this in your account')).toBeInTheDocument()
  })

  it('moves focus into the modal on open and restores it to the trigger on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByText('Open modal')
    await user.click(trigger)
    expect(screen.getByLabelText('Close')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape and on overlay click', async () => {
    const onCloseSpy = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCloseSpy={onCloseSpy} />)
    await user.click(screen.getByText('Open modal'))
    await user.keyboard('{Escape}')
    expect(onCloseSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByText('Open modal'))
    const dialog = screen.getByRole('dialog')
    await user.click(dialog.previousSibling as Element)
    expect(onCloseSpy).toHaveBeenCalledTimes(2)
  })

  it('traps Tab focus within the modal, wrapping both directions', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open modal'))
    await user.tab() // -> First
    await user.tab() // -> Second
    expect(screen.getByText('Second')).toHaveFocus()
    await user.tab() // wraps -> Close
    expect(screen.getByLabelText('Close')).toHaveFocus()
    await user.tab({ shift: true }) // wraps back -> Second
    expect(screen.getByText('Second')).toHaveFocus()
  })
})
