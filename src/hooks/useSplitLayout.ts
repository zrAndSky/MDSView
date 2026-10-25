import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'

const KEY = 'mdview.splitRatio.v1'
const SWAPPED_KEY = 'mdview.splitSwapped.v1'
const clamp = (ratio: number) => Math.min(75, Math.max(25, ratio))

export function useSplitLayout() {
  const [ratio, setRatio] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY)
      const value = saved === null ? 42 : Number(saved)
      return Number.isFinite(value) ? clamp(value) : 42
    } catch { return 42 }
  })
  const [swapped, setSwapped] = useState(() => {
    try {
      return localStorage.getItem(SWAPPED_KEY) === 'true'
    } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem(KEY, String(ratio)) } catch { /* Optional preference. */ } }, [ratio])
  useEffect(() => { try { localStorage.setItem(SWAPPED_KEY, String(swapped)) } catch { /* Optional preference. */ } }, [swapped])
  const toggleSwapped = useCallback(() => setSwapped((value) => !value), [])
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
    if (!bounds.width) return
    const position = clamp((event.clientX - bounds.left) / bounds.width * 100)
    setRatio(swapped ? 100 - position : position)
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Enter' || event.key === 'Home' || event.key === 'End') {
      setRatio(event.key === 'Enter' ? 50 : event.key === 'Home' ? 25 : 75)
      return
    }
    const step = event.key === 'ArrowLeft' ? -2 : 2
    setRatio((value) => clamp(swapped ? value - step : value + step))
  }
  return { ratio, swapped, toggleSwapped, onPointerDown, onPointerMove, onKeyDown, reset: () => setRatio(50) }
}
