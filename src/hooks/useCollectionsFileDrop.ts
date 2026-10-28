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
    const unlisteners: Array<() => void> = []
    let lastDropKey = ''
    let lastDropAt = 0

    const handle = (payload: {
      type: 'enter' | 'over' | 'drop' | 'leave'
      paths?: string[]
      position?: { x: number; y: number }
    }) => {
      if (payload.type === 'enter' || payload.type === 'over') {
        hoverChange(payload.position ? overPanel(payload.position) : false)
        return
      }
      if (payload.type !== 'drop') {
        hoverChange(false)
        return
      }

      hoverChange(false)
      const paths = markdownPaths(payload.paths ?? [])
      if (paths.length === 0) {
        return
      }
      const key = paths.join('|')
      const now = Date.now()
      if (key === lastDropKey && now - lastDropAt < 400) {
        return
      }
      lastDropKey = key
      lastDropAt = now
      dropFiles(paths)
    }

    void (async () => {
      // Drag events are emitted to the window target; the webview listener is a
      // safety net for runtimes that scope them differently.
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const stop = await getCurrentWindow().onDragDropEvent((event) => handle(event.payload))
        if (disposed) stop()
        else unlisteners.push(stop)
      } catch {
        // Keep the webview listener as the fallback.
      }
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const stop = await getCurrentWebview().onDragDropEvent((event) => handle(event.payload))
        if (disposed) stop()
        else unlisteners.push(stop)
      } catch {
        // Drag and drop stays unavailable when the runtime does not expose it.
      }
    })()

    return () => {
      disposed = true
      unlisteners.forEach((stop) => stop())
      unlisteners.length = 0
      hoverChange(false)
    }
  }, [enabled, panelSelector])
}
