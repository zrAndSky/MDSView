import { Plus, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { DocumentTab } from '../../domain/documentTab'
import './documentTabBar.css'

export type DocumentTabBarLabels = {
  list: string
  newTab: string
  closeTab: (title: string) => string
  unsaved: string
}

type DocumentTabBarProps = {
  tabs: DocumentTab[]
  activeId: string | null
  labels: DocumentTabBarLabels
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

/**
 * Shown only when more than one document is open, so single-document reading
 * looks exactly like it did before tabs existed.
 */
export function DocumentTabBar({ tabs, activeId, labels, onSelect, onClose, onNew }: DocumentTabBarProps) {
  if (tabs.length < 2) {
    return null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return (
    <div className="document-tabs" role="tablist" aria-label={labels.list} data-tauri-drag-region>
      <div className="document-tabs-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const isDirty = tab.document.isDirty

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`document-tab${isActive ? ' is-active' : ''}`}
              title={tab.document.path ?? tab.document.title}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
            >
              <span className="document-tab-title">{tab.document.title}</span>
              {isDirty ? <span className="document-tab-dirty" aria-label={labels.unsaved} /> : null}
              <button
                type="button"
                className="document-tab-close"
                aria-label={labels.closeTab(tab.document.title)}
                title={labels.closeTab(tab.document.title)}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
      <button type="button" className="document-tab-new" aria-label={labels.newTab} title={labels.newTab} onClick={onNew}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  )
}
