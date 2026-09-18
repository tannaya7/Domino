import { useState } from 'react'
import sampleData from '../data/sample.json'
import { analyzeRepo, ApiError } from '../lib/api'
import type { GraphData } from '../lib/types'

interface RepoInputProps {
  onLoad: (data: GraphData) => void
}

function RepoInput({ onLoad }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleAnalyze() {
    if (!repoUrl.trim()) {
      setError('Paste a GitHub repo URL first.')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const result = await analyzeRepo(repoUrl.trim())
      if (result.nodes.length === 0) {
        setError(
          'No JavaScript/TypeScript files with recognizable imports were found in this repo.',
        )
        return
      }
      onLoad(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong analyzing that repo.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleUseSampleInstead() {
    setError(null)
    onLoad(sampleData as GraphData)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        <p className="mb-1 font-medium text-gray-700">How to use</p>
        <p>
          Paste a public GitHub repo URL. We'll scan its JavaScript/TypeScript files, follow the
          import statements between them, and build a dependency graph automatically.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">GitHub repo URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://github.com/owner/repo"
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
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          <p>{error}</p>
          <button
            onClick={handleUseSampleInstead}
            className="mt-1 font-medium text-red-800 underline hover:text-red-900"
          >
            Use sample data instead
          </button>
        </div>
      )}
    </div>
  )
}

export default RepoInput
