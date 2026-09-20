import { describe, expect, it } from 'vitest'
import { parseTerraformForOwnInfra, parseTfvars } from '../src/ownInfraTerraform'

describe('parseTerraformForOwnInfra — resource extraction', () => {
  it('extracts an RDS primary instance with literal attrs and its line number', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  engine                  = "postgres"
  multi_az                = false
  backup_retention_period = 0
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources).toHaveLength(1)
    const r = resources[0]
    expect(r.kind).toBe('rds_instance')
    expect(r.type).toBe('aws_db_instance')
    expect(r.name).toBe('primary')
    expect(r.line).toBe(2)
    expect(r.attrs.multiAz).toEqual({ kind: 'literal', value: false })
    expect(r.attrs.backupRetentionPeriod).toEqual({ kind: 'literal', value: 0 })
  })

  it('classifies a replica (replicate_source_db present) as rds_read_replica, not rds_instance', () => {
    const tf = `
resource "aws_db_instance" "replica" {
  replicate_source_db = aws_db_instance.primary.id
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources[0].kind).toBe('rds_read_replica')
  })

  it('reads the nested point_in_time_recovery block for a DynamoDB table', () => {
    const tf = `
resource "aws_dynamodb_table" "cache" {
  name = "cache"
  point_in_time_recovery {
    enabled = true
  }
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources[0].kind).toBe('dynamodb_table')
    expect(resources[0].attrs.pointInTimeRecoveryEnabled).toEqual({ kind: 'literal', value: true })
  })

  it('extracts autoscaling group min/max, ecs desired_count, and elasticache failover', () => {
    const tf = `
resource "aws_autoscaling_group" "web" {
  min_size = 1
  max_size = 1
}

resource "aws_ecs_service" "api" {
  desired_count = 2
}

resource "aws_elasticache_replication_group" "cache" {
  automatic_failover_enabled = false
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    const asg = resources.find((r) => r.kind === 'autoscaling_group')!
    const ecs = resources.find((r) => r.kind === 'ecs_service')!
    const cache = resources.find((r) => r.kind === 'elasticache_replication_group')!
    expect(asg.attrs.minSize).toEqual({ kind: 'literal', value: 1 })
    expect(asg.attrs.maxSize).toEqual({ kind: 'literal', value: 1 })
    expect(ecs.attrs.desiredCount).toEqual({ kind: 'literal', value: 2 })
    expect(cache.attrs.automaticFailoverEnabled).toEqual({ kind: 'literal', value: false })
  })

  it('ignores a non-AWS provider resource entirely', () => {
    const tf = `
resource "google_sql_database_instance" "primary" {
  region = "us-central1"
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources).toEqual([])
  })
})

describe('parseTerraformForOwnInfra — precision: fake attribute text never matches', () => {
  it('does not read a fake multi_az from a line comment', () => {
    const tf = `
# multi_az = true
resource "aws_db_instance" "primary" {
  multi_az = false
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources[0].attrs.multiAz).toEqual({ kind: 'literal', value: false })
  })

  it('does not read a fake multi_az from inside a string value', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  description = "multi_az = true, backup_retention_period = 7"
  multi_az    = false
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources[0].attrs.multiAz).toEqual({ kind: 'literal', value: false })
    expect(resources[0].attrs.backupRetentionPeriod).toBeUndefined()
  })

  it('does not read a fake resource block header written inside a block comment', () => {
    const tf = `
/*
resource "aws_db_instance" "fake" {
  multi_az = true
}
*/
resource "aws_db_instance" "real" {
  multi_az = false
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources).toHaveLength(1)
    expect(resources[0].name).toBe('real')
  })

  it('still reads the resource header when the description string contains braces', () => {
    const tf = `
resource "aws_db_instance" "primary" {
  description = "a { fake } brace pair"
  multi_az    = true
}
`
    const { resources } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(resources).toHaveLength(1)
    expect(resources[0].attrs.multiAz).toEqual({ kind: 'literal', value: true })
  })
})

describe('parseTerraformForOwnInfra — unresolved variables', () => {
  it('marks an unqualified variable reference as unresolved with a reason, resolvable via tfvars', () => {
    const tf = `
resource "aws_ecs_service" "api" {
  desired_count = var.desired
}
`
    const unresolved = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(unresolved.resources[0].attrs.desiredCount.kind).toBe('unresolved')

    const resolved = parseTerraformForOwnInfra('main.tf', tf, { desired: { kind: 'literal', value: 3 } })
    expect(resolved.resources[0].attrs.desiredCount).toEqual({ kind: 'literal', value: 3 })
  })
})

describe('parseTfvars', () => {
  it('parses key = value pairs, ignoring comments and blanking string contents safely', () => {
    const tfvars = `
# comment: desired = 99
desired = 3
name    = "prod # not a comment"
`
    const parsed = parseTfvars(tfvars)
    expect(parsed.desired).toEqual({ kind: 'literal', value: 3 })
    expect(parsed.name).toEqual({ kind: 'literal', value: 'prod # not a comment' })
  })
})

describe('parseTerraformForOwnInfra — region + multi-region evidence', () => {
  it('extracts a provider region as region evidence', () => {
    const tf = `
provider "aws" {
  region = "us-east-1"
}
`
    const { regionEvidence } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(regionEvidence).toEqual([{ region: 'us-east-1', file: 'main.tf', line: 2, detail: 'provider "aws" region' }])
  })

  it('flags a provider alias as multi-region evidence', () => {
    const tf = `
provider "aws" {
  alias  = "dr"
  region = "us-west-2"
}
`
    const { multiRegionEvidence } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(multiRegionEvidence.length).toBeGreaterThan(0)
  })

  it('recognizes a DynamoDB replica block as multi-region evidence (Global Tables)', () => {
    const tf = `
resource "aws_dynamodb_table" "cache" {
  name = "cache"
  replica {
    region_name = "us-west-2"
  }
}
`
    const { multiRegionEvidence } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(multiRegionEvidence.some((e) => e.detail.includes('replica'))).toBe(true)
  })

  it('a realistic multi-region example produces evidence that must suppress R1 upstream', () => {
    const tf = `
provider "aws" {
  region = "us-east-1"
}

resource "aws_dynamodb_table" "global" {
  name = "global"
  replica {
    region_name = "us-west-2"
  }
}
`
    const { regionEvidence, multiRegionEvidence } = parseTerraformForOwnInfra('main.tf', tf, {})
    expect(regionEvidence).toHaveLength(1) // still only ONE provider region declared...
    expect(multiRegionEvidence.length).toBeGreaterThan(0) // ...but real redundancy evidence exists
  })
})
