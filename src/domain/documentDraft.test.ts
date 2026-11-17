import { describe, expect, it, vi } from 'vitest'
import {
  DOCUMENT_DRAFT_MAX_AGE_MS,
  DOCUMENT_DRAFT_MAX_ENTRIES,
  DOCUMENT_DRAFT_STORAGE_KEY,
  clearDocumentDraft,
  loadDocumentDraft,
  loadDocumentDrafts,
  saveDocumentDraft,
  type RecoverableDraft,
} from './documentDraft'

const now = Date.now()

describe('documentDraft', () => {
  it('stores and loads the most recent valid draft', () => {
    const storage = createStorage()
    const draft = createDraft()

    expect(saveDocumentDraft(draft, storage)).toBe(true)
    expect(loadDocumentDraft(storage, now)).toEqual(draft)
  })

  it('clears malformed and expired data without returning it', () => {
    const storage = createStorage()
    storage.setItem(DOCUMENT_DRAFT_STORAGE_KEY, '{invalid json')

    expect(loadDocumentDraft(storage, now)).toBeNull()
    expect(storage.getItem(DOCUMENT_DRAFT_STORAGE_KEY)).toBeNull()

    storage.setItem(DOCUMENT_DRAFT_STORAGE_KEY, JSON.stringify(createDraft({ updatedAt: now - DOCUMENT_DRAFT_MAX_AGE_MS - 1 })))
    expect(loadDocumentDraft(storage, now)).toBeNull()
    expect(storage.getItem(DOCUMENT_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('only clears a draft when its session id matches', () => {
    const storage = createStorage()
    const draft = createDraft()
    saveDocumentDraft(draft, storage)

    clearDocumentDraft('another-session', storage)
    expect(loadDocumentDraft(storage, now)).toEqual(draft)

    clearDocumentDraft(draft.id, storage)
    expect(loadDocumentDraft(storage, now)).toBeNull()
  })

  it('returns false when local draft storage rejects writes', () => {
    const storage = createStorage()
    storage.setItem = vi.fn(() => {
      throw new Error('Quota exceeded')
    })

    expect(saveDocumentDraft(createDraft(), storage)).toBe(false)
  })

  it('keeps one draft per tab and lists the newest first', () => {
    const storage = createStorage()
    saveDocumentDraft(createDraft({ id: 'tab-a', content: '# A', updatedAt: now - 1000 }), storage)
    saveDocumentDraft(createDraft({ id: 'tab-b', content: '# B', updatedAt: now }), storage)

    expect(loadDocumentDrafts(storage, now).map((draft) => draft.id)).toEqual(['tab-b', 'tab-a'])
    expect(loadDocumentDraft(storage, now)?.id).toBe('tab-b')

    clearDocumentDraft('tab-b', storage)
    expect(loadDocumentDrafts(storage, now).map((draft) => draft.id)).toEqual(['tab-a'])
  })

  it('upgrades a legacy single draft and caps the number of stored drafts', () => {
    const storage = createStorage()
    storage.setItem(DOCUMENT_DRAFT_STORAGE_KEY, JSON.stringify(createDraft({ id: 'legacy' })))
    expect(loadDocumentDraft(storage, now)?.id).toBe('legacy')

    for (let index = 0; index < DOCUMENT_DRAFT_MAX_ENTRIES + 5; index += 1) {
      saveDocumentDraft(createDraft({ id: `tab-${index}`, updatedAt: now + index }), storage)
    }

    const drafts = loadDocumentDrafts(storage, now)
    expect(drafts).toHaveLength(DOCUMENT_DRAFT_MAX_ENTRIES)
    expect(drafts[0].id).toBe(`tab-${DOCUMENT_DRAFT_MAX_ENTRIES + 4}`)
  })
})

function createDraft(overrides: Partial<RecoverableDraft> = {}): RecoverableDraft {
  return {
    id: 'draft-session',
    path: '/tmp/draft.md',
    title: 'draft.md',
    content: '# Draft',
    updatedAt: now,
    ...overrides,
  }
}

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  }
}
