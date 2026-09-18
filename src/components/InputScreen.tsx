import { useState } from 'react'
import DataInput from './DataInput'
import PrInput from './PrInput'
import RepoInput from './RepoInput'
import type { AnalyzePrResponse, AnalyzeRepoResponse } from '../lib/api'
import type { GraphData } from '../lib/types'

interface InputScreenProps {
  onRepoAnalyzed: (result: AnalyzeRepoResponse, repoUrl: string) => void
  onManualLoad: (data: GraphData) => void
  onPrAnalyzed: (result: AnalyzePrResponse) => void
}

type Tab = 'repo' | 'pr' | 'json'

const TABS: { id: Tab; label: string }[] = [
  { id: 'repo', label: 'GitHub Repo' },
  { id: 'pr', label: 'Pull Request' },
  { id: 'json', label: 'Paste JSON / Sample Data' },
]

function InputScreen({ onRepoAnalyzed, onManualLoad, onPrAnalyzed }: InputScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('repo')

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
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

        {activeTab === 'repo' && <RepoInput onAnalyzed={onRepoAnalyzed} onLoadSample={onManualLoad} />}
        {activeTab === 'pr' && <PrInput onAnalyzed={onPrAnalyzed} />}
        {activeTab === 'json' && <DataInput onLoad={onManualLoad} />}
      </div>
    </div>
  )
}

export default InputScreen
