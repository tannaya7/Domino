/**
 * Scenario -> {hypothesis, action, what to observe}. Every hypothesis is phrased as a QUESTION to
 * test, never a predicted result — this tool has no idea whether your system actually survives any
 * of these, and never implies otherwise.
 */
export type FisScenarioId = 'az-disruption' | 'single-az-db' | 'single-instance'

export interface FisScenarioDefinition {
  id: FisScenarioId
  label: string
  hypothesis: string
  actionId: string
  whatToObserve: string
}

export const FIS_SCENARIOS: FisScenarioDefinition[] = [
  {
    id: 'az-disruption',
    label: 'AZ disruption',
    hypothesis: 'Does the application stay up on the remaining Availability Zone(s) if one AZ loses network connectivity?',
    actionId: 'aws:network:disrupt-connectivity',
    whatToObserve:
      'Error rate and latency for user-facing requests, whether traffic shifts to the surviving AZ(s), and whether the guardrail alarm fires before user impact does.',
  },
  {
    id: 'single-az-db',
    label: 'Single-AZ database reboot/failover',
    hypothesis: 'Does the application recover automatically when its primary database instance reboots?',
    actionId: 'aws:rds:reboot-db-instances',
    whatToObserve: 'Connection-pool reconnect behavior, read/write error rate during the reboot, and total time to full recovery.',
  },
  {
    id: 'single-instance',
    label: 'Single instance stop',
    hypothesis: 'Does the application stay available when one instance behind the load balancer stops?',
    actionId: 'aws:ec2:stop-instances',
    whatToObserve:
      'Whether the load balancer/orchestrator detects the stopped instance and routes around it, and whether in-flight requests fail gracefully or are dropped.',
  },
]

export function getFisScenario(id: FisScenarioId): FisScenarioDefinition {
  const scenario = FIS_SCENARIOS.find((s) => s.id === id)
  if (!scenario) throw new Error(`Unknown FIS scenario id: ${id}`)
  return scenario
}

/** Picks single-az-db for data-tier vendors (RDS/Aurora/DynamoDB/etc.), single-instance for
 * everything else — the two per-vendor scenario types from the table above. */
export function fisScenarioForVendorTier(tier: string): FisScenarioDefinition {
  return tier === 'data' ? getFisScenario('single-az-db') : getFisScenario('single-instance')
}
