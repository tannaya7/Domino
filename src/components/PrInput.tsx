import { useState } from 'react'
import { analyzePr, ApiError, type AnalyzePrResponse } from '../lib/api'

interface PrInputProps {
  onAnalyzed: (result: AnalyzePrResponse) => void
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
      onAnalyzed(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong analyzing that PR.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        <p className="mb-1 font-medium text-gray-700">How to use</p>
        <p>
          Paste a public GitHub pull request URL. We'll find every file it changes, map them onto
          the repo's dependency graph, and show the combined blast radius before you merge.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">GitHub PR URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://github.com/owner/repo/pull/42"
            disabled={isLoading}
            className="flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isLoading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}

export default PrInput
