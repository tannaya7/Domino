import { describe, expect, it } from 'vitest'
import {
  detectVercelConfig,
  isIacFile,
  parseIacFile,
  parseServerlessYml,
  parseTerraformResources,
  parseTerraformState,
} from '../src/iacParser'

describe('parseTerraformResources', () => {
  it('extracts AWS resource types and tags them with the aws provider', () => {
    const source = `resource "aws_lambda_function" "api" {\n  runtime = "nodejs20.x"\n}\nresource "aws_dynamodb_table" "cache" {}`
    expect(parseTerraformResources(source, 'main.tf')).toEqual([
      { provider: 'aws', resourceType: 'aws_lambda_function', source: 'main.tf' },
      { provider: 'aws', resourceType: 'aws_dynamodb_table', source: 'main.tf' },
    ])
  })

  it('tags non-AWS providers correctly', () => {
    const source = `resource "google_storage_bucket" "assets" {}`
    expect(parseTerraformResources(source, 'main.tf')).toEqual([
      { provider: 'gcp', resourceType: 'google_storage_bucket', source: 'main.tf' },
    ])
  })

  it('returns an empty array when there are no resource blocks', () => {
    expect(parseTerraformResources('variable "region" {}', 'main.tf')).toEqual([])
  })
})

describe('parseTerraformState', () => {
  it('extracts resource types from a tfstate JSON document', () => {
    const state = JSON.stringify({ resources: [{ type: 'aws_s3_bucket' }, { type: 'azurerm_storage_account' }] })
    expect(parseTerraformState(state, 'terraform.tfstate')).toEqual([
      { provider: 'aws', resourceType: 'aws_s3_bucket', source: 'terraform.tfstate' },
      { provider: 'azure', resourceType: 'azurerm_storage_account', source: 'terraform.tfstate' },
    ])
  })

  it('returns an empty array for invalid JSON instead of throwing', () => {
    expect(parseTerraformState('not json', 'terraform.tfstate')).toEqual([])
  })
})

describe('parseServerlessYml', () => {
  it('extracts the target provider', () => {
    const source = `service: my-app\nprovider:\n  name: aws\n  runtime: nodejs20.x`
    expect(parseServerlessYml(source, 'serverless.yml')).toEqual([{ provider: 'aws', source: 'serverless.yml' }])
  })

  it('maps google to gcp', () => {
    expect(parseServerlessYml('provider:\n  name: google', 'serverless.yml')).toEqual([
      { provider: 'gcp', source: 'serverless.yml' },
    ])
  })

  it('returns an empty array when no provider name is found', () => {
    expect(parseServerlessYml('service: my-app', 'serverless.yml')).toEqual([])
  })
})

describe('detectVercelConfig', () => {
  it('always reports the vercel provider for the given path', () => {
    expect(detectVercelConfig('vercel.json')).toEqual([{ provider: 'vercel', source: 'vercel.json' }])
  })
})

describe('isIacFile', () => {
  it.each([
    ['infra/main.tf', true],
    ['terraform.tfstate', true],
    ['serverless.yml', true],
    ['serverless.yaml', true],
    ['vercel.json', true],
    ['src/index.ts', false],
    ['package.json', false],
  ])('%s -> %s', (path, expected) => {
    expect(isIacFile(path)).toBe(expected)
  })
})

describe('parseIacFile', () => {
  it('dispatches by path/extension', () => {
    expect(parseIacFile('vercel.json', '{}')).toEqual([{ provider: 'vercel', source: 'vercel.json' }])
  })

  it('returns an empty array for an unrecognized file', () => {
    expect(parseIacFile('README.md', 'hello')).toEqual([])
  })
})
