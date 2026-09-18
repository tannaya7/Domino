import { useCountUp } from '../../hooks/useCountUp'

interface StatTileProps {
  label: string
  value: number
  format?: (n: number) => string
  tone?: 'default' | 'accent' | 'critical'
  hint?: string
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString()

const TONE_CLASSES: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-[var(--text-primary)]',
  accent: 'text-[var(--accent-strong)]',
  critical: 'text-[var(--status-critical)]',
}

function StatTile({ label, value, format = defaultFormat, tone = 'default', hint }: StatTileProps) {
  const animated = useCountUp(value)
  return (
    <div className="panel-glass animate-rise-in rounded-lg px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{format(animated)}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  )
}

export default StatTile
