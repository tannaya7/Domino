// Orchestrator for the "Your infrastructure" resilience linter: turns the repo's own already-fetched
// IaC discovery files into an OwnInfrastructure result. Terraform-only for now — the CFN/SAM YAML+JSON
// parser was cut under this task's own authorized time-box fallback ("if it slips, ship R1-R4 for
// Terraform only and stop"); R5/R6 shipped too since the Terraform side of them was already working
// and tested. DISPLAY ONLY: nothing built here ever touches `vendors`, concentration, the correlated
// engine, a snapshot's vendor list, or the risk register.

import type { AttrValue, MultiRegionEvidence, ParsedResource, RegionEvidence } from '../../src/engine/ownInfrastructure'
import { evaluateOwnInfrastructure } from '../../src/engine/ownInfrastructure'
import type { OwnInfrastructure } from '../../src/lib/types'
import { parseTerraformForOwnInfra, parseTfvars } from './ownInfraTerraform'

export interface OwnInfraDiscoveryFile {
  path: string
  content: string
}

const WORKFLOW_REGION = /\baws-region\s*:\s*['"]?([a-zA-Z0-9-]+)['"]?/g

/** GitHub Actions workflows aren't Terraform/CFN, but a `aws-region:` step input is real, static
 * evidence of where this repo deploys to — cheap to read, worth counting toward region evidence. */
function scanWorkflowForRegion(file: OwnInfraDiscoveryFile): RegionEvidence[] {
  const out: RegionEvidence[] = []
  WORKFLOW_REGION.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORKFLOW_REGION.exec(file.content))) {
    const before = file.content.slice(0, match.index)
    const line = before.split('\n').length
    out.push({ region: match[1], file: file.path, line, detail: 'GitHub Actions workflow aws-region' })
  }
  return out
}

function isWorkflowFile(path: string): boolean {
  return /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
}

function isTerraformFile(path: string): boolean {
  return path.endsWith('.tf')
}

function isTfvarsFile(path: string): boolean {
  return path.endsWith('.tfvars')
}

/** Builds the "Your infrastructure" static-IaC linter result from the scanner's already-fetched IaC
 * discovery files (no extra fetches — reuses whatever `loadVendorDiscoverySources` pulled). */
export function buildOwnInfrastructure(iacFiles: OwnInfraDiscoveryFile[]): OwnInfrastructure {
  const tfvarFiles = iacFiles.filter((f) => isTfvarsFile(f.path))
  const tfFiles = iacFiles.filter((f) => isTerraformFile(f.path))
  const workflowFiles = iacFiles.filter((f) => isWorkflowFile(f.path))

  // All .tfvars defaults are merged into one lookup table for var.X resolution — this repo's own
  // values, never a value supplied outside the repo (a remote tfvars file, -var-file on the CLI,
  // TF_VAR_* env, or a Terraform Cloud workspace variable), which stay correctly "unresolved".
  const tfvars: Record<string, AttrValue> = {}
  for (const f of tfvarFiles) Object.assign(tfvars, parseTfvars(f.content))

  const resources: ParsedResource[] = []
  const regionEvidence: RegionEvidence[] = []
  const multiRegionEvidence: MultiRegionEvidence[] = []

  for (const f of tfFiles) {
    const parsed = parseTerraformForOwnInfra(f.path, f.content, tfvars)
    resources.push(...parsed.resources)
    regionEvidence.push(...parsed.regionEvidence)
    multiRegionEvidence.push(...parsed.multiRegionEvidence)
  }

  for (const f of workflowFiles) regionEvidence.push(...scanWorkflowForRegion(f))

  const filesScanned = tfFiles.length + tfvarFiles.length + workflowFiles.length
  return evaluateOwnInfrastructure(resources, regionEvidence, multiRegionEvidence, filesScanned)
}
