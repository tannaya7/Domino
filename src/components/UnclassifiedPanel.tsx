import type { UnclassifiedItem, UnclassifiedSummary } from '../lib/types'
import { buildSuggestVendorIssueUrl } from '../lib/vendorKbIssueUrl'
import { VENDOR_KB } from '../data/vendors.generated'
import Panel from './ui/Panel'

const KNOWN_VENDOR_COUNT = Object.keys(VENDOR_KB).length

interface UnclassifiedPanelProps {
  /** null when no scan ran for this analysis (manual JSON/PR mode) — renders nothing rather than a
   * fabricated "0 found". An empty-but-real summary (totalCount 0) DOES render, honestly. */
  unclassified: UnclassifiedSummary | null
}

const TOP_N = 5

function ItemGroup({ label, items }: { label: string; items: UnclassifiedItem[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">{label}</p>
      <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
        {items.slice(0, TOP_N).map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-2 truncate">
            <span className="truncate font-mono" title={item.name}>
              {item.name}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[var(--text-muted)]">
              <span title={item.files.join(', ')}>
                {item.files.length} file{item.files.length === 1 ? '' : 's'}
              </span>
              <a
                href={buildSuggestVendorIssueUrl({ name: item.name, occurrenceCount: item.files.length })}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                Suggest this vendor
              </a>
            </span>
          </li>
        ))}
        {items.length > TOP_N && <li className="text-[var(--text-muted)]">+{items.length - TOP_N} more</li>}
      </ul>
    </div>
  )
}

function UnclassifiedPanel({ unclassified }: UnclassifiedPanelProps) {
  if (!unclassified) return null
  const { packages, envVars, hosts, totalCount } = unclassified

  return (
    <Panel
      title="Unclassified external dependencies"
      subtitle={`Our curated vendor knowledge base recognizes ~${KNOWN_VENDOR_COUNT} vendors — everything below is real but not in it.`}
    >
      {totalCount === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Every external package, env var, and hostname found in this scan matched a known vendor or a
          non-service allow-list. Nothing unclassified.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-primary)]">
            Not in our knowledge base:{' '}
            <span className="font-semibold">
              {hosts.length} host{hosts.length === 1 ? '' : 's'}
            </span>
            , <span className="font-semibold">{envVars.length} env var{envVars.length === 1 ? '' : 's'}</span>,{' '}
            <span className="font-semibold">
              {packages.length} package{packages.length === 1 ? '' : 's'}
            </span>
          </p>
          {/* Hosts and env vars are the strongest, most direct evidence of an undetected live
              service (a real network endpoint or credential) — shown above packages, which are a
              weaker, more indirect signal (a library import that may not even call out). */}
          <ItemGroup label="Hosts" items={hosts} />
          <ItemGroup label="Env vars" items={envVars} />
          <ItemGroup label="Packages" items={packages} />
          <p className="border-t border-[var(--border-subtle)] pt-2 text-xs font-medium text-amber-300">
            unknown != safe: these may be hidden vendors.
          </p>
        </div>
      )}
    </Panel>
  )
}

export default UnclassifiedPanel
