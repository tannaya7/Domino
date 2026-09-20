// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RepoInput from './RepoInput'

const { analyzeRepoMock, loadDemoSnapshotMock } = vi.hoisted(() => ({
  analyzeRepoMock: vi.fn(),
  loadDemoSnapshotMock: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, analyzeRepo: analyzeRepoMock }
})

vi.mock('../lib/demoSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/demoSnapshot')>()
  return { ...actual, loadDemoSnapshot: loadDemoSnapshotMock }
})

afterEach(() => cleanup())
beforeEach(() => {
  analyzeRepoMock.mockReset()
  loadDemoSnapshotMock.mockReset()
})

describe('RepoInput', () => {
  it('shows the built-in example cards with their precomputed vendor/substrate counts', () => {
    render(<RepoInput onAnalyzed={vi.fn()} onLoadSample={vi.fn()} onSnapshotLoaded={vi.fn()} />)
    expect(screen.getByText('langfuse/langfuse')).toBeInTheDocument()
    expect(screen.getByText(/10 vendors → 4 substrates/)).toBeInTheDocument()
  })

  it('loads a snapshot on card click, with zero calls to the live analyze-repo endpoint', async () => {
    const onSnapshotLoaded = vi.fn()
    loadDemoSnapshotMock.mockResolvedValue({ owner: 'langfuse', repo: 'langfuse' })
    const user = userEvent.setup()
    render(<RepoInput onAnalyzed={vi.fn()} onLoadSample={vi.fn()} onSnapshotLoaded={onSnapshotLoaded} />)

    await user.click(screen.getByText('langfuse/langfuse'))
    expect(loadDemoSnapshotMock).toHaveBeenCalledWith('/demo/langfuse__langfuse.json')
    expect(onSnapshotLoaded).toHaveBeenCalledWith({ owner: 'langfuse', repo: 'langfuse' })
    expect(analyzeRepoMock).not.toHaveBeenCalled()
  })

  it('on a live-analysis failure, shows the human error message and still offers the examples', async () => {
    const { ApiError } = await import('../lib/api')
    analyzeRepoMock.mockRejectedValue(new ApiError('GitHub API rate limit exceeded. Try again later or set GITHUB_TOKEN.'))
    const user = userEvent.setup()
    render(<RepoInput onAnalyzed={vi.fn()} onLoadSample={vi.fn()} onSnapshotLoaded={vi.fn()} />)

    await user.type(screen.getByLabelText(/github repo url/i), 'https://github.com/owner/repo')
    await user.click(screen.getByRole('button', { name: /^analyze$/i }))

    expect(await screen.findByText(/rate limit exceeded/i)).toBeInTheDocument()
    expect(screen.getByText('langfuse/langfuse')).toBeInTheDocument() // examples still offered
  })

  it('requires a non-empty URL before analyzing', async () => {
    const user = userEvent.setup()
    render(<RepoInput onAnalyzed={vi.fn()} onLoadSample={vi.fn()} onSnapshotLoaded={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^analyze$/i }))
    expect(await screen.findByText(/paste a github repo url first/i)).toBeInTheDocument()
    expect(analyzeRepoMock).not.toHaveBeenCalled()
  })
})
