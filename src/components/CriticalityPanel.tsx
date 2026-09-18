import type { CriticalityResult } from '../lib/types'
import Panel from './ui/Panel'

interface CriticalityPanelProps {
  criticality: CriticalityResult
  onSelectFile?: (fileId: string) => void
}

function CriticalityPanel({ criticality, onSelectFile }: CriticalityPanelProps) {
  const notable = criticality.byNode.filter((n) => n.isArticulationPoint || n.reachabilityLossRatio > 0).slice(0, 5)

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
                  className="truncate text-left text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  {node.nodeId}
                </button>
                {node.isArticulationPoint && (
                  <span className="shrink-0 rounded-full border border-[#f0b429] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#f0b429] uppercase">
                    Articulation point
                  </span>
                )}
              </div>
              {node.isArticulationPoint && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Removing this disconnects {node.orphanedNodes.length} other required path
                  {node.orphanedNodes.length === 1 ? '' : 's'}.
                </p>
              )}
              {node.reachabilityLossRatio > 0 && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {node.affectedEntrypoints.length} / {node.entrypointCount} entrypoint(s) depend on it.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default CriticalityPanel
