import { normalizeReadingSessionPath } from './readingSessions'

export type PlaylistItem = {
  path: string
  title: string
  addedAt: string
}

export type Playlist = {
  id: string
  name: string
  items: PlaylistItem[]
}

export type PlaylistsState = {
  version: 1
  playlists: Playlist[]
  activePlaylistId: string | null
}

export const PLAYLISTS_STORAGE_KEY = 'mdview.playlists.v1'
export const MAX_PLAYLISTS = 100
export const MAX_PLAYLIST_ITEMS = 500
const MAX_NAME_LENGTH = 80

export const EMPTY_PLAYLISTS: PlaylistsState = { version: 1, playlists: [], activePlaylistId: null }

export function playlistItemFromPath(path: string, addedAt = new Date().toISOString()): PlaylistItem {
  return { path, title: basename(path), addedAt }
}

export function createPlaylist(state: PlaylistsState, name: string): PlaylistsState {
  const trimmed = sanitizeName(name)
  if (!trimmed || state.playlists.length >= MAX_PLAYLISTS) {
    return state
  }

  const playlist: Playlist = { id: createPlaylistId(), name: trimmed, items: [] }
  return { ...state, playlists: [...state.playlists, playlist], activePlaylistId: playlist.id }
}

export function renamePlaylist(state: PlaylistsState, id: string, name: string): PlaylistsState {
  const trimmed = sanitizeName(name)
  const target = state.playlists.find((playlist) => playlist.id === id)
  if (!trimmed || !target || target.name === trimmed) {
    return state
  }

  return {
    ...state,
    playlists: state.playlists.map((playlist) => playlist.id === id ? { ...playlist, name: trimmed } : playlist),
  }
}

export function deletePlaylist(state: PlaylistsState, id: string): PlaylistsState {
  const playlists = state.playlists.filter((playlist) => playlist.id !== id)
  if (playlists.length === state.playlists.length) {
    return state
  }

  const activePlaylistId = state.activePlaylistId === id
    ? (playlists[0]?.id ?? null)
    : state.activePlaylistId
  return { ...state, playlists, activePlaylistId }
}

export function selectPlaylist(state: PlaylistsState, id: string): PlaylistsState {
  if (state.activePlaylistId === id || !state.playlists.some((playlist) => playlist.id === id)) {
    return state
  }

  return { ...state, activePlaylistId: id }
}

export function addPlaylistItem(
  state: PlaylistsState,
  playlistId: string,
  item: PlaylistItem,
): PlaylistsState {
  const path = item.path.trim()
  const target = state.playlists.find((playlist) => playlist.id === playlistId)
  if (!path || !target || target.items.length >= MAX_PLAYLIST_ITEMS) {
    return state
  }
  if (target.items.some((existing) => samePath(existing.path, path))) {
    return state
  }

  const nextItem: PlaylistItem = { ...item, path, title: item.title.trim() || basename(path) }
  return {
    ...state,
    playlists: state.playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, items: [...playlist.items, nextItem] }
      : playlist),
  }
}

export function removePlaylistItem(state: PlaylistsState, playlistId: string, path: string): PlaylistsState {
  const target = state.playlists.find((playlist) => playlist.id === playlistId)
  if (!target) {
    return state
  }

  const items = target.items.filter((item) => !samePath(item.path, path))
  if (items.length === target.items.length) {
    return state
  }

  return {
    ...state,
    playlists: state.playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, items }
      : playlist),
  }
}

export function movePlaylistItem(
  state: PlaylistsState,
  playlistId: string,
  fromIndex: number,
  toIndex: number,
): PlaylistsState {
  const target = state.playlists.find((playlist) => playlist.id === playlistId)
  if (!target) {
    return state
  }

  const { items } = target
  if (fromIndex === toIndex
    || fromIndex < 0 || fromIndex >= items.length
    || toIndex < 0 || toIndex >= items.length) {
    return state
  }

  const nextItems = [...items]
  const [moved] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, moved)
  return {
    ...state,
    playlists: state.playlists.map((playlist) => playlist.id === playlistId
      ? { ...playlist, items: nextItems }
      : playlist),
  }
}

export function loadPlaylists(storage: Storage | null = getLocalStorage()): PlaylistsState {
  if (!storage) {
    return EMPTY_PLAYLISTS
  }

  try {
    const rawValue = storage.getItem(PLAYLISTS_STORAGE_KEY)
    return rawValue ? normalizePlaylists(JSON.parse(rawValue)) : EMPTY_PLAYLISTS
  } catch {
    return EMPTY_PLAYLISTS
  }
}

export function savePlaylists(state: PlaylistsState, storage: Storage | null = getLocalStorage()) {
  storage?.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(normalizePlaylists(state)))
}

export function normalizePlaylists(value: unknown): PlaylistsState {
  if (!value || typeof value !== 'object') {
    return EMPTY_PLAYLISTS
  }

  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !Array.isArray(candidate.playlists)) {
    return EMPTY_PLAYLISTS
  }

  const seenNames = new Set<string>()
  const playlists: Playlist[] = []
  for (const rawPlaylist of candidate.playlists.slice(0, MAX_PLAYLISTS)) {
    if (!rawPlaylist || typeof rawPlaylist !== 'object') {
      continue
    }

    const record = rawPlaylist as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = sanitizeName(typeof record.name === 'string' ? record.name : '')
    if (!id || !name || playlists.some((playlist) => playlist.id === id)) {
      continue
    }
    seenNames.add(name)

    const items: PlaylistItem[] = []
    if (Array.isArray(record.items)) {
      for (const rawItem of record.items) {
        if (!rawItem || typeof rawItem !== 'object' || items.length >= MAX_PLAYLIST_ITEMS) {
          continue
        }

        const item = rawItem as Record<string, unknown>
        const path = typeof item.path === 'string' ? item.path.trim() : ''
        if (!path || items.some((existing) => samePath(existing.path, path))) {
          continue
        }

        items.push({
          path,
          title: sanitizeName(typeof item.title === 'string' ? item.title : '') || basename(path),
          addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
        })
      }
    }

    playlists.push({ id, name, items })
  }

  const requestedActive = typeof candidate.activePlaylistId === 'string' ? candidate.activePlaylistId : null
  const activePlaylistId = playlists.some((playlist) => playlist.id === requestedActive)
    ? requestedActive
    : (playlists[0]?.id ?? null)

  return { version: 1, playlists, activePlaylistId }
}

function sanitizeName(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127 ? ' ' : character
  }).join('').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

function samePath(left: string, right: string): boolean {
  return normalizeReadingSessionPath(left) === normalizeReadingSessionPath(right)
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function createPlaylistId(): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }

  return `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}
