import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  handler: null as null | ((event: { preventDefault: () => void }) => Promise<void>),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: typeof mocks.handler) => {
      mocks.handler = handler
      return () => undefined
    },
    close: mocks.close,
  }),
}))

import { useSaveOnClose } from './useSaveOnClose'

function renderSaveOnClose(overrides: Partial<Parameters<typeof useSaveOnClose>[0]> = {}) {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  const onSave = overrides.onSave ?? vi.fn(async () => true)
  renderHook(() => useSaveOnClose({
    enabled: true,
    documentPath: 'D:\\novel\\chapter.md',
    isDirty: true,
    saveBlocked: false,
    ...overrides,
    onSave,
  }))
  return { onSave }
}

async function closeWindow() {
  await waitFor(() => expect(mocks.handler).not.toBeNull())
  const event = { preventDefault: vi.fn() }
  await act(async () => {
    await mocks.handler?.(event)
  })
  return event
}

describe('useSaveOnClose', () => {
  beforeEach(() => {
    mocks.handler = null
    mocks.close.mockClear()
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('saves pending edits before closing', async () => {
    const { onSave } = renderSaveOnClose()

    const event = await closeWindow()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('closes without saving when auto save is off', async () => {
    const { onSave } = renderSaveOnClose({ enabled: false })

    const event = await closeWindow()

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('keeps the window open when the save fails', async () => {
    const { onSave } = renderSaveOnClose({ onSave: vi.fn(async () => false) })

    const event = await closeWindow()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('skips clean or blocked documents', async () => {
    const clean = renderSaveOnClose({ isDirty: false })
    const event = await closeWindow()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(clean.onSave).not.toHaveBeenCalled()
  })
})
