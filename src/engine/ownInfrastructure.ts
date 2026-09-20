// Pure rule engine for the "Your infrastructure" resilience linter — no I/O, no network, no
// GitHub/YAML/Terraform parsing. server/src/ownInfra*.ts turn real IaC source text into the
// ParsedResource[]/RegionEvidence[] shapes below; this file only reasons about already-parsed data,
// so it's testable with hand-built fixtures exactly like correlated.ts and the other engine modules.
//
// PRECISION FIRST: a resource whose relevant attribute is a variable, a module input, or anything
// else not a literal in this repo is `unresolved`, never a finding and never a pass. Only a literal
// value ever produces a finding.

import type { OwnInfraFinding, OwnInfraRegion, OwnInfraRuleId, OwnInfraUnresolved, OwnInfrastructure } from '../lib/types'

export type AttrValue = { kind: 'literal'; value: string | number | boolean } | { kind: 'unresolved'; reason: string }

export type OwnInfraResourceKind =
  | 'rds_instance'
  | 'rds_read_replica'
  | 'dynamodb_table'
  | 'autoscaling_group'
  | 'ecs_service'
  | 'ec2_instance'
  | 'elasticache_replication_group'
  | 'other'

export interface ParsedResource {
  kind: OwnInfraResourceKind
  /** Native type string, e.g. "aws_db_instance" or "AWS::RDS::DBInstance" — used in the resource label. */
  type: string
  name: string
  file: string
  line: number
  attrs: Record<string, AttrValue>
}

export interface RegionEvidence {
  region: string
  file: string
  line: number
  detail: string
}

export interface MultiRegionEvidence {
  file: string
  line: number
  detail: string
}

function label(r: ParsedResource): string {
  return `${r.type}.${r.name}`
}

function attr(r: ParsedResource, key: string): AttrValue | undefined {
  return r.attrs[key]
}

function pushUnresolvedIfNeeded(
  r: ParsedResource,
  key: string,
  unresolved: OwnInfraUnresolved[],
): Extract<AttrValue, { kind: 'literal' }> | null {
  const v = attr(r, key)
  if (!v) return null // attribute absent entirely — caller decides what "absent" means for its rule
  if (v.kind === 'unresolved') {
    unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
    return null
  }
  return v
}

// --- R1: SINGLE_REGION ---------------------------------------------------------------------

function ruleSingleRegion(regions: RegionEvidence[], multiRegionEvidence: MultiRegionEvidence[]): OwnInfraFinding[] {
  const distinctRegions = [...new Set(regions.map((r) => r.region))]
  if (distinctRegions.length !== 1) return [] // 0 = no evidence at all, can't claim; 2+ = not single-region
  if (multiRegionEvidence.length > 0) return [] // real multi-region redundancy evidence found elsewhere

  const first = regions[0]
  return [
    {
      rule: 'SINGLE_REGION',
      severity: 'medium',
      pillar: 'Reliability',
      resource: `provider region (${first.region})`,
      file: first.file,
      line: first.line,
      message: `Every resolvable AWS resource in this repo's IaC is declared in ${first.region}, with no multi-region redundancy evidence found (no replica/global table, cross-region replication, Route53 failover/latency routing, or Aurora global cluster) — often fine for a dev/staging environment, worth a second look for anything customer-facing.`,
      fixSnippet: `# Example: add a second provider alias for a DR region\nprovider "aws" {\n  alias  = "dr"\n  region = "us-west-2"\n}\n# ...then reference it on the resources that need to fail over: provider = aws.dr`,
    },
  ]
}

// --- R2: RDS_SINGLE_AZ ------------------------------------------------------------------------

function ruleRdsSingleAz(resources: ParsedResource[], unresolved: OwnInfraUnresolved[]): OwnInfraFinding[] {
  const findings: OwnInfraFinding[] = []
  for (const r of resources) {
    if (r.kind !== 'rds_instance') continue // read replicas are explicitly skipped by construction (see the Terraform/CFN parsers)
    const v = attr(r, 'multiAz')
    if (v && v.kind === 'unresolved') {
      unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
      continue
    }
    // Absent entirely (no `v`) is a real, resolvable "not multi-AZ" fact — Terraform/CFN both
    // default MultiAZ to false — so only an explicit `true` literal counts as multi-AZ.
    const isMultiAz = v?.kind === 'literal' && v.value === true
    if (isMultiAz) continue
    findings.push({
      rule: 'RDS_SINGLE_AZ',
      severity: 'high',
      pillar: 'Reliability',
      resource: label(r),
      file: r.file,
      line: r.line,
      message: `${label(r)} does not have Multi-AZ enabled — an AZ outage or routine maintenance takes this database down with no automatic standby (a common, sometimes deliberate, cost trade-off for dev/staging).`,
      fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  multi_az = true\n}`,
    })
  }
  return findings
}

// --- R3: DB_BACKUPS_DISABLED --------------------------------------------------------------------

function ruleDbBackupsDisabled(resources: ParsedResource[], unresolved: OwnInfraUnresolved[]): OwnInfraFinding[] {
  const findings: OwnInfraFinding[] = []
  for (const r of resources) {
    if (r.kind !== 'rds_instance' && r.kind !== 'rds_read_replica') continue
    const v = attr(r, 'backupRetentionPeriod')
    if (!v) continue // absent — RDS's real default is 1 day (7 for Aurora), NOT 0; only an EXPLICIT 0 is a finding
    if (v.kind === 'unresolved') {
      unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
      continue
    }
    if (v.value !== 0) continue
    findings.push({
      rule: 'DB_BACKUPS_DISABLED',
      severity: 'high',
      pillar: 'Reliability',
      resource: label(r),
      file: r.file,
      line: r.line,
      message: `${label(r)} explicitly sets its backup retention period to 0 — automated backups (and point-in-time recovery) are off, so a bad deploy or accidental delete is unrecoverable (sometimes intentional for an ephemeral/throwaway environment).`,
      fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  backup_retention_period = 7\n}`,
    })
  }
  return findings
}

// --- R4: DDB_NO_PITR -----------------------------------------------------------------------

function ruleDdbNoPitr(resources: ParsedResource[], unresolved: OwnInfraUnresolved[]): OwnInfraFinding[] {
  const findings: OwnInfraFinding[] = []
  for (const r of resources) {
    if (r.kind !== 'dynamodb_table') continue
    const v = attr(r, 'pointInTimeRecoveryEnabled')
    if (v && v.kind === 'unresolved') {
      unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
      continue
    }
    const enabled = v && v.kind === 'literal' && v.value === true
    if (enabled) continue
    // Absent = disabled, per this task's explicit spec — DynamoDB's real default is PITR off.
    findings.push({
      rule: 'DDB_NO_PITR',
      severity: 'medium',
      pillar: 'Reliability',
      resource: label(r),
      file: r.file,
      line: r.line,
      message: `${label(r)} does not have point-in-time recovery enabled — there's no way to restore to a specific moment after an accidental write or delete (a reasonable trade-off for a table that's easily rebuilt, e.g. a cache table).`,
      fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  point_in_time_recovery {\n    enabled = true\n  }\n}`,
    })
  }
  return findings
}

// --- R5: SINGLE_INSTANCE ---------------------------------------------------------------------

function ruleSingleInstance(resources: ParsedResource[], unresolved: OwnInfraUnresolved[]): OwnInfraFinding[] {
  const findings: OwnInfraFinding[] = []
  for (const r of resources) {
    if (r.kind === 'autoscaling_group') {
      const min = pushUnresolvedIfNeeded(r, 'minSize', unresolved)
      const max = pushUnresolvedIfNeeded(r, 'maxSize', unresolved)
      if (min === null || max === null) continue
      if (min.value === 1 && max.value === 1) {
        findings.push({
          rule: 'SINGLE_INSTANCE',
          severity: 'high',
          pillar: 'Reliability',
          resource: label(r),
          file: r.file,
          line: r.line,
          message: `${label(r)} is pinned to exactly 1 instance (min=max=1) — there's no redundant instance to take over if it fails or during a deploy (a common, often deliberate, choice for a low-traffic dev/staging service).`,
          fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  min_size = 2\n  max_size = 4\n}`,
        })
      }
      continue
    }
    if (r.kind === 'ecs_service') {
      const v = attr(r, 'desiredCount')
      if (v && v.kind === 'unresolved') {
        unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
        continue
      }
      // Absent = the real AWS default (1) for both aws_ecs_service and AWS::ECS::Service — a
      // resolvable fact, not something to skip past.
      const desiredValue = v?.kind === 'literal' ? v.value : 1
      if (desiredValue === 1) {
        findings.push({
          rule: 'SINGLE_INSTANCE',
          severity: 'high',
          pillar: 'Reliability',
          resource: label(r),
          file: r.file,
          line: r.line,
          message: `${label(r)} runs a single task (desired count 1) — a task crash or AZ blip takes the service down with nothing else serving traffic (a common, often deliberate, choice for a low-traffic dev/staging service).`,
          fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  desired_count = 2\n}`,
        })
      }
      continue
    }
    if (r.kind === 'ec2_instance') {
      findings.push({
        rule: 'SINGLE_INSTANCE',
        severity: 'medium',
        pillar: 'Reliability',
        resource: label(r),
        file: r.file,
        line: r.line,
        message: `${label(r)} is a standalone EC2 instance, not behind an Auto Scaling group or load balancer — if it fails, whatever it serves is down until someone replaces it by hand (fine for a one-off batch/admin box, less so for anything user-facing).`,
        fixSnippet: `# Wrap it in an Auto Scaling group instead of a bare aws_instance:\nresource "aws_autoscaling_group" "this" {\n  min_size = 2\n  max_size = 4\n  # launch_template / desired_capacity ...\n}`,
      })
    }
  }
  return findings
}

// --- R6: CACHE_NO_FAILOVER -------------------------------------------------------------------

function ruleCacheNoFailover(resources: ParsedResource[], unresolved: OwnInfraUnresolved[]): OwnInfraFinding[] {
  const findings: OwnInfraFinding[] = []
  for (const r of resources) {
    if (r.kind !== 'elasticache_replication_group') continue
    const v = attr(r, 'automaticFailoverEnabled')
    if (v && v.kind === 'unresolved') {
      unresolved.push({ resource: label(r), file: r.file, line: r.line, reason: v.reason })
      continue
    }
    const enabled = v && v.kind === 'literal' && v.value === true
    if (enabled) continue
    findings.push({
      rule: 'CACHE_NO_FAILOVER',
      severity: 'medium',
      pillar: 'Reliability',
      resource: label(r),
      file: r.file,
      line: r.line,
      message: `${label(r)} does not have automatic failover enabled — a primary-node failure requires manual intervention to restore cache availability (a reasonable trade-off for a single-node dev cache).`,
      fixSnippet: `resource "${r.type}" "${r.name}" {\n  # ...\n  automatic_failover_enabled = true\n  num_cache_clusters         = 2\n}`,
    })
  }
  return findings
}

/** Builds the {region -> resourceCount, evidence} rollup from raw region evidence entries —
 * resourceCount is the count of resolvable AWS resources found in the SAME FILE as each region
 * declaration (a file-scoped proxy, not a claim of exact per-resource provider-alias resolution,
 * which multi-provider-alias Terraform makes genuinely ambiguous to resolve statically). */
function buildRegions(regionEvidence: RegionEvidence[], resources: ParsedResource[]): OwnInfraRegion[] {
  const byRegion = new Map<string, RegionEvidence[]>()
  for (const e of regionEvidence) {
    byRegion.set(e.region, [...(byRegion.get(e.region) ?? []), e])
  }
  const resourceCountByFile = new Map<string, number>()
  for (const r of resources) {
    resourceCountByFile.set(r.file, (resourceCountByFile.get(r.file) ?? 0) + 1)
  }

  return [...byRegion.entries()]
    .map(([region, entries]) => {
      const files = new Set(entries.map((e) => e.file))
      const resourceCount = [...files].reduce((sum, f) => sum + (resourceCountByFile.get(f) ?? 0), 0)
      return {
        region,
        resourceCount,
        evidence: entries.map((e) => `${e.file}:${e.line}`),
      }
    })
    .sort((a, b) => b.resourceCount - a.resourceCount || a.region.localeCompare(b.region))
}

export function evaluateOwnInfrastructure(
  resources: ParsedResource[],
  regionEvidence: RegionEvidence[],
  multiRegionEvidence: MultiRegionEvidence[],
  filesScanned: number,
): OwnInfrastructure {
  const unresolved: OwnInfraUnresolved[] = []
  const findings: OwnInfraFinding[] = [
    ...ruleSingleRegion(regionEvidence, multiRegionEvidence),
    ...ruleRdsSingleAz(resources, unresolved),
    ...ruleDbBackupsDisabled(resources, unresolved),
    ...ruleDdbNoPitr(resources, unresolved),
    ...ruleSingleInstance(resources, unresolved),
    ...ruleCacheNoFailover(resources, unresolved),
  ]

  return {
    regions: buildRegions(regionEvidence, resources),
    findings,
    unresolved,
    filesScanned,
  }
}

export const OWN_INFRA_RULE_IDS: OwnInfraRuleId[] = [
  'SINGLE_REGION',
  'RDS_SINGLE_AZ',
  'DB_BACKUPS_DISABLED',
  'DDB_NO_PITR',
  'SINGLE_INSTANCE',
  'CACHE_NO_FAILOVER',
]
