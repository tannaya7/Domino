import { useState } from 'react'
import type { OwnInfraFinding, OwnInfraFixStatus, OwnInfraFixSuggestion, OwnInfraSeverity, OwnInfrastructure } from '../lib/types'
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

function fixKey(rule: string, resource: string, file: string): string {
  return `${rule}::${resource}::${file}`
}

const FIX_STATUS_LABEL: Record<OwnInfraFixStatus, string> = {
  patched: 'Suggested fix ready',
  refused: 'No patch generated',
  advisory: 'Advisory only',
}

/** Bare-bones diff coloring: the +/- prefix is the real signal (as in any unified diff); color is
 * a secondary reinforcement only, never the sole indicator. */
function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-[var(--bg-base)] p-2 text-[11px] leading-relaxed">
      <code>
        {diff.split('\n').map((line, i) => {
          let color = 'var(--text-secondary)'
          if (line.startsWith('+') && !line.startsWith('+++')) color = '#3fb97a'
          else if (line.startsWith('-') && !line.startsWith('---')) color = '#d03b3b'
          else if (line.startsWith('@@')) color = 'var(--accent-strong)'
          return (
            <div key={i} style={{ color }}>
              {line || ' '}
            </div>
          )
        })}
      </code>
    </pre>
  )
}

function useCopyFeedback(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }
  return [copied, copy]
}

function downloadPatch(fix: OwnInfraFixSuggestion) {
  if (!fix.diff) return
  const blob = new Blob([fix.diff], { type: 'text/x-diff' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeResource = fix.resource.replace(/[^a-zA-Z0-9_.-]/g, '_')
  a.href = url
  a.download = `${fix.rule}-${safeResource}.patch`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function gitApplyCommand(fix: OwnInfraFixSuggestion): string {
  return `git apply <<'BRM_PATCH_EOF'\n${fix.diff}\nBRM_PATCH_EOF`
}

function SuggestedFix({ fix }: { fix: OwnInfraFixSuggestion }) {
  const [copiedApply, copyApply] = useCopyFeedback()

  return (
    <div className="mt-1.5 rounded-md border border-[var(--border-subtle)] p-2">
      <p className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">{FIX_STATUS_LABEL[fix.status]}</p>
      {fix.status !== 'patched' ? (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{fix.note}</p>
      ) : (
        <>
          {fix.diff && <DiffView diff={fix.diff} />}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => downloadPatch(fix)}
              className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Download .patch
            </button>
            <button
              type="button"
              onClick={() => copyApply(gitApplyCommand(fix))}
              className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              {copiedApply ? 'Copied' : 'Copy git apply command'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function FindingRow({ finding, fix }: { finding: OwnInfraFinding; fix: OwnInfraFixSuggestion | undefined }) {
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
      {fix && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs font-medium text-[var(--accent-strong)] select-none">Suggested fixes</summary>
          <SuggestedFix fix={fix} />
        </details>
      )}
    </li>
  )
}

function OwnInfraPanel({ own }: OwnInfraPanelProps) {
  const [copiedPr, copyPr] = useCopyFeedback()
  if (!own) return null
  const { regions, findings, unresolved, filesScanned, fixes, fixesPrText } = own
  const totalResourceCount = regions.reduce((sum, r) => sum + r.resourceCount, 0)
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((f) => f.severity === severity),
  })).filter((group) => group.findings.length > 0)
  const fixesByKey = new Map((fixes ?? []).map((f) => [fixKey(f.rule, f.resource, f.file), f]))
  const patchedCount = (fixes ?? []).filter((f) => f.status === 'patched').length

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

        {patchedCount > 0 && fixesPrText && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] p-2">
            <p className="text-xs text-[var(--text-secondary)]">
              {patchedCount} suggested fix{patchedCount === 1 ? '' : 'es'} ready — expand a finding below for its diff, or draft one PR for all of them.
            </p>
            <button
              type="button"
              onClick={() =>
                copyPr(
                  `gh pr create --draft --title "Reliability fixes from Blast Radius Mapper" --body "$(cat <<'BRM_PR_EOF'\n${fixesPrText}\nBRM_PR_EOF\n)"`,
                )
              }
              className="shrink-0 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              {copiedPr ? 'Copied' : 'Copy gh pr create --draft'}
            </button>
          </div>
        )}

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
                    <FindingRow
                      key={`${f.rule}-${f.file}-${f.line}-${i}`}
                      finding={f}
                      fix={fixesByKey.get(fixKey(f.rule, f.resource, f.file))}
                    />
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
