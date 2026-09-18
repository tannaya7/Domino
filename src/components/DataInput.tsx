import { useRef, useState } from 'react'
import sampleData from '../data/sample.json'
import type { GraphData } from '../lib/types'
import { validateGraphData } from '../lib/validate'

interface DataInputProps {
  onLoad: (data: GraphData) => void
}

function DataInput({ onLoad }: DataInputProps) {
  const [pasteValue, setPasteValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function parseAndLoad(raw: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setError('That is not valid JSON. Please check the syntax and try again.')
      setIsLoading(false)
      return
    }

    const result = validateGraphData(parsed)
    if (!result.valid) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    setError(null)
    onLoad(result.data)
    setIsLoading(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      parseAndLoad(String(reader.result))
    }
    reader.onerror = () => {
      setError('Could not read the selected file.')
      setIsLoading(false)
    }
    reader.readAsText(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handlePasteSubmit() {
    if (!pasteValue.trim()) {
      setError('Paste some JSON first.')
      return
    }
    setIsLoading(true)
    // Let the loading state paint before the (potentially large) synchronous parse runs.
    setTimeout(() => parseAndLoad(pasteValue), 0)
  }

  function handleLoadSample() {
    setError(null)
    onLoad(sampleData as GraphData)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="panel-glass rounded-lg p-3 text-sm text-[var(--text-secondary)]">
        <p className="mb-1 font-medium text-[var(--text-primary)]">How to use</p>
        <p>
          Upload or paste a JSON file with <code className="text-xs">nodes</code> and{' '}
          <code className="text-xs">edges</code> arrays, or load the sample data below. This path is file-graph
          only — no vendor/AWS analysis, since there's no repo to scan for imports, env vars, or manifests.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Upload a JSON file</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          disabled={isLoading}
          className="block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0a0b0e] hover:file:bg-[var(--accent-strong)] disabled:opacity-50"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Or paste JSON</label>
        <textarea
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          rows={6}
          placeholder='{"nodes": [...], "edges": [...]}'
          disabled={isLoading}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handlePasteSubmit}
          disabled={isLoading}
          className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {isLoading ? 'Parsing…' : 'Load pasted JSON'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="text-xs text-[var(--text-muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <button
        onClick={handleLoadSample}
        disabled={isLoading}
        className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        Load sample data
      </button>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300" role="alert">{error}</p>
      )}
    </div>
  )
}

export default DataInput
