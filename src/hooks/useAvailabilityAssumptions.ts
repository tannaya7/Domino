import { useEffect, useRef, useState } from 'react'
import type { Currency } from '../lib/currency'
import { defaultCostPerHour } from '../lib/currency'

export interface AvailabilityAssumptionsState {
  /** Keyed by Vendor.key, fraction e.g. 0.999 — absent means "use the curated default". */
  vendorSlaOverrides: Record<string, number>
  /** Keyed by substrate name, fraction e.g. 0.001 — absent means "use the derived default, or 0". */
  substrateRateOverrides: Record<string, number>
  costPerHour: number
  currency: Currency
}

function storageKey(repoUrl: string | null): string {
  return `blast-radius:availability-assumptions:v1:${repoUrl ?? 'default'}`
}

export function defaultAssumptions(): AvailabilityAssumptionsState {
  return {
    vendorSlaOverrides: {},
    substrateRateOverrides: {},
    costPerHour: defaultCostPerHour('USD'),
    currency: 'USD',
  }
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

/** Defensive against corrupted/foreign localStorage content — never trust stored JSON blindly. */
function loadAssumptions(repoUrl: string | null): AvailabilityAssumptionsState {
  try {
    const raw = localStorage.getItem(storageKey(repoUrl))
    if (!raw) return defaultAssumptions()
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('costPerHour' in parsed) ||
      !('currency' in parsed) ||
      typeof (parsed as { costPerHour: unknown }).costPerHour !== 'number' ||
      !Number.isFinite((parsed as { costPerHour: number }).costPerHour) ||
      ((parsed as { currency: unknown }).currency !== 'USD' && (parsed as { currency: unknown }).currency !== 'INR')
    ) {
      return defaultAssumptions()
    }
    const candidate = parsed as AvailabilityAssumptionsState
    return {
      vendorSlaOverrides: isRecordOfNumbers(candidate.vendorSlaOverrides) ? candidate.vendorSlaOverrides : {},
      substrateRateOverrides: isRecordOfNumbers(candidate.substrateRateOverrides) ? candidate.substrateRateOverrides : {},
      costPerHour: candidate.costPerHour,
      currency: candidate.currency,
    }
  } catch {
    return defaultAssumptions()
  }
}

function saveAssumptions(repoUrl: string | null, state: AvailabilityAssumptionsState): void {
  try {
    localStorage.setItem(storageKey(repoUrl), JSON.stringify(state))
  } catch {
    // Best-effort only — private browsing / a full storage quota must never break the panel.
  }
}

/**
 * Owns the Assumptions panel's state: loads/persists it per-repo in localStorage, and debounces
 * `onSettle` so a recompute (a real /simulate network call) fires once after the user stops
 * editing rather than on every keystroke.
 */
export function useAvailabilityAssumptions(
  repoUrl: string | null,
  onSettle: (state: AvailabilityAssumptionsState) => void,
  debounceMs = 500,
) {
  const [assumptions, setAssumptionsState] = useState<AvailabilityAssumptionsState>(() => loadAssumptions(repoUrl))
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSettleRef = useRef(onSettle)
  useEffect(() => {
    onSettleRef.current = onSettle
  }, [onSettle])

  function setAssumptions(next: AvailabilityAssumptionsState) {
    setAssumptionsState(next)
    saveAssumptions(repoUrl, next)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onSettleRef.current(next), debounceMs)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { assumptions, setAssumptions }
}
