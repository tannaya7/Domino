import { colorForSubstrate } from '../lib/colors'
import type { VendorWithBlastRadius } from '../lib/types'
import Panel from './ui/Panel'

interface VendorDetailPanelProps {
  vendor: VendorWithBlastRadius
  onViewFiles: () => void
  onClear: () => void
}

function VendorDetailPanel({ vendor, onViewFiles, onClear }: VendorDetailPanelProps) {
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
      <div className="mb-3 flex flex-wrap gap-1.5">
        {vendor.substrate.map((s) => (
          <span
            key={s}
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${colorForSubstrate(s)}26`, color: colorForSubstrate(s) }}
          >
            {s}
          </span>
        ))}
      </div>

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
        className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
      >
        View affected files
      </button>
    </Panel>
  )
}

export default VendorDetailPanel
