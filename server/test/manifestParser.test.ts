import { describe, expect, it } from 'vitest'
import {
  parseGemfile,
  parseGoMod,
  parseManifest,
  parsePackageJsonDependencies,
  parsePomXml,
  parseRequirementsTxt,
} from '../src/manifestParser'

describe('parsePackageJsonDependencies', () => {
  it('extracts dependencies and devDependencies', () => {
    const pkg = JSON.stringify({ dependencies: { stripe: '^14.0.0' }, devDependencies: { vitest: '^5.0.0' } })
    expect(parsePackageJsonDependencies(pkg)).toEqual([
      { name: 'stripe', ecosystem: 'npm' },
      { name: 'vitest', ecosystem: 'npm' },
    ])
  })

  it('returns an empty array for invalid JSON instead of throwing', () => {
    expect(parsePackageJsonDependencies('not json')).toEqual([])
  })
})

describe('parseRequirementsTxt', () => {
  it('extracts package names, stripping version pins and extras', () => {
    const source = `requests==2.31.0\nstripe\ndjango[extra]>=4.2\n# comment\n-e git+https://example.com/foo`
    expect(parseRequirementsTxt(source)).toEqual([
      { name: 'requests', ecosystem: 'pip' },
      { name: 'stripe', ecosystem: 'pip' },
      { name: 'django', ecosystem: 'pip' },
    ])
  })
})

describe('parseGoMod', () => {
  it('extracts module paths from a require block', () => {
    const source = `module example.com/app\n\ngo 1.21\n\nrequire (\n\tgithub.com/aws/aws-sdk-go v1.44.0\n\tgithub.com/stripe/stripe-go/v76 v76.0.0\n)`
    expect(parseGoMod(source)).toEqual([
      { name: 'github.com/aws/aws-sdk-go', ecosystem: 'go' },
      { name: 'github.com/stripe/stripe-go/v76', ecosystem: 'go' },
    ])
  })

  it('extracts a single-line require', () => {
    const source = `module example.com/app\n\nrequire github.com/twilio/twilio-go v1.0.0`
    expect(parseGoMod(source)).toEqual([{ name: 'github.com/twilio/twilio-go', ecosystem: 'go' }])
  })
})

describe('parseGemfile', () => {
  it('extracts gem names regardless of quote style or version constraint', () => {
    const source = `gem "rails"\ngem 'sentry-ruby', '~> 5.0'`
    expect(parseGemfile(source)).toEqual([
      { name: 'rails', ecosystem: 'gem' },
      { name: 'sentry-ruby', ecosystem: 'gem' },
    ])
  })
})

describe('parsePomXml', () => {
  it('extracts artifactIds from dependency blocks', () => {
    const source = `<project><dependencies><dependency><groupId>com.stripe</groupId><artifactId>stripe-java</artifactId></dependency></dependencies></project>`
    expect(parsePomXml(source)).toEqual([{ name: 'stripe-java', ecosystem: 'maven' }])
  })
})

describe('parseManifest', () => {
  it('dispatches by basename', () => {
    const pkg = JSON.stringify({ dependencies: { stripe: '1.0.0' } })
    expect(parseManifest('nested/dir/package.json', pkg)).toEqual([{ name: 'stripe', ecosystem: 'npm' }])
  })

  it('returns an empty array for an unrecognized filename', () => {
    expect(parseManifest('README.md', 'hello')).toEqual([])
  })
})
