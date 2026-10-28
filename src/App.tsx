import { flushSync } from 'react-dom'
import { useSplitLayout } from './hooks/useSplitLayout'
import { UnsavedChangesDialog } from './components/dialogs/UnsavedChangesDialog'
import { ExportWarningDialog } from './components/dialogs/ExportWarningDialog'
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { FolderOpen, ListTree } from 'lucide-react'
import './App.css'
import { SplitScrollControl } from './components/workspace/SplitScrollControl'
import { SplitSwapControl } from './components/workspace/SplitSwapControl'
import { Toast } from './components/shell/Toast'
import { AppDialogs } from './components/shell/AppDialogs'
import { AppToolbar } from './components/shell/AppToolbar'
import { AppLogo } from './components/shell/AppLogo'
import { DocumentOutline } from './components/workspace/DocumentOutline'
import { PlaylistPanel } from './components/workspace/PlaylistPanel'
import { playlistItemFromPath } from './domain/playlists'
import { normalizeReadingSessionPath } from './domain/readingSessions'
import { SidePanelColumn } from './components/workspace/SidePanelColumn'
import { HistoryDrawer } from './components/history/HistoryDrawer'
import { DocumentSearchBar } from './components/editor/DocumentSearchBar'
import { ExternalFileBanner } from './components/workspace/ExternalFileBanner'
import { ImageImportNotice } from './components/editor/ImageImportNotice'
import { EditorStatusBar } from './components/editor/EditorStatusBar'
import { LazyMarkdownPreview, preloadMarkdownPreview } from './components/preview/lazyMarkdownPreview'
import { MarkdownEditor, type MarkdownEditorHandle } from './components/editor/MarkdownEditor'
import { WelcomeWorkspace } from './components/workspace/WelcomeWorkspace'
import {
  getLanguageLocale,
  getLoadedTranslation,
  loadAppLanguage,
  loadTranslation,
  saveAppLanguage,
  translations,
  type AppLanguage,
  type Translation,
} from './i18n'
import { useOutlineNavigation } from './hooks/useOutlineNavigation'
import { useAppMenu } from './hooks/useAppMenu'
import { useAppUpdater } from './hooks/useAppUpdater'
import { useAutoSave, useAutoSavePreference } from './hooks/useAutoSave'
import { useSaveOnClose } from './hooks/useSaveOnClose'
import { useGitHistory } from './hooks/useGitHistory'
import { useSidePanels } from './hooks/useSidePanels'
import { useDocumentController } from './hooks/useDocumentController'
import { useDocumentSearch } from './hooks/useDocumentSearch'
import { useImageInsertion } from './hooks/useImageInsertion'
import { usePreviewController } from './hooks/usePreviewController'
import { usePlaylists } from './hooks/usePlaylists'
import { useCollectionsFileDrop } from './hooks/useCollectionsFileDrop'
import { useReadingSession } from './hooks/useReadingSession'
import { useReadingPreferences } from './hooks/useReadingPreferences'
import { useTransientToast } from './hooks/useTransientToast'
import { useSplitScrollSync } from './hooks/useSplitScrollSync'
import { useDocumentExport } from './hooks/useDocumentExport'
import type { FileAccess } from './platform/fileAccess'
import type { DocxImportStatus } from './platform/fileAccess'
import { openExternalLink } from './platform/externalLinks'
import type { AppUpdateClient } from './platform/appUpdates'
import { unsupportedAppUpdateClient } from './platform/unsupportedAppUpdates'
import {
  matchesShortcut,
  withShortcutTitle,
} from './platform/keyboardShortcuts'
import { useFileShortcuts } from './hooks/useFileShortcuts'
import { getLineStartOffsets } from './domain/documentStatistics'
import { measureEditorLinePositions } from './domain/editorLinePositions'
import { createEditorSelectionStore } from './domain/editorSelectionStore'
import type { ReadingViewMode } from './domain/readingSessions'
import { nativeWindowFrame, type AppWindowFrame } from './platform/windowFrame'
import type { PanelSide } from './domain/sidePanels'

type ViewMode = ReadingViewMode

type AppProps = {
  appUpdateClient?: AppUpdateClient
  fileAccess: FileAccess
  initialLanguage?: AppLanguage
  supportsAppUpdates?: boolean
  windowFrame?: AppWindowFrame
}

type AppWorkspaceProps = Omit<AppProps, 'initialLanguage'> & {
  language: AppLanguage
  t: Translation
  onLanguageSelect: (language: AppLanguage) => void
}

function AppWorkspace({
  appUpdateClient = unsupportedAppUpdateClient,
  fileAccess,
  language,
  t,
  onLanguageSelect,
  supportsAppUpdates = true,
  windowFrame = nativeWindowFrame,
}: AppWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const splitLayout = useSplitLayout()
  const [recentFilesHidden, setRecentFilesHidden] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isReadingSettingsOpen, setIsReadingSettingsOpen] = useState(false)
  const [isDocxImportOpen, setIsDocxImportOpen] = useState(false)
  const [docxImportPhase, setDocxImportPhase] = useState<'checking' | 'idle' | 'installing' | 'converting'>('idle')
  const [docxImportStatus, setDocxImportStatus] = useState<DocxImportStatus | null>(null)
  const [editorSelectionStore] = useState(() => createEditorSelectionStore())
  const previewPanelRef = useRef<HTMLElement | null>(null)
  const previewRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const {
    effectiveTheme,
    preferences: readingPreferences,
    resetPreferences: resetReadingPreferences,
    updatePreferences: updateReadingPreferences,
  } = useReadingPreferences()
  const readingFontKey = `${readingPreferences.fontFamily}:${readingPreferences.customFontFamily ?? ''}`
  const {
    activeMenu,
    closeMenu,
    handleMenuKeyDown,
    menuBarRef,
    toggleMenu,
  } = useAppMenu()
  const {
    showAppToast,
    showPreviewToast,
    toast,
  } = useTransientToast()
  const {
    failedRecentPaths,
    forgetRecentFile,
    handleLocateRecentFile,
    pendingUnsavedTitle,
    resolveUnsavedChanges,
    handleClearRecentFiles,
    handleContentChange,
    canDiscardUnsavedChanges,
    handleKeepLocalEdits,
    handleNewDocument,
    handleImportedDocument,
    handleOpenFile,
    handleOpenRecentFile,
    handleReloadDiskVersion,
    handleSaveFile,
    handleSaveFileAs,
    ensureDocumentPath,
    isSaving,
    isWelcomeVisible,
    markdownDocument,
    openMarkdownLinkFile,
    pendingDraft,
    recentFiles,
    restorePendingDraft,
    retryExternalFile,
    refreshFromDisk,
    discardPendingDraft,
    documentSessionId,
    externalFileState,
    setStatusMessage,
    statusMessage,
    transformDocumentContent,
  } = useDocumentController({
    fileAccess,
    draftBackupFailedMessage: t.draftBackupFailed,
    externalFileUpdatedMessage: t.externalFileUpdated,
    externalFileConflictMessage: t.externalFileConflict,
    externalFileMissingMessage: t.externalFileMissing,
    externalFileSaveBlockedMessage: t.externalFileSaveBlocked,
    recentFileOpenFailedMessage: t.recentFileOpenFailed,
    fileOperationFailedMessage: t.fileOperationFailed,
    fileUpToDateMessage: t.fileUpToDate,
    onCloseMenu: closeMenu,
    onViewModeChange: setViewMode,
  })
  const [autoSaveEnabled] = useAutoSavePreference()
  useAutoSave({
    enabled: autoSaveEnabled,
    documentPath: markdownDocument.path,
    content: markdownDocument.content,
    isDirty: markdownDocument.isDirty,
    isSaving,
    saveBlocked: externalFileState !== null,
    onSave: handleSaveFile,
  })
  useSaveOnClose({
    enabled: autoSaveEnabled,
    documentPath: markdownDocument.path,
    isDirty: markdownDocument.isDirty,
    saveBlocked: externalFileState !== null,
    onSave: handleSaveFile,
  })
  const sidePanels = useSidePanels()
  const playlists = usePlaylists()
  const [isCollectionsDropTarget, setIsCollectionsDropTarget] = useState(false)
  const addPlaylistItems = useCallback((paths: string[]) => {
    if (paths.length === 0) {
      return
    }
    const items = paths.map((path) => playlistItemFromPath(path))
    const existing = new Set(
      (playlists.activePlaylist?.items ?? []).map((item) => normalizeReadingSessionPath(item.path)),
    )
    const fresh = items.filter((item) => !existing.has(normalizeReadingSessionPath(item.path)))
    if (playlists.state.playlists.length === 0) {
      playlists.create(t.playlistDefaultName(1), items)
    } else if (playlists.state.activePlaylistId) {
      playlists.addItems(playlists.state.activePlaylistId, fresh.length > 0 ? fresh : items)
    }
    sidePanels.update({ collectionsOpen: true })
    showAppToast(fresh.length > 0 ? t.addedToCollections(fresh.length) : t.alreadyInPlaylist)
  }, [playlists, showAppToast, sidePanels, t])
  const handleAddDocuments = useCallback(async () => {
    const pick = fileAccess.pickMarkdownFiles
    if (!pick) {
      return
    }
    addPlaylistItems(await pick())
  }, [addPlaylistItems, fileAccess])
  useCollectionsFileDrop({
    enabled: true,
    onDropFiles: addPlaylistItems,
    onHoverChange: setIsCollectionsDropTarget,
  })
  const handleOpenPlaylistItem = useCallback((path: string) => {
    void handleOpenRecentFile(path)
  }, [handleOpenRecentFile])
  const [panelResize, setPanelResize] = useState<{
    kind: 'width' | 'stack'
    side: PanelSide
    startX: number
    startY: number
    startValue: number
    columnHeight: number
  } | null>(null)

  useEffect(() => {
    if (!panelResize) {
      return
    }
    const resize = panelResize

    function handlePointerMove(event: PointerEvent) {
      if (resize.kind === 'width') {
        const delta = event.clientX - resize.startX
        sidePanels.setWidth(resize.side, resize.startValue + (resize.side === 'left' ? delta : -delta))
      } else if (resize.columnHeight > 0) {
        const ratio = resize.startValue + (event.clientY - resize.startY) / resize.columnHeight * 100
        sidePanels.setStack(resize.side, ratio)
      }
    }

    function handlePointerUp() {
      setPanelResize(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [panelResize, sidePanels])

  const beginPanelWidthResize = useCallback((side: PanelSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setPanelResize({
      kind: 'width',
      side,
      startX: event.clientX,
      startY: 0,
      startValue: sidePanels.state.widths[side],
      columnHeight: 0,
    })
  }, [sidePanels.state.widths])

  const handlePanelWidthKeyDown = useCallback((side: PanelSide, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0
    if (!step) {
      return
    }
    event.preventDefault()
    sidePanels.setWidth(side, sidePanels.state.widths[side] + (side === 'left' ? step : -step))
  }, [sidePanels])

  const beginPanelStackResize = useCallback((side: PanelSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const column = event.currentTarget.parentElement
    setPanelResize({
      kind: 'stack',
      side,
      startX: 0,
      startY: event.clientY,
      startValue: sidePanels.state.stacks[side],
      columnHeight: column ? column.getBoundingClientRect().height : 0,
    })
  }, [sidePanels.state.stacks])

  const handlePanelStackKeyDown = useCallback((side: PanelSide, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0
    if (!step) {
      return
    }
    event.preventDefault()
    sidePanels.setStack(side, sidePanels.state.stacks[side] + step)
  }, [sidePanels])

  const closeDocxImport = useCallback(() => {
    if (docxImportPhase === 'installing' || docxImportPhase === 'converting') {
      void fileAccess.docxImport?.cancel()
    }
    setDocxImportPhase('idle')
    setIsDocxImportOpen(false)
  }, [docxImportPhase, fileAccess.docxImport])
  const checkDocxImport = useCallback(async () => {
    const importer = fileAccess.docxImport
    if (!importer) return
    setDocxImportPhase('checking')
    try {
      setDocxImportStatus(await importer.getStatus())
    } catch (error) {
      setDocxImportStatus({ state: 'componentsBroken', canInstallPython: false, message: getErrorMessage(error) })
    } finally {
      setDocxImportPhase('idle')
    }
  }, [fileAccess.docxImport])
  const openDocxImport = useCallback(() => {
    if (!fileAccess.docxImport) return
    closeMenu()
    menuBarRef.current?.querySelector<HTMLButtonElement>('[data-menu-trigger="file"]')?.focus()
    setIsDocxImportOpen(true)
    if (!docxImportStatus) void checkDocxImport()
  }, [checkDocxImport, closeMenu, docxImportStatus, fileAccess.docxImport, menuBarRef])
  const installDocxImport = useCallback(async () => {
    const importer = fileAccess.docxImport
    if (!importer) return
    setDocxImportPhase('installing')
    try {
      setDocxImportStatus(await importer.install())
    } catch (error) {
      setDocxImportStatus({ state: 'componentsBroken', canInstallPython: false, message: getErrorMessage(error) })
    } finally {
      setDocxImportPhase('idle')
    }
  }, [fileAccess.docxImport])
  const selectDocxPython = useCallback(async () => {
    const importer = fileAccess.docxImport
    if (!importer) return
    setDocxImportPhase('checking')
    try {
      setDocxImportStatus(await importer.selectPython())
    } catch (error) {
      setDocxImportStatus({ state: 'pythonUnsupported', canInstallPython: true, message: getErrorMessage(error) })
    } finally {
      setDocxImportPhase('idle')
    }
  }, [fileAccess.docxImport])
  const convertDocx = useCallback(async () => {
    const importer = fileAccess.docxImport
    if (!importer || !await canDiscardUnsavedChanges()) return
    setDocxImportPhase('converting')
    try {
      const imported = await importer.importFile()
      if (imported) {
        handleImportedDocument(imported.content, imported.suggestedFilename)
        setIsDocxImportOpen(false)
        setStatusMessage(t.docxImportSuccess)
      }
    } catch (error) {
      setDocxImportStatus({ state: 'componentsBroken', canInstallPython: false, message: getErrorMessage(error) })
    } finally {
      setDocxImportPhase('idle')
    }
  }, [canDiscardUnsavedChanges, fileAccess.docxImport, handleImportedDocument, setStatusMessage, t.docxImportSuccess])
  const handleNewDocumentWithPreviewPreload = useCallback(() => {
    preloadMarkdownPreview()
    return handleNewDocument()
  }, [handleNewDocument])
  const handleOpenFileWithPreviewPreload = useCallback(async () => {
    preloadMarkdownPreview()
    await handleOpenFile()
  }, [handleOpenFile])
  const handleOpenRecentFileWithPreviewPreload = useCallback(async (path: string) => {
    preloadMarkdownPreview()
    await handleOpenRecentFile(path)
  }, [handleOpenRecentFile])
  const {
    checkForUpdates,
    dismiss: dismissUpdateDialog,
    distribution,
    errorMessage: updateErrorMessage,
    installUpdate,
    openPortableDownload,
    phase: updatePhase,
    progress: updateProgress,
    update: availableUpdate,
  } = useAppUpdater({
    client: appUpdateClient,
    checkFailedMessage: t.updateCheckFailed,
    installFailedMessage: t.updateInstallFailed,
    releaseOpenFailedMessage: t.updateReleaseOpenFailed,
    unsupportedMessage: t.updateUnavailable,
  })
  const shortcutPlatform = useFileShortcuts({
    supportsNativeFiles: fileAccess.supportsNativeFiles,
    onCloseMenu: closeMenu,
    onNew: handleNewDocumentWithPreviewPreload,
    onOpen: handleOpenFileWithPreviewPreload,
    onSave: handleSaveFile,
    onSaveAs: handleSaveFileAs,
    onSaveSuccess: () => showAppToast(t.saved),
    onRefresh: () => void refreshFromDisk(),
  })
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const skipNextHistorySnapshotRef = useRef(false)
  const lastSavedRef = useRef<{ path: string | null; revision: string | null }>({ path: null, revision: null })
  const history = useGitHistory({
    path: markdownDocument.path,
    isOpen: isHistoryOpen,
    prepareRestore: async () => {
      if (!markdownDocument.isDirty) {
        return true
      }
      skipNextHistorySnapshotRef.current = true
      const saved = await handleSaveFile()
      if (!saved) {
        skipNextHistorySnapshotRef.current = false
      }
      return saved
    },
    onRestored: () => {
      skipNextHistorySnapshotRef.current = true
      const currentPath = markdownDocument.path
      if (currentPath) {
        void handleOpenRecentFile(currentPath)
      }
    },
  })
  const { snapshotAfterSave } = history
  useEffect(() => {
    const path = markdownDocument.path
    const revision = markdownDocument.savedRevision ?? null
    const last = lastSavedRef.current
    if (last.path !== path) {
      lastSavedRef.current = { path, revision }
      return
    }
    if (revision === last.revision) {
      return
    }
    lastSavedRef.current = { path, revision }
    if (!path || !revision) {
      return
    }
    if (skipNextHistorySnapshotRef.current) {
      skipNextHistorySnapshotRef.current = false
      return
    }
    void snapshotAfterSave()
  }, [markdownDocument.path, markdownDocument.savedRevision, snapshotAfterSave])

  const { toggleSwapped } = splitLayout
  useEffect(() => {
    function handleSwapShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || !matchesShortcut(event, { key: 'x', shiftKey: true }, shortcutPlatform)) {
        return
      }
      event.preventDefault()
      toggleSwapped()
    }

    window.addEventListener('keydown', handleSwapShortcut)
    return () => window.removeEventListener('keydown', handleSwapShortcut)
  }, [shortcutPlatform, toggleSwapped])
  const {
    freezePreview,
    previewContent,
    previewZoom,
    prepareSplitPreview,
    restorePreviewZoom,
  } = usePreviewController({
    content: markdownDocument.content,
    isEnabled: !isWelcomeVisible,
    isPreview: !isWelcomeVisible && viewMode === 'preview',
    isSplit: viewMode === 'split',
    previewPanelRef,
    onZoomChange: showPreviewToast,
  })
  const {
    isSplitScrollSyncEnabled,
    toggleSplitScrollSync,
    prepareViewChange,
  } = useSplitScrollSync({
    editorRef,
    isSplit: viewMode === 'split',
    viewMode,
    previewContent,
    documentSessionId,
    readingFontKey,
    previewPanelRef,
    previewRef,
    previewZoom,
  })
  const handleToggleSplitScrollSync = useCallback(() => {
    const nextEnabled = !isSplitScrollSyncEnabled
    toggleSplitScrollSync()
    showAppToast(nextEnabled ? t.splitScrollSyncEnabled : t.splitScrollSyncDisabled)
  }, [isSplitScrollSyncEnabled, showAppToast, t, toggleSplitScrollSync])
  const {
    activeOutlineId,
    collapsedOutlineIds,
    setOutlineSubtree,
    toggleOutlineBranch,
    setAllOutlineBranches,
    closeOutline,
    handleOutlineJump,
    isOutlineOpen,
    openOutline,
    outlineDepth,
    outlineItems,
    queueHeadingJump,
    setOutlineDepth,
  } = useOutlineNavigation({
    documentSessionId,
    content: markdownDocument.content,
    isPreview: !isWelcomeVisible && viewMode !== 'edit',
    readingFontKey,
    previewZoom,
    previewPanelRef,
    previewRef,
  })
  const toggleOutlineOpen = useCallback((open: boolean) => {
    if (open) {
      openOutline()
    } else {
      closeOutline()
    }
  }, [closeOutline, openOutline])
  const handleOpenMarkdownLink = useCallback(async (path: string, headingId?: string) => {
    preloadMarkdownPreview()
    if (await openMarkdownLinkFile(path)) {
      queueHeadingJump(headingId)
    }
  }, [openMarkdownLinkFile, queueHeadingJump])
  const handleRestoreReadingSession = useCallback((session: {
    previewZoom: number
    viewMode: ViewMode
  }) => {
    restorePreviewZoom(session.previewZoom)
    setViewMode(session.viewMode)
  }, [restorePreviewZoom])
  useReadingSession({
    documentPath: markdownDocument.path,
    isOutlineOpen,
    onRestore: handleRestoreReadingSession,
    outlineWidth: sidePanels.state.widths[sidePanels.state.outlineSide],
    previewPanelRef,
    previewZoom,
    viewMode,
  })
  const documentSearch = useDocumentSearch({
    enabled: !isWelcomeVisible,
    content: markdownDocument.content,
    editorRef,
    onContentChange: handleContentChange,
    onOpen: closeMenu,
    viewMode,
  })
  const {
    dismissFailedImages,
    failedFiles: failedImageImports,
    importImages,
    isImportingImages,
    progress: imageImportProgress,
    retryFailedImages,
  } = useImageInsertion({
    content: markdownDocument.content,
    contextKey: documentSessionId,
    documentPath: markdownDocument.path,
    ensureDocumentPath,
    fileAccess,
    messages: {
      failed: t.imageImportFailed,
      invalid: t.imageImportInvalid,
      partial: t.imageImportPartial,
      success: t.imageImportSuccess,
      unsupported: t.imageImportUnsupported,
    },
    onContentTransform: transformDocumentContent,
    onNotify: showAppToast,
  })

  const prepareExportPreview = useCallback(() => flushSync(() => freezePreview()), [freezePreview])
  const { exportDocx: handleExportDocx, exportHtml: handleExportHtml, exportPdf: handleExportPdf,
    isExporting, lastExportPath, isWordWarningOpen, dismissWordWarning, confirmWordExport, exportHtmlInstead } = useDocumentExport({
    closeMenu,
    preparePreview: prepareExportPreview,
    document: markdownDocument,
    fileAccess,
    language,
    previewRef,
    setStatusMessage,
    t,
  })

  async function handleRevealRecentFile(path: string) {
    try {
      await fileAccess.revealFileInFolder(path)
    } catch (error) {
      setStatusMessage(getErrorMessage(error))
    }
  }

  function handleOpenAboutFromAppMenu() {
    closeMenu()
    menuBarRef.current?.querySelector<HTMLButtonElement>('[data-menu-trigger="app"]')?.focus()
    setIsAboutOpen(true)
  }

  function handleLanguageSelect(nextLanguage: AppLanguage) {
    closeMenu()
    onLanguageSelect(nextLanguage)
  }

  function handleOpenReadingSettings() {
    closeMenu()
    menuBarRef.current?.querySelector<HTMLButtonElement>('[data-menu-trigger="reading"]')?.focus()
    setIsReadingSettingsOpen(true)
  }

  async function handleCheckForUpdates() {
    closeMenu()
    await checkForUpdates()
  }

  async function handleInstallUpdate() {
    if (markdownDocument.isDirty) {
      showAppToast(t.updateSaveFirst)
      return
    }

    await installUpdate()
  }

  const workspaceClasses = [
    'workspace',
    viewMode === 'split' && splitLayout.swapped ? 'split-swapped' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const outlineOnLeft = isOutlineOpen && sidePanels.state.outlineSide === 'left'
  const outlineOnRight = isOutlineOpen && sidePanels.state.outlineSide === 'right'
  const collectionsOnLeft = sidePanels.state.collectionsOpen && sidePanels.state.collectionsSide === 'left'
  const collectionsOnRight = sidePanels.state.collectionsOpen && sidePanels.state.collectionsSide === 'right'
  const leftHasPanels = outlineOnLeft || collectionsOnLeft
  const rightHasPanels = outlineOnRight || collectionsOnRight

  const outlineLineById = useMemo(() => {
    const map = new Map<string, number>()
    const lines = markdownDocument.content.split('\n')
    const headings = lines.flatMap((line, index) => {
      const match = /^#{1,6}\s+(.*)$/.exec(line.trim())
      return match ? [{ line: index, text: match[1].trim() }] : []
    })
    let cursor = 0
    for (const item of outlineItems) {
      for (let index = cursor; index < headings.length; index += 1) {
        if (headings[index].text === item.text) {
          map.set(item.id, headings[index].line)
          cursor = index + 1
          break
        }
      }
    }
    return map
  }, [markdownDocument.content, outlineItems])

  const handleOutlineJumpForMode = useCallback((headingId: string) => {
    if (viewMode !== 'edit') {
      handleOutlineJump(headingId)
      return
    }
    const line = outlineLineById.get(headingId)
    const editor = editorRef.current?.getScrollElement()
    if (line === undefined || !editor) {
      handleOutlineJump(headingId)
      return
    }
    const tops = measureEditorLinePositions(editor)
    editor.scrollTop = tops[line] ?? 0
    editor.focus()
    const offset = getLineStartOffsets(markdownDocument.content)[line] ?? 0
    editor.setSelectionRange(offset, offset)
  }, [handleOutlineJump, markdownDocument.content, outlineLineById, viewMode])

  const outlinePanelNode = (
    <DocumentOutline
      collapsedIds={collapsedOutlineIds}
      onSetSubtree={setOutlineSubtree}
      onToggleBranch={toggleOutlineBranch}
      onSetAllBranches={setAllOutlineBranches}
      items={outlineItems}
      activeId={activeOutlineId}
      maxDepth={outlineDepth}
      onJump={handleOutlineJumpForMode}
      onMaxDepthChange={setOutlineDepth}
      onClose={closeOutline}
      t={t}
    />
  )
  const collectionsPanelNode = (
    <PlaylistPanel
      state={playlists.state}
      activePlaylist={playlists.activePlaylist}
      currentPath={markdownDocument.path}
      currentTitle={markdownDocument.title}
      t={t}
      onCreate={playlists.create}
      onSelect={playlists.select}
      onRename={playlists.rename}
      onDelete={playlists.remove}
      onAddCurrent={playlists.addItem}
      onRemoveItem={playlists.removeItem}
      onMoveItem={playlists.moveItem}
      onOpenItem={handleOpenPlaylistItem}
      onAddDocuments={() => void handleAddDocuments()}
      onReload={playlists.reload}
      isDropTarget={isCollectionsDropTarget}
      onClose={() => sidePanels.update({ collectionsOpen: false })}
    />
  )
  const panelColumnLabels = {
    outlinePanel: t.outlinePanel,
    collectionsPanel: t.playlistsTab,
    width: t.resizeSidePanel,
    stack: t.resizePanelStack,
  }
  const renderReopenButtons = (side: PanelSide) => {
    const buttons = []
    if (!isOutlineOpen && sidePanels.state.outlineSide === side) {
      buttons.push(
        <button key="outline" type="button" className="panel-reopen-button" onClick={openOutline} aria-label={t.expandOutline} title={t.expandOutline}>
          <ListTree aria-hidden="true" />
          <span>{t.outlineTab}</span>
        </button>,
      )
    }
    if (!sidePanels.state.collectionsOpen && sidePanels.state.collectionsSide === side) {
      buttons.push(
        <button key="collections" type="button" className="panel-reopen-button" onClick={() => sidePanels.update({ collectionsOpen: true })} aria-label={t.expandCollections} title={t.expandCollections}>
          <FolderOpen aria-hidden="true" />
          <span>{t.playlistsTab}</span>
        </button>,
      )
    }
    return buttons.length > 0 ? <div className={`panel-reopen-stack ${side}`}>{buttons}</div> : null
  }

  const nativeFileTitle = fileAccess.supportsNativeFiles
    ? undefined
    : t.nativeFileUnavailable
  const canRevealFiles = fileAccess.canRevealFile ?? fileAccess.supportsNativeFiles
  const updateActionTitle = distribution === 'unsupported' ? t.updateUnavailable : undefined
  const newTitle = withShortcutTitle(t.createNewLabel, { key: 'n' }, shortcutPlatform)
  const openTitle = withShortcutTitle(t.openLabel, { key: 'o' }, shortcutPlatform)
  const saveTitle = withShortcutTitle(t.saveLabel, { key: 's' }, shortcutPlatform)
  const saveAsTitle = withShortcutTitle(t.saveAsLabel, { key: 's', shiftKey: true }, shortcutPlatform)
  const previewPanelStyle = { '--preview-zoom': previewZoom } as CSSProperties
  const lineStartOffsets = useMemo(
    () => getLineStartOffsets(markdownDocument.content),
    [markdownDocument.content],
  )

  const welcomeStatus = !['saved', 'opened', 'unsaved'].includes(statusMessage)
    ? statusMessage
    : null
  const operationStatus = !['saved', 'opened', 'unsaved'].includes(statusMessage)
    ? statusMessage
    : null
  const visibleOperationStatus = imageImportProgress
    ? t.imageImportProgress(imageImportProgress.completed, imageImportProgress.total)
    : operationStatus

  return (
    <main
      className={`app-shell view-${viewMode} ${isWelcomeVisible ? 'welcome-open' : ''}`}
      data-mdview-color-theme={effectiveTheme}
      lang={getLanguageLocale(language)}
    >
      <AppToolbar
        activeMenu={activeMenu}
        isExporting={isExporting}
        saveStateLabel={isSaving ? t.saving : !markdownDocument.path ? t.notSavedToFile : markdownDocument.isDirty ? t.unsaved : t.saved}
        hasUnsavedChanges={!markdownDocument.path || markdownDocument.isDirty}
        failedRecentPaths={failedRecentPaths}
        recentFilesHidden={recentFilesHidden}
        onToggleRecentVisibility={() => setRecentFilesHidden((hidden) => !hidden)}
        onRemoveRecent={forgetRecentFile}
        onLocateRecent={(path) => void handleLocateRecentFile(path)}
        canRevealFiles={canRevealFiles}
        documentPath={markdownDocument.path}
        documentTitle={markdownDocument.title}
        isSaving={isSaving}
        isWelcomeVisible={isWelcomeVisible}
        language={language}
        menuBarRef={menuBarRef}
        onMenuKeyDown={handleMenuKeyDown}
        nativeFileTitle={nativeFileTitle}
        newTitle={newTitle}
        openTitle={openTitle}
        recentFiles={recentFiles}
        saveAsTitle={saveAsTitle}
        saveTitle={saveTitle}
        supportsAppUpdates={supportsAppUpdates}
        t={t}
        updateActionTitle={updateActionTitle}
        updatePhase={updatePhase}
        viewMode={viewMode}
        windowFrame={windowFrame}
        onAbout={handleOpenAboutFromAppMenu}
        onCheckUpdates={() => void handleCheckForUpdates()}
        onClearRecent={handleClearRecentFiles}
        onExportDocx={() => void handleExportDocx()}
        onExportHtml={() => void handleExportHtml()}
        onExportPdf={() => void handleExportPdf()}
        onImportDocx={fileAccess.docxImport ? openDocxImport : undefined}
        onLanguage={handleLanguageSelect}
        onNew={handleNewDocumentWithPreviewPreload}
        onOpen={() => void handleOpenFileWithPreviewPreload()}
        onOpenRecent={(path) => void handleOpenRecentFileWithPreviewPreload(path)}
        onOpenReadingSettings={handleOpenReadingSettings}
        isHistoryOpen={isHistoryOpen}
        onToggleHistory={() => setIsHistoryOpen((open) => !open)}
        onRefresh={() => void refreshFromDisk()}
        onFind={documentSearch.open}
        isFindOpen={documentSearch.isOpen}
        findTitle={withShortcutTitle(t.find, { key: 'f' }, shortcutPlatform)}
        onReveal={(path) => void handleRevealRecentFile(path)}
        onSave={() => void handleSaveFile()}
        onSaveAs={() => void handleSaveFileAs()}
        onToggleMenu={toggleMenu}
        onViewMode={(mode) => {
          prepareViewChange(viewMode, mode)
          if (mode === 'edit') freezePreview()
          if (mode === 'split') prepareSplitPreview()
          setViewMode(mode)
        }}
      />

      {isWelcomeVisible ? (
        <WelcomeWorkspace
          recentFiles={recentFiles}
          failedRecentPaths={failedRecentPaths}
          recentFilesHidden={recentFilesHidden}
          onToggleRecentVisibility={() => setRecentFilesHidden((hidden) => !hidden)}
          onRemoveRecent={forgetRecentFile}
          onLocateRecent={(path) => void handleLocateRecentFile(path)}
          onReveal={canRevealFiles ? (path) => void handleRevealRecentFile(path) : undefined}
          canOpenFiles={fileAccess.supportsNativeFiles}
          statusMessage={welcomeStatus}
          onNew={handleNewDocumentWithPreviewPreload}
          onOpen={handleOpenFileWithPreviewPreload}
          onImportDocx={fileAccess.docxImport ? openDocxImport : undefined}
          onOpenRecent={handleOpenRecentFileWithPreviewPreload}
          onClearRecent={handleClearRecentFiles}
          t={t}
        />
      ) : <>
        {externalFileState ? <ExternalFileBanner
          state={externalFileState}
          labels={{ conflict: t.externalFileConflict, missing: t.externalFileMissing, keepEdits: t.keepMyEdits, reload: t.reloadDiskVersion, retry: t.retryFile, saveAs: t.saveAs }}
          onKeepEdits={handleKeepLocalEdits}
          onReload={() => {
            if (window.confirm(t.reloadDiskVersion)) handleReloadDiskVersion()
          }}
          onRetry={() => void retryExternalFile()}
          onSaveAs={() => void handleSaveFileAs()}
        /> : null}
        <div className="workspace-shell">
          {renderReopenButtons('left')}
          {leftHasPanels ? (
            <SidePanelColumn
              side="left"
              width={sidePanels.state.widths.left}
              stack={sidePanels.state.stacks.left}
              showOutline={outlineOnLeft}
              showCollections={collectionsOnLeft}
              outline={outlinePanelNode}
              collections={collectionsPanelNode}
              labels={panelColumnLabels}
              onWidthPointerDown={(event) => beginPanelWidthResize('left', event)}
              onWidthKeyDown={(event) => handlePanelWidthKeyDown('left', event)}
              onStackPointerDown={(event) => beginPanelStackResize('left', event)}
              onStackKeyDown={(event) => handlePanelStackKeyDown('left', event)}
            />
          ) : null}
          <section className={workspaceClasses} aria-label={t.workspace} style={{ '--split-editor-width': `${splitLayout.ratio}%` } as CSSProperties}>
        <DocumentSearchBar
          activeIndex={documentSearch.activeIndex}
          inputRef={documentSearch.inputRef}
          isOpen={documentSearch.isOpen}
          isReplaceOpen={documentSearch.isReplaceOpen}
          isSourceSearch={documentSearch.isSourceSearch}
          isSearchPending={documentSearch.isSearchPending}
          labels={{
            clear: t.clearFind,
            close: t.closeFind,
            find: t.find,
            findInPreview: t.findInPreview,
            findInSource: t.findInSource,
            noResults: t.findNoResults,
            searching: t.findSearching,
            matchCount: t.findMatchCount,
            next: t.findNext,
            previous: t.findPrevious,
            replace: t.replaceCurrent,
            replaceAll: t.replaceAll,
            replaceCurrent: t.replaceCurrent,
            replacement: t.replacement,
            toggleReplace: t.toggleReplace,
          }}
          matchCount={documentSearch.matchCount}
          onClose={documentSearch.close}
          onMove={documentSearch.move}
          onQueryChange={documentSearch.setQuery}
          onReplaceAll={documentSearch.replaceAll}
          onReplaceCurrent={documentSearch.replaceCurrent}
          onReplacementChange={documentSearch.setReplacement}
          onToggleReplace={() => documentSearch.setIsReplaceOpen((current) => !current)}
          query={documentSearch.query}
          replacement={documentSearch.replacement}
        />
        <section className="editor-panel" aria-label={t.sourceEditorPanel}>
          <MarkdownEditor
            ref={editorRef}
            value={markdownDocument.content}
            searchMatch={documentSearch.activeSourceMatch}
            historyKey={documentSessionId}
            onChange={handleContentChange}
            onImportImages={(files, selection) => void importImages(files, selection)}
            supportsImageImport={fileAccess.supportsImageImport}
            isImportingImages={isImportingImages}
            imageImportBusyLabel={imageImportProgress
              ? t.imageImportProgress(imageImportProgress.completed, imageImportProgress.total)
              : t.imageImportPreparing}
            imageDropLabel={t.imageDropLabel}
            onSelectionChange={editorSelectionStore.setSelection}
            label={t.markdownSource}
            placeholder={t.editorPlaceholder}
            t={t}
            showToolbar={viewMode !== 'preview'}
            toolbarEnd={viewMode === 'split' ? (
              <div className="split-toolbar-actions">
                <SplitSwapControl
                  label={withShortcutTitle(t.swapPanes, { key: 'x', shiftKey: true }, shortcutPlatform)}
                  swapped={splitLayout.swapped}
                  onToggle={splitLayout.toggleSwapped}
                />
                <SplitScrollControl
                  disableLabel={t.disableSplitScrollSync}
                  enableLabel={t.enableSplitScrollSync}
                  enabled={isSplitScrollSyncEnabled}
                  onToggle={handleToggleSplitScrollSync}
                />
              </div>
            ) : undefined}
          />
          <ImageImportNotice
            count={failedImageImports.length}
            dismissLabel={t.imageImportDismiss}
            message={t.imageImportRetryNotice}
            onDismiss={dismissFailedImages}
            onRetry={() => void retryFailedImages(editorSelectionStore.getSnapshot())}
            retryLabel={t.imageImportRetry}
          />
          {viewMode !== 'preview' ? <EditorStatusBar
            content={markdownDocument.content}
            hasFile={Boolean(markdownDocument.path)}
            isDirty={markdownDocument.isDirty}
            isSaving={isSaving}
            labels={{
              characterCount: t.characterCount,
              cursorPosition: t.cursorPosition,
              readingTime: t.readingTime,
              saved: t.saved,
              notSavedToFile: t.notSavedToFile,
              saving: t.saving,
              unsaved: t.unsaved,
              wordCount: t.wordCount,
            }}
            lineStartOffsets={lineStartOffsets}
            selectionStore={editorSelectionStore}
          /> : null}
        </section>
        {viewMode === 'split' ? <div className="split-resizer" role="separator" aria-label={t.resizeSplit}
          aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(splitLayout.ratio)} tabIndex={0}
          onPointerDown={splitLayout.onPointerDown} onPointerMove={splitLayout.onPointerMove}
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
          onDoubleClick={splitLayout.reset} onKeyDown={splitLayout.onKeyDown} /> : null}
        <section
          className="preview-panel"
          aria-label={t.previewPanel}
          ref={previewPanelRef}
          style={previewPanelStyle}
        >
          <Suspense fallback={<PreviewLoading label={t.previewLoading} />}>
            <LazyMarkdownPreview
              content={previewContent}
              theme={effectiveTheme}
              previewRef={previewRef}
              sourcePath={markdownDocument.path}
              readLocalImageFile={fileAccess.readLocalImageFile}
              onOpenMarkdownLink={handleOpenMarkdownLink}
              labels={t.previewLabels}
              searchQuery={viewMode === 'preview' ? documentSearch.appliedQuery : ''}
              activeSearchIndex={documentSearch.activeIndex}
              onSearchMatchCountChange={documentSearch.setPreviewMatchCount}
            />
          </Suspense>
          </section>
        </section>
          {rightHasPanels ? (
            <SidePanelColumn
              side="right"
              width={sidePanels.state.widths.right}
              stack={sidePanels.state.stacks.right}
              showOutline={outlineOnRight}
              showCollections={collectionsOnRight}
              outline={outlinePanelNode}
              collections={collectionsPanelNode}
              labels={panelColumnLabels}
              onWidthPointerDown={(event) => beginPanelWidthResize('right', event)}
              onWidthKeyDown={(event) => handlePanelWidthKeyDown('right', event)}
              onStackPointerDown={(event) => beginPanelStackResize('right', event)}
              onStackKeyDown={(event) => handlePanelStackKeyDown('right', event)}
            />
          ) : null}
          {renderReopenButtons('right')}
        </div>
      </>}
      {toast ? (
        <Toast
          label={t.toastNotification}
          placement={toast.placement}
          showPreviewLayer={viewMode !== 'edit'}
        >
          {toast.message}
        </Toast>
      ) : null}
      {!isWelcomeVisible && visibleOperationStatus ? (
        <div className="app-operation-status" role="status">{visibleOperationStatus}
          {lastExportPath && fileAccess.openExportResult ? <span className="export-result-actions">
            <button type="button" onClick={() => void fileAccess.openExportResult!(lastExportPath, false).catch((error) => setStatusMessage(getErrorMessage(error)))}>{t.openExportFile}</button>
            <button type="button" onClick={() => void fileAccess.openExportResult!(lastExportPath, true).catch((error) => setStatusMessage(getErrorMessage(error)))}>{t.openExportFolder}</button>
          </span> : null}
        </div>
      ) : null}
      <AppDialogs
        availableUpdate={availableUpdate}
        distribution={distribution}
        isAboutOpen={isAboutOpen}
        isDocxImportOpen={isDocxImportOpen}
        docxImportPhase={docxImportPhase}
        docxImportStatus={docxImportStatus}
        isReadingSettingsOpen={isReadingSettingsOpen}
        pendingDraft={pendingDraft}
        readingPreferences={readingPreferences}
        t={t}
        updateErrorMessage={updateErrorMessage}
        updatePhase={updatePhase}
        updateProgress={updateProgress}
        onCheckUpdates={() => void handleCheckForUpdates()}
        onCloseAbout={() => setIsAboutOpen(false)}
        onCloseReadingSettings={() => setIsReadingSettingsOpen(false)}
        onDismissUpdate={dismissUpdateDialog}
        onDiscardDraft={discardPendingDraft}
        onInstallUpdate={() => void handleInstallUpdate()}
        onOpenPortableDownload={() => void openPortableDownload()}
        onResetReadingPreferences={resetReadingPreferences}
        onRestoreDraft={() => void restorePendingDraft()}
        onUpdateReadingPreferences={updateReadingPreferences}
        onCloseDocxImport={closeDocxImport}
        onConvertDocx={() => void convertDocx()}
        onInstallDocx={() => void installDocxImport()}
        onRefreshDocxImport={() => void checkDocxImport()}
        onSelectDocxPython={() => void selectDocxPython()}
        onOpenPythonDownload={() => void openExternalLink('https://www.python.org/downloads/')}
        outlineOpen={isOutlineOpen}
        outlineSide={sidePanels.state.outlineSide}
        collectionsOpen={sidePanels.state.collectionsOpen}
        collectionsSide={sidePanels.state.collectionsSide}
        onOutlineOpenChange={toggleOutlineOpen}
        onOutlineSideChange={(side) => sidePanels.update({ outlineSide: side })}
        onCollectionsOpenChange={(open) => sidePanels.update({ collectionsOpen: open })}
        onCollectionsSideChange={(side) => sidePanels.update({ collectionsSide: side })}
      />
      <UnsavedChangesDialog open={pendingUnsavedTitle !== null} title={pendingUnsavedTitle ?? markdownDocument.title}
        saving={isSaving} canSave={fileAccess.supportsNativeFiles} onChoose={(choice) => void resolveUnsavedChanges(choice)} t={t} />
      <ExportWarningDialog open={isWordWarningOpen} onClose={dismissWordWarning}
        onContinue={() => void confirmWordExport()} onHtml={() => void exportHtmlInstead()} t={t} />
      <HistoryDrawer
        isOpen={isHistoryOpen}
        path={markdownDocument.path}
        t={t}
        history={history}
        onClose={() => setIsHistoryOpen(false)}
      />
    </main>
  )
}

function PreviewLoading({ label }: { label: string }) {
  return <div className="preview-loading" role="status">{label}</div>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : translations.en.fileOperationFailed
}

function LocalizedApp(props: AppProps) {
  const [language, setLanguage] = useState<AppLanguage>(() => props.initialLanguage ?? loadAppLanguage())
  const languageRequestRef = useRef(0)
  useEffect(() => {
    document.documentElement.lang = getLanguageLocale(language)
  }, [language])
  const t = getLoadedTranslation(language) ?? use(loadTranslation(language))

  function handleLanguageSelect(nextLanguage: AppLanguage) {
    const request = ++languageRequestRef.current
    void loadTranslation(nextLanguage).then(() => {
      if (request !== languageRequestRef.current) return
      setLanguage(nextLanguage)
      saveAppLanguage(nextLanguage)
    })
  }

  return <AppWorkspace {...props} language={language} t={t} onLanguageSelect={handleLanguageSelect} />
}

export default function App(props: AppProps) {
  return (
    <Suspense fallback={<div className="app-language-loading" role="status" aria-label="MDSView"><AppLogo /></div>}>
      <LocalizedApp {...props} />
    </Suspense>
  )
}
