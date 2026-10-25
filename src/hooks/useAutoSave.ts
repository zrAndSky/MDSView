import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  AUTO_SAVE_DEBOUNCE_MS,
  getAutoSaveEnabled,
  setAutoSaveEnabled,
  subscribeAutoSave,
} from '../domain/autoSave'

export function useAutoSavePreference(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeAutoSave, getAutoSaveEnabled, getAutoSaveEnabled)
  return [enabled, setAutoSaveEnabled]
}

type UseAutoSaveOptions = {
  enabled: boolean
  documentPath: string | null
  content: string
  isDirty: boolean
  isSaving: boolean
  saveBlocked: boolean
  onSave: () => Promise<unknown>
}

export function useAutoSave({
  enabled,
  documentPath,
  content,
  isDirty,
  isSaving,
  saveBlocked,
  onSave,
}: UseAutoSaveOptions) {
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    if (!enabled || !documentPath || !isDirty || isSaving || saveBlocked) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      // Typing never happens inside a modal, so a save firing under one is a stale timer.
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return
      }
      void onSaveRef.current()
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [content, documentPath, enabled, isDirty, isSaving, saveBlocked])
}
