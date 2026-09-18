import { useMemo, useState } from 'react'
import type { AnalyzePrResponse, SimulateResponse, StatusResponse } from '../lib/api'
import { ApiError, fetchRunbook, fetchStatus, simulate } from '../lib/api'
import { buildAdjacencyMap, getBlastRadius } from '../lib/graph'
import type { ConcentrationResult, CriticalityResult, GraphData, Runbook, Vendor, VendorGraph } from '../lib/types'
import type { HealthSummary } from './TopBar'
import TopBar from './TopBar'
import GraphView from './GraphView'
import VendorGraphView from './VendorGraphView'
import SidePanel from './SidePanel'
import PrSummaryPanel from './PrSummaryPanel'
import VendorDetailPanel from './VendorDetailPanel'
import SystemOverview from './SystemOverview'
import ConcentrationPanel from './ConcentrationPanel'
import AvailabilityPanel from './AvailabilityPanel'
import CriticalityPanel from './CriticalityPanel'
import LiveStatusPanel from './LiveStatusPanel'
import RunbookPanel from './RunbookPanel'
import StatTile from './ui/StatTile'

export interface AnalyzedRepo {
  graph: GraphData
  vendors: Vendor[]
  vendorGraph: VendorGraph
  concentration: ConcentrationResult
  criticality: CriticalityResult
  meta: {
    owner: string
    repo: string
    branch: string
    truncated: boolean
    filesScanned: number
    importResolution: { total: number; resolved: number }
  } | null
  /** Only set for a real repo scan — required to call /simulate, /status, /runbook. */
  repoUrl: string | null
}

interface WorkspaceProps {
  analyzed: AnalyzedRepo
  prResult: AnalyzePrResponse | null
  onReset: () => void
  onClearPr: () => void
}

type View = 'graph' | 'overview'
type GraphMode = 'vendors' | 'files'

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function Workspace({ analyzed, prResult, onReset, onClearPr }: WorkspaceProps) {
  const hasVendorData = analyzed.repoUrl !== null
  const [view, setView] = useState<View>('graph')
  const [graphMode, setGraphMode] = useState<GraphMode>(hasVendorData ? 'vendors' : 'files')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedVendorKey, setSelectedVendorKey] = useState<string | null>(null)
  const [vendorFileHighlight, setVendorFileHighlight] = useState<{
    directFiles: string[]
    affectedFiles: string[]
  } | null>(null)

  const [simulation, setSimulation] = useState<SimulateResponse | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState<string | null>(null)

  const [statusResult, setStatusResult] = useState<StatusResponse | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [runbook, setRunbook] = useState<Runbook | null>(null)
  const [isLoadingRunbook, setIsLoadingRunbook] = useState(false)
  const [runbookError, setRunbookError] = useState<string | null>(null)

  const adjacencyMap = useMemo(
    () => buildAdjacencyMap(analyzed.graph.nodes, analyzed.graph.edges),
    [analyzed.graph],
  )
  const nodesById = useMemo(() => new Map(analyzed.graph.nodes.map((n) => [n.id, n])), [analyzed.graph])
  const vendorNameByKey = useMemo(
    () => new Map(analyzed.vendors.map((v) => [v.key, v.vendor])),
    [analyzed.vendors],
  )

  const isPrMode = prResult !== null && selectedNodeId === null && vendorFileHighlight === null
  const selectedNode = selectedNodeId ? (nodesById.get(selectedNodeId) ?? null) : null
  const blastRadius = useMemo(
    () => (selectedNodeId ? getBlastRadius(selectedNodeId, adjacencyMap) : null),
    [selectedNodeId, adjacencyMap],
  )
  const selectedVendor = selectedVendorKey
    ? (analyzed.vendorGraph.vendors.find((v) => v.key === selectedVendorKey) ?? null)
    : null

  const criticalVendorKeys = useMemo(() => {
    const articulationSet = new Set(analyzed.criticality.articulationPoints)
    return new Set(
      analyzed.vendorGraph.vendors
        .filter((v) => v.affectedFiles.some((f) => articulationSet.has(f)))
        .map((v) => v.key),
    )
  }, [analyzed.vendorGraph, analyzed.criticality])

  const failedVendorKeys = useMemo(
    () => (simulation?.scenario ? new Set(simulation.scenario.affectedVendors.map((v) => v.key)) : undefined),
    [simulation],
  )

  const healthSummary: HealthSummary = useMemo(() => {
    if (!statusResult) return 'unknown'
    const degraded = statusResult.vendorStatuses.some((s) => s.indicator === 'degraded' || s.indicator === 'outage')
    return degraded ? 'degraded' : 'healthy'
  }, [statusResult])

  function handleSelectVendor(key: string | null) {
    setSelectedVendorKey(key)
    setRunbook(null)
    setRunbookError(null)
  }

  function handleViewAffectedFiles() {
    if (!selectedVendor) return
    setGraphMode('files')
    setSelectedNodeId(null)
    onClearPr()
    setVendorFileHighlight({ directFiles: selectedVendor.directFiles, affectedFiles: selectedVendor.affectedFiles })
  }

  function handleNodeClick(nodeId: string) {
    setVendorFileHighlight(null)
    onClearPr()
    setSelectedNodeId(nodeId)
  }

  function handleSelectFromOverview(nodeId: string) {
    setVendorFileHighlight(null)
    onClearPr()
    setSelectedNodeId(nodeId)
    setGraphMode('files')
    setView('graph')
  }

  async function handleSimulateScenario(scenarioId: string) {
    if (!analyzed.repoUrl) return
    setIsSimulating(true)
    setSimulationError(null)
    try {
      const result = await simulate({ repoUrl: analyzed.repoUrl, scenarioId })
      setSimulation(result)
      setGraphMode('vendors')
      setSelectedVendorKey(null)
    } catch (err) {
      setSimulationError(apiErrorMessage(err, 'Could not run the simulation.'))
    } finally {
      setIsSimulating(false)
    }
  }

  async function handleRunBaseline() {
    if (!analyzed.repoUrl) return
    setIsSimulating(true)
    setSimulationError(null)
    try {
      const result = await simulate({ repoUrl: analyzed.repoUrl })
      setSimulation(result)
    } catch (err) {
      setSimulationError(apiErrorMessage(err, 'Could not run the simulation.'))
    } finally {
      setIsSimulating(false)
    }
  }

  async function handleRefreshStatus() {
    if (!analyzed.repoUrl) return
    setIsLoadingStatus(true)
    setStatusError(null)
    try {
      setStatusResult(await fetchStatus(analyzed.repoUrl))
    } catch (err) {
      setStatusError(apiErrorMessage(err, 'Could not fetch live status.'))
    } finally {
      setIsLoadingStatus(false)
    }
  }

  async function handleGenerateRunbook() {
    if (!analyzed.repoUrl || !selectedVendorKey) return
    setIsLoadingRunbook(true)
    setRunbookError(null)
    try {
      const scenarioLabel = simulation?.scenario?.scenario.label
      setRunbook(await fetchRunbook(analyzed.repoUrl, selectedVendorKey, scenarioLabel))
    } catch (err) {
      setRunbookError(apiErrorMessage(err, 'Could not generate a runbook.'))
    } finally {
      setIsLoadingRunbook(false)
    }
  }

  const repoLabel = analyzed.meta ? `${analyzed.meta.owner}/${analyzed.meta.repo}` : null
  const mostConcentrated = analyzed.concentration.mostConcentrated

  // Only shown when there's real internal-import data to report — never fabricated for a
  // manual-JSON/PR-mode graph (meta is null there) or a repo with zero internal imports found.
  const importResolutionBadge = (() => {
    const stats = analyzed.meta?.importResolution
    if (!stats || stats.total === 0) return null
    const pct = Math.round((stats.resolved / stats.total) * 100)
    const color = pct >= 90 ? 'var(--status-good)' : pct >= 60 ? 'var(--status-warning)' : 'var(--status-critical)'
    return { label: `${pct}% of internal imports resolved`, color }
  })()

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        repoLabel={repoLabel}
        branch={analyzed.meta?.branch ?? null}
        hasVendorData={hasVendorData}
        healthSummary={healthSummary}
        isSimulating={isSimulating}
        onSimulate={handleSimulateScenario}
        onReset={onReset}
      />

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          {analyzed.meta?.truncated && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              <span aria-hidden="true">⚠</span>
              <span>
                Scan stopped early (file-count or time budget) — only {analyzed.meta.filesScanned} file(s) were
                fetched. Results below reflect a partial scan, not the whole repo.
              </span>
            </div>
          )}
          {hasVendorData && (
            <div className="flex flex-wrap gap-3">
              <StatTile label="Vendors" value={analyzed.vendors.length} />
              <StatTile label="Substrates" value={analyzed.concentration.substrateCount} />
              <StatTile
                label="Correlated exposure"
                value={mostConcentrated?.vendorKeys.length ?? 0}
                hint={mostConcentrated ? `on ${mostConcentrated.substrate}` : undefined}
              />
              {simulation && (
                <StatTile
                  label="Effective availability"
                  value={simulation.simulation.correlatedAvailability * 100}
                  format={(n) => `${n.toFixed(2)}%`}
                  tone="accent"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {hasVendorData && (
              <button
                type="button"
                onClick={() => {
                  setView('graph')
                  setGraphMode('vendors')
                }}
                className={`rounded-md border px-2.5 py-1 font-medium ${graphMode === 'vendors' && view === 'graph' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                Vendor graph
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setView('graph')
                setGraphMode('files')
              }}
              className={`rounded-md border px-2.5 py-1 font-medium ${graphMode === 'files' && view === 'graph' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              File graph
            </button>
            <button
              type="button"
              onClick={() => setView('overview')}
              className={`rounded-md border px-2.5 py-1 font-medium ${view === 'overview' ? 'border-[var(--accent)] text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              System overview
            </button>
            {graphMode === 'files' && view === 'graph' && importResolutionBadge && (
              <span
                className="ml-auto flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-[var(--text-secondary)]"
                title={`${analyzed.meta?.importResolution.resolved} of ${analyzed.meta?.importResolution.total} internal imports resolved to a known file`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: importResolutionBadge.color }}
                  aria-hidden="true"
                />
                {importResolutionBadge.label}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
            {view === 'overview' ? (
              <SystemOverview graphData={analyzed.graph} adjacencyMap={adjacencyMap} onSelectNode={handleSelectFromOverview} />
            ) : graphMode === 'vendors' ? (
              <VendorGraphView
                vendorGraph={analyzed.vendorGraph}
                selectedVendorKey={selectedVendorKey}
                onSelectVendor={handleSelectVendor}
                criticalVendorKeys={criticalVendorKeys}
                failedVendorKeys={failedVendorKeys}
              />
            ) : (
              <GraphView
                graphData={analyzed.graph}
                selectedNodeId={selectedNodeId}
                blastRadius={blastRadius}
                onNodeClick={handleNodeClick}
                highlightedNodeIds={
                  isPrMode
                    ? prResult!.changedNodes.map((n) => n.id)
                    : (vendorFileHighlight?.directFiles ?? undefined)
                }
                combinedBlastRadius={
                  isPrMode
                    ? prResult!.combinedBlastRadius
                    : vendorFileHighlight
                      ? {
                          downstream: vendorFileHighlight.affectedFiles.filter(
                            (f) => !vendorFileHighlight.directFiles.includes(f),
                          ),
                          upstream: [],
                        }
                      : undefined
                }
              />
            )}
          </div>
        </main>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-[var(--border-subtle)] p-4 lg:h-full lg:w-[380px] lg:border-t-0 lg:border-l">
          {isPrMode && prResult ? (
            <PrSummaryPanel result={prResult} onClear={onClearPr} />
          ) : selectedNode && blastRadius ? (
            <SidePanel selectedNode={selectedNode} blastRadius={blastRadius} nodesById={nodesById} onClear={() => setSelectedNodeId(null)} />
          ) : selectedVendor ? (
            <VendorDetailPanel vendor={selectedVendor} onViewFiles={handleViewAffectedFiles} onClear={() => handleSelectVendor(null)} />
          ) : (
            <div className="panel-glass animate-rise-in rounded-xl p-4 text-sm text-[var(--text-muted)]">
              {graphMode === 'vendors'
                ? 'Click a vendor node to see its blast radius, detection provenance, and remediation options.'
                : 'Click a file node to see its upstream/downstream blast radius.'}
            </div>
          )}

          <ConcentrationPanel concentration={analyzed.concentration} />
          <CriticalityPanel criticality={analyzed.criticality} onSelectFile={handleNodeClick} />

          {hasVendorData && (
            <>
              <AvailabilityPanel
                simulation={simulation}
                isLoading={isSimulating}
                error={simulationError}
                onRun={handleRunBaseline}
              />
              <LiveStatusPanel
                vendorStatuses={statusResult?.vendorStatuses ?? null}
                awsHealth={statusResult?.awsHealth ?? null}
                isLoading={isLoadingStatus}
                error={statusError}
                onRefresh={handleRefreshStatus}
                vendorNameByKey={vendorNameByKey}
              />
              <RunbookPanel
                vendorName={selectedVendor?.vendor ?? null}
                runbook={runbook}
                isLoading={isLoadingRunbook}
                error={runbookError}
                onGenerate={handleGenerateRunbook}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default Workspace
