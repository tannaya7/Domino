import { useMemo, useState } from 'react'
import { generateFisTemplate, type VerifiedFisAction } from '../engine/fisTemplate'
import type { FisScenarioDefinition } from '../lib/fisScenarios'
import Modal from './Modal'

interface FisValidateModalProps {
  isOpen: boolean
  onClose: () => void
  scenario: FisScenarioDefinition
  targetTags: Record<string, string>
  region: string
  verifiedActions: VerifiedFisAction[]
}

const CHECKLIST_ITEMS = [
  'Running in non-production first',
  'Only the intended resources carry the blast-radius-experiment=true tag',
  'The CloudWatch guardrail alarm is confirmed real, not the sample placeholder',
  'The team has been told before this runs',
]

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function FisValidateModal({ isOpen, onClose, scenario, targetTags, region, verifiedActions }: FisValidateModalProps) {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST_ITEMS.map(() => false))
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  // allowUnverifiedDraft: true — data/fis-actions.verified.json ships as an honestly-labeled draft
  // until someone runs `npm run verify:fis` with real AWS credentials (see that file's own
  // $comment). Once it's genuinely verified this flag is a no-op — verified actions never need it.
  const result = useMemo(
    () =>
      generateFisTemplate(
        { hypothesis: scenario.hypothesis, actionId: scenario.actionId, targetTags, region },
        verifiedActions,
        { allowUnverifiedDraft: true },
      ),
    [scenario, targetTags, region, verifiedActions],
  )

  function toggleChecked(i: number) {
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)))
  }

  async function handleCopyCli() {
    if (result.skipped) return
    try {
      await navigator.clipboard.writeText(result.cliCommand)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Validate this in your account">
      <div className="flex flex-col gap-4 text-sm">
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300">
          Generated, not executed by Blast Radius Mapper — this tool never runs anything in your AWS account.
        </p>

        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Hypothesis to test</p>
          <p className="mt-1 text-[var(--text-primary)]">{scenario.hypothesis}</p>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">What to observe</p>
          <p className="mt-1 text-[var(--text-secondary)]">{scenario.whatToObserve}</p>
        </div>

        {result.skipped ? (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
            Could not generate a template: {result.reason}
          </p>
        ) : (
          <>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadFile('blast-radius-experiment-template.json', JSON.stringify(result.cliInputJson, null, 2), 'application/json')}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => downloadFile('blast-radius-experiment-template.yaml', result.cloudFormationYaml, 'application/x-yaml')}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Download CloudFormation
              </button>
              <button
                type="button"
                onClick={() => downloadFile('README.md', result.readmeMarkdown, 'text/markdown')}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Download README
              </button>
              <button
                type="button"
                onClick={handleCopyCli}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy CLI command'}
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Safety checklist</p>
              <ul className="space-y-1.5">
                {CHECKLIST_ITEMS.map((item, i) => (
                  <li key={item}>
                    <label className="flex items-start gap-2 text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={checked[i]}
                        onChange={() => toggleChecked(i)}
                        className="mt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      />
                      {item}
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              The README has the full setup steps and this same safety checklist. Every file has{' '}
              <code className="font-mono">&lt;ACCOUNT_ID&gt;</code> placeholders to fill in before use.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

export default FisValidateModal
