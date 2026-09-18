import { useMemo, useState } from 'react'
import GraphView from './components/GraphView'
import InputScreen from './components/InputScreen'
import LandingPage from './components/LandingPage'
import PrSummaryPanel from './components/PrSummaryPanel'
import SidePanel from './components/SidePanel'
import SystemOverview from './components/SystemOverview'
import type { AnalyzePrResponse } from './lib/api'
import { buildAdjacencyMap, getBlastRadius } from './lib/graph'
import type { GraphData } from './lib/types'

type View = 'graph' | 'overview'

function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [view, setView] = useState<View>('graph')
  const [prResult, setPrResult] = useState<AnalyzePrResponse | null>(null)
  const isPrMode = prResult !== null && selectedNodeId === null

  const adjacencyMap = useMemo(
    () => (graphData ? buildAdjacencyMap(graphData.nodes, graphData.edges) : null),
    [graphData],
  )

  const nodesById = useMemo(
    () => new Map((graphData?.nodes ?? []).map((n) => [n.id, n])),
    [graphData],
  )

  const selectedNode = selectedNodeId ? (nodesById.get(selectedNodeId) ?? null) : null

  const blastRadius = useMemo(
    () => (selectedNodeId && adjacencyMap ? getBlastRadius(selectedNodeId, adjacencyMap) : null),
    [selectedNodeId, adjacencyMap],
  )

  function handleLoad(data: GraphData) {
    setGraphData(data)
    setSelectedNodeId(null)
    setPrResult(null)
    setView('graph')
  }

  function handleReset() {
    setGraphData(null)
    setSelectedNodeId(null)
    setPrResult(null)
    setView('graph')
  }

  function handleSelectFromOverview(nodeId: string) {
    setPrResult(null)
    setSelectedNodeId(nodeId)
    setView('graph')
  }

  function handlePrAnalyzed(result: AnalyzePrResponse) {
    setGraphData(result.graph)
    setPrResult(result)
    setSelectedNodeId(null)
    setView('graph')
  }

  // Clicking any node — including while a PR's combined view is showing — falls back to the
  // existing single-node selection flow (same handler DataInput/RepoInput graphs already use).
  function handleNodeClick(nodeId: string) {
    setPrResult(null)
    setSelectedNodeId(nodeId)
  }

  if (showLanding) {
    return <LandingPage onGetStarted={() => setShowLanding(false)} />
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">
          Blast Radius — Dependency Impact Mapper
        </h1>
        {graphData && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(view === 'graph' ? 'overview' : 'graph')}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {view === 'graph' ? 'System Overview' : 'Back to Graph'}
            </button>
            <button
              onClick={handleReset}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Load different data
            </button>
          </div>
        )}
      </header>

      <main className="flex flex-1 overflow-hidden">
        {!graphData ? (
          <InputScreen onLoad={handleLoad} onPrAnalyzed={handlePrAnalyzed} />
        ) : view === 'overview' ? (
          <SystemOverview
            graphData={graphData}
            adjacencyMap={adjacencyMap!}
            onSelectNode={handleSelectFromOverview}
          />
        ) : (
          <>
            <div className="flex-1 overflow-hidden">
              <GraphView
                graphData={graphData}
                selectedNodeId={selectedNodeId}
                blastRadius={blastRadius}
                onNodeClick={handleNodeClick}
                highlightedNodeIds={isPrMode ? prResult.changedNodes.map((n) => n.id) : undefined}
                combinedBlastRadius={isPrMode ? prResult.combinedBlastRadius : undefined}
              />
            </div>
            {isPrMode ? (
              <PrSummaryPanel result={prResult} onClear={() => setPrResult(null)} />
            ) : (
              selectedNode &&
              blastRadius && (
                <SidePanel
                  selectedNode={selectedNode}
                  blastRadius={blastRadius}
                  nodesById={nodesById}
                  onClear={() => setSelectedNodeId(null)}
                />
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
