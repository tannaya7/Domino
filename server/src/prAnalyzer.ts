import { buildAdjacencyMap, getBlastRadius } from '../../src/lib/graph'
import { getRiskLevel } from '../../src/lib/risk'
import type { GraphData } from '../../src/lib/types'
import { getCachedGraph, setCachedGraph } from './cache'
import { getPullRequest, getPullRequestFiles, parsePrUrl } from './github'
import { analyzeRepo } from './repoParser'

export interface ChangedNode {
  id: string
  label: string
  type: string
  blastRadiusCount: number
}

export interface AnalyzePrResult {
  owner: string
  repo: string
  branch: string
  prNumber: number
  graph: GraphData
  changedNodes: ChangedNode[]
  unmatchedFiles: string[]
  combinedBlastRadius: {
    downstream: string[]
    upstream: string[]
    totalCount: number
  }
  highestRisk: { nodeId: string; label: string; count: number; risk: string } | null
}

export async function analyzePr(prUrl: string): Promise<AnalyzePrResult> {
  const { owner, repo, prNumber } = parsePrUrl(prUrl)
  const pr = await getPullRequest(owner, repo, prNumber)
  const base = pr.base

  const repoCacheKey = `${base.owner}/${base.repo}`
  const cached = getCachedGraph(repoCacheKey)
  const repoResult = cached ?? (await analyzeRepo(`https://github.com/${base.owner}/${base.repo}`, base.ref))
  if (!cached) setCachedGraph(repoCacheKey, repoResult)

  const graph = repoResult.graph
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const adjacencyMap = buildAdjacencyMap(graph.nodes, graph.edges)

  const prFiles = await getPullRequestFiles(owner, repo, prNumber)
  const changedNodes: ChangedNode[] = []
  const unmatchedFiles: string[] = []

  for (const file of prFiles) {
    const node = nodesById.get(file.filename)
    if (!node) {
      unmatchedFiles.push(file.filename)
      continue
    }
    const radius = getBlastRadius(node.id, adjacencyMap)
    changedNodes.push({ id: node.id, label: node.label, type: node.type, blastRadiusCount: radius.totalCount })
  }

  const changedIds = new Set(changedNodes.map((n) => n.id))
  const combinedDownstream = new Set<string>()
  const combinedUpstream = new Set<string>()

  for (const node of changedNodes) {
    const radius = getBlastRadius(node.id, adjacencyMap)
    for (const id of radius.downstream) if (!changedIds.has(id)) combinedDownstream.add(id)
    for (const id of radius.upstream) if (!changedIds.has(id)) combinedUpstream.add(id)
  }

  const totalAffected = new Set([...combinedDownstream, ...combinedUpstream])

  const highestRiskNode = changedNodes.reduce<ChangedNode | null>(
    (max, node) => (!max || node.blastRadiusCount > max.blastRadiusCount ? node : max),
    null,
  )

  return {
    owner: base.owner,
    repo: base.repo,
    branch: base.ref,
    prNumber,
    graph,
    changedNodes,
    unmatchedFiles,
    combinedBlastRadius: {
      downstream: [...combinedDownstream],
      upstream: [...combinedUpstream],
      totalCount: totalAffected.size,
    },
    highestRisk: highestRiskNode
      ? {
          nodeId: highestRiskNode.id,
          label: highestRiskNode.label,
          count: highestRiskNode.blastRadiusCount,
          risk: getRiskLevel(highestRiskNode.blastRadiusCount),
        }
      : null,
  }
}
