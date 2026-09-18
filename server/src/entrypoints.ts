import { inferProjectEntrypoints } from '../../src/lib/entrypoints'
import { resolveToKnownPath } from './importParser'

interface ManifestFile {
  path: string
  content: string
}

/** Resolves package.json `main`/`bin` fields to actual tracked files — the one entrypoint signal
 * that needs manifest content rather than a path pattern, so it lives here, not in the shared
 * pure src/lib/entrypoints.ts. */
export function resolveManifestEntrypoints(manifestFiles: ManifestFile[], knownFilePaths: Set<string>): string[] {
  const resolved: string[] = []

  for (const { path, content } of manifestFiles) {
    if (!path.endsWith('package.json')) continue
    let pkg: { main?: unknown; bin?: unknown }
    try {
      pkg = JSON.parse(content)
    } catch {
      continue
    }

    const dir = path.slice(0, path.length - 'package.json'.length).replace(/\/$/, '')
    const candidates: string[] = []
    if (typeof pkg.main === 'string') candidates.push(pkg.main)
    if (typeof pkg.bin === 'string') candidates.push(pkg.bin)
    else if (pkg.bin && typeof pkg.bin === 'object') {
      for (const value of Object.values(pkg.bin as Record<string, unknown>)) {
        if (typeof value === 'string') candidates.push(value)
      }
    }

    for (const relative of candidates) {
      const target = dir ? `${dir}/${relative}` : relative
      const match = resolveToKnownPath(target, knownFilePaths)
      if (match) resolved.push(match)
    }
  }

  return resolved
}

/** Combines the path-pattern entrypoints (Next.js/Vite conventions) with package.json main/bin,
 * deduplicated. Returns [] when the repo matches neither — callers should fall back to the
 * generic structural heuristic in that case, not treat [] as "verified no entrypoints exist". */
export function inferEntrypointsForRepo(
  nodeIds: string[],
  manifestFiles: ManifestFile[],
  knownFilePaths: Set<string>,
): string[] {
  const fromPatterns = inferProjectEntrypoints(nodeIds)
  const fromManifests = resolveManifestEntrypoints(manifestFiles, knownFilePaths)
  return [...new Set([...fromPatterns, ...fromManifests])]
}
