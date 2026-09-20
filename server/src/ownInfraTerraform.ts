import type { AttrValue, MultiRegionEvidence, OwnInfraResourceKind, ParsedResource, RegionEvidence } from '../../src/engine/ownInfrastructure'

// Regex + brace matching that ignores comments and strings, per this task's explicit spec — not a
// real HCL parser. `neutralize()` blanks out (to spaces, preserving line breaks and offsets) every
// # / // line comment and /* */ block comment, optionally ALSO the CONTENTS of "..." string
// literals, so a fake attribute name written inside a comment or a string (e.g.
// description = "multi_az = true") can never match the attribute-name regexes below — only real
// code does. Two variants are produced from the same source, sharing identical offsets/length:
//   - `blankStrings: false` — comments only blanked. Used to find `resource "TYPE" "NAME" {` and
//     `provider "aws" {` headers, which legitimately need their own quoted strings intact.
//   - `blankStrings: true` — comments AND string contents blanked. Used for brace-matching (a
//     brace inside a string value must never miscount block nesting) and for attribute-name
//     scanning inside a block's body (a string VALUE containing fake attribute-shaped text must
//     never match).
// Once a real attribute assignment position is confirmed, its VALUE is read back from the ORIGINAL
// text at that same offset, so a genuine quoted string value like region = "us-east-1" is still
// read correctly even though the strings-blanked view can't show it.

function neutralize(source: string, blankStrings: boolean): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const c2 = source[i + 1]
    if (c === '#' || (c === '/' && c2 === '/')) {
      while (i < n && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && c2 === '*') {
      out += '  '
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    if (c === '"') {
      if (!blankStrings) {
        // Keep the string verbatim (including its quotes) — only comments are neutralized here.
        out += c
        i++
        while (i < n && source[i] !== '"') {
          if (source[i] === '\\' && i + 1 < n) {
            out += source[i] + source[i + 1]
            i += 2
            continue
          }
          out += source[i]
          i++
        }
        if (i < n) {
          out += source[i]
          i++
        }
        continue
      }
      out += ' '
      i++
      while (i < n && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < n) {
          out += source[i] === '\n' ? '\n' : ' '
          out += source[i + 1] === '\n' ? '\n' : ' '
          i += 2
          continue
        }
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += ' '
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

function lineOf(source: string, offset: number): number {
  let line = 1
  const end = Math.min(offset, source.length)
  for (let i = 0; i < end; i++) if (source[i] === '\n') line++
  return line
}

/** Brace-matches from `openIndex` (the `{` itself) to its closer, using the neutralized text so a
 * brace inside a string/comment never miscounts nesting. Offsets are shared with the original text.
 * Exported for the fix generator (server/src/ownInfraPatches.ts) to locate NESTED blocks (e.g.
 * DynamoDB's `point_in_time_recovery { ... }`) inside an already-located resource block. */
export function findMatchingBrace(neutralized: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < neutralized.length; i++) {
    if (neutralized[i] === '{') depth++
    else if (neutralized[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return neutralized.length - 1
}

/** Reads the value immediately after a confirmed `key =` match, from the ORIGINAL text at the
 * given offset (right after the `=`). A quoted string containing `${...}` interpolation, or any
 * bare (unquoted, non-boolean, non-numeric) token, is `unresolved` — a variable/expression, not a
 * literal this repo can be judged on. */
function readValueAt(original: string, offsetAfterEquals: number): AttrValue {
  const rest = original.slice(offsetAfterEquals)
  const trimmed = rest.match(/^\s*/)?.[0].length ?? 0
  const at = rest.slice(trimmed)

  const stringMatch = at.match(/^"((?:[^"\\]|\\.)*)"/)
  if (stringMatch) {
    const value = stringMatch[1]
    if (value.includes('${')) return { kind: 'unresolved', reason: 'value is an interpolated expression, not a static literal' }
    return { kind: 'literal', value }
  }
  const boolMatch = at.match(/^(true|false)\b/)
  if (boolMatch) return { kind: 'literal', value: boolMatch[1] === 'true' }
  const numMatch = at.match(/^-?\d+(\.\d+)?\b/)
  if (numMatch) return { kind: 'literal', value: Number(numMatch[0]) }

  const exprMatch = at.match(/^[a-zA-Z0-9_.[\]]+/)
  const expr = exprMatch?.[0] ?? (at.slice(0, 40).trim() || '(empty)')
  return { kind: 'unresolved', reason: `value "${expr}" is a variable/expression, not statically resolvable from this repo` }
}

/** Finds `key\s*=` in the neutralized block text and reads its value from the original text at the
 * same offset. Returns undefined (attribute genuinely absent) if no real (non-comment/string)
 * assignment is found anywhere in the block. */
function readAttr(neutralizedBlock: string, originalBlock: string, key: string): AttrValue | undefined {
  const re = new RegExp(`\\b${key}\\s*=`, '')
  const match = re.exec(neutralizedBlock)
  if (!match) return undefined
  return readValueAt(originalBlock, match.index + match[0].length)
}

function classifyResourceKind(type: string, neutralizedBlock: string): OwnInfraResourceKind {
  if (type === 'aws_db_instance') {
    // Read replicas are explicitly skipped by R2/R3 — `replicate_source_db` present at all
    // (even as an unresolved reference) is enough to know this is a replica, not a primary.
    return /\breplicate_source_db\s*=/.test(neutralizedBlock) ? 'rds_read_replica' : 'rds_instance'
  }
  if (type === 'aws_dynamodb_table') return 'dynamodb_table'
  if (type === 'aws_autoscaling_group') return 'autoscaling_group'
  if (type === 'aws_ecs_service') return 'ecs_service'
  if (type === 'aws_instance') return 'ec2_instance'
  if (type === 'aws_elasticache_replication_group') return 'elasticache_replication_group'
  return 'other'
}

const RESOURCE_BLOCK = /resource\s+"([a-zA-Z0-9_]+)"\s+"([a-zA-Z0-9_-]+)"\s*\{/g
const PROVIDER_AWS_BLOCK = /provider\s+"aws"\s*\{/g

/** `.tfvars` files supply DEFAULT literal values for `var.NAME` references — the only kind of
 * cross-file resolution this linter does, and only within the same repo (never a remote/registry
 * value). Very small parser: `key = value` / `key = "value"` lines, ignoring comments/strings via
 * the same neutralize() pass. */
export function parseTfvars(source: string): Record<string, AttrValue> {
  const neutralized = neutralize(source, true)
  const out: Record<string, AttrValue> = {}
  const re = /^\s*([a-zA-Z0-9_-]+)\s*=/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(neutralized))) {
    out[match[1]] = readValueAt(source, match.index + match[0].length)
  }
  return out
}

function resolveVarReference(value: AttrValue, tfvars: Record<string, AttrValue>): AttrValue {
  if (value.kind !== 'unresolved') return value
  const varMatch = /^value "var\.([a-zA-Z0-9_-]+)"/.exec(value.reason)
  if (!varMatch) return value
  const fromTfvars = tfvars[varMatch[1]]
  return fromTfvars ?? value
}

const MULTI_REGION_PATTERNS: Array<{ re: RegExp; detail: string }> = [
  { re: /\breplica\s*\{/, detail: 'DynamoDB replica block (multi-region table)' },
  { re: /resource\s+"aws_rds_global_cluster"/, detail: 'Aurora global cluster' },
  { re: /\bfailover_routing_policy\s*\{/, detail: 'Route53 failover routing policy' },
  { re: /\blatency_routing_policy\s*\{/, detail: 'Route53 latency-based routing policy' },
  { re: /resource\s+"aws_s3_bucket_replication_configuration"/, detail: 'S3 cross-region replication configuration' },
]

export interface TerraformParseResult {
  resources: ParsedResource[]
  regionEvidence: RegionEvidence[]
  multiRegionEvidence: MultiRegionEvidence[]
}

/** Parses one `.tf` file's resource blocks + AWS provider region(s), resolving `var.X` references
 * against any `.tfvars` defaults supplied. */
export function parseTerraformForOwnInfra(
  path: string,
  source: string,
  tfvars: Record<string, AttrValue>,
): TerraformParseResult {
  // Header-preserving view: finds `resource "TYPE" "NAME" {` / `provider "aws" {`, which need their
  // own real quotes intact to match. Strings-blanked view: brace-matching and attribute scanning
  // within an already-located block's body, where a fake attribute-shaped string value must never match.
  const headerNeutralized = neutralize(source, false)
  const bodyNeutralized = neutralize(source, true)
  const resources: ParsedResource[] = []
  const regionEvidence: RegionEvidence[] = []
  const multiRegionEvidence: MultiRegionEvidence[] = []

  RESOURCE_BLOCK.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RESOURCE_BLOCK.exec(headerNeutralized))) {
    const [full, type, name] = match
    if (!type.startsWith('aws_')) continue // non-AWS providers never count toward "AWS resources"
    const openIndex = match.index + full.length - 1
    const closeIndex = findMatchingBrace(bodyNeutralized, openIndex)
    const neutralizedBlock = bodyNeutralized.slice(openIndex, closeIndex + 1)
    const originalBlock = source.slice(openIndex, closeIndex + 1)
    const line = lineOf(source, match.index)

    const kind = classifyResourceKind(type, neutralizedBlock)
    const attrs: Record<string, AttrValue> = {}
    const attrKeys: Record<OwnInfraResourceKind, string[]> = {
      rds_instance: ['multiAz', 'backupRetentionPeriod'],
      rds_read_replica: ['backupRetentionPeriod'],
      dynamodb_table: ['pointInTimeRecoveryEnabled'],
      autoscaling_group: ['minSize', 'maxSize'],
      ecs_service: ['desiredCount'],
      ec2_instance: [],
      // numCacheClusters/replicasPerNodeGroup aren't read by any R1-R6 rule — the fix generator
      // (server/src/ownInfraPatches.ts) uses them to gate the R6 patch on real static evidence of a
      // replica (failover has nothing to fail over to otherwise).
      elasticache_replication_group: ['automaticFailoverEnabled', 'numCacheClusters', 'replicasPerNodeGroup'],
      other: [],
    }
    const nativeAttrName: Record<string, string> = {
      multiAz: 'multi_az',
      backupRetentionPeriod: 'backup_retention_period',
      minSize: 'min_size',
      maxSize: 'max_size',
      desiredCount: 'desired_count',
      automaticFailoverEnabled: 'automatic_failover_enabled',
      numCacheClusters: 'num_cache_clusters',
      replicasPerNodeGroup: 'replicas_per_node_group',
    }
    for (const canonicalKey of attrKeys[kind]) {
      const raw = readAttr(neutralizedBlock, originalBlock, nativeAttrName[canonicalKey])
      if (raw !== undefined) attrs[canonicalKey] = resolveVarReference(raw, tfvars)
    }
    // DynamoDB PITR is a nested block: point_in_time_recovery { enabled = true }
    if (kind === 'dynamodb_table') {
      const blockMatch = /\bpoint_in_time_recovery\s*\{/.exec(neutralizedBlock)
      if (blockMatch) {
        const nestedOpen = blockMatch.index + blockMatch[0].length - 1
        const nestedClose = findMatchingBrace(neutralizedBlock, nestedOpen)
        const nestedNeutralized = neutralizedBlock.slice(nestedOpen, nestedClose + 1)
        const nestedOriginal = originalBlock.slice(nestedOpen, nestedClose + 1)
        const raw = readAttr(nestedNeutralized, nestedOriginal, 'enabled')
        if (raw !== undefined) attrs.pointInTimeRecoveryEnabled = resolveVarReference(raw, tfvars)
      }
    }

    resources.push({ kind, type, name, file: path, line, attrs })
  }

  PROVIDER_AWS_BLOCK.lastIndex = 0
  while ((match = PROVIDER_AWS_BLOCK.exec(headerNeutralized))) {
    const openIndex = match.index + match[0].length - 1
    const closeIndex = findMatchingBrace(bodyNeutralized, openIndex)
    const neutralizedBlock = bodyNeutralized.slice(openIndex, closeIndex + 1)
    const originalBlock = source.slice(openIndex, closeIndex + 1)
    const region = readAttr(neutralizedBlock, originalBlock, 'region')
    if (region && region.kind === 'literal' && typeof region.value === 'string') {
      regionEvidence.push({ region: region.value, file: path, line: lineOf(source, match.index), detail: 'provider "aws" region' })
    }
    if (/\balias\s*=/.test(neutralizedBlock)) {
      multiRegionEvidence.push({ file: path, line: lineOf(source, match.index), detail: 'provider "aws" alias (multiple provider configurations)' })
    }
  }

  for (const { re, detail } of MULTI_REGION_PATTERNS) {
    const m = re.exec(bodyNeutralized)
    if (m) multiRegionEvidence.push({ file: path, line: lineOf(source, m.index), detail })
  }

  return { resources, regionEvidence, multiRegionEvidence }
}

export interface ResourceBlockLocation {
  /** Offset of the `resource` keyword itself. */
  headerStart: number
  /** Offset of the block's opening `{`. */
  openIndex: number
  /** Offset of the matching closing `}`. */
  closeIndex: number
  /** 1-indexed line of the `resource` keyword — matches the `line` a ParsedResource carries. */
  line: number
  /** ORIGINAL text of the block (quotes/comments intact) — the only thing a patch may edit. */
  originalBlock: string
  /** Same span with comments AND string contents (including their quote characters) blanked to
   * spaces — safe for attribute-NAME scans (e.g. `count =`, `for_each =`) without ever matching
   * fake text inside a string value. NOT safe for matching syntax that requires a real quoted
   * string, like `dynamic "block_name" {` — use `commentsBlankedBlock` for that. */
  neutralizedBlock: string
  /** Same span with only comments blanked — real string literals (including their quotes) are
   * intact. Safe for detecting `dynamic "..." {` headers without a comment falsely triggering it. */
  commentsBlankedBlock: string
}

/** Re-locates a resource block's exact text span by (type, name) — used by the fix generator
 * (server/src/ownInfraPatches.ts) to make a surgical, brace-matched text edit without re-parsing
 * and re-serializing the file (which would destroy comments and any preserved syntax). */
export function locateResourceBlock(source: string, type: string, name: string): ResourceBlockLocation | null {
  const headerNeutralized = neutralize(source, false)
  const bodyNeutralized = neutralize(source, true)
  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`resource\\s+"${escapedType}"\\s+"${escapedName}"\\s*\\{`)
  const match = re.exec(headerNeutralized)
  if (!match) return null
  const openIndex = match.index + match[0].length - 1
  const closeIndex = findMatchingBrace(bodyNeutralized, openIndex)
  return {
    headerStart: match.index,
    openIndex,
    closeIndex,
    line: lineOf(source, match.index),
    originalBlock: source.slice(openIndex, closeIndex + 1),
    neutralizedBlock: bodyNeutralized.slice(openIndex, closeIndex + 1),
    commentsBlankedBlock: headerNeutralized.slice(openIndex, closeIndex + 1),
  }
}

/** Locates `key\s*=` inside a block and returns the VALUE token's exact span in the block's
 * ORIGINAL text (offsets relative to the block, i.e. `originalBlock`/`neutralizedBlock` above) —
 * the minimal span a patch may overwrite, so an inline comment or trailing content on the same
 * line survives untouched. Mirrors `readValueAt`'s literal/bool/number/expression matching. */
export function locateAttrValueSpan(neutralizedBlock: string, originalBlock: string, key: string): { start: number; end: number } | null {
  const re = new RegExp(`\\b${key}\\s*=`, '')
  const match = re.exec(neutralizedBlock)
  if (!match) return null
  const start = match.index + match[0].length
  const rest = originalBlock.slice(start)
  const leadingWs = rest.match(/^\s*/)?.[0].length ?? 0
  const at = rest.slice(leadingWs)
  const valueMatch =
    at.match(/^"(?:[^"\\]|\\.)*"/) ?? at.match(/^(true|false)\b/) ?? at.match(/^-?\d+(\.\d+)?\b/) ?? at.match(/^[a-zA-Z0-9_.[\]]+/)
  if (!valueMatch) return null
  return { start: start + leadingWs, end: start + leadingWs + valueMatch[0].length }
}
