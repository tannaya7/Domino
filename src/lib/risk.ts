export type RiskLevel = 'Low' | 'Medium' | 'High'

export function getRiskLevel(totalCount: number): RiskLevel {
  if (totalCount <= 2) return 'Low'
  if (totalCount <= 6) return 'Medium'
  return 'High'
}

export const RISK_STYLES: Record<RiskLevel, string> = {
  Low: 'bg-green-100 text-green-800',
  Medium: 'bg-amber-100 text-amber-800',
  High: 'bg-red-100 text-red-800',
}
