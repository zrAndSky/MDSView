import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GitHistoryAccess } from '../platform/gitHistory'
import { useGitHistory } from './useGitHistory'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function createAccess(overrides: Partial<GitHistoryAccess> = {}): GitHistoryAccess {
  return {
    repoRoot: vi.fn(async () => 'D:/repo'),
    list: vi.fn(async () => ({
      repoRoot: 'D:/repo',
      entries: [{ sha: SHA_A, time: 100, subject: 'autosave', additions: 2, deletions: 1 }],
      latestSha: SHA_A,
      workingDirty: true,
    })),
    diff: vi.fn(async () => '@@ -1 +1 @@\n-old\n+new'),
    snapshot: vi.fn(async () => ({ status: 'snapshot' as const, sha: SHA_B, lines: 3 })),
    restore: vi.fn(async () => undefined),
    size: vi.fn(async () => ({ snapshots: 3, bytes: 2048 })),
    clean: vi.fn(async () => ({ removed: 1, snapshots: 2, bytes: 1024, gcOk: true })),
    ...overrides,
  }
}

function renderHistory(access: GitHistoryAccess, isOpen = true) {
  return renderHook(() => useGitHistory({
    path: 'D:\\repo\\a.md',
    isOpen,
    access,
    onRestored: vi.fn(),
    prepareRestore: vi.fn(async () => true),
  }))
}

describe('useGitHistory', () => {
  it('loads entries and size when opened inside a repository', async () => {
    const access = createAccess()
    const { result } = renderHistory(access)

    await waitFor(() => expect(result.current.repoRoot).toBe('D:/repo'))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.latestSha).toBe(SHA_A)
    expect(result.current.workingDirty).toBe(true)
    expect(result.current.size).toEqual({ snapshots: 3, bytes: 2048 })
  })

  it('reports files outside a repository without loading history', async () => {
    const list = vi.fn()
    const access = createAccess({ repoRoot: vi.fn(async () => null), list })
    const { result } = renderHistory(access)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.repoRoot).toBeNull()
    expect(result.current.entries).toEqual([])
    expect(list).not.toHaveBeenCalled()
  })

  it('loads a diff for the selected snapshot', async () => {
    const access = createAccess()
    const { result } = renderHistory(access)
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    await act(async () => {
      await result.current.loadDiff(SHA_A, 'current')
    })

    expect(result.current.selectedSha).toBe(SHA_A)
    expect(result.current.diffMode).toBe('current')
    expect(result.current.diff).toContain('+new')
    expect(access.diff).toHaveBeenCalledWith('D:\\repo\\a.md', SHA_A, 'current')
  })

  it('prepares and restores a snapshot then calls onRestored', async () => {
    const access = createAccess()
    const onRestored = vi.fn()
    const prepareRestore = vi.fn(async () => true)
    const { result } = renderHook(() => useGitHistory({
      path: 'D:\\repo\\a.md',
      isOpen: true,
      access,
      onRestored,
      prepareRestore,
    }))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    await act(async () => {
      await result.current.restore(SHA_A)
    })

    expect(prepareRestore).toHaveBeenCalledTimes(1)
    expect(access.restore).toHaveBeenCalledWith('D:\\repo\\a.md', SHA_A)
    expect(onRestored).toHaveBeenCalledTimes(1)
    expect(result.current.result).toBe('restored')
  })

  it('cleans selected snapshots and refreshes the list', async () => {
    const access = createAccess()
    const { result } = renderHistory(access)
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    let cleaned = null
    await act(async () => {
      cleaned = await result.current.clean([SHA_A])
    })

    expect(access.clean).toHaveBeenCalledWith('D:\\repo\\a.md', [SHA_A])
    expect(cleaned).toEqual({ removed: 1, snapshots: 2, bytes: 1024, gcOk: true })
    expect(result.current.result).toBe('cleaned')
    expect(access.list).toHaveBeenCalledTimes(2)
  })
})
