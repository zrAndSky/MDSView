import { describe, expect, it } from 'vitest'
import {
  EMPTY_PLAYLISTS,
  addPlaylistItem,
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  movePlaylistItem,
  normalizePlaylists,
  removePlaylistItem,
  renamePlaylist,
  savePlaylists,
  selectPlaylist,
  type PlaylistsState,
} from './playlists'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

function withItems(): PlaylistsState {
  let state = createPlaylist(EMPTY_PLAYLISTS, '在写的番外')
  const id = state.activePlaylistId!
  state = addPlaylistItem(state, id, { path: 'D:\\novel\\a.md', title: 'A', addedAt: 'now' })
  state = addPlaylistItem(state, id, { path: 'D:\\novel\\b.md', title: 'B', addedAt: 'now' })
  state = addPlaylistItem(state, id, { path: 'D:\\novel\\c.md', title: 'C', addedAt: 'now' })
  return state
}

describe('playlists domain', () => {
  it('creates a playlist, trims the name and selects it', () => {
    const state = createPlaylist(EMPTY_PLAYLISTS, '  在写的番外  ')

    expect(state.playlists).toHaveLength(1)
    expect(state.playlists[0].name).toBe('在写的番外')
    expect(state.activePlaylistId).toBe(state.playlists[0].id)
  })

  it('ignores empty names', () => {
    expect(createPlaylist(EMPTY_PLAYLISTS, '   ')).toBe(EMPTY_PLAYLISTS)
    const state = withItems()
    expect(renamePlaylist(state, state.activePlaylistId!, ' ')).toBe(state)
  })

  it('dedupes items by normalized path', () => {
    const state = withItems()
    const id = state.activePlaylistId!
    const next = addPlaylistItem(state, id, { path: 'd:/NOVEL/A.md', title: 'again', addedAt: 'now' })

    expect(next.playlists[0].items).toHaveLength(3)
  })

  it('falls back to the file name when a title is empty', () => {
    const state = addPlaylistItem(EMPTY_PLAYLISTS, 'missing', { path: 'x', title: '', addedAt: 'now' })
    expect(state).toBe(EMPTY_PLAYLISTS)

    const created = createPlaylist(EMPTY_PLAYLISTS, 'p')
    const id = created.activePlaylistId!
    const next = addPlaylistItem(created, id, { path: 'D:\\novel\\chapter one.md', title: '  ', addedAt: 'now' })
    expect(next.playlists[0].items[0].title).toBe('chapter one.md')
  })

  it('removes items without touching the list order of the rest', () => {
    const state = withItems()
    const id = state.activePlaylistId!
    const next = removePlaylistItem(state, id, 'D:\\novel\\b.md')

    expect(next.playlists[0].items.map((item) => item.title)).toEqual(['A', 'C'])
  })

  it('moves items within a playlist', () => {
    const state = withItems()
    const id = state.activePlaylistId!
    const next = movePlaylistItem(state, id, 0, 2)

    expect(next.playlists[0].items.map((item) => item.title)).toEqual(['B', 'C', 'A'])
    expect(movePlaylistItem(next, id, 0, 9)).toBe(next)
  })

  it('selects the next playlist when the active one is deleted', () => {
    let state = createPlaylist(EMPTY_PLAYLISTS, 'one')
    state = createPlaylist(state, 'two')
    const [first, second] = state.playlists
    state = selectPlaylist(state, first.id)
    const next = deletePlaylist(state, first.id)

    expect(next.playlists.map((playlist) => playlist.name)).toEqual(['two'])
    expect(next.activePlaylistId).toBe(second.id)
  })

  it('normalizes stored data and drops invalid entries', () => {
    const state = normalizePlaylists({
      version: 1,
      activePlaylistId: 'missing',
      playlists: [
        { id: 'p1', name: 'ok', items: [{ path: 'D:\\a.md' }, { path: 'D:\\a.md' }, { path: '' }] },
        { id: 'p1', name: 'duplicate id', items: [] },
        { id: 'p2', name: '', items: [] },
        'nope',
      ],
    })

    expect(state.playlists).toHaveLength(1)
    expect(state.playlists[0].items).toHaveLength(1)
    expect(state.playlists[0].items[0].title).toBe('a.md')
    expect(state.activePlaylistId).toBe('p1')
  })

  it('ignores unknown versions', () => {
    expect(normalizePlaylists({ version: 2, playlists: [] })).toBe(EMPTY_PLAYLISTS)
    expect(normalizePlaylists(null)).toBe(EMPTY_PLAYLISTS)
  })

  it('round-trips through storage', () => {
    const storage = memoryStorage()
    const state = withItems()
    savePlaylists(state, storage)

    expect(loadPlaylists(storage)).toEqual(state)
    expect(loadPlaylists(memoryStorage())).toBe(EMPTY_PLAYLISTS)
  })
})
