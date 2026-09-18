import { useEffect, useState } from 'react'
import { ApiError, getRiskSummary } from '../lib/api'

interface RiskSummarySectionProps {
  name: string
  type: string
  downstream: string[]
  upstream: string[]
}

function RiskSummarySection({ name, type, downstream, upstream }: RiskSummarySectionProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setSummary(null)

    getRiskSummary({ name, type, downstream, upstream })
      .then((text) => {
        if (!cancelled) setSummary(text)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not generate a risk summary.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [name, type, downstream.join(','), upstream.join(',')])

  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-[var(--text-secondary)]">Risk Summary</h3>
      {isLoading && <p className="text-sm text-[var(--text-muted)]">Generating summary…</p>}
      {!isLoading && error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!isLoading && !error && summary && <p className="text-sm text-[var(--text-secondary)]">{summary}</p>}
    </section>
  )
}

export default RiskSummarySection
