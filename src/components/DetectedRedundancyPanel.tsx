import type { DetectedRedundancyGroup } from '../lib/detectedRedundancy'
import Panel from './ui/Panel'

interface DetectedRedundancyPanelProps {
  groups: DetectedRedundancyGroup[]
}

function DetectedRedundancyPanel({ groups }: DetectedRedundancyPanelProps) {
  if (groups.length === 0) return null

  return (
    <Panel
      title="Detected redundancy"
      subtitle="Possible redundancy: we can't see whether your code actually fails over between these."
    >
      <ul className="space-y-2">
        {groups.map((group) => (
          <li key={group.tier} className="rounded-lg border border-[var(--border-subtle)] p-2 text-sm">
            <p className="text-[var(--text-primary)]">
              <span className="font-medium">{group.tier}</span>: {group.memberNames.join(' + ')}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              P(all down at once): {(group.groupDownProbabilityPerYear * 100).toFixed(3)}%/yr
            </p>
            {group.redundancyIllusion && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <span aria-hidden="true">⚠</span>
                Redundancy illusion — shares {group.sharedSubstrates.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default DetectedRedundancyPanel
