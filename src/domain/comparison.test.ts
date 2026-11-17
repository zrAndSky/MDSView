import { describe, expect, it } from 'vitest'
import {
  addCompareDocument,
  createCompareDocument,
  dirtyCompareDocuments,
  hasCompareDocument,
  isCompareDocumentDirty,
  isCompareLimitReached,
  markCompareDocumentSaved,
  MAX_COMPARE_DOCUMENTS,
  removeCompareDocument,
  setCompareDocumentMode,
  updateCompareContent,
} from './comparison'

const doc = (path: string, content = '# title') => createCompareDocument({ path, content, revision: 'r1' })

describe('compare documents', () => {
  it('derives a title and a case-insensitive id from the path', () => {
    const created = createCompareDocument({ path: 'C:\\Docs\\Guide.MD', content: 'x' })
    expect(created.title).toBe('Guide.MD')
    expect(created.id).toBe('c:\\docs\\guide.md')
    expect(created.mode).toBe('preview')
    expect(created.revision).toBeNull()
    expect(isCompareDocumentDirty(created)).toBe(false)
  })

  it('ignores duplicates and stops at four documents', () => {
    const first = doc('a.md')
    expect(addCompareDocument([first], doc('A.md'))).toHaveLength(1)
    expect(hasCompareDocument([first], 'A.MD')).toBe(true)
    expect(hasCompareDocument([first], 'b.md')).toBe(false)

    const filled = ['a.md', 'b.md', 'c.md', 'd.md'].reduce(
      (documents, path) => addCompareDocument(documents, doc(path)),
      [] as ReturnType<typeof doc>[],
    )
    expect(filled).toHaveLength(MAX_COMPARE_DOCUMENTS)
    expect(addCompareDocument(filled, doc('e.md'))).toHaveLength(MAX_COMPARE_DOCUMENTS)
    expect(isCompareLimitReached(filled)).toBe(true)
  })

  it('tracks dirtiness against the last saved content', () => {
    const documents = updateCompareContent([doc('a.md', 'original')], 'a.md', 'edited')
    expect(isCompareDocumentDirty(documents[0])).toBe(true)
    expect(dirtyCompareDocuments(documents)).toHaveLength(1)

    const saved = markCompareDocumentSaved(documents, 'a.md', 'r2')
    expect(isCompareDocumentDirty(saved[0])).toBe(false)
    expect(saved[0].revision).toBe('r2')
    expect(saved[0].savedContent).toBe('edited')
  })

  it('switches pane mode and removes panes without touching the others', () => {
    const documents = addCompareDocument(addCompareDocument([], doc('a.md')), doc('b.md'))
    const edited = setCompareDocumentMode(documents, 'a.md', 'edit')
    expect(edited[0].mode).toBe('edit')
    expect(edited[1].mode).toBe('preview')

    const removed = removeCompareDocument(edited, 'a.md')
    expect(removed.map((document) => document.id)).toEqual(['b.md'])
  })
})
