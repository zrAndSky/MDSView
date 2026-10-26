import { useCallback, useEffect, useState } from 'react'
import {
  clampPanelStack,
  clampPanelWidth,
  loadSidePanels,
  normalizeSidePanels,
  saveSidePanels,
  type PanelSide,
  type SidePanelState,
} from '../domain/sidePanels'

export function useSidePanels() {
  const [state, setState] = useState(loadSidePanels)

  useEffect(() => {
    saveSidePanels(state)
  }, [state])

  const update = useCallback((changes: Partial<SidePanelState>) => {
    setState((current) => normalizeSidePanels({ ...current, ...changes }))
  }, [])

  const setWidth = useCallback((side: PanelSide, width: number) => {
    setState((current) => ({
      ...current,
      widths: { ...current.widths, [side]: clampPanelWidth(width) },
    }))
  }, [])

  const setStack = useCallback((side: PanelSide, stack: number) => {
    setState((current) => ({
      ...current,
      stacks: { ...current.stacks, [side]: clampPanelStack(stack) },
    }))
  }, [])

  return { state, update, setWidth, setStack }
}

export type SidePanelsController = ReturnType<typeof useSidePanels>
