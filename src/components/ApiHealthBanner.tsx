import { useState } from 'react'
import { useApiHealth } from '../lib/useApiHealth'

/** Sits above everything else (App.tsx) so it's visible whether the user is on InputScreen or
 * Workspace. Only ever renders content when the backend is confirmed unreachable — 'checking' and
 * 'reachable' render nothing, so this never flashes on a healthy load. */
function ApiHealthBanner() {
  const health = useApiHealth()
  const [dismissed, setDismissed] = useState(false)

  if (health !== 'unreachable' || dismissed) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200"
    >
      <span>
        <strong className="font-semibold">API unreachable:</strong> example snapshots still work — try one from the
        GitHub Repo tab.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded px-1.5 py-0.5 text-amber-300 hover:bg-amber-500/20 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        ✕
      </button>
    </div>
  )
}

export default ApiHealthBanner
