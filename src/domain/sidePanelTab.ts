export type SidePanelTab = 'outline' | 'playlists'

const SIDE_PANEL_TAB_KEY = 'mdview.sidePanelTab.v1'

export function loadSidePanelTab(): SidePanelTab {
  try {
    return window.localStorage.getItem(SIDE_PANEL_TAB_KEY) === 'playlists' ? 'playlists' : 'outline'
  } catch {
    return 'outline'
  }
}

export function saveSidePanelTab(tab: SidePanelTab) {
  try {
    window.localStorage.setItem(SIDE_PANEL_TAB_KEY, tab)
  } catch {
    // The tab still switches for this session when storage is unavailable.
  }
}
