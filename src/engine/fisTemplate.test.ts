import { describe, expect, it } from 'vitest'
import verifiedFileJson from '../../data/fis-actions.verified.json'
import {
  DEFAULT_DURATION,
  findVerifiedAction,
  generateFisTemplate,
  MANDATORY_TARGET_TAG_KEY,
  MANDATORY_TARGET_TAG_VALUE,
  MAX_DURATION,
  MAX_SMALL_PERCENT,
  parseIso8601DurationSeconds,
  validateFisTemplateInvariants,
  type FisTemplateInput,
  type FisTemplateOutput,
  type VerifiedFisAction,
  type VerifiedFisActionsFile,
} from './fisTemplate'

const verifiedFile = verifiedFileJson as unknown as VerifiedFisActionsFile
const draftActions = verifiedFile.actions

function baseInput(overrides: Partial<FisTemplateInput> = {}): FisTemplateInput {
  return {
    hypothesis: 'Does the app stay up when this instance stops?',
    actionId: 'aws:ec2:stop-instances',
    targetTags: { service: 'checkout' },
    region: 'us-east-1',
    ...overrides,
  }
}

function generate(overrides: Partial<FisTemplateInput> = {}): FisTemplateOutput {
  const result = generateFisTemplate(baseInput(overrides), draftActions, { allowUnverifiedDraft: true })
  if (result.skipped) throw new Error(`expected a template, got skipped: ${result.reason}`)
  return result
}

describe('data/fis-actions.verified.json — the file this task requires', () => {
  it('is honestly labeled as a draft, not fabricated as verified', () => {
    expect(verifiedFile.fileVerified).toBe(false)
    for (const action of draftActions) expect(action.verified).toBe(false)
  })

  it('covers all 6 candidate actions named in the task', () => {
    const ids = draftActions.map((a) => a.id).sort()
    expect(ids).toEqual(
      [
        'aws:ebs:pause-volume-io',
        'aws:ec2:stop-instances',
        'aws:ecs:stop-task',
        'aws:network:disrupt-connectivity',
        'aws:rds:failover-db-cluster',
        'aws:rds:reboot-db-instances',
      ].sort(),
    )
  })
})

describe('findVerifiedAction', () => {
  it('refuses an unverified draft action by default', () => {
    expect(findVerifiedAction(draftActions, 'aws:ec2:stop-instances')).toBeNull()
  })

  it('allows it only with allowUnverifiedDraft: true', () => {
    expect(findVerifiedAction(draftActions, 'aws:ec2:stop-instances', { allowUnverifiedDraft: true })?.id).toBe('aws:ec2:stop-instances')
  })

  it('returns null for an unknown action id regardless of the flag', () => {
    expect(findVerifiedAction(draftActions, 'aws:made-up:action', { allowUnverifiedDraft: true })).toBeNull()
  })
})

describe('generateFisTemplate — gating on the verified file', () => {
  it('refuses to generate for an action not in the verified file at all', () => {
    const result = generateFisTemplate(baseInput({ actionId: 'aws:made-up:action' }), draftActions, { allowUnverifiedDraft: true })
    expect(result.skipped).toBe(true)
  })

  it('refuses an unverified draft action unless explicitly allowed', () => {
    const result = generateFisTemplate(baseInput(), draftActions)
    expect(result.skipped).toBe(true)
    if (result.skipped) expect(result.reason).toMatch(/draft/i)
  })

  it('empty target resolution = skip: refuses when no target tags are supplied', () => {
    const result = generateFisTemplate(baseInput({ targetTags: {} }), draftActions, { allowUnverifiedDraft: true })
    expect(result.skipped).toBe(true)
  })
})

describe('generateFisTemplate — every action in the verified file satisfies the safety invariants', () => {
  it.each(draftActions)('$id produces an invariant-clean template', (action: VerifiedFisAction) => {
    const output = generate({ actionId: action.id })
    const errors = validateFisTemplateInvariants(output.cliInputJson, [action.id])
    expect(errors).toEqual([])
  })
})

describe('generateFisTemplate — individual invariants', () => {
  it('mandatory stopConditions: a CloudWatch alarm ARN placeholder is always present', () => {
    const output = generate()
    const sc = (output.cliInputJson.stopConditions as Array<{ source: string; value: string }>)[0]
    expect(sc.source).toBe('aws:cloudwatch:alarm')
    expect(sc.value).toMatch(/^arn:aws:cloudwatch:/)
    expect(output.cloudFormationYaml).toContain('AWS::CloudWatch::Alarm') // the sample alarm
  })

  it('targets are tag-scoped, always carrying the mandatory blast-radius-experiment=true tag', () => {
    const output = generate({ targetTags: { service: 'checkout', env: 'staging' } })
    const target = Object.values(output.cliInputJson.targets as Record<string, { resourceTags: Record<string, string> }>)[0]
    expect(target.resourceTags).toEqual({ service: 'checkout', env: 'staging', [MANDATORY_TARGET_TAG_KEY]: MANDATORY_TARGET_TAG_VALUE })
  })

  it('the mandatory tag cannot be overridden by caller input', () => {
    const output = generate({ targetTags: { [MANDATORY_TARGET_TAG_KEY]: 'false' } })
    const target = Object.values(output.cliInputJson.targets as Record<string, { resourceTags: Record<string, string> }>)[0]
    expect(target.resourceTags[MANDATORY_TARGET_TAG_KEY]).toBe(MANDATORY_TARGET_TAG_VALUE)
  })

  it('defaults to COUNT(1)', () => {
    const output = generate()
    const target = Object.values(output.cliInputJson.targets as Record<string, { selectionMode: string }>)[0]
    expect(target.selectionMode).toBe('COUNT(1)')
  })

  it('COUNT is always exactly 1, never a larger count', () => {
    const output = generate({ selection: { mode: 'count', value: 5 } })
    const target = Object.values(output.cliInputJson.targets as Record<string, { selectionMode: string }>)[0]
    expect(target.selectionMode).toBe('COUNT(1)')
    expect(output.warnings.some((w) => w.includes('COUNT(1)'))).toBe(true)
  })

  it('accepts a small PERCENT', () => {
    const output = generate({ selection: { mode: 'percent', value: 10 } })
    const target = Object.values(output.cliInputJson.targets as Record<string, { selectionMode: string }>)[0]
    expect(target.selectionMode).toBe('PERCENT(10)')
  })

  it(`clamps a too-large PERCENT down to the max small percent (${MAX_SMALL_PERCENT})`, () => {
    const output = generate({ selection: { mode: 'percent', value: 90 } })
    const target = Object.values(output.cliInputJson.targets as Record<string, { selectionMode: string }>)[0]
    expect(target.selectionMode).toBe(`PERCENT(${MAX_SMALL_PERCENT})`)
    expect(output.warnings.some((w) => w.includes('clamped'))).toBe(true)
  })

  it(`defaults duration to ${DEFAULT_DURATION} for an action that takes one`, () => {
    const output = generate({ actionId: 'aws:ebs:pause-volume-io' })
    const action = Object.values(output.cliInputJson.actions as Record<string, { parameters: Record<string, string> }>)[0]
    expect(action.parameters.duration).toBe(DEFAULT_DURATION)
  })

  it(`never exceeds ${MAX_DURATION}, clamping and warning instead`, () => {
    const output = generate({ actionId: 'aws:ebs:pause-volume-io', duration: 'PT1H' })
    const action = Object.values(output.cliInputJson.actions as Record<string, { parameters: Record<string, string> }>)[0]
    expect(action.parameters.duration).toBe(MAX_DURATION)
    expect(output.warnings.some((w) => w.includes('exceeds'))).toBe(true)
  })

  it('accepts a duration under the cap unchanged', () => {
    const output = generate({ actionId: 'aws:ebs:pause-volume-io', duration: 'PT2M' })
    const action = Object.values(output.cliInputJson.actions as Record<string, { parameters: Record<string, string> }>)[0]
    expect(action.parameters.duration).toBe('PT2M')
  })

  it('never emits resourceArns — targets are tag-only, never ARN-listed', () => {
    const output = generate()
    const target = Object.values(output.cliInputJson.targets as Record<string, Record<string, unknown>>)[0]
    expect(target.resourceArns).toBeUndefined()
    expect(JSON.stringify(output.cliInputJson)).not.toContain('resourceArns')
  })

  it('no wildcard anywhere in the generated CLI JSON', () => {
    const output = generate()
    expect(JSON.stringify(output.cliInputJson)).not.toContain('"*"')
  })

  it('the IAM role trusts only fis.amazonaws.com', () => {
    const output = generate()
    expect(output.cloudFormationYaml).toContain('Service: fis.amazonaws.com')
  })

  it('the IAM role includes only the used action\'s permissions plus baseline logging/alarm permissions', () => {
    const output = generate({ actionId: 'aws:ec2:stop-instances' })
    expect(output.cloudFormationYaml).toContain('ec2:StopInstances')
    expect(output.cloudFormationYaml).not.toContain('rds:RebootDBInstance')
    expect(output.cloudFormationYaml).not.toContain('ecs:StopTask')
  })

  it('logging is configured to CloudWatch Logs', () => {
    const output = generate()
    const logConfig = output.cliInputJson.logConfiguration as { cloudWatchLogsConfiguration: { logGroupArn: string }; logSchemaVersion: number }
    expect(logConfig.cloudWatchLogsConfiguration.logGroupArn).toMatch(/^arn:aws:logs:/)
    expect(logConfig.logSchemaVersion).toBeGreaterThan(0)
  })

  it('sets experimentOptions.emptyTargetResolutionMode to "skip"', () => {
    const output = generate()
    expect((output.cliInputJson.experimentOptions as { emptyTargetResolutionMode: string }).emptyTargetResolutionMode).toBe('skip')
  })

  it('the hypothesis text is carried into the description, never replaced with a predicted result', () => {
    const hypothesis = 'Does the checkout flow survive a single-AZ database reboot?'
    const output = generate({ actionId: 'aws:rds:reboot-db-instances', hypothesis })
    expect(output.cliInputJson.description).toBe(hypothesis)
    expect(output.readmeMarkdown).toContain(hypothesis)
  })

  it('warns (rather than silently proceeding) when a required non-duration parameter is missing', () => {
    // None of the 6 real candidate actions requires anything other than `duration` (which the
    // generator always auto-fills) — a synthetic action fixture exercises this path directly.
    const actionWithExtraRequiredParam = {
      id: 'aws:test:needs-extra-param',
      description: 'test fixture',
      targetType: 'Things',
      resourceType: 'aws:test:thing',
      requiredParameters: ['mustProvideThis'],
      optionalParameters: [],
      iamPermissions: [],
      capturedDate: '2026-01-01',
      verified: true,
      source: 'test fixture',
    }
    const result = generateFisTemplate(
      baseInput({ actionId: actionWithExtraRequiredParam.id, actionParameters: {} }),
      [actionWithExtraRequiredParam],
    )
    if (result.skipped) throw new Error(`expected a template, got skipped: ${result.reason}`)
    expect(result.warnings.some((w) => w.toLowerCase().includes('missing required parameter'))).toBe(true)
  })

  it('the README includes the safety checklist items the task specifies', () => {
    const output = generate()
    expect(output.readmeMarkdown).toMatch(/non-production/i)
    expect(output.readmeMarkdown).toMatch(/tag only/i)
    expect(output.readmeMarkdown).toMatch(/alarm/i)
    expect(output.readmeMarkdown).toMatch(/team/i)
  })
})

describe('JSON shape matches `aws fis create-experiment-template --cli-input-json`', () => {
  it('has exactly the top-level keys the real CreateExperimentTemplateRequest API shape has', () => {
    const output = generate()
    expect(Object.keys(output.cliInputJson).sort()).toEqual(
      ['description', 'stopConditions', 'targets', 'actions', 'roleArn', 'tags', 'logConfiguration', 'experimentOptions'].sort(),
    )
  })

  it('each target has exactly resourceType, resourceTags, selectionMode (never resourceArns/filters when unused)', () => {
    const output = generate()
    const target = Object.values(output.cliInputJson.targets as Record<string, object>)[0]
    expect(Object.keys(target).sort()).toEqual(['resourceType', 'resourceTags', 'selectionMode'].sort())
  })

  it('each action has actionId, description, parameters, targets', () => {
    const output = generate()
    const action = Object.values(output.cliInputJson.actions as Record<string, object>)[0]
    expect(Object.keys(action).sort()).toEqual(['actionId', 'description', 'parameters', 'targets'].sort())
  })
})

describe('validateFisTemplateInvariants — the validator itself catches real violations', () => {
  const validJson = generate().cliInputJson

  it('catches a wildcard-ARN target', () => {
    const broken = structuredClone(validJson) as Record<string, unknown>
    const targets = broken.targets as Record<string, Record<string, unknown>>
    Object.values(targets)[0].resourceArns = ['*']
    expect(validateFisTemplateInvariants(broken, ['aws:ec2:stop-instances'])).toContain(
      'target uses resourceArns — targets must be tag-scoped only, never ARN-listed',
    )
  })

  it('catches a missing stop condition', () => {
    const broken = structuredClone(validJson) as Record<string, unknown>
    broken.stopConditions = []
    expect(validateFisTemplateInvariants(broken, ['aws:ec2:stop-instances'])).toContain('missing mandatory stopConditions')
  })

  it('catches an ALL selectionMode (not COUNT(1) or a small PERCENT)', () => {
    const broken = structuredClone(validJson) as Record<string, unknown>
    const targets = broken.targets as Record<string, Record<string, unknown>>
    Object.values(targets)[0].selectionMode = 'ALL'
    const errors = validateFisTemplateInvariants(broken, ['aws:ec2:stop-instances'])
    expect(errors.some((e) => e.includes('selectionMode must be'))).toBe(true)
  })

  it('catches a duration over the hard cap', () => {
    const broken = structuredClone(validJson) as Record<string, unknown>
    const actions = broken.actions as Record<string, { parameters: Record<string, string> }>
    Object.values(actions)[0].parameters = { duration: 'PT1H' }
    const errors = validateFisTemplateInvariants(broken, ['aws:ec2:stop-instances'])
    expect(errors.some((e) => e.includes('exceeds'))).toBe(true)
  })

  it('catches an action id not in the known/verified list', () => {
    expect(validateFisTemplateInvariants(validJson, ['some:other:action'])).toEqual(
      expect.arrayContaining([expect.stringContaining('is not in the verified actions file')]),
    )
  })

  it('catches emptyTargetResolutionMode set to fail instead of skip', () => {
    const broken = structuredClone(validJson) as Record<string, unknown>
    broken.experimentOptions = { emptyTargetResolutionMode: 'fail' }
    const errors = validateFisTemplateInvariants(broken, ['aws:ec2:stop-instances'])
    expect(errors.some((e) => e.includes('emptyTargetResolutionMode'))).toBe(true)
  })
})

describe('parseIso8601DurationSeconds', () => {
  it('parses minutes, hours, seconds, and combinations', () => {
    expect(parseIso8601DurationSeconds('PT5M')).toBe(300)
    expect(parseIso8601DurationSeconds('PT1H')).toBe(3600)
    expect(parseIso8601DurationSeconds('PT30S')).toBe(30)
    expect(parseIso8601DurationSeconds('PT1H30M')).toBe(5400)
  })

  it('throws on garbage input instead of returning a wrong number', () => {
    expect(() => parseIso8601DurationSeconds('5 minutes')).toThrow()
    expect(() => parseIso8601DurationSeconds('PT')).toThrow()
  })
})
