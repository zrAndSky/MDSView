import { useEffect, useRef } from 'react'

type UseSaveOnCloseOptions = {
  enabled: boolean
  documentPath: string | null
  isDirty: boolean
  saveBlocked: boolean
  onSave: () => Promise<boolean>
}

type CloseState = {
  enabled: boolean
  hasPath: boolean
  isDirty: boolean
  saveBlocked: boolean
  onSave: () => Promise<boolean>
}

export function useSaveOnClose({
  enabled,
  documentPath,
  isDirty,
  saveBlocked,
  onSave,
}: UseSaveOnCloseOptions) {
  const stateRef = useRef<CloseState>({
    enabled,
    hasPath: Boolean(documentPath),
    isDirty,
    saveBlocked,
    onSave,
  })
  useEffect(() => {
    stateRef.current = {
      enabled,
      hasPath: Boolean(documentPath),
      isDirty,
      saveBlocked,
      onSave,
    }
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
        if (closingRef.current
          || !state.enabled
          || !state.hasPath
          || !state.isDirty
          || state.saveBlocked) {
          return
        }

        event.preventDefault()
        const saved = await state.onSave()
        if (!saved) {
          return
        }

        closingRef.current = true
        await appWindow.close()
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
      if (!state.enabled || !state.hasPath || !state.isDirty || state.saveBlocked) {
        return
      }
      void state.onSave()
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
