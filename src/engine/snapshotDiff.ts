// Pure diff logic — no I/O, no randomness. Comparing two compact AnalysisSnapshotSummary records
// (never the full graph). Two snapshots of the SAME repo, taken at different times.

import type { AnalysisDiff, AnalysisSnapshotSummary, SubstrateShareChange, TailRiskChange, VendorSubstrateChange, WorstSingleEventChange } from '../lib/types'

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function diffSubstrateShares(a: AnalysisSnapshotSummary, b: AnalysisSnapshotSummary): SubstrateShareChange[] {
  const aByName = new Map(a.substrateShares.map((s) => [s.substrate, s.share]))
  const bByName = new Map(b.substrateShares.map((s) => [s.substrate, s.share]))
  const allSubstrates = [...new Set([...aByName.keys(), ...bByName.keys()])].sort()

  const changes: SubstrateShareChange[] = []
  for (const substrate of allSubstrates) {
    const from = aByName.get(substrate) ?? 0
    const to = bByName.get(substrate) ?? 0
    if (from !== to) changes.push({ substrate, from, to, delta: to - from })
  }
  return changes
}

function diffTailRisk(a: AnalysisSnapshotSummary, b: AnalysisSnapshotSummary): TailRiskChange[] {
  const aByK = new Map(a.tailRisk.map((t) => [t.k, t]))
  const bByK = new Map(b.tailRisk.map((t) => [t.k, t]))
  const allKs = [...new Set([...aByK.keys(), ...bByK.keys()])].sort((x, y) => x - y)

  const changes: TailRiskChange[] = []
  for (const k of allKs) {
    const from = aByK.get(k)
    const to = bByK.get(k)
    if (!from || !to) continue // k only present in one snapshot — nothing meaningful to diff
    if (from.correlated !== to.correlated || from.multiplier !== to.multiplier) {
      changes.push({ k, correlatedFrom: from.correlated, correlatedTo: to.correlated, multiplierFrom: from.multiplier, multiplierTo: to.multiplier })
    }
  }
  return changes
}

function diffWorstSingleEvent(a: AnalysisSnapshotSummary, b: AnalysisSnapshotSummary): WorstSingleEventChange {
  const from = a.worstSingleEvent
  const to = b.worstSingleEvent
  const changed =
    (from === null) !== (to === null) ||
    (from !== null && to !== null && (from.substrate !== to.substrate || JSON.stringify([...from.vendorKeys].sort()) !== JSON.stringify([...to.vendorKeys].sort())))
  return { from, to, changed }
}

function buildVerdict(input: {
  vendorsAdded: string[]
  vendorsRemoved: string[]
  substrateShareChanges: SubstrateShareChange[]
}): string {
  const clauses: string[] = []

  if (input.substrateShareChanges.length > 0) {
    // The single most significant share move — sorted by |delta| desc, then substrate name asc
    // for a deterministic tie-break.
    const biggest = [...input.substrateShareChanges].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.substrate.localeCompare(y.substrate))[0]
    const direction = biggest.delta > 0 ? 'rose' : 'fell'
    clauses.push(`${biggest.substrate} share ${direction} ${pct(biggest.from)} -> ${pct(biggest.to)}`)
  }

  if (input.vendorsAdded.length > 0) clauses.push(`${input.vendorsAdded.length} vendor${input.vendorsAdded.length === 1 ? '' : 's'} added`)
  if (input.vendorsRemoved.length > 0) clauses.push(`${input.vendorsRemoved.length} vendor${input.vendorsRemoved.length === 1 ? '' : 's'} removed`)

  return clauses.length > 0 ? clauses.join('; ') : 'No material change.'
}

export function diffAnalyses(a: AnalysisSnapshotSummary, b: AnalysisSnapshotSummary): AnalysisDiff {
  const aIds = new Set(a.vendors.map((v) => v.id))
  const bIds = new Set(b.vendors.map((v) => v.id))
  const vendorsAdded = b.vendors.filter((v) => !aIds.has(v.id)).map((v) => v.id).sort()
  const vendorsRemoved = a.vendors.filter((v) => !bIds.has(v.id)).map((v) => v.id).sort()

  const aVendorById = new Map(a.vendors.map((v) => [v.id, v]))
  const bVendorById = new Map(b.vendors.map((v) => [v.id, v]))
  const substrateChanges: VendorSubstrateChange[] = []
  for (const id of [...aIds].filter((x) => bIds.has(x)).sort()) {
    const from = aVendorById.get(id)!.substrate
    const to = bVendorById.get(id)!.substrate
    if (JSON.stringify(from) !== JSON.stringify(to)) substrateChanges.push({ id, from, to })
  }

  const substrateShareChanges = diffSubstrateShares(a, b)
  const tailRiskChanges = diffTailRisk(a, b)
  const worstSingleEventChange = diffWorstSingleEvent(a, b)
  const unclassifiedDelta = a.unclassifiedCount !== null && b.unclassifiedCount !== null ? b.unclassifiedCount - a.unclassifiedCount : null
  const entrypointDelta = b.entrypointCount - a.entrypointCount

  const engineVersionChanged = a.engineVersion !== b.engineVersion
  const kbVersionChanged = a.kbVersion !== b.kbVersion
  const warnings: string[] = []
  if (engineVersionChanged) {
    warnings.push(`engineVersion differs (${a.engineVersion} -> ${b.engineVersion}) — some of this diff may reflect a math/methodology change, not a repo change.`)
  }
  if (kbVersionChanged) {
    warnings.push(`kbVersion differs (${a.kbVersion} -> ${b.kbVersion}) — some substrate/SLA values may reflect a knowledge-base update, not a repo change.`)
  }

  return {
    vendorsAdded,
    vendorsRemoved,
    substrateChanges,
    substrateShareChanges,
    tailRiskChanges,
    worstSingleEventChange,
    unclassifiedDelta,
    entrypointDelta,
    engineVersionChanged,
    kbVersionChanged,
    warnings,
    verdict: buildVerdict({ vendorsAdded, vendorsRemoved, substrateShareChanges }),
  }
}
