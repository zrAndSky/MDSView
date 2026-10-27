import { describe, expect, it } from 'vitest'
import { fileBaseName, formatHistoryBytes, formatHistoryClock, formatHistoryTime } from './historyFormat'

describe('historyFormat', () => {
  it('formats snapshot times in local time', () => {
    const epoch = new Date(2026, 9, 26, 9, 5).getTime() / 1000

    expect(formatHistoryTime(epoch)).toBe('2026-10-26 09:05')
    expect(formatHistoryTime(Number.NaN)).toBe('')
  })

  it('formats the short clock used in the diff header', () => {
    const epoch = new Date(2026, 9, 26, 9, 5).getTime() / 1000

    expect(formatHistoryClock(epoch)).toBe('09:05')
    expect(formatHistoryClock(Number.NaN)).toBe('')
  })

  it('formats storage sizes', () => {
    expect(formatHistoryBytes(0)).toBe('0 KB')
    expect(formatHistoryBytes(512)).toBe('512 B')
    expect(formatHistoryBytes(2048)).toBe('2.0 KB')
    expect(formatHistoryBytes(15 * 1024 * 1024)).toBe('15 MB')
  })


  it('extracts the file name from either slash style', () => {
    expect(fileBaseName('D:\\novel\\chapter.md')).toBe('chapter.md')
    expect(fileBaseName('/home/me/chapter.md')).toBe('chapter.md')
    expect(fileBaseName(null)).toBe('')
  })
})
