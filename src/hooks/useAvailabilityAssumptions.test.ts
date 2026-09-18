// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultAssumptions, useAvailabilityAssumptions } from './useAvailabilityAssumptions'

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('useAvailabilityAssumptions', () => {
  it('starts from illustrative defaults when nothing is stored', () => {
    const { result } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    expect(result.current.assumptions).toEqual(defaultAssumptions())
  })

  it('persists an edit to localStorage under a repo-scoped key', () => {
    const { result } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    act(() => {
      result.current.setAssumptions({ ...result.current.assumptions, costPerHour: 999 })
    })
    const raw = localStorage.getItem('blast-radius:availability-assumptions:v1:https://github.com/o/r')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).costPerHour).toBe(999)
  })

  it('loads a previously persisted value on next mount for the same repo', () => {
    const { result: first } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    act(() => {
      first.current.setAssumptions({ ...first.current.assumptions, costPerHour: 777, currency: 'INR' })
    })

    const { result: second } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    expect(second.current.assumptions.costPerHour).toBe(777)
    expect(second.current.assumptions.currency).toBe('INR')
  })

  it('keeps assumptions separate per repo', () => {
    const { result: repoA } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/a', vi.fn()))
    act(() => repoA.current.setAssumptions({ ...repoA.current.assumptions, costPerHour: 111 }))

    const { result: repoB } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/b', vi.fn()))
    expect(repoB.current.assumptions.costPerHour).toBe(defaultAssumptions().costPerHour)
  })

  it('falls back to defaults when stored JSON is corrupted', () => {
    localStorage.setItem('blast-radius:availability-assumptions:v1:https://github.com/o/r', '{not valid json')
    const { result } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    expect(result.current.assumptions).toEqual(defaultAssumptions())
  })

  it('falls back to defaults when stored JSON has the wrong shape', () => {
    localStorage.setItem(
      'blast-radius:availability-assumptions:v1:https://github.com/o/r',
      JSON.stringify({ costPerHour: 'not a number', currency: 'USD' }),
    )
    const { result } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', vi.fn()))
    expect(result.current.assumptions).toEqual(defaultAssumptions())
  })

  it('debounces onSettle so rapid edits only trigger one recompute', () => {
    vi.useFakeTimers()
    const onSettle = vi.fn()
    const { result } = renderHook(() => useAvailabilityAssumptions('https://github.com/o/r', onSettle, 500))

    act(() => {
      result.current.setAssumptions({ ...result.current.assumptions, costPerHour: 1 })
      result.current.setAssumptions({ ...result.current.assumptions, costPerHour: 2 })
      result.current.setAssumptions({ ...result.current.assumptions, costPerHour: 3 })
    })
    expect(onSettle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith(expect.objectContaining({ costPerHour: 3 }))
  })
})
