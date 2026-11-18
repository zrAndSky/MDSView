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

import { useSaveOnClose, type PendingSave } from './useSaveOnClose'

function pending(overrides: Partial<PendingSave> = {}): PendingSave {
  return { id: 'tab-1', title: 'chapter.md', canSave: true, ...overrides }
}

function renderSaveOnClose(overrides: {
  autoSaveEnabled?: boolean
  collectPending?: () => PendingSave[]
  saveAll?: () => Promise<boolean>
  discardConfirm?: (count: number) => string
} = {}) {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  const saveAll = overrides.saveAll ?? vi.fn(async () => true)
  renderHook(() => useSaveOnClose({
    autoSaveEnabled: overrides.autoSaveEnabled ?? true,
    collectPending: overrides.collectPending ?? (() => [pending()]),
    saveAll,
    discardConfirm: overrides.discardConfirm ?? ((count) => `Discard ${count}?`),
  }))
  return { saveAll }
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
  let confirm: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mocks.handler = null
    mocks.close.mockClear()
    confirm = vi.fn(() => true)
    window.confirm = confirm as unknown as typeof window.confirm
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    vi.restoreAllMocks()
  })

  it('saves every pending document before closing', async () => {
    const { saveAll } = renderSaveOnClose({
      collectPending: () => [pending(), pending({ id: 'tab-2', title: 'b.md' })],
    })

    const event = await closeWindow()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(saveAll).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the window open when a save fails', async () => {
    renderSaveOnClose({ saveAll: vi.fn(async () => false) })

    const event = await closeWindow()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('asks before discarding when auto save is off', async () => {
    const { saveAll } = renderSaveOnClose({ autoSaveEnabled: false })

    const event = await closeWindow()

    expect(event.preventDefault).toHaveBeenCalled()
    expect(saveAll).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('cannot auto save an untitled document, so it asks instead', async () => {
    const { saveAll } = renderSaveOnClose({
      collectPending: () => [pending({ id: 'untitled', title: 'Untitled.md', canSave: false })],
    })

    await closeWindow()

    expect(saveAll).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('stays open when the discard prompt is cancelled', async () => {
    confirm.mockReturnValue(false)
    renderSaveOnClose({ autoSaveEnabled: false })

    await closeWindow()

    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('closes immediately when nothing is unsaved', async () => {
    const { saveAll } = renderSaveOnClose({ collectPending: () => [] })

    const event = await closeWindow()

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(saveAll).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
  })
})
