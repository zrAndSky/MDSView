import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  movePlaylistItem,
  removePlaylistItem,
  renamePlaylist,
  savePlaylists,
  selectPlaylist,
  type PlaylistItem,
} from '../domain/playlists'

export function usePlaylists() {
  const [state, setState] = useState(loadPlaylists)
  const activePlaylist = useMemo(
    () => state.playlists.find((playlist) => playlist.id === state.activePlaylistId) ?? null,
    [state],
  )

  useEffect(() => {
    savePlaylists(state)
  }, [state])

  const create = useCallback((name: string, items: PlaylistItem[] = []) => {
    setState((current) => {
      const next = createPlaylist(current, name)
      if (next === current || !next.activePlaylistId || items.length === 0) {
        return next
      }
      return items.reduce(
        (state, item) => addPlaylistItem(state, next.activePlaylistId!, item),
        next,
      )
    })
  }, [])
  const rename = useCallback((id: string, name: string) => {
    setState((current) => renamePlaylist(current, id, name))
  }, [])
  const remove = useCallback((id: string) => {
    setState((current) => deletePlaylist(current, id))
  }, [])
  const select = useCallback((id: string) => {
    setState((current) => selectPlaylist(current, id))
  }, [])
  const addItem = useCallback((playlistId: string, item: PlaylistItem) => {
    setState((current) => addPlaylistItem(current, playlistId, item))
  }, [])
  const addItems = useCallback((playlistId: string, items: PlaylistItem[]) => {
    setState((current) => items.reduce(
      (state, item) => addPlaylistItem(state, playlistId, item),
      current,
    ))
  }, [])
  const reload = useCallback(() => {
    setState(loadPlaylists())
  }, [])
  const removeItem = useCallback((playlistId: string, path: string) => {
    setState((current) => removePlaylistItem(current, playlistId, path))
  }, [])
  const moveItem = useCallback((playlistId: string, fromIndex: number, toIndex: number) => {
    setState((current) => movePlaylistItem(current, playlistId, fromIndex, toIndex))
  }, [])

  return {
    state,
    activePlaylist,
    create,
    rename,
    remove,
    select,
    addItem,
    addItems,
    reload,
    removeItem,
    moveItem,
  }
}
