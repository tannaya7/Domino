// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Drawer from './Drawer'

afterEach(() => cleanup())

/** A trigger button that opens the drawer — lets tests exercise real "focus restored to trigger". */
function Harness({ onCloseSpy }: { onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open drawer</button>
      <Drawer
        isOpen={open}
        onClose={() => {
          setOpen(false)
          onCloseSpy?.()
        }}
        title="Why this number"
      >
        <button>First</button>
        <button>Second</button>
      </Drawer>
    </div>
  )
}

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    render(<Drawer isOpen={false} onClose={vi.fn()} title="Why" children={<p>content</p>} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders as an accessible dialog when open', () => {
    render(<Drawer isOpen onClose={vi.fn()} title="Why this number" children={<p>content</p>} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Why this number')).toBeInTheDocument()
  })

  it('moves focus into the drawer (first focusable element) on open', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open drawer'))
    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('restores focus to the triggering element on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByText('Open drawer')
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const onCloseSpy = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCloseSpy={onCloseSpy} />)
    await user.click(screen.getByText('Open drawer'))
    await user.keyboard('{Escape}')
    expect(onCloseSpy).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when clicking the overlay', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open drawer'))
    const dialog = screen.getByRole('dialog')
    // The overlay is the dialog's previous sibling — click it directly.
    await user.click(dialog.previousSibling as Element)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab focus within the drawer — wraps from last back to first', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open drawer'))
    // Close, First, Second are the 3 focusables; Close has focus already.
    await user.tab() // -> First
    await user.tab() // -> Second
    expect(screen.getByText('Second')).toHaveFocus()
    await user.tab() // wraps -> Close
    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('traps Shift+Tab focus within the drawer — wraps from first back to last', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open drawer'))
    expect(screen.getByLabelText('Close')).toHaveFocus()
    await user.tab({ shift: true }) // wraps -> Second (the last focusable)
    expect(screen.getByText('Second')).toHaveFocus()
  })
})
