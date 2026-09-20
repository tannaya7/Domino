import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildOwnInfrastructure } from '../src/ownInfra'
import { buildFixesPrText, generatePatches } from '../src/ownInfraPatches'

function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Applies a unified diff to a fresh git repo and asserts `git apply --check` accepts it —
 * real proof the diff is byte-correct and git-apply-compatible, not just "looks right". Skips
 * cleanly (never fails the suite) when git isn't on PATH, per the task's own instruction. */
function assertGitApplyCheck(fileName: string, originalContent: string, diff: string) {
  if (!hasGit()) return
  const dir = mkdtempSync(join(tmpdir(), 'brm-patch-test-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir })
    writeFileSync(join(dir, fileName), originalContent)
    execFileSync('git', ['add', fileName], { cwd: dir })
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir })
    writeFileSync(join(dir, 'change.patch'), diff)
    execFileSync('git', ['apply', '--check', 'change.patch'], { cwd: dir })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('generatePatches — R2 RDS_SINGLE_AZ', () => {
  it('patches an absent multi_az, self-check confirms the finding disappears, and git apply --check accepts it', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  engine = "postgres"
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    expect(own.findings.map((f) => f.rule)).toContain('RDS_SINGLE_AZ')

    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('+  multi_az = true')

    const patchedContent = tf.replace('engine = "postgres"', 'engine = "postgres"\n  multi_az = true')
    const relinted = buildOwnInfrastructure([{ path: 'main.tf', content: patchedContent }])
    expect(relinted.findings.map((f) => f.rule)).not.toContain('RDS_SINGLE_AZ')

    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })

  it('replaces an explicit multi_az = false, preserving the rest of the line', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az = false # dev only
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('-  multi_az = false # dev only')
    expect(fix.diff).toContain('+  multi_az = true # dev only')
    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })
})

describe('generatePatches — R3 DB_BACKUPS_DISABLED', () => {
  it('changes an explicit 0 to 7 and the finding disappears on re-lint', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az                = true
  backup_retention_period = 0
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'DB_BACKUPS_DISABLED')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('-  backup_retention_period = 0')
    expect(fix.diff).toContain('+  backup_retention_period = 7')

    const patchedContent = tf.replace('backup_retention_period = 0', 'backup_retention_period = 7')
    const relinted = buildOwnInfrastructure([{ path: 'main.tf', content: patchedContent }])
    expect(relinted.findings.map((f) => f.rule)).not.toContain('DB_BACKUPS_DISABLED')
    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })
})

describe('generatePatches — R4 DDB_NO_PITR', () => {
  it('inserts a point_in_time_recovery block when absent entirely', () => {
    const tf = `
resource "aws_dynamodb_table" "cache" {
  name = "cache"
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'DDB_NO_PITR')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('point_in_time_recovery {')
    expect(fix.diff).toContain('enabled = true')

    const patchedContent = tf.replace(
      'resource "aws_dynamodb_table" "cache" {',
      'resource "aws_dynamodb_table" "cache" {\n  point_in_time_recovery {\n    enabled = true\n  }',
    )
    const relinted = buildOwnInfrastructure([{ path: 'main.tf', content: patchedContent }])
    expect(relinted.findings.map((f) => f.rule)).not.toContain('DDB_NO_PITR')
    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })

  it('flips enabled = false to true when the nested block already exists', () => {
    const tf = `
resource "aws_dynamodb_table" "cache" {
  name = "cache"
  point_in_time_recovery {
    enabled = false
  }
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'DDB_NO_PITR')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('-    enabled = false')
    expect(fix.diff).toContain('+    enabled = true')
    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })
})

describe('generatePatches — R6 CACHE_NO_FAILOVER', () => {
  it('patches when num_cache_clusters >= 2 gives static replica evidence', () => {
    const tf = `
resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
  num_cache_clusters         = 3
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'CACHE_NO_FAILOVER')!
    expect(fix.status).toBe('patched')
    expect(fix.diff).toContain('+  automatic_failover_enabled = true')
    assertGitApplyCheck('main.tf', tf, fix.diff!)
  })

  it('patches when replicas_per_node_group >= 2 gives static replica evidence', () => {
    const tf = `
resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
  replicas_per_node_group    = 2
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'CACHE_NO_FAILOVER')!
    expect(fix.status).toBe('patched')
  })

  it('is advisory-only (no patch) with exactly 1 cluster — no replica to fail over to', () => {
    const tf = `
resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
  num_cache_clusters         = 1
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'CACHE_NO_FAILOVER')!
    expect(fix.status).toBe('advisory')
    expect(fix.diff).toBeUndefined()
    expect(fix.note).toMatch(/replica/i)
  })

  it('is advisory-only (no patch) with no cluster-count evidence at all', () => {
    const tf = `
resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'CACHE_NO_FAILOVER')!
    expect(fix.status).toBe('advisory')
  })
})

describe('generatePatches — R1/R5 are always advisory, never a patch', () => {
  it('SINGLE_REGION and SINGLE_INSTANCE never produce a diff', () => {
    const tf = `
provider "aws" {
  region = "us-east-1"
}

resource "aws_ecs_service" "api" {
  desired_count = 1
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    expect(own.findings.map((f) => f.rule).sort()).toEqual(['SINGLE_INSTANCE', 'SINGLE_REGION'])
    const fixes = generatePatches(files, own.findings)
    for (const fix of fixes) {
      expect(fix.status).toBe('advisory')
      expect(fix.diff).toBeUndefined()
    }
  })
})

describe('generatePatches — refusal cases', () => {
  it('refuses a resource containing a dynamic block', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az = false
  dynamic "restore_to_point_in_time" {
    for_each = var.restore ? [1] : []
    content {
      source_db_instance_identifier = "x"
    }
  }
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('refused')
    expect(fix.note).toMatch(/dynamic/i)
  })

  it('refuses a resource defined under a modules/ path', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az = false
}
`
    const files = [{ path: 'modules/db/main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('refused')
    expect(fix.note).toMatch(/module/i)
  })

  it('refuses a resource using count (multiple instances)', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  count    = 2
  multi_az = false
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('refused')
    expect(fix.note).toMatch(/count|for_each/i)
  })

  it('refuses a resource using for_each (multiple instances)', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  for_each = var.instances
  multi_az = false
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const fix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(fix.status).toBe('refused')
  })

  it('refuses via the unresolved-value safety net when the current file state disagrees with a stale finding', () => {
    // Synthetic: a finding claims RDS_SINGLE_AZ for a resource whose CURRENT file content has since
    // set multi_az to an unresolved variable — exercises the defensive check directly, since the
    // real pipeline (finding computed from the SAME file content passed to generatePatches) can
    // never produce this combination itself (the rule engine never emits a finding for an
    // unresolved attribute in the first place).
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az = var.multi_az
}
`
    const staleFinding = {
      rule: 'RDS_SINGLE_AZ' as const,
      severity: 'high' as const,
      pillar: 'Reliability' as const,
      resource: 'aws_db_instance.primary',
      file: 'main.tf',
      line: 2,
      message: 'stale',
      fixSnippet: 'stale',
    }
    const fixes = generatePatches([{ path: 'main.tf', content: tf }], [staleFinding])
    expect(fixes[0].status).toBe('refused')
    expect(fixes[0].note).toMatch(/variable|expression/i)
  })

  it('refuses a CFN/SAM-shaped finding — no CFN parser exists to self-check against', () => {
    const finding = {
      rule: 'RDS_SINGLE_AZ' as const,
      severity: 'high' as const,
      pillar: 'Reliability' as const,
      resource: 'AWS::RDS::DBInstance.Primary',
      file: 'template.yaml',
      line: 10,
      message: 'x',
      fixSnippet: 'x',
    }
    const fixes = generatePatches([{ path: 'template.yaml', content: 'AWSTemplateFormatVersion: "2010-09-09"\n' }], [finding])
    expect(fixes[0].status).toBe('refused')
    expect(fixes[0].note).toMatch(/CFN/i)
  })
})

describe('generatePatches — precision: comments and fake attributes never get edited', () => {
  it('leaves a fake multi_az inside a comment and inside a string value untouched', () => {
    const tf = `
# multi_az = true (fake, in a comment)
resource "aws_db_instance" "primary" {
  description = "multi_az = true, backup_retention_period = 7"
  multi_az    = false
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const azFix = fixes.find((f) => f.rule === 'RDS_SINGLE_AZ')!
    expect(azFix.status).toBe('patched')
    // Only the real attribute line changes — the comment and the string value survive verbatim.
    expect(azFix.diff).toContain('# multi_az = true (fake, in a comment)')
    expect(azFix.diff).toContain('description = "multi_az = true, backup_retention_period = 7"')
    expect(azFix.diff).toContain('-  multi_az    = false')
    expect(azFix.diff).toContain('+  multi_az    = true')
    assertGitApplyCheck('main.tf', tf, azFix.diff!)
  })
})

describe('generatePatches — idempotence', () => {
  it('a second run against the already-patched files produces no further patches for the fixed rules', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  engine                  = "postgres"
  backup_retention_period = 0
}

resource "aws_dynamodb_table" "cache" {
  name = "cache"
}
`
    const files1 = [{ path: 'main.tf', content: tf }]
    const own1 = buildOwnInfrastructure(files1)
    const fixes1 = generatePatches(files1, own1.findings)
    const patchedRules1 = fixes1.filter((f) => f.status === 'patched').map((f) => f.rule).sort()
    expect(patchedRules1).toEqual(['DB_BACKUPS_DISABLED', 'DDB_NO_PITR', 'RDS_SINGLE_AZ'])

    let content = tf
    content = content.replace('backup_retention_period = 0', 'backup_retention_period = 7')
    content = content.replace('engine                  = "postgres"', 'engine                  = "postgres"\n  multi_az                = true')
    content = content.replace('name = "cache"', 'name = "cache"\n  point_in_time_recovery {\n    enabled = true\n  }')

    const files2 = [{ path: 'main.tf', content }]
    const own2 = buildOwnInfrastructure(files2)
    expect(own2.findings.filter((f) => ['RDS_SINGLE_AZ', 'DB_BACKUPS_DISABLED', 'DDB_NO_PITR'].includes(f.rule))).toEqual([])

    const fixes2 = generatePatches(files2, own2.findings)
    expect(fixes2.filter((f) => f.status === 'patched')).toEqual([])
  })
})

describe('buildFixesPrText — deterministic markdown', () => {
  it('uses the exact required cost/risk wording and footer, and is null with no patched fixes', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  multi_az = false
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    const prText = buildFixesPrText(fixes)
    expect(prText).toContain('runs a standby replica and typically costs about double the single-AZ instance price; check current pricing')
    expect(prText).toContain('can cause a brief interruption or resource change; run terraform plan first')
    expect(prText).toContain('generated by Blast Radius Mapper: review before merging')

    expect(buildFixesPrText([])).toBeNull()
    expect(buildFixesPrText([{ rule: 'SINGLE_REGION', resource: 'x', file: 'main.tf', status: 'advisory', note: 'x' }])).toBeNull()
  })

  it('uses the exact PITR wording', () => {
    const tf = `
resource "aws_dynamodb_table" "cache" {
  name = "cache"
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    expect(buildFixesPrText(fixes)).toContain('adds continuous-backup storage cost')
  })

  it('uses the exact failover wording', () => {
    const tf = `
resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
  num_cache_clusters         = 2
}
`
    const files = [{ path: 'main.tf', content: tf }]
    const own = buildOwnInfrastructure(files)
    const fixes = generatePatches(files, own.findings)
    expect(buildFixesPrText(fixes)).toContain('requires at least one replica, which adds cost')
  })
})
