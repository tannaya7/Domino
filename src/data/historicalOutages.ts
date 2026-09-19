// Curated, real outages used to power "Replay a real outage" scenarios. Every duration here is
// read directly from the provider's own postmortem/status page (verified this session via the
// URLs in sourceUrl) — never estimated or invented. If a future entry can't be verified against a
// primary source, set verified:false and leave a TODO instead of guessing a number.

export interface HistoricalOutage {
  id: string
  name: string
  /** ISO date (yyyy-mm-dd) the outage began. */
  date: string
  substrate: string
  scope: 'regional' | 'global'
  severity: 'degraded' | 'outage'
  approxDurationHours: number
  /** One line, plain English, no invented specifics beyond what the postmortem states. */
  summary: string
  sourceUrl: string
  verified: boolean
}

export const HISTORICAL_OUTAGES: HistoricalOutage[] = [
  {
    id: 'aws-us-east-1-2025-10-20',
    name: 'AWS US-EAST-1 DynamoDB DNS outage',
    date: '2025-10-20',
    substrate: 'aws',
    scope: 'regional',
    severity: 'outage',
    // AWS's own post-event summary: "11:48 PM PDT on October 19" to "2:20 PM PDT on October 20" = 14h32m.
    approxDurationHours: 14.53,
    summary:
      'A DNS race condition in DynamoDB’s internal DNS management system cascaded into EC2, Lambda, and Network Load Balancer failures across US-EAST-1.',
    sourceUrl: 'https://aws.amazon.com/message/101925',
    verified: true,
  },
  {
    id: 'gcp-global-2025-06-12',
    name: 'Google Cloud Service Control outage',
    date: '2025-06-12',
    substrate: 'gcp',
    scope: 'global',
    severity: 'outage',
    // Google's own full incident report: started "2025-06-12 10:51" and "ended at 2025-06-12
    // 18:18" (Pacific) — most regions were mitigated within 3 hours, but us-central1's restart
    // herd effect pushed full resolution to 18:18. We use the full-resolution duration (7h27m)
    // since that's when the incident was actually closed, consistent with how the other three
    // entries measure "until fully restored" rather than "until most traffic recovered".
    approxDurationHours: 7.45,
    summary:
      'A null-pointer bug in Service Control, triggered by a policy change with blank fields, crashed the binary in every region; most regions recovered within 3 hours, but a Spanner restart storm delayed full recovery in us-central1.',
    sourceUrl: 'https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW',
    verified: true,
  },
  {
    id: 'azure-front-door-2025-10-29',
    name: 'Azure Front Door configuration outage',
    date: '2025-10-29',
    substrate: 'azure',
    scope: 'global',
    severity: 'outage',
    // Microsoft's own Post Incident Review (tracking ID YKYN-BWZ): "15:41 UTC on 29 October" to
    // "00:05 UTC on 30 October 2025" = 8h24m.
    approxDurationHours: 8.4,
    summary:
      'An inadvertent configuration change, allowed through a defect in Azure Front Door’s deployment safety systems, deployed globally and caused widespread timeouts and DNS resolution failures.',
    sourceUrl: 'https://azure.status.microsoft/en-us/status/history/?trackingId=YKYN-BWZ',
    verified: true,
  },
  {
    id: 'cloudflare-global-2025-11-18',
    name: 'Cloudflare Bot Management outage',
    date: '2025-11-18',
    substrate: 'cloudflare',
    scope: 'global',
    severity: 'outage',
    // Cloudflare's own blog postmortem: "11:20 UTC" to "17:06 UTC" on 18 November 2025 = 5h46m.
    approxDurationHours: 5.77,
    summary:
      'A permissions change caused a Bot Management "feature file" to double in size with malformed data; propagated to the whole network, it crashed the proxy software handling core HTTP traffic.',
    sourceUrl: 'https://blog.cloudflare.com/18-november-2025-outage/',
    verified: true,
  },
]

/** Historical outage ids are namespaced `replay:<id>` when used as a FailureScenario.id (see
 * src/lib/availability.ts HISTORICAL_REPLAY_SCENARIOS) — this reverses that to find the source
 * record for display (postmortem link, real duration, verified flag). Returns null for anything
 * that isn't a replay scenario id, including undefined/empty. */
export function outageForReplayScenarioId(scenarioId: string | null | undefined): HistoricalOutage | null {
  if (!scenarioId || !scenarioId.startsWith('replay:')) return null
  const outageId = scenarioId.slice('replay:'.length)
  return HISTORICAL_OUTAGES.find((o) => o.id === outageId) ?? null
}
