import type { Translation } from '../../i18n'
import { useAutoSavePreference } from '../../hooks/useAutoSave'

export function AutoSaveSetting({ t }: { t: Translation }) {
  const [enabled, setEnabled] = useAutoSavePreference()

  return (
    <section className="reading-settings-section" aria-labelledby="auto-save-label">
      <h3 id="auto-save-label">{t.autoSave}</h3>
      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          color: 'var(--control-text)',
          font: '650 12px/1.35 var(--ui-font)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          style={{ margin: 0, accentColor: 'var(--accent)' }}
        />
        <span>{t.autoSaveDescription}</span>
      </label>
    </section>
  )
}
