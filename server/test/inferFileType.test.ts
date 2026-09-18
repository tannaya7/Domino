import { describe, expect, it } from 'vitest'
import { inferFileType } from '../src/inferFileType'

describe('inferFileType', () => {
  it('detects test files by path and by filename convention', () => {
    expect(inferFileType('test/app.js')).toBe('test')
    expect(inferFileType('src/__tests__/foo.js')).toBe('test')
    expect(inferFileType('src/foo.test.ts')).toBe('test')
    expect(inferFileType('src/foo.spec.tsx')).toBe('test')
  })

  it('detects React-style components', () => {
    expect(inferFileType('src/components/Button.tsx')).toBe('component')
    expect(inferFileType('src/Header.jsx')).toBe('component')
  })

  it('detects api/route files', () => {
    expect(inferFileType('src/api/users.ts')).toBe('api')
    expect(inferFileType('src/routes/index.js')).toBe('api')
    expect(inferFileType('src/controllers/UserController.ts')).toBe('api')
  })

  it('detects config files', () => {
    expect(inferFileType('webpack.config.js')).toBe('config')
    expect(inferFileType('src/config/database.ts')).toBe('config')
  })

  it('detects util/helper files', () => {
    expect(inferFileType('src/utils/format.ts')).toBe('util')
    expect(inferFileType('src/lib/stringHelper.js')).toBe('util')
  })

  it('falls back to a generic "file" type', () => {
    expect(inferFileType('src/index.ts')).toBe('file')
    expect(inferFileType('lib/application.js')).toBe('file')
  })
})
