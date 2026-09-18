interface LandingPageProps {
  onGetStarted: () => void
}

function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[var(--bg-base)] px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(600px circle at 50% 20%, color-mix(in srgb, var(--accent) 12%, transparent), transparent)',
        }}
        aria-hidden="true"
      />
      <div className="animate-rise-in relative flex flex-col items-center gap-6">
        <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
          Dependency risk intelligence
        </span>
        <h1 className="text-4xl font-semibold text-[var(--text-primary)] sm:text-5xl">Blast Radius Mapper</h1>
        <p className="max-w-xl text-[var(--text-secondary)]">
          See what breaks before it breaks. Map your repo's third-party vendors, find where they secretly share
          infrastructure, and quantify the correlated risk in downtime and cost — not just a pretty dependency
          graph.
        </p>
        <button
          onClick={onGetStarted}
          className="mt-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#0a0b0e] transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Get started
        </button>
      </div>
    </div>
  )
}

export default LandingPage
