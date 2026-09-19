// Policy-as-code for the PR Resilience Gate. Deliberately split in two: validateGatePolicy parses
// and rejects untrusted JSON (thrown Errors become 400s via apiRouter's existing generic-Error
// handling — see errorMessage()); evaluatePolicy is a pure function with no I/O and no throwing, so
// it can be unit-tested as a plain input->output matrix without touching GitHub at all.

export interface GatePolicy {
  /** 0-1 — the share of vendors allowed to sit on the single most-concentrated substrate AFTER this PR. */
  maxSubstrateShare?: number
  minSubstrates?: number
  maxNewVendorsPerPr?: number
  /** 0-100 — percent of this repo's entrypoints allowed to be affected by the changed files. */
  maxEntrypointsAffectedPct?: number
  /** Same currency unit as costPerHourOfDowntime; only an INCREASE counts, a decrease never violates this. */
  maxExposureIncreasePerYear?: number
  /** How a violation should be reported. Defaults to 'warn' (comment only, never blocks the PR)
   * when a policy is supplied but doesn't say — a strict-by-default failure mode surprises people
   * the first time they add a policy file at all. */
  failOn?: 'fail' | 'warn'
}

const ALLOWED_POLICY_KEYS: ReadonlySet<string> = new Set([
  'maxSubstrateShare',
  'minSubstrates',
  'maxNewVendorsPerPr',
  'maxEntrypointsAffectedPct',
  'maxExposureIncreasePerYear',
  'failOn',
])

function requireNumberInRange(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`policy.${field} must be a number between ${min} and ${max}.`)
  }
  return value
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`policy.${field} must be a non-negative integer.`)
  }
  return value
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`policy.${field} must be a non-negative number.`)
  }
  return value
}

/** undefined/null input -> undefined policy (report-only mode). Anything else must be a plain
 * object containing ONLY the known keys above, each of the right type/range — an unknown key is
 * almost always a typo (e.g. `maxSubstratesShare`) that would otherwise silently do nothing, so it
 * is rejected with a 400 instead. */
export function validateGatePolicy(raw: unknown): GatePolicy | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('policy must be an object.')
  }

  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_POLICY_KEYS.has(key)) {
      throw new Error(`Unknown policy key "${key}". Allowed keys: ${[...ALLOWED_POLICY_KEYS].join(', ')}.`)
    }
  }

  const policy: GatePolicy = {}
  if (record.maxSubstrateShare !== undefined) {
    policy.maxSubstrateShare = requireNumberInRange(record.maxSubstrateShare, 0, 1, 'maxSubstrateShare')
  }
  if (record.minSubstrates !== undefined) {
    policy.minSubstrates = requireNonNegativeInt(record.minSubstrates, 'minSubstrates')
  }
  if (record.maxNewVendorsPerPr !== undefined) {
    policy.maxNewVendorsPerPr = requireNonNegativeInt(record.maxNewVendorsPerPr, 'maxNewVendorsPerPr')
  }
  if (record.maxEntrypointsAffectedPct !== undefined) {
    policy.maxEntrypointsAffectedPct = requireNumberInRange(record.maxEntrypointsAffectedPct, 0, 100, 'maxEntrypointsAffectedPct')
  }
  if (record.maxExposureIncreasePerYear !== undefined) {
    policy.maxExposureIncreasePerYear = requireNonNegativeNumber(record.maxExposureIncreasePerYear, 'maxExposureIncreasePerYear')
  }
  if (record.failOn !== undefined) {
    if (record.failOn !== 'fail' && record.failOn !== 'warn') {
      throw new Error('policy.failOn must be "fail" or "warn".')
    }
    policy.failOn = record.failOn
  }
  return policy
}

export interface PolicyEvalInput {
  newVendorsCount: number
  /** The AFTER-this-PR concentration numbers — a policy gates what the PR would leave behind, not what it started from. */
  mostConcentratedSubstrateShare: number
  substrateCount: number
  entrypointsAffectedPct: number
  /** Can be negative (this PR reduces exposure) — never a violation regardless of magnitude. */
  exposureIncreasePerYear: number
}

export interface PolicyViolation {
  rule: keyof Omit<GatePolicy, 'failOn'>
  actual: number
  limit: number
  message: string
}

export type PolicyStatus = 'info' | 'pass' | 'warn' | 'fail'

export interface PolicyResult {
  status: PolicyStatus
  violations: PolicyViolation[]
}

/** Pure: no I/O, no throwing, same input always produces the same output — the policy schema was
 * already validated by validateGatePolicy before this ever runs. No policy at all -> 'info'
 * (report-only, never fails, per spec). A policy with zero violations -> 'pass'. One or more
 * violations -> the policy's own failOn ('warn' by default). */
export function evaluatePolicy(input: PolicyEvalInput, policy: GatePolicy | undefined): PolicyResult {
  if (!policy) return { status: 'info', violations: [] }

  const violations: PolicyViolation[] = []

  if (policy.maxSubstrateShare !== undefined && input.mostConcentratedSubstrateShare > policy.maxSubstrateShare) {
    violations.push({
      rule: 'maxSubstrateShare',
      actual: input.mostConcentratedSubstrateShare,
      limit: policy.maxSubstrateShare,
      message: `${Math.round(input.mostConcentratedSubstrateShare * 100)}% of vendors would share one substrate after this PR, above the ${Math.round(policy.maxSubstrateShare * 100)}% limit.`,
    })
  }
  if (policy.minSubstrates !== undefined && input.substrateCount < policy.minSubstrates) {
    violations.push({
      rule: 'minSubstrates',
      actual: input.substrateCount,
      limit: policy.minSubstrates,
      message: `Only ${input.substrateCount} distinct substrate(s) after this PR, below the required minimum of ${policy.minSubstrates}.`,
    })
  }
  if (policy.maxNewVendorsPerPr !== undefined && input.newVendorsCount > policy.maxNewVendorsPerPr) {
    violations.push({
      rule: 'maxNewVendorsPerPr',
      actual: input.newVendorsCount,
      limit: policy.maxNewVendorsPerPr,
      message: `This PR introduces ${input.newVendorsCount} new vendor(s), above the limit of ${policy.maxNewVendorsPerPr} per PR.`,
    })
  }
  if (policy.maxEntrypointsAffectedPct !== undefined && input.entrypointsAffectedPct > policy.maxEntrypointsAffectedPct) {
    violations.push({
      rule: 'maxEntrypointsAffectedPct',
      actual: input.entrypointsAffectedPct,
      limit: policy.maxEntrypointsAffectedPct,
      message: `${input.entrypointsAffectedPct.toFixed(1)}% of this repo's entrypoints are affected, above the ${policy.maxEntrypointsAffectedPct}% limit.`,
    })
  }
  if (policy.maxExposureIncreasePerYear !== undefined && input.exposureIncreasePerYear > policy.maxExposureIncreasePerYear) {
    violations.push({
      rule: 'maxExposureIncreasePerYear',
      actual: input.exposureIncreasePerYear,
      limit: policy.maxExposureIncreasePerYear,
      message: `Modeled annual exposure would increase by ${input.exposureIncreasePerYear.toFixed(0)}/yr, above the limit of ${policy.maxExposureIncreasePerYear}/yr.`,
    })
  }

  if (violations.length === 0) return { status: 'pass', violations: [] }
  return { status: policy.failOn ?? 'warn', violations }
}
