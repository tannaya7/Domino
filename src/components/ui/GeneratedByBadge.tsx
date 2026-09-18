interface GeneratedByBadgeProps {
  generatedBy: 'bedrock' | 'deterministic'
}

/** Distinguishes an AI (Bedrock) result from the deterministic fallback — never blur the two. */
function GeneratedByBadge({ generatedBy }: GeneratedByBadgeProps) {
  const isAi = generatedBy === 'bedrock'
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
        isAi
          ? 'border-[var(--accent)] text-[var(--accent-strong)]'
          : 'border-[var(--border-strong)] text-[var(--text-muted)]'
      }`}
    >
      {isAi ? 'AI-generated' : 'Deterministic'}
    </span>
  )
}

export default GeneratedByBadge
