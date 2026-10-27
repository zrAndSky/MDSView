import { invoke } from '@tauri-apps/api/core'

export type GitHistoryEntry = {
  sha: string
  time: number
  subject: string
  additions: number
  deletions: number
}

export type GitHistoryResponse = {
  repoRoot: string
  entries: GitHistoryEntry[]
  latestSha: string | null
  workingDirty: boolean
}

export type GitSnapshotResult = {
  status: 'snapshot' | 'unchanged' | 'held' | 'conflict'
  sha: string | null
  lines: number
}

export type GitHistorySize = {
  snapshots: number
  bytes: number
}

export type GitCleanResult = {
  removed: number
  snapshots: number
  bytes: number
  gcOk: boolean
}

export type GitHistoryDiff = {
  diff: string
  oldText: string
  newText: string
}

export type GitHistoryAccess = {
  repoRoot: (path: string) => Promise<string | null>
  list: (path: string, limit?: number) => Promise<GitHistoryResponse>
  diff: (path: string, sha: string, mode: 'previous' | 'current') => Promise<GitHistoryDiff>
  snapshot: (path: string, force?: boolean) => Promise<GitSnapshotResult>
  restore: (path: string, sha: string) => Promise<void>
  size: (path: string) => Promise<GitHistorySize>
  clean: (path: string, deleteShas: string[]) => Promise<GitCleanResult>
}

export const tauriGitHistoryAccess: GitHistoryAccess = {
  repoRoot: (path) => invoke<string | null>('git_repo_root', { path }),
  list: (path, limit = 100) => invoke<GitHistoryResponse>('git_history_list', { path, limit }),
  diff: (path, sha, mode) => invoke<GitHistoryDiff>('git_history_diff', { path, sha, mode }),
  snapshot: (path, force = false) => invoke<GitSnapshotResult>('git_snapshot', { path, force }),
  restore: (path, sha) => invoke<void>('git_restore', { path, sha }),
  size: (path) => invoke<GitHistorySize>('git_history_size', { path }),
  clean: (path, deleteShas) => invoke<GitCleanResult>('git_history_clean', { path, delete: deleteShas }),
}
