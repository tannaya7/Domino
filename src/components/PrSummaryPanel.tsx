import type { AnalyzePrResponse } from '../lib/api'
import { RISK_STYLES } from '../lib/risk'
import RiskSummarySection from './RiskSummarySection'

interface PrSummaryPanelProps {
  result: AnalyzePrResponse
  onClear: () => void
}

function PrSummaryPanel({ result, onClear }: PrSummaryPanelProps) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-200 p-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase">Pull Request</p>
        <h2 className="text-lg font-semibold text-gray-900">
          {result.owner}/{result.repo} #{result.prNumber}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {result.combinedBlastRadius.totalCount}
        </span>
        <span className="text-sm text-gray-500">combined affected components</span>
      </div>

      {result.highestRisk && (
        <div className="rounded border border-gray-200 p-2 text-sm">
          <p className="text-gray-500">Highest-risk item touched</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-medium text-gray-900">{result.highestRisk.label}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[result.highestRisk.risk as keyof typeof RISK_STYLES]}`}
            >
              {result.highestRisk.risk} risk
            </span>
          </div>
        </div>
      )}

      <section>
        <h3 className="mb-1 text-sm font-medium text-gray-700">
          This PR touches ({result.changedNodes.length})
        </h3>
        <ul className="space-y-1">
          {result.changedNodes.map((node) => (
            <li
              key={node.id}
              className="flex items-center justify-between rounded bg-rose-50 px-2 py-1 text-sm text-rose-900"
            >
              <span>{node.label}</span>
              <span className="text-xs text-rose-700">{node.blastRadiusCount} affected</span>
            </li>
          ))}
        </ul>
        {result.unmatchedFiles.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {result.unmatchedFiles.length} other changed file
            {result.unmatchedFiles.length === 1 ? '' : 's'} not tracked in the dependency graph.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium text-gray-700">
          Downstream — will break ({result.combinedBlastRadius.downstream.length})
        </h3>
        {result.combinedBlastRadius.downstream.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing else depends on the changed files.</p>
        ) : (
          <ul className="space-y-1">
            {result.combinedBlastRadius.downstream.map((id) => (
              <li key={id} className="rounded bg-orange-50 px-2 py-1 text-sm text-orange-900">
                {id}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-medium text-gray-700">
          Upstream — depends on ({result.combinedBlastRadius.upstream.length})
        </h3>
        {result.combinedBlastRadius.upstream.length === 0 ? (
          <p className="text-sm text-gray-400">The changed files have no dependencies.</p>
        ) : (
          <ul className="space-y-1">
            {result.combinedBlastRadius.upstream.map((id) => (
              <li key={id} className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-900">
                {id}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RiskSummarySection
        name={`This PR (${result.changedNodes.length} file${result.changedNodes.length === 1 ? '' : 's'})`}
        type="pull request"
        downstream={result.combinedBlastRadius.downstream}
        upstream={result.combinedBlastRadius.upstream}
      />

      <button
        onClick={onClear}
        className="mt-auto rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Clear PR view
      </button>
    </aside>
  )
}

export default PrSummaryPanel
