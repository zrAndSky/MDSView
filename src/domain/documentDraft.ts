export type RecoverableDraft = {
  id: string
  path: string | null
  title: string
  content: string
  updatedAt: number
}

/**
 * Storage keeps a map keyed by tab id so several dirty documents can be backed
 * up at once. The key itself is unchanged from the single-draft era: reads
 * accept a bare draft object and transparently upgrade it.
 */
export const DOCUMENT_DRAFT_STORAGE_KEY = 'mdview.documentDraft.v1'
export const DOCUMENT_DRAFT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
export const DOCUMENT_DRAFT_MAX_ENTRIES = 20

export function createDocumentDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** All recoverable drafts, newest first. */
export function loadDocumentDrafts(
  storage: Storage | null = getLocalStorage(),
  now = Date.now(),
): RecoverableDraft[] {
  if (!storage) {
    return []
  }

  const rawValue = storage.getItem(DOCUMENT_DRAFT_STORAGE_KEY)
  if (!rawValue) {
    return []
  }

  try {
    const drafts = readDrafts(JSON.parse(rawValue))
    const fresh = drafts.filter((draft) => now - draft.updatedAt <= DOCUMENT_DRAFT_MAX_AGE_MS)

    if (fresh.length !== drafts.length) {
      writeDrafts(fresh, storage)
    }

    return fresh.sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    storage.removeItem(DOCUMENT_DRAFT_STORAGE_KEY)
    return []
  }
}

/** The most recent draft; used by the recovery prompt. */
export function loadDocumentDraft(
  storage: Storage | null = getLocalStorage(),
  now = Date.now(),
): RecoverableDraft | null {
  return loadDocumentDrafts(storage, now)[0] ?? null
}

export function saveDocumentDraft(
  draft: RecoverableDraft,
  storage: Storage | null = getLocalStorage(),
): boolean {
  if (!storage) {
    return false
  }

  try {
    const drafts = readDrafts(readStoredValue(storage))
      .filter((item) => item.id !== draft.id)
      .concat(draft)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, DOCUMENT_DRAFT_MAX_ENTRIES)

    writeDrafts(drafts, storage)
    return true
  } catch {
    return false
  }
}

/** Clears one tab's draft, or every draft when no id is given. */
export function clearDocumentDraft(
  id?: string,
  storage: Storage | null = getLocalStorage(),
) {
  if (!storage) {
    return
  }

  if (!id) {
    storage.removeItem(DOCUMENT_DRAFT_STORAGE_KEY)
    return
  }

  try {
    const remaining = readDrafts(readStoredValue(storage)).filter((draft) => draft.id !== id)
    if (remaining.length === 0) {
      storage.removeItem(DOCUMENT_DRAFT_STORAGE_KEY)
      return
    }
    writeDrafts(remaining, storage)
  } catch {
    storage.removeItem(DOCUMENT_DRAFT_STORAGE_KEY)
  }
}

function readStoredValue(storage: Storage): unknown {
  const rawValue = storage.getItem(DOCUMENT_DRAFT_STORAGE_KEY)
  if (!rawValue) {
    return null
  }
  return JSON.parse(rawValue)
}

/** Accepts both the map layout and a single legacy draft object. */
function readDrafts(value: unknown): RecoverableDraft[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  const single = normalizeDocumentDraft(value)
  if (single) {
    return [single]
  }

  return Object.values(value as Record<string, unknown>)
    .map(normalizeDocumentDraft)
    .filter((draft): draft is RecoverableDraft => draft !== null)
}

function writeDrafts(drafts: RecoverableDraft[], storage: Storage) {
  if (drafts.length === 0) {
    storage.removeItem(DOCUMENT_DRAFT_STORAGE_KEY)
    return
  }

  const map: Record<string, RecoverableDraft> = {}
  for (const draft of drafts) {
    map[draft.id] = draft
  }
  storage.setItem(DOCUMENT_DRAFT_STORAGE_KEY, JSON.stringify(map))
}

function normalizeDocumentDraft(value: unknown): RecoverableDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const draft = value as Record<string, unknown>
  if (
    typeof draft.id !== 'string' ||
    !draft.id ||
    typeof draft.title !== 'string' ||
    !draft.title ||
    typeof draft.content !== 'string' ||
    (typeof draft.path !== 'string' && draft.path !== null) ||
    typeof draft.updatedAt !== 'number' ||
    !Number.isFinite(draft.updatedAt) ||
    draft.updatedAt < 0
  ) {
    return null
  }

  return {
    id: draft.id,
    path: draft.path,
    title: draft.title,
    content: draft.content,
    updatedAt: draft.updatedAt,
  }
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}
