import { useState } from 'react'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { VendorWithBlastRadius } from '../lib/types'
import { CONFIDENCE_LABEL, CONFIDENCE_STYLES, computeVendorConfidence, VENDOR_CONFIDENCE_RULE } from '../lib/vendorConfidence'
import { formatVerificationBadge, type VendorVerificationResult } from '../lib/substrateVerification'
import { formatSubstrateBadges } from '../lib/vendorKbBadge'
import { buildReportWrongSubstrateIssueUrl } from '../lib/vendorKbIssueUrl'
import { VENDOR_KB_BY_DETECTION_KEY } from '../data/vendors.generated'
import Panel from './ui/Panel'

interface VendorDetailPanelProps {
  vendor: VendorWithBlastRadius
  /** Entrypoint file paths (from criticality analysis) — for the "Y/N entrypoints" result line. */
  entrypoints: string[]
  costPerHour: number
  currency: Currency
  /** undefined = never checked (no known global host); present = the DNS-verification result. */
  verification: VendorVerificationResult | undefined
  onViewFiles: () => void
  /** Starts the graph's visual cascade for this one vendor — see VendorGraphView. */
  onSimulateOutage: () => void
  onClear: () => void
  /** Opens the FIS "Validate this in your account" modal, scoped to this one vendor's outage. */
  onValidateInAccount?: () => void
}

function VendorDetailPanel({
  vendor,
  entrypoints,
  costPerHour,
  currency,
  verification,
  onViewFiles,
  onSimulateOutage,
  onClear,
  onValidateInAccount,
}: VendorDetailPanelProps) {
  const [simulated, setSimulated] = useState(false)

  const entrypointSet = new Set(entrypoints)
  const affectedEntrypoints = vendor.affectedFiles.filter((f) => entrypointSet.has(f))
  // Entrypoints first (most meaningful), then fill up to 5 with whatever else is affected.
  const topPaths = [
    ...affectedEntrypoints,
    ...vendor.affectedFiles.filter((f) => !entrypointSet.has(f)),
  ].slice(0, 5)

  function handleSimulate() {
    setSimulated(true)
    onSimulateOutage()
  }

  return (
    <Panel
      title={vendor.vendor}
      subtitle={`${vendor.tier} · SLA ${(vendor.sla * 100).toFixed(2)}%`}
      action={
        <button
          type="button"
          onClick={onClear}
          className="rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Clear
        </button>
      }
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {(() => {
          const kb = VENDOR_KB_BY_DETECTION_KEY[vendor.key]
          return formatSubstrateBadges(kb).map((badge, i) => {
            const title = 'Curated substrate confidence — see CONTRIBUTING.md and vendors/schema.json. verified = an official/first-party source. reported = claimed but not independently confirmed. unverified = no real source yet.'
            const content = (
              <span key={`${badge.label}-${i}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.style}`} title={title}>
                {badge.label}
                {badge.href && ' ↗'}
              </span>
            )
            return badge.href ? (
              <a key={`${badge.label}-${i}`} href={badge.href} target="_blank" rel="noreferrer">
                {content}
              </a>
            ) : (
              content
            )
          })
        })()}
        {(() => {
          const confidence = computeVendorConfidence(vendor.detectedVia)
          return (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[confidence]}`}
              title={VENDOR_CONFIDENCE_RULE}
            >
              {CONFIDENCE_LABEL[confidence]} confidence
            </span>
          )
        })()}
        {(() => {
          const badge = formatVerificationBadge(verification)
          const title = verification
            ? verification.hosts.map((h) => `${h.host}: ${h.detail}`).join('\n')
            : 'No independent DNS/IP-range evidence for this vendor (no known global host to check, or not run yet). See scripts/verify-substrates.ts.'
          return (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.style}`} title={title}>
              {badge.label}
            </span>
          )
        })()}
      </div>

      <a
        href={buildReportWrongSubstrateIssueUrl({ name: vendor.vendor, substrate: vendor.substrate, tier: vendor.tier })}
        target="_blank"
        rel="noreferrer"
        className="mb-3 inline-block text-xs text-[var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent-strong)]"
      >
        Report wrong substrate ↗
      </a>

      <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Blast radius</p>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Affects <span className="font-semibold text-[var(--text-primary)]">{vendor.affectedFiles.length}</span>{' '}
        file(s) in this codebase{vendor.directFiles.length > 0 && ` (${vendor.directFiles.length} direct)`}.
      </p>

      <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Detected via</p>
      <ul className="mb-3 space-y-0.5 text-xs text-[var(--text-secondary)]">
        {vendor.detectedVia.map((via) => (
          <li key={via} className="truncate font-mono">
            {via}
          </li>
        ))}
      </ul>

      {vendor.statusUrl && (
        <a
          href={vendor.statusUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-3 block text-xs text-[var(--accent-strong)] hover:underline"
        >
          View {vendor.vendor}'s status page ↗
        </a>
      )}

      <button
        type="button"
        onClick={onViewFiles}
        disabled={vendor.affectedFiles.length === 0}
        className="mb-2 w-full rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
      >
        View affected files
      </button>

      <button
        type="button"
        onClick={handleSimulate}
        className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        Simulate this vendor's outage
      </button>

      {simulated && (
        <div className="mt-3 rounded-lg border border-[var(--border-subtle)] p-2 text-sm">
          {vendor.affectedFiles.length === 0 ? (
            <p className="text-[var(--text-secondary)]">
              {vendor.vendor} has no downstream files in this repo's file graph — simulating its outage has no
              blast radius to show.
            </p>
          ) : affectedEntrypoints.length === 0 ? (
            <p className="text-[var(--text-secondary)]">
              If {vendor.vendor} is down: {vendor.affectedFiles.length} file(s), but no entrypoints depend on it —
              nothing user-facing breaks directly.
            </p>
          ) : (
            <p className="text-[var(--text-primary)]">
              If {vendor.vendor} is down:{' '}
              <span className="font-semibold">{vendor.affectedFiles.length} files</span>,{' '}
              <span className="font-semibold">
                {affectedEntrypoints.length}/{entrypoints.length} entrypoints
              </span>
              , ~<span className="font-semibold">{formatCurrency(costPerHour, currency)}</span>{' '}
              <span title="This is your assumptions-panel cost/hr as-is, not multiplied by any outage probability.">
                per hour of outage (not probability-weighted)
              </span>
              .
            </p>
          )}
          {topPaths.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-secondary)]">
              {topPaths.map((path) => (
                <li key={path} className="truncate font-mono" title={path}>
                  {entrypointSet.has(path) ? '→ ' : '· '}
                  {path}
                </li>
              ))}
            </ul>
          )}
          {onValidateInAccount && (
            <button
              type="button"
              onClick={onValidateInAccount}
              className="mt-2 w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Validate this in your account
            </button>
          )}
        </div>
      )}
    </Panel>
  )
}

export default VendorDetailPanel
