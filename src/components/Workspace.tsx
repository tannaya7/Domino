import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzePrResponse, AnalyzeRepoResponse, GateResponse, SimulateResponse, StatusResponse } from '../lib/api'
import { analyzeRepo, ApiError, askBlastRadius, fetchRunbook, fetchStatus, simulate } from '../lib/api'
import {
  affectedEntrypointsForScenario,
  buildAvailabilityHeadline,
  computeExactAvailability,
  hiddenSharePercent,
  PRESET_SCENARIOS,
  simulateFailureScenario,
} from '../lib/availability'
import { outageForReplayScenarioId } from '../data/historicalOutages'
import { buildAdjacencyMap, getBlastRadius } from '../lib/graph'
import { buildOfflineSimulateResponse } from '../lib/offlineSimulate'
import { computeStatusChip } from '../lib/statusChip'
import type { AskResult, ConcentrationResult, CriticalityResult, GraphData, RecommendedMove, Runbook, Vendor, VendorGraph, WhatIfOverride, WhatIfResult } from '../lib/types'
import { selectBannerVendor } from '../lib/vendorStatusBanner'
import type { AvailabilityAssumptionsState } from '../hooks/useAvailabilityAssumptions'
import { useAvailabilityAssumptions } from '../hooks/useAvailabilityAssumptions'
import { IDLE_TOUR_CONTROLLER, type TourController } from '../tour/useTour'
import { buildTourSteps } from '../tour/steps'
import TopBar from './TopBar'
import GraphView from './GraphView'
import VendorGraphView from './VendorGraphView'
import VendorHeadlineCard from './VendorHeadlineCard'
import SidePanel from './SidePanel'
import PrSummaryPanel from './PrSummaryPanel'
import VendorDetailPanel from './VendorDetailPanel'
import StatusBanner from './StatusBanner'
import RiskOverview from './RiskOverview'
import ConcentrationPanel from './ConcentrationPanel'
import AssumptionsPanel from './AssumptionsPanel'
import AvailabilityPanel from './AvailabilityPanel'
import HistoricalReplayPanel from './HistoricalReplayPanel'
import CriticalityPanel from './CriticalityPanel'
import LiveStatusPanel from './LiveStatusPanel'
import RecommendedMovesPanel from './RecommendedMovesPanel'
import RunbookPanel from './RunbookPanel'
import AskPanel from './AskPanel'
import StatTile from './ui/StatTile'
import { MAX_WHATIF_STACK } from './WhatIfPanel'

export interface AnalyzedRepo {
  graph: GraphData
  vendors: Vendor[]
  vendorGraph: VendorGraph
  concentration: ConcentrationResult
  criticality: CriticalityResult
  meta: {
    owner: string
    repo: string
    branch: string
    truncated: boolean
    filesScanned: number
    importResolution: { total: number; resolved: number }
  } | null
  /** Only set for a real repo scan — required to call /simulate, /status, /runbook. */
  repoUrl: string | null
  /** Set when this came from a pre-generated demo snapshot rather than a live /analyze-repo call.
   * The server has never cached this repo, so /simulate, /status, and /runbook would all 404 —
   * those panels are replaced with an "Analyze live" prompt instead of letting them fail. */
  snapshot: { sha: string; generatedAt: string } | null
  /** Precomputed by scripts/snapshot-repo.ts (server/src/whatIf.ts, same deterministic ranking a
   * live /simulate call would return) — lets the guided tour's "recommended move" step show a real
   * number with the API down. undefined for a live analysis or a snapshot with no curated move. */
  tourTopMove?: RecommendedMove
  tourTopMoveWhatIf?: WhatIfResult
  /** Ask Blast Radius's free-text input only shows when this is true. Always false for a snapshot
   * (the server has never cached this repo, so /ask would 404 — same reasoning as isSnapshot
   * hiding AvailabilityPanel/RunbookPanel elsewhere in this file). */
  bedrockAvailable: boolean
}

interface WorkspaceProps {
  analyzed: AnalyzedRepo
  prResult: AnalyzePrResponse | null
  /** Optional (defaults to null) so existing tests/callers that don't exercise the PR Resilience
   * Gate don't need to wire it up. */
  gateResult?: GateResponse | null
  gateError?: string | null
  onReset: () => void
  onClearPr: () => void
  /** Called after a successful "Analyze live" — same signature as App.tsx's own repo-analyzed
   * handler, so a live analysis replaces the snapshot exactly like a fresh analysis would. */
  onLiveAnalysisComplete: (result: AnalyzeRepoResponse, repoUrl: string) => void
  /** Bubbles all the way to App.tsx — Workspace doesn't own `analyzed`, so it can't itself load the
   * bundled tour snapshot when a different repo is currently open. Optional (no-op default) so
   * existing tests/callers that don't care about the tour don't need to wire it up. */
  onPlayTour?: () => void
  tour?: TourController
  /** True right after App.tsx has (re)loaded the bundled tour snapshot and armed the tour — consumed
   * (flipped back via onTourAutoStartConsumed) the moment this Workspace's own steps are ready and
   * tour.start() actually fires, so it never re-fires on an unrelated re-render. */
  tourAutoStart?: boolean
  onTourAutoStartConsumed?: () => void
}

type View = 'graph' | 'overview'
type GraphMode = 'vendors' | 'files'

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function Workspace({
  analyzed,
  prResult,
  gateResult = null,
  gateError = null,
  onReset,
  onClearPr,
  onLiveAnalysisComplete,
  onPlayTour = () => {},
  tour = IDLE_TOUR_CONTROLLER,
  tourAutoStart = false,
  onTourAutoStartConsumed = () => {},
}: WorkspaceProps) {
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
    if (!isSnapshot) {
      runSimulation(activeScenarioId, next)
      void runWhatIf(whatIfStack, next)
    }
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

  const [askResult, setAskResult] = useState<AskResult | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  // What-if mitigation preview (Prompt 15) — up to MAX_WHATIF_STACK stacked overrides, computed by
  // the same exact engine as `simulation` above under the SAME assumptions, so `whatIfResult.delta`
  // reflects only the override, never assumption drift. recommendedMoves rides along on every call
  // since /simulate always computes it and it's cheap relative to the round trip itself.
  const [whatIfStack, setWhatIfStack] = useState<WhatIfOverride[]>([])
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null)
  const [isLoadingWhatIf, setIsLoadingWhatIf] = useState(false)
  const [whatIfError, setWhatIfError] = useState<string | null>(null)
  const [recommendedMoves, setRecommendedMoves] = useState<RecommendedMove[]>([])

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

  // Separate from `simulation` above — a substrate-outage scenario and the what-if stack are
  // independent lenses on the same repo, and stacking a what-if should never clobber whichever
  // scenario is currently shown in the graph/AvailabilityPanel (or vice versa).
  async function runWhatIf(stack: WhatIfOverride[], withAssumptions: AvailabilityAssumptionsState) {
    if (!analyzed.repoUrl) return
    setIsLoadingWhatIf(true)
    setWhatIfError(null)
    try {
      const result = await simulate({
        repoUrl: analyzed.repoUrl,
        costPerHourOfDowntime: withAssumptions.costPerHour,
        vendorSlaOverrides: withAssumptions.vendorSlaOverrides,
        substrateFailureProbabilities: withAssumptions.substrateRateOverrides,
        overrides: stack,
      })
      setWhatIfResult(result.whatIf ?? null)
      setRecommendedMoves(result.recommendedMoves ?? [])
    } catch (err) {
      setWhatIfError(apiErrorMessage(err, 'Could not compute this what-if.'))
    } finally {
      setIsLoadingWhatIf(false)
    }
  }

  function handleAddWhatIf(override: WhatIfOverride) {
    if (whatIfStack.length >= MAX_WHATIF_STACK) return
    const next = [...whatIfStack, override]
    setWhatIfStack(next)
    void runWhatIf(next, assumptions)
  }

  function handleRemoveWhatIf(index: number) {
    const next = whatIfStack.filter((_, i) => i !== index)
    setWhatIfStack(next)
    if (next.length > 0) void runWhatIf(next, assumptions)
    else setWhatIfResult(null)
  }

  function handleResetWhatIf() {
    setWhatIfStack([])
    setWhatIfResult(null)
    setWhatIfError(null)
  }

  function handlePreviewRecommendedMove(move: RecommendedMove) {
    if (whatIfStack.length >= MAX_WHATIF_STACK) return
    handleSelectVendor(move.vendorId)
    setGraphMode('vendors')
    setView('graph')
    handleAddWhatIf({ vendorId: move.vendorId, substrate: move.substrate, failoverVendorId: move.failoverVendorId })
  }

  // --- Guided tour (src/tour/) -------------------------------------------------------------
  // The tour always runs on a bundled example snapshot, so every action below is network-free:
  // scenario simulation reuses the same pure exact-engine functions already computed client-side
  // for the headline card (src/lib/offlineSimulate.ts), and the recommended-move step uses numbers
  // precomputed at snapshot-generation time (tourTopMove/tourTopMoveWhatIf) rather than calling
  // /simulate, which would 404 for a snapshot the server has never scanned.
  function handleTourRunScenario(scenario: (typeof PRESET_SCENARIOS)[number]) {
    const offline = buildOfflineSimulateResponse(analyzed.vendors, scenario, {
      costPerHourOfDowntime: assumptions.costPerHour,
      vendorSlaOverrides: assumptions.vendorSlaOverrides,
      substrateOutageProbabilities: assumptions.substrateRateOverrides,
    })
    setActiveScenarioId(scenario.id)
    setSingleVendorCascadeTarget(null)
    setSimulation(offline)
    setGraphMode('vendors')
    setView('graph')
    setSelectedVendorKey(null)
  }

  function handleTourApplyTopMove() {
    const move = analyzed.tourTopMove
    const moveWhatIf = analyzed.tourTopMoveWhatIf
    if (!move || !moveWhatIf) return
    setGraphMode('vendors')
    setView('graph')
    handleSelectVendor(move.vendorId)
    setWhatIfStack([{ vendorId: move.vendorId, substrate: move.substrate, failoverVendorId: move.failoverVendorId }])
    setWhatIfResult(moveWhatIf)
    setWhatIfError(null)
  }

  function handleTourOpenRiskRegister() {
    setView('overview')
  }

  const defaultScenario = PRESET_SCENARIOS.find((s) => s.id === defaultScenarioId) ?? PRESET_SCENARIOS[0]
  // Not memoized: building these step objects is cheap (no engine enumeration, just object
  // construction over already-computed values), and every input that should invalidate it —
  // analyzed, assumptions, the client headline — already changes on essentially every render this
  // component cares about, so a useMemo here would buy nothing but a stale-closure risk on the
  // step actions below (which close over handlers that themselves change every render).
  const tourSteps = (() => {
    if (!hasVendorData || !defaultScenario) return []
    const scenarioResult = simulateFailureScenario(analyzed.vendors, defaultScenario)
    const affectedEntrypoints = affectedEntrypointsForScenario(
      scenarioResult,
      analyzed.vendorGraph.vendors,
      analyzed.criticality.entrypoints,
    )
    return buildTourSteps({
      vendorCount: analyzed.vendors.length,
      substrateCount: analyzed.concentration.substrateCount,
      hiddenSharePercentValue: hiddenSharePercent(clientHeadline, clientExactResult),
      expectedLossPerYear: clientHeadline.expectedLossPerYear,
      currency: assumptions.currency,
      mostConcentratedSubstrate: analyzed.concentration.mostConcentrated?.substrate ?? null,
      mostConcentratedVendorCount: analyzed.concentration.mostConcentrated?.vendorKeys.length ?? 0,
      scenarioLabel: defaultScenario.label,
      scenarioAffectedEntrypoints: affectedEntrypoints.length,
      totalEntrypoints: analyzed.criticality.entrypoints.length,
      topMove: analyzed.tourTopMove ?? null,
      actions: {
        runScenario: () => handleTourRunScenario(defaultScenario),
        applyTopMove: handleTourApplyTopMove,
        openRiskRegister: handleTourOpenRiskRegister,
        goToInputAndFocus: onReset,
      },
    })
  })()

  // "Replay a real outage": activeScenarioId is namespaced `replay:<id>` only when the user picked
  // one of HISTORICAL_REPLAY_SCENARIOS from the dropdown — everything else (presets, no scenario
  // yet) resolves to null here and the panel below stays hidden. Reuses the exact same
  // simulation.scenario the cascade animation and AvailabilityPanel already render; the only new
  // number is estimatedExposure, a plain cost/hr x real-postmortem-duration multiplication, never a
  // probability estimate.
  const activeHistoricalOutage = outageForReplayScenarioId(activeScenarioId)
  const historicalReplayStats = useMemo(() => {
    if (!activeHistoricalOutage || !simulation?.scenario) return null
    const affectedEntrypoints = affectedEntrypointsForScenario(
      simulation.scenario,
      analyzed.vendorGraph.vendors,
      analyzed.criticality.entrypoints,
    )
    return {
      affectedVendorCount: simulation.scenario.affectedCount,
      totalVendorCount: simulation.scenario.totalCount,
      affectedEntrypointCount: affectedEntrypoints.length,
      totalEntrypointCount: analyzed.criticality.entrypoints.length,
      estimatedExposure:
        assumptions.costPerHour > 0 ? assumptions.costPerHour * activeHistoricalOutage.approxDurationHours : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHistoricalOutage, simulation, analyzed.vendorGraph.vendors, analyzed.criticality.entrypoints, assumptions.costPerHour])

  useEffect(() => {
    if (tourAutoStart && tour.status === 'idle' && tourSteps.length > 0) {
      tour.start(tourSteps)
      onTourAutoStartConsumed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourAutoStart, tourSteps])

  // A resize or an Esc mid-cascade must never leave the app broken — once the tour ends (however:
  // Esc, Skip, or reaching the end card), drop back to a clean, fully explorable graph view rather
  // than leaving a substrate-outage cascade or the risk register stuck on screen.
  const prevTourStatusRef = useRef(tour.status)
  useEffect(() => {
    if (prevTourStatusRef.current !== 'idle' && tour.status === 'idle') {
      setSimulation(null)
      setActiveScenarioId(undefined)
      setSingleVendorCascadeTarget(null)
      setGraphMode('vendors')
      setView('graph')
    }
    prevTourStatusRef.current = tour.status
  }, [tour.status])

  // The what-if stack's substrate moves, keyed by vendor — drives both the graph's node-into-island
  // preview (VendorGraphView) and nothing else; a failover addition has no existing node to move.
  const previewSubstrateByVendorKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const override of whatIfStack) {
      if (override.substrate) map.set(override.vendorId, override.substrate)
    }
    return map
  }, [whatIfStack])

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
    if (hasVendorData && !isSnapshot) {
      void handleRefreshStatus()
      void runWhatIf([], assumptions) // no overrides yet — this call's only job is to seed recommendedMoves
    }
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
      setRunbook(await fetchRunbook(analyzed.repoUrl, selectedVendorKey, scenarioLabel, assumptions.costPerHour))
    } catch (err) {
      setRunbookError(apiErrorMessage(err, 'Could not generate a runbook.'))
    } finally {
      setIsLoadingRunbook(false)
    }
  }

  async function handleAsk(question: string) {
    if (!analyzed.repoUrl) return
    setIsAsking(true)
    setAskError(null)
    try {
      setAskResult(
        await askBlastRadius({
          repoUrl: analyzed.repoUrl,
          question,
          costPerHourOfDowntime: assumptions.costPerHour,
          vendorSlaOverrides: assumptions.vendorSlaOverrides,
          substrateFailureProbabilities: assumptions.substrateRateOverrides,
        }),
      )
    } catch (err) {
      setAskError(apiErrorMessage(err, 'Could not reach Ask Blast Radius.'))
    } finally {
      setIsAsking(false)
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
        onPlayTour={onPlayTour}
      />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          {hasVendorData && (
            <VendorHeadlineCard headline={clientHeadline} result={clientExactResult} currency={assumptions.currency} />
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
                Scan stopped early (file-count or time budget) — only {analyzed.meta.filesScanned} file(s) were
                fetched. Results below reflect a partial scan, not the whole repo.
              </span>
            </div>
          )}
          {hasVendorData && (
            <div className="flex flex-wrap gap-3">
              <div data-tour="stat-vendors">
                <StatTile label="Vendors" value={analyzed.vendors.length} />
              </div>
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
            {view === 'overview' ? (
              <RiskOverview
                vendors={analyzed.vendorGraph.vendors}
                entrypoints={analyzed.criticality.entrypoints}
                naiveDowntimeHoursPerYear={clientExactResult.expectedDowntimeHoursPerYear.naive}
                costPerHour={assumptions.costPerHour}
                currency={assumptions.currency}
                vendorStatuses={statusResult?.vendorStatuses ?? null}
                onSelectVendor={handleSelectVendorFromRegister}
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
                previewSubstrateByVendorKey={previewSubstrateByVendorKey}
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
            <PrSummaryPanel result={prResult} onClear={onClearPr} gateResult={gateResult} gateError={gateError} />
          ) : selectedNode && blastRadius ? (
            <SidePanel selectedNode={selectedNode} blastRadius={blastRadius} nodesById={nodesById} onClear={() => setSelectedNodeId(null)} />
          ) : selectedVendor ? (
            <VendorDetailPanel
              key={selectedVendor.key}
              vendor={selectedVendor}
              entrypoints={analyzed.criticality.entrypoints}
              costPerHour={assumptions.costPerHour}
              currency={assumptions.currency}
              onViewFiles={handleViewAffectedFiles}
              onSimulateOutage={() => handleSimulateVendorOutage(selectedVendor.key)}
              onClear={() => handleSelectVendor(null)}
              whatIfStack={whatIfStack}
              vendorNameByKey={vendorNameByKey}
              whatIfResult={whatIfResult}
              isLoadingWhatIf={isLoadingWhatIf}
              whatIfError={whatIfError}
              onAddWhatIf={handleAddWhatIf}
              onRemoveWhatIf={handleRemoveWhatIf}
              onResetWhatIf={handleResetWhatIf}
            />
          ) : (
            <div className="panel-glass animate-rise-in rounded-xl p-4 text-sm text-[var(--text-muted)]">
              {graphMode === 'vendors'
                ? 'Click a vendor node to see its blast radius, detection provenance, and remediation options.'
                : 'Click a file node to see its upstream/downstream blast radius.'}
            </div>
          )}

          <ConcentrationPanel concentration={analyzed.concentration} />
          <CriticalityPanel criticality={analyzed.criticality} onSelectFile={handleNodeClick} />

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
                  {activeHistoricalOutage && historicalReplayStats && (
                    <HistoricalReplayPanel
                      outage={activeHistoricalOutage}
                      affectedVendorCount={historicalReplayStats.affectedVendorCount}
                      totalVendorCount={historicalReplayStats.totalVendorCount}
                      affectedEntrypointCount={historicalReplayStats.affectedEntrypointCount}
                      totalEntrypointCount={historicalReplayStats.totalEntrypointCount}
                      estimatedExposure={historicalReplayStats.estimatedExposure}
                      currency={assumptions.currency}
                    />
                  )}
                  <AvailabilityPanel
                    simulation={simulation}
                    isLoading={isSimulating}
                    error={simulationError}
                    currency={assumptions.currency}
                    onRun={handleRunBaseline}
                  />
                  <RecommendedMovesPanel
                    moves={recommendedMoves}
                    currency={assumptions.currency}
                    costPerHour={assumptions.costPerHour}
                    onPreview={handlePreviewRecommendedMove}
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
                  <AskPanel
                    bedrockAvailable={analyzed.bedrockAvailable}
                    isLoading={isAsking}
                    error={askError}
                    result={askResult}
                    onAsk={handleAsk}
                  />
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default Workspace
