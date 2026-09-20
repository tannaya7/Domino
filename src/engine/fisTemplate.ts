// Pure template generation — no I/O, no AWS SDK calls. Generates ready-to-run AWS FIS experiment
// artifacts for the team's OWN account; NOTHING in this module (or anything that calls it) ever
// creates, starts, or executes an experiment. The only place this app ever calls a live AWS API is
// scripts/verify-fis-actions.ts (read-only: ListActions/GetAction), and it never touches this file
// at runtime — this module only reads data/fis-actions.verified.json, bundled as static data.

export interface VerifiedFisAction {
  id: string
  description: string
  targetType: string
  resourceType: string
  requiredParameters: string[]
  optionalParameters: string[]
  iamPermissions: string[]
  capturedDate: string
  verified: boolean
  source: string
}

export interface VerifiedFisActionsFile {
  generatedAt: string
  region: string
  fileVerified: boolean
  actions: VerifiedFisAction[]
}

export const MANDATORY_TARGET_TAG_KEY = 'blast-radius-experiment'
export const MANDATORY_TARGET_TAG_VALUE = 'true'
export const DEFAULT_DURATION = 'PT5M'
export const MAX_DURATION = 'PT10M'
export const MAX_SMALL_PERCENT = 25
/** FIS's current CloudWatch Logs log schema version, per AWS docs as of this writing — confirm
 * against real docs if AWS has since published a newer version. */
export const LOG_SCHEMA_VERSION = 2

/** ISO8601 duration -> total seconds. Only supports the PT[H][M][S] shape FIS durations use. */
export function parseIso8601DurationSeconds(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration.trim())
  if (!match || (!match[1] && !match[2] && !match[3])) {
    throw new Error(`Invalid ISO8601 duration "${duration}" — expected a form like PT5M, PT1H, or PT30S.`)
  }
  const [, h, m, s] = match
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
}

/** Looks up an action by id in the verified file. Returns null (never throws) for an unknown id,
 * or a known-but-unverified one unless `allowUnverifiedDraft` is explicitly set — the generator's
 * one and only gate on "actions the generator may use". */
export function findVerifiedAction(
  actions: VerifiedFisAction[],
  actionId: string,
  options: { allowUnverifiedDraft?: boolean } = {},
): VerifiedFisAction | null {
  const action = actions.find((a) => a.id === actionId)
  if (!action) return null
  if (!action.verified && !options.allowUnverifiedDraft) return null
  return action
}

export interface FisTargetSelection {
  mode: 'count' | 'percent'
  value: number
}

export interface FisTemplateInput {
  hypothesis: string
  actionId: string
  /** Merged with the mandatory blast-radius-experiment=true tag — callers never need to add that
   * one themselves, and can't accidentally omit it either. */
  targetTags: Record<string, string>
  region: string
  actionParameters?: Record<string, string>
  /** ISO8601 duration, only meaningful for actions with a `duration` parameter. Clamped to
   * [DEFAULT_DURATION, MAX_DURATION] — never silently dropped, always reported via `warnings`. */
  duration?: string
  selection?: FisTargetSelection
  alarmArnPlaceholder?: string
  logGroupArnPlaceholder?: string
  roleArnPlaceholder?: string
}

export interface FisTemplateOutput {
  skipped: false
  cliInputJson: Record<string, unknown>
  cloudFormationYaml: string
  readmeMarkdown: string
  cliCommand: string
  warnings: string[]
}

export type FisTemplateResult = { skipped: true; reason: string } | FisTemplateOutput

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Structural + safety-invariant validation of an already-built --cli-input-json body — the same
 * checks the generator applies to itself before returning, exported so tests (and any other
 * caller) can independently assert every invariant on a template, not just trust the generator. */
export function validateFisTemplateInvariants(cliInputJson: Record<string, unknown>, knownVerifiedActionIds: string[]): string[] {
  const errors: string[] = []
  const j = cliInputJson as {
    stopConditions?: Array<{ source?: string; value?: string }>
    targets?: Record<string, { resourceArns?: string[]; resourceTags?: Record<string, string>; selectionMode?: string }>
    actions?: Record<string, { actionId?: string; parameters?: Record<string, string> }>
    roleArn?: string
    logConfiguration?: { cloudWatchLogsConfiguration?: { logGroupArn?: string }; logSchemaVersion?: number }
    experimentOptions?: { emptyTargetResolutionMode?: string }
  }

  if (!j.stopConditions || j.stopConditions.length === 0) errors.push('missing mandatory stopConditions')
  for (const sc of j.stopConditions ?? []) {
    if (sc.source !== 'aws:cloudwatch:alarm') errors.push(`stopCondition source must be aws:cloudwatch:alarm, got "${sc.source}"`)
    if (!sc.value || !sc.value.startsWith('arn:')) errors.push('stopCondition value must be a CloudWatch alarm ARN')
  }

  const targets = Object.values(j.targets ?? {})
  if (targets.length === 0) errors.push('missing at least one target')
  for (const t of targets) {
    if (t.resourceArns && t.resourceArns.length > 0) errors.push('target uses resourceArns — targets must be tag-scoped only, never ARN-listed')
    if (!t.resourceTags || t.resourceTags[MANDATORY_TARGET_TAG_KEY] !== MANDATORY_TARGET_TAG_VALUE) {
      errors.push(`target is missing the mandatory ${MANDATORY_TARGET_TAG_KEY}=${MANDATORY_TARGET_TAG_VALUE} tag`)
    }
    const mode = t.selectionMode ?? ''
    const percentMatch = /^PERCENT\((\d+)\)$/.exec(mode)
    if (mode === 'COUNT(1)') {
      // fine
    } else if (percentMatch) {
      if (Number(percentMatch[1]) > MAX_SMALL_PERCENT) errors.push(`selectionMode ${mode} exceeds the max small percent (${MAX_SMALL_PERCENT})`)
    } else {
      errors.push(`selectionMode must be COUNT(1) or a small PERCENT(n), got "${mode}"`)
    }
  }

  const actionEntries = Object.values(j.actions ?? {})
  if (actionEntries.length === 0) errors.push('missing at least one action')
  for (const a of actionEntries) {
    if (!a.actionId || !knownVerifiedActionIds.includes(a.actionId)) {
      errors.push(`action "${a.actionId}" is not in the verified actions file`)
    }
    const duration = a.parameters?.duration
    if (duration) {
      try {
        const seconds = parseIso8601DurationSeconds(duration)
        if (seconds > parseIso8601DurationSeconds(MAX_DURATION)) errors.push(`duration ${duration} exceeds the ${MAX_DURATION} hard cap`)
      } catch {
        errors.push(`invalid duration "${duration}"`)
      }
    }
  }

  if (!j.roleArn || !j.roleArn.startsWith('arn:')) errors.push('missing roleArn')
  if (!j.logConfiguration?.cloudWatchLogsConfiguration?.logGroupArn) errors.push('missing CloudWatch Logs logConfiguration')
  if (j.experimentOptions?.emptyTargetResolutionMode !== 'skip') {
    errors.push('experimentOptions.emptyTargetResolutionMode must be "skip" — empty target resolution must skip, never fail-open into running nothing silently or erroring destructively')
  }

  return errors
}

function iamRoleCfnYaml(actionIamPermissions: string[]): string {
  const baseline = [
    'logs:CreateLogDelivery',
    'logs:PutResourcePolicy',
    'logs:DescribeResourcePolicies',
    'logs:DescribeLogGroups',
    'logs:DeleteLogDelivery',
    'logs:GetLogDelivery',
    'logs:ListLogDeliveries',
    'logs:UpdateLogDelivery',
    'cloudwatch:DescribeAlarms',
  ]
  const allPermissions = [...new Set([...baseline, ...actionIamPermissions])]
  const actionsYaml = allPermissions.map((p) => `                  - '${p}'`).join('\n')
  return `  BlastRadiusFisExperimentRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: blast-radius-experiment-role
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: fis.amazonaws.com
            Action: 'sts:AssumeRole'
            Condition:
              StringEquals:
                'aws:SourceAccount': !Ref 'AWS::AccountId'
      Policies:
        - PolicyName: blast-radius-experiment-least-privilege
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: FisActionAndLogging
                Effect: Allow
                Action:
${actionsYaml}
                Resource: '*'`
}

export function generateFisTemplate(
  input: FisTemplateInput,
  verifiedActions: VerifiedFisAction[],
  options: { allowUnverifiedDraft?: boolean } = {},
): FisTemplateResult {
  const targetTags = { ...input.targetTags, [MANDATORY_TARGET_TAG_KEY]: MANDATORY_TARGET_TAG_VALUE }
  const meaningfulTagCount = Object.keys(input.targetTags).length
  if (meaningfulTagCount === 0) {
    return { skipped: true, reason: 'No target tags supplied — refusing to generate a template that would resolve to every resource of this type.' }
  }

  const action = findVerifiedAction(verifiedActions, input.actionId, options)
  if (!action) {
    const knownButUnverified = verifiedActions.some((a) => a.id === input.actionId && !a.verified)
    return {
      skipped: true,
      reason: knownButUnverified
        ? `"${input.actionId}" is only a DRAFT entry in the verified actions file (not independently confirmed via a live aws fis get-action call) — pass { allowUnverifiedDraft: true } to use it anyway.`
        : `"${input.actionId}" is not in the verified FIS actions file — the generator may only use actions that have been verified.`,
    }
  }

  const warnings: string[] = []
  if (!action.verified) warnings.push(`"${action.id}" is a DRAFT entry (not independently confirmed via a live aws fis get-action call) — verify before real use.`)
  if (action.iamPermissions.length === 0) {
    warnings.push(`No IAM permissions recorded for "${action.id}" — the generated role only has baseline (logging/stop-condition) permissions. Add this action's required permissions by hand before use.`)
  }

  let durationSeconds: number
  let duration = input.duration ?? DEFAULT_DURATION
  try {
    durationSeconds = parseIso8601DurationSeconds(duration)
  } catch {
    warnings.push(`Invalid duration "${duration}" — falling back to ${DEFAULT_DURATION}.`)
    duration = DEFAULT_DURATION
    durationSeconds = parseIso8601DurationSeconds(DEFAULT_DURATION)
  }
  const maxSeconds = parseIso8601DurationSeconds(MAX_DURATION)
  if (durationSeconds > maxSeconds) {
    warnings.push(`Requested duration ${duration} exceeds the ${MAX_DURATION} hard cap — clamped to ${MAX_DURATION}.`)
    duration = MAX_DURATION
  }

  let selectionMode = 'COUNT(1)'
  if (input.selection) {
    if (input.selection.mode === 'count') {
      // Deliberately clamped to exactly 1, not "a small count" — the invariant is COUNT(1)
      // specifically (see validateFisTemplateInvariants), matching the task spec verbatim.
      const n = clamp(Math.round(input.selection.value), 1, 1)
      if (n !== input.selection.value) warnings.push(`Requested COUNT(${input.selection.value}) — only COUNT(1) is allowed, clamped to COUNT(1).`)
      selectionMode = `COUNT(${n})`
    } else {
      const pct = clamp(Math.round(input.selection.value), 1, MAX_SMALL_PERCENT)
      if (pct !== input.selection.value) warnings.push(`Requested PERCENT(${input.selection.value}) clamped to PERCENT(${pct}) — max small percent is ${MAX_SMALL_PERCENT}.`)
      selectionMode = `PERCENT(${pct})`
    }
  }

  const alarmArn = input.alarmArnPlaceholder ?? `arn:aws:cloudwatch:${input.region}:<ACCOUNT_ID>:alarm:blast-radius-experiment-guardrail`
  const logGroupArn = input.logGroupArnPlaceholder ?? `arn:aws:logs:${input.region}:<ACCOUNT_ID>:log-group:/blast-radius/fis-experiments`
  const roleArn = input.roleArnPlaceholder ?? `arn:aws:iam::<ACCOUNT_ID>:role/blast-radius-experiment-role`

  const actionParameters: Record<string, string> = {}
  if (action.requiredParameters.includes('duration') || action.optionalParameters.includes('duration')) {
    actionParameters.duration = duration
  }
  for (const [key, value] of Object.entries(input.actionParameters ?? {})) {
    if (action.requiredParameters.includes(key) || action.optionalParameters.includes(key)) actionParameters[key] = value
  }
  const missingRequired = action.requiredParameters.filter((p) => !(p in actionParameters))
  if (missingRequired.length > 0) {
    warnings.push(`Missing required parameter(s) for "${action.id}": ${missingRequired.join(', ')} — fill these in before running.`)
  }

  const cliInputJson: Record<string, unknown> = {
    description: input.hypothesis,
    stopConditions: [{ source: 'aws:cloudwatch:alarm', value: alarmArn }],
    targets: {
      BlastRadiusTarget: {
        resourceType: action.resourceType,
        resourceTags: targetTags,
        selectionMode,
      },
    },
    actions: {
      BlastRadiusAction: {
        actionId: action.id,
        description: input.hypothesis,
        parameters: actionParameters,
        targets: { [action.targetType]: 'BlastRadiusTarget' },
      },
    },
    roleArn,
    tags: { [MANDATORY_TARGET_TAG_KEY]: MANDATORY_TARGET_TAG_VALUE, GeneratedBy: 'blast-radius-mapper' },
    logConfiguration: {
      cloudWatchLogsConfiguration: { logGroupArn },
      logSchemaVersion: LOG_SCHEMA_VERSION,
    },
    experimentOptions: { emptyTargetResolutionMode: 'skip' },
  }

  const invariantErrors = validateFisTemplateInvariants(cliInputJson, [action.id])
  if (invariantErrors.length > 0) {
    // Should be unreachable given the construction above — fail loudly rather than hand back a
    // template that silently violates its own safety invariants.
    return { skipped: true, reason: `Internal safety-invariant check failed: ${invariantErrors.join('; ')}` }
  }

  const tagsYaml = Object.entries(targetTags)
    .map(([k, v]) => `          ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join('\n')
  const paramsYaml =
    Object.keys(actionParameters).length > 0
      ? Object.entries(actionParameters)
          .map(([k, v]) => `              ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
          .join('\n')
      : '              {}'

  const cloudFormationYaml = `AWSTemplateFormatVersion: '2010-09-09'
Description: >
  Generated by Blast Radius Mapper — NOT executed by this tool. Review every placeholder
  (<ACCOUNT_ID>, the sample alarm) before deploying. Hypothesis: ${input.hypothesis}
Resources:
${iamRoleCfnYaml(action.iamPermissions)}

  BlastRadiusGuardrailAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: blast-radius-experiment-guardrail
      AlarmDescription: >
        SAMPLE guardrail — replace with a real health/error-rate alarm for the system under test
        before running this experiment. FIS stops the experiment immediately if this alarm fires.
      Namespace: AWS/EC2
      MetricName: CPUUtilization
      Statistic: Average
      Period: 60
      EvaluationPeriods: 1
      Threshold: 90
      ComparisonOperator: GreaterThanThreshold
      TreatMissingData: notBreaching

  BlastRadiusExperimentTemplate:
    Type: AWS::FIS::ExperimentTemplate
    Properties:
      Description: ${JSON.stringify(input.hypothesis)}
      RoleArn: !GetAtt BlastRadiusFisExperimentRole.Arn
      StopConditions:
        - Source: aws:cloudwatch:alarm
          Value: !GetAtt BlastRadiusGuardrailAlarm.Arn
      Targets:
        BlastRadiusTarget:
          ResourceType: ${action.resourceType}
          SelectionMode: ${selectionMode}
          ResourceTags:
${tagsYaml}
      Actions:
        BlastRadiusAction:
          ActionId: ${action.id}
          Description: ${JSON.stringify(input.hypothesis)}
          Parameters:
${paramsYaml}
          Targets:
            ${action.targetType}: BlastRadiusTarget
      Tags:
        ${MANDATORY_TARGET_TAG_KEY}: '${MANDATORY_TARGET_TAG_VALUE}'
        GeneratedBy: blast-radius-mapper
      LogConfiguration:
        CloudWatchLogsConfiguration:
          LogGroupArn: ${logGroupArn}
        LogSchemaVersion: ${LOG_SCHEMA_VERSION}
      ExperimentOptions:
        EmptyTargetResolutionMode: skip
`

  const cliCommand = `aws fis create-experiment-template --region ${input.region} --cli-input-json file://blast-radius-experiment-template.json`

  const readmeMarkdown = `# ${input.hypothesis}

Generated by Blast Radius Mapper. **This tool never runs anything** — everything below is a
starting point for YOUR team to review, adjust, and run in YOUR own account.

## Before you do anything

1. **Run this in a non-production account/environment first.**
2. **Tag only the resources you actually intend to target** with \`${MANDATORY_TARGET_TAG_KEY}=${MANDATORY_TARGET_TAG_VALUE}\` — nothing else is in scope. The generated target resolves resources by this tag alone (never by ARN, never "all resources").
3. **Confirm the guardrail alarm is real before you rely on it.** The generated CloudFormation includes a SAMPLE CloudWatch alarm (${'`BlastRadiusGuardrailAlarm`'}) — replace its metric/threshold with a real health signal for the system under test. FIS will not start (or will stop) the experiment without a working alarm.
4. **Tell your team before you run this.** A network/instance/DB disruption, even scoped and time-boxed, is visible to anyone using the affected system.
5. Fill in every \`<ACCOUNT_ID>\` placeholder in the generated JSON/YAML.
${warnings.length > 0 ? `\n## Warnings\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
## What this experiment does

- **Action:** \`${action.id}\` — ${action.description}
- **Target:** resources tagged \`${MANDATORY_TARGET_TAG_KEY}=${MANDATORY_TARGET_TAG_VALUE}\`, selection \`${selectionMode}\`
- **Duration:** ${duration}
- **Stop condition:** CloudWatch alarm (mandatory — the experiment stops immediately if it fires)
- **Empty target resolution:** skip (if the tag matches nothing, FIS skips the action rather than failing or matching something else)

## Run it

\`\`\`
${cliCommand}
\`\`\`

Or deploy \`blast-radius-experiment-template.yaml\` via CloudFormation, which also creates the
least-privilege IAM role and the sample guardrail alarm.

## Safety checklist

- [ ] Running in non-prod first
- [ ] Only intended resources carry \`${MANDATORY_TARGET_TAG_KEY}=${MANDATORY_TARGET_TAG_VALUE}\`
- [ ] Guardrail alarm confirmed real and wired to a meaningful metric
- [ ] Team notified
- [ ] \`<ACCOUNT_ID>\` placeholders filled in
`

  return { skipped: false, cliInputJson, cloudFormationYaml, readmeMarkdown, cliCommand, warnings }
}
