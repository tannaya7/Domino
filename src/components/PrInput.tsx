import { useState } from 'react'
import { analyzePr, ApiError, runGate, type AnalyzePrResponse, type GateResponse } from '../lib/api'

interface PrInputProps {
  onAnalyzed: (result: AnalyzePrResponse, gateResult: GateResponse | null, gateError: string | null) => void
}

function PrInput({ onAnalyzed }: PrInputProps) {
  const [prUrl, setPrUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleAnalyze() {
    if (!prUrl.trim()) {
      setError('Paste a GitHub pull request URL first.')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const result = await analyzePr(prUrl.trim())
      if (result.changedNodes.length === 0) {
        setError(
          'None of this PR’s changed files matched a tracked JavaScript/TypeScript node in the dependency graph.',
        )
        return
      }
      // Report-only (no policy) — the same check action/action.yml runs in CI, best-effort: a gate
      // failure (e.g. a private/renamed fork) never blocks showing the PR analysis that already succeeded.
      let gateResult: GateResponse | null = null
      let gateError: string | null = null
      try {
        gateResult = await runGate({ prUrl: prUrl.trim() })
      } catch (err) {
        gateError = err instanceof ApiError ? err.message : 'Could not run the PR Resilience Gate for this PR.'
      }
      onAnalyzed(result, gateResult, gateError)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong analyzing that PR.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="panel-glass rounded-lg p-3 text-sm text-[var(--text-secondary)]">
        <p className="mb-1 font-medium text-[var(--text-primary)]">How to use</p>
        <p>
          Paste a public GitHub pull request URL. We'll find every file it changes, map them onto
          the repo's dependency graph, and show the combined blast radius before you merge.
        </p>
      </div>

      <div>
        <label htmlFor="pr-url" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
          GitHub PR URL
        </label>
        <div className="flex gap-2">
          <input
            id="pr-url"
            type="text"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://github.com/owner/repo/pull/42"
            disabled={isLoading}
            className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
          >
            {isLoading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300" role="alert">{error}</p>
      )}
    </div>
  )
}

export default PrInput
