import { useCallback, useRef, useState } from 'react'
import {
  addCompareDocument,
  compareDocumentId,
  createCompareDocumentFromFile,
  dirtyCompareDocuments,
  isCompareDocumentDirty,
  isCompareLimitReached,
  markCompareDocumentSaved,
  MAX_COMPARE_DOCUMENTS,
  removeCompareDocument,
  setCompareDocumentMode,
  updateCompareContent,
  type CompareDocument,
  type ComparePaneMode,
} from '../domain/comparison'
import type { FileAccess, OpenedMarkdownFile } from '../platform/fileAccess'

type UseComparisonOptions = {
  fileAccess: FileAccess
  messages: {
    loadFailed: (title: string) => string
    saveFailed: (title: string) => string
    saveConflict: (title: string) => string
    saveMissing: (title: string) => string
    limitReached: string
    discardConfirm: (count: number) => string
  }
}

/**
 * Side-by-side document comparison. Deliberately independent from
 * useDocumentController: panes own their own content and revisions so the
 * main editing session keeps its draft, watcher and undo behaviour untouched.
 */
export function useComparison({ fileAccess, messages }: UseComparisonOptions) {
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [documents, setDocuments] = useState<CompareDocument[]>([])
  const [statusMessage, setStatusMessage] = useState<string>('')
  const documentsRef = useRef(documents)
  const pendingRef = useRef(false)

  const commit = useCallback((next: CompareDocument[] | ((current: CompareDocument[]) => CompareDocument[])) => {
    setDocuments((current) => {
      const value = typeof next === 'function' ? next(current) : next
      documentsRef.current = value
      return value
    })
  }, [])

  const open = useCallback((seed: OpenedMarkdownFile | null) => {
    setStatusMessage('')
    if (seed) {
      commit([createCompareDocumentFromFile(seed)])
    }
    setIsCompareOpen(true)
  }, [commit])

  const close = useCallback((): boolean => {
    const dirty = dirtyCompareDocuments(documentsRef.current)
    if (dirty.length > 0 && !window.confirm(messages.discardConfirm(dirty.length))) {
      return false
    }
    setIsCompareOpen(false)
    return true
  }, [messages])

  const loadPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) {
      return
    }

    const room = MAX_COMPARE_DOCUMENTS - documentsRef.current.length
    if (room <= 0) {
      setStatusMessage(messages.limitReached)
      return
    }

    const accepted: OpenedMarkdownFile[] = []
    let lastFailure = ''
    for (const path of paths.slice(0, room)) {
      if (documentsRef.current.some((document) => document.id === compareDocumentId(path))) {
        continue
      }
      try {
        accepted.push(await fileAccess.openMarkdownFileAtPath(path))
      } catch {
        lastFailure = messages.loadFailed(path.split(/[\\/]/).filter(Boolean).at(-1) ?? path)
      }
    }

    if (accepted.length === 0) {
      if (lastFailure) {
        setStatusMessage(lastFailure)
      }
      return
    }

    commit((current) => accepted.reduce(
      (next, file) => addCompareDocument(next, createCompareDocumentFromFile(file)),
      current,
    ))
    // Keep the failure visible when only some files made it in.
    setStatusMessage(lastFailure)
  }, [commit, fileAccess, messages])

  const addDocuments = useCallback(async () => {
    if (isCompareLimitReached(documentsRef.current)) {
      setStatusMessage(messages.limitReached)
      return
    }

    if (fileAccess.pickMarkdownFiles) {
      await loadPaths(await fileAccess.pickMarkdownFiles())
      return
    }

    try {
      const file = await fileAccess.openMarkdownFile()
      if (file) {
        commit((current) => addCompareDocument(current, createCompareDocumentFromFile(file)))
      }
    } catch {
      setStatusMessage(messages.loadFailed(''))
    }
  }, [commit, fileAccess, loadPaths, messages])

  const addDocumentAtPath = useCallback(async (path: string) => {
    await loadPaths([path])
  }, [loadPaths])

  /** Used by drag and drop, which hands over a batch of paths at once. */
  const addDocumentPaths = useCallback(async (paths: string[]) => {
    await loadPaths(paths)
  }, [loadPaths])

  const remove = useCallback((id: string) => {
    commit((current) => removeCompareDocument(current, id))
  }, [commit])

  const setMode = useCallback((id: string, mode: ComparePaneMode) => {
    commit((current) => setCompareDocumentMode(current, id, mode))
  }, [commit])

  const updateContent = useCallback((id: string, content: string) => {
    commit((current) => updateCompareContent(current, id, content))
  }, [commit])

  const save = useCallback(async (id: string): Promise<boolean> => {
    const target = documentsRef.current.find((document) => document.id === id)
    if (!target || !isCompareDocumentDirty(target)) {
      return true
    }

    try {
      const result = await fileAccess.saveMarkdownFile(target.path, target.content, target.revision ?? undefined)

      if (typeof result === 'string') {
        commit((current) => markCompareDocumentSaved(current, id, null))
        return true
      }

      if (result && 'status' in result) {
        if (result.status === 'saved') {
          commit((current) => markCompareDocumentSaved(current, id, result.revision))
          return true
        }
        setStatusMessage(result.status === 'conflict'
          ? messages.saveConflict(target.title)
          : messages.saveMissing(target.title))
        return false
      }

      commit((current) => markCompareDocumentSaved(current, id, null))
      return true
    } catch {
      setStatusMessage(messages.saveFailed(target.title))
      return false
    }
  }, [commit, fileAccess, messages])

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (pendingRef.current) {
      return false
    }

    pendingRef.current = true
    try {
      for (const document of dirtyCompareDocuments(documentsRef.current)) {
        const saved = await save(document.id)
        if (!saved) {
          return false
        }
      }
      return true
    } finally {
      pendingRef.current = false
    }
  }, [save])

  const dirtyCount = documents.filter(isCompareDocumentDirty).length

  return {
    isCompareOpen,
    documents,
    dirtyCount,
    statusMessage,
    setStatusMessage,
    open,
    close,
    addDocuments,
    addDocumentAtPath,
    addDocumentPaths,
    remove,
    setMode,
    updateContent,
    save,
    saveAll,
  }
}
