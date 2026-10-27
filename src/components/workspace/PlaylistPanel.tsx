import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, MoreHorizontal, PanelLeftClose, Plus, RefreshCw, X } from 'lucide-react'
import type { Playlist, PlaylistItem, PlaylistsState } from '../../domain/playlists'
import { normalizeReadingSessionPath, loadReadingSession } from '../../domain/readingSessions'
import type { Translation } from '../../i18n'
import { CreatePlaylistDialog } from '../dialogs/CreatePlaylistDialog'

type PlaylistPanelProps = {
  state: PlaylistsState
  activePlaylist: Playlist | null
  currentPath: string | null
  currentTitle: string
  t: Translation
  onCreate: (name: string, items?: PlaylistItem[]) => void
  onAddDocuments: () => void
  onReload: () => void
  isDropTarget?: boolean
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onAddCurrent: (playlistId: string, item: PlaylistItem) => void
  onRemoveItem: (playlistId: string, path: string) => void
  onMoveItem: (playlistId: string, fromIndex: number, toIndex: number) => void
  onOpenItem: (path: string) => void
  onClose?: () => void
}

export function PlaylistPanel({
  state,
  activePlaylist,
  currentPath,
  currentTitle,
  t,
  onCreate,
  onAddDocuments,
  onReload,
  isDropTarget = false,
  onSelect,
  onRename,
  onDelete,
  onAddCurrent,
  onRemoveItem,
  onMoveItem,
  onOpenItem,
  onClose,
}: PlaylistPanelProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragStateRef = useRef<{ index: number; startY: number; active: boolean } | null>(null)
  const overIndexRef = useRef<number | null>(null)
  const suppressOpenRef = useRef(false)
  const activeId = activePlaylist?.id ?? null
  const items = useMemo(() => activePlaylist?.items ?? [], [activePlaylist])

  const [lastActiveId, setLastActiveId] = useState(activeId)
  if (lastActiveId !== activeId) {
    setLastActiveId(activeId)
    setIsRenaming(false)
    setIsConfirmingDelete(false)
    setIsMenuOpen(false)
    setConfirmRemovePath(null)
    setDragIndex(null)
    setOverIndex(null)
  }

  useEffect(() => {
    if (!confirmRemovePath) {
      return
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-remove-confirm]')) {
        return
      }
      setConfirmRemovePath(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [confirmRemovePath])

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
        setIsConfirmingDelete(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isMenuOpen])

  const resumablePaths = useMemo(
    () => new Set(items.filter((item) => loadReadingSession(item.path)).map((item) => normalizeReadingSessionPath(item.path))),
    [items],
  )
  const currentAlreadyAdded = Boolean(currentPath)
    && items.some((item) => normalizeReadingSessionPath(item.path) === normalizeReadingSessionPath(currentPath!))

  function startRenaming(playlist: Playlist) {
    setDraftName(playlist.name)
    setIsRenaming(true)
    setIsConfirmingDelete(false)
    setIsMenuOpen(false)
  }

  function commitRename() {
    if (!activePlaylist) {
      return
    }
    const name = draftName.trim()
    if (name && name !== activePlaylist.name) {
      onRename(activePlaylist.id, name)
    }
    setIsRenaming(false)
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragStateRef.current
      if (!drag) {
        return
      }
      if (!drag.active) {
        if (Math.abs(event.clientY - drag.startY) < 4) {
          return
        }
        drag.active = true
        setDragIndex(drag.index)
      }
      const rows = [...document.querySelectorAll<HTMLElement>('.playlist-item')]
      let target = drag.index
      rows.forEach((row, index) => {
        const rect = row.getBoundingClientRect()
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          target = index
        }
      })
      if (overIndexRef.current !== target) {
        overIndexRef.current = target
        setOverIndex(target)
      }
    }

    function handlePointerUp() {
      const drag = dragStateRef.current
      if (drag?.active) {
        suppressOpenRef.current = true
        const target = overIndexRef.current
        if (target !== null && target !== drag.index && activePlaylist) {
          onMoveItem(activePlaylist.id, drag.index, target)
        }
      }
      dragStateRef.current = null
      overIndexRef.current = null
      setDragIndex(null)
      setOverIndex(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [activePlaylist, onMoveItem])

  function handleItemPointerDown(event: ReactPointerEvent<HTMLLIElement>, index: number) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.playlist-remove')) {
      return
    }
    overIndexRef.current = null
    dragStateRef.current = { index, startY: event.clientY, active: false }
  }

  return (
    <section className={`playlist-panel${isDropTarget ? ' drop-target' : ''}`} aria-label={t.playlistsTab}>
      <header className="panel-header">
        <h2>{t.playlistsTab}</h2>
        <div className="panel-header-actions">
          <button type="button" className="panel-close" onClick={onReload} aria-label={t.reloadCollections} title={t.reloadCollections}>
            <RefreshCw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="panel-close"
            onClick={() => {
              setIsRenaming(false)
              setIsMenuOpen(false)
              setIsCreating(true)
            }}
            aria-label={t.newPlaylist}
            title={t.newPlaylist}
          >
            <Plus aria-hidden="true" />
          </button>
          {onClose ? (
            <button type="button" className="panel-close" onClick={onClose} aria-label={t.collapseCollections} title={t.collapseCollections}>
              <PanelLeftClose aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      {state.playlists.length === 0 ? (
        <p className="playlist-hint">{t.playlistsEmpty}</p>
      ) : (
        <>
          <ul className="playlist-list" aria-label={t.playlistsTab}>
            {state.playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  className={`playlist-select${playlist.id === activeId ? ' active' : ''}`}
                  aria-pressed={playlist.id === activeId}
                  onClick={() => onSelect(playlist.id)}
                >
                  <span className="playlist-name">{playlist.name}</span>
                  <span className="playlist-count">{playlist.items.length}</span>
                </button>
              </li>
            ))}
          </ul>

          {activePlaylist ? (
            <div className="playlist-detail">
              {isRenaming ? (
                <form
                  className="playlist-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    commitRename()
                  }}
                >
                  <input
                    autoFocus
                    value={draftName}
                    aria-label={t.renamePlaylist}
                    onChange={(event) => setDraftName(event.currentTarget.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setIsRenaming(false)
                      }
                    }}
                  />
                </form>
              ) : (
                <div className="playlist-actions-row">
                  <button
                    type="button"
                    className="playlist-action playlist-add"
                    disabled={!currentPath || currentAlreadyAdded}
                    onClick={() => {
                      if (!currentPath) {
                        return
                      }
                      onAddCurrent(activePlaylist.id, {
                        path: currentPath,
                        title: currentTitle,
                        addedAt: new Date().toISOString(),
                      })
                    }}
                  >
                    {currentAlreadyAdded ? t.alreadyInPlaylist : t.addCurrentFile}
                  </button>
                  <button type="button" className="playlist-action playlist-add-files" onClick={onAddDocuments}>
                    {t.addDocuments}
                  </button>
                  <div className="playlist-more-wrap" ref={menuRef}>
                    <button
                      type="button"
                      className={`playlist-more${isMenuOpen ? ' active' : ''}`}
                      aria-label={t.moreActions}
                      title={t.moreActions}
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => {
                        setIsMenuOpen((open) => !open)
                        setIsConfirmingDelete(false)
                      }}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                    {isMenuOpen ? (
                      <div
                        className="playlist-more-menu"
                        role="menu"
                        aria-label={t.moreActions}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setIsMenuOpen(false)
                            setIsConfirmingDelete(false)
                          }
                        }}
                      >
                        <button type="button" role="menuitem" onClick={() => startRenaming(activePlaylist)}>
                          {t.renamePlaylist}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={isConfirmingDelete ? 'danger' : ''}
                          onClick={() => {
                            if (isConfirmingDelete) {
                              setIsConfirmingDelete(false)
                              setIsMenuOpen(false)
                              onDelete(activePlaylist.id)
                            } else {
                              setIsConfirmingDelete(true)
                            }
                          }}
                        >
                          {isConfirmingDelete ? t.confirmDeletePlaylist : t.deletePlaylist}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <p className="playlist-hint">{t.playlistEmpty}</p>
              ) : (
                <ul className="playlist-items" aria-label={activePlaylist.name}>
                  {items.map((item, index) => {
                    const isResumable = resumablePaths.has(normalizeReadingSessionPath(item.path))
                    return (
                      <li
                        key={item.path}
                        className={[
                          'playlist-item',
                          dragIndex === index ? 'dragging' : '',
                          overIndex === index && dragIndex !== null && dragIndex !== index ? 'drag-over' : '',
                        ].filter(Boolean).join(' ')}
                        onPointerDown={(event) => handleItemPointerDown(event, index)}
                      >
                        <button
                          type="button"
                          className="playlist-item-open"
                          title={item.path}
                          onClick={() => {
                            if (suppressOpenRef.current) {
                              suppressOpenRef.current = false
                              return
                            }
                            onOpenItem(item.path)
                          }}
                        >
                          <span className="playlist-item-title">{item.title}</span>
                          {isResumable ? (
                            <span className="playlist-resume" title={t.resumeReading}>{t.resumeReadingBadge}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className={`playlist-remove${confirmRemovePath === item.path ? ' confirming' : ''}`}
                          data-remove-confirm={confirmRemovePath === item.path ? 'true' : undefined}
                          aria-label={confirmRemovePath === item.path ? `${t.confirmRemoveItem}: ${item.title}` : `${t.removeFromPlaylist}: ${item.title}`}
                          title={confirmRemovePath === item.path ? t.confirmRemoveItem : t.removeFromPlaylist}
                          onClick={() => {
                            if (confirmRemovePath === item.path) {
                              setConfirmRemovePath(null)
                              onRemoveItem(activePlaylist.id, item.path)
                            } else {
                              setConfirmRemovePath(item.path)
                            }
                          }}
                        >
                          {confirmRemovePath === item.path ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}

      {isCreating ? (
        <CreatePlaylistDialog
          defaultName={t.playlistDefaultName(state.playlists.length + 1)}
          currentTitle={currentPath ? currentTitle : null}
          t={t}
          onCancel={() => setIsCreating(false)}
          onCreate={(name, addCurrent) => {
            setIsCreating(false)
            onCreate(name, addCurrent && currentPath
              ? [{ path: currentPath, title: currentTitle, addedAt: new Date().toISOString() }]
              : [])
          }}
        />
      ) : null}
    </section>
  )
}
