import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_SAVE_DEBOUNCE_MS,
  AUTO_SAVE_STORAGE_KEY,
  loadAutoSaveEnabled,
  setAutoSaveEnabled,
} from '../domain/autoSave'
import { useAutoSave, useAutoSavePreference } from './useAutoSave'

type AutoSaveOptions = Omit<Parameters<typeof useAutoSave>[0], 'onSave'>

const baseOptions: AutoSaveOptions = {
  enabled: true,
  documentPath: 'D:\\notes\\draft.md',
  content: 'first',
  isDirty: true,
  isSaving: false,
  saveBlocked: false,
}

function renderAutoSave(overrides: Partial<AutoSaveOptions> = {}) {
  const onSave = vi.fn(async () => true)
  const hook = renderHook(
    (props: AutoSaveOptions) => useAutoSave({ ...props, onSave }),
    { initialProps: { ...baseOptions, ...overrides } },
  )
  return { onSave, ...hook }
}

function openModal() {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  document.body.appendChild(dialog)
  return dialog
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAutoSaveEnabled(false)
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('saves only after the debounce window', () => {
    const { onSave } = renderAutoSave()

    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS - 1))
    expect(onSave).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('restarts the debounce while the user keeps typing', () => {
    const { onSave, rerender } = renderAutoSave()

    act(() => vi.advanceTimersByTime(1000))
    rerender({ ...baseOptions, content: 'second' })
    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS - 1))
    expect(onSave).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('never saves when the preference is off', () => {
    const { onSave } = renderAutoSave({ enabled: false })

    act(() => vi.advanceTimersByTime(10_000))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not autosave a document without a path', () => {
    const { onSave } = renderAutoSave({ documentPath: null })

    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not autosave while the document is externally blocked', () => {
    const { onSave } = renderAutoSave({ saveBlocked: true })

    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('holds the save until an in-flight save finishes', () => {
    const { onSave, rerender } = renderAutoSave({ isSaving: true })

    act(() => vi.advanceTimersByTime(5000))
    expect(onSave).not.toHaveBeenCalled()

    rerender({ ...baseOptions, isSaving: false })
    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('skips the save when a modal dialog is open', () => {
    const { onSave } = renderAutoSave()
    openModal()

    act(() => vi.advanceTimersByTime(5000))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('stops once the document is clean again', () => {
    const { onSave, rerender } = renderAutoSave()

    act(() => vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS))
    expect(onSave).toHaveBeenCalledTimes(1)

    rerender({ ...baseOptions, isDirty: false })
    act(() => vi.advanceTimersByTime(10_000))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe('useAutoSavePreference', () => {
  beforeEach(() => {
    setAutoSaveEnabled(true)
    window.localStorage.clear()
  })

  it('is on by default', () => {
    const { result } = renderHook(() => useAutoSavePreference())

    expect(result.current[0]).toBe(true)
    expect(loadAutoSaveEnabled()).toBe(true)
  })

  it('persists changes and notifies subscribers', () => {
    const { result } = renderHook(() => useAutoSavePreference())

    act(() => result.current[1](false))

    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY)).toBe('false')

    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY)).toBe('true')
  })
})
