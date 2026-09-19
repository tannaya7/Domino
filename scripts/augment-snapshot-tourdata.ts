/**
 * One-off: adds topRecommendedMove/topRecommendedMoveWhatIf to an EXISTING snapshot file without
 * re-scanning GitHub — those two fields depend only on the snapshot's own `vendors` array (already
 * on disk), so recomputing them from a fresh full scan risks a thinner file graph purely from
 * scan-budget/network variance, for no benefit (see scripts/snapshot-repo.ts for the real
 * from-scratch generator, which computes these same two fields for any NEW snapshot).
 *
 * Usage: tsx scripts/augment-snapshot-tourdata.ts public/demo/<file>.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { defaultCostPerHour } from '../src/lib/currency'
import { computeWhatIf, rankRecommendedMoves } from '../server/src/whatIf'
import type { DemoSnapshot } from '../src/lib/demoSnapshot'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: tsx scripts/augment-snapshot-tourdata.ts <path-to-snapshot.json>')
    process.exit(1)
  }

  const raw = await readFile(filePath, 'utf-8')
  const snapshot = JSON.parse(raw) as DemoSnapshot

  const assumptions = { costPerHourOfDowntime: defaultCostPerHour('USD'), vendorSlaOverrides: {}, substrateOutageProbabilities: {} }
  const recommendedMoves = rankRecommendedMoves(snapshot.vendors, assumptions)
  const topRecommendedMove = recommendedMoves[0]
  const topRecommendedMoveWhatIf = topRecommendedMove
    ? computeWhatIf(
        snapshot.vendors,
        [{ vendorId: topRecommendedMove.vendorId, substrate: topRecommendedMove.substrate, failoverVendorId: topRecommendedMove.failoverVendorId }],
        assumptions,
      )
    : undefined

  const augmented: DemoSnapshot = { ...snapshot, topRecommendedMove, topRecommendedMoveWhatIf }
  await writeFile(filePath, JSON.stringify(augmented, null, 2))

  console.log(`Augmented ${filePath}`)
  console.log(topRecommendedMove ? `  top recommended move: ${topRecommendedMove.description}` : '  no recommended move for this repo')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
