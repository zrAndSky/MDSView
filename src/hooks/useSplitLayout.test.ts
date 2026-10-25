import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSplitLayout } from './useSplitLayout'

function pointerMoveHook(clientX: number) {
  const parent = document.createElement('div')
  const target = document.createElement('div')
  parent.appendChild(target)
  parent.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 500 } as DOMRect)
  target.hasPointerCapture = () => true
  target.setPointerCapture = vi.fn()

  return {
    clientX,
    pointerId: 1,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent<HTMLDivElement>
}

describe('useSplitLayout', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts with the upstream defaults', () => {
    const { result } = renderHook(() => useSplitLayout())

    expect(result.current.ratio).toBe(42)
    expect(result.current.swapped).toBe(false)
  })

  it('persists the swapped preference', () => {
    const first = renderHook(() => useSplitLayout())
    act(() => first.result.current.toggleSwapped())

    expect(first.result.current.swapped).toBe(true)
    expect(window.localStorage.getItem('mdview.splitSwapped.v1')).toBe('true')

    first.unmount()
    const second = renderHook(() => useSplitLayout())
    expect(second.result.current.swapped).toBe(true)
  })

  it('maps the pointer position to the editor share', () => {
    const { result } = renderHook(() => useSplitLayout())

    act(() => result.current.onPointerMove(pointerMoveHook(600)))

    expect(result.current.ratio).toBe(60)
  })

  it('inverts the pointer position when swapped', () => {
    const { result } = renderHook(() => useSplitLayout())
    act(() => result.current.toggleSwapped())

    act(() => result.current.onPointerMove(pointerMoveHook(600)))

    expect(result.current.ratio).toBe(40)
  })

  it('inverts arrow keys when swapped but keeps home and end literal', () => {
    const { result } = renderHook(() => useSplitLayout())
    act(() => result.current.toggleSwapped())

    act(() => result.current.onKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>))
    expect(result.current.ratio).toBe(44)

    act(() => result.current.onKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>))
    expect(result.current.ratio).toBe(42)

    act(() => result.current.onKeyDown({ key: 'Home', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>))
    expect(result.current.ratio).toBe(25)

    act(() => result.current.onKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>))
    expect(result.current.ratio).toBe(50)
  })
})
