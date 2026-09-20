import type { OwnInfraFinding, OwnInfraSeverity, OwnInfrastructure } from '../lib/types'
import Panel from './ui/Panel'

interface OwnInfraPanelProps {
  /** null when no scan ran for this analysis (manual JSON/PR mode, or a pre-`own` snapshot) —
   * renders nothing rather than a fabricated empty result. */
  own: OwnInfrastructure | null
}

const SEVERITY_ORDER: OwnInfraSeverity[] = ['high', 'medium', 'low']

const SEVERITY_LABEL: Record<OwnInfraSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

// Text label always ships alongside this color (see SEVERITY_LABEL) — never color as the only signal.
const SEVERITY_COLOR: Record<OwnInfraSeverity, string> = {
  high: '#d03b3b',
  medium: '#f0b429',
  low: '#7d8296',
}

const REGION_BAR_COLORS = ['#4f8cff', '#8a63d2', '#33b0a3', '#e08a3c', '#c25c9e']

function regionColor(index: number): string {
  return REGION_BAR_COLORS[index % REGION_BAR_COLORS.length]
}

function FindingRow({ finding }: { finding: OwnInfraFinding }) {
  return (
    <li className="rounded-lg border border-[var(--border-subtle)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-[var(--text-primary)]">{finding.resource}</p>
        <span
          className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
          style={{ borderColor: SEVERITY_COLOR[finding.severity], color: SEVERITY_COLOR[finding.severity] }}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
        {finding.file}:{finding.line}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{finding.message}</p>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-xs font-medium text-[var(--accent-strong)] select-none">
          Fix snippet
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-md bg-[var(--bg-base)] p-2 text-[11px] text-[var(--text-secondary)]">
          <code>{finding.fixSnippet}</code>
        </pre>
      </details>
    </li>
  )
}

function OwnInfraPanel({ own }: OwnInfraPanelProps) {
  if (!own) return null
  const { regions, findings, unresolved, filesScanned } = own
  const totalResourceCount = regions.reduce((sum, r) => sum + r.resourceCount, 0)
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((f) => f.severity === severity),
  })).filter((group) => group.findings.length > 0)

  return (
    <Panel
      title="Your infrastructure"
      subtitle="Static check of files in this repo. Does not see deployed state, registry modules or values set outside the repo."
    >
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Region distribution</p>
          {regions.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              No region evidence found in this repo's IaC — regions may be set outside the repo (CLI flags, CI
              variables, a Terraform Cloud workspace). Unknown, not single-region.
            </p>
          ) : (
            <>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-base)]">
                {regions.map((r, i) => (
                  <div
                    key={r.region}
                    style={{
                      width: `${totalResourceCount > 0 ? (r.resourceCount / totalResourceCount) * 100 : 100 / regions.length}%`,
                      backgroundColor: regionColor(i),
                    }}
                    title={`${r.region}: ${r.resourceCount} resource(s)`}
                  />
                ))}
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                {regions.map((r, i) => (
                  <li key={r.region} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: regionColor(i) }} aria-hidden="true" />
                    {r.region} · {r.resourceCount} resource{r.resourceCount === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-secondary)]">
          Reliability pillar: {findings.length} finding{findings.length === 1 ? '' : 's'} from static IaC ({filesScanned}{' '}
          file{filesScanned === 1 ? '' : 's'} scanned)
        </p>

        {bySeverity.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No findings from the 6 Reliability rules this scan checks.</p>
        ) : (
          <div className="space-y-3">
            {bySeverity.map((group) => (
              <div key={group.severity}>
                <p
                  className="mb-1.5 text-xs font-semibold tracking-wide uppercase"
                  style={{ color: SEVERITY_COLOR[group.severity] }}
                >
                  {SEVERITY_LABEL[group.severity]} ({group.findings.length})
                </p>
                <ul className="space-y-1.5">
                  {group.findings.map((f, i) => (
                    <FindingRow key={`${f.rule}-${f.file}-${f.line}-${i}`} finding={f} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {unresolved.length > 0 && (
          <details className="border-t border-[var(--border-subtle)] pt-2">
            <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)] select-none">
              {unresolved.length} unresolved (variables/expressions not statically resolvable)
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {unresolved.map((u, i) => (
                <li key={`${u.resource}-${u.file}-${u.line}-${i}`} className="text-xs text-[var(--text-muted)]">
                  <span className="font-mono">
                    {u.file}:{u.line}
                  </span>{' '}
                  {u.resource} — {u.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  )
}

export default OwnInfraPanel
