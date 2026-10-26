import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Monitor, Moon, RotateCcw, Sun, X } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AutoSaveSetting } from './AutoSaveSetting'
import {
  READING_CONTENT_WIDTH_RANGE,
  READING_FONT_SIZE_RANGE,
  READING_LINE_HEIGHT_RANGE,
  type ReadingPreferences,
  type ReadingThemeMode,
} from '../../domain/readingPreferences'
import type { Translation } from '../../i18n'
import type { PanelSide } from '../../domain/sidePanels'
import { systemFontAccess } from '../../platform/systemFonts'

type ReadingSettingsDialogProps = {
  open: boolean
  preferences: ReadingPreferences
  onClose: () => void
  onReset: () => void
  onUpdate: (changes: Partial<ReadingPreferences>) => void
  t: Translation
  outlineOpen?: boolean
  outlineSide?: PanelSide
  collectionsOpen?: boolean
  collectionsSide?: PanelSide
  onOutlineOpenChange?: (open: boolean) => void
  onOutlineSideChange?: (side: PanelSide) => void
  onCollectionsOpenChange?: (open: boolean) => void
  onCollectionsSideChange?: (side: PanelSide) => void
}

type FontListState = 'idle' | 'loading' | 'ready' | 'error'

export function ReadingSettingsDialog({
  open,
  preferences,
  onClose,
  onReset,
  onUpdate,
  t,
  outlineOpen = true,
  outlineSide = 'left',
  collectionsOpen = false,
  collectionsSide = 'left',
  onOutlineOpenChange,
  onOutlineSideChange,
  onCollectionsOpenChange,
  onCollectionsSideChange,
}: ReadingSettingsDialogProps) {
  const dialogRef = useDialogFocus(open, onClose)
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false)
  const [fontListState, setFontListState] = useState<FontListState>('idle')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontQuery, setFontQuery] = useState('')

  const loadSystemFonts = useCallback(async () => {
    if (!systemFontAccess.supportsSystemFonts) {
      return
    }

    setFontListState('loading')
    try {
      const fonts = await systemFontAccess.listSystemFontFamilies()
      setSystemFonts([...new Set(fonts)].sort((left, right) => left.localeCompare(right)))
      setFontListState('ready')
    } catch {
      setFontListState('error')
    }
  }, [])

  const openFontPicker = useCallback(() => {
    if (!systemFontAccess.supportsSystemFonts) {
      return
    }

    setIsFontPickerOpen(true)
    if (fontListState === 'idle' || fontListState === 'error') {
      void loadSystemFonts()
    }
  }, [fontListState, loadSystemFonts])

  const filteredFonts = useMemo(() => {
    const query = fontQuery.trim().toLocaleLowerCase()
    if (!query) {
      return systemFonts
    }

    return systemFonts.filter((font) => font.toLocaleLowerCase().includes(query))
  }, [fontQuery, systemFonts])

  if (!open) {
    return null
  }

  return (
    <div ref={dialogRef} className="dialog-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) {
        onClose()
      }
    }}>
      <section className="reading-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-settings-title">
        <button type="button" className="about-close" onClick={onClose} aria-label={t.closeReadingSettings}>
          <X aria-hidden="true" />
        </button>
        <header className="reading-settings-header">
          <h2 id="reading-settings-title">{t.readingSettings}</h2>
          <p>{t.readingSettingsSubtitle}</p>
        </header>

        <section className="reading-settings-section" aria-labelledby="theme-mode-label">
          <h3 id="theme-mode-label">{t.themeMode}</h3>
          <div className="reading-theme-modes" role="group" aria-label={t.themeMode}>
            <ThemeModeButton mode="system" value={preferences.themeMode} label={t.themeSystem} onChange={onUpdate} icon={<Monitor />} />
            <ThemeModeButton mode="light" value={preferences.themeMode} label={t.themeLight} onChange={onUpdate} icon={<Sun />} />
            <ThemeModeButton mode="dark" value={preferences.themeMode} label={t.themeDark} onChange={onUpdate} icon={<Moon />} />
          </div>
        </section>

        <section className="reading-settings-section" aria-labelledby="font-family-label">
          <h3 id="font-family-label">{t.readingFont}</h3>
          <div className="reading-font-options" role="group" aria-label={t.readingFont}>
            <FontOption active={preferences.fontFamily === 'sans'} label={t.fontSans} onClick={() => { setIsFontPickerOpen(false); onUpdate({ fontFamily: 'sans' }) }} />
            <FontOption active={preferences.fontFamily === 'serif'} label={t.fontSerif} onClick={() => { setIsFontPickerOpen(false); onUpdate({ fontFamily: 'serif' }) }} />
            <FontOption active={preferences.fontFamily === 'monospace'} label={t.fontMonospace} onClick={() => { setIsFontPickerOpen(false); onUpdate({ fontFamily: 'monospace' }) }} />
            <FontOption
              active={preferences.fontFamily === 'custom'}
              disabled={!systemFontAccess.supportsSystemFonts}
              label={t.fontCustom}
              onClick={openFontPicker}
            />
          </div>
          <p className="reading-font-description">
            {systemFontAccess.supportsSystemFonts ? t.fontCustomDescription : t.fontCustomUnavailable}
          </p>
          {isFontPickerOpen && systemFontAccess.supportsSystemFonts ? (
            <div className="reading-font-picker">
              <div className="reading-font-picker-header">
                <span>{t.fontCustomChoose}</span>
                {preferences.fontFamily === 'custom' && preferences.customFontFamily ? (
                  <span className="reading-font-selected">{t.fontCustomSelected(preferences.customFontFamily)}</span>
                ) : null}
              </div>
              <input
                type="search"
                value={fontQuery}
                onChange={(event) => setFontQuery(event.currentTarget.value)}
                placeholder={t.fontCustomSearch}
                aria-label={t.fontCustomSearch}
              />
              {fontListState === 'loading' ? <p className="reading-font-status">{t.fontCustomLoading}</p> : null}
              {fontListState === 'error' ? (
                <div className="reading-font-error">
                  <span>{t.fontCustomLoadError}</span>
                  <button type="button" onClick={() => void loadSystemFonts()}>{t.fontCustomRetry}</button>
                </div>
              ) : null}
              {fontListState === 'ready' && filteredFonts.length === 0 ? <p className="reading-font-status">{t.fontCustomEmpty}</p> : null}
              {fontListState === 'ready' && filteredFonts.length > 0 ? (
                <div className="reading-font-list" role="listbox" aria-label={t.fontCustomChoose}>
                  {filteredFonts.map((font) => (
                    <button
                      key={font}
                      type="button"
                      role="option"
                      aria-selected={preferences.fontFamily === 'custom' && preferences.customFontFamily === font}
                      className={preferences.fontFamily === 'custom' && preferences.customFontFamily === font ? 'active' : ''}
                      style={{ fontFamily: quoteCssFontFamily(font) }}
                      onClick={() => onUpdate({ fontFamily: 'custom', customFontFamily: font })}
                    >
                      <span>{font}</span>
                      <small>Aa 中文</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="reading-settings-section reading-settings-sliders" aria-label={t.readingLayout}>
          <RangeSetting label={t.fontSize(preferences.fontSize)} value={preferences.fontSize} range={READING_FONT_SIZE_RANGE} onChange={(fontSize) => onUpdate({ fontSize })} />
          <RangeSetting label={t.lineHeight(preferences.lineHeight)} value={preferences.lineHeight} range={READING_LINE_HEIGHT_RANGE} onChange={(lineHeight) => onUpdate({ lineHeight })} />
          <RangeSetting label={t.contentWidth(preferences.contentWidth)} value={preferences.contentWidth} range={READING_CONTENT_WIDTH_RANGE} onChange={(contentWidth) => onUpdate({ contentWidth })} />
        </section>

        <AutoSaveSetting t={t} />

        {onOutlineOpenChange && onOutlineSideChange && onCollectionsOpenChange && onCollectionsSideChange ? (
          <section className="reading-settings-section" aria-labelledby="side-panels-label">
            <h3 id="side-panels-label">{t.sidePanels}</h3>
            <div className="side-panel-settings">
              <PanelSetting
                label={t.outlineTab}
                side={outlineSide}
                open={outlineOpen}
                sideLabels={{ left: t.sideLeft, right: t.sideRight }}
                openLabel={t.panelDefaultOpen}
                onSideChange={onOutlineSideChange}
                onOpenChange={onOutlineOpenChange}
              />
              <PanelSetting
                label={t.playlistsTab}
                side={collectionsSide}
                open={collectionsOpen}
                sideLabels={{ left: t.sideLeft, right: t.sideRight }}
                openLabel={t.panelDefaultOpen}
                onSideChange={onCollectionsSideChange}
                onOpenChange={onCollectionsOpenChange}
              />
            </div>
          </section>
        ) : null}

        <section className="reading-sample-section" aria-label={t.readingSampleTitle}>
          <h3>{t.readingSampleTitle}</h3>
          <div className="reading-sample" style={{ width: `${preferences.contentWidth / READING_CONTENT_WIDTH_RANGE.max * 100}%` }}>
            <p>{t.readingSampleText}</p>
            <code>const theme = "MDSView"</code>
            <table><tbody><tr><th>Markdown</th><td>{t.readingSampleCode}</td></tr></tbody></table>
          </div>
        </section>
        <footer className="reading-settings-actions">
          <button type="button" className="reading-settings-reset" onClick={onReset}>
            <RotateCcw aria-hidden="true" />
            {t.resetReadingSettings}
          </button>
        </footer>
      </section>
    </div>
  )
}

function PanelSetting({
  label,
  side,
  open,
  sideLabels,
  openLabel,
  onSideChange,
  onOpenChange,
}: {
  label: string
  side: PanelSide
  open: boolean
  sideLabels: { left: string; right: string }
  openLabel: string
  onSideChange: (side: PanelSide) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <div className="side-panel-setting">
      <span className="side-panel-setting-label">{label}</span>
      <div className="side-panel-side-options" role="group" aria-label={label}>
        <button type="button" className={side === 'left' ? 'active' : ''} aria-pressed={side === 'left'} onClick={() => onSideChange('left')}>{sideLabels.left}</button>
        <button type="button" className={side === 'right' ? 'active' : ''} aria-pressed={side === 'right'} onClick={() => onSideChange('right')}>{sideLabels.right}</button>
      </div>
      <label className="side-panel-open">
        <input type="checkbox" checked={open} onChange={(event) => onOpenChange(event.currentTarget.checked)} />
        <span>{openLabel}</span>
      </label>
    </div>
  )
}

function FontOption({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-pressed={active} disabled={disabled}>
      {label}
    </button>
  )
}

function ThemeModeButton({
  mode,
  value,
  label,
  onChange,
  icon,
}: {
  mode: ReadingThemeMode
  value: ReadingThemeMode
  label: string
  onChange: (changes: Partial<ReadingPreferences>) => void
  icon: ReactNode
}) {
  return (
    <button type="button" className={value === mode ? 'active' : ''} onClick={() => onChange({ themeMode: mode })} aria-pressed={value === mode}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function RangeSetting({
  label,
  value,
  range,
  onChange,
}: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onChange: (value: number) => void
}) {
  return (
    <label className="reading-range-setting">
      <span>{label}</span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  )
}

function quoteCssFontFamily(fontFamily: string): string {
  return `"${fontFamily.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')}"`
}
