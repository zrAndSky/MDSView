import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { FileAccess, OpenedMarkdownFile } from './platform/fileAccess'

describe('document compare', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-mdview-color-theme')
    vi.restoreAllMocks()
  })

  it('starts a compare session with the open document', async () => {
    const user = userEvent.setup()
    const { container } = renderApp({ fileAccess: createFileAccess({ startupFile: file('/tmp/readme.md', '# Readme') }) })

    expect(await screen.findByRole('heading', { name: 'Readme' })).toBeInTheDocument()
    expect(await openCompare(user)).toBeInTheDocument()

    expect(container.querySelectorAll('.compare-pane')).toHaveLength(1)
    expect(container.querySelector('.compare-pane-title')?.textContent).toBe('readme.md')
  })

  it('adds documents picked from disk up to four panes', async () => {
    const user = userEvent.setup()
    const access = createFileAccess({
      startupFile: file('/tmp/readme.md', '# Readme'),
      pickMarkdownFiles: vi.fn(async () => ['/tmp/a.md', '/tmp/b.md', '/tmp/c.md', '/tmp/d.md']),
      openMarkdownFileAtPath: vi.fn(async (path: string) => file(path, `# ${path}`)),
    })
    const { container } = renderApp({ fileAccess: access })

    await screen.findByRole('heading', { name: 'Readme' })
    await openCompare(user)
    await user.click(screen.getByRole('button', { name: 'Add document' }))

    await waitFor(() => expect(container.querySelectorAll('.compare-pane')).toHaveLength(4), { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'Add document' })).toBeDisabled()
  })

  it('toggles compare mode from the toolbar button', async () => {
    const user = userEvent.setup()
    const { container } = renderApp({ fileAccess: createFileAccess({ startupFile: file('/tmp/a.md', '# A') }) })

    await screen.findByRole('heading', { name: 'A' })

    await user.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await screen.findByRole('region', { name: 'Document compare' }, { timeout: 5000 })).toBeInTheDocument()
    expect(container.querySelectorAll('.compare-pane')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await waitFor(() => expect(container.querySelector('.compare-workspace')).toBeNull())
    expect(await screen.findByRole('heading', { name: 'A' })).toBeInTheDocument()
  })

  it('toggles compare mode with Ctrl+Shift+D', async () => {
    const { container } = renderApp({ fileAccess: createFileAccess({ startupFile: file('/tmp/a.md', '# A') }) })

    await screen.findByRole('heading', { name: 'A' })

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    expect(await screen.findByRole('region', { name: 'Document compare' }, { timeout: 5000 })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(container.querySelector('.compare-workspace')).toBeNull())
  })

  it('edits and saves a pane without leaving compare mode', async () => {
    const user = userEvent.setup()
    const saveMarkdownFile = vi.fn(async (path: string) => ({ status: 'saved' as const, path, revision: 'r2' }))
    const access = createFileAccess({
      startupFile: file('/tmp/a.md', '# A'),
      saveMarkdownFile,
    })
    const { container } = renderApp({ fileAccess: access })

    await screen.findByRole('heading', { name: 'A' })
    await openCompare(user)
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const editor = container.querySelector<HTMLTextAreaElement>('.compare-pane-editor')
    expect(editor).not.toBeNull()
    fireEvent.change(editor!, { target: { value: '# A edited' } })
    await user.click(screen.getByRole('button', { name: 'Save this document' }))

    await waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledWith('/tmp/a.md', '# A edited', undefined))
    await waitFor(() => expect(container.querySelector('.compare-pane-dirty')).toBeNull())
  })
})

function renderApp(props: ComponentProps<typeof App>) {
  return render(<App {...props} initialLanguage={props.initialLanguage ?? 'en'} />)
}

async function openCompare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'File' }))
  await user.click(screen.getByRole('menuitem', { name: 'Compare documents…' }))
  return screen.findByRole('region', { name: 'Document compare' }, { timeout: 5000 })
}

function file(path: string, content: string): OpenedMarkdownFile {
  return { path, content }
}

function createFileAccess(
  overrides: {
    startupFile?: OpenedMarkdownFile | null
    pickMarkdownFiles?: FileAccess['pickMarkdownFiles']
    openMarkdownFileAtPath?: FileAccess['openMarkdownFileAtPath']
    saveMarkdownFile?: FileAccess['saveMarkdownFile']
  } = {},
): FileAccess {
  return {
    supportsNativeFiles: true,
    supportsImageImport: true,
    openMarkdownFile: vi.fn(async () => null),
    openMarkdownFileAtPath: overrides.openMarkdownFileAtPath ?? vi.fn(async (path) => file(path, '# Recent')),
    pickMarkdownFiles: overrides.pickMarkdownFiles ?? vi.fn(async () => []),
    revealFileInFolder: vi.fn(async () => undefined),
    saveMarkdownFile: overrides.saveMarkdownFile ?? vi.fn(async (path) => path),
    saveMarkdownFileAs: vi.fn(async () => '/tmp/saved-as.md'),
    exportHtmlFile: vi.fn(async () => '/tmp/export.html'),
    exportDocxFile: vi.fn(async () => '/tmp/export.docx'),
    printExportHtml: vi.fn(async () => undefined),
    readLocalImageFile: vi.fn(async (path) => ({ path, dataUrl: 'data:image/png;base64,test' })),
    writeImageAsset: vi.fn(async () => ({ path: '/tmp/assets/image.png', relativePath: 'assets/image.png', filename: 'image.png' })),
    readStartupMarkdownFile: vi.fn(async () => overrides.startupFile ?? null),
    listenForOpenedFiles: vi.fn(async () => null),
  }
}
