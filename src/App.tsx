import { useState } from 'react'
import InputScreen from './components/InputScreen'
import LandingPage from './components/LandingPage'
import Workspace, { type AnalyzedRepo } from './components/Workspace'
import type { AnalyzePrResponse, AnalyzeRepoResponse } from './lib/api'
import { analyzeConcentration } from './lib/concentration'
import { analyzeCriticality } from './lib/criticality'
import { buildAdjacencyMap, VENDOR_GRAPH_ROOT_ID } from './lib/graph'
import type { GraphData } from './lib/types'

/** Builds the AnalyzedRepo shape for a file-graph-only source (manual JSON, sample data, or a PR
 * result) — no vendor data exists for these, but criticality is still real, computed client-side
 * on the real file graph, not fabricated. */
function analyzedFromFileGraph(graph: GraphData): AnalyzedRepo {
  const adjacency = buildAdjacencyMap(graph.nodes, graph.edges)
  return {
    graph,
    vendors: [],
    vendorGraph: { rootId: VENDOR_GRAPH_ROOT_ID, vendors: [] },
    concentration: analyzeConcentration([]),
    criticality: analyzeCriticality(
      adjacency,
      graph.nodes.map((n) => n.id),
    ),
    meta: null,
    repoUrl: null,
  }
}

function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [analyzed, setAnalyzed] = useState<AnalyzedRepo | null>(null)
  const [prResult, setPrResult] = useState<AnalyzePrResponse | null>(null)

  function handleRepoAnalyzed(result: AnalyzeRepoResponse, repoUrl: string) {
    setAnalyzed({
      graph: { nodes: result.nodes, edges: result.edges },
      vendors: result.vendors,
      vendorGraph: result.vendorGraph,
      concentration: result.concentration,
      criticality: result.criticality,
      meta: result.meta,
      repoUrl,
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

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} />
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {!analyzed ? (
        <InputScreen
          onRepoAnalyzed={handleRepoAnalyzed}
          onManualLoad={handleManualLoad}
          onPrAnalyzed={handlePrAnalyzed}
        />
      ) : (
        <Workspace analyzed={analyzed} prResult={prResult} onReset={handleReset} onClearPr={() => setPrResult(null)} />
      )}
    </div>
  )
}

export default App
