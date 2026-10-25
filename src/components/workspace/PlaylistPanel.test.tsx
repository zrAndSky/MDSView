import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveReadingSession } from '../../domain/readingSessions'
import type { PlaylistsState } from '../../domain/playlists'
import { translations } from '../../i18n'
import { PlaylistPanel } from './PlaylistPanel'

const t = translations.zh

function baseState(): PlaylistsState {
  return {
    version: 1,
    activePlaylistId: 'p1',
    playlists: [{
      id: 'p1',
      name: '在写的番外',
      items: [
        { path: 'D:\\novel\\a.md', title: 'A', addedAt: 'now' },
        { path: 'D:\\novel\\b.md', title: 'B', addedAt: 'now' },
        { path: 'D:\\novel\\c.md', title: 'C', addedAt: 'now' },
      ],
    }],
  }
}

function renderPanel(overrides: Partial<Parameters<typeof PlaylistPanel>[0]> = {}) {
  const state = baseState()
  const props = {
    state,
    activePlaylist: state.playlists[0],
    currentPath: 'D:\\novel\\new.md',
    currentTitle: 'new.md',
    t,
    onCreate: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onAddCurrent: vi.fn(),
    onRemoveItem: vi.fn(),
    onMoveItem: vi.fn(),
    onOpenItem: vi.fn(),
    ...overrides,
  }
  const view = render(<PlaylistPanel {...props} />)
  return { ...props, ...view }
}

describe('PlaylistPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('lists playlists and opens an item', () => {
    const props = renderPanel()

    expect(screen.getByRole('button', { name: /在写的番外/ })).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('D:\\novel\\a.md'))

    expect(props.onOpenItem).toHaveBeenCalledWith('D:\\novel\\a.md')
  })

  it('creates a playlist with the next default name', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '+ 新建歌单' }))

    expect(props.onCreate).toHaveBeenCalledWith('歌单 2')
  })

  it('shows the empty hint when there are no playlists', () => {
    renderPanel({ state: { version: 1, playlists: [], activePlaylistId: null }, activePlaylist: null })

    expect(screen.getByText(t.playlistsEmpty)).toBeInTheDocument()
  })

  it('adds the current file to the active playlist', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '加入当前文件' }))

    expect(props.onAddCurrent).toHaveBeenCalledWith('p1', expect.objectContaining({
      path: 'D:\\novel\\new.md',
      title: 'new.md',
    }))
  })

  it('disables adding when the current file is already listed', () => {
    renderPanel({ currentPath: 'D:\\novel\\a.md', currentTitle: 'A' })

    expect(screen.getByRole('button', { name: '已在歌单中' })).toBeDisabled()
  })

  it('renames a playlist inline', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    const input = screen.getByRole('textbox', { name: '重命名' })
    fireEvent.change(input, { target: { value: '番外二' } })
    fireEvent.submit(input.closest('form')!)

    expect(props.onRename).toHaveBeenCalledWith('p1', '番外二')
  })

  it('deletes only after the confirmation step', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(props.onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(props.onDelete).toHaveBeenCalledWith('p1')
  })

  it('removes an item', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '从歌单移除: B' }))

    expect(props.onRemoveItem).toHaveBeenCalledWith('p1', 'D:\\novel\\b.md')
  })

  it('marks items that have a saved reading position', () => {
    saveReadingSession('D:\\novel\\b.md', {
      scrollTop: 1200,
      previewZoom: 1,
      viewMode: 'preview',
      outlineWidth: 240,
      isOutlineOpen: true,
    })
    renderPanel()

    const items = screen.getByRole('list', { name: '在写的番外' })
    const rows = within(items).getAllByRole('listitem')
    expect(within(rows[1]).getByText('续读')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('续读')).not.toBeInTheDocument()
  })

  it('reorders items with drag and drop', () => {
    const props = renderPanel()
    const items = within(screen.getByRole('list', { name: '在写的番外' })).getAllByRole('listitem')
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(),
    }

    fireEvent.dragStart(items[0], { dataTransfer })
    fireEvent.dragOver(items[2], { dataTransfer })
    fireEvent.drop(items[2], { dataTransfer })

    expect(props.onMoveItem).toHaveBeenCalledWith('p1', 0, 2)
  })
})
