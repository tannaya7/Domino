import { KB_LAST_UPDATED, KB_VERSION, VENDOR_KB } from '../data/vendors.generated'

/** A small always-visible strip showing which knowledge-base snapshot this build shipped with —
 * every substrate claim, badge, and count above ultimately traces back to vendors/*.json at this
 * version. KB_LAST_UPDATED is null (never a fabricated date) until at least one vendor has real
 * evidence with a retrievedAt date. */
function KbFooter() {
  const vendorCount = Object.keys(VENDOR_KB).length
  return (
    <footer className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-1.5 text-center text-[11px] text-[var(--text-muted)]">
      Vendor knowledge base {vendorCount} vendors · version {KB_VERSION}
      {KB_LAST_UPDATED ? ` · evidence last updated ${KB_LAST_UPDATED}` : ' · no evidence dated yet'}
    </footer>
  )
}

export default KbFooter
