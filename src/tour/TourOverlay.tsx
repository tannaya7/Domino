import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { resolveTargetElement } from './resolveTarget'
import type { TourController } from './useTour'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function measureRect(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

const SPOTLIGHT_PADDING = 8

interface TourOverlayProps {
  tour: TourController
}

/**
 * Renders nothing while idle. While active: a spotlight ring around the current step's target
 * (position/size re-measured on resize/scroll — a resize must never leave a stale or missing
 * spotlight, see the tour's robustness requirement) plus a bottom-center caption bar with
 * progress dots and Prev/Pause/Next/Skip. A step whose target never appears in the DOM (polled via
 * resolveTargetElement) is skipped automatically with a console warning — never silently spotlights
 * nothing, never crashes.
 */
function TourOverlay({ tour }: TourOverlayProps) {
  const { status, currentStep, index, steps, next, prev, stop, pause, resume } = tour
  const [rect, setRect] = useState<Rect | null>(null)
  const requestIdRef = useRef(0)
  const reduceMotion = prefersReducedMotion()

  useEffect(() => {
    if (status === 'idle' || !currentStep) {
      setRect(null)
      return
    }
    if (!currentStep.targetSelector) {
      setRect(null)
      return
    }
    const requestId = ++requestIdRef.current
    let cancelled = false
    const selector = currentStep.targetSelector
    const stepId = currentStep.id
    void resolveTargetElement(selector).then((el) => {
      if (cancelled || requestIdRef.current !== requestId) return
      if (!el) {
        console.warn(`[tour] step "${stepId}" target "${selector}" was not found in the DOM — skipping it.`)
        next()
        return
      }
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' })
      setRect(measureRect(el))
    })
    return () => {
      cancelled = true
    }
    // Re-runs only when the step itself changes — `next` is stable-ish per steps array and
    // re-including it would re-trigger this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentStep?.id, currentStep?.targetSelector])

  // Keep the spotlight glued to its target across resize/scroll — a plain re-measure, never the
  // missing-target skip logic above, so a transient layout shift can't accidentally skip a step.
  useEffect(() => {
    if (status === 'idle' || !currentStep?.targetSelector) return
    const selector = currentStep.targetSelector
    function reMeasure() {
      const el = document.querySelector(selector)
      if (el) setRect(measureRect(el))
    }
    window.addEventListener('resize', reMeasure)
    window.addEventListener('scroll', reMeasure, true)
    return () => {
      window.removeEventListener('resize', reMeasure)
      window.removeEventListener('scroll', reMeasure, true)
    }
  }, [status, currentStep])

  if (status === 'idle' || !currentStep) return null

  const spotlightRect = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 }

  const controlButtonClass =
    'rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50" role="presentation" data-testid="tour-overlay">
      <div
        className={`pointer-events-none fixed rounded-lg ring-2 ring-[var(--accent)] ${reduceMotion ? '' : 'transition-all duration-300 ease-out'}`}
        style={{ ...spotlightRect, boxShadow: '0 0 0 9999px rgba(6,7,10,0.75)' }}
        data-testid="tour-spotlight"
      />

      <div className="pointer-events-auto fixed bottom-6 left-1/2 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}
            />
          ))}
        </div>

        <p aria-live="polite" className="mb-3 text-center text-sm text-[var(--text-primary)]">
          {currentStep.caption}
        </p>

        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={prev} disabled={index === 0} className={controlButtonClass}>
            Prev
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => (status === 'playing' ? pause() : resume())} className={controlButtonClass}>
              {status === 'playing' ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={next} className={controlButtonClass}>
              {index === steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
          <button type="button" onClick={stop} className={controlButtonClass}>
            Skip
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">← → to navigate · Space to pause · Esc to exit</p>
      </div>
    </div>
  )
}

export default TourOverlay
