import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYLISTS_STORAGE_KEY, type PlaylistsState } from '../domain/playlists'
import { usePlaylists } from './usePlaylists'

const ITEM_A = { path: 'D:\\novel\\a.md', title: 'a.md', addedAt: 'now' }
const ITEM_B = { path: 'D:\\novel\\b.md', title: 'b.md', addedAt: 'now' }
const ITEM_C = { path: 'D:\\novel\\c.md', title: 'c.md', addedAt: 'now' }

describe('usePlaylists', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates a collection with batched items and deduplicates them', () => {
    const { result } = renderHook(() => usePlaylists())

    act(() => result.current.create('测试集', [ITEM_A, ITEM_B, ITEM_A]))

    expect(result.current.state.playlists).toHaveLength(1)
    expect(result.current.state.playlists[0].items.map((item) => item.path)).toEqual([ITEM_A.path, ITEM_B.path])
    expect(result.current.state.activePlaylistId).toBe(result.current.state.playlists[0].id)
  })

  it('adds several items to an existing collection', () => {
    const { result } = renderHook(() => usePlaylists())
    act(() => result.current.create('测试集'))
    const id = result.current.state.activePlaylistId!

    act(() => result.current.addItems(id, [ITEM_B, ITEM_C]))

    expect(result.current.state.playlists[0].items.map((item) => item.path)).toEqual([ITEM_B.path, ITEM_C.path])
  })

  it('reloads collections written by another instance', () => {
    const { result } = renderHook(() => usePlaylists())
    act(() => result.current.create('本地'))
    expect(result.current.state.playlists.map((playlist) => playlist.name)).toEqual(['本地'])

    const external: PlaylistsState = {
      version: 1,
      playlists: [{ id: 'p9', name: '别处新建', items: [ITEM_A] }],
      activePlaylistId: 'p9',
    }
    window.localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(external))

    act(() => result.current.reload())

    expect(result.current.state.playlists.map((playlist) => playlist.name)).toEqual(['别处新建'])
    expect(result.current.activePlaylist?.items).toHaveLength(1)
  })
})
