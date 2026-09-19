import { useState } from 'react'
import InputScreen from './components/InputScreen'
import Workspace, { type AnalyzedRepo } from './components/Workspace'
import type { AnalyzePrResponse, AnalyzeRepoResponse } from './lib/api'
import { analyzeConcentration } from './lib/concentration'
import { analyzeCriticality } from './lib/criticality'
import type { DemoSnapshot } from './lib/demoSnapshot'
import { inferProjectEntrypoints } from './lib/entrypoints'
import { buildAdjacencyMap, VENDOR_GRAPH_ROOT_ID } from './lib/graph'
import type { GraphData } from './lib/types'

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
    meta: null,
    repoUrl: null,
    snapshot: null,
  }
}

function App() {
  const [analyzed, setAnalyzed] = useState<AnalyzedRepo | null>(null)
  const [prResult, setPrResult] = useState<AnalyzePrResponse | null>(null)

  function handleRepoAnalyzed(result: AnalyzeRepoResponse, repoUrl: string) {
    setAnalyzed({
      graph: { nodes: result.nodes, edges: result.edges },
      vendors: result.vendors,
      vendorGraph: result.vendorGraph,
      concentration: result.concentration,
      criticality: result.criticality,
      unclassified: result.unclassified,
      meta: result.meta,
      repoUrl,
      snapshot: null,
    })
    setPrResult(null)
  }

  function handleSnapshotLoaded(snapshot: DemoSnapshot) {
    setAnalyzed({
      graph: { nodes: snapshot.nodes, edges: snapshot.edges },
      vendors: snapshot.vendors,
      vendorGraph: snapshot.vendorGraph,
      concentration: snapshot.concentration,
      criticality: snapshot.criticality,
      unclassified: snapshot.unclassified ?? null,
      meta: snapshot.meta,
      repoUrl: `https://github.com/${snapshot.owner}/${snapshot.repo}`,
      snapshot: { sha: snapshot.commitSha, generatedAt: snapshot.generatedAt },
    })
    setPrResult(null)
  }

  function handleManualLoad(data: GraphData) {
    setAnalyzed(analyzedFromFileGraph(data))
    setPrResult(null)
  }

  function handlePrAnalyzed(result: AnalyzePrResponse) {
    setAnalyzed(analyzedFromFileGraph(result.graph))
    setPrResult(result)
  }

  function handleReset() {
    setAnalyzed(null)
    setPrResult(null)
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {!analyzed ? (
        <InputScreen
          onRepoAnalyzed={handleRepoAnalyzed}
          onManualLoad={handleManualLoad}
          onPrAnalyzed={handlePrAnalyzed}
          onSnapshotLoaded={handleSnapshotLoaded}
        />
      ) : (
        <Workspace
          analyzed={analyzed}
          prResult={prResult}
          onReset={handleReset}
          onClearPr={() => setPrResult(null)}
          onLiveAnalysisComplete={handleRepoAnalyzed}
        />
      )}
    </div>
  )
}

export default App
