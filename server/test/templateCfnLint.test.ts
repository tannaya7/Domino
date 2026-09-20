import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TEMPLATE_PATH = path.join(import.meta.dirname, '..', '..', 'template.yaml')

function cfnLintAvailable(): boolean {
  try {
    execFileSync('cfn-lint', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// "cfn-lint on the template if available" — this environment may not have it installed (it's a
// separate Python tool, not an npm dependency of this project). Skips honestly with a visible
// reason instead of silently passing or failing the suite when it's missing.
describe.skipIf(!cfnLintAvailable())('template.yaml — cfn-lint', () => {
  it('passes cfn-lint with no errors', () => {
    // Throws (execFileSync) on any non-zero exit — a real cfn-lint finding fails this test, not
    // just gets logged.
    const output = execFileSync('cfn-lint', [TEMPLATE_PATH], { encoding: 'utf-8' })
    expect(output.trim()).toBe('')
  })
})

if (!cfnLintAvailable()) {
  describe('template.yaml — cfn-lint', () => {
    it.skip('cfn-lint is not installed in this environment — skipped (see CONTRIBUTING.md / DEPLOYMENT.md to run it locally)', () => {})
  })
}
