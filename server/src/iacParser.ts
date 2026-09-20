import type { IacProvider, IacSubstrateSignal } from '../../src/lib/types'

export type { IacProvider, IacSubstrateSignal } from '../../src/lib/types'

const TF_RESOURCE = /resource\s+"([a-zA-Z0-9_]+)"\s+"[a-zA-Z0-9_-]+"/g

function providerForResourceType(resourceType: string): IacProvider {
  if (resourceType.startsWith('aws_')) return 'aws'
  if (resourceType.startsWith('google_')) return 'gcp'
  if (resourceType.startsWith('azurerm_') || resourceType.startsWith('azure_')) return 'azure'
  if (resourceType.startsWith('cloudflare_')) return 'cloudflare'
  if (resourceType.startsWith('vercel_')) return 'vercel'
  return 'other'
}

/** Extracts substrate signals from a Terraform `.tf` source string via `resource "type" "name"` blocks. */
export function parseTerraformResources(source: string, sourcePath: string): IacSubstrateSignal[] {
  const signals: IacSubstrateSignal[] = []
  TF_RESOURCE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TF_RESOURCE.exec(source))) {
    const resourceType = match[1]
    signals.push({ provider: providerForResourceType(resourceType), resourceType, source: sourcePath })
  }
  return signals
}

/** Extracts substrate signals from a Terraform state file (JSON) via each resource's `type`. */
export function parseTerraformState(source: string, sourcePath: string): IacSubstrateSignal[] {
  try {
    const json = JSON.parse(source)
    const resources: Array<{ type?: string }> = json?.resources ?? []
    return resources
      .filter((r): r is { type: string } => typeof r.type === 'string')
      .map((r) => ({ provider: providerForResourceType(r.type), resourceType: r.type, source: sourcePath }))
  } catch {
    return []
  }
}

const SERVERLESS_PROVIDER = /name:\s*["']?(aws|google|azure)["']?/

/** Extracts the target cloud provider from a serverless.yml/yaml source string's `provider.name`. */
export function parseServerlessYml(source: string, sourcePath: string): IacSubstrateSignal[] {
  const match = SERVERLESS_PROVIDER.exec(source)
  if (!match) return []
  const provider = match[1] === 'google' ? 'gcp' : (match[1] as IacProvider)
  return [{ provider, source: sourcePath }]
}

/** A vercel.json's mere presence implies the app is deployed on Vercel's edge/hosting substrate. */
export function detectVercelConfig(sourcePath: string): IacSubstrateSignal[] {
  return [{ provider: 'vercel', source: sourcePath }]
}

/**
 * Returns true for any file worth fetching as a candidate IaC source — substrate-signal parsing
 * (above) and the "Your infrastructure" resilience linter (src/engine/ownInfrastructure.ts) both
 * consume this same discovery list, so a file only needs to be recognized here once. `.yml`/`.yaml`
 * and CFN-ish `.json` are broad on purpose (a real CloudFormation/SAM template's actual shape is
 * only confirmed by content-sniffing after fetch, in the linter's own parser) — a false positive
 * here just contributes nothing, never a wrong finding. `package.json`/`tsconfig.json`-style noise
 * is kept out of the `.json` case by requiring a template/cloudformation/cfn/sam-shaped basename.
 */
export function isIacFile(path: string): boolean {
  const basename = path.split('/').pop() ?? path
  if (
    path.endsWith('.tf') ||
    path.endsWith('.tfvars') ||
    basename === 'terraform.tfstate' ||
    basename === 'serverless.yml' ||
    basename === 'serverless.yaml' ||
    basename === 'vercel.json' ||
    basename === 'samconfig.toml' ||
    basename === 'cdk.json'
  ) {
    return true
  }
  // .github/workflows/*.yml|*.yaml — a region-detection source (`aws-region:`), not a resource
  // template; matched by directory, not just extension.
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) return true
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return true
  if (path.endsWith('.json') && /template|cloudformation|cfn|\bsam\b/i.test(basename)) return true
  return false
}

/** Parses one IaC file's substrate signals by its path/extension. Returns [] for anything unrecognized or unparsable. */
export function parseIacFile(path: string, content: string): IacSubstrateSignal[] {
  const basename = path.split('/').pop() ?? path
  try {
    if (path.endsWith('.tf')) return parseTerraformResources(content, path)
    if (basename === 'terraform.tfstate') return parseTerraformState(content, path)
    if (basename === 'serverless.yml' || basename === 'serverless.yaml') return parseServerlessYml(content, path)
    if (basename === 'vercel.json') return detectVercelConfig(path)
    return []
  } catch {
    return []
  }
}
