import type { Ref } from 'react'
import './plainTextPreview.css'

type PlainTextPreviewProps = {
  content: string
  previewRef?: Ref<HTMLElement>
  label: string
  emptyLabel?: string
}

/**
 * Renders plain-text (.txt) content verbatim: the source is shown exactly as
 * written, without Markdown parsing, so `#` or `*` stay literal characters.
 */
export function PlainTextPreview({ content, previewRef, label, emptyLabel }: PlainTextPreviewProps) {
  return (
    <div className="plain-text-surface">
      {content.length === 0 && emptyLabel
        ? <p className="plain-text-empty">{emptyLabel}</p>
        : <pre className="plain-text-preview" aria-label={label} ref={previewRef as Ref<HTMLPreElement>} tabIndex={0}>{content}</pre>}
    </div>
  )
}
