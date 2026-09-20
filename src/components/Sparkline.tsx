interface SparklineProps {
  label: string
  values: number[]
  /** Formats a value for the title/tooltip on each point — e.g. "62%" or "3.1x". */
  format?: (n: number) => string
  color?: string
}

const WIDTH = 220
const HEIGHT = 40
const PADDING = 4

/** A minimal, dependency-free SVG line chart — oldest to newest, left to right. Renders nothing
 * (not a flat/fake line) when there's fewer than 2 points, since a trend needs at least two. */
function Sparkline({ label, values, format = (n) => n.toFixed(2), color = 'var(--accent)' }: SparklineProps) {
  if (values.length < 2) {
    return (
      <div className="text-xs text-[var(--text-muted)]">
        {label}: not enough history yet ({values.length} snapshot{values.length === 1 ? '' : 's'}).
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = PADDING + (i / (values.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - ((v - min) / range) * (HEIGHT - PADDING * 2)
    return { x, y, v }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular-nums text-[var(--text-primary)]">{format(values[values.length - 1])}</span>
      </div>
      <svg width={WIDTH} height={HEIGHT} role="img" aria-label={`${label} trend: ${values.map(format).join(', ')}`}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3 : 2} fill={color}>
            <title>{format(p.v)}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

export default Sparkline
