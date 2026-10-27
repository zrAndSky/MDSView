import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { Translation } from '../../i18n'

type CreatePlaylistDialogProps = {
  defaultName: string
  currentTitle: string | null
  t: Translation
  onCancel: () => void
  onCreate: (name: string, addCurrent: boolean) => void
}

export function CreatePlaylistDialog({
  defaultName,
  currentTitle,
  t,
  onCancel,
  onCreate,
}: CreatePlaylistDialogProps) {
  const [name, setName] = useState(defaultName)
  const [addCurrent, setAddCurrent] = useState(true)
  const ref = useDialogFocus(true, onCancel)
  const trimmed = name.trim()

  return createPortal(
    <div className="dialog-backdrop">
      <section
        ref={ref}
        className="draft-recovery-dialog create-playlist-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-playlist-title"
      >
        <h2 id="create-playlist-title">{t.newPlaylist}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed) {
              return
            }
            onCreate(trimmed, addCurrent && currentTitle !== null)
          }}
        >
          <label className="create-playlist-field">
            <span>{t.playlistNameLabel}</span>
            <input
              autoFocus
              data-dialog-initial-focus
              value={name}
              aria-label={t.playlistNameLabel}
              onChange={(event) => setName(event.currentTarget.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {currentTitle !== null ? (
            <label className="create-playlist-check">
              <input
                type="checkbox"
                checked={addCurrent}
                onChange={(event) => setAddCurrent(event.currentTarget.checked)}
              />
              <span>{t.addCurrentToNewPlaylist}</span>
              <span className="create-playlist-doc" title={currentTitle}>{currentTitle}</span>
            </label>
          ) : null}
          <div className="draft-recovery-actions">
            <button type="button" className="update-secondary-action" onClick={onCancel}>
              {t.cancelAction}
            </button>
            <button type="submit" className="update-primary-action" disabled={!trimmed}>
              {t.createAction}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
