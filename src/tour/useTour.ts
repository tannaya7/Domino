import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import type { TourStatus, TourStep } from './types'

export interface TourController {
  status: TourStatus
  index: number
  steps: TourStep[]
  currentStep: TourStep | null
  start: (steps: TourStep[]) => void
  stop: () => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
}

/**
 * Owns the tour's play/pause/step state and its keyboard controls. Deliberately holds no DOM
 * knowledge (spotlight positioning, target resolution) — that's TourOverlay's job — so this hook
 * stays testable with `renderHook` and no jsdom canvas/ResizeObserver setup.
 */
export function useTour(): TourController {
  const [status, setStatus] = useState<TourStatus>('idle')
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const restoreFocus = () => {
    const toFocus = restoreFocusRef.current
    restoreFocusRef.current = null
    // Deferred a tick: the overlay unmounting (status -> idle happens first) can itself steal
    // focus back to <body> before this runs if called synchronously in the same flush.
    if (toFocus) setTimeout(() => toFocus.focus?.(), 0)
  }

  const stop = useCallback(() => {
    setStatus('idle')
    setSteps([])
    setIndex(0)
    restoreFocus()
  }, [])

  const start = useCallback((newSteps: TourStep[]) => {
    if (newSteps.length === 0) return
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    setSteps(newSteps)
    setIndex(0)
    // Reduced motion = manual stepping only: start paused on step 1 rather than auto-dwelling.
    setStatus(prefersReducedMotion() ? 'paused' : 'playing')
    newSteps[0]?.run?.()
  }, [])

  const next = useCallback(() => {
    setIndex((i) => {
      const nextIndex = i + 1
      if (nextIndex >= steps.length) {
        // Ran past the last step — end cleanly rather than looping or going out of bounds.
        setStatus('idle')
        setSteps([])
        restoreFocus()
        return 0
      }
      steps[nextIndex]?.run?.()
      return nextIndex
    })
  }, [steps])

  const prev = useCallback(() => {
    setIndex((i) => {
      const prevIndex = Math.max(0, i - 1)
      steps[prevIndex]?.run?.()
      return prevIndex
    })
  }, [steps])

  const pause = useCallback(() => setStatus((s) => (s === 'playing' ? 'paused' : s)), [])
  const resume = useCallback(() => setStatus((s) => (s === 'paused' ? 'playing' : s)), [])

  // Dwell timer: auto-advance while playing. Never runs while paused/idle, and reduced-motion
  // never reaches 'playing' in the first place (see start()).
  useEffect(() => {
    if (status !== 'playing') return
    const current = steps[index]
    if (!current) return
    const timer = setTimeout(next, current.dwellMs)
    return () => clearTimeout(timer)
  }, [status, index, steps, next])

  // Keyboard controls — only listening while the tour is actually active, so it never shadows the
  // rest of the app's own keyboard handling when idle.
  useEffect(() => {
    if (status === 'idle') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        stop()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        setStatus((s) => (s === 'playing' ? 'paused' : 'playing'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status, next, prev, stop])

  return { status, index, steps, currentStep: steps[index] ?? null, start, stop, pause, resume, next, prev }
}

/** A stable, inert TourController for components that accept `tour` as an optional prop (e.g. in
 * tests, or anywhere a real App.tsx-owned tour isn't wired up) — every action is a safe no-op. */
export const IDLE_TOUR_CONTROLLER: TourController = {
  status: 'idle',
  index: 0,
  steps: [],
  currentStep: null,
  start: () => {},
  stop: () => {},
  pause: () => {},
  resume: () => {},
  next: () => {},
  prev: () => {},
}
