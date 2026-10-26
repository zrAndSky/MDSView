import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { PanelSide } from '../../domain/sidePanels'

type SidePanelColumnProps = {
  side: PanelSide
  width: number
  stack: number
  showOutline: boolean
  showCollections: boolean
  outline: ReactNode
  collections: ReactNode
  labels: {
    outlinePanel: string
    collectionsPanel: string
    width: string
    stack: string
  }
  onWidthPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onWidthKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onStackPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onStackKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function SidePanelColumn({
  side,
  width,
  stack,
  showOutline,
  showCollections,
  outline,
  collections,
  labels,
  onWidthPointerDown,
  onWidthKeyDown,
  onStackPointerDown,
  onStackKeyDown,
}: SidePanelColumnProps) {
  const widthResizer = (
    <div
      className="panel-width-resizer"
      role="separator"
      aria-label={labels.width}
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={420}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onWidthPointerDown}
      onKeyDown={onWidthKeyDown}
    />
  )

  return (
    <>
      {side === 'right' ? widthResizer : null}
      <aside className={`panel-column ${side}`} style={{ width }}>
        {showOutline ? (
          <div
            className="panel-slot"
            aria-label={labels.outlinePanel}
            style={{ width, flex: showCollections ? `${stack} 1 0` : '1 1 0' }}
          >
            {outline}
          </div>
        ) : null}
        {showOutline && showCollections ? (
          <div
            className="panel-stack-resizer"
            role="separator"
            aria-label={labels.stack}
            aria-orientation="horizontal"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(stack)}
            tabIndex={0}
            onPointerDown={onStackPointerDown}
            onKeyDown={onStackKeyDown}
          />
        ) : null}
        {showCollections ? (
          <div
            className="panel-slot"
            aria-label={labels.collectionsPanel}
            style={{ width, flex: showOutline ? `${100 - stack} 1 0` : '1 1 0' }}
          >
            {collections}
          </div>
        ) : null}
      </aside>
      {side === 'left' ? widthResizer : null}
    </>
  )
}
