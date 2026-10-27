import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { MoreHorizontal, PanelLeftClose, Plus } from 'lucide-react'
import type { Playlist, PlaylistItem, PlaylistsState } from '../../domain/playlists'
import { normalizeReadingSessionPath, loadReadingSession } from '../../domain/readingSessions'
import type { Translation } from '../../i18n'

type PlaylistPanelProps = {
  state: PlaylistsState
  activePlaylist: Playlist | null
  currentPath: string | null
  currentTitle: string
  t: Translation
  onCreate: (name: string) => void
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
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const activeId = activePlaylist?.id ?? null
  const items = useMemo(() => activePlaylist?.items ?? [], [activePlaylist])

  const [lastActiveId, setLastActiveId] = useState(activeId)
  if (lastActiveId !== activeId) {
    setLastActiveId(activeId)
    setIsRenaming(false)
    setIsConfirmingDelete(false)
    setIsMenuOpen(false)
    setDragIndex(null)
    setOverIndex(null)
  }

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

  function handleDrop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault()
    if (dragIndex !== null && dragIndex !== index && activePlaylist) {
      onMoveItem(activePlaylist.id, dragIndex, index)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <section className="playlist-panel" aria-label={t.playlistsTab}>
      <header className="panel-header">
        <h2>{t.playlistsTab}</h2>
        <div className="panel-header-actions">
          <button
            type="button"
            className="panel-close"
            onClick={() => onCreate(t.playlistDefaultName(state.playlists.length + 1))}
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
                        draggable
                        onDragStart={(event) => {
                          setDragIndex(index)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', item.path)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (overIndex !== index) {
                            setOverIndex(index)
                          }
                        }}
                        onDragLeave={() => setOverIndex((current) => current === index ? null : current)}
                        onDrop={(event) => handleDrop(event, index)}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                      >
                        <button
                          type="button"
                          className="playlist-item-open"
                          title={item.path}
                          onClick={() => onOpenItem(item.path)}
                        >
                          <span className="playlist-item-title">{item.title}</span>
                          {isResumable ? (
                            <span className="playlist-resume" title={t.resumeReading}>{t.resumeReadingBadge}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="playlist-remove"
                          aria-label={`${t.removeFromPlaylist}: ${item.title}`}
                          title={t.removeFromPlaylist}
                          onClick={() => onRemoveItem(activePlaylist.id, item.path)}
                        >
                          ×
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
    </section>
  )
}
