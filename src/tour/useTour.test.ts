// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTour } from './useTour'
import type { TourStep } from './types'

vi.mock('../lib/motion', () => ({ prefersReducedMotion: vi.fn(() => false) }))
import { prefersReducedMotion } from '../lib/motion'

function makeSteps(n: number): TourStep[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, targetSelector: null, caption: `caption ${i}`, dwellMs: 100_000 }))
}

afterEach(() => {
  vi.mocked(prefersReducedMotion).mockReturnValue(false)
  document.body.innerHTML = ''
})

describe('useTour', () => {
  it('starts idle with no current step', () => {
    const { result } = renderHook(() => useTour())
    expect(result.current.status).toBe('idle')
    expect(result.current.currentStep).toBeNull()
  })

  it('start() begins playing at step 0 and fires that step\'s run()', () => {
    const run0 = vi.fn()
    const steps = makeSteps(3)
    steps[0].run = run0
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(steps))
    expect(result.current.status).toBe('playing')
    expect(result.current.index).toBe(0)
    expect(run0).toHaveBeenCalledTimes(1)
  })

  it('reduced motion starts paused on step 1 instead of auto-playing (manual stepping only)', () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(true)
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(3)))
    expect(result.current.status).toBe('paused')
    expect(result.current.index).toBe(0)
  })

  it('ArrowRight/ArrowLeft advance and rewind the step index', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(3)))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
    expect(result.current.index).toBe(1)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })))
    expect(result.current.index).toBe(0)
  })

  it('space toggles pause/resume', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(3)))
    expect(result.current.status).toBe('playing')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })))
    expect(result.current.status).toBe('paused')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })))
    expect(result.current.status).toBe('playing')
  })

  it('next() past the last step ends the tour cleanly (status -> idle, steps cleared)', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(2)))
    act(() => result.current.next())
    expect(result.current.index).toBe(1)
    act(() => result.current.next())
    expect(result.current.status).toBe('idle')
    expect(result.current.steps).toEqual([])
  })

  it('Esc ends the tour immediately: status -> idle, steps cleared, no dangling current step', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(3)))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
    expect(result.current.index).toBe(1)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

    expect(result.current.status).toBe('idle')
    expect(result.current.steps).toEqual([])
    expect(result.current.currentStep).toBeNull()
  })

  it('restores focus to the previously-focused element after Esc', async () => {
    vi.useFakeTimers()
    try {
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()
      expect(document.activeElement).toBe(button)

      const { result } = renderHook(() => useTour())
      act(() => result.current.start(makeSteps(2)))

      const overlayButton = document.createElement('button')
      document.body.appendChild(overlayButton)
      overlayButton.focus()
      expect(document.activeElement).toBe(overlayButton)

      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      act(() => vi.runAllTimers())

      expect(document.activeElement).toBe(button)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops listening for keyboard input once idle again — Esc after stop is a no-op', () => {
    const { result } = renderHook(() => useTour())
    act(() => result.current.start(makeSteps(2)))
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    // Should not throw or change state further.
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(result.current.status).toBe('idle')
  })
})
