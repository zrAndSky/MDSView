import type { OpenedMarkdownFile } from '../platform/fileAccess'
import { createInitialDocument, type MarkdownDocument } from './documentState'

export type ExternalFileState =
  | { kind: 'conflict'; file: OpenedMarkdownFile }
  | { kind: 'missing'; path: string }

/** One open document. The tab id is also the draft-recovery session id. */
export type DocumentTab = {
  id: string
  document: MarkdownDocument
  externalFileState: ExternalFileState | null
  isSaving: boolean
  statusMessage: string
}

export type TabsState = {
  tabs: DocumentTab[]
  activeId: string | null
}

export type TabPatch = Partial<Pick<DocumentTab, 'externalFileState' | 'isSaving' | 'statusMessage'>>

export type TabsAction =
  | { type: 'add'; tab: DocumentTab; activate?: boolean }
  | { type: 'close'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'patch'; id: string; patch: TabPatch }
  | { type: 'updateDocument'; id: string; update: (document: MarkdownDocument) => MarkdownDocument }

export const initialTabsState: TabsState = { tabs: [], activeId: null }

export function createDocumentTab(
  id: string,
  document: MarkdownDocument = createInitialDocument(),
): DocumentTab {
  return {
    id,
    document,
    externalFileState: null,
    isSaving: false,
    statusMessage: document.isDirty ? 'unsaved' : 'saved',
  }
}

/** Windows paths are case-insensitive, so tab identity follows suit. */
export function normalizeTabPath(path: string): string {
  return path.toLowerCase()
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'add': {
      const incomingPath = action.tab.document.path
      if (incomingPath) {
        const key = normalizeTabPath(incomingPath)
        const existing = state.tabs.find((tab) => tab.document.path && normalizeTabPath(tab.document.path) === key)
        if (existing) {
          return { ...state, activeId: existing.id }
        }
      }

      return {
        tabs: [...state.tabs, action.tab],
        activeId: action.activate === false ? state.activeId : action.tab.id,
      }
    }

    case 'close': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id)
      if (index < 0) {
        return state
      }

      const tabs = state.tabs.filter((tab) => tab.id !== action.id)
      if (state.activeId !== action.id) {
        return { tabs, activeId: state.activeId }
      }

      // Prefer the tab on the right, fall back to the one on the left.
      const nextActive = tabs[Math.min(index, tabs.length - 1)] ?? null
      return { tabs, activeId: nextActive?.id ?? null }
    }

    case 'activate': {
      if (!state.tabs.some((tab) => tab.id === action.id)) {
        return state
      }
      return { ...state, activeId: action.id }
    }

    case 'patch': {
      return {
        ...state,
        tabs: state.tabs.map((tab) => tab.id === action.id ? { ...tab, ...action.patch } : tab),
      }
    }

    case 'updateDocument': {
      return {
        ...state,
        tabs: state.tabs.map((tab) => tab.id === action.id
          ? { ...tab, document: action.update(tab.document) }
          : tab),
      }
    }

    default:
      return state
  }
}

export function getActiveTab(state: TabsState): DocumentTab | null {
  if (!state.activeId) {
    return null
  }
  return state.tabs.find((tab) => tab.id === state.activeId) ?? null
}

export function findTabByPath(state: TabsState, path: string): DocumentTab | undefined {
  const key = normalizeTabPath(path)
  return state.tabs.find((tab) => tab.document.path && normalizeTabPath(tab.document.path) === key)
}

export function getDirtyTabs(state: TabsState): DocumentTab[] {
  return state.tabs.filter((tab) => tab.document.isDirty)
}
