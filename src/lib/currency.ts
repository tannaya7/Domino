export type Currency = 'USD' | 'INR'

/**
 * Illustrative only — NOT a live exchange rate, and never presented as one. Used solely to keep
 * the default cost-per-hour prefill roughly consistent when the user toggles currency; editing the
 * number directly after toggling is the accurate path, and the UI says so next to the toggle.
 */
export const ILLUSTRATIVE_INR_PER_USD = 83

/** The one illustrative anchor value this tool ships with — everything else derives from it. */
export const ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR = 50_000

export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: '$', INR: '₹' }

export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount
  return from === 'USD' ? Math.round(amount * ILLUSTRATIVE_INR_PER_USD) : Math.round(amount / ILLUSTRATIVE_INR_PER_USD)
}

export function defaultCostPerHour(currency: Currency): number {
  return currency === 'INR'
    ? ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR
    : Math.round(ILLUSTRATIVE_DEFAULT_COST_PER_HOUR_INR / ILLUSTRATIVE_INR_PER_USD)
}

export function formatCurrency(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
