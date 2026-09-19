// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FisValidateModal from './FisValidateModal'
import verifiedFileJson from '../../data/fis-actions.verified.json'
import type { VerifiedFisActionsFile } from '../engine/fisTemplate'
import { getFisScenario } from '../lib/fisScenarios'

afterEach(() => cleanup())

const verifiedActions = (verifiedFileJson as unknown as VerifiedFisActionsFile).actions

describe('FisValidateModal', () => {
  it('shows the hypothesis, what-to-observe, and the "generated not executed" label', () => {
    render(
      <FisValidateModal
        isOpen
        onClose={vi.fn()}
        scenario={getFisScenario('single-instance')}
        targetTags={{ service: 'checkout' }}
        region="us-east-1"
        verifiedActions={verifiedActions}
      />,
    )
    expect(screen.getByText(getFisScenario('single-instance').hypothesis)).toBeInTheDocument()
    expect(screen.getByText(getFisScenario('single-instance').whatToObserve)).toBeInTheDocument()
    expect(screen.getByText(/generated, not executed/i)).toBeInTheDocument()
  })

  it('shows download buttons, a copy-CLI button, and the safety checklist for a valid scenario', () => {
    render(
      <FisValidateModal
        isOpen
        onClose={vi.fn()}
        scenario={getFisScenario('single-instance')}
        targetTags={{ service: 'checkout' }}
        region="us-east-1"
        verifiedActions={verifiedActions}
      />,
    )
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download cloudformation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download readme/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy cli command/i })).toBeInTheDocument()
    expect(screen.getByText(/running in non-production first/i)).toBeInTheDocument()
    expect(screen.getByText(/team has been told/i)).toBeInTheDocument()
  })

  it('shows an honest error instead of a broken UI when target tags are empty', () => {
    render(
      <FisValidateModal
        isOpen
        onClose={vi.fn()}
        scenario={getFisScenario('single-instance')}
        targetTags={{}}
        region="us-east-1"
        verifiedActions={verifiedActions}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/could not generate a template/i)
    expect(screen.queryByRole('button', { name: /download json/i })).not.toBeInTheDocument()
  })

  it('checklist items can be checked and unchecked', async () => {
    const user = userEvent.setup()
    render(
      <FisValidateModal
        isOpen
        onClose={vi.fn()}
        scenario={getFisScenario('single-instance')}
        targetTags={{ service: 'checkout' }}
        region="us-east-1"
        verifiedActions={verifiedActions}
      />,
    )
    const checkbox = screen.getByLabelText(/running in non-production first/i)
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <FisValidateModal
        isOpen
        onClose={onClose}
        scenario={getFisScenario('single-instance')}
        targetTags={{ service: 'checkout' }}
        region="us-east-1"
        verifiedActions={verifiedActions}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
