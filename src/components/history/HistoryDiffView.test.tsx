import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { translations } from '../../i18n'
import type { GitHistoryDiff } from '../../platform/gitHistory'
import { HistoryDiffView } from './HistoryDiffView'

const t = translations.zh

function buildDiff(): GitHistoryDiff {
  const oldText = [
    '# 总纲',
    '',
    '## 二、核心命题',
    '',
    '第一段。能改的是**事**，改不动的是**势**。',
    '',
    '第二段。',
    '',
    '| 2 | 速度 |',
  ].join('\n')
  const newText = [
    '# 总纲',
    '',
    '## 二、核心命题',
    '',
    '第一段。能改的是**事**，推不动的却是**势**。',
    '',
    '第二段。',
    '',
    '> 新增的备注。',
  ].join('\n')
  const diff = [
    'diff --git a/a.md b/a.md',
    'index 111..222 100644',
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -5,10 +5,11 @@',
    '-第一段。能改的是**事**，改不动的是**势**。',
    '+第一段。能改的是**事**，推不动的却是**势**。',
    ' 第二段。',
    '-| 2 | 速度 |',
    '+> 新增的备注。',
    '+> 再加一行。',
  ].join('\n')
  return { diff, oldText, newText }
}

describe('HistoryDiffView', () => {
  it('renders change cards with section, paragraph and char counts', () => {
    const { container } = render(<HistoryDiffView diff={buildDiff()} time="09:38" mode="previous" t={t} />)

    expect(screen.getByText('09:38 相比上一版')).toBeTruthy()
    expect(screen.getByText('改写 1')).toBeTruthy()
    expect(screen.getByText('新增 2')).toBeTruthy()
    expect(screen.getByText('删除 1')).toBeTruthy()
    const where = container.querySelector('.history-diff-where')?.textContent ?? ''
    expect(where).toContain('二、核心命题')
    expect(where).toContain('第 1 段')
    expect(screen.getAllByText('原来').length).toBe(1)
    expect(screen.getAllByText('现在').length).toBe(1)
    expect(screen.getAllByText('新增').length).toBe(4)
    expect(screen.getAllByText('删除').length).toBe(2)
    expect(screen.getAllByText(/\+\d+ −\d+ 字/).length).toBeGreaterThan(0)
  })

  it('highlights only the characters that changed', () => {
    const { container } = render(<HistoryDiffView diff={buildDiff()} time="09:38" mode="previous" t={t} />)
    const oldLine = container.querySelector('.history-diff-line.old p')
    const newLine = container.querySelector('.history-diff-line.new p')
    const removedText = [...(oldLine?.querySelectorAll('mark.diff-removed') ?? [])].map((node) => node.textContent).join('')
    const insertedText = [...(newLine?.querySelectorAll('mark.diff-inserted') ?? [])].map((node) => node.textContent).join('')
    expect(removedText).toBe('改')
    expect(insertedText).toBe('推却')
    expect(oldLine?.textContent).toContain('第一段。能改的是**事**，改不动的是**势**。')
  })

  it('switches the summary wording for the current-file mode', () => {
    render(<HistoryDiffView diff={buildDiff()} time="09:38" mode="current" t={t} />)
    expect(screen.getByText('09:38 相比当前文件')).toBeTruthy()
  })

  it('collapses unchanged context and expands it on demand', () => {
    const diff = [
      '@@ -1,5 +1,5 @@',
      ' 开头',
      '-旧的中间行',
      '+新的中间行',
      ' 未改动的一行',
      '-旧的结尾行',
      '+新的结尾行',
      ' 末尾',
    ].join('\n')
    render(<HistoryDiffView diff={{ diff, oldText: '', newText: '' }} time="09:38" mode="previous" t={t} />)

    const gap = screen.getByText('1 行未改动').closest('details')
    expect(gap).toBeTruthy()
    expect(gap?.hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByText('1 行未改动'))
    expect(gap?.hasAttribute('open')).toBe(true)
    expect(within(gap as HTMLElement).getByText('未改动的一行')).toBeTruthy()
  })

  it('trims very long paragraphs and expands them', () => {
    const before = `${'甲'.repeat(120)}旧词${'乙'.repeat(120)}`
    const after = `${'甲'.repeat(120)}新词${'乙'.repeat(120)}`
    const diff = [
      '@@ -1,1 +1,1 @@',
      `-${before}`,
      `+${after}`,
    ].join('\n')
    const { container } = render(<HistoryDiffView diff={{ diff, oldText: before, newText: after }} time="09:38" mode="previous" t={t} />)

    const oldLine = container.querySelector('.history-diff-line.old p') as HTMLElement
    expect(oldLine.querySelectorAll('.history-diff-ellipsis').length).toBe(2)
    expect(oldLine.textContent?.length).toBeLessThan(before.length)

    fireEvent.click(oldLine.querySelector('.history-diff-ellipsis') as HTMLElement)
    expect(oldLine.textContent).toContain(before)
    expect(oldLine.querySelectorAll('.history-diff-ellipsis').length).toBe(0)
  })

  it('shows the empty hint when the diff has no hunks', () => {
    render(<HistoryDiffView diff={{ diff: '', oldText: '', newText: '' }} time="09:38" mode="previous" t={t} />)
    expect(screen.getByText(t.historyNoDiff)).toBeTruthy()
  })
})
