import { describe, expect, it } from 'vitest'
import { extractEnvVarNames, parseEnvFile } from '../src/envScanner'

describe('extractEnvVarNames', () => {
  it('extracts process.env references', () => {
    const source = `const key = process.env.STRIPE_SECRET_KEY;\nconst url = process.env.SUPABASE_URL;`
    expect(extractEnvVarNames(source)).toEqual(['STRIPE_SECRET_KEY', 'SUPABASE_URL'])
  })

  it('extracts import.meta.env references', () => {
    const source = `const key = import.meta.env.VITE_API_BASE_URL;`
    expect(extractEnvVarNames(source)).toEqual(['VITE_API_BASE_URL'])
  })

  it('deduplicates repeated references', () => {
    const source = `process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY;`
    expect(extractEnvVarNames(source)).toEqual(['OPENAI_API_KEY'])
  })

  it('returns an empty array when there are no env references', () => {
    expect(extractEnvVarNames('const x = 1;')).toEqual([])
  })
})

describe('parseEnvFile', () => {
  it('extracts KEY names from KEY=value lines', () => {
    const content = `STRIPE_SECRET_KEY=sk_test_123\nSENTRY_DSN=https://example.com`
    expect(parseEnvFile(content)).toEqual(['STRIPE_SECRET_KEY', 'SENTRY_DSN'])
  })

  it('ignores comments and blank lines', () => {
    const content = `# a comment\n\nOPENAI_API_KEY=\n  # indented comment`
    expect(parseEnvFile(content)).toEqual(['OPENAI_API_KEY'])
  })

  it('tolerates an export prefix', () => {
    expect(parseEnvFile('export TWILIO_AUTH_TOKEN=abc')).toEqual(['TWILIO_AUTH_TOKEN'])
  })
})
