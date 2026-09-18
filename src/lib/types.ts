export interface GraphNode {
  id: string
  label: string
  type: string
}

export interface GraphEdge {
  from: string
  to: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type VendorTier =
  | 'auth'
  | 'payments'
  | 'data'
  | 'email'
  | 'observability'
  | 'ai'
  | 'messaging'
  | 'analytics'
  | 'search'
  | 'maps'
  | 'storage'

/** A curated, hand-verified fact about a third-party vendor — not dynamically discovered. */
export interface VendorEntry {
  vendor: string
  tier: VendorTier
  /** Coarse hosting-provider tags this vendor is known to run on, e.g. "aws", "cloudflare". */
  substrate: string[]
  /** Published SLA as a fraction, e.g. 0.999 for "three nines". Editable — an input, not a guarantee. */
  sla: number
  statusUrl?: string
  fallbacks?: string[]
}

/** A vendor as detected in a specific repo, with full provenance back to what triggered detection. */
export interface Vendor extends VendorEntry {
  /** Stable key into the curated vendor knowledge base, e.g. "@sentry/react". */
  key: string
  /** Every signal that matched this vendor, e.g. "import:stripe", "env:STRIPE_SECRET_KEY". */
  detectedVia: string[]
  /** File paths (or manifest/env filenames) that contributed to this vendor's detection. */
  detectedInFiles: string[]
}

/** A vendor plus everything in the file graph that would be affected if it failed. */
export interface VendorWithBlastRadius extends Vendor {
  /** Files that reference the vendor directly, and are actual file-graph nodes (manifests/env files excluded). */
  directFiles: string[]
  /** directFiles plus everything downstream of them in the file import graph — the full blast radius. */
  affectedFiles: string[]
}

/** The vendor-level roll-up of a repo's file graph — external dependencies as first-class nodes. */
export interface VendorGraph {
  /** Synthetic id for "this application" — the node every vendor dependency edge originates from. */
  rootId: string
  vendors: VendorWithBlastRadius[]
}

/** One shared substrate (e.g. "aws") and every vendor that depends on it. */
export interface SubstrateConcentration {
  substrate: string
  vendorKeys: string[]
  vendorNames: string[]
  /** vendorKeys.length / total distinct vendors — how much of your vendor set sits on this one substrate. */
  share: number
}

/** Concentration analysis: how many "independent" vendors actually collapse onto shared infrastructure. */
export interface ConcentrationResult {
  vendorCount: number
  substrateCount: number
  /** Sorted by share descending — the most concentrated substrate first. */
  bySubstrate: SubstrateConcentration[]
  /** The substrate with the highest share, or null if there are no vendors. */
  mostConcentrated: SubstrateConcentration | null
}

/** Two independent, sometimes-disagreeing criticality signals for one node — shown side by side, not merged into a single score. */
export interface NodeCriticality {
  nodeId: string
  /** Pure graph theory: removing this node disconnects the graph, regardless of any notion of "importance". */
  isArticulationPoint: boolean
  /** Semantic: entrypoints that directly or transitively depend on this node. */
  affectedEntrypoints: string[]
  /** Other nodes that become unreachable from every entrypoint once this node is removed. */
  orphanedNodes: string[]
  entrypointCount: number
  /** affectedEntrypoints.length / entrypointCount. */
  reachabilityLossRatio: number
}

export interface CriticalityResult {
  /** The entrypoints used for the reachability-loss calculation (inferred, or caller-supplied). */
  entrypoints: string[]
  articulationPoints: string[]
  /** Sorted by reachabilityLossRatio descending, then orphanedNodes.length descending. */
  byNode: NodeCriticality[]
}

/** A named failure to simulate — a set of substrates assumed fully down. Generic by design: we don't
 * assert specific unverified historical incidents as fact; label/describe a real one if you have one. */
export interface FailureScenario {
  id: string
  label: string
  downSubstrates: string[]
  description?: string
}

export interface FailureScenarioResult {
  scenario: FailureScenario
  affectedVendors: Vendor[]
  unaffectedVendors: Vendor[]
  affectedCount: number
  totalCount: number
  affectedShare: number
}

/**
 * Every number here is an editable input, not a measured fact — surface them, don't hide them.
 * NOTE: this (and SimulationResult below) power `runMonteCarloAvailability`, which is no longer on
 * the production /simulate path — it's kept ONLY as a seeded test oracle to cross-validate the
 * exact engine in src/engine/correlated.ts (see correlated.test.ts). Production numbers come from
 * ExactAvailabilityResult / AvailabilityHeadline below.
 */
export interface AvailabilityAssumptions {
  /** Monte Carlo trial count — higher tightens the correlated-availability estimate at the cost of compute. */
  trials: number
  /** Currency-agnostic cost per hour of full downtime. 0 disables financial exposure output. */
  costPerHourOfDowntime: number
  /** Per-substrate failure probability used by the correlated model — defaults are DERIVED from vendor SLA (only when >=2 vendors share the substrate; see availability.ts), not independently measured. */
  substrateFailureProbabilities: Record<string, number>
  /** Per-vendor SLA overrides keyed by Vendor.key — defaults come from the curated vendor knowledge base (server/src/vendorMap.ts), itself an editable input, not ground truth. */
  vendorSlaOverrides: Record<string, number>
}

/** Test-oracle-only result shape for runMonteCarloAvailability. See the note on AvailabilityAssumptions. */
export interface SimulationResult {
  /** Vendors treated as fully independent — the product of their SLAs. Systematically overstates availability. */
  naiveAvailability: number
  /** A vendor is down if its own incident occurs OR any substrate it shares with others goes down (shared per trial). */
  correlatedAvailability: number
  trials: number
  expectedDowntimeHoursPerYear: { naive: number; correlated: number }
  expectedAnnualExposure: { naive: number; correlated: number }
  /** Share of correlated downtime the naive model misses entirely: (correlated - naive) / correlated, floored at 0. */
  correlatedShareOfDowntime: number
  assumptions: AvailabilityAssumptions
}

/**
 * Production assumptions for the EXACT engine (src/engine/correlated.ts) — no trial count, because
 * there's no sampling. `substrateOutageProbabilities` is the fully-resolved map actually used
 * (illustrative defaults merged with any user overrides), not just what was overridden.
 */
export interface ExactAvailabilityAssumptions {
  costPerHourOfDowntime: number
  vendorSlaOverrides: Record<string, number>
  substrateOutageProbabilities: Record<string, number>
}

/** The three comparators, computed exactly (closed form / enumeration, never sampled). */
export interface ExactAvailabilityResult {
  /** (a) NAIVE: fully independent, p_v = u_v — what SLA-product math sees. Most optimistic. */
  naiveAvailability: number
  /** (b) INDEPENDENT-SAME-MARGINALS: fully independent, p_v = 1-(1-u_v)(1-q_s(v)) — same per-vendor
   * marginal as correlated, but substrate outages sampled separately per vendor instead of shared. */
  independentSameMarginalsAvailability: number
  /** Vendor down if its own outage OR its shared substrate's outage — substrate outage shared by every vendor on it. */
  correlatedAvailability: number
  expectedDowntimeHoursPerYear: { naive: number; independentSameMarginals: number; correlated: number }
  expectedAnnualExposure: { naive: number; independentSameMarginals: number; correlated: number }
  assumptions: ExactAvailabilityAssumptions
}

/** P(N >= k) under each of the three models, at one checkpoint k (number of vendors down at once). */
export interface TailRiskPoint {
  k: number
  naive: number
  independentSameMarginals: number
  correlated: number
  /** correlated / independentSameMarginals — isolates the effect of SHARING a substrate from the
   * effect of substrate risk existing at all. Capped for display (never Infinity/NaN). */
  multiplier: number
}

/** The single substrate outage that would take down the most vendors at once. */
export interface WorstSingleEventSummary {
  substrate: string
  vendorKeys: string[]
  vendorNames: string[]
  /** Entrypoints downstream of the affected vendors' detected files. [] when the file graph isn't
   * available for this analysis (manual/PR-mode) — never fabricated. */
  entrypointsAffected: string[]
  /** The modeled q_s for this substrate — an annual probability, illustrative unless overridden. */
  probabilityPerYear: number
}

/** A pair (or small set) of vendors curated as substitutes for each other (server/src/vendorMap.ts
 * `fallbacks`) where BOTH are actually detected in this repo — real data, not an inferred guess. */
export interface RedundancyGroupSummary {
  memberKeys: string[]
  memberNames: string[]
  /** Exact P(every member down at once) — the capability is only lost if all substitutes fail together. */
  groupDownProbabilityPerYear: number
}

/** One compact summary object for the UI headline — computed by the exact engine, never sampled. */
export interface AvailabilityHeadline {
  /** Vendor count included in the analysis. */
  vendors: number
  /** Distinct real (shareable) substrates those vendors run on. */
  substrates: number
  /** Vendors whose only substrate tags are self-hosted/other/unknown — never counted as correlated. */
  unknownHostingVendorCount: number
  tailRisk: TailRiskPoint[]
  /** Extra expected downtime (hours/yr) from naive -> independent-same-marginals: substrate risk a
   * vendor's own SLA doesn't capture, before any sharing effect is even considered. */
  hiddenUpstreamHoursPerYear: number
  /** Expected-downtime change (hours/yr) from independent-same-marginals -> correlated. For a
   * series (need-everyone-up) system this is typically <= 0: sharing a substrate doesn't add
   * expected downtime, it turns many small independent outages into fewer, bigger, simultaneous
   * ones — which is what tailRisk above is for. Never read this as "sharing is safe." */
  concentrationEffectHoursPerYear: number
  worstSingleEvent: WorstSingleEventSummary | null
  /** [] when no curated fallback pair is present in this repo — reported, not hidden. */
  redundancyGroups: RedundancyGroupSummary[]
  /** Expected annual financial exposure under the correlated model, in whatever unit costPerHourOfDowntime was supplied in. */
  expectedLossPerYear: number
}

/** A structured remediation runbook for one vendor's failure. */
export interface Runbook {
  summary: string
  riskLevel: 'Low' | 'Medium' | 'High'
  recommendedActions: string[]
  suggestedFallbacks?: string[]
  /** Which path produced this — the demo should never hide when Bedrock wasn't reachable. */
  generatedBy: 'bedrock' | 'deterministic'
}

/** "unknown" is a first-class, honest outcome here — never silently presented as "operational". */
export type StatusIndicator = 'operational' | 'degraded' | 'outage' | 'unknown'

export interface VendorStatus {
  vendorKey: string
  indicator: StatusIndicator
  description?: string
  checkedAt: string
  /** True when the status source could not be reached/parsed — indicator is 'unknown', not faked. */
  stale: boolean
}

export interface AwsHealthStatus {
  /** Which source actually answered — the account-specific API, a public feed, or neither. */
  source: 'aws-health-api' | 'public-status-feed' | 'unknown'
  indicator: StatusIndicator
  checkedAt: string
  note?: string
}

export type IacProvider = 'aws' | 'gcp' | 'azure' | 'cloudflare' | 'vercel' | 'other'

/** A cloud-provider signal found in an IaC file (Terraform, serverless.yml, vercel.json). */
export interface IacSubstrateSignal {
  provider: IacProvider
  resourceType?: string
  source: string
}
