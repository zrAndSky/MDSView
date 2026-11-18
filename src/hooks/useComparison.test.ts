import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_COMPARE_DOCUMENTS } from '../domain/comparison'
import type { FileAccess } from '../platform/fileAccess'
import { useComparison } from './useComparison'

const messages = {
  loadFailed: (title: string) => `load failed: ${title}`,
  saveFailed: (title: string) => `save failed: ${title}`,
  saveConflict: (title: string) => `conflict: ${title}`,
  saveMissing: (title: string) => `missing: ${title}`,
  limitReached: 'limit reached',
  discardConfirm: (count: number) => `discard ${count}`,
}

function createFileAccess(overrides: Partial<FileAccess> = {}): FileAccess {
  return {
    supportsNativeFiles: true,
    supportsImageImport: true,
    openMarkdownFile: vi.fn(async () => null),
    openMarkdownFileAtPath: vi.fn(async (path: string) => ({ path, content: `# ${path}` })),
    pickMarkdownFiles: vi.fn(async () => []),
    revealFileInFolder: vi.fn(async () => undefined),
    saveMarkdownFile: vi.fn(async (path: string) => ({ status: 'saved' as const, path, revision: 'r2' })),
    saveMarkdownFileAs: vi.fn(async () => '/tmp/saved-as.md'),
    exportHtmlFile: vi.fn(async () => '/tmp/export.html'),
    exportDocxFile: vi.fn(async () => '/tmp/export.docx'),
    printExportHtml: vi.fn(async () => undefined),
    readLocalImageFile: vi.fn(async (path: string) => ({ path, dataUrl: 'data:image/png;base64,x' })),
    writeImageAsset: vi.fn(async () => ({ path: '/tmp/a.png', relativePath: 'a.png', filename: 'a.png' })),
    readStartupMarkdownFile: vi.fn(async () => null),
    listenForOpenedFiles: vi.fn(async () => null),
    ...overrides,
  }
}

async function openWithSeed(fileAccess: FileAccess) {
  const hook = renderHook(() => useComparison({ fileAccess, messages }))
  act(() => hook.result.current.open({ path: '/tmp/a.md', content: '# A' }))
  return hook
}

describe('useComparison', () => {
  it('starts with the current document and adds dropped paths in order', async () => {
    const fileAccess = createFileAccess()
    const { result } = await openWithSeed(fileAccess)

    expect(result.current.isCompareOpen).toBe(true)
    expect(result.current.documents.map((document) => document.title)).toEqual(['a.md'])

    await act(async () => {
      await result.current.addDocumentPaths(['/tmp/b.md', '/tmp/c.md'])
    })

    expect(result.current.documents.map((document) => document.title)).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('fills the remaining slots only and reports the limit afterwards', async () => {
    const fileAccess = createFileAccess()
    const { result } = await openWithSeed(fileAccess)

    await act(async () => {
      await result.current.addDocumentPaths(['/tmp/b.md', '/tmp/c.md', '/tmp/d.md', '/tmp/e.md'])
    })
    expect(result.current.documents).toHaveLength(MAX_COMPARE_DOCUMENTS)

    await act(async () => {
      await result.current.addDocumentPaths(['/tmp/f.md'])
    })
    expect(result.current.documents).toHaveLength(MAX_COMPARE_DOCUMENTS)
    expect(result.current.statusMessage).toBe('limit reached')
  })

  it('does not add the same file twice', async () => {
    const fileAccess = createFileAccess()
    const { result } = await openWithSeed(fileAccess)

    await act(async () => {
      await result.current.addDocumentPaths(['/TMP/A.MD'])
    })

    expect(result.current.documents).toHaveLength(1)
  })

  it('reports a file that cannot be opened and keeps the others', async () => {
    const fileAccess = createFileAccess({
      openMarkdownFileAtPath: vi.fn(async (path: string) => {
        if (path === '/tmp/bad.md') throw new Error('nope')
        return { path, content: `# ${path}` }
      }),
    })
    const { result } = await openWithSeed(fileAccess)

    await act(async () => {
      await result.current.addDocumentPaths(['/tmp/bad.md', '/tmp/good.md'])
    })

    expect(result.current.documents.map((document) => document.title)).toEqual(['a.md', 'good.md'])
    expect(result.current.statusMessage).toBe('load failed: bad.md')
  })
})
