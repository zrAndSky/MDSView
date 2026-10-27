import { useEffect, useEffectEvent } from 'react'
import { isMarkdownPath } from '../platform/markdownFiles'

type UseCollectionsFileDropOptions = {
  enabled: boolean
  onDropFiles: (paths: string[]) => void
  onHoverChange: (over: boolean) => void
  panelSelector?: string
}

export type DropPoint = { x: number; y: number }

export type DropRect = { left: number; top: number; width: number; height: number }

/** Tauri reports physical pixels; the DOM uses CSS pixels. */
export function isPointInside(position: DropPoint, rect: DropRect | null, scale: number): boolean {
  if (!rect || !Number.isFinite(scale) || scale <= 0) {
    return false
  }
  const x = position.x / scale
  const y = position.y / scale
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
}

export function markdownPaths(paths: string[]): string[] {
  return paths.filter((path) => isMarkdownPath(path))
}

export function useCollectionsFileDrop({
  enabled,
  onDropFiles,
  onHoverChange,
  panelSelector = '.playlist-panel',
}: UseCollectionsFileDropOptions) {
  const dropFiles = useEffectEvent((paths: string[]) => onDropFiles(paths))
  const hoverChange = useEffectEvent((over: boolean) => onHoverChange(over))

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }

    const overPanel = (position: DropPoint) => {
      const panel = document.querySelector<HTMLElement>(panelSelector)
      const scale = window.devicePixelRatio || 1
      return panel ? isPointInside(position, panel.getBoundingClientRect(), scale) : false
    }

    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      try {
        // Loaded on demand so the webview API stays out of the startup bundle.
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload
          if (payload.type === 'enter' || payload.type === 'over') {
            hoverChange(overPanel(payload.position))
          } else if (payload.type === 'drop') {
            const over = overPanel(payload.position)
            hoverChange(false)
            if (!over) {
              return
            }
            const paths = markdownPaths(payload.paths)
            if (paths.length > 0) {
              dropFiles(paths)
            }
          } else {
            hoverChange(false)
          }
        })
        if (disposed) {
          stop()
        } else {
          unlisten = stop
        }
      } catch {
        // Drag and drop stays unavailable when the runtime does not expose it.
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
      hoverChange(false)
    }
  }, [enabled, panelSelector])
}
