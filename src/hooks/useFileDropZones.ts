import { useEffect, useLayoutEffect, useRef } from 'react'
import { isMarkdownPath } from '../platform/markdownFiles'

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

export type DropZone = {
  key: string
  selector: string
  onDrop: (paths: string[]) => void
}

type UseFileDropZonesOptions = {
  enabled: boolean
  /** Tested in order; the first element containing the pointer wins. */
  zones: DropZone[]
  /** null while the pointer is outside every zone. */
  onActiveZoneChange: (key: string | null) => void
}

/**
 * One drag listener for the whole window, dispatching by where the pointer is.
 * Registering a listener per zone would be wasteful and made overlapping
 * panels fight over the same drop.
 */
export function useFileDropZones({ enabled, zones, onActiveZoneChange }: UseFileDropZonesOptions) {
  const zonesRef = useRef(zones)
  const activeChangeRef = useRef(onActiveZoneChange)

  useLayoutEffect(() => {
    zonesRef.current = zones
    activeChangeRef.current = onActiveZoneChange
  })

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }

    let disposed = false
    const unlisteners: Array<() => void> = []
    let activeKey: string | null = null
    let lastDropKey = ''
    let lastDropAt = 0

    function setActive(key: string | null) {
      if (key === activeKey) {
        return
      }
      activeKey = key
      activeChangeRef.current(key)
    }

    function zoneAt(position?: DropPoint): DropZone | null {
      if (!position) {
        return null
      }
      const scale = window.devicePixelRatio || 1
      for (const zone of zonesRef.current) {
        const element = document.querySelector<HTMLElement>(zone.selector)
        if (element && isPointInside(position, element.getBoundingClientRect(), scale)) {
          return zone
        }
      }
      return null
    }

    const handle = (payload: {
      type: 'enter' | 'over' | 'drop' | 'leave'
      paths?: string[]
      position?: DropPoint
    }) => {
      if (payload.type === 'enter' || payload.type === 'over') {
        setActive(zoneAt(payload.position)?.key ?? null)
        return
      }
      if (payload.type !== 'drop') {
        setActive(null)
        return
      }

      setActive(null)
      const zone = zoneAt(payload.position)
      const paths = markdownPaths(payload.paths ?? [])
      if (!zone || paths.length === 0) {
        return
      }

      // The window and webview listeners can both fire for one drop.
      const key = `${zone.key}|${paths.join('|')}`
      const now = Date.now()
      if (key === lastDropKey && now - lastDropAt < 400) {
        return
      }
      lastDropKey = key
      lastDropAt = now
      zone.onDrop(paths)
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
      activeChangeRef.current(null)
    }
  }, [enabled])
}
