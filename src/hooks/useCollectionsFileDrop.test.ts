import { describe, expect, it } from 'vitest'
import { isPointInside, markdownPaths } from './useCollectionsFileDrop'

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
  it('keeps only markdown files', () => {
    expect(markdownPaths([
      'D:\\novel\\a.md',
      'D:\\novel\\b.MARKDOWN',
      'D:\\novel\\c.txt',
      'D:\\novel\\d',
      'D:\\novel\\e.mdown',
    ])).toEqual(['D:\\novel\\a.md', 'D:\\novel\\b.MARKDOWN', 'D:\\novel\\e.mdown'])
  })
})
