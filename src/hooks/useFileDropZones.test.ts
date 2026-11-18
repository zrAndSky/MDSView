import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handler: null as null | ((event: { payload: unknown }) => void),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: async (handler: typeof mocks.handler) => {
      mocks.handler = handler
      return () => undefined
    },
  }),
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => undefined }),
}))

import { isPointInside, markdownPaths, useFileDropZones, type DropZone } from './useFileDropZones'

const RECT = { left: 100, top: 50, width: 200, height: 300 }

describe('isPointInside', () => {
  it('converts physical pixels with the device scale', () => {
    expect(isPointInside({ x: 300, y: 200 }, RECT, 2)).toBe(true)
    expect(isPointInside({ x: 100, y: 100 }, RECT, 2)).toBe(false)
    expect(isPointInside({ x: 590, y: 690 }, RECT, 2)).toBe(true)
    expect(isPointInside({ x: 610, y: 690 }, RECT, 2)).toBe(false)
  })

  it('treats the panel edges as inside', () => {
    expect(isPointInside({ x: 100, y: 50 }, RECT, 1)).toBe(true)
    expect(isPointInside({ x: 300, y: 350 }, RECT, 1)).toBe(true)
  })

  it('rejects missing panels and invalid scales', () => {
    expect(isPointInside({ x: 150, y: 100 }, null, 1)).toBe(false)
    expect(isPointInside({ x: 150, y: 100 }, RECT, 0)).toBe(false)
    expect(isPointInside({ x: 150, y: 100 }, RECT, Number.NaN)).toBe(false)
  })
})

describe('markdownPaths', () => {
  it('keeps markdown and plain-text files', () => {
    expect(markdownPaths([
      'D:\\novel\\a.md',
      'D:\\novel\\b.MARKDOWN',
      'D:\\novel\\c.txt',
      'D:\\novel\\d',
      'D:\\novel\\e.mdown',
    ])).toEqual(['D:\\novel\\a.md', 'D:\\novel\\b.MARKDOWN', 'D:\\novel\\c.txt', 'D:\\novel\\e.mdown'])
  })
})

const ZONE_RECT = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect

function mountZone(className: string) {
  const element = document.createElement('div')
  element.className = className
  element.getBoundingClientRect = () => ZONE_RECT
  document.body.appendChild(element)
  return element
}

function renderZones(zones: DropZone[]) {
  const active: Array<string | null> = []
  renderHook(() => useFileDropZones({
    enabled: true,
    zones,
    onActiveZoneChange: (key) => active.push(key),
  }))
  return active
}

async function drop(payload: unknown) {
  await waitFor(() => expect(mocks.handler).not.toBeNull())
  act(() => mocks.handler?.({ payload }))
}

describe('useFileDropZones', () => {
  beforeEach(() => {
    mocks.handler = null
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    document.body.innerHTML = ''
  })

  it('dispatches a drop to the zone under the pointer', async () => {
    mountZone('zone-a')
    const onDrop = vi.fn()
    renderZones([{ key: 'a', selector: '.zone-a', onDrop }])

    await drop({ type: 'drop', paths: ['D:\\docs\\a.md'], position: { x: 50, y: 50 } })

    expect(onDrop).toHaveBeenCalledWith(['D:\\docs\\a.md'])
  })

  it('ignores drops outside every zone and non-markdown files', async () => {
    mountZone('zone-a')
    const onDrop = vi.fn()
    renderZones([{ key: 'a', selector: '.zone-a', onDrop }])

    await drop({ type: 'drop', paths: ['D:\\docs\\a.md'], position: { x: 500, y: 500 } })
    await drop({ type: 'drop', paths: ['D:\\docs\\photo.png'], position: { x: 50, y: 50 } })

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('prefers the first matching zone when panels overlap', async () => {
    mountZone('zone-a')
    mountZone('zone-b')
    const first = vi.fn()
    const second = vi.fn()
    renderZones([
      { key: 'a', selector: '.zone-a', onDrop: first },
      { key: 'b', selector: '.zone-b', onDrop: second },
    ])

    await drop({ type: 'drop', paths: ['D:\\docs\\a.md'], position: { x: 10, y: 10 } })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('reports the hovered zone and clears it on leave', async () => {
    mountZone('zone-a')
    const active = renderZones([{ key: 'a', selector: '.zone-a', onDrop: vi.fn() }])

    await drop({ type: 'over', position: { x: 20, y: 20 } })
    await drop({ type: 'leave' })

    expect(active).toEqual(['a', null])
  })
})
