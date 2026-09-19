import { describe, expect, it } from 'vitest'
import {
  buildCorrelatedModel,
  correlatedAvailabilityWithRedundancy,
  correlatedSeriesAvailability,
  DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY,
  expectedValue,
  findRedundancyGroupCandidates,
  findWorstSingleEvent,
  naiveProbabilities,
  pmfNumberDown,
  pmfSum,
  poissonBinomialPmf,
  redundancyGroupDownProbability,
  sameMarginalsProbabilities,
  seriesAvailabilityFromProbabilities,
  tailProbability,
  unknownHostingVendorKeys,
  type CorrelatedModel,
} from './correlated'
import type { Vendor } from '../lib/types'

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'x',
    vendor: 'X',
    tier: 'other' as Vendor['tier'],
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

// --- Deterministic seeded PRNG (mulberry32) — no new dependency, reproducible across runs/CI. ---
function mulberry32(seed: number): () => number {
  let state = seed
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Test-only Monte Carlo oracle: tracks the FULL count-down distribution (not just "any down"),
 * which src/lib/availability.ts's production runMonteCarloAvailability doesn't need to do. */
function monteCarloPmfNumberDown(model: CorrelatedModel, trials: number, rng: () => number): number[] {
  const counts = new Array(model.vendors.length + 1).fill(0)
  const substrateIds = Object.keys(model.substrateOutageProbabilities)
  for (let t = 0; t < trials; t++) {
    const down = new Set<string>()
    for (const s of substrateIds) {
      if (rng() < model.substrateOutageProbabilities[s]) down.add(s)
    }
    let n = 0
    for (const v of model.vendors) {
      const forced = v.substrates.some((s) => down.has(s))
      if (forced || rng() < v.ownOutageProbability) n++
    }
    counts[n]++
  }
  return counts.map((c) => c / trials)
}

/** Independent-of-the-DP oracle: brute-forces every (substrate state x free-vendor state) combo
 * directly. Only tractable for small vendor counts, which is exactly where the tiniest tail
 * probabilities need a check that isn't the same algorithm as the code under test. */
function bruteForcePmfNumberDown(model: CorrelatedModel): number[] {
  const substrateIds = Object.keys(model.substrateOutageProbabilities)
  const total = new Array(model.vendors.length + 1).fill(0)
  const stateCount = 1 << substrateIds.length

  for (let mask = 0; mask < stateCount; mask++) {
    const downSet = new Set<string>()
    let stateProbability = 1
    for (let i = 0; i < substrateIds.length; i++) {
      const s = substrateIds[i]
      const q = model.substrateOutageProbabilities[s]
      if (mask & (1 << i)) {
        downSet.add(s)
        stateProbability *= q
      } else {
        stateProbability *= 1 - q
      }
    }
    if (stateProbability === 0) continue

    const forced = model.vendors.map((v) => v.substrates.some((s) => downSet.has(s)))
    const freeVendors = model.vendors.filter((_, i) => !forced[i])
    const forcedCount = forced.filter(Boolean).length
    const freeStateCount = 1 << freeVendors.length

    for (let fm = 0; fm < freeStateCount; fm++) {
      let prob = 1
      let downCount = 0
      for (let j = 0; j < freeVendors.length; j++) {
        if (fm & (1 << j)) {
          prob *= freeVendors[j].ownOutageProbability
          downCount++
        } else {
          prob *= 1 - freeVendors[j].ownOutageProbability
        }
      }
      total[forcedCount + downCount] += stateProbability * prob
    }
  }
  return total
}

function randomModel(
  rng: () => number,
  { minSubstrates = 2, maxSubstrates = 6, minVendors = 3, maxVendors = 25 } = {},
): CorrelatedModel {
  const substrateCount = minSubstrates + Math.floor(rng() * (maxSubstrates - minSubstrates + 1))
  const substrates = Array.from({ length: substrateCount }, (_, i) => `s${i}`)
  const vendorCount = minVendors + Math.floor(rng() * (maxVendors - minVendors + 1))

  const vendors = Array.from({ length: vendorCount }, (_, i) => {
    const ownOutageProbability = 1e-4 + rng() * 1e-2 // realistic rare-event range
    const substrateAssignmentCount = rng() < 0.15 ? 0 : rng() < 0.85 ? 1 : 2
    const shuffled = [...substrates].sort(() => rng() - 0.5)
    return {
      key: `v${i}`,
      label: `Vendor ${i}`,
      ownOutageProbability,
      substrates: shuffled.slice(0, Math.min(substrateAssignmentCount, substrates.length)),
    }
  })

  const substrateOutageProbabilities: Record<string, number> = {}
  for (const s of substrates) substrateOutageProbabilities[s] = 1e-4 + rng() * 1e-2

  return { vendors, substrateOutageProbabilities }
}

describe('poissonBinomialPmf', () => {
  it('matches a hand-computed 2-trial distribution', () => {
    const pmf = poissonBinomialPmf([0.3, 0.5])
    // P(0)=(0.7)(0.5)=0.35, P(1)=(0.3)(0.5)+(0.7)(0.5)=0.5, P(2)=(0.3)(0.5)=0.15
    expect(pmf[0]).toBeCloseTo(0.35)
    expect(pmf[1]).toBeCloseTo(0.5)
    expect(pmf[2]).toBeCloseTo(0.15)
  })

  it('returns [1] for zero trials', () => {
    expect(poissonBinomialPmf([])).toEqual([1])
  })

  it('reduces to the binomial distribution when all probabilities are equal', () => {
    const pmf = poissonBinomialPmf([0.5, 0.5, 0.5])
    expect(pmf[0]).toBeCloseTo(0.125)
    expect(pmf[3]).toBeCloseTo(0.125)
    expect(pmf[1]).toBeCloseTo(0.375)
  })
})

describe('buildCorrelatedModel', () => {
  it('excludes self/other/unknown substrate tags from correlation', () => {
    const model = buildCorrelatedModel([vendor({ key: 'a', substrate: ['self'] })])
    expect(model.vendors[0].substrates).toEqual([])
    expect(model.substrateOutageProbabilities).toEqual({})
  })

  it('applies a vendor SLA override without needing the original Vendor mutated', () => {
    const v = vendor({ key: 'a', sla: 0.5 })
    const model = buildCorrelatedModel([v], { vendorSlaOverrides: { a: 0.999999 } })
    expect(model.vendors[0].ownOutageProbability).toBeCloseTo(0.000001)
    expect(v.sla).toBe(0.5) // original untouched
  })

  it('defaults every substrate to the illustrative constant when not overridden', () => {
    const model = buildCorrelatedModel([vendor({ substrate: ['gcp'] })])
    expect(model.substrateOutageProbabilities.gcp).toBe(DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY)
  })

  it('respects an explicit substrate outage probability override', () => {
    const model = buildCorrelatedModel([vendor({ substrate: ['gcp'] })], {
      substrateOutageProbabilities: { gcp: 0.05 },
    })
    expect(model.substrateOutageProbabilities.gcp).toBe(0.05)
  })

  it('lists unknown-hosting vendors separately, never assigning them a phantom substrate', () => {
    const model = buildCorrelatedModel([vendor({ key: 'solo', substrate: ['self'] }), vendor({ key: 'hosted', substrate: ['aws'] })])
    expect(unknownHostingVendorKeys(model)).toEqual(['solo'])
  })
})

describe('pmfNumberDown — exact vs. brute force (independent of the DP), small models', () => {
  it('matches brute force on a 3-substrate, 8-vendor random model across 10 seeds', () => {
    const rng = mulberry32(42)
    for (let seed = 0; seed < 10; seed++) {
      const model = randomModel(rng, { minSubstrates: 2, maxSubstrates: 4, minVendors: 4, maxVendors: 10 })
      const exact = pmfNumberDown(model)
      const brute = bruteForcePmfNumberDown(model)
      for (let k = 0; k < exact.length; k++) {
        expect(exact[k]).toBeCloseTo(brute[k], 9)
      }
    }
  })
})

describe('pmfNumberDown — cross-validated against a seeded Monte Carlo oracle (400k trials)', () => {
  it('P(N>=k) stays within 4 standard errors of the exact value across 20 random models', () => {
    const modelRng = mulberry32(7)
    const trials = 400_000

    for (let i = 0; i < 20; i++) {
      const model = randomModel(modelRng, { minSubstrates: 2, maxSubstrates: 6, minVendors: 3, maxVendors: 25 })
      const exactPmf = pmfNumberDown(model)
      const mcPmf = monteCarloPmfNumberDown(model, trials, mulberry32(1000 + i))

      const checkpoints = [2, 3, Math.max(2, Math.ceil(model.vendors.length * 0.25))]
      for (const k of checkpoints) {
        const exactTail = tailProbability(exactPmf, k)
        const mcTail = tailProbability(mcPmf, k)
        if (exactTail < 1e-3) continue // too rare for 400k trials to resolve — brute force covers this range instead
        const standardError = Math.sqrt((exactTail * (1 - exactTail)) / trials)
        expect(Math.abs(mcTail - exactTail)).toBeLessThanOrEqual(4 * standardError + 1e-6)
      }
    }
  }, 30_000)
})

describe('pmfNumberDown — properties (seeded random loops)', () => {
  it('PMF sums to 1 within 1e-9', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 200; i++) {
      const model = randomModel(rng)
      expect(pmfSum(pmfNumberDown(model))).toBeCloseTo(1, 9)
    }
  })

  it('P(N=0) equals the closed-form series availability', () => {
    const rng = mulberry32(2)
    for (let i = 0; i < 200; i++) {
      const model = randomModel(rng)
      const pmf = pmfNumberDown(model)
      expect(pmf[0]).toBeCloseTo(correlatedSeriesAvailability(model), 9)
    }
  })

  it('adding a vendor never increases P(N=0)', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 100; i++) {
      const model = randomModel(rng, { minVendors: 3, maxVendors: 15 })
      const before = pmfNumberDown(model)[0]
      const extended: CorrelatedModel = {
        ...model,
        vendors: [...model.vendors, { key: 'extra', label: 'Extra', ownOutageProbability: 1e-4 + rng() * 1e-2, substrates: [] }],
      }
      const after = pmfNumberDown(extended)[0]
      expect(after).toBeLessThanOrEqual(before + 1e-12)
    }
  })

  it('vendor order does not affect the PMF', () => {
    const rng = mulberry32(4)
    for (let i = 0; i < 50; i++) {
      const model = randomModel(rng, { minVendors: 5, maxVendors: 15 })
      const shuffled: CorrelatedModel = { ...model, vendors: [...model.vendors].sort(() => rng() - 0.5) }
      const a = pmfNumberDown(model)
      const b = pmfNumberDown(shuffled)
      for (let k = 0; k < a.length; k++) expect(a[k]).toBeCloseTo(b[k], 9)
    }
  })

  it('all vendors on distinct substrates => correlated PMF equals the same-marginals comparator', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 50; i++) {
      const substrateCount = 4 + Math.floor(rng() * 3)
      const substrates = Array.from({ length: substrateCount }, (_, s) => `s${s}`)
      const vendors = substrates.map((s, idx) => ({
        key: `v${idx}`,
        label: `Vendor ${idx}`,
        ownOutageProbability: 1e-4 + rng() * 1e-2,
        substrates: [s], // exactly one vendor per substrate — nothing shared
      }))
      const substrateOutageProbabilities: Record<string, number> = {}
      for (const s of substrates) substrateOutageProbabilities[s] = 1e-4 + rng() * 1e-2
      const model: CorrelatedModel = { vendors, substrateOutageProbabilities }

      const correlated = pmfNumberDown(model)
      const comparator = poissonBinomialPmf(sameMarginalsProbabilities(model))
      for (let k = 0; k < correlated.length; k++) expect(correlated[k]).toBeCloseTo(comparator[k], 9)
    }
  })

  it('all q_s = 0 => correlated PMF equals the naive comparator', () => {
    const rng = mulberry32(6)
    for (let i = 0; i < 50; i++) {
      const model = randomModel(rng)
      const zeroSubstrateModel: CorrelatedModel = {
        ...model,
        substrateOutageProbabilities: Object.fromEntries(Object.keys(model.substrateOutageProbabilities).map((s) => [s, 0])),
      }
      const correlated = pmfNumberDown(zeroSubstrateModel)
      const naive = poissonBinomialPmf(naiveProbabilities(zeroSubstrateModel))
      for (let k = 0; k < correlated.length; k++) expect(correlated[k]).toBeCloseTo(naive[k], 9)
    }
  })
})

describe('tailProbability', () => {
  it('sums the upper tail directly, matching a manual sum', () => {
    const pmf = [0.5, 0.3, 0.15, 0.05]
    expect(tailProbability(pmf, 2)).toBeCloseTo(0.2)
  })

  it('P(N>=0) is 1', () => {
    expect(tailProbability([0.2, 0.3, 0.5], 0)).toBeCloseTo(1)
  })
})

describe('correlatedSeriesAvailability — regression', () => {
  it("a substrate entry with zero vendors on it must not affect availability (found via property test)", () => {
    const model: CorrelatedModel = {
      vendors: [{ key: 'a', label: 'A', ownOutageProbability: 0.001, substrates: ['aws'] }],
      substrateOutageProbabilities: { aws: 0.001, gcp: 0.5 }, // "gcp" has no vendor on it at all
    }
    // pmf[0] is the ground truth: it correctly marginalizes an irrelevant substrate away.
    expect(correlatedSeriesAvailability(model)).toBeCloseTo(pmfNumberDown(model)[0], 12)
    expect(correlatedSeriesAvailability(model)).toBeCloseTo((1 - 0.001) * (1 - 0.001), 12)
  })
})

describe('naive vs. same-marginals vs. correlated availability — decomposition', () => {
  it('naive is always the most optimistic: it ignores substrate risk entirely', () => {
    const rng = mulberry32(8)
    for (let i = 0; i < 50; i++) {
      const model = randomModel(rng, { minVendors: 5, maxVendors: 10 })
      const naiveAvailability = seriesAvailabilityFromProbabilities(naiveProbabilities(model))
      const sameMarginalsAvailability = seriesAvailabilityFromProbabilities(sameMarginalsProbabilities(model))
      expect(naiveAvailability).toBeGreaterThanOrEqual(sameMarginalsAvailability - 1e-12)
    }
  })

  it('correlated series availability is >= the same-marginals comparator (concentrationEffect <= 0)', () => {
    // Expanding prod_v(1-p_v) for the same-marginals comparator counts a shared substrate's
    // (1-q_s) factor once PER vendor on it, while the correlated closed form counts it once total
    // (a single shared draw). For a substrate with 2+ vendors that makes the comparator strictly
    // more pessimistic than correlated — exactly the "sharing doesn't add expected downtime for a
    // series system" fact concentrationEffect is built to surface honestly.
    const rng = mulberry32(9)
    for (let i = 0; i < 50; i++) {
      const model = randomModel(rng, { minVendors: 5, maxVendors: 15 })
      const sameMarginalsAvailability = seriesAvailabilityFromProbabilities(sameMarginalsProbabilities(model))
      const correlatedAvailability = correlatedSeriesAvailability(model)
      expect(correlatedAvailability).toBeGreaterThanOrEqual(sameMarginalsAvailability - 1e-9)
    }
  })

  it('equals the same-marginals comparator exactly when no substrate has more than one vendor', () => {
    const rng = mulberry32(10)
    for (let i = 0; i < 50; i++) {
      const substrateCount = 4 + Math.floor(rng() * 3)
      const substrates = Array.from({ length: substrateCount }, (_, s) => `s${s}`)
      const vendors = substrates.map((s, idx) => ({
        key: `v${idx}`,
        label: `Vendor ${idx}`,
        ownOutageProbability: 1e-4 + rng() * 1e-2,
        substrates: [s],
      }))
      const substrateOutageProbabilities: Record<string, number> = {}
      for (const s of substrates) substrateOutageProbabilities[s] = 1e-4 + rng() * 1e-2
      const model: CorrelatedModel = { vendors, substrateOutageProbabilities }

      const sameMarginalsAvailability = seriesAvailabilityFromProbabilities(sameMarginalsProbabilities(model))
      const correlatedAvailability = correlatedSeriesAvailability(model)
      expect(correlatedAvailability).toBeCloseTo(sameMarginalsAvailability, 9)
    }
  })
})

describe('findWorstSingleEvent', () => {
  it('picks the substrate with the most vendors on it, breaking ties alphabetically', () => {
    const model: CorrelatedModel = {
      vendors: [
        { key: 'a', label: 'A', ownOutageProbability: 0.001, substrates: ['aws'] },
        { key: 'b', label: 'B', ownOutageProbability: 0.001, substrates: ['aws'] },
        { key: 'c', label: 'C', ownOutageProbability: 0.001, substrates: ['gcp'] },
      ],
      substrateOutageProbabilities: { aws: 0.001, gcp: 0.002 },
    }
    const worst = findWorstSingleEvent(model)
    expect(worst).toEqual({ substrate: 'aws', vendorKeys: ['a', 'b'], probabilityPerYear: 0.001 })
  })

  it('returns null when no vendor has a shareable substrate', () => {
    const model = buildCorrelatedModel([vendor({ substrate: ['self'] })])
    expect(findWorstSingleEvent(model)).toBeNull()
  })
})

describe('findRedundancyGroupCandidates / redundancyGroupDownProbability', () => {
  it('finds a curated fallback pair only when both vendors are actually detected', () => {
    const vendors = [
      vendor({ key: 'stripe', vendor: 'Stripe', fallbacks: ['Razorpay', 'Adyen'] }),
      vendor({ key: 'razorpay', vendor: 'Razorpay', substrate: ['aws'] }),
    ]
    expect(findRedundancyGroupCandidates(vendors)).toEqual([['razorpay', 'stripe']])
  })

  it('returns no groups when a curated fallback is not present in this repo', () => {
    const vendors = [vendor({ key: 'stripe', vendor: 'Stripe', fallbacks: ['Razorpay', 'Adyen'] })]
    expect(findRedundancyGroupCandidates(vendors)).toEqual([])
  })

  it('group-down probability is lower than either member alone (redundancy actually helps)', () => {
    const model = buildCorrelatedModel([
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.99, substrate: ['gcp'] }),
    ])
    const groupDown = redundancyGroupDownProbability(model, ['a', 'b'])
    expect(groupDown).toBeLessThan(model.vendors[0].ownOutageProbability)
    expect(groupDown).toBeLessThan(model.vendors[1].ownOutageProbability)
  })
})

describe('correlatedAvailabilityWithRedundancy', () => {
  it('reduces to correlatedSeriesAvailability when there are no redundancy groups', () => {
    const model = buildCorrelatedModel([
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.995, substrate: ['gcp'] }),
      vendor({ key: 'c', sla: 0.999, substrate: ['aws', 'gcp'] }),
    ])
    expect(correlatedAvailabilityWithRedundancy(model, [])).toBeCloseTo(correlatedSeriesAvailability(model), 12)
  })

  it('a single-member "group" behaves exactly like that vendor being ungrouped', () => {
    const model = buildCorrelatedModel([
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.995, substrate: ['gcp'] }),
    ])
    expect(correlatedAvailabilityWithRedundancy(model, [['a']])).toBeCloseTo(correlatedSeriesAvailability(model), 12)
  })

  it('diversifying onto a different substrate raises availability above the undiversified baseline', () => {
    const baseline = buildCorrelatedModel([
      vendor({ key: 'stripe', sla: 0.999, substrate: ['aws'] }),
      vendor({ key: 'other', sla: 0.999, substrate: ['gcp'] }),
    ])
    const withFailover = buildCorrelatedModel([
      vendor({ key: 'stripe', sla: 0.999, substrate: ['aws'] }),
      vendor({ key: 'razorpay', sla: 0.999, substrate: ['gcp'] }),
      vendor({ key: 'other', sla: 0.999, substrate: ['gcp'] }),
    ])
    const before = correlatedSeriesAvailability(baseline)
    const after = correlatedAvailabilityWithRedundancy(withFailover, [['stripe', 'razorpay']])
    expect(after).toBeGreaterThan(before)
  })

  it('exactly matches redundancyGroupDownProbability when the group is the only thing in the model', () => {
    const model = buildCorrelatedModel([
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.99, substrate: ['gcp'] }),
    ])
    const groupDown = redundancyGroupDownProbability(model, ['a', 'b'])
    expect(correlatedAvailabilityWithRedundancy(model, [['a', 'b']])).toBeCloseTo(1 - groupDown, 12)
  })

  it('a group sharing its substrate with an unrelated singleton is still counted correlated (not double-counted independent)', () => {
    // Both group members AND the singleton are all on "aws" — if "aws" goes down every one of
    // them is down together, in the SAME state. Marginalizing the group separately and
    // multiplying it into the singleton's availability would silently ignore this correlation.
    const model = buildCorrelatedModel([
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'singleton', sla: 0.99, substrate: ['aws'] }),
    ])
    const exact = correlatedAvailabilityWithRedundancy(model, [['a', 'b']])
    const wrongApproximation =
      correlatedSeriesAvailability(buildCorrelatedModel([vendor({ key: 'singleton', sla: 0.99, substrate: ['aws'] })])) *
      (1 - redundancyGroupDownProbability(model, ['a', 'b']))
    expect(exact).not.toBeCloseTo(wrongApproximation, 6)
  })
})

describe('expectedValue', () => {
  it('computes the mean of a PMF', () => {
    expect(expectedValue([0.5, 0.3, 0.2])).toBeCloseTo(0.7)
  })
})

describe('performance: |S|=10, V=60', () => {
  it('computes the exact PMF comfortably fast', () => {
    const rng = mulberry32(99)
    const model = randomModel(rng, { minSubstrates: 10, maxSubstrates: 10, minVendors: 60, maxVendors: 60 })

    const start = performance.now()
    const pmf = pmfNumberDown(model)
    const elapsedMs = performance.now() - start

    expect(pmfSum(pmf)).toBeCloseTo(1, 6)
    console.log(`[perf] pmfNumberDown |S|=10, V=60: ${elapsedMs.toFixed(2)}ms`)
    // Measured ~5ms on an idle machine; this was 50ms until the verification pack's full-suite
    // runs (60+ worker processes contending for CPU) showed it flaking up to ~200ms under real
    // parallel load — a >10x margin here still catches an actual algorithmic regression (an O(n^2)
    // blowup would show far more than this), it just stops being a false alarm about scheduler
    // contention.
    expect(elapsedMs).toBeLessThan(500)
  })
})
