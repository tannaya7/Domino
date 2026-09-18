import { useState } from 'react'
import DataInput from './DataInput'
import PrInput from './PrInput'
import RepoInput from './RepoInput'
import type { AnalyzePrResponse } from '../lib/api'
import type { GraphData } from '../lib/types'

interface InputScreenProps {
  onLoad: (data: GraphData) => void
  onPrAnalyzed: (result: AnalyzePrResponse) => void
}

type Tab = 'repo' | 'pr' | 'json'

const TABS: { id: Tab; label: string }[] = [
  { id: 'repo', label: 'GitHub Repo' },
  { id: 'pr', label: 'Pull Request' },
  { id: 'json', label: 'Paste JSON / Sample Data' },
]

function InputScreen({ onLoad, onPrAnalyzed }: InputScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('repo')

  return (
    <div className="w-full p-6">
      <div className="mx-auto mb-6 flex max-w-xl gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'repo' && <RepoInput onLoad={onLoad} />}
      {activeTab === 'pr' && <PrInput onAnalyzed={onPrAnalyzed} />}
      {activeTab === 'json' && <DataInput onLoad={onLoad} />}
    </div>
  )
}

export default InputScreen
