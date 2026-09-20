import { describe, expect, it } from 'vitest'
import { evaluateOwnInfrastructure, type ParsedResource, type RegionEvidence } from './ownInfrastructure'

function resource(overrides: Partial<ParsedResource> = {}): ParsedResource {
  return {
    kind: 'other',
    type: 'aws_db_instance',
    name: 'primary',
    file: 'main.tf',
    line: 1,
    attrs: {},
    ...overrides,
  }
}

const oneRegion: RegionEvidence[] = [{ region: 'us-east-1', file: 'main.tf', line: 1, detail: 'provider "aws" region' }]

describe('ownInfrastructure — R1 SINGLE_REGION', () => {
  it('flags a single resolvable region with no multi-region evidence', () => {
    const result = evaluateOwnInfrastructure([], oneRegion, [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['SINGLE_REGION'])
    expect(result.findings[0].resource).toContain('us-east-1')
  })

  it('does NOT flag when multi-region evidence is present (replica block, global cluster, etc.)', () => {
    const result = evaluateOwnInfrastructure(
      [],
      oneRegion,
      [{ file: 'main.tf', line: 5, detail: 'DynamoDB replica block (multi-region table)' }],
      1,
    )
    expect(result.findings.map((f) => f.rule)).not.toContain('SINGLE_REGION')
  })

  it('does NOT flag when two distinct regions are found', () => {
    const twoRegions: RegionEvidence[] = [
      ...oneRegion,
      { region: 'us-west-2', file: 'dr.tf', line: 2, detail: 'provider "aws" region' },
    ]
    const result = evaluateOwnInfrastructure([], twoRegions, [], 2)
    expect(result.findings.map((f) => f.rule)).not.toContain('SINGLE_REGION')
  })

  it('does NOT flag when there is no region evidence at all — unknown, never a finding', () => {
    const result = evaluateOwnInfrastructure([], [], [], 1)
    expect(result.findings.map((f) => f.rule)).not.toContain('SINGLE_REGION')
    expect(result.regions).toEqual([])
  })

  it('rolls up region resourceCount as resources found in the same file as the region evidence', () => {
    const resources = [resource({ file: 'main.tf' }), resource({ file: 'main.tf', name: 'other' }), resource({ file: 'other.tf' })]
    const result = evaluateOwnInfrastructure(resources, oneRegion, [], 1)
    expect(result.regions).toEqual([{ region: 'us-east-1', resourceCount: 2, evidence: ['main.tf:1'] }])
  })
})

describe('ownInfrastructure — R2 RDS_SINGLE_AZ', () => {
  it('flags an RDS instance with multi_az absent (AWS default is single-AZ)', () => {
    const result = evaluateOwnInfrastructure([resource({ kind: 'rds_instance' })], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['RDS_SINGLE_AZ'])
  })

  it('flags an RDS instance with multi_az explicitly false', () => {
    const r = resource({ kind: 'rds_instance', attrs: { multiAz: { kind: 'literal', value: false } } })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['RDS_SINGLE_AZ'])
  })

  it('does NOT flag an RDS instance with multi_az true', () => {
    const r = resource({ kind: 'rds_instance', attrs: { multiAz: { kind: 'literal', value: true } } })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
  })

  it('skips read replicas entirely', () => {
    const r = resource({ kind: 'rds_read_replica' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).not.toContain('RDS_SINGLE_AZ')
  })

  it('reports unresolved (never a finding, never a pass) when multi_az is a variable', () => {
    const r = resource({
      kind: 'rds_instance',
      attrs: { multiAz: { kind: 'unresolved', reason: 'value "var.multi_az" is a variable/expression, not statically resolvable from this repo' } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].reason).toContain('var.multi_az')
  })
})

describe('ownInfrastructure — R3 DB_BACKUPS_DISABLED', () => {
  it('flags an explicit backup_retention_period of 0', () => {
    const r = resource({
      kind: 'rds_instance',
      attrs: { multiAz: { kind: 'literal', value: true }, backupRetentionPeriod: { kind: 'literal', value: 0 } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['DB_BACKUPS_DISABLED'])
  })

  it('does NOT flag when backup_retention_period is absent — AWS defaults to 1 day, not 0', () => {
    const r = resource({ kind: 'rds_instance' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).not.toContain('DB_BACKUPS_DISABLED')
  })

  it('does NOT flag a non-zero explicit retention period', () => {
    const r = resource({ kind: 'rds_instance', attrs: { backupRetentionPeriod: { kind: 'literal', value: 7 } } })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).not.toContain('DB_BACKUPS_DISABLED')
  })

  it('applies to read replicas too', () => {
    const r = resource({ kind: 'rds_read_replica', attrs: { backupRetentionPeriod: { kind: 'literal', value: 0 } } })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['DB_BACKUPS_DISABLED'])
  })

  it('reports unresolved when the retention period is a variable', () => {
    const r = resource({
      kind: 'rds_instance',
      attrs: {
        multiAz: { kind: 'literal', value: true },
        backupRetentionPeriod: { kind: 'unresolved', reason: 'value "var.retention" is a variable/expression, not statically resolvable from this repo' },
      },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
  })
})

describe('ownInfrastructure — R4 DDB_NO_PITR', () => {
  it('flags a DynamoDB table with PITR absent — AWS defaults to disabled', () => {
    const r = resource({ kind: 'dynamodb_table', type: 'aws_dynamodb_table' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['DDB_NO_PITR'])
  })

  it('flags PITR explicitly disabled', () => {
    const r = resource({
      kind: 'dynamodb_table',
      type: 'aws_dynamodb_table',
      attrs: { pointInTimeRecoveryEnabled: { kind: 'literal', value: false } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['DDB_NO_PITR'])
  })

  it('does NOT flag PITR enabled', () => {
    const r = resource({
      kind: 'dynamodb_table',
      type: 'aws_dynamodb_table',
      attrs: { pointInTimeRecoveryEnabled: { kind: 'literal', value: true } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
  })

  it('reports unresolved when PITR is a variable', () => {
    const r = resource({
      kind: 'dynamodb_table',
      type: 'aws_dynamodb_table',
      attrs: { pointInTimeRecoveryEnabled: { kind: 'unresolved', reason: 'value "var.pitr" is a variable/expression, not statically resolvable from this repo' } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
  })
})

describe('ownInfrastructure — R5 SINGLE_INSTANCE', () => {
  it('flags an ASG with min=max=1', () => {
    const r = resource({
      kind: 'autoscaling_group',
      type: 'aws_autoscaling_group',
      attrs: { minSize: { kind: 'literal', value: 1 }, maxSize: { kind: 'literal', value: 1 } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['SINGLE_INSTANCE'])
  })

  it('does NOT flag an ASG with min=1 max=4', () => {
    const r = resource({
      kind: 'autoscaling_group',
      type: 'aws_autoscaling_group',
      attrs: { minSize: { kind: 'literal', value: 1 }, maxSize: { kind: 'literal', value: 4 } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
  })

  it('flags an ECS service with desired_count absent — AWS defaults to 1', () => {
    const r = resource({ kind: 'ecs_service', type: 'aws_ecs_service' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['SINGLE_INSTANCE'])
  })

  it('does NOT flag an ECS service with desired_count 2', () => {
    const r = resource({ kind: 'ecs_service', type: 'aws_ecs_service', attrs: { desiredCount: { kind: 'literal', value: 2 } } })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
  })

  it('flags a standalone EC2 instance', () => {
    const r = resource({ kind: 'ec2_instance', type: 'aws_instance' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['SINGLE_INSTANCE'])
  })

  it('reports unresolved when ASG min/max is a variable', () => {
    const r = resource({
      kind: 'autoscaling_group',
      type: 'aws_autoscaling_group',
      attrs: {
        minSize: { kind: 'unresolved', reason: 'value "var.min" is a variable/expression, not statically resolvable from this repo' },
        maxSize: { kind: 'literal', value: 4 },
      },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
  })

  it('reports unresolved when ECS desired_count is a variable', () => {
    const r = resource({
      kind: 'ecs_service',
      type: 'aws_ecs_service',
      attrs: { desiredCount: { kind: 'unresolved', reason: 'value "var.desired" is a variable/expression, not statically resolvable from this repo' } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
  })
})

describe('ownInfrastructure — R6 CACHE_NO_FAILOVER', () => {
  it('flags a replication group with automatic_failover_enabled absent', () => {
    const r = resource({ kind: 'elasticache_replication_group', type: 'aws_elasticache_replication_group' })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['CACHE_NO_FAILOVER'])
  })

  it('flags automatic_failover_enabled explicitly false', () => {
    const r = resource({
      kind: 'elasticache_replication_group',
      type: 'aws_elasticache_replication_group',
      attrs: { automaticFailoverEnabled: { kind: 'literal', value: false } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings.map((f) => f.rule)).toEqual(['CACHE_NO_FAILOVER'])
  })

  it('does NOT flag automatic_failover_enabled true', () => {
    const r = resource({
      kind: 'elasticache_replication_group',
      type: 'aws_elasticache_replication_group',
      attrs: { automaticFailoverEnabled: { kind: 'literal', value: true } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
  })

  it('reports unresolved when automatic_failover_enabled is a variable', () => {
    const r = resource({
      kind: 'elasticache_replication_group',
      type: 'aws_elasticache_replication_group',
      attrs: { automaticFailoverEnabled: { kind: 'unresolved', reason: 'value "var.failover" is a variable/expression, not statically resolvable from this repo' } },
    })
    const result = evaluateOwnInfrastructure([r], [], [], 1)
    expect(result.findings).toEqual([])
    expect(result.unresolved).toHaveLength(1)
  })
})

describe('ownInfrastructure — every finding carries the required shape', () => {
  it('every finding has id/severity/pillar/resource/file/line/message/fixSnippet', () => {
    const r = resource({ kind: 'rds_instance' })
    const result = evaluateOwnInfrastructure([r], oneRegion, [], 1)
    for (const f of result.findings) {
      expect(f.rule).toBeTruthy()
      expect(['high', 'medium', 'low']).toContain(f.severity)
      expect(f.pillar).toBe('Reliability')
      expect(f.resource).toBeTruthy()
      expect(f.file).toBeTruthy()
      expect(f.line).toBeGreaterThan(0)
      expect(f.message.length).toBeGreaterThan(0)
      expect(f.fixSnippet.length).toBeGreaterThan(0)
    }
  })
})
