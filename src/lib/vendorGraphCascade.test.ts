import { describe, expect, it } from 'vitest'
import {
  counterValueAt,
  COUNTER_DURATION_MS,
  COUNTER_START_MS,
  isCascadeComplete,
  revealedVendorKeys,
  TOTAL_CASCADE_MS,
  VENDOR_STAGGER_MS,
} from './vendorGraphCascade'

describe('revealedVendorKeys', () => {
  it('reveals nothing at t=0 beyond the first vendor', () => {
    const revealed = revealedVendorKeys(['a', 'b', 'c'], 0)
    expect(revealed).toEqual(new Set(['a']))
  })

  it('reveals each vendor in order as time passes', () => {
    expect(revealedVendorKeys(['a', 'b', 'c'], VENDOR_STAGGER_MS)).toEqual(new Set(['a', 'b']))
    expect(revealedVendorKeys(['a', 'b', 'c'], VENDOR_STAGGER_MS * 2)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('reveals everything once enough time has passed', () => {
    expect(revealedVendorKeys(['a', 'b', 'c'], 100_000)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('returns an empty set for an empty vendor list', () => {
    expect(revealedVendorKeys([], 1000)).toEqual(new Set())
  })
})

describe('counterValueAt', () => {
  it('stays at 0 before the counter starts', () => {
    expect(counterValueAt(0, 100)).toBe(0)
    expect(counterValueAt(COUNTER_START_MS, 100)).toBe(0)
  })

  it('reaches the target once the counter duration elapses', () => {
    expect(counterValueAt(COUNTER_START_MS + COUNTER_DURATION_MS, 100)).toBe(100)
    expect(counterValueAt(COUNTER_START_MS + COUNTER_DURATION_MS * 10, 100)).toBe(100) // clamped, not overshooting
  })

  it('is monotonically non-decreasing toward the target', () => {
    const samples = [0, 100, 300, 600, 900, 1200, 1800].map((ms) => counterValueAt(COUNTER_START_MS + ms, 50))
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1])
  })

  it('handles a zero target without dividing by zero or going negative', () => {
    expect(counterValueAt(COUNTER_START_MS + 500, 0)).toBe(0)
  })
})

describe('isCascadeComplete', () => {
  it('is false before TOTAL_CASCADE_MS and true at/after it', () => {
    expect(isCascadeComplete(TOTAL_CASCADE_MS - 1)).toBe(false)
    expect(isCascadeComplete(TOTAL_CASCADE_MS)).toBe(true)
  })
})
