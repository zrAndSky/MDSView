import { Columns, Plus, Save, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { CompareDocument, ComparePaneMode } from '../../domain/comparison'
import { MAX_COMPARE_DOCUMENTS } from '../../domain/comparison'
import type { EffectiveReadingTheme } from '../../domain/readingPreferences'
import type { FileAccess } from '../../platform/fileAccess'
import type { MarkdownPreviewLabels } from '../preview/previewTypes'
import { ComparePane } from './ComparePane'
import './compare.css'

export type CompareWorkspaceLabels = {
  title: string
  add: string
  limit: string
  saveAll: string
  exit: string
  empty: string
  dropHint: string
  dropActive: string
  loading: string
  panePreview: string
  paneEdit: string
  paneSave: string
  paneRemove: (title: string) => string
}

type CompareWorkspaceProps = {
  documents: CompareDocument[]
  dirtyCount: number
  statusMessage: string
  isDropTarget?: boolean
  theme: EffectiveReadingTheme
  previewLabels: MarkdownPreviewLabels
  readLocalImageFile?: FileAccess['readLocalImageFile']
  labels: CompareWorkspaceLabels
  onAdd: () => void
  onRemove: (id: string) => void
  onModeChange: (id: string, mode: ComparePaneMode) => void
  onContentChange: (id: string, content: string) => void
  onSave: (id: string) => void
  onSaveAll: () => void
  onExit: () => void
}

export function CompareWorkspace({
  documents,
  dirtyCount,
  statusMessage,
  isDropTarget = false,
  theme,
  previewLabels,
  readLocalImageFile,
  labels,
  onAdd,
  onRemove,
  onModeChange,
  onContentChange,
  onSave,
  onSaveAll,
  onExit,
}: CompareWorkspaceProps) {
  const isAtLimit = documents.length >= MAX_COMPARE_DOCUMENTS

  return (
    <section
      className={`compare-workspace${isDropTarget ? ' is-drop-target' : ''}`}
      aria-label={labels.title}
    >
      <header className="compare-toolbar">
        <span className="compare-brand">
          <Columns aria-hidden="true" />
          <span className="compare-brand-title">{labels.title}</span>
          <span className="compare-count">{documents.length}/{MAX_COMPARE_DOCUMENTS}</span>
        </span>
        <div className="compare-toolbar-actions">
          <button
            type="button"
            onClick={onAdd}
            disabled={isAtLimit}
            title={isAtLimit ? labels.limit : labels.add}
          >
            <Plus aria-hidden="true" />
            <span>{labels.add}</span>
          </button>
          <button
            type="button"
            onClick={onSaveAll}
            disabled={dirtyCount === 0}
            title={labels.saveAll}
          >
            <Save aria-hidden="true" />
            <span>{labels.saveAll}</span>
          </button>
          <button type="button" className="compare-exit" onClick={onExit} title={labels.exit}>
            <X aria-hidden="true" />
            <span>{labels.exit}</span>
          </button>
        </div>
      </header>

      {documents.length === 0 ? (
        <div className="compare-empty">
          <p>{labels.empty}</p>
          <button type="button" onClick={onAdd}>
            <Plus aria-hidden="true" />
            <span>{labels.add}</span>
          </button>
          <p className="compare-empty-hint">{labels.dropHint}</p>
        </div>
      ) : (
        <div className="compare-grid" data-count={documents.length} style={{ '--compare-count': documents.length } as CSSProperties}>
          {documents.map((document, index) => (
            <ComparePane
              key={document.id}
              document={document}
              index={index}
              theme={theme}
              previewLabels={previewLabels}
              readLocalImageFile={readLocalImageFile}
              labels={{
                preview: labels.panePreview,
                edit: labels.paneEdit,
                save: labels.paneSave,
                remove: labels.paneRemove,
                loading: labels.loading,
              }}
              onModeChange={(mode) => onModeChange(document.id, mode)}
              onContentChange={(content) => onContentChange(document.id, content)}
              onSave={() => onSave(document.id)}
              onRemove={() => onRemove(document.id)}
            />
          ))}
        </div>
      )}

      {statusMessage ? <p className="compare-status" role="status">{statusMessage}</p> : null}
      {isDropTarget ? (
        <div className="compare-drop-overlay" aria-hidden="true">{labels.dropActive}</div>
      ) : null}
    </section>
  )
}
