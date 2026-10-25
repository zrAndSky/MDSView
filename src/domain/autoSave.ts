export const AUTO_SAVE_STORAGE_KEY = 'mdview.autoSave.v1'
export const AUTO_SAVE_DEBOUNCE_MS = 1500

const listeners = new Set<() => void>()
let enabled = loadAutoSaveEnabled()

export function loadAutoSaveEnabled(storage: Storage | null = getLocalStorage()): boolean {
  try {
    return storage?.getItem(AUTO_SAVE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function getAutoSaveEnabled(): boolean {
  return enabled
}

export function subscribeAutoSave(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAutoSaveEnabled(next: boolean, storage: Storage | null = getLocalStorage()) {
  if (next === enabled) {
    return
  }

  enabled = next
  try {
    storage?.setItem(AUTO_SAVE_STORAGE_KEY, String(next))
  } catch {
    // The preference still applies for this session when storage is unavailable.
  }

  for (const listener of listeners) {
    listener()
  }
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}
