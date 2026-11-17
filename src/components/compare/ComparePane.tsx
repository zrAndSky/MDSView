import { Eye, PencilLine, Save, X } from 'lucide-react'
import { Suspense } from 'react'
import type { CompareDocument, ComparePaneMode } from '../../domain/comparison'
import { isCompareDocumentDirty } from '../../domain/comparison'
import type { EffectiveReadingTheme } from '../../domain/readingPreferences'
import type { FileAccess } from '../../platform/fileAccess'
import { isPlainTextPath } from '../../platform/markdownFiles'
import { LazyMarkdownPreview } from '../preview/lazyMarkdownPreview'
import { PlainTextPreview } from '../preview/PlainTextPreview'
import type { MarkdownPreviewLabels } from '../preview/previewTypes'

export type ComparePaneLabels = {
  preview: string
  edit: string
  save: string
  remove: (title: string) => string
  loading: string
}

type ComparePaneProps = {
  document: CompareDocument
  index: number
  theme: EffectiveReadingTheme
  previewLabels: MarkdownPreviewLabels
  readLocalImageFile?: FileAccess['readLocalImageFile']
  labels: ComparePaneLabels
  onModeChange: (mode: ComparePaneMode) => void
  onContentChange: (content: string) => void
  onSave: () => void
  onRemove: () => void
}

export function ComparePane({
  document,
  index,
  theme,
  previewLabels,
  readLocalImageFile,
  labels,
  onModeChange,
  onContentChange,
  onSave,
  onRemove,
}: ComparePaneProps) {
  const isDirty = isCompareDocumentDirty(document)
  const isPlainText = isPlainTextPath(document.path)

  return (
    <article className="compare-pane" data-pane-index={index} data-mode={document.mode}>
      <header className="compare-pane-header">
        <span className="compare-pane-index" aria-hidden="true">{index + 1}</span>
        <span className="compare-pane-title" title={document.path}>
          {document.title}
          {isDirty ? <span className="compare-pane-dirty" aria-label={labels.save} /> : null}
        </span>
        <div className="compare-pane-actions">
          <button
            type="button"
            className={document.mode === 'preview' ? 'is-active' : undefined}
            aria-pressed={document.mode === 'preview'}
            aria-label={labels.preview}
            title={labels.preview}
            onClick={() => onModeChange('preview')}
          >
            <Eye aria-hidden="true" />
          </button>
          <button
            type="button"
            className={document.mode === 'edit' ? 'is-active' : undefined}
            aria-pressed={document.mode === 'edit'}
            aria-label={labels.edit}
            title={labels.edit}
            onClick={() => onModeChange('edit')}
          >
            <PencilLine aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={labels.save}
            title={labels.save}
            disabled={!isDirty}
            onClick={onSave}
          >
            <Save aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={labels.remove(document.title)}
            title={labels.remove(document.title)}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="compare-pane-body">
        {document.mode === 'edit' ? (
          <textarea
            className="compare-pane-editor"
            aria-label={document.title}
            value={document.content}
            spellCheck={false}
            wrap={isPlainText ? 'soft' : 'off'}
            onChange={(event) => onContentChange(event.target.value)}
          />
        ) : isPlainText ? (
          <PlainTextPreview content={document.content} label={document.title} />
        ) : (
          <Suspense fallback={<div className="compare-pane-loading">{labels.loading}</div>}>
            <LazyMarkdownPreview
              content={document.content}
              sourcePath={document.path}
              theme={theme}
              labels={previewLabels}
              readLocalImageFile={readLocalImageFile}
            />
          </Suspense>
        )}
      </div>
    </article>
  )
}
