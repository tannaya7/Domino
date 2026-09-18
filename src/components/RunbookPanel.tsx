import { RISK_STYLES } from '../lib/risk'
import type { Runbook } from '../lib/types'
import GeneratedByBadge from './ui/GeneratedByBadge'
import Panel from './ui/Panel'
import Spinner from './ui/Spinner'

interface RunbookPanelProps {
  vendorName: string | null
  runbook: Runbook | null
  isLoading: boolean
  error: string | null
  onGenerate: () => void
}

function RunbookPanel({ vendorName, runbook, isLoading, error, onGenerate }: RunbookPanelProps) {
  if (!vendorName) {
    return (
      <Panel title="Runbook">
        <p className="text-sm text-[var(--text-muted)]">Select a vendor to generate a remediation runbook.</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Runbook"
      subtitle={`Remediation for ${vendorName}`}
      action={
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          {isLoading ? <Spinner className="h-3 w-3" /> : runbook ? 'Regenerate' : 'Generate'}
        </button>
      }
    >
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!runbook && !isLoading && !error && (
        <p className="text-sm text-[var(--text-muted)]">Generate an actionable runbook for this vendor's failure.</p>
      )}
      {runbook && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[runbook.riskLevel]}`}>
              {runbook.riskLevel} risk
            </span>
            <GeneratedByBadge generatedBy={runbook.generatedBy} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{runbook.summary}</p>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              Recommended actions
            </p>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
              {runbook.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
          {runbook.suggestedFallbacks && runbook.suggestedFallbacks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                Fallback vendors
              </p>
              <p className="text-sm text-[var(--text-secondary)]">{runbook.suggestedFallbacks.join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

export default RunbookPanel
