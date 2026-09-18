import { describe, expect, it } from 'vitest'
import { convertCurrency, defaultCostPerHour, formatCurrency, ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR } from './currency'

describe('currency', () => {
  it('returns the amount unchanged when converting to the same currency', () => {
    expect(convertCurrency(500, 'USD', 'USD')).toBe(500)
  })

  it('converts USD to INR using the illustrative rate', () => {
    expect(convertCurrency(100, 'USD', 'INR')).toBe(8300)
  })

  it('converts INR to USD using the illustrative rate, rounded', () => {
    expect(convertCurrency(8300, 'INR', 'USD')).toBe(100)
  })

  it('round-trips back to (approximately) the original amount', () => {
    const original = 250
    const roundTripped = convertCurrency(convertCurrency(original, 'USD', 'INR'), 'INR', 'USD')
    expect(roundTripped).toBeCloseTo(original, 0)
  })

  it('the INR illustrative default is the documented anchor value', () => {
    expect(defaultCostPerHour('INR')).toBe(ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR)
  })

  it('derives the USD illustrative default from the INR anchor, not an independent guess', () => {
    expect(defaultCostPerHour('USD')).toBe(Math.round(ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR / 83))
  })

  it('formats with the correct currency symbol', () => {
    expect(formatCurrency(1234, 'USD')).toBe('$1,234')
    expect(formatCurrency(1234, 'INR')).toBe('₹1,234')
  })
})
