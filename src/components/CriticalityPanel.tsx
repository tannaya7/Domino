import type { CriticalityResult, NodeCriticality } from '../lib/types'
import Panel from './ui/Panel'

interface CriticalityPanelProps {
  criticality: CriticalityResult
  onSelectFile?: (fileId: string) => void
}

/** Keeps the filename and enough trailing context to place it, e.g.
 * "frontend/components/nav/AppShell.tsx" -> ".../nav/AppShell.tsx". */
function truncatePathMiddle(path: string, maxLength = 36): string {
  if (path.length <= maxLength) return path
  const segments = path.split('/')
  let result = segments[segments.length - 1]
  for (let i = segments.length - 2; i >= 0; i--) {
    const candidate = `${segments[i]}/${result}`
    if (candidate.length + 4 > maxLength) break // +4 accounts for the "…/" prefix added below
    result = candidate
  }
  return result === path ? path : `…/${result}`
}

/** One plain-English sentence — this is what a non-graph-theory reader actually needs to know. */
function whyItMatters(node: NodeCriticality): string {
  const { isArticulationPoint, affectedEntrypoints, orphanedNodes } = node
  if (isArticulationPoint && affectedEntrypoints.length > 0) {
    return `Structural bottleneck — removing it disconnects ${orphanedNodes.length} file${orphanedNodes.length === 1 ? '' : 's'} and cuts off ${affectedEntrypoints.length} other route${affectedEntrypoints.length === 1 ? '' : 's'}.`
  }
  if (isArticulationPoint) {
    return `Structural bottleneck — removing it disconnects ${orphanedNodes.length} other file${orphanedNodes.length === 1 ? '' : 's'} from the rest of the graph.`
  }
  if (affectedEntrypoints.length > 0) {
    const isPlural = affectedEntrypoints.length !== 1
    return `${affectedEntrypoints.length} other route${isPlural ? 's' : ''} ${isPlural ? 'depend' : 'depends'} on it — breaking this breaks them too.`
  }
  return 'No other entrypoints or files depend on this node.'
}

function CriticalityPanel({ criticality, onSelectFile }: CriticalityPanelProps) {
  const notable = criticality.byNode
    .filter((n) => n.isArticulationPoint || n.affectedEntrypoints.length > 0 || n.orphanedNodes.length > 0)
    .slice(0, 5)

  return (
    <Panel
      title="Criticality"
      subtitle="Graph-theory articulation points vs. semantic reachability loss — shown separately, on purpose."
    >
      {notable.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No structurally critical files found in this graph.</p>
      ) : (
        <ul className="space-y-2">
          {notable.map((node) => (
            <li key={node.nodeId} className="rounded-lg border border-[var(--border-subtle)] p-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectFile?.(node.nodeId)}
                  title={node.nodeId}
                  className="truncate text-left text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  {truncatePathMiddle(node.nodeId)}
                </button>
                {node.isArticulationPoint && (
                  <span className="shrink-0 rounded-full border border-[#f0b429] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#f0b429] uppercase">
                    Articulation point
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{whyItMatters(node)}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default CriticalityPanel
