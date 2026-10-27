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
    onAddDocuments: vi.fn(),
    onReload: vi.fn(),
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

  it('asks for a name and adds the current document by default', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.newPlaylist }))
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByRole('textbox', { name: t.playlistNameLabel })
    expect(input).toHaveValue('文档集 2')
    expect(within(dialog).getByRole('checkbox')).toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: t.createAction }))

    expect(props.onCreate).toHaveBeenCalledWith('文档集 2', [expect.objectContaining({
      path: 'D:\\novel\\new.md',
      title: 'new.md',
    })])
  })

  it('can skip adding the current document', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.newPlaylist }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.change(within(dialog).getByRole('textbox', { name: t.playlistNameLabel }), { target: { value: '番外合集' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t.createAction }))

    expect(props.onCreate).toHaveBeenCalledWith('番外合集', [])
  })

  it('hides the add-current option when no document is open', () => {
    const props = renderPanel({ currentPath: null, currentTitle: '' })

    fireEvent.click(screen.getByRole('button', { name: t.newPlaylist }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: t.createAction }))

    expect(props.onCreate).toHaveBeenCalledWith('文档集 2', [])
  })

  it('cancels creation with Escape and keeps the default name disabled when blank', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.newPlaylist }))
    let dialog = screen.getByRole('dialog')
    const input = within(dialog).getByRole('textbox', { name: t.playlistNameLabel })
    fireEvent.change(input, { target: { value: '   ' } })
    expect(within(dialog).getByRole('button', { name: t.createAction })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onCreate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t.newPlaylist }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: t.playlistNameLabel })).toHaveValue('文档集 2')
  })

  it('shows the empty hint when there are no playlists', () => {
    renderPanel({ state: { version: 1, playlists: [], activePlaylistId: null }, activePlaylist: null })

    expect(screen.getByText(t.playlistsEmpty)).toBeInTheDocument()
  })

  it('adds the current file to the active playlist', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '加入当前文档' }))

    expect(props.onAddCurrent).toHaveBeenCalledWith('p1', expect.objectContaining({
      path: 'D:\\novel\\new.md',
      title: 'new.md',
    }))
  })

  it('disables adding when the current file is already listed', () => {
    renderPanel({ currentPath: 'D:\\novel\\a.md', currentTitle: 'A' })

    expect(screen.getByRole('button', { name: '已在文档集中' })).toBeDisabled()
  })

  it('renames a playlist inline from the more menu', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.moreActions }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    const input = screen.getByRole('textbox', { name: '重命名' })
    fireEvent.change(input, { target: { value: '番外二' } })
    fireEvent.submit(input.closest('form')!)

    expect(props.onRename).toHaveBeenCalledWith('p1', '番外二')
  })

  it('deletes only after the confirmation step inside the more menu', () => {
    const props = renderPanel()

    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t.moreActions }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
    expect(props.onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitem', { name: '确认删除' }))
    expect(props.onDelete).toHaveBeenCalledWith('p1')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the more menu when clicking outside', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.moreActions }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('removes an item only after the confirmation step', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '从文档集移除: B' }))
    expect(props.onRemoveItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认移除: B' }))
    expect(props.onRemoveItem).toHaveBeenCalledWith('p1', 'D:\\novel\\b.md')
  })

  it('cancels a pending item removal when clicking elsewhere', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '从文档集移除: B' }))
    expect(screen.getByRole('button', { name: '确认移除: B' })).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('button', { name: '确认移除: B' })).toBeNull()
    expect(screen.getByRole('button', { name: '从文档集移除: B' })).toBeInTheDocument()
    expect(props.onRemoveItem).not.toHaveBeenCalled()
  })

  it('adds documents from the file picker and reloads collections', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: t.addDocuments }))
    expect(props.onAddDocuments).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: t.reloadCollections }))
    expect(props.onReload).toHaveBeenCalledTimes(1)
  })

  it('marks the panel while a file is dragged over it', () => {
    const { container } = renderPanel({ isDropTarget: true })
    expect(container.querySelector('.playlist-panel.drop-target')).toBeTruthy()
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

  it('reorders items by dragging with the pointer', () => {
    const props = renderPanel()
    const items = within(screen.getByRole('list', { name: '在写的番外' })).getAllByRole('listitem')
    items.forEach((item, index) => {
      item.getBoundingClientRect = () => ({
        top: 100 + index * 30,
        bottom: 128 + index * 30,
        height: 28,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 100 + index * 30,
        toJSON: () => ({}),
      }) as DOMRect
    })

    fireEvent.pointerDown(items[0], { button: 0, clientY: 110 })
    fireEvent.pointerMove(window, { clientY: 170 })
    fireEvent.pointerUp(window)

    expect(props.onMoveItem).toHaveBeenCalledWith('p1', 0, 2)
  })

  it('does not reorder or open when the pointer moves less than the drag threshold', () => {
    const props = renderPanel()
    const items = within(screen.getByRole('list', { name: '在写的番外' })).getAllByRole('listitem')

    fireEvent.pointerDown(items[0], { button: 0, clientY: 110 })
    fireEvent.pointerMove(window, { clientY: 112 })
    fireEvent.pointerUp(window)
    fireEvent.click(items[0].querySelector('.playlist-item-open') as HTMLElement)

    expect(props.onMoveItem).not.toHaveBeenCalled()
    expect(props.onOpenItem).toHaveBeenCalledWith('D:\\novel\\a.md')
  })
})
