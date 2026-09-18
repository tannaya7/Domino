import { useState } from 'react'
import sampleData from '../data/sample.json'
import { analyzeRepo, ApiError, type AnalyzeRepoResponse } from '../lib/api'
import type { GraphData } from '../lib/types'

interface RepoInputProps {
  onAnalyzed: (result: AnalyzeRepoResponse, repoUrl: string) => void
  onLoadSample: (data: GraphData) => void
}

function RepoInput({ onAnalyzed, onLoadSample }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleAnalyze() {
    const trimmed = repoUrl.trim()
    if (!trimmed) {
      setError('Paste a GitHub repo URL first.')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const result = await analyzeRepo(trimmed)
      if (result.nodes.length === 0) {
        setError(
          'No JavaScript/TypeScript files with recognizable imports were found in this repo.',
        )
        return
      }
      onAnalyzed(result, trimmed)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong analyzing that repo.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleUseSampleInstead() {
    setError(null)
    onLoadSample(sampleData as GraphData)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="panel-glass rounded-lg p-3 text-sm text-[var(--text-secondary)]">
        <p className="mb-1 font-medium text-[var(--text-primary)]">How to use</p>
        <p>
          Paste a public GitHub repo URL. We'll scan it for third-party vendors (imports, env vars, manifests, IaC),
          map the file-level dependency graph, and quantify concentration and availability risk.
        </p>
      </div>

      <div>
        <label htmlFor="repo-url" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
          GitHub repo URL
        </label>
        <div className="flex gap-2">
          <input
            id="repo-url"
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://github.com/owner/repo"
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
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300" role="alert">
          <p>{error}</p>
          <button
            onClick={handleUseSampleInstead}
            className="mt-1 rounded font-medium text-red-200 underline hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Use sample data instead
          </button>
        </div>
      )}
    </div>
  )
}

export default RepoInput
