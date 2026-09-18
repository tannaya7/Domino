import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/** Animates from the previous value to `value` via requestAnimationFrame easing. Jumps instantly under prefers-reduced-motion. */
export function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return

    // A non-animatable case (reduced motion, or a non-finite from/to) collapses to duration 0 —
    // one path handles both, and every setDisplay call stays inside the rAF-scheduled tick below
    // rather than firing synchronously in the effect body.
    const effectiveDuration =
      prefersReducedMotion() || !Number.isFinite(to) || !Number.isFinite(from) ? 0 : durationMs
    const start = performance.now()
    let frame: number

    function tick(now: number) {
      const elapsed = now - start
      const t = effectiveDuration <= 0 ? 1 : Math.min(1, elapsed / effectiveDuration)
      const eased = 1 - (1 - t) * (1 - t)
      setDisplay(t >= 1 ? to : from + (to - from) * eased)
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])

  return display
}
