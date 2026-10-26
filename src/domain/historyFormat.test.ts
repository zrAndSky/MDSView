import { describe, expect, it } from 'vitest'
import { classifyDiffLine, fileBaseName, formatHistoryBytes, formatHistoryTime } from './historyFormat'

describe('historyFormat', () => {
  it('formats snapshot times in local time', () => {
    const epoch = new Date(2026, 9, 26, 9, 5).getTime() / 1000

    expect(formatHistoryTime(epoch)).toBe('2026-10-26 09:05')
    expect(formatHistoryTime(Number.NaN)).toBe('')
  })

  it('formats storage sizes', () => {
    expect(formatHistoryBytes(0)).toBe('0 KB')
    expect(formatHistoryBytes(512)).toBe('512 B')
    expect(formatHistoryBytes(2048)).toBe('2.0 KB')
    expect(formatHistoryBytes(15 * 1024 * 1024)).toBe('15 MB')
  })

  it('classifies diff lines', () => {
    expect(classifyDiffLine('@@ -1 +1 @@')).toBe('meta')
    expect(classifyDiffLine('--- a.md')).toBe('meta')
    expect(classifyDiffLine('+++ b.md')).toBe('meta')
    expect(classifyDiffLine('+added')).toBe('add')
    expect(classifyDiffLine('-removed')).toBe('remove')
    expect(classifyDiffLine(' context')).toBe('context')
  })

  it('extracts the file name from either slash style', () => {
    expect(fileBaseName('D:\\novel\\chapter.md')).toBe('chapter.md')
    expect(fileBaseName('/home/me/chapter.md')).toBe('chapter.md')
    expect(fileBaseName(null)).toBe('')
  })
})
