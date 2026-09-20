import { useEffect, useMemo, useState } from 'react'
import type { AnalyzePrResponse, AnalyzeRepoResponse, SimulateResponse, StatusResponse } from '../lib/api'
import { analyzeRepo, ApiError, fetchRunbook, fetchStatus, simulate } from '../lib/api'
import { buildAvailabilityHeadline, buildScenarioAvailabilityOverlay, computeExactAvailability, PRESET_SCENARIOS } from '../lib/availability'
import { analyzeDetectedRedundancy } from '../lib/detectedRedundancy'
import { buildAdjacencyMap, getBlastRadius } from '../lib/graph'
import { computeStatusChip } from '../lib/statusChip'
import type {
  AnalysisSnapshotSummary,
  ConcentrationResult,
  CriticalityResult,
  GraphData,
  NodeCriticality,
  OwnInfrastructure,
  Runbook,
  UnclassifiedSummary,
  Vendor,
  VendorGraph,
} from '../lib/types'
import { buildVendorRiskRows } from '../lib/vendorRiskRegister'
import { selectBannerVendor } from '../lib/vendorStatusBanner'
import {
  buildCriticalityItemWhy,
  buildExpectedLossWhy,
  buildRiskRegisterRowWhy,
  buildVendorsSubstratesWhy,
  type WhyContent,
} from '../lib/whyDrawer'
import { decodeScenarioSelection } from '../lib/scenarioShare'
import {
  indexVerificationByVendorKey,
  loadSubstrateVerification,
  summarizeSubstrateVerification,
  type SubstrateVerificationData,
} from '../lib/substrateVerification'
import { loadVerifiedFisActions } from '../lib/fisActions'
import { fisScenarioForVendorTier, getFisScenario, type FisScenarioDefinition } from '../lib/fisScenarios'
import type { VerifiedFisAction } from '../engine/fisTemplate'
import type { AvailabilityAssumptionsState } from '../hooks/useAvailabilityAssumptions'
import { useAvailabilityAssumptions } from '../hooks/useAvailabilityAssumptions'
import type { ScenarioResult, ScenarioSelection } from '../engine/scenario'
import { scenarioKnownIds } from '../engine/scenario'
import TopBar from './TopBar'
import GraphView from './GraphView'
import VendorGraphView from './VendorGraphView'
import VendorHeadlineCard from './VendorHeadlineCard'
import SidePanel from './SidePanel'
import PrSummaryPanel from './PrSummaryPanel'
import VendorDetailPanel from './VendorDetailPanel'
import StatusBanner from './StatusBanner'
import RiskOverview from './RiskOverview'
import UnclassifiedPanel from './UnclassifiedPanel'
import OwnInfraPanel from './OwnInfraPanel'
import DetectedRedundancyPanel from './DetectedRedundancyPanel'
import ConcentrationPanel from './ConcentrationPanel'
import AssumptionsPanel from './AssumptionsPanel'
import AvailabilityPanel from './AvailabilityPanel'
import CriticalityPanel from './CriticalityPanel'
import LiveStatusPanel from './LiveStatusPanel'
import RunbookPanel from './RunbookPanel'
import StatTile from './ui/StatTile'
import Drawer from './Drawer'
import WhyDrawerContent from './WhyDrawerContent'
import ScenarioBuilderPanel from './ScenarioBuilderPanel'
import FisValidateModal from './FisValidateModal'
import KbFooter from './KbFooter'
import HistoryPanel from './HistoryPanel'

export interface AnalyzedRepo {
  graph: GraphData
  vendors: Vendor[]
  vendorGraph: VendorGraph
  concentration: ConcentrationResult
  criticality: CriticalityResult
  /** null for manual-JSON/PR-mode graphs (no scan ran) — never fabricated as "0 found". */
  unclassified: UnclassifiedSummary | null
  /** Static IaC resilience linter over the repo's OWN infrastructure — display only, never a vendor.
   * null for manual-JSON/PR-mode graphs, or a snapshot generated before this feature existed —
   * never fabricated as "scanned, found nothing". */
  own: OwnInfrastructure | null
  meta: {
    owner: string
    repo: string
    branch: string
    truncated: boolean
    truncatedReason?: 'file_cap' | 'time_budget'
    filesScanned: number
    filesSelected: number
    importResolution: { total: number; resolved: number }
  } | null
  /** Only set for a real repo scan — required to call /simulate, /status, /runbook. */
  repoUrl: string | null
  /** Set when this came from a pre-generated demo snapshot rather than a live /analyze-repo call.
   * The server has never cached this repo, so /simulate, /status, and /runbook would all 404 —
   * those panels are replaced with an "Analyze live" prompt instead of letting them fail. */
  snapshot: { sha: string; generatedAt: string } | null
  /** Embedded (frozen, from snapshot-generation time) DNS-substrate-verification results, when this
   * analysis came from a demo snapshot that had them. null for a live analysis (Workspace fetches
   * the current /substrate-verification.json itself instead — see its own effect) or a snapshot
   * generated before this feature existed. */
  substrateVerification: SubstrateVerificationData | null
  /** Embedded (frozen, from snapshot-generation time) analysis-history samples, when this analysis
   * came from a demo snapshot that had them — the History tab uses this instead of a live
   * GET /history call, zero network in demo mode. null for a live analysis (History tab fetches
   * live instead) or a snapshot generated before this feature existed — never fabricated as []. */
  history: AnalysisSnapshotSummary[] | null
}

interface WorkspaceProps {
  analyzed: AnalyzedRepo
  prResult: AnalyzePrResponse | null
  onReset: () => void
  onClearPr: () => void
  /** Called after a successful "Analyze live" — same signature as App.tsx's own repo-analyzed
   * handler, so a live analysis replaces the snapshot exactly like a fresh analysis would. */
  onLiveAnalysisComplete: (result: AnalyzeRepoResponse, repoUrl: string) => void
}

type View = 'graph' | 'overview' | 'history'
type GraphMode = 'vendors' | 'files'

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function Workspace({ analyzed, prResult, onReset, onClearPr, onLiveAnalysisComplete }: WorkspaceProps) {
  const hasVendorData = analyzed.repoUrl !== null
  const isSnapshot = analyzed.snapshot !== null
  const [view, setView] = useState<View>('graph')
  const [graphMode, setGraphMode] = useState<GraphMode>(hasVendorData ? 'vendors' : 'files')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedVendorKey, setSelectedVendorKey] = useState<string | null>(null)
  const [vendorFileHighlight, setVendorFileHighlight] = useState<{
    directFiles: string[]
    affectedFiles: string[]
  } | null>(null)

  const [simulation, setSimulation] = useState<SimulateResponse | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>(undefined)
  const [isAnalyzingLive, setIsAnalyzingLive] = useState(false)
  const [analyzeLiveError, setAnalyzeLiveError] = useState<string | null>(null)
  // Debounced edits re-run whichever scenario (or baseline) is currently active, so tweaking an
  // assumption updates the view you're looking at instead of silently resetting it — except in
  // snapshot mode, where the server has never analyzed this repo and /simulate would just 404.
  const { assumptions, setAssumptions } = useAvailabilityAssumptions(analyzed.repoUrl, (next) => {
    if (!isSnapshot) runSimulation(activeScenarioId, next)
  })

  const [statusResult, setStatusResult] = useState<StatusResponse | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  // Independent of the substrate-scenario `simulation` above — "Simulate this vendor's outage"
  // (VendorDetailPanel) or "Show blast radius" (the live-status banner) sets this directly.
  const [singleVendorCascadeTarget, setSingleVendorCascadeTarget] = useState<string | null>(null)

  const [runbook, setRunbook] = useState<Runbook | null>(null)
  const [isLoadingRunbook, setIsLoadingRunbook] = useState(false)
  const [runbookError, setRunbookError] = useState<string | null>(null)

  const [whyContent, setWhyContent] = useState<WhyContent | null>(null)

  // Decoded once, on mount, from ?scenario= — never re-derived on later renders (a scenario link
  // is a one-time "open with this pre-filled" seed, not something that should fight further edits).
  const [initialScenarioSelection] = useState<ScenarioSelection | null>(() => {
    if (typeof window === 'undefined') return null
    const encoded = new URLSearchParams(window.location.search).get('scenario')
    if (!encoded) return null
    return decodeScenarioSelection(encoded, scenarioKnownIds(analyzed.vendorGraph.vendors))
  })
  const [scenarioBuilderOpen, setScenarioBuilderOpen] = useState(() => initialScenarioSelection !== null)

  // Substrate verification is repo-independent (it's about whether "Stripe" is really on AWS, not
  // about this specific repo), so it's never part of the /analyze-repo response — snapshot mode
  // gets it pre-embedded (frozen at generation time, zero network); live mode fetches the current
  // static JSON once. Either way this is a plain static-asset fetch, never a live DNS call — the
  // verification script (scripts/verify-substrates.ts) is the only thing that ever touches DNS.
  const [liveSubstrateVerification, setLiveSubstrateVerification] = useState<SubstrateVerificationData | null>(null)
  useEffect(() => {
    if (isSnapshot) return
    let cancelled = false
    loadSubstrateVerification().then((data) => {
      if (!cancelled) setLiveSubstrateVerification(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const substrateVerification = analyzed.substrateVerification ?? liveSubstrateVerification
  const verificationByVendorKey = useMemo(() => indexVerificationByVendorKey(substrateVerification), [substrateVerification])
  const substrateVerificationSummary = useMemo(
    () => summarizeSubstrateVerification(substrateVerification, analyzed.vendors.map((v) => v.key)),
    [substrateVerification, analyzed.vendors],
  )

  // Static, repo-independent constant data (the verified FIS action catalog) — fetched once,
  // never a live AWS call. Used only by the "Validate this in your account" modal below.
  const [fisActions, setFisActions] = useState<VerifiedFisAction[]>([])
  useEffect(() => {
    loadVerifiedFisActions().then((data) => setFisActions(data?.actions ?? []))
  }, [])
  const [fisModal, setFisModal] = useState<{ scenario: FisScenarioDefinition; targetTags: Record<string, string> } | null>(null)

  const adjacencyMap = useMemo(
    () => buildAdjacencyMap(analyzed.graph.nodes, analyzed.graph.edges),
    [analyzed.graph],
  )
  const nodesById = useMemo(() => new Map(analyzed.graph.nodes.map((n) => [n.id, n])), [analyzed.graph])
  const vendorNameByKey = useMemo(
    () => new Map(analyzed.vendors.map((v) => [v.key, v.vendor])),
    [analyzed.vendors],
  )

  const isPrMode = prResult !== null && selectedNodeId === null && vendorFileHighlight === null
  const selectedNode = selectedNodeId ? (nodesById.get(selectedNodeId) ?? null) : null
  const blastRadius = useMemo(
    () => (selectedNodeId ? getBlastRadius(selectedNodeId, adjacencyMap) : null),
    [selectedNodeId, adjacencyMap],
  )
  const selectedVendor = selectedVendorKey
    ? (analyzed.vendorGraph.vendors.find((v) => v.key === selectedVendorKey) ?? null)
    : null

  const criticalVendorKeys = useMemo(() => {
    const articulationSet = new Set(analyzed.criticality.articulationPoints)
    return new Set(
      analyzed.vendorGraph.vendors
        .filter((v) => v.affectedFiles.some((f) => articulationSet.has(f)))
        .map((v) => v.key),
    )
  }, [analyzed.vendorGraph, analyzed.criticality])

  const statusChip = useMemo(
    () => computeStatusChip(statusResult?.vendorStatuses ?? null, isLoadingStatus),
    [statusResult, isLoadingStatus],
  )

  // Computed client-side — buildAvailabilityHeadline/computeExactAvailability are pure, dependency-free
  // functions shared with the backend, so the headline card and default-scenario pick don't need a
  // network round trip and are available the instant a repo is analyzed, not just after "Run".
  const clientExactResult = useMemo(
    () =>
      computeExactAvailability(analyzed.vendors, {
        costPerHourOfDowntime: assumptions.costPerHour,
        vendorSlaOverrides: assumptions.vendorSlaOverrides,
        substrateOutageProbabilities: assumptions.substrateRateOverrides,
      }),
    [analyzed.vendors, assumptions],
  )
  const clientHeadline = useMemo(
    () => buildAvailabilityHeadline(analyzed.vendors, clientExactResult),
    [analyzed.vendors, clientExactResult],
  )

  // Same override channel as the Assumptions panel, threaded into every exact-engine call below —
  // detected redundancy, the client headline, and every WHY-drawer what-if all stay in sync with
  // whatever the user has edited.
  const correlatedOverrides = useMemo(
    () => ({
      vendorSlaOverrides: assumptions.vendorSlaOverrides,
      substrateOutageProbabilities: assumptions.substrateRateOverrides,
    }),
    [assumptions],
  )

  const detectedRedundancyGroups = useMemo(
    () => analyzeDetectedRedundancy(analyzed.vendors, correlatedOverrides),
    [analyzed.vendors, correlatedOverrides],
  )

  // Same inputs RiskOverview/VendorRiskRegister already compute rows from — kept here too so a
  // WHY-drawer trigger on a risk-register row can look its row back up by vendor key.
  const vendorRiskRows = useMemo(
    () =>
      buildVendorRiskRows(
        analyzed.vendorGraph.vendors,
        analyzed.criticality.entrypoints,
        clientExactResult.expectedDowntimeHoursPerYear.naive,
        assumptions.costPerHour,
      ),
    [analyzed.vendorGraph, analyzed.criticality, clientExactResult, assumptions.costPerHour],
  )

  const defaultScenarioId = useMemo(() => {
    const mostConcentratedSubstrate = analyzed.concentration.mostConcentrated?.substrate
    return (
      PRESET_SCENARIOS.find((s) => s.downSubstrates[0] === mostConcentratedSubstrate)?.id ?? PRESET_SCENARIOS[0]?.id ?? ''
    )
  }, [analyzed.concentration])

  const entrypointsAffectedByVendorKey = useMemo(() => {
    const entrypointSet = new Set(analyzed.criticality.entrypoints)
    return new Map(
      analyzed.vendorGraph.vendors.map((v) => [v.key, v.affectedFiles.filter((f) => entrypointSet.has(f)).length]),
    )
  }, [analyzed.vendorGraph, analyzed.criticality])

  const bannerCandidate = useMemo(
    () => selectBannerVendor(statusResult?.vendorStatuses ?? [], entrypointsAffectedByVendorKey),
    [statusResult, entrypointsAffectedByVendorKey],
  )
  const bannerVendorStatus = bannerCandidate
    ? (statusResult?.vendorStatuses.find((s) => s.vendorKey === bannerCandidate.vendorKey) ?? null)
    : null

  function handleSelectVendor(key: string | null) {
    setSelectedVendorKey(key)
    setSingleVendorCascadeTarget(null)
    setRunbook(null)
    setRunbookError(null)
  }

  function handleSimulateVendorOutage(key: string) {
    setSingleVendorCascadeTarget(key)
  }

  function handleViewAffectedFiles() {
    if (!selectedVendor) return
    setGraphMode('files')
    setSelectedNodeId(null)
    onClearPr()
    setVendorFileHighlight({ directFiles: selectedVendor.directFiles, affectedFiles: selectedVendor.affectedFiles })
  }

  function handleShowBlastRadiusForVendor(key: string) {
    setGraphMode('vendors')
    setView('graph')
    setSelectedVendorKey(key)
    setSingleVendorCascadeTarget(key)
  }

  function handleNodeClick(nodeId: string) {
    setVendorFileHighlight(null)
    onClearPr()
    setSelectedNodeId(nodeId)
  }

  function handleSelectFromOverview(nodeId: string) {
    setVendorFileHighlight(null)
    onClearPr()
    setSelectedNodeId(nodeId)
    setGraphMode('files')
    setView('graph')
  }

  function handleSelectVendorFromRegister(key: string) {
    handleSelectVendor(key)
    setGraphMode('vendors')
    setView('graph')
  }

  function handleWhyVendorsSubstrates() {
    setWhyContent(buildVendorsSubstratesWhy(analyzed.vendors, clientHeadline, correlatedOverrides))
  }

  function handleWhyExpectedLoss() {
    setWhyContent(buildExpectedLossWhy(clientHeadline, clientExactResult, assumptions.currency))
  }

  function handleWhyVendor(key: string) {
    const row = vendorRiskRows.find((r) => r.key === key)
    const vendor = analyzed.vendorGraph.vendors.find((v) => v.key === key)
    if (!row || !vendor) return
    setWhyContent(
      buildRiskRegisterRowWhy(row, vendor, analyzed.vendors, assumptions.currency, correlatedOverrides, verificationByVendorKey.get(key)),
    )
  }

  function handleWhyNode(node: NodeCriticality) {
    setWhyContent(buildCriticalityItemWhy(node))
  }

  // "Validate this in your account" — the tags below are ILLUSTRATIVE (derived from what this
  // analysis actually knows: the worst-single-event substrate, or the one vendor selected), never
  // the user's real AWS resource tags. The modal's own README/checklist makes clear these must be
  // edited to match what's actually tagged in their account before anything is deployed.
  function handleValidateAzDisruption() {
    const substrate = clientHeadline.worstSingleEvent?.substrate
    setFisModal({ scenario: getFisScenario('az-disruption'), targetTags: substrate ? { substrate } : { scenario: 'az-disruption' } })
  }

  function handleValidateVendor(vendor: { key: string; tier: string }) {
    setFisModal({ scenario: fisScenarioForVendorTier(vendor.tier), targetTags: { vendor: vendor.key } })
  }

  // Feeds the existing cascade animation the same way picking a preset scenario already does — a
  // compound scenario's down set is a superset of what a plain substrate filter would find (it also
  // includes explicitly-selected vendors), so it's built directly from the scenario result rather
  // than re-deriving via simulateFailureScenario. The exact-availability numbers stay the baseline
  // (the engine has no per-scenario conditioning today — the same simplification /simulate already
  // makes for preset scenarios); only expectedLossPerYear is overridden with this scenario's own
  // modeled annual cost, so the cascade's dollar figure reflects what was actually built, not the
  // unconditional baseline.
  function handleRunScenario(result: ScenarioResult, selection: ScenarioSelection) {
    const downSet = new Set(result.downVendorKeys)
    const affectedVendors = analyzed.vendors.filter((v) => downSet.has(v.key))
    const unaffectedVendors = analyzed.vendors.filter((v) => !downSet.has(v.key))
    const overlay = buildScenarioAvailabilityOverlay(clientExactResult, clientHeadline, result.expectedDowntimeHoursPerYear, result.expectedAnnualCost)
    setSimulation({
      scenario: {
        scenario: { id: 'scenario-builder', label: 'Compound scenario', downSubstrates: selection.substrates },
        affectedVendors,
        unaffectedVendors,
        affectedCount: affectedVendors.length,
        totalCount: analyzed.vendors.length,
        affectedShare: analyzed.vendors.length > 0 ? affectedVendors.length / analyzed.vendors.length : 0,
      },
      simulation: overlay.simulation,
      presetScenarios: PRESET_SCENARIOS,
      headline: overlay.headline,
    })
    setSingleVendorCascadeTarget(null)
    setActiveScenarioId(undefined)
    setGraphMode('vendors')
    setView('graph')
    setScenarioBuilderOpen(false)
  }

  async function runSimulation(scenarioId: string | undefined, withAssumptions: AvailabilityAssumptionsState) {
    if (!analyzed.repoUrl) return
    setActiveScenarioId(scenarioId)
    setSingleVendorCascadeTarget(null) // a substrate-scenario cascade and a per-vendor one never run at once
    setIsSimulating(true)
    setSimulationError(null)
    try {
      const result = await simulate({
        repoUrl: analyzed.repoUrl,
        scenarioId,
        costPerHourOfDowntime: withAssumptions.costPerHour,
        vendorSlaOverrides: withAssumptions.vendorSlaOverrides,
        substrateFailureProbabilities: withAssumptions.substrateRateOverrides,
      })
      setSimulation(result)
      if (scenarioId) {
        setGraphMode('vendors')
        setSelectedVendorKey(null)
      }
    } catch (err) {
      setSimulationError(apiErrorMessage(err, 'Could not run the simulation.'))
    } finally {
      setIsSimulating(false)
    }
  }

  async function handleSimulateScenario(scenarioId: string) {
    await runSimulation(scenarioId, assumptions)
  }

  async function handleRunBaseline() {
    await runSimulation(undefined, assumptions)
  }

  async function handleRefreshStatus() {
    if (!analyzed.repoUrl) return
    setIsLoadingStatus(true)
    setStatusError(null)
    try {
      setStatusResult(await fetchStatus(analyzed.repoUrl))
    } catch (err) {
      setStatusError(apiErrorMessage(err, 'Could not fetch live status.'))
    } finally {
      setIsLoadingStatus(false)
    }
  }

  // Auto-fetch live status once on load — non-blocking (the rest of the workspace renders
  // immediately; LiveStatusPanel shows per-vendor skeletons while this is in flight). Workspace
  // remounts per repo (App.tsx unmounts it between analyses), so an empty dependency array means
  // "once per repo", not "once ever".
  useEffect(() => {
    if (hasVendorData && !isSnapshot) void handleRefreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAnalyzeLive() {
    if (!analyzed.repoUrl) return
    setIsAnalyzingLive(true)
    setAnalyzeLiveError(null)
    try {
      const result = await analyzeRepo(analyzed.repoUrl)
      onLiveAnalysisComplete(result, analyzed.repoUrl)
    } catch (err) {
      setAnalyzeLiveError(apiErrorMessage(err, 'Could not analyze this repo live.'))
    } finally {
      setIsAnalyzingLive(false)
    }
  }

  async function handleGenerateRunbook() {
    if (!analyzed.repoUrl || !selectedVendorKey) return
    setIsLoadingRunbook(true)
    setRunbookError(null)
    try {
      const scenarioLabel = simulation?.scenario?.scenario.label
      setRunbook(await fetchRunbook(analyzed.repoUrl, selectedVendorKey, scenarioLabel))
    } catch (err) {
      setRunbookError(apiErrorMessage(err, 'Could not generate a runbook.'))
    } finally {
      setIsLoadingRunbook(false)
    }
  }

  const repoLabel = analyzed.meta ? `${analyzed.meta.owner}/${analyzed.meta.repo}` : null
  const mostConcentrated = analyzed.concentration.mostConcentrated

  // Only shown when there's real internal-import data to report — never fabricated for a
  // manual-JSON/PR-mode graph (meta is null there) or a repo with zero internal imports found.
  const importResolutionBadge = (() => {
    const stats = analyzed.meta?.importResolution
    if (!stats || stats.total === 0) return null
    const pct = Math.round((stats.resolved / stats.total) * 100)
    const color = pct >= 90 ? 'var(--status-good)' : pct >= 60 ? 'var(--status-warning)' : 'var(--status-critical)'
    return { label: `${pct}% of internal imports resolved`, color }
  })()

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        repoLabel={repoLabel}
        branch={analyzed.meta?.branch ?? null}
        hasVendorData={hasVendorData && !isSnapshot}
        statusChip={statusChip}
        isSimulating={isSimulating}
        defaultScenarioId={defaultScenarioId}
        onSimulate={handleSimulateScenario}
        onReset={onReset}
        snapshotInfo={analyzed.snapshot}
        onAnalyzeLive={handleAnalyzeLive}
        isAnalyzingLive={isAnalyzingLive}
      />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          {hasVendorData && (
            <VendorHeadlineCard
              headline={clientHeadline}
              result={clientExactResult}
              currency={assumptions.currency}
              vendors={analyzed.vendors}
              unclassifiedCount={analyzed.unclassified?.totalCount}
              substrateVerificationSummary={substrateVerificationSummary ?? undefined}
              onWhyVendorsSubstrates={handleWhyVendorsSubstrates}
              onWhyExpectedLoss={handleWhyExpectedLoss}
            />
          )}
          {bannerCandidate && bannerVendorStatus && (
            <StatusBanner
              candidate={bannerCandidate}
              vendorName={vendorNameByKey.get(bannerCandidate.vendorKey) ?? bannerCandidate.vendorKey}
              checkedAt={bannerVendorStatus.checkedAt}
              onShowBlastRadius={() => handleShowBlastRadiusForVendor(bannerCandidate.vendorKey)}
            />
          )}
          {analyzed.meta?.truncated && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              <span aria-hidden="true">⚠</span>
              <span>
                Scan stopped early ({analyzed.meta.truncatedReason === 'file_cap' ? 'file-count' : 'time budget'}) — {analyzed.meta.filesScanned} of {analyzed.meta.filesSelected} files scanned.
                Results below reflect a partial scan, not the whole repo.
              </span>
            </div>
          )}
          {hasVendorData && (
            <div className="flex flex-wrap gap-3">
              <StatTile label="Vendors" value={analyzed.vendors.length} />
              <StatTile label="Substrates" value={analyzed.concentration.substrateCount} />
              <StatTile
                label="Correlated exposure"
                value={mostConcentrated?.vendorKeys.length ?? 0}
                hint={mostConcentrated ? `on ${mostConcentrated.substrate}` : undefined}
              />
              {simulation && (
                <StatTile
                  label="Effective availability"
                  value={simulation.simulation.correlatedAvailability * 100}
                  format={(n) => `${n.toFixed(2)}%`}
                  tone="accent"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {hasVendorData && (
              <button
                type="button"
                onClick={() => {
                  setView('graph')
                  setGraphMode('vendors')
                }}
                className={`rounded-md border px-2.5 py-1 font-medium ${graphMode === 'vendors' && view === 'graph' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                Vendor graph
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setView('graph')
                setGraphMode('files')
              }}
              className={`rounded-md border px-2.5 py-1 font-medium ${graphMode === 'files' && view === 'graph' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              File graph
            </button>
            <button
              type="button"
              onClick={() => setView('overview')}
              className={`rounded-md border px-2.5 py-1 font-medium ${view === 'overview' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              Risk register
            </button>
            {hasVendorData && repoLabel && (
              <button
                type="button"
                onClick={() => setView('history')}
                className={`rounded-md border px-2.5 py-1 font-medium ${view === 'history' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                History
              </button>
            )}
            {hasVendorData && (
              <button
                type="button"
                onClick={() => setScenarioBuilderOpen(true)}
                className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Scenario builder
              </button>
            )}
            {graphMode === 'files' && view === 'graph' && importResolutionBadge && (
              <span
                className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[var(--text-secondary)]"
                title={`${analyzed.meta?.importResolution.resolved} of ${analyzed.meta?.importResolution.total} internal imports resolved to a known file`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: importResolutionBadge.color }}
                  aria-hidden="true"
                />
                {importResolutionBadge.label}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
            {view === 'history' && repoLabel ? (
              <HistoryPanel
                repo={repoLabel}
                repoUrl={analyzed.repoUrl}
                embeddedHistory={analyzed.history}
                isSnapshotMode={isSnapshot}
                costPerHour={assumptions.costPerHour}
                vendorSlaOverrides={assumptions.vendorSlaOverrides}
                substrateOutageProbabilities={assumptions.substrateRateOverrides}
              />
            ) : view === 'overview' ? (
              <RiskOverview
                vendors={analyzed.vendorGraph.vendors}
                entrypoints={analyzed.criticality.entrypoints}
                naiveDowntimeHoursPerYear={clientExactResult.expectedDowntimeHoursPerYear.naive}
                costPerHour={assumptions.costPerHour}
                currency={assumptions.currency}
                vendorStatuses={statusResult?.vendorStatuses ?? null}
                verifications={verificationByVendorKey}
                onSelectVendor={handleSelectVendorFromRegister}
                onWhyVendor={handleWhyVendor}
                graphData={analyzed.graph}
                adjacencyMap={adjacencyMap}
                onSelectNode={handleSelectFromOverview}
              />
            ) : graphMode === 'vendors' ? (
              <VendorGraphView
                vendorGraph={analyzed.vendorGraph}
                repoLabel={repoLabel ?? 'Your application'}
                entrypoints={analyzed.criticality.entrypoints}
                selectedVendorKey={selectedVendorKey}
                onSelectVendor={handleSelectVendor}
                criticalVendorKeys={criticalVendorKeys}
                simulation={simulation}
                currency={assumptions.currency}
                costPerHour={assumptions.costPerHour}
                vendorStatuses={statusResult?.vendorStatuses}
                singleVendorTarget={singleVendorCascadeTarget}
              />
            ) : (
              <GraphView
                graphData={analyzed.graph}
                selectedNodeId={selectedNodeId}
                blastRadius={blastRadius}
                onNodeClick={handleNodeClick}
                highlightedNodeIds={
                  isPrMode
                    ? prResult!.changedNodes.map((n) => n.id)
                    : (vendorFileHighlight?.directFiles ?? undefined)
                }
                combinedBlastRadius={
                  isPrMode
                    ? prResult!.combinedBlastRadius
                    : vendorFileHighlight
                      ? {
                          downstream: vendorFileHighlight.affectedFiles.filter(
                            (f) => !vendorFileHighlight.directFiles.includes(f),
                          ),
                          upstream: [],
                        }
                      : undefined
                }
              />
            )}
          </div>
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-[var(--border-subtle)] p-4 lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l">
          {isPrMode && prResult ? (
            <PrSummaryPanel result={prResult} onClear={onClearPr} />
          ) : selectedNode && blastRadius ? (
            <SidePanel selectedNode={selectedNode} blastRadius={blastRadius} nodesById={nodesById} onClear={() => setSelectedNodeId(null)} />
          ) : selectedVendor ? (
            <VendorDetailPanel
              key={selectedVendor.key}
              vendor={selectedVendor}
              entrypoints={analyzed.criticality.entrypoints}
              costPerHour={assumptions.costPerHour}
              currency={assumptions.currency}
              verification={verificationByVendorKey.get(selectedVendor.key)}
              onViewFiles={handleViewAffectedFiles}
              onSimulateOutage={() => handleSimulateVendorOutage(selectedVendor.key)}
              onValidateInAccount={() => handleValidateVendor(selectedVendor)}
              onClear={() => handleSelectVendor(null)}
            />
          ) : (
            <div className="panel-glass animate-rise-in rounded-xl p-4 text-sm text-[var(--text-muted)]">
              {graphMode === 'vendors'
                ? 'Click a vendor node to see its blast radius, detection provenance, and remediation options.'
                : 'Click a file node to see its upstream/downstream blast radius.'}
            </div>
          )}

          <ConcentrationPanel concentration={analyzed.concentration} />
          <CriticalityPanel criticality={analyzed.criticality} onSelectFile={handleNodeClick} onWhyNode={handleWhyNode} />
          <DetectedRedundancyPanel groups={detectedRedundancyGroups} />
          <UnclassifiedPanel unclassified={analyzed.unclassified} />
          <OwnInfraPanel own={analyzed.own} />

          {hasVendorData && (
            <>
              <AssumptionsPanel vendors={analyzed.vendors} assumptions={assumptions} onChange={setAssumptions} />
              {isSnapshot ? (
                <div className="panel-glass animate-rise-in rounded-xl p-4 text-sm text-[var(--text-secondary)]">
                  <p className="mb-2">
                    Availability simulation, live status, and runbooks need a live analysis — this is a pre-generated
                    snapshot, so the server has never scanned this repo.
                  </p>
                  <button
                    type="button"
                    onClick={handleAnalyzeLive}
                    disabled={isAnalyzingLive}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
                  >
                    {isAnalyzingLive ? 'Analyzing…' : 'Analyze live'}
                  </button>
                  {analyzeLiveError && (
                    <p className="mt-2 text-red-300" role="alert">
                      {analyzeLiveError}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <AvailabilityPanel
                    simulation={simulation}
                    isLoading={isSimulating}
                    error={simulationError}
                    currency={assumptions.currency}
                    onRun={handleRunBaseline}
                    onValidateInAccount={handleValidateAzDisruption}
                  />
                  <LiveStatusPanel
                    vendorStatuses={statusResult?.vendorStatuses ?? null}
                    awsHealth={statusResult?.awsHealth ?? null}
                    isLoading={isLoadingStatus}
                    error={statusError}
                    onRefresh={handleRefreshStatus}
                    vendorNameByKey={vendorNameByKey}
                  />
                  <RunbookPanel
                    vendorName={selectedVendor?.vendor ?? null}
                    runbook={runbook}
                    isLoading={isLoadingRunbook}
                    error={runbookError}
                    onGenerate={handleGenerateRunbook}
                  />
                </>
              )}
            </>
          )}
        </aside>
      </div>

      <KbFooter />

      <Drawer isOpen={whyContent !== null} onClose={() => setWhyContent(null)} title={whyContent?.title ?? 'Why'}>
        {whyContent && <WhyDrawerContent content={whyContent} />}
      </Drawer>

      <Drawer isOpen={scenarioBuilderOpen} onClose={() => setScenarioBuilderOpen(false)} title="Compound failure scenario">
        {hasVendorData && (
          <ScenarioBuilderPanel
            vendors={analyzed.vendorGraph.vendors}
            entrypoints={analyzed.criticality.entrypoints}
            costPerHour={assumptions.costPerHour}
            currency={assumptions.currency}
            overrides={correlatedOverrides}
            baselineExpectedLossPerYear={clientHeadline.expectedLossPerYear}
            repoUrl={analyzed.repoUrl}
            initialSelection={initialScenarioSelection}
            onRun={handleRunScenario}
          />
        )}
      </Drawer>

      {fisModal && (
        <FisValidateModal
          isOpen
          onClose={() => setFisModal(null)}
          scenario={fisModal.scenario}
          targetTags={fisModal.targetTags}
          region="us-east-1"
          verifiedActions={fisActions}
        />
      )}
    </div>
  )
}

export default Workspace
