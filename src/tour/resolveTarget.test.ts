// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTargetElement } from './resolveTarget'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('resolveTargetElement', () => {
  it('resolves immediately when the element already exists', async () => {
    const div = document.createElement('div')
    div.id = 'exists'
    document.body.appendChild(div)
    const el = await resolveTargetElement('#exists', { retries: 0, intervalMs: 1 })
    expect(el).toBe(div)
  })

  it('resolves once the element appears within the retry window', async () => {
    setTimeout(() => {
      const div = document.createElement('div')
      div.id = 'appears-later'
      document.body.appendChild(div)
    }, 20)
    const el = await resolveTargetElement('#appears-later', { retries: 5, intervalMs: 10 })
    expect(el).not.toBeNull()
  })

  it('gives up and returns null — never throws — when the target never appears', async () => {
    const el = await resolveTargetElement('#never-exists', { retries: 2, intervalMs: 5 })
    expect(el).toBeNull()
  })
})
