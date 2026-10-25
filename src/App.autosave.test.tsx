import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AUTO_SAVE_DEBOUNCE_MS, setAutoSaveEnabled } from './domain/autoSave'
import type { FileAccess, MarkdownFileSaveResult, OpenedMarkdownFile } from './platform/fileAccess'

function file(path: string, content: string, revision?: string): OpenedMarkdownFile {
  return { path, content, revision }
}

function createFileAccess(overrides: {
  startupFile?: OpenedMarkdownFile | null
  saveMarkdownFile?: FileAccess['saveMarkdownFile']
} = {}): FileAccess {
  const savedResult: MarkdownFileSaveResult = { status: 'saved', path: '/tmp/start.md', revision: 'rev-2' }
  return {
    supportsNativeFiles: true,
    supportsImageImport: true,
    openMarkdownFile: vi.fn(async () => null),
    openMarkdownFileAtPath: vi.fn(async (path) => file(path, '# Recent')),
    revealFileInFolder: vi.fn(async () => undefined),
    saveMarkdownFile: overrides.saveMarkdownFile ?? vi.fn(async () => savedResult),
    saveMarkdownFileAs: vi.fn(async () => ({ path: '/tmp/saved-as.md', revision: 'rev-1' })),
    exportHtmlFile: vi.fn(async () => null),
    exportDocxFile: vi.fn(async () => null),
    printExportHtml: vi.fn(async () => undefined),
    readLocalImageFile: vi.fn(async (path) => ({ path, dataUrl: 'data:image/png;base64,test' })),
    writeImageAsset: vi.fn(async () => ({
      path: '/tmp/assets/image.png',
      relativePath: 'assets/image.png',
      filename: 'image.png',
    })),
    readStartupMarkdownFile: vi.fn(async () => overrides.startupFile ?? null),
    listenForOpenedFiles: vi.fn(async () => null),
  }
}

async function renderStartupFile(saveMarkdownFile?: FileAccess['saveMarkdownFile']) {
  render(
    <App
      fileAccess={createFileAccess({
        startupFile: file('/tmp/start.md', '# Start', 'rev-1'),
        saveMarkdownFile,
      })}
      initialLanguage="en"
    />,
  )
  await screen.findByRole('heading', { name: 'Start' })
  fireEvent.click(screen.getByRole('button', { name: 'Edit markdown source' }))
  return screen.getByRole('textbox', { name: 'Markdown source' })
}

describe('App auto save', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setAutoSaveEnabled(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes to disk after the typing debounce when enabled', async () => {
    setAutoSaveEnabled(true)
    const saveMarkdownFile = vi.fn(async (path: string) => {
      const result: MarkdownFileSaveResult = { status: 'saved', path, revision: 'rev-2' }
      return result
    })
    const editor = await renderStartupFile(saveMarkdownFile)
    vi.useFakeTimers()

    fireEvent.change(editor, { target: { value: '# Start\n\nnew words' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS - 1)
    })
    expect(saveMarkdownFile).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    expect(saveMarkdownFile).toHaveBeenCalledWith('/tmp/start.md', '# Start\n\nnew words', 'rev-1')
  })

  it('leaves the file untouched when the preference is off', async () => {
    const saveMarkdownFile = vi.fn(async (path: string) => {
      const result: MarkdownFileSaveResult = { status: 'saved', path, revision: 'rev-2' }
      return result
    })
    const editor = await renderStartupFile(saveMarkdownFile)
    vi.useFakeTimers()

    fireEvent.change(editor, { target: { value: '# Start\n\nnew words' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DEBOUNCE_MS * 4)
    })
    expect(saveMarkdownFile).not.toHaveBeenCalled()
  })
})
