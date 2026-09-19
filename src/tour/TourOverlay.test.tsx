// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TourOverlay from './TourOverlay'
import type { TourController } from './useTour'
import type { TourStep } from './types'

vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
// jsdom doesn't implement scrollIntoView at all — the overlay calls it on every resolved target.
Element.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function makeController(overrides: Partial<TourController> = {}): TourController {
  return {
    status: 'playing',
    index: 0,
    steps: [],
    currentStep: null,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    ...overrides,
  }
}

describe('TourOverlay', () => {
  it('renders nothing while idle', () => {
    const { container } = render(<TourOverlay tour={makeController({ status: 'idle', currentStep: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns and skips (calls next) when a step\'s target selector matches nothing in the DOM', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const nextSpy = vi.fn()
    const step: TourStep = { id: 'missing-step', targetSelector: '#does-not-exist', caption: 'x', dwellMs: 1000 }

    render(<TourOverlay tour={makeController({ status: 'playing', currentStep: step, steps: [step], next: nextSpy })} />)

    await waitFor(() => expect(nextSpy).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing-step'))
    warnSpy.mockRestore()
  })

  it('renders the caption and does not skip when the target exists', async () => {
    const target = document.createElement('div')
    target.id = 'real-target'
    document.body.appendChild(target)
    const nextSpy = vi.fn()
    const step: TourStep = { id: 'ok-step', targetSelector: '#real-target', caption: 'Hello tour', dwellMs: 1000 }

    render(<TourOverlay tour={makeController({ status: 'playing', currentStep: step, steps: [step], next: nextSpy })} />)

    expect(await screen.findByText('Hello tour')).toBeInTheDocument()
    expect(nextSpy).not.toHaveBeenCalled()
  })

  it('a null targetSelector (end card) shows the caption without polling/skipping', async () => {
    const nextSpy = vi.fn()
    const step: TourStep = { id: 'end-card', targetSelector: null, caption: 'The end', dwellMs: 1000 }

    render(<TourOverlay tour={makeController({ status: 'playing', currentStep: step, steps: [step], next: nextSpy })} />)

    expect(await screen.findByText('The end')).toBeInTheDocument()
    expect(nextSpy).not.toHaveBeenCalled()
  })
})
