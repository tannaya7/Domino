import type { AdjacencyMap } from '../lib/graph'
import { getBlastRadius } from '../lib/graph'
import { getRiskLevel, RISK_STYLES } from '../lib/risk'
import type { GraphData } from '../lib/types'

interface SystemOverviewProps {
  graphData: GraphData
  adjacencyMap: AdjacencyMap
  onSelectNode: (nodeId: string) => void
}

function SystemOverview({ graphData, adjacencyMap, onSelectNode }: SystemOverviewProps) {
  const rows = graphData.nodes
    .map((node) => {
      const radius = getBlastRadius(node.id, adjacencyMap)
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        count: radius.totalCount,
        risk: getRiskLevel(radius.totalCount),
      }
    })
    .sort((a, b) => b.count - a.count)

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">System Overview</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
            <th className="py-2 pr-4 font-medium">Component Name</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Blast Radius Count</th>
            <th className="py-2 pr-4 font-medium">Risk Level</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelectNode(row.id)}
              className="cursor-pointer border-b border-[var(--border-subtle)] hover:bg-white/5"
            >
              <td className="py-2 pr-4 text-[var(--text-primary)]">{row.label}</td>
              <td className="py-2 pr-4 text-[var(--text-secondary)]">{row.type}</td>
              <td className="py-2 pr-4 text-[var(--text-primary)]">{row.count}</td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[row.risk]}`}>
                  {row.risk}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default SystemOverview
