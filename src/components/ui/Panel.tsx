import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

function Panel({ title, subtitle, action, children, className = '' }: PanelProps) {
  return (
    <section className={`panel-glass animate-rise-in rounded-xl p-4 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export default Panel
