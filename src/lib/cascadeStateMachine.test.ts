import { describe, expect, it } from 'vitest'
import { cascadeReducer } from './cascadeStateMachine'

describe('cascadeReducer', () => {
  it('goes idle -> propagating -> done -> idle across the full lifecycle', () => {
    let state = cascadeReducer('idle', 'start')
    expect(state).toBe('propagating')
    state = cascadeReducer(state, 'complete')
    expect(state).toBe('done')
    state = cascadeReducer(state, 'reset')
    expect(state).toBe('idle')
  })

  it('"complete" while idle is a no-op (nothing was running)', () => {
    expect(cascadeReducer('idle', 'complete')).toBe('idle')
  })

  it('"complete" while already done is a no-op', () => {
    expect(cascadeReducer('done', 'complete')).toBe('done')
  })

  it('"reset" returns to idle from any state', () => {
    expect(cascadeReducer('propagating', 'reset')).toBe('idle')
    expect(cascadeReducer('done', 'reset')).toBe('idle')
    expect(cascadeReducer('idle', 'reset')).toBe('idle')
  })

  it('"start" restarts a cascade that already finished (Replay)', () => {
    expect(cascadeReducer('done', 'start')).toBe('propagating')
  })
})
