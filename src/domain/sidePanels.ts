export type PanelSide = 'left' | 'right'

export type SidePanelState = {
  version: 1
  outlineSide: PanelSide
  collectionsSide: PanelSide
  collectionsOpen: boolean
  widths: { left: number; right: number }
  stacks: { left: number; right: number }
}

export const SIDE_PANEL_STORAGE_KEY = 'mdview.sidePanels.v1'
export const MIN_PANEL_WIDTH = 180
export const MAX_PANEL_WIDTH = 420
export const DEFAULT_PANEL_WIDTH = 260
export const MIN_PANEL_STACK = 25
export const MAX_PANEL_STACK = 75

export const DEFAULT_SIDE_PANELS: SidePanelState = {
  version: 1,
  outlineSide: 'left',
  collectionsSide: 'left',
  collectionsOpen: false,
  widths: { left: DEFAULT_PANEL_WIDTH, right: DEFAULT_PANEL_WIDTH },
  stacks: { left: 50, right: 50 },
}

export function clampPanelWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PANEL_WIDTH
  }
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(value)))
}

export function clampPanelStack(value: number): number {
  if (!Number.isFinite(value)) {
    return 50
  }
  return Math.min(MAX_PANEL_STACK, Math.max(MIN_PANEL_STACK, Math.round(value)))
}

export function loadSidePanels(storage: Storage | null = getLocalStorage()): SidePanelState {
  if (!storage) {
    return DEFAULT_SIDE_PANELS
  }

  try {
    const rawValue = storage.getItem(SIDE_PANEL_STORAGE_KEY)
    return rawValue ? normalizeSidePanels(JSON.parse(rawValue)) : DEFAULT_SIDE_PANELS
  } catch {
    return DEFAULT_SIDE_PANELS
  }
}

export function saveSidePanels(state: SidePanelState, storage: Storage | null = getLocalStorage()) {
  storage?.setItem(SIDE_PANEL_STORAGE_KEY, JSON.stringify(normalizeSidePanels(state)))
}

export function normalizeSidePanels(value: unknown): SidePanelState {
  if (!value || typeof value !== 'object') {
    return DEFAULT_SIDE_PANELS
  }

  const record = value as Record<string, unknown>
  if (record.version !== 1) {
    return DEFAULT_SIDE_PANELS
  }

  const widths = (record.widths && typeof record.widths === 'object')
    ? record.widths as Record<string, unknown>
    : {}
  const stacks = (record.stacks && typeof record.stacks === 'object')
    ? record.stacks as Record<string, unknown>
    : {}

  return {
    version: 1,
    outlineSide: isPanelSide(record.outlineSide) ? record.outlineSide : DEFAULT_SIDE_PANELS.outlineSide,
    collectionsSide: isPanelSide(record.collectionsSide) ? record.collectionsSide : DEFAULT_SIDE_PANELS.collectionsSide,
    collectionsOpen: typeof record.collectionsOpen === 'boolean'
      ? record.collectionsOpen
      : DEFAULT_SIDE_PANELS.collectionsOpen,
    widths: {
      left: clampPanelWidth(Number(widths.left ?? DEFAULT_PANEL_WIDTH)),
      right: clampPanelWidth(Number(widths.right ?? DEFAULT_PANEL_WIDTH)),
    },
    stacks: {
      left: clampPanelStack(Number(stacks.left ?? 50)),
      right: clampPanelStack(Number(stacks.right ?? 50)),
    },
  }
}

function isPanelSide(value: unknown): value is PanelSide {
  return value === 'left' || value === 'right'
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}
