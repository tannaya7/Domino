import { describe, expect, it } from 'vitest'
import { buildOwnInfrastructure } from '../src/ownInfra'

describe('buildOwnInfrastructure', () => {
  it('merges .tfvars defaults across files before resolving var.X references in .tf files', () => {
    const result = buildOwnInfrastructure([
      { path: 'terraform.tfvars', content: 'desired = 3\n' },
      {
        path: 'main.tf',
        content: `
resource "aws_ecs_service" "api" {
  desired_count = var.desired
}
`,
      },
    ])
    expect(result.unresolved).toEqual([])
    expect(result.findings).toEqual([])
  })

  it('extracts aws-region from a GitHub Actions workflow as region evidence', () => {
    const result = buildOwnInfrastructure([
      {
        path: '.github/workflows/deploy.yml',
        content: `
jobs:
  deploy:
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: us-east-1
`,
      },
    ])
    expect(result.regions).toEqual([{ region: 'us-east-1', resourceCount: 0, evidence: ['.github/workflows/deploy.yml:7'] }])
  })

  it('aggregates resources and region evidence across multiple .tf files', () => {
    const result = buildOwnInfrastructure([
      {
        path: 'provider.tf',
        content: `
provider "aws" {
  region = "us-east-1"
}
`,
      },
      {
        path: 'db.tf',
        content: `
resource "aws_db_instance" "primary" {
  multi_az = false
}
`,
      },
    ])
    expect(result.findings.map((f) => f.rule).sort()).toEqual(['RDS_SINGLE_AZ', 'SINGLE_REGION'])
    expect(result.filesScanned).toBe(2)
  })

  it('returns an empty, honest result when there is no IaC at all', () => {
    const result = buildOwnInfrastructure([])
    expect(result).toEqual({ regions: [], findings: [], unresolved: [], filesScanned: 0, fixes: [], fixesPrText: null })
  })

  it('ignores non-Terraform, non-workflow IaC files (e.g. a CFN template) without crashing', () => {
    const result = buildOwnInfrastructure([{ path: 'template.yaml', content: 'AWSTemplateFormatVersion: "2010-09-09"\n' }])
    expect(result.findings).toEqual([])
    expect(result.filesScanned).toBe(0)
  })
})
