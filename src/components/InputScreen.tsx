import { useState } from 'react'
import DataInput from './DataInput'
import HeroAnimation from './HeroAnimation'
import PrInput from './PrInput'
import RepoInput from './RepoInput'
import type { AnalyzePrResponse, AnalyzeRepoResponse } from '../lib/api'
import type { DemoSnapshot } from '../lib/demoSnapshot'
import type { GraphData } from '../lib/types'

interface InputScreenProps {
  onRepoAnalyzed: (result: AnalyzeRepoResponse, repoUrl: string) => void
  onManualLoad: (data: GraphData) => void
  onPrAnalyzed: (result: AnalyzePrResponse) => void
  onSnapshotLoaded: (snapshot: DemoSnapshot) => void
  onPlayTour: () => void
  /** The guided tour's end card lands back here and focuses the repo URL input — see App.tsx. */
  autoFocusRepoUrl?: boolean
}

type Tab = 'repo' | 'pr' | 'json'

const TABS: { id: Tab; label: string }[] = [
  { id: 'repo', label: 'GitHub Repo' },
  { id: 'pr', label: 'Pull Request' },
  { id: 'json', label: 'Paste JSON / Sample Data' },
]

const CHIPS = ['Vendors are not independent', 'Correlated risk quantified', 'AWS-native: Lambda · DynamoDB · Bedrock']

function InputScreen({ onRepoAnalyzed, onManualLoad, onPrAnalyzed, onSnapshotLoaded, onPlayTour, autoFocusRepoUrl }: InputScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('repo')

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
            Dependency risk intelligence
          </span>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">Blast Radius Mapper</h1>
          <p className="max-w-xl text-sm text-[var(--text-secondary)]">
            See what breaks before it breaks. Map your repo's third-party vendors, find where they secretly share
            infrastructure, and quantify the correlated risk in downtime and cost — not just a pretty dependency
            graph.
          </p>
          <div className="w-full max-w-xs">
            <HeroAnimation />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]"
              >
                {chip}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onPlayTour}
            data-tour="play-tour-hero"
            className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent-strong)] hover:bg-[var(--accent)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            ▶ Play 45-second tour
          </button>
        </div>

        <div className="mx-auto mb-6 flex max-w-xl gap-1 border-b border-[var(--border-subtle)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--accent)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'repo' && (
          <RepoInput
            onAnalyzed={onRepoAnalyzed}
            onLoadSample={onManualLoad}
            onSnapshotLoaded={onSnapshotLoaded}
            autoFocus={autoFocusRepoUrl}
          />
        )}
        {activeTab === 'pr' && <PrInput onAnalyzed={onPrAnalyzed} />}
        {activeTab === 'json' && <DataInput onLoad={onManualLoad} />}
      </div>
    </div>
  )
}

export default InputScreen
