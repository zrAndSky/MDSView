import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  clearDocumentDraft,
  createDocumentDraftId,
  loadDocumentDraft,
  saveDocumentDraft,
  type RecoverableDraft,
} from '../domain/documentDraft'
import {
  createDocumentTab,
  findTabByPath,
  type DocumentTab,
} from '../domain/documentTab'
import {
  createInitialDocument,
  createImportedDocument,
  markDocumentSaved,
  replaceDocumentContent,
  updateDocumentDraft,
  type MarkdownDocument,
} from '../domain/documentState'
import {
  addRecentFile,
  clearRecentFiles,
  loadRecentFiles,
  removeRecentFile,
  saveRecentFiles,
} from '../domain/recentFiles'
import type { FileAccess, OpenedMarkdownFile } from '../platform/fileAccess'
import { useDocumentTabs } from './useDocumentTabs'
import { useExternalFileMonitor } from './useExternalFileMonitor'

type DocumentViewMode = 'preview' | 'edit'

type UseDocumentControllerOptions = {
  tabs: ReturnType<typeof useDocumentTabs>
  fileAccess: FileAccess
  recentFileOpenFailedMessage: string
  fileOperationFailedMessage: string
  draftBackupFailedMessage: string
  externalFileUpdatedMessage: string
  externalFileConflictMessage: string
  externalFileMissingMessage: string
  externalFileSaveBlockedMessage: string
  fileUpToDateMessage: string
  onCloseMenu: () => void
  onViewModeChange: (mode: DocumentViewMode) => void
}

const DRAFT_SAVE_DELAY_MS = 750

/** Used only when no tab is open; never mutated. */
const EMPTY_DOCUMENT: MarkdownDocument = createInitialDocument()

export function useDocumentController({
  tabs,
  fileAccess,
  recentFileOpenFailedMessage,
  fileOperationFailedMessage,
  draftBackupFailedMessage,
  externalFileUpdatedMessage,
  externalFileConflictMessage,
  externalFileMissingMessage,
  externalFileSaveBlockedMessage,
  fileUpToDateMessage,
  onCloseMenu,
  onViewModeChange,
}: UseDocumentControllerOptions) {
  const { state, stateRef, activeId, activeTab, actions } = tabs

  const markdownDocument = activeTab?.document ?? EMPTY_DOCUMENT
  const isSaving = activeTab?.isSaving ?? false
  const externalFileState = activeTab?.externalFileState ?? null
  const isWelcomeVisible = state.tabs.length === 0
  const documentSessionId = activeId ?? ''

  const [recentFiles, setRecentFiles] = useState(loadRecentFiles)
  const [fallbackStatusMessage, setFallbackStatusMessage] = useState<string>('saved')
  const [pendingDraft, setPendingDraft] = useState<RecoverableDraft | null>(loadDocumentDraft)
  const [isStartupResolved, setIsStartupResolved] = useState(false)
  const [failedRecentPaths, setFailedRecentPaths] = useState<string[]>([])
  const [pendingUnsavedTitle, setPendingUnsavedTitle] = useState<string | null>(null)

  const unsavedResolverRef = useRef<((result: boolean) => void) | null>(null)
  const saveOperationsRef = useRef(new Map<string, Promise<string | null>>())
  const backupFailureNotifiedRef = useRef(new Set<string>())
  const activeIdRef = useRef(activeId)

  useLayoutEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const statusMessage = activeTab?.statusMessage ?? fallbackStatusMessage

  const setStatusMessage = useCallback((message: string) => {
    const tabId = activeIdRef.current
    if (tabId) {
      actions.patch(tabId, { statusMessage: message })
      return
    }
    setFallbackStatusMessage(message)
  }, [actions])

  const findDocument = useCallback((tabId: string): MarkdownDocument | null => {
    return stateRef.current.tabs.find((tab) => tab.id === tabId)?.document ?? null
  }, [stateRef])

  const currentDocument = useCallback((): MarkdownDocument => {
    const tabId = activeIdRef.current
    return (tabId ? findDocument(tabId) : null) ?? EMPTY_DOCUMENT
  }, [findDocument])

  const patchTab = useCallback((tabId: string, patch: Parameters<typeof actions.patch>[1]) => {
    actions.patch(tabId, patch)
  }, [actions])

  const updateTabDocument = useCallback((tabId: string, update: (document: MarkdownDocument) => MarkdownDocument) => {
    actions.updateDocument(tabId, update)
  }, [actions])

  const rememberRecentFile = useCallback((path: string) => {
    setRecentFiles((currentFiles) => {
      const nextFiles = addRecentFile(currentFiles, path)
      saveRecentFiles(nextFiles)
      return nextFiles
    })
  }, [])

  const forgetRecentFile = useCallback((path: string) => {
    setFailedRecentPaths((paths) => paths.filter((item) => item !== path))
    setRecentFiles((currentFiles) => {
      const nextFiles = removeRecentFile(currentFiles, path)
      saveRecentFiles(nextFiles)
      return nextFiles
    })
  }, [])

  const clearDraft = useCallback((tabId: string) => {
    clearDocumentDraft(tabId)
  }, [])

  const canDiscardUnsavedChanges = useCallback(async (): Promise<boolean> => {
    if (!currentDocument().isDirty) return true
    if (unsavedResolverRef.current) return false
    onCloseMenu()
    setPendingUnsavedTitle(currentDocument().title)
    return new Promise<boolean>((resolve) => { unsavedResolverRef.current = resolve })
  }, [currentDocument, onCloseMenu])

  useEffect(() => () => { unsavedResolverRef.current?.(false) }, [])

  /**
   * Opens a file in its own tab. An already open document is activated instead
   * of duplicated, so revisions for the same path never fight each other.
   */
  const openFileInNewTab = useCallback((file: OpenedMarkdownFile) => {
    const existing = findTabByPath(stateRef.current, file.path)
    if (existing) {
      clearDraft(existing.id)
      updateTabDocument(existing.id, (document) => replaceDocumentContent(
        document,
        file.content,
        file.path,
        file.revision ?? null,
      ))
      patchTab(existing.id, { externalFileState: null, statusMessage: 'opened' })
      actions.activate(existing.id)
      rememberRecentFile(file.path)
      setFailedRecentPaths((paths) => paths.filter((path) => path !== file.path))
      return existing.id
    }

    const tab = createDocumentTab(
      createDocumentDraftId(),
      replaceDocumentContent(EMPTY_DOCUMENT, file.content, file.path, file.revision ?? null),
    )
    actions.add({ ...tab, statusMessage: 'opened' })
    onViewModeChange('preview')
    rememberRecentFile(file.path)
    setFailedRecentPaths((paths) => paths.filter((path) => path !== file.path))
    return tab.id
  }, [actions, clearDraft, onViewModeChange, patchTab, rememberRecentFile, stateRef, updateTabDocument])

  const persistDraftFor = useCallback((tab: DocumentTab) => {
    if (!isStartupResolved || pendingDraft || !tab.document.isDirty) {
      return
    }

    const saved = saveDocumentDraft({
      id: tab.id,
      path: tab.document.path,
      title: tab.document.title,
      content: tab.document.content,
      updatedAt: Date.now(),
    })

    if (!saved && !backupFailureNotifiedRef.current.has(tab.id)) {
      backupFailureNotifiedRef.current.add(tab.id)
      patchTab(tab.id, { statusMessage: draftBackupFailedMessage })
    }
  }, [draftBackupFailedMessage, isStartupResolved, patchTab, pendingDraft])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    async function initialize() {
      try {
        const startupFile = await fileAccess.readStartupMarkdownFile()
        if (!disposed && startupFile) {
          // A file explicitly passed by the operating system takes priority over an older draft.
          openFileInNewTab(startupFile)
          setPendingDraft(null)
        }
      } finally {
        if (!disposed) {
          setIsStartupResolved(true)
        }
      }

      const dispose = await fileAccess.listenForOpenedFiles(async (file) => {
        // Opening from the shell never touches the documents already open.
        openFileInNewTab(file)
      })
      if (disposed) {
        dispose?.()
        return
      }

      unlisten = dispose
    }

    void initialize()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [fileAccess, openFileInNewTab])

  const checkCurrentFile = useCallback(async (manual = false) => {
    const tabId = activeIdRef.current
    const current = currentDocument()
    if (!tabId || !fileAccess.supportsNativeFiles || !fileAccess.checkMarkdownFile || !current.path || !current.savedRevision) {
      return
    }

    try {
      const result = await fileAccess.checkMarkdownFile(current.path, current.savedRevision)
      // The user may have switched tabs while the disk read was in flight.
      if (activeIdRef.current !== tabId) {
        return
      }
      const latest = findDocument(tabId)
      if (!latest || latest.path !== current.path || latest.savedRevision !== current.savedRevision) {
        return
      }

      if (result.status === 'missing') {
        patchTab(tabId, { externalFileState: { kind: 'missing', path: result.path }, statusMessage: externalFileMissingMessage })
      } else if (result.status === 'changed') {
        if (latest.isDirty && latest.content !== result.file.content) {
          patchTab(tabId, { externalFileState: { kind: 'conflict', file: result.file }, statusMessage: externalFileConflictMessage })
        } else {
          updateTabDocument(tabId, (document) => replaceDocumentContent(document, result.file.content, result.file.path, result.file.revision))
          clearDraft(tabId)
          patchTab(tabId, { externalFileState: null, statusMessage: externalFileUpdatedMessage })
        }
      } else {
        if (manual) {
          patchTab(tabId, { statusMessage: fileUpToDateMessage })
        }
        const externalState = stateRef.current.tabs.find((tab) => tab.id === tabId)?.externalFileState
        if (externalState?.kind === 'missing') {
          patchTab(tabId, {
            externalFileState: null,
            statusMessage: manual ? fileUpToDateMessage : (latest.isDirty ? 'unsaved' : 'saved'),
          })
        }
      }
    } catch {
      // Temporary filesystem failures should not interrupt reading or editing.
    }
  }, [
    clearDraft,
    currentDocument,
    externalFileConflictMessage,
    externalFileMissingMessage,
    externalFileUpdatedMessage,
    fileAccess,
    fileUpToDateMessage,
    findDocument,
    patchTab,
    stateRef,
    updateTabDocument,
  ])

  useExternalFileMonitor({
    enabled: isStartupResolved && fileAccess.supportsNativeFiles,
    path: markdownDocument.path,
    revision: markdownDocument.savedRevision,
    fileAccess,
    checkFile: checkCurrentFile,
  })

  useEffect(() => {
    window.document.title = `${markdownDocument.isDirty ? '* ' : ''}${markdownDocument.title} - MDSView`
  }, [markdownDocument.isDirty, markdownDocument.title])

  // Debounced draft backup for the active tab.
  useEffect(() => {
    if (!isStartupResolved || pendingDraft || !activeTab || !activeTab.document.isDirty) {
      return
    }

    const tab = activeTab
    const timeout = window.setTimeout(() => persistDraftFor(tab), DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [activeTab, isStartupResolved, pendingDraft, persistDraftFor])

  // Flush the outgoing tab as soon as the user switches away from it.
  const previousActiveIdRef = useRef(activeId)
  useEffect(() => {
    const previousId = previousActiveIdRef.current
    if (previousId === activeId) {
      return
    }

    previousActiveIdRef.current = activeId
    if (!previousId || !isStartupResolved || pendingDraft) {
      return
    }

    const previous = stateRef.current.tabs.find((tab) => tab.id === previousId)
    if (previous) {
      persistDraftFor(previous)
    }
  }, [activeId, isStartupResolved, pendingDraft, persistDraftFor, stateRef])

  useEffect(() => {
    function flushAllDrafts() {
      for (const tab of stateRef.current.tabs) {
        persistDraftFor(tab)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushAllDrafts()
      }
    }

    window.addEventListener('pagehide', flushAllDrafts)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushAllDrafts)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushAllDrafts()
    }
  }, [persistDraftFor, stateRef])

  const handleNewDocument = useCallback(async () => {
    onCloseMenu()
    actions.add(createDocumentTab(createDocumentDraftId(), createInitialDocument()))
    onViewModeChange('edit')
  }, [actions, onCloseMenu, onViewModeChange])

  const handleOpenFile = useCallback(async () => {
    onCloseMenu()

    try {
      const file = await fileAccess.openMarkdownFile()
      if (file) {
        openFileInNewTab(file)
      }
    } catch (error) {
      setStatusMessage(getErrorMessage(error, fileOperationFailedMessage))
    }
  }, [fileAccess, fileOperationFailedMessage, onCloseMenu, openFileInNewTab, setStatusMessage])

  const handleImportedDocument = useCallback((content: string, suggestedFilename: string, statusMessage = 'unsaved') => {
    const tab = createDocumentTab(createDocumentDraftId(), createImportedDocument(content, suggestedFilename))
    actions.add({ ...tab, statusMessage })
    onViewModeChange('preview')
  }, [actions, onViewModeChange])

  const handleOpenRecentFile = useCallback(async (path: string) => {
    onCloseMenu()

    try {
      openFileInNewTab(await fileAccess.openMarkdownFileAtPath(path))
    } catch {
      setFailedRecentPaths((paths) => paths.includes(path) ? paths : [...paths, path])
      setStatusMessage(recentFileOpenFailedMessage)
    }
  }, [fileAccess, onCloseMenu, openFileInNewTab, recentFileOpenFailedMessage, setStatusMessage])

  const openMarkdownLinkFile = useCallback(async (path: string): Promise<boolean> => {
    try {
      openFileInNewTab(await fileAccess.openMarkdownFileAtPath(path))
      return true
    } catch (error) {
      setStatusMessage(getErrorMessage(error, fileOperationFailedMessage))
      return false
    }
  }, [fileAccess, fileOperationFailedMessage, openFileInNewTab, setStatusMessage])

  const handleLocateRecentFile = useCallback(async (previousPath: string) => {
    onCloseMenu()
    try {
      const file = await fileAccess.openMarkdownFile()
      if (!file) return
      openFileInNewTab(file)
      if (file.path !== previousPath) forgetRecentFile(previousPath)
    } catch { setStatusMessage(recentFileOpenFailedMessage) }
  }, [fileAccess, forgetRecentFile, onCloseMenu, openFileInNewTab, recentFileOpenFailedMessage, setStatusMessage])

  const saveDocument = useCallback((forceSaveAs = false, targetTabId = activeIdRef.current): Promise<string | null> => {
    if (!targetTabId) {
      return Promise.resolve(null)
    }

    const existingOperation = saveOperationsRef.current.get(targetTabId)
    if (existingOperation && !forceSaveAs) {
      return existingOperation
    }

    const runSave = async (): Promise<string | null> => {
      const document = findDocument(targetTabId)
      if (!document) {
        return null
      }

      try {
        const currentPath = document.path
        const contentToSave = document.content
        const isSaveAs = forceSaveAs || !currentPath
        const defaultPath = currentPath ?? (document.title !== 'Untitled.md'
          ? document.title
          : (await import('../domain/markdownFilename')).createMarkdownSuggestedFilename(contentToSave))
        const savedResult = isSaveAs
          ? await fileAccess.saveMarkdownFileAs(contentToSave, defaultPath)
          : document.savedRevision
            ? await fileAccess.saveMarkdownFile(currentPath, contentToSave, document.savedRevision)
            : await fileAccess.saveMarkdownFile(currentPath, contentToSave)

        if (typeof savedResult === 'string') {
          clearDraft(targetTabId)
          updateTabDocument(targetTabId, (current) => markDocumentSaved(current, savedResult, contentToSave, current.savedRevision))
          patchTab(targetTabId, { externalFileState: null, statusMessage: 'saved' })
          if (isSaveAs) rememberRecentFile(savedResult)
          return savedResult
        }

        const structuredResult = savedResult as Exclude<typeof savedResult, string | null>
        if (structuredResult && ((isSaveAs && 'revision' in structuredResult) || (!isSaveAs && 'status' in structuredResult && (structuredResult as import('../platform/fileAccess').MarkdownFileSaveResult).status === 'saved'))) {
          const completed = structuredResult as { path: string; revision: string }
          const savedPath = completed.path
          clearDraft(targetTabId)
          updateTabDocument(targetTabId, (current) => markDocumentSaved(current, savedPath, contentToSave, completed.revision))
          patchTab(targetTabId, { externalFileState: null, statusMessage: 'saved' })
          if (isSaveAs) {
            rememberRecentFile(savedPath)
          }
          return savedPath
        }
        if (savedResult && !isSaveAs && 'status' in savedResult) {
          if (savedResult.status === 'conflict') {
            patchTab(targetTabId, { externalFileState: { kind: 'conflict', file: savedResult.file }, statusMessage: externalFileSaveBlockedMessage })
          } else if (savedResult.status === 'missing') {
            patchTab(targetTabId, { externalFileState: { kind: 'missing', path: savedResult.path }, statusMessage: externalFileMissingMessage })
          }
        }
      } catch (error) {
        patchTab(targetTabId, { statusMessage: getErrorMessage(error, fileOperationFailedMessage) })
      }

      return null
    }

    const operation = existingOperation
      ? existingOperation.then(() => runSave())
      : runSave()
    saveOperationsRef.current.set(targetTabId, operation)
    patchTab(targetTabId, { isSaving: true })
    void operation.finally(() => {
      if (saveOperationsRef.current.get(targetTabId) === operation) {
        saveOperationsRef.current.delete(targetTabId)
        patchTab(targetTabId, { isSaving: false })
      }
    })
    return operation
  }, [clearDraft, externalFileMissingMessage, externalFileSaveBlockedMessage, fileAccess, fileOperationFailedMessage, findDocument, patchTab, rememberRecentFile, updateTabDocument])

  /** Saves every dirty tab. Returns false if any tab has no file yet. */
  const saveAllDirtyTabs = useCallback(async (): Promise<boolean> => {
    const dirtyTabs = stateRef.current.tabs.filter((tab) => tab.document.isDirty)
    if (dirtyTabs.some((tab) => !tab.document.path)) {
      return false
    }

    for (const tab of dirtyTabs) {
      const saved = await saveDocument(false, tab.id)
      if (!saved) {
        return false
      }
    }
    return true
  }, [saveDocument, stateRef])

  const handleSaveFile = useCallback(async (): Promise<boolean> => {
    onCloseMenu()
    if (externalFileState) {
      setStatusMessage(externalFileSaveBlockedMessage)
      return false
    }
    return Boolean(await saveDocument())
  }, [externalFileSaveBlockedMessage, externalFileState, onCloseMenu, saveDocument, setStatusMessage])

  const resolveUnsavedChanges = useCallback(async (choice: 'save' | 'discard' | 'cancel') => {
    const resolver = unsavedResolverRef.current
    if (!resolver || isSaving) return
    const proceed = choice === 'save' ? await handleSaveFile() : choice === 'discard'
    unsavedResolverRef.current = null
    setPendingUnsavedTitle(null)
    resolver(proceed)
  }, [handleSaveFile, isSaving])

  const handleKeepLocalEdits = useCallback(() => {
    const tabId = activeIdRef.current
    const conflict = tabId ? stateRef.current.tabs.find((tab) => tab.id === tabId)?.externalFileState : null
    if (!tabId || conflict?.kind !== 'conflict') return
    const external = conflict.file
    updateTabDocument(tabId, (current) => markDocumentSaved(current, external.path, external.content, external.revision))
    patchTab(tabId, { externalFileState: null, statusMessage: 'unsaved' })
  }, [patchTab, stateRef, updateTabDocument])

  const handleReloadDiskVersion = useCallback(() => {
    const tabId = activeIdRef.current
    const conflict = tabId ? stateRef.current.tabs.find((tab) => tab.id === tabId)?.externalFileState : null
    if (!tabId || conflict?.kind !== 'conflict') return
    const external = conflict.file
    clearDraft(tabId)
    updateTabDocument(tabId, (current) => replaceDocumentContent(current, external.content, external.path, external.revision))
    patchTab(tabId, { externalFileState: null, statusMessage: externalFileUpdatedMessage })
  }, [clearDraft, externalFileUpdatedMessage, patchTab, stateRef, updateTabDocument])

  const handleSaveFileAs = useCallback(async () => {
    onCloseMenu()
    await saveDocument(true)
  }, [onCloseMenu, saveDocument])

  const ensureDocumentPath = useCallback(async (): Promise<string | null> => {
    return markdownDocument.path ?? saveDocument(true)
  }, [markdownDocument.path, saveDocument])

  const handleContentChange = useCallback((content: string) => {
    const tabId = activeIdRef.current
    if (!tabId) return
    const document = findDocument(tabId)
    const isDirty = document ? content !== document.savedContent : true
    updateTabDocument(tabId, (current) => updateDocumentDraft(current, content))
    patchTab(tabId, { statusMessage: isDirty ? 'unsaved' : 'saved' })
  }, [findDocument, patchTab, updateTabDocument])

  const transformDocumentContent = useCallback((transform: (content: string) => string) => {
    const tabId = activeIdRef.current
    if (!tabId) return
    const document = findDocument(tabId)
    if (!document) return
    const nextContent = transform(document.content)
    updateTabDocument(tabId, (current) => updateDocumentDraft(current, nextContent))
    patchTab(tabId, { statusMessage: nextContent !== document.savedContent ? 'unsaved' : 'saved' })
  }, [findDocument, patchTab, updateTabDocument])

  const restorePendingDraft = useCallback(async () => {
    const draft = pendingDraft
    if (!draft) {
      return
    }

    setPendingDraft(null)

    let restoredDocument: MarkdownDocument
    if (draft.path) {
      try {
        const file = await fileAccess.openMarkdownFileAtPath(draft.path)
        restoredDocument = updateDocumentDraft(
          replaceDocumentContent(createInitialDocument(), file.content, file.path, file.revision),
          draft.content,
        )
        rememberRecentFile(file.path)
      } catch {
        restoredDocument = updateDocumentDraft(createInitialDocument(), draft.content)
      }
    } else {
      restoredDocument = updateDocumentDraft(createInitialDocument(), draft.content)
    }

    // Reuse the draft id so the restored tab keeps backing up to the same slot.
    actions.add({ ...createDocumentTab(draft.id, restoredDocument), statusMessage: restoredDocument.isDirty ? 'unsaved' : 'saved' })
    onViewModeChange('edit')
    if (!restoredDocument.isDirty) {
      clearDraft(draft.id)
    }
  }, [actions, clearDraft, fileAccess, onViewModeChange, pendingDraft, rememberRecentFile])

  const discardPendingDraft = useCallback(() => {
    if (!pendingDraft) {
      return
    }

    clearDocumentDraft(pendingDraft.id)
    setPendingDraft(null)
  }, [pendingDraft])

  const handleClearRecentFiles = useCallback(() => {
    clearRecentFiles()
    setRecentFiles([])
    setFailedRecentPaths([])
    onCloseMenu()
  }, [onCloseMenu])

  return {
    pendingUnsavedTitle,
    resolveUnsavedChanges,
    failedRecentPaths,
    forgetRecentFile,
    handleLocateRecentFile,
    discardPendingDraft,
    documentSessionId,
    externalFileState,
    handleClearRecentFiles,
    handleContentChange,
    handleKeepLocalEdits,
    handleNewDocument,
    handleImportedDocument,
    handleOpenFile,
    handleOpenRecentFile,
    handleReloadDiskVersion,
    handleSaveFile,
    handleSaveFileAs,
    saveAllDirtyTabs,
    ensureDocumentPath,
    isSaving,
    isWelcomeVisible,
    markdownDocument,
    canDiscardUnsavedChanges,
    openMarkdownLinkFile,
    pendingDraft: isStartupResolved ? pendingDraft : null,
    recentFiles,
    restorePendingDraft,
    retryExternalFile: checkCurrentFile,
    refreshFromDisk: () => checkCurrentFile(true),
    setStatusMessage,
    statusMessage,
    transformDocumentContent,
  }
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage
}
