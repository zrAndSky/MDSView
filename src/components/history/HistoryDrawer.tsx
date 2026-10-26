import { useState } from 'react'
import { X } from 'lucide-react'
import {
  classifyDiffLine,
  fileBaseName,
  formatHistoryBytes,
  formatHistoryTime,
} from '../../domain/historyFormat'
import type { GitHistoryController } from '../../hooks/useGitHistory'
import type { Translation } from '../../i18n'
import type { GitCleanResult, GitHistoryEntry } from '../../platform/gitHistory'

const DAY_SECONDS = 24 * 60 * 60

type HistoryDrawerProps = {
  isOpen: boolean
  path: string | null
  t: Translation
  history: GitHistoryController
  onClose: () => void
}

export function HistoryDrawer({ isOpen, path, t, history, onClose }: HistoryDrawerProps) {
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rangeDays, setRangeDays] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cleanResult, setCleanResult] = useState<GitCleanResult | null>(null)

  if (!isOpen) {
    return null
  }

  const entries = history.entries
  const sizeLabel = history.size ? formatHistoryBytes(history.size.bytes) : formatHistoryBytes(0)
  const diffLines = history.diff ? history.diff.split('\n') : []

  function selectEntry(entry: GitHistoryEntry) {
    setConfirmRestore(false)
    void history.loadDiff(entry.sha, 'previous')
  }

  function selectCurrent() {
    if (!history.latestSha) {
      return
    }
    setConfirmRestore(false)
    void history.loadDiff(history.latestSha, 'current')
  }

  function startCleaning() {
    setIsCleaning(true)
    setSelected(new Set())
    setRangeDays(0)
    setConfirmDelete(false)
    setCleanResult(null)
    history.clearResult()
  }

  function stopCleaning() {
    setIsCleaning(false)
    setSelected(new Set())
    setConfirmDelete(false)
  }

  function applyRange(days: number) {
    setRangeDays(days)
    setConfirmDelete(false)
    if (days <= 0) {
      setSelected(new Set())
      return
    }
    const cutoff = Date.now() / 1000 - days * DAY_SECONDS
    setSelected(new Set(entries.filter((entry) => entry.time < cutoff).map((entry) => entry.sha)))
  }

  function toggleEntry(sha: string) {
    setConfirmDelete(false)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(sha)) {
        next.delete(sha)
      } else {
        next.add(sha)
      }
      return next
    })
  }

  async function deleteSelected() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    const result = await history.clean([...selected])
    setConfirmDelete(false)
    if (result) {
      setCleanResult(result)
      setIsCleaning(false)
      setSelected(new Set())
    }
  }

  function message(): string | null {
    if (history.error) {
      return history.error
    }
    if (cleanResult) {
      return `${t.historyCleanDone(cleanResult.removed)}${cleanResult.gcOk ? '' : ` ${t.historyCleanGcWarning}`}`
    }
    switch (history.result) {
      case 'snapshot': return t.historySnapshotDone
      case 'held': return t.historySnapshotHeld
      case 'unchanged': return t.historySnapshotUnchanged
      case 'conflict': return t.historyConflict
      case 'restored': return t.historyRestoreDone
      default: return null
    }
  }

  const status = message()

  return (
    <aside className="history-drawer" aria-label={t.historyTitle}>
      <header className="history-header">
        <div className="history-heading">
          <h2>{t.historyTitle}</h2>
          <p title={path ?? undefined}>{fileBaseName(path)}</p>
        </div>
        <button type="button" className="history-close" onClick={onClose} aria-label={t.historyClose}>
          <X aria-hidden="true" />
        </button>
      </header>

      {!path ? (
        <p className="history-hint">{t.historyEmpty}</p>
      ) : history.isLoading ? (
        <p className="history-hint">{t.historyLoading}</p>
      ) : !history.repoRoot ? (
        <p className="history-hint">{t.historyNoRepo}</p>
      ) : (
        <>
          <div className="history-toolbar">
            <button type="button" className="history-action" disabled={history.isBusy} onClick={() => void history.snapshotNow()}>
              {t.historySnapshotNow}
            </button>
            <button type="button" className="history-action" disabled={history.isLoading || history.isBusy} onClick={() => void history.refresh()}>
              {t.historyRefresh}
            </button>
            <span className="history-toolbar-size">{history.repoRoot}</span>
          </div>

          {status ? (
            <p className={`history-status${history.error ? ' error' : ''}`}>{status}</p>
          ) : null}

          {isCleaning ? (
            <div className="history-cleanup">
              <h3>{t.historyCleanTitle}</h3>
              <p className="history-hint">{t.historyCleanHint}</p>
              <div className="history-cleanup-range">
                <label>
                  {t.historyCleanBefore}
                  <select value={rangeDays} onChange={(event) => applyRange(Number(event.currentTarget.value))}>
                    <option value={0}>{t.historyCleanNone}</option>
                    <option value={7}>{t.historyCleanDays(7)}</option>
                    <option value={30}>{t.historyCleanDays(30)}</option>
                    <option value={90}>{t.historyCleanDays(90)}</option>
                  </select>
                </label>
                <button type="button" className="history-action" onClick={() => setSelected(new Set(entries.map((entry) => entry.sha)))}>
                  {t.historySelectAll}
                </button>
                <button type="button" className="history-action" onClick={() => { setSelected(new Set()); setConfirmDelete(false) }}>
                  {t.historyClearSelection}
                </button>
              </div>
              <ul className="history-clean-list">
                {entries.map((entry) => (
                  <li key={entry.sha}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.sha)}
                        onChange={() => toggleEntry(entry.sha)}
                      />
                      <span>{formatHistoryTime(entry.time)}</span>
                      <span className="history-entry-lines">{t.historyLines(entry.additions, entry.deletions)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="history-cleanup-actions">
                <button type="button" className="history-action" onClick={stopCleaning}>{t.cancelAction}</button>
                <button
                  type="button"
                  className="history-action danger"
                  disabled={selected.size === 0 || history.isBusy}
                  onClick={() => void deleteSelected()}
                >
                  {confirmDelete ? t.historyCleanConfirm(selected.size) : t.historyCleanSelected(selected.size)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="history-list">
                {history.workingDirty && history.latestSha ? (
                  <li>
                    <button type="button" className="history-entry current" onClick={selectCurrent}>
                      <span className="history-entry-time">{t.historyCurrent}</span>
                      <span className="history-entry-lines">{t.historyDiffCurrent}</span>
                    </button>
                  </li>
                ) : null}
                {entries.map((entry) => (
                  <li key={entry.sha}>
                    <button
                      type="button"
                      className={`history-entry${history.selectedSha === entry.sha ? ' active' : ''}`}
                      onClick={() => selectEntry(entry)}
                    >
                      <span className="history-entry-time">{formatHistoryTime(entry.time)}</span>
                      <span className="history-entry-lines">{t.historyLines(entry.additions, entry.deletions)}</span>
                    </button>
                  </li>
                ))}
                {entries.length === 0 && !history.workingDirty ? (
                  <li className="history-hint">{t.historyEmpty}</li>
                ) : null}
              </ul>

              {history.selectedSha ? (
                <div className="history-diff">
                  <div className="history-diff-toolbar">
                    <button
                      type="button"
                      className={`history-action${history.diffMode === 'previous' ? ' active' : ''}`}
                      onClick={() => void history.loadDiff(history.selectedSha!, 'previous')}
                    >
                      {t.historyDiffPrevious}
                    </button>
                    <button
                      type="button"
                      className={`history-action${history.diffMode === 'current' ? ' active' : ''}`}
                      onClick={() => void history.loadDiff(history.selectedSha!, 'current')}
                    >
                      {t.historyDiffCurrent}
                    </button>
                    <button
                      type="button"
                      className={`history-action restore${confirmRestore ? ' danger' : ''}`}
                      disabled={history.isBusy}
                      onClick={() => {
                        if (confirmRestore) {
                          setConfirmRestore(false)
                          void history.restore(history.selectedSha!)
                        } else {
                          setConfirmRestore(true)
                        }
                      }}
                    >
                      {confirmRestore ? t.historyRestoreConfirm : t.historyRestore}
                    </button>
                  </div>
                  {diffLines.length > 0 ? (
                    <pre className="history-diff-body">
                      {diffLines.map((line, index) => (
                        <span key={index} className={`diff-${classifyDiffLine(line)}`}>{line}{'\n'}</span>
                      ))}
                    </pre>
                  ) : (
                    <p className="history-hint">{t.historyNoDiff}</p>
                  )}
                </div>
              ) : null}

              <footer className="history-footer">
                <span>{t.historySize(entries.length, sizeLabel)}</span>
                <button type="button" className="history-action" onClick={startCleaning} disabled={entries.length === 0}>
                  {t.historyClean}
                </button>
              </footer>
            </>
          )}
        </>
      )}
    </aside>
  )
}
