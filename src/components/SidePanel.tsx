import type { BlastRadius } from '../lib/graph'
import { getRiskLevel, RISK_STYLES } from '../lib/risk'
import type { GraphNode } from '../lib/types'
import RiskSummarySection from './RiskSummarySection'

interface SidePanelProps {
  selectedNode: GraphNode
  blastRadius: BlastRadius
  nodesById: Map<string, GraphNode>
  onClear: () => void
}

function nodeLabel(id: string, nodesById: Map<string, GraphNode>): string {
  return nodesById.get(id)?.label ?? id
}

function SidePanel({ selectedNode, blastRadius, nodesById, onClear }: SidePanelProps) {
  const risk = getRiskLevel(blastRadius.totalCount)

  function handleDownload() {
    const report = {
      name: selectedNode.label,
      type: selectedNode.type,
      blastRadiusCount: blastRadius.totalCount,
      riskLevel: risk,
      downstream: blastRadius.downstream.map((id) => nodeLabel(id, nodesById)),
      upstream: blastRadius.upstream.map((id) => nodeLabel(id, nodesById)),
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedNode.id}-blast-radius-report.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-200 p-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase">{selectedNode.type}</p>
        <h2 className="text-lg font-semibold text-gray-900">{selectedNode.label}</h2>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-gray-900">{blastRadius.totalCount}</span>
        <span className="text-sm text-gray-500">affected components</span>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[risk]}`}>
          {risk} risk
        </span>
      </div>

      <section>
        <h3 className="mb-1 text-sm font-medium text-gray-700">
          Downstream — will break ({blastRadius.downstream.length})
        </h3>
        {blastRadius.downstream.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing depends on this component.</p>
        ) : (
          <ul className="space-y-1">
            {blastRadius.downstream.map((id) => (
              <li key={id} className="rounded bg-orange-50 px-2 py-1 text-sm text-orange-900">
                {nodeLabel(id, nodesById)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium text-gray-700">
          Upstream — depends on ({blastRadius.upstream.length})
        </h3>
        {blastRadius.upstream.length === 0 ? (
          <p className="text-sm text-gray-400">This component has no dependencies.</p>
        ) : (
          <ul className="space-y-1">
            {blastRadius.upstream.map((id) => (
              <li key={id} className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-900">
                {nodeLabel(id, nodesById)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RiskSummarySection
        name={selectedNode.label}
        type={selectedNode.type}
        downstream={blastRadius.downstream.map((id) => nodeLabel(id, nodesById))}
        upstream={blastRadius.upstream.map((id) => nodeLabel(id, nodesById))}
      />

      <div className="mt-auto flex gap-2">
        <button
          onClick={handleDownload}
          className="flex-1 rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Download report
        </button>
        <button
          onClick={onClear}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Clear selection
        </button>
      </div>
    </aside>
  )
}

export default SidePanel
