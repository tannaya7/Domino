import { useState } from 'react'
import { SUGGESTED_QUESTIONS } from '../lib/suggestedQuestions'
import type { AskResult } from '../lib/types'
import GeneratedByBadge from './ui/GeneratedByBadge'
import Panel from './ui/Panel'
import Spinner from './ui/Spinner'

interface AskPanelProps {
  bedrockAvailable: boolean
  isLoading: boolean
  error: string | null
  result: AskResult | null
  onAsk: (question: string) => void
}

/** "toolName(args) -> summary" — the exact "Grounded in: ..." footnote format, built straight from
 * what the engine actually returned (AskToolCall), never paraphrased. */
function formatToolCall(name: string, input: Record<string, unknown>, resultSummary: string): string {
  const args = Object.values(input)
    .map((v) => String(v))
    .join(', ')
  return `${name}(${args}) → ${resultSummary}`
}

function AskPanel({ bedrockAvailable, isLoading, error, result, onAsk }: AskPanelProps) {
  const [question, setQuestion] = useState('')

  function handleSubmit() {
    const trimmed = question.trim()
    if (!trimmed || isLoading) return
    onAsk(trimmed)
  }

  return (
    <Panel title="Ask Blast Radius" subtitle="Grounded Q&A — every number comes from a real engine call, never invented.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              disabled={isLoading}
              className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {bedrockAvailable && (
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Ask anything about this repo's vendor risk…"
              disabled={isLoading}
              aria-label="Ask Blast Radius a question"
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !question.trim()}
              className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {isLoading ? <Spinner className="h-4 w-4" /> : 'Ask'}
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        {isLoading && !error && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
            <Spinner className="h-3 w-3" /> Thinking…
          </p>
        )}

        {!isLoading && result && (
          <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-2">
            <div className="flex items-center gap-2">
              <GeneratedByBadge generatedBy={result.generatedBy} />
              {result.generatedBy === 'bedrock' && (
                <span className="text-[11px] text-[var(--text-muted)]">numbers computed by the engine</span>
              )}
            </div>
            <p className="text-sm text-[var(--text-primary)]">{result.answer}</p>
            {result.toolsUsed.length > 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Grounded in: {result.toolsUsed.map((t) => formatToolCall(t.name, t.input, t.resultSummary)).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

export default AskPanel
