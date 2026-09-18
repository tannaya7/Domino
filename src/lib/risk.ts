export type RiskLevel = 'Low' | 'Medium' | 'High'

export function getRiskLevel(totalCount: number): RiskLevel {
  if (totalCount <= 2) return 'Low'
  if (totalCount <= 6) return 'Medium'
  return 'High'
}

export const RISK_STYLES: Record<RiskLevel, string> = {
  Low: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Medium: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
  High: 'border border-red-500/30 bg-red-500/10 text-red-300',
}
