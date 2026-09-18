import { describe, expect, it } from 'vitest'
import { escapeHtml } from './sanitize'

describe('escapeHtml', () => {
  it('escapes an XSS-shaped file path from an untrusted repo', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>.ts')).toBe('&lt;img src=x onerror=alert(1)&gt;.ts')
  })

  it('escapes ampersands, quotes, and apostrophes', () => {
    expect(escapeHtml(`a & b "c" 'd'`)).toBe('a &amp; b &quot;c&quot; &#39;d&#39;')
  })

  it('leaves an ordinary file path unchanged', () => {
    expect(escapeHtml('src/components/GraphView.tsx')).toBe('src/components/GraphView.tsx')
  })
})
