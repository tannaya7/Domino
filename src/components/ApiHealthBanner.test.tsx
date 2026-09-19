// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiHealthBanner from './ApiHealthBanner'

const checkApiHealthMock = vi.fn()
vi.mock('../lib/api', () => ({ checkApiHealth: (...args: unknown[]) => checkApiHealthMock(...args) }))

afterEach(() => {
  cleanup()
  checkApiHealthMock.mockReset()
})

describe('ApiHealthBanner', () => {
  it('renders nothing while the first health check is in flight', () => {
    checkApiHealthMock.mockReturnValue(new Promise(() => {})) // never resolves
    render(<ApiHealthBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders nothing once the API is confirmed reachable', async () => {
    checkApiHealthMock.mockResolvedValue(true)
    render(<ApiHealthBanner />)
    await waitFor(() => expect(checkApiHealthMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the fallback message once the API is confirmed unreachable', async () => {
    checkApiHealthMock.mockResolvedValue(false)
    render(<ApiHealthBanner />)
    expect(await screen.findByRole('status')).toHaveTextContent(/API unreachable/i)
    expect(screen.getByText(/example snapshots still work/i)).toBeInTheDocument()
  })

  it('can be dismissed', async () => {
    checkApiHealthMock.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<ApiHealthBanner />)
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
