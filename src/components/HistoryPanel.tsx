import { useEffect, useMemo, useState } from 'react'
import { ApiError, fetchHistory, saveSnapshot } from '../lib/api'
import { diffAnalyses } from '../engine/snapshotDiff'
import type { AnalysisSnapshotSummary } from '../lib/types'
import Sparkline from './Sparkline'

interface HistoryPanelProps {
  repo: string
  repoUrl: string | null
  /** Demo/snapshot mode: use the embedded history (frozen at snapshot-generation time, zero
   * network) instead of a live fetch — null means this snapshot predates the field, not "empty". */
  embeddedHistory: AnalysisSnapshotSummary[] | null
  isSnapshotMode: boolean
  costPerHour: number
  vendorSlaOverrides: Record<string, number>
  substrateOutageProbabilities: Record<string, number>
}

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`
}
function formatMultiplier(n: number): string {
  return `${n.toFixed(1)}x`
}
function shortSha(sha: string): string {
  return sha.slice(0, 7)
}
function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

function HistoryPanel({
  repo,
  repoUrl,
  embeddedHistory,
  isSnapshotMode,
  costPerHour,
  vendorSlaOverrides,
  substrateOutageProbabilities,
}: HistoryPanelProps) {
  const [history, setHistory] = useState<AnalysisSnapshotSummary[]>(embeddedHistory ?? [])
  const [isLoading, setIsLoading] = useState(!isSnapshotMode)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (isSnapshotMode) return // zero network in demo mode — embeddedHistory (possibly []) is authoritative
    let cancelled = false
    setIsLoading(true)
    fetchHistory(repo)
      .then((h) => {
        if (!cancelled) setHistory(h)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load history.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, isSnapshotMode])

  const chronological = useMemo(() => [...history].reverse(), [history]) // oldest -> newest, for the sparklines
  const vendorCounts = chronological.map((h) => h.vendors.length)
  const maxShares = chronological.map((h) => Math.max(0, ...h.substrateShares.map((s) => s.share)))
  const tailMultipliers = chronological.map((h) => h.tailRisk[0]?.multiplier ?? 0)

  function toggleSelected(sk: string) {
    setSelected((prev) => {
      if (prev.includes(sk)) return prev.filter((s) => s !== sk)
      if (prev.length >= 2) return [prev[1], sk] // keep it to exactly 2 — drop the oldest pick
      return [...prev, sk]
    })
  }

  const diff = useMemo(() => {
    if (selected.length !== 2) return null
    // Selection order isn't chronological — always diff older -> newer for a sane verdict direction.
    const [sk1, sk2] = selected
    const s1 = history.find((h) => h.sk === sk1)
    const s2 = history.find((h) => h.sk === sk2)
    if (!s1 || !s2) return null
    const [older, newer] = s1.analyzedAt <= s2.analyzedAt ? [s1, s2] : [s2, s1]
    return { older, newer, result: diffAnalyses(older, newer) }
  }, [selected, history])

  async function handleSave() {
    if (!repoUrl) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const saved = await saveSnapshot({
        repoUrl,
        note: note.trim() || undefined,
        costPerHourOfDowntime: costPerHour,
        vendorSlaOverrides,
        substrateOutageProbabilities,
      })
      setHistory((prev) => [saved, ...prev])
      setNote('')
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save snapshot.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">History</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Snapshots are a compact summary (vendors, substrate shares, tail risk) — never the full file graph.
        </p>
      </div>

      {!isSnapshotMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] p-3">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. 'before Stripe migration')"
            maxLength={280}
            className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !repoUrl}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save snapshot'}
          </button>
          {saveError && (
            <p className="w-full text-xs text-red-300" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading history…</p>}
      {loadError && (
        <p className="text-sm text-red-300" role="alert">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && history.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No snapshots saved for this repo yet. {!isSnapshotMode && 'Save one above to start tracking history.'}
        </p>
      )}

      {history.length > 0 && (
        <>
          <div className="flex flex-wrap gap-6 rounded-lg border border-[var(--border-subtle)] p-3">
            <Sparkline label="Vendor count" values={vendorCounts} format={(n) => String(n)} />
            <Sparkline label="Max substrate share" values={maxShares} format={formatPercent} />
            <Sparkline label="Tail-risk multiplier" values={tailMultipliers} format={formatMultiplier} />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              Snapshots — pick two to compare
            </p>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.sk} className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(h.sk)}
                    onChange={() => toggleSelected(h.sk)}
                    aria-label={`Select snapshot ${shortSha(h.sha)} from ${formatDate(h.analyzedAt)}`}
                  />
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                    {shortSha(h.sha)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{formatDate(h.analyzedAt)}</span>
                  <span className="text-[var(--text-primary)]">
                    {h.vendors.length} vendor{h.vendors.length === 1 ? '' : 's'}
                  </span>
                  {h.note && <span className="truncate text-xs text-[var(--text-muted)]">— {h.note}</span>}
                </li>
              ))}
            </ul>
          </div>

          {diff && (
            <div className="rounded-lg border border-[var(--border-subtle)] p-3">
              <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">{diff.result.verdict}</p>
              {diff.result.warnings.length > 0 && (
                <ul className="mb-2 space-y-0.5 text-xs text-amber-300">
                  {diff.result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="py-1 pr-3 font-medium">Metric</th>
                    <th className="py-1 pr-3 font-medium">
                      {shortSha(diff.older.sha)} ({formatDate(diff.older.analyzedAt)})
                    </th>
                    <th className="py-1 font-medium">
                      {shortSha(diff.newer.sha)} ({formatDate(diff.newer.analyzedAt)})
                    </th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  <tr>
                    <td className="py-1 pr-3">Vendors</td>
                    <td className="py-1 pr-3 tabular-nums">{diff.older.vendors.length}</td>
                    <td className="py-1 tabular-nums">{diff.newer.vendors.length}</td>
                  </tr>
                  {diff.result.vendorsAdded.length > 0 && (
                    <tr>
                      <td className="py-1 pr-3">Added</td>
                      <td className="py-1 pr-3" colSpan={2}>
                        {diff.result.vendorsAdded.join(', ')}
                      </td>
                    </tr>
                  )}
                  {diff.result.vendorsRemoved.length > 0 && (
                    <tr>
                      <td className="py-1 pr-3">Removed</td>
                      <td className="py-1 pr-3" colSpan={2}>
                        {diff.result.vendorsRemoved.join(', ')}
                      </td>
                    </tr>
                  )}
                  {diff.result.substrateShareChanges.map((c) => (
                    <tr key={c.substrate}>
                      <td className="py-1 pr-3">{c.substrate} share</td>
                      <td className="py-1 pr-3 tabular-nums">{formatPercent(c.from)}</td>
                      <td className="py-1 tabular-nums">{formatPercent(c.to)}</td>
                    </tr>
                  ))}
                  {diff.result.worstSingleEventChange.changed && (
                    <tr>
                      <td className="py-1 pr-3">Worst single event</td>
                      <td className="py-1 pr-3">{diff.result.worstSingleEventChange.from?.substrate ?? 'none'}</td>
                      <td className="py-1">{diff.result.worstSingleEventChange.to?.substrate ?? 'none'}</td>
                    </tr>
                  )}
                  {diff.result.unclassifiedDelta !== null && (
                    <tr>
                      <td className="py-1 pr-3">Unclassified count</td>
                      <td className="py-1 pr-3 tabular-nums">{diff.older.unclassifiedCount}</td>
                      <td className="py-1 tabular-nums">{diff.newer.unclassifiedCount}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-1 pr-3">Entrypoints</td>
                    <td className="py-1 pr-3 tabular-nums">{diff.older.entrypointCount}</td>
                    <td className="py-1 tabular-nums">{diff.newer.entrypointCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default HistoryPanel
