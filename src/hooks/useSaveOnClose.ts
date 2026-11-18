import { useEffect, useRef } from 'react'

/** One document with unsaved edits that would be lost on close. */
export type PendingSave = {
  id: string
  title: string
  /** False when the document has no path yet and would need a "save as" dialog. */
  canSave: boolean
}

type UseSaveOnCloseOptions = {
  autoSaveEnabled: boolean
  /** Every unsaved document, across tabs and the compare workspace. */
  collectPending: () => PendingSave[]
  /** Saves all pending documents; resolves false when any save did not happen. */
  saveAll: () => Promise<boolean>
  discardConfirm: (count: number) => string
}

type CloseState = {
  autoSaveEnabled: boolean
  collectPending: () => PendingSave[]
  saveAll: () => Promise<boolean>
  discardConfirm: (count: number) => string
}

/**
 * Guards the window close: with auto save on and every document backed by a
 * real file it saves them all, otherwise it asks before discarding edits.
 */
export function useSaveOnClose({
  autoSaveEnabled,
  collectPending,
  saveAll,
  discardConfirm,
}: UseSaveOnCloseOptions) {
  const stateRef = useRef<CloseState>({ autoSaveEnabled, collectPending, saveAll, discardConfirm })
  useEffect(() => {
    stateRef.current = { autoSaveEnabled, collectPending, saveAll, discardConfirm }
  })
  const closingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow()
      const stop = await appWindow.onCloseRequested(async (event) => {
        const state = stateRef.current
        if (closingRef.current) {
          return
        }

        const pending = state.collectPending()
        if (pending.length === 0) {
          return
        }

        event.preventDefault()

        if (state.autoSaveEnabled && pending.every((item) => item.canSave)) {
          const saved = await state.saveAll()
          if (!saved) {
            return
          }
          closingRef.current = true
          await appWindow.close()
          return
        }

        if (window.confirm(state.discardConfirm(pending.length))) {
          closingRef.current = true
          await appWindow.close()
        }
      })
      if (disposed) {
        stop()
      } else {
        unlisten = stop
      }
    }).catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    function flush() {
      const state = stateRef.current
      if (!state.autoSaveEnabled) {
        return
      }
      const pending = state.collectPending()
      if (pending.length === 0 || !pending.every((item) => item.canSave)) {
        return
      }
      void state.saveAll()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
}
