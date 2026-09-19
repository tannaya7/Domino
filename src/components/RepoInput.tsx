import { useState } from 'react'
import sampleData from '../data/sample.json'
import { EXAMPLE_REPOS } from '../data/exampleRepos'
import { analyzeRepo, ApiError, type AnalyzeRepoResponse } from '../lib/api'
import { DemoSnapshotError, loadDemoSnapshot, type DemoSnapshot } from '../lib/demoSnapshot'
import type { GraphData } from '../lib/types'

interface RepoInputProps {
  onAnalyzed: (result: AnalyzeRepoResponse, repoUrl: string) => void
  onLoadSample: (data: GraphData) => void
  onSnapshotLoaded: (snapshot: DemoSnapshot) => void
}

function RepoInput({ onAnalyzed, onLoadSample, onSnapshotLoaded }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingExample, setLoadingExample] = useState<string | null>(null)

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
      // Whatever went wrong on GitHub's end (rate-limited, private, deleted, forbidden) — the
      // message is already human-written server-side (see GithubApiError); the one thing worth
      // adding here is a working way forward, not just a dead end.
      setError(err instanceof ApiError ? err.message : 'Something went wrong analyzing that repo.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleUseSampleInstead() {
    setError(null)
    onLoadSample(sampleData as GraphData)
  }

  async function handleLoadExample(file: string) {
    setError(null)
    setLoadingExample(file)
    try {
      const snapshot = await loadDemoSnapshot(file)
      onSnapshotLoaded(snapshot)
    } catch (err) {
      setError(err instanceof DemoSnapshotError ? err.message : 'Could not load that example.')
    } finally {
      setLoadingExample(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
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
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          <p className="mb-1">{error}</p>
          <p className="text-red-200">
            GitHub having a bad moment doesn't have to end your demo — pick a pre-analyzed example below, or{' '}
            <button
              onClick={handleUseSampleInstead}
              className="rounded font-medium underline hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              use sample data
            </button>
            .
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
          Try an example <span className="text-[var(--text-muted)]">— loads instantly, no GitHub call needed</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {EXAMPLE_REPOS.map((ex) => (
            <button
              key={ex.file}
              onClick={() => handleLoadExample(ex.file)}
              disabled={loadingExample !== null}
              className="panel-glass flex flex-col items-start gap-1 rounded-lg p-3 text-left text-xs transition-colors hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              <span className="font-medium text-[var(--text-primary)]">
                {ex.owner}/{ex.repo}
              </span>
              <span className="text-[var(--text-secondary)]">
                {ex.vendors} vendor{ex.vendors === 1 ? '' : 's'} → {ex.substrates} substrate{ex.substrates === 1 ? '' : 's'}
              </span>
              <span className="text-[var(--text-muted)]">
                {loadingExample === ex.file ? 'Loading…' : `snapshot @ ${ex.sha.slice(0, 7)}`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default RepoInput
