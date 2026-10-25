import type { ReactNode } from 'react'
import type { SidePanelTab } from '../../domain/sidePanelTab'
import type { Translation } from '../../i18n'

export function SidePanelTabs({
  activeTab,
  onTabChange,
  outline,
  playlists,
  t,
}: {
  activeTab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
  outline: ReactNode
  playlists: ReactNode
  t: Translation
}) {
  return (
    <>
      <div className="side-panel-tabs" role="tablist" aria-label={t.sidePanel}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'outline'}
          className={`side-panel-tab${activeTab === 'outline' ? ' active' : ''}`}
          onClick={() => onTabChange('outline')}
        >
          {t.outlineTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'playlists'}
          className={`side-panel-tab${activeTab === 'playlists' ? ' active' : ''}`}
          onClick={() => onTabChange('playlists')}
        >
          {t.playlistsTab}
        </button>
      </div>
      <div className="side-panel-body" role="tabpanel" aria-label={activeTab === 'outline' ? t.outlineTab : t.playlistsTab}>
        {activeTab === 'outline' ? outline : playlists}
      </div>
    </>
  )
}
