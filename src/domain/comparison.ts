import type { OpenedMarkdownFile } from '../platform/fileAccess'

/** Hard ceiling for side-by-side panes; beyond four the panes become unreadable. */
export const MAX_COMPARE_DOCUMENTS = 4

export type ComparePaneMode = 'preview' | 'edit'

export type CompareDocument = {
  /** Documents are keyed by path so the same file can never appear twice. */
  id: string
  path: string
  title: string
  content: string
  savedContent: string
  revision: string | null
  mode: ComparePaneMode
}

export type CompareDocumentSource = {
  path: string
  content: string
  revision?: string | null
}

export function compareDocumentId(path: string): string {
  return path.toLowerCase()
}

export function getCompareTitle(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function createCompareDocument(
  source: CompareDocumentSource,
  mode: ComparePaneMode = 'preview',
): CompareDocument {
  return {
    id: compareDocumentId(source.path),
    path: source.path,
    title: getCompareTitle(source.path),
    content: source.content,
    savedContent: source.content,
    revision: source.revision ?? null,
    mode,
  }
}

export function createCompareDocumentFromFile(
  file: OpenedMarkdownFile,
  mode: ComparePaneMode = 'preview',
): CompareDocument {
  return createCompareDocument({ path: file.path, content: file.content, revision: file.revision }, mode)
}

export function hasCompareDocument(documents: CompareDocument[], path: string): boolean {
  const id = compareDocumentId(path)
  return documents.some((document) => document.id === id)
}

/** Appends a document, ignoring duplicates and respecting the four-pane ceiling. */
export function addCompareDocument(
  documents: CompareDocument[],
  incoming: CompareDocument,
): CompareDocument[] {
  if (documents.length >= MAX_COMPARE_DOCUMENTS) {
    return documents
  }
  if (documents.some((document) => document.id === incoming.id)) {
    return documents
  }
  return [...documents, incoming]
}

export function removeCompareDocument(documents: CompareDocument[], id: string): CompareDocument[] {
  return documents.filter((document) => document.id !== id)
}

export function updateCompareContent(
  documents: CompareDocument[],
  id: string,
  content: string,
): CompareDocument[] {
  return documents.map((document) => document.id === id ? { ...document, content } : document)
}

export function setCompareDocumentMode(
  documents: CompareDocument[],
  id: string,
  mode: ComparePaneMode,
): CompareDocument[] {
  return documents.map((document) => document.id === id ? { ...document, mode } : document)
}

export function markCompareDocumentSaved(
  documents: CompareDocument[],
  id: string,
  revision: string | null,
): CompareDocument[] {
  return documents.map((document) => document.id === id
    ? { ...document, savedContent: document.content, revision }
    : document)
}

export function replaceCompareDocumentContent(
  documents: CompareDocument[],
  id: string,
  content: string,
  revision: string | null,
): CompareDocument[] {
  return documents.map((document) => document.id === id
    ? { ...document, content, savedContent: content, revision }
    : document)
}

export function isCompareDocumentDirty(document: CompareDocument): boolean {
  return document.content !== document.savedContent
}

export function dirtyCompareDocuments(documents: CompareDocument[]): CompareDocument[] {
  return documents.filter(isCompareDocumentDirty)
}

export function isCompareLimitReached(documents: CompareDocument[]): boolean {
  return documents.length >= MAX_COMPARE_DOCUMENTS
}
