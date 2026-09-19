// Pure SVG + CSS, no dependency: 12 vendor dots scattered at random, collapsing into 3 substrate
// clusters, then one cluster (a stand-in for "your most concentrated substrate") turns red. Loops
// every 2s. prefers-reduced-motion gets the settled, already-red end state directly — never a
// frozen mid-animation frame.

const CLUSTER_CENTERS: Array<[number, number]> = [
  [60, 62],
  [150, 62],
  [240, 62],
]

const CLUSTER_OFFSETS: Array<[number, number]> = [
  [-11, -11],
  [11, -11],
  [-11, 11],
  [11, 11],
]

// Hand-placed, not random — deterministic so the reduced-motion end state and every loop iteration
// look identical, and so this is trivially snapshot-testable.
const SCATTERED_POSITIONS: Array<[number, number]> = [
  [18, 14],
  [272, 18],
  [104, 96],
  [204, 12],
  [36, 98],
  [262, 92],
  [132, 16],
  [10, 58],
  [292, 60],
  [162, 102],
  [66, 28],
  [232, 106],
]

const OUTAGE_CLUSTER_INDEX = 2

function HeroAnimation() {
  const dots = SCATTERED_POSITIONS.map((scattered, i) => {
    const clusterIndex = Math.floor(i / 4) as 0 | 1 | 2
    const offset = CLUSTER_OFFSETS[i % 4]
    const [ccx, ccy] = CLUSTER_CENTERS[clusterIndex]
    const clusteredX = ccx + offset[0]
    const clusteredY = ccy + offset[1]
    const [sx, sy] = scattered
    return {
      key: i,
      x: clusteredX,
      y: clusteredY,
      tx: sx - clusteredX,
      ty: sy - clusteredY,
      delay: (i % 4) * 0.03,
      isOutage: clusterIndex === OUTAGE_CLUSTER_INDEX,
    }
  })

  return (
    <div className="hero-animation" aria-hidden="true">
      <style>{`
        .hero-animation svg { display: block; width: 100%; height: auto; }
        .hero-dot {
          fill: var(--accent);
          animation: hero-collapse 2s ease-in-out infinite;
        }
        .hero-dot--outage {
          animation: hero-collapse 2s ease-in-out infinite, hero-outage-fill 2s ease-in-out infinite;
        }
        @keyframes hero-collapse {
          0% { transform: translate(var(--tx), var(--ty)); }
          35%, 78% { transform: translate(0, 0); }
          100% { transform: translate(var(--tx), var(--ty)); }
        }
        @keyframes hero-outage-fill {
          0%, 58% { fill: var(--accent); }
          75%, 92% { fill: var(--status-critical); }
          100% { fill: var(--accent); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-dot { animation: none !important; transform: translate(0, 0) !important; }
          .hero-dot--outage { fill: var(--status-critical) !important; }
        }
      `}</style>
      <svg viewBox="0 0 300 124" role="presentation">
        {dots.map((d) => (
          <circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={5}
            className={`hero-dot${d.isOutage ? ' hero-dot--outage' : ''}`}
            style={{ ['--tx' as string]: `${d.tx}px`, ['--ty' as string]: `${d.ty}px`, animationDelay: `${d.delay}s` }}
          />
        ))}
      </svg>
    </div>
  )
}

export default HeroAnimation
