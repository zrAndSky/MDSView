import { useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import {
  createDocumentTab,
  getActiveTab,
  initialTabsState,
  tabsReducer,
  type DocumentTab,
  type TabPatch,
  type TabsState,
} from '../domain/documentTab'
import { createDocumentDraftId } from '../domain/documentDraft'
import type { MarkdownDocument } from '../domain/documentState'

export function useDocumentTabs() {
  const [state, dispatch] = useReducer(tabsReducer, initialTabsState)
  const stateRef = useRef<TabsState>(state)

  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const actions = useMemo(() => ({
    add(tab: DocumentTab) {
      dispatch({ type: 'add', tab })
    },
    addDocument(document: MarkdownDocument) {
      const tab = createDocumentTab(createDocumentDraftId(), document)
      dispatch({ type: 'add', tab })
      return tab
    },
    close(id: string) {
      dispatch({ type: 'close', id })
    },
    activate(id: string) {
      dispatch({ type: 'activate', id })
    },
    patch(id: string, patch: TabPatch) {
      dispatch({ type: 'patch', id, patch })
    },
    updateDocument(id: string, update: (document: MarkdownDocument) => MarkdownDocument) {
      dispatch({ type: 'updateDocument', id, update })
    },
  }), [])

  return {
    state,
    stateRef,
    tabs: state.tabs,
    activeId: state.activeId,
    activeTab: getActiveTab(state),
    actions,
  }
}
