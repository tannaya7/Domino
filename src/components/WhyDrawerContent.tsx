import type { WhyContent } from '../lib/whyDrawer'

interface WhyDrawerContentProps {
  content: WhyContent
}

/** Renders a `WhyContent` inside the shared `Drawer` shell — content-agnostic across headline
 * metrics, risk-register rows, and criticality items; every field comes straight from the analysis
 * object, nothing is invented here. */
function WhyDrawerContent({ content }: WhyDrawerContentProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-[var(--text-primary)]">{content.claim}</p>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Inputs</h3>
        <dl className="space-y-1">
          {content.inputs.map((input) => (
            <div key={input.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-secondary)]">{input.label}</dt>
              <dd className="tabular-nums text-[var(--text-primary)]">{input.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Formula</h3>
        <code className="block rounded-md border border-[var(--border-subtle)] bg-black/20 px-2 py-1.5 text-xs text-[var(--text-secondary)]">
          {content.formula}
        </code>
      </div>

      {content.evidence.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Evidence</h3>
          <ul className="space-y-1">
            {content.evidence.map((item, i) => (
              <li key={`${item.label}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-[var(--text-muted)]">{item.label}</span>
                <span className="truncate text-right text-[var(--text-secondary)]" title={item.detail}>
                  {item.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          What would change it
        </h3>
        {content.changes.length > 0 ? (
          <ul className="space-y-2">
            {content.changes.map((change, i) => (
              <li key={i} className="rounded-md border border-[var(--border-subtle)] p-2">
                <p className="text-[var(--text-secondary)]">{change.description}</p>
                <p className="mt-1 tabular-nums text-[var(--text-primary)]">
                  {change.before} <span className="text-[var(--text-muted)]" aria-hidden="true">→</span>{' '}
                  <span className="sr-only">to</span>
                  {change.after}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--text-muted)]">{content.changesNote}</p>
        )}
      </div>
    </div>
  )
}

export default WhyDrawerContent
