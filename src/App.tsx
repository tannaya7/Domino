import { useEffect, useState } from 'react'
import ApiHealthBanner from './components/ApiHealthBanner'
import InputScreen from './components/InputScreen'
import Workspace, { type AnalyzedRepo } from './components/Workspace'
import type { AnalyzePrResponse, AnalyzeRepoResponse, GateResponse } from './lib/api'
import { analyzeConcentration } from './lib/concentration'
import { analyzeCriticality } from './lib/criticality'
import { EXAMPLE_REPOS } from './data/exampleRepos'
import { loadDemoSnapshot, type DemoSnapshot } from './lib/demoSnapshot'
import { inferProjectEntrypoints } from './lib/entrypoints'
import { buildAdjacencyMap, VENDOR_GRAPH_ROOT_ID } from './lib/graph'
import type { GraphData } from './lib/types'
import TourOverlay from './tour/TourOverlay'
import { useTour } from './tour/useTour'

const FIRST_EXAMPLE = EXAMPLE_REPOS[0]
const FIRST_EXAMPLE_URL = FIRST_EXAMPLE ? `https://github.com/${FIRST_EXAMPLE.owner}/${FIRST_EXAMPLE.repo}` : null
const TOUR_AUTOSTART_SESSION_KEY = 'blast-radius:tour-autostarted:v1'

/** Builds the AnalyzedRepo shape for a file-graph-only source (manual JSON, sample data, or a PR
 * result) — no vendor data exists for these, but criticality is still real, computed client-side
 * on the real file graph, not fabricated. Framework-aware entrypoints (Next.js/Vite path
 * conventions) are inferred from the node paths when present, same as the real repo-scan path;
 * package.json main/bin isn't available here since there's no manifest content client-side. */
function analyzedFromFileGraph(graph: GraphData): AnalyzedRepo {
  const adjacency = buildAdjacencyMap(graph.nodes, graph.edges)
  const nodeIds = graph.nodes.map((n) => n.id)
  const entrypoints = inferProjectEntrypoints(nodeIds)
  return {
    graph,
    vendors: [],
    vendorGraph: { rootId: VENDOR_GRAPH_ROOT_ID, vendors: [] },
    concentration: analyzeConcentration([]),
    criticality: analyzeCriticality(adjacency, nodeIds, entrypoints.length > 0 ? entrypoints : undefined),
    unclassified: null,
    own: null,
    meta: null,
    repoUrl: null,
    snapshot: null,
    bedrockAvailable: false,
    substrateVerification: null,
    history: null,
  }
}

function App() {
  const [analyzed, setAnalyzed] = useState<AnalyzedRepo | null>(null)
  const [prResult, setPrResult] = useState<AnalyzePrResponse | null>(null)
  const [gateResult, setGateResult] = useState<GateResponse | null>(null)
  const [gateError, setGateError] = useState<string | null>(null)

  function handleRepoAnalyzed(result: AnalyzeRepoResponse, repoUrl: string) {
    setAnalyzed({
      graph: { nodes: result.nodes, edges: result.edges },
      vendors: result.vendors,
      vendorGraph: result.vendorGraph,
      concentration: result.concentration,
      criticality: result.criticality,
      unclassified: result.unclassified,
      own: result.own,
      meta: result.meta,
      repoUrl,
      snapshot: null,
      bedrockAvailable: result.bedrockAvailable,
      substrateVerification: null, // live mode — Workspace fetches the current static JSON itself
      history: null, // live mode — Workspace fetches live history for this repo itself
    })
    setPrResult(null)
    setGateResult(null)
    setGateError(null)
  }

  function handleSnapshotLoaded(snapshot: DemoSnapshot) {
    setAnalyzed({
      graph: { nodes: snapshot.nodes, edges: snapshot.edges },
      vendors: snapshot.vendors,
      vendorGraph: snapshot.vendorGraph,
      concentration: snapshot.concentration,
      criticality: snapshot.criticality,
      unclassified: snapshot.unclassified ?? null,
      own: snapshot.own ?? null,
      meta: snapshot.meta,
      repoUrl: `https://github.com/${snapshot.owner}/${snapshot.repo}`,
      snapshot: { sha: snapshot.commitSha, generatedAt: snapshot.generatedAt },
      tourTopMove: snapshot.topRecommendedMove,
      tourTopMoveWhatIf: snapshot.topRecommendedMoveWhatIf,
      // The server has never scanned a snapshot-loaded repo, so /ask would 404 regardless of
      // whether Bedrock itself is configured — never claim it's available here.
      bedrockAvailable: false,
      substrateVerification: snapshot.substrateVerification ?? null,
      history: snapshot.history ?? null,
    })
    setPrResult(null)
    setGateResult(null)
    setGateError(null)
  }

  function handleManualLoad(data: GraphData) {
    setAnalyzed(analyzedFromFileGraph(data))
    setPrResult(null)
    setGateResult(null)
    setGateError(null)
  }

  function handlePrAnalyzed(result: AnalyzePrResponse, gate: GateResponse | null, gateErr: string | null) {
    setAnalyzed(analyzedFromFileGraph(result.graph))
    setPrResult(result)
    setGateResult(gate)
    setGateError(gateErr)
  }

  function handleReset() {
    setAnalyzed(null)
    setPrResult(null)
    setGateResult(null)
    setGateError(null)
  }

  // --- Guided tour bootstrapping (src/tour/) ---------------------------------------------------
  // The tour engine (useTour) and its overlay live here, one level above the InputScreen<->Workspace
  // switch, specifically so they SURVIVE that switch — the tour's own end card needs to reset back
  // to InputScreen (to focus the repo URL input) without losing its play/pause state or keyboard
  // listeners mid-transition.
  const tour = useTour()
  const [tourAutoStart, setTourAutoStart] = useState(false)
  const [autoFocusRepoUrl, setAutoFocusRepoUrl] = useState(false)

  async function handlePlayTour() {
    if (!FIRST_EXAMPLE || !FIRST_EXAMPLE_URL) {
      console.warn('[tour] no bundled example repos are configured — cannot start the tour.')
      return
    }
    setAutoFocusRepoUrl(false)
    // The tour always runs on the first bundled example snapshot — (re)load it whenever the
    // workspace isn't already showing exactly that pinned snapshot (a live analysis of the same
    // repoUrl doesn't count: it has none of the tour's precomputed data).
    const alreadyShowingIt = analyzed?.repoUrl === FIRST_EXAMPLE_URL && analyzed?.snapshot !== null
    if (!alreadyShowingIt) {
      try {
        const snapshot = await loadDemoSnapshot(FIRST_EXAMPLE.file)
        handleSnapshotLoaded(snapshot)
      } catch (err) {
        console.warn('[tour] could not load the bundled example snapshot; tour cannot start.', err)
        return
      }
    }
    setTourAutoStart(true)
  }

  function handleTourAutoStartConsumed() {
    setTourAutoStart(false)
  }

  // `?tour=1` autostarts the tour once per browser session (sessionStorage, not localStorage — a
  // fresh tab/session should be able to see it again). No router in this app, so this reads
  // location.search directly rather than through any URL-param library.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tour') !== '1') return
    let alreadyStarted = false
    try {
      alreadyStarted = sessionStorage.getItem(TOUR_AUTOSTART_SESSION_KEY) === '1'
      if (!alreadyStarted) sessionStorage.setItem(TOUR_AUTOSTART_SESSION_KEY, '1')
    } catch {
      // Private browsing / storage disabled — fall through and autostart anyway rather than
      // silently doing nothing; worst case it plays once instead of being skipped.
    }
    if (!alreadyStarted) void handlePlayTour()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The end-card step's own run() (built in Workspace.tsx, wired to this same `onReset`) already
  // resets back to InputScreen the moment the tour reaches it — this effect's only job is telling
  // the fresh InputScreen to focus the repo URL input once it mounts, since that's the one thing
  // only App.tsx can arrange (RepoInput doesn't know why it mounted).
  useEffect(() => {
    if (tour.status === 'idle') {
      setAutoFocusRepoUrl(false)
      return
    }
    if (tour.currentStep?.id === 'try-your-own') setAutoFocusRepoUrl(true)
  }, [tour.status, tour.currentStep?.id])

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <ApiHealthBanner />
      {!analyzed ? (
        <InputScreen
          onRepoAnalyzed={handleRepoAnalyzed}
          onManualLoad={handleManualLoad}
          onPrAnalyzed={handlePrAnalyzed}
          onSnapshotLoaded={handleSnapshotLoaded}
          onPlayTour={() => void handlePlayTour()}
          autoFocusRepoUrl={autoFocusRepoUrl}
        />
      ) : (
        <Workspace
          analyzed={analyzed}
          prResult={prResult}
          gateResult={gateResult}
          gateError={gateError}
          onReset={handleReset}
          onClearPr={() => {
            setPrResult(null)
            setGateResult(null)
            setGateError(null)
          }}
          onLiveAnalysisComplete={handleRepoAnalyzed}
          onPlayTour={() => void handlePlayTour()}
          tour={tour}
          tourAutoStart={tourAutoStart}
          onTourAutoStartConsumed={handleTourAutoStartConsumed}
        />
      )}
      <TourOverlay tour={tour} />
    </div>
  )
}

export default App
