import { describe, expect, it } from 'vitest'
import {
  buildDiffBlocks,
  buildLineLocations,
  diffText,
  locateLine,
  parseUnifiedDiff,
  summarizeBlocks,
  windowDiffOps,
} from './historyDiff'

const SAMPLE = [
  'diff --git a/note.md b/note.md',
  'index 111..222 100644',
  '--- a/note.md',
  '+++ b/note.md',
  '@@ -10,5 +10,6 @@ ## 二、核心命题',
  ' 能改的是**事**，改不动的是**势**。',
  '-| 2 | **那他到底改了什么？** | **速度** |',
  '+| 2 | **那他到底改了什么？** | **速度**，而且更急 |',
  '+> 新增的一行备注。',
  ' ',
  ' 收尾。',
  '@@ -30,3 +31,2 @@ ## 三、接下来',
  ' 上下文',
  '-删掉的一整行内容，长度足够。',
  ' 结尾上下文',
].join('\n')

describe('parseUnifiedDiff', () => {
  it('splits hunks and numbers both sides', () => {
    const hunks = parseUnifiedDiff(SAMPLE)
    expect(hunks).toHaveLength(2)
    expect(hunks[0].lines[0]).toEqual({ type: 'ctx', text: '能改的是**事**，改不动的是**势**。', oldNo: 10, newNo: 10 })
    const removed = hunks[0].lines.find((line) => line.type === 'del')
    const added = hunks[0].lines.filter((line) => line.type === 'add')
    expect(removed?.oldNo).toBe(11)
    expect(added.map((line) => line.newNo)).toEqual([11, 12])
    expect(hunks[1].lines[1]).toMatchObject({ type: 'del', oldNo: 31 })
  })

  it('ignores headers and empty diff text', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('just text\nno hunks')).toEqual([])
  })
})

describe('diffText', () => {
  it('only marks the characters that changed', () => {
    const before = '能改的是事，改不动的是势'
    const after = '能改的是事，推不动的却是势'
    const ops = diffText(before, after)
    const removed = ops.filter((op) => op.type !== 'add').map((op) => op.text).join('')
    const added = ops.filter((op) => op.type !== 'del').map((op) => op.text).join('')
    expect(removed).toBe(before)
    expect(added).toBe(after)
    expect(ops.filter((op) => op.type === 'del').map((op) => op.text).join('')).toBe('改')
    expect(ops[0]).toEqual({ type: 'ctx', text: '能改的是事，' })
  })

  it('keeps latin words together', () => {
    const ops = diffText('open main.tsx now', 'open App.tsx now')
    const removed = ops.filter((op) => op.type === 'del').map((op) => op.text).join('')
    expect(removed).toBe('main')
    expect(ops.some((op) => op.type === 'add' && op.text === 'App')).toBe(true)
  })

  it('falls back to whole-line replacement for huge pairs', () => {
    const before = '甲'.repeat(2100)
    const after = '乙'.repeat(2100)
    const ops = diffText(before, after)
    expect(ops).toHaveLength(2)
  })
})

describe('buildDiffBlocks', () => {
  it('pairs modified lines, keeps insertions, and skips blank noise', () => {
    const blocks = buildDiffBlocks(parseUnifiedDiff(SAMPLE))
    const kinds = blocks.map((block) => block.kind)
    expect(kinds).toEqual(['mod', 'add', 'del'])

    const mod = blocks[0]
    expect(mod.kind).toBe('mod')
    if (mod.kind === 'mod') {
      expect(mod.addChars).toBeGreaterThan(0)
      expect(mod.ops.some((op) => op.type === 'add' && op.text.includes('更急'))).toBe(true)
    }

    const insertion = blocks[1]
    expect(insertion).toMatchObject({ kind: 'add', addChars: 10 })

  })

  it('collapses unchanged context between two changes', () => {
    const diff = [
      '@@ -1,5 +1,5 @@',
      ' 开头',
      '-中间一行旧的',
      '+中间一行新的',
      ' 中间未改的一行',
      '-结尾一行旧的',
      '+结尾一行新的',
      ' 末尾',
    ].join('\n')
    const blocks = buildDiffBlocks(parseUnifiedDiff(diff))
    expect(blocks.map((block) => block.kind)).toEqual(['mod', 'gap', 'mod'])
    const gap = blocks[1]
    expect(gap).toMatchObject({ kind: 'gap', lines: 1, texts: ['中间未改的一行'] })
  })

  it('pairs an insertion before an edit with the right neighbour', () => {
    const diff = [
      '@@ -1,2 +1,3 @@',
      '-第一段原文内容',
      '-第二段原文内容',
      '+突然插入的一整段',
      '+第一段原文内容修改',
      '+第二段原文内容修改',
    ].join('\n')
    const blocks = buildDiffBlocks(parseUnifiedDiff(diff))
    expect(blocks.map((block) => block.kind)).toEqual(['mod', 'mod', 'add'])
    const added = blocks[2]
    if (added.kind === 'add') {
      expect(added.newLine.text).toBe('突然插入的一整段')
    }
    const lastMod = blocks[1]
    if (lastMod.kind === 'mod') {
      expect(lastMod.oldLine.text).toBe('第二段原文内容')
      expect(lastMod.newLine.text).toBe('第二段原文内容修改')
    }
  })

  it('treats a lone deletion as removed', () => {
    const diff = ['@@ -1,2 +1,1 @@', ' 保留', '-只有这一行被删掉'].join('\n')
    const blocks = buildDiffBlocks(parseUnifiedDiff(diff))
    expect(blocks).toEqual([
      { kind: 'del', oldLine: { type: 'del', text: '只有这一行被删掉', oldNo: 2 }, delChars: 8 },
    ])
  })
})

describe('summarizeBlocks', () => {
  it('counts each block type and characters', () => {
    const summary = summarizeBlocks(buildDiffBlocks(parseUnifiedDiff(SAMPLE)))
    expect(summary.modified).toBe(1)
    expect(summary.added).toBe(1)
    expect(summary.removed).toBe(1)
    expect(summary.addChars).toBeGreaterThan(0)
    expect(summary.delChars).toBeGreaterThan(0)
  })
})

describe('line locations', () => {
  const text = [
    '# 总纲',
    '',
    '文首说明。',
    '',
    '## 二、核心命题',
    '',
    '第一段。',
    '',
    '第二段。',
    '',
    '| 表格行 |',
    '|---|',
    '| 内容 |',
  ].join('\n')

  it('reports section and paragraph for each line', () => {
    const locations = buildLineLocations(text)
    expect(locateLine(locations, 3)).toEqual({ section: null, paragraph: 1 })
    expect(locateLine(locations, 7)).toEqual({ section: '二、核心命题', paragraph: 1 })
    expect(locateLine(locations, 9)).toEqual({ section: '二、核心命题', paragraph: 2 })
  })

  it('degrades gracefully for unknown line numbers', () => {
    const locations = buildLineLocations(text)
    expect(locateLine(locations)).toEqual({ section: null, paragraph: 0 })
    expect(locateLine(locations, 999)).toEqual({ section: null, paragraph: 0 })
  })
})

describe('windowDiffOps', () => {
  it('keeps short paragraphs intact', () => {
    const ops = diffText('短句一', '短句二')
    expect(windowDiffOps(ops)).toEqual({ from: 0, to: ops.length, headCut: 0, tailCut: 0 })
  })

  it('trims long paragraphs to the change with a shared window', () => {
    const before = `${'甲'.repeat(100)}旧词${'乙'.repeat(100)}`
    const after = `${'甲'.repeat(100)}新词${'乙'.repeat(100)}`
    const ops = diffText(before, after)
    const window = windowDiffOps(ops, 30)
    expect(window.from).toBe(0)
    expect(window.to).toBe(ops.length)
    expect(window.headCut).toBeGreaterThan(60)
    expect(window.tailCut).toBeGreaterThan(60)
  })
})
