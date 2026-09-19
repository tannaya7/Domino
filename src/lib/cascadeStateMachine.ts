// Pure state machine driving any "simulate a failure and watch it propagate" cascade — the
// substrate-scenario cascade and the per-vendor cascade in VendorGraphView both go through this,
// so their idle/propagating/done/reset semantics can't drift apart or be tested separately.

export type CascadeState = 'idle' | 'propagating' | 'done'
export type CascadeEvent = 'start' | 'complete' | 'reset'

/** idle --start--> propagating --complete--> done --reset--> idle. Any other transition is a no-op
 * (e.g. "complete" while already idle does nothing — there's nothing running to finish). */
export function cascadeReducer(state: CascadeState, event: CascadeEvent): CascadeState {
  if (event === 'reset') return 'idle'
  if (event === 'start') return 'propagating'
  if (event === 'complete') return state === 'propagating' ? 'done' : state
  return state
}
