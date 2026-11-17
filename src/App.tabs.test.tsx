import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { FileAccess, OpenedMarkdownFile } from './platform/fileAccess'

// jsdom transforms are slow under full-suite parallelism; give async assertions room.
const WAIT = { timeout: 5000 }

describe('document tabs', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps each tab independent and saves the tab that is active', async () => {
    const user = userEvent.setup()
    const saveMarkdownFile = vi.fn(async (path: string) => ({ status: 'saved' as const, path, revision: 'r2' }))
    const fileAccess = createFileAccess({
      startupFile: file('/tmp/a.md', '# A'),
      openFile: file('/tmp/b.md', '# B'),
      saveMarkdownFile,
    })
    render(<App fileAccess={fileAccess} initialLanguage="en" />)

    await screen.findByRole('heading', { name: 'A' }, WAIT)
    await user.click(screen.getByRole('button', { name: 'Edit markdown source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), { target: { value: '# A edited' } })

    fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
    expect(await screen.findByRole('heading', { name: 'B' }, WAIT)).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Edit markdown source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), { target: { value: '# B edited' } })

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledWith('/tmp/b.md', '# B edited'), WAIT)

    // Switching back must restore tab A untouched, and saving must write A.
    await user.click(screen.getAllByRole('tab')[0])
    await user.click(screen.getByRole('button', { name: 'Edit markdown source' }))
    expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('# A edited')

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledWith('/tmp/a.md', '# A edited'), WAIT)
  })

  it('activates an already open document instead of duplicating its tab', async () => {
    const fileAccess = createFileAccess({
      startupFile: file('/tmp/a.md', '# A'),
      openFile: file('/tmp/a.md', '# A'),
    })
    render(<App fileAccess={fileAccess} initialLanguage="en" />)

    await screen.findByRole('heading', { name: 'A' }, WAIT)
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true })

    // A single open document shows no tab bar, which proves no second tab was added.
    await waitFor(() => expect(screen.queryAllByRole('tab')).toHaveLength(0), WAIT)
  })

  it('opens every document forwarded by another app instance', async () => {
    let forward: ((file: OpenedMarkdownFile) => void | Promise<void>) | null = null
    const fileAccess = createFileAccess({
      startupFile: file('/tmp/a.md', '# A'),
      listenForOpenedFiles: vi.fn(async (callback) => {
        forward = callback
        return null
      }),
    })
    render(<App fileAccess={fileAccess} initialLanguage="en" />)

    await screen.findByRole('heading', { name: 'A' }, WAIT)
    await waitFor(() => expect(forward).not.toBeNull(), WAIT)

    await act(async () => {
      await forward!(file('/tmp/b.md', '# B'))
      await forward!(file('/tmp/c.md', '# C'))
    })

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(3), WAIT)
  })

  it('asks before closing a tab with unsaved changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn(() => false)
    window.confirm = confirm
    const fileAccess = createFileAccess({
      startupFile: file('/tmp/a.md', '# A'),
      openFile: file('/tmp/b.md', '# B'),
    })
    render(<App fileAccess={fileAccess} initialLanguage="en" />)

    await screen.findByRole('heading', { name: 'A' }, WAIT)
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
    await screen.findByRole('heading', { name: 'B' }, WAIT)
    await user.click(screen.getByRole('button', { name: 'Edit markdown source' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), { target: { value: '# B edited' } })

    fireEvent.keyDown(window, { key: 'w', ctrlKey: true })

    expect(confirm).toHaveBeenCalled()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
})

function file(path: string, content: string): OpenedMarkdownFile {
  return { path, content }
}

function createFileAccess(
  overrides: {
    startupFile?: OpenedMarkdownFile | null
    openFile?: OpenedMarkdownFile | null
    saveMarkdownFile?: FileAccess['saveMarkdownFile']
    listenForOpenedFiles?: FileAccess['listenForOpenedFiles']
  } = {},
): FileAccess {
  return {
    supportsNativeFiles: true,
    supportsImageImport: true,
    openMarkdownFile: vi.fn(async () => overrides.openFile ?? null),
    openMarkdownFileAtPath: vi.fn(async (path) => file(path, '# Recent')),
    revealFileInFolder: vi.fn(async () => undefined),
    saveMarkdownFile: overrides.saveMarkdownFile ?? vi.fn(async (path: string) => path),
    saveMarkdownFileAs: vi.fn(async () => '/tmp/saved-as.md'),
    exportHtmlFile: vi.fn(async () => '/tmp/export.html'),
    exportDocxFile: vi.fn(async () => '/tmp/export.docx'),
    printExportHtml: vi.fn(async () => undefined),
    readLocalImageFile: vi.fn(async (path) => ({ path, dataUrl: 'data:image/png;base64,test' })),
    writeImageAsset: vi.fn(async () => ({ path: '/tmp/assets/image.png', relativePath: 'assets/image.png', filename: 'image.png' })),
    readStartupMarkdownFile: vi.fn(async () => overrides.startupFile ?? null),
    listenForOpenedFiles: overrides.listenForOpenedFiles ?? vi.fn(async () => null),
  }
}
