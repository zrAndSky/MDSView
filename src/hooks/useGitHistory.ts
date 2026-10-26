import { useCallback, useEffect, useRef, useState } from 'react'
import {
  tauriGitHistoryAccess,
  type GitHistoryAccess,
  type GitHistoryEntry,
  type GitHistorySize,
  type GitSnapshotResult,
} from '../platform/gitHistory'

export type GitHistoryResult = 'snapshot' | 'held' | 'unchanged' | 'conflict' | 'restored' | 'cleaned' | null
export type DiffMode = 'previous' | 'current'

type UseGitHistoryOptions = {
  path: string | null
  isOpen: boolean
  access?: GitHistoryAccess
  onRestored?: () => void
  prepareRestore?: () => Promise<boolean>
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function useGitHistory({
  path,
  isOpen,
  access = tauriGitHistoryAccess,
  onRestored,
  prepareRestore,
}: UseGitHistoryOptions) {
  const [repoRoot, setRepoRoot] = useState<string | null>(null)
  const [entries, setEntries] = useState<GitHistoryEntry[]>([])
  const [latestSha, setLatestSha] = useState<string | null>(null)
  const [workingDirty, setWorkingDirty] = useState(false)
  const [size, setSize] = useState<GitHistorySize | null>(null)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [diffMode, setDiffMode] = useState<DiffMode>('previous')
  const [isLoading, setIsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GitHistoryResult>(null)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!path) {
      requestRef.current += 1
      setIsLoading(false)
      setError(null)
      setSelectedSha(null)
      setDiff('')
      setRepoRoot(null)
      setEntries([])
      setLatestSha(null)
      setWorkingDirty(false)
      setSize(null)
      return
    }

    const request = requestRef.current + 1
    requestRef.current = request
    setIsLoading(true)
    setError(null)
    try {
      const root = await access.repoRoot(path)
      if (requestRef.current !== request) {
        return
      }
      if (!root) {
        setRepoRoot(null)
        setEntries([])
        setLatestSha(null)
        setWorkingDirty(false)
        setSize(null)
        return
      }

      const [history, usage] = await Promise.all([access.list(path), access.size(path)])
      if (requestRef.current !== request) {
        return
      }
      setRepoRoot(root)
      setEntries(history.entries)
      setLatestSha(history.latestSha)
      setWorkingDirty(history.workingDirty)
      setSize(usage)
      setSelectedSha((current) => (
        current && history.entries.some((entry) => entry.sha === current) ? current : null
      ))
    } catch (caught) {
      if (requestRef.current === request) {
        setError(errorMessage(caught))
      }
    } finally {
      if (requestRef.current === request) {
        setIsLoading(false)
      }
    }
  }, [access, path])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, refresh])

  const loadDiff = useCallback(async (sha: string, mode: DiffMode) => {
    if (!path) {
      return
    }
    setSelectedSha(sha)
    setDiffMode(mode)
    setDiff('')
    setError(null)
    try {
      setDiff(await access.diff(path, sha, mode))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [access, path])

  const snapshotNow = useCallback(async () => {
    if (!path) {
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      const snapshot: GitSnapshotResult = await access.snapshot(path, true)
      setResult(snapshot.status)
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }, [access, path, refresh])

  const snapshotAfterSave = useCallback(async () => {
    if (!path) {
      return
    }
    try {
      await access.snapshot(path, false)
      if (isOpen) {
        await refresh()
      }
    } catch {
      // History must never block saving.
    }
  }, [access, isOpen, path, refresh])

  const restore = useCallback(async (sha: string) => {
    if (!path) {
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      if (prepareRestore) {
        const ready = await prepareRestore()
        if (!ready) {
          return
        }
      }
      await access.restore(path, sha)
      setResult('restored')
      await refresh()
      onRestored?.()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }, [access, onRestored, path, prepareRestore, refresh])

  const clean = useCallback(async (shas: string[]) => {
    if (!path || shas.length === 0) {
      return null
    }
    setIsBusy(true)
    setError(null)
    try {
      const cleaned = await access.clean(path, shas)
      setResult('cleaned')
      await refresh()
      return cleaned
    } catch (caught) {
      setError(errorMessage(caught))
      return null
    } finally {
      setIsBusy(false)
    }
  }, [access, path, refresh])

  const clearResult = useCallback(() => setResult(null), [])

  return {
    repoRoot,
    entries,
    latestSha,
    workingDirty,
    size,
    selectedSha,
    diff,
    diffMode,
    isLoading,
    isBusy,
    error,
    result,
    refresh,
    loadDiff,
    snapshotNow,
    snapshotAfterSave,
    restore,
    clean,
    clearResult,
  }
}

export type GitHistoryController = ReturnType<typeof useGitHistory>
