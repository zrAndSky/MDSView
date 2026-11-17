import { describe, expect, it } from 'vitest'
import { createDocumentTab, getActiveTab, getDirtyTabs, initialTabsState, tabsReducer, type TabsState } from './documentTab'
import { createInitialDocument, replaceDocumentContent, updateDocumentDraft } from './documentState'

function tab(id: string, path: string | null, content = `# ${id}`) {
  const document = path
    ? replaceDocumentContent(createInitialDocument(), content, path, 'r1')
    : createInitialDocument()
  return createDocumentTab(id, document)
}

function add(state: TabsState, ...tabs: ReturnType<typeof tab>[]): TabsState {
  return tabs.reduce((current, item) => tabsReducer(current, { type: 'add', tab: item }), state)
}

describe('tabs reducer', () => {
  it('activates the most recently added tab', () => {
    const state = add(initialTabsState, tab('a', 'a.md'), tab('b', 'b.md'))
    expect(state.tabs.map((item) => item.id)).toEqual(['a', 'b'])
    expect(state.activeId).toBe('b')
    expect(getActiveTab(state)?.document.path).toBe('b.md')
  })

  it('activates an already open document instead of duplicating the tab', () => {
    const state = add(initialTabsState, tab('a', 'C:\\docs\\Guide.md'), tab('b', 'b.md'))
    const next = tabsReducer(state, { type: 'add', tab: tab('c', 'c:\\docs\\GUIDE.MD') })

    expect(next.tabs).toHaveLength(2)
    expect(next.activeId).toBe('a')
  })

  it('allows several untitled tabs because they have no path to match on', () => {
    const state = add(initialTabsState, tab('a', null), tab('b', null))
    expect(state.tabs).toHaveLength(2)
  })

  it('activates the right neighbour when closing the active tab, then the left one', () => {
    const state = add(initialTabsState, tab('a', 'a.md'), tab('b', 'b.md'), tab('c', 'c.md'))

    const closedMiddle = tabsReducer({ ...state, activeId: 'b' }, { type: 'close', id: 'b' })
    expect(closedMiddle.activeId).toBe('c')

    const closedLast = tabsReducer({ ...state, activeId: 'c' }, { type: 'close', id: 'c' })
    expect(closedLast.activeId).toBe('b')
  })

  it('keeps the active tab when a background tab closes and empties out safely', () => {
    const state = add(initialTabsState, tab('a', 'a.md'), tab('b', 'b.md'))
    expect(tabsReducer(state, { type: 'close', id: 'a' }).activeId).toBe('b')

    const empty = tabsReducer(state, { type: 'close', id: 'a' })
    expect(getActiveTab(tabsReducer(empty, { type: 'close', id: 'b' }))).toBeNull()
  })

  it('ignores activations and closes for unknown tabs', () => {
    const state = add(initialTabsState, tab('a', 'a.md'))
    expect(tabsReducer(state, { type: 'activate', id: 'ghost' })).toBe(state)
    expect(tabsReducer(state, { type: 'close', id: 'ghost' })).toBe(state)
  })

  it('updates only the targeted document and tracks dirtiness per tab', () => {
    const state = add(initialTabsState, tab('a', 'a.md', 'a'), tab('b', 'b.md', 'b'))
    const edited = tabsReducer(state, {
      type: 'updateDocument',
      id: 'a',
      update: (document) => updateDocumentDraft(document, 'a edited'),
    })

    expect(edited.tabs[0].document.content).toBe('a edited')
    expect(edited.tabs[1].document.content).toBe('b')
    expect(getDirtyTabs(edited).map((item) => item.id)).toEqual(['a'])
  })
})
