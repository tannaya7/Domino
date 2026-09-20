import { useMemo, useState } from 'react'
import type { CorrelatedModelOverrides } from '../engine/correlated'
import type { ScenarioResult, ScenarioSelection } from '../engine/scenario'
import { DEFAULT_SCENARIO_HOURS, evaluateScenario, MAX_SCENARIO_HOURS, MIN_SCENARIO_HOURS, scenarioKnownIds, validateScenarioSelection } from '../engine/scenario'
import { PRESET_SCENARIOS } from '../lib/availability'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import { encodeScenarioSelection } from '../lib/scenarioShare'
import { deleteScenario, loadSavedScenarios, saveScenario, type SavedScenario } from '../lib/scenarioStorage'
import type { VendorWithBlastRadius } from '../lib/types'

interface ScenarioBuilderPanelProps {
  vendors: VendorWithBlastRadius[]
  entrypoints: string[]
  costPerHour: number
  currency: Currency
  overrides: CorrelatedModelOverrides
  baselineExpectedLossPerYear: number
  repoUrl: string | null
  initialSelection: ScenarioSelection | null
  onRun: (result: ScenarioResult, selection: ScenarioSelection) => void
}

const chipBaseClass =
  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
const chipOnClass = 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent-strong)]'
const chipOffClass = 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'

function formatPercent(n: number): string {
  const pct = n * 100
  if (pct === 0) return '0%'
  if (pct < 0.001) return '<0.001%'
  return `${pct.toFixed(3)}%`
}

function ScenarioBuilderPanel({
  vendors,
  entrypoints,
  costPerHour,
  currency,
  overrides,
  baselineExpectedLossPerYear,
  repoUrl,
  initialSelection,
  onRun,
}: ScenarioBuilderPanelProps) {
  const known = useMemo(() => scenarioKnownIds(vendors), [vendors])
  const [selection, setSelection] = useState<ScenarioSelection>(
    () => initialSelection ?? { substrates: [], vendors: [], hours: DEFAULT_SCENARIO_HOURS },
  )
  const [search, setSearch] = useState('')
  const [showCompare, setShowCompare] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadSavedScenarios(repoUrl))
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const validationErrors = useMemo(() => validateScenarioSelection(selection, known), [selection, known])
  const result = useMemo<ScenarioResult | null>(() => {
    if (validationErrors.length > 0) return null
    try {
      return evaluateScenario({ vendors, entrypoints, costPerHour, overrides }, selection)
    } catch {
      return null
    }
  }, [vendors, entrypoints, costPerHour, overrides, selection, validationErrors])

  const filteredSubstrates = useMemo(
    () => known.substrateIds.filter((s) => s.toLowerCase().includes(search.toLowerCase())),
    [known, search],
  )
  const vendorsByTier = useMemo(() => {
    const filtered = vendors.filter((v) => v.vendor.toLowerCase().includes(search.toLowerCase()))
    const map = new Map<string, VendorWithBlastRadius[]>()
    for (const v of filtered) map.set(v.tier, [...(map.get(v.tier) ?? []), v])
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [vendors, search])

  function toggleSubstrate(id: string) {
    setSelection((s) => ({
      ...s,
      substrates: s.substrates.includes(id) ? s.substrates.filter((x) => x !== id) : [...s.substrates, id],
    }))
  }
  function toggleVendor(key: string) {
    setSelection((s) => ({ ...s, vendors: s.vendors.includes(key) ? s.vendors.filter((x) => x !== key) : [...s.vendors, key] }))
  }
  function handleClear() {
    setSelection({ substrates: [], vendors: [], hours: DEFAULT_SCENARIO_HOURS })
  }
  function handleRun() {
    if (result) onRun(result, selection)
  }
  function handleLoadPreset(id: string) {
    const preset = PRESET_SCENARIOS.find((p) => p.id === id)
    if (preset) setSelection({ substrates: preset.downSubstrates, vendors: [], hours: DEFAULT_SCENARIO_HOURS })
  }
  function handleLoadSaved(id: string) {
    const saved = savedScenarios.find((s) => s.id === id)
    if (saved) setSelection(saved.selection)
  }
  function handleDeleteSaved(id: string) {
    setSavedScenarios(deleteScenario(repoUrl, id))
  }
  function handleSave() {
    if (!saveName.trim() || validationErrors.length > 0) return
    setSavedScenarios(saveScenario(repoUrl, saveName.trim(), selection))
    setSaveName('')
  }
  async function handleShare() {
    const encoded = encodeScenarioSelection(selection)
    const url = `${window.location.origin}${window.location.pathname}?scenario=${encoded}`
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
    } catch {
      setShareStatus('error')
    }
    setTimeout(() => setShareStatus('idle'), 2000)
  }

  const totalSelected = selection.substrates.length + selection.vendors.length

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-[var(--text-muted)]">
        Combine substrates and vendors into one hypothetical outage. Everything here runs locally — no network call —
        and every probability/cost figure is <span className="font-medium">modeled under your assumptions, illustrative</span>.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--text-muted)]" htmlFor="scenario-preset">
          Load preset
        </label>
        <select
          id="scenario-preset"
          onChange={(e) => e.target.value && handleLoadPreset(e.target.value)}
          value=""
          className="rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="">Choose…</option>
          {PRESET_SCENARIOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {savedScenarios.length > 0 && (
          <>
            <label className="text-xs text-[var(--text-muted)]" htmlFor="scenario-saved">
              Load saved
            </label>
            <select
              id="scenario-saved"
              onChange={(e) => e.target.value && handleLoadSaved(e.target.value)}
              value=""
              className="rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              <option value="">Choose…</option>
              {savedScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search substrates & vendors…"
        aria-label="Search substrates and vendors"
        className="w-full rounded-md border border-[var(--border-subtle)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />

      {filteredSubstrates.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Substrates</p>
          <div className="flex flex-wrap gap-1.5">
            {filteredSubstrates.map((id) => {
              const on = selection.substrates.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSubstrate(id)}
                  aria-pressed={on}
                  className={`${chipBaseClass} ${on ? chipOnClass : chipOffClass}`}
                >
                  {id}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {vendorsByTier.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Vendors, by category</p>
          {vendorsByTier.map(([tier, tierVendors]) => (
            <div key={tier}>
              <p className="mb-1 text-[11px] text-[var(--text-muted)]">{tier}</p>
              <div className="flex flex-wrap gap-1.5">
                {tierVendors.map((v) => {
                  const on = selection.vendors.includes(v.key)
                  const downViaSubstrate = v.substrate.some((s) => selection.substrates.includes(s))
                  return (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => toggleVendor(v.key)}
                      aria-pressed={on}
                      title={downViaSubstrate ? `${v.vendor} is already down via a selected substrate` : v.vendor}
                      className={`${chipBaseClass} ${on ? chipOnClass : chipOffClass} ${downViaSubstrate && !on ? 'opacity-60' : ''}`}
                    >
                      {v.vendor}
                      {downViaSubstrate && !on && <span aria-hidden="true"> ⚡</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        Assumed incident duration
        <input
          type="number"
          min={MIN_SCENARIO_HOURS}
          max={MAX_SCENARIO_HOURS}
          step={0.25}
          value={selection.hours}
          onChange={(e) => setSelection((s) => ({ ...s, hours: Number(e.target.value) }))}
          className="w-20 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-0.5 text-right tabular-nums text-[var(--text-primary)]"
        />
        hours
      </label>

      <div role="status" className="rounded-md border border-[var(--border-subtle)] p-2.5 text-xs">
        {validationErrors.length > 0 ? (
          <ul className="text-amber-300">
            {validationErrors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        ) : result ? (
          <>
            <p className="font-medium text-[var(--text-primary)]">
              {totalSelected} selected → {result.downVendorKeys.length} vendor(s) down, {result.entrypointsAffected.length}/
              {result.entrypointsTotal} entrypoints
            </p>
            <p className="mt-1 text-[var(--text-secondary)]">
              Modeled: {formatPercent(result.combinationProbability)} chance per year ({result.expectedDowntimeHoursPerYear.toFixed(2)}{' '}
              hrs/yr) · ~{formatCurrency(result.perIncidentCost, currency)} this incident · ~
              {formatCurrency(result.expectedAnnualCost, currency)}/yr expected — modeled under your assumptions, illustrative
            </p>
            {result.categoriesLost.length > 0 && (
              <p className="mt-1 text-[var(--text-secondary)]">Categories lost: {result.categoriesLost.join(', ')}</p>
            )}
            {result.noFallback.length > 0 && (
              <p className="mt-1 text-amber-300">
                {result.noFallback.length} entrypoint/category pair(s) with no detected fallback.
              </p>
            )}
          </>
        ) : null}
      </div>

      {showCompare && result && (
        <div className="rounded-md border border-[var(--border-subtle)] p-2.5 text-xs">
          <p className="mb-1 font-semibold tracking-wide text-[var(--text-muted)] uppercase">Compare to baseline</p>
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-secondary)]">Baseline expected loss/yr</span>
            <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(baselineExpectedLossPerYear, currency)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-secondary)]">This scenario, expected loss/yr</span>
            <span className="tabular-nums text-[var(--text-primary)]">{formatCurrency(result.expectedAnnualCost, currency)}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={!result}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => setShowCompare((v) => !v)}
          disabled={!result}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {showCompare ? 'Hide comparison' : 'Compare to baseline'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleShare}
          disabled={totalSelected === 0}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {shareStatus === 'copied' ? 'Link copied!' : shareStatus === 'error' ? 'Copy failed' : 'Copy share link'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Name this scenario…"
          aria-label="Scenario name"
          className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!saveName.trim() || validationErrors.length > 0 || savedScenarios.length >= 5}
          title={savedScenarios.length >= 5 ? 'Up to 5 saved scenarios — delete one to save another' : undefined}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Save ({savedScenarios.length}/5)
        </button>
      </div>

      {savedScenarios.length > 0 && (
        <ul className="space-y-1 text-xs">
          {savedScenarios.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => handleLoadSaved(s.id)} className="text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSaved(s.id)}
                aria-label={`Delete saved scenario ${s.name}`}
                className="text-[var(--text-muted)] hover:text-red-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ScenarioBuilderPanel
