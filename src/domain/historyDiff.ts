export type DiffLineType = 'ctx' | 'add' | 'del'

export type DiffLine = {
  type: DiffLineType
  text: string
  oldNo?: number
  newNo?: number
}

export type DiffHunk = {
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export type DiffOp = {
  type: DiffLineType
  text: string
}

export type DiffBlock =
  | { kind: 'mod'; oldLine: DiffLine; newLine: DiffLine; ops: DiffOp[]; addChars: number; delChars: number }
  | { kind: 'add'; newLine: DiffLine; addChars: number }
  | { kind: 'del'; oldLine: DiffLine; delChars: number }
  | { kind: 'gap'; lines: number; texts: string[] }

export type DiffSummary = {
  modified: number
  added: number
  removed: number
  addChars: number
  delChars: number
}

export type LineLocation = {
  section: string | null
  paragraph: number
}

export type DiffWindow = {
  from: number
  to: number
  headCut: number
  tailCut: number
}

export const WINDOW_CONTEXT_CHARS = 30
export const WINDOW_TOTAL_LIMIT = 160
const MAX_DIFF_CELLS = 4_000_000
const PAIR_THRESHOLD = 0.3

export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0

  for (const raw of text.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (!match) {
        current = null
        continue
      }
      current = { oldStart: Number(match[1]), newStart: Number(match[2]), lines: [] }
      oldNo = current.oldStart
      newNo = current.newStart
      hunks.push(current)
      continue
    }
    if (!current || raw === '') {
      continue
    }
    if (raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('--- ')
      || raw.startsWith('+++ ') || raw.startsWith('\\') || raw.startsWith('Binary files ')) {
      continue
    }
    const marker = raw[0]
    const content = raw.slice(1)
    if (marker === '+') {
      current.lines.push({ type: 'add', text: content, newNo: newNo++ })
    } else if (marker === '-') {
      current.lines.push({ type: 'del', text: content, oldNo: oldNo++ })
    } else if (marker === ' ') {
      current.lines.push({ type: 'ctx', text: content, oldNo: oldNo++, newNo: newNo++ })
    }
  }

  return hunks
}

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  let word = ''
  for (const character of Array.from(text)) {
    if (/[A-Za-z0-9_]/.test(character)) {
      word += character
      continue
    }
    if (word) {
      tokens.push(word)
      word = ''
    }
    tokens.push(character)
  }
  if (word) {
    tokens.push(word)
  }
  return tokens
}

export function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) {
    return [{ type: n ? 'del' : 'add', text: (n ? a : b).join('') }]
  }
  if (n * m > MAX_DIFF_CELLS) {
    return [
      { type: 'del', text: a.join('') },
      { type: 'add', text: b.join('') },
    ]
  }

  const width = m + 1
  const table = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }

  const ops: DiffOp[] = []
  const push = (type: DiffLineType, text: string) => {
    const last = ops[ops.length - 1]
    if (last && last.type === type) {
      last.text += text
      return
    }
    ops.push({ type, text })
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('ctx', a[i])
      i += 1
      j += 1
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push('del', a[i])
      i += 1
    } else {
      push('add', b[j])
      j += 1
    }
  }
  while (i < n) {
    push('del', a[i])
    i += 1
  }
  while (j < m) {
    push('add', b[j])
    j += 1
  }
  return ops
}

export function diffText(before: string, after: string): DiffOp[] {
  return diffTokens(tokenize(before), tokenize(after))
}

function charLength(text: string): number {
  return Array.from(text).length
}

export function changedChars(ops: DiffOp[], type: DiffLineType): number {
  return ops.reduce((sum, op) => (op.type === type ? sum + charLength(op.text) : sum), 0)
}

function bigrams(text: string): Set<string> {
  const chars = Array.from(text.replace(/\s+/g, ''))
  const grams = new Set<string>()
  if (chars.length === 1) {
    grams.add(chars[0])
  }
  for (let i = 0; i < chars.length - 1; i += 1) {
    grams.add(chars[i] + chars[i + 1])
  }
  return grams
}

export function lineSimilarity(before: string, after: string): number {
  if (before === after) {
    return 1
  }
  const left = bigrams(before)
  const right = bigrams(after)
  if (left.size === 0 || right.size === 0) {
    return 0
  }
  let shared = 0
  for (const gram of left) {
    if (right.has(gram)) {
      shared += 1
    }
  }
  return shared / (left.size + right.size - shared)
}

type Pairing = {
  pairs: Array<[DiffLine, DiffLine]>
  restDels: DiffLine[]
  restAdds: DiffLine[]
}

function pairLines(dels: DiffLine[], adds: DiffLine[]): Pairing {
  const pairs: Array<[DiffLine, DiffLine]> = []
  const usedDels = new Set<number>()
  const usedAdds = new Set<number>()

  const candidates: Array<{ del: number; add: number; score: number }> = []
  dels.forEach((del, delIndex) => {
    adds.forEach((add, addIndex) => {
      candidates.push({ del: delIndex, add: addIndex, score: lineSimilarity(del.text, add.text) })
    })
  })
  candidates.sort((a, b) => b.score - a.score || a.del - b.del || a.add - b.add)

  for (const candidate of candidates) {
    if (candidate.score < PAIR_THRESHOLD) {
      break
    }
    if (usedDels.has(candidate.del) || usedAdds.has(candidate.add)) {
      continue
    }
    usedDels.add(candidate.del)
    usedAdds.add(candidate.add)
    pairs.push([dels[candidate.del], adds[candidate.add]])
  }

  const restDels = dels.filter((_, index) => !usedDels.has(index))
  const restAdds = adds.filter((_, index) => !usedAdds.has(index))
  if (restDels.length === 1 && restAdds.length === 1) {
    pairs.push([restDels[0], restAdds[0]])
    restDels.length = 0
    restAdds.length = 0
  }

  pairs.sort((a, b) => (a[0].oldNo ?? 0) - (b[0].oldNo ?? 0))
  return { pairs, restDels, restAdds }
}

export function buildDiffBlocks(hunks: DiffHunk[]): DiffBlock[] {
  const blocks: DiffBlock[] = []

  for (const hunk of hunks) {
    let index = 0
    let hasChange = false
    let gapLines = 0
    let gapTexts: string[] = []

    while (index < hunk.lines.length) {
      if (hunk.lines[index].type === 'ctx') {
        if (hasChange) {
          gapLines += 1
          gapTexts.push(hunk.lines[index].text)
        }
        index += 1
        continue
      }

      if (gapLines > 0) {
        blocks.push({ kind: 'gap', lines: gapLines, texts: gapTexts })
        gapLines = 0
        gapTexts = []
      }

      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (index < hunk.lines.length && hunk.lines[index].type !== 'ctx') {
        if (hunk.lines[index].type === 'del') {
          dels.push(hunk.lines[index])
        } else {
          adds.push(hunk.lines[index])
        }
        index += 1
      }

      const realDels = dels.filter((line) => line.text.trim() !== '')
      const realAdds = adds.filter((line) => line.text.trim() !== '')
      const pairing = pairLines(realDels, realAdds)

      for (const [delLine, addLine] of pairing.pairs) {
        const ops = diffText(delLine.text, addLine.text)
        blocks.push({
          kind: 'mod',
          oldLine: delLine,
          newLine: addLine,
          ops,
          addChars: changedChars(ops, 'add'),
          delChars: changedChars(ops, 'del'),
        })
      }
      for (const delLine of pairing.restDels) {
        blocks.push({ kind: 'del', oldLine: delLine, delChars: charLength(delLine.text) })
      }
      for (const addLine of pairing.restAdds) {
        blocks.push({ kind: 'add', newLine: addLine, addChars: charLength(addLine.text) })
      }
      hasChange = true
    }
  }

  return blocks
}

export function summarizeBlocks(blocks: DiffBlock[]): DiffSummary {
  const summary: DiffSummary = { modified: 0, added: 0, removed: 0, addChars: 0, delChars: 0 }
  for (const block of blocks) {
    if (block.kind === 'mod') {
      summary.modified += 1
      summary.addChars += block.addChars
      summary.delChars += block.delChars
    } else if (block.kind === 'add') {
      summary.added += 1
      summary.addChars += block.addChars
    } else if (block.kind === 'del') {
      summary.removed += 1
      summary.delChars += block.delChars
    }
  }
  return summary
}

export function buildLineLocations(text: string): LineLocation[] {
  const locations: LineLocation[] = []
  let section: string | null = null
  let paragraph = 0

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (/^#{1,6}\s/.test(line)) {
      if (/^#{2,6}\s/.test(line)) {
        section = line.replace(/^#{2,6}\s+/, '')
        paragraph = 0
      }
    } else if (line && line !== '---' && !/^[-|>]\s*$/.test(line) && !/^\|?[\s:|-]+\|?$/.test(line)) {
      paragraph += 1
    }
    locations.push({ section, paragraph })
  }

  return locations
}

export function locateLine(locations: LineLocation[], lineNo?: number): LineLocation {
  if (!lineNo || lineNo < 1 || lineNo > locations.length) {
    return { section: null, paragraph: 0 }
  }
  return locations[lineNo - 1]
}

export function windowDiffOps(ops: DiffOp[], context = WINDOW_CONTEXT_CHARS): DiffWindow {
  const lengths = ops.map((op) => charLength(op.text))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  if (total <= WINDOW_TOTAL_LIMIT) {
    return { from: 0, to: ops.length, headCut: 0, tailCut: 0 }
  }

  const firstChanged = ops.findIndex((op) => op.type !== 'ctx')
  const lastChanged = ops.length - 1 - [...ops].reverse().findIndex((op) => op.type !== 'ctx')
  if (firstChanged < 0) {
    return { from: 0, to: ops.length, headCut: 0, tailCut: 0 }
  }

  let from = firstChanged
  let budget = context
  while (from > 0 && budget > 0) {
    budget -= lengths[from - 1]
    from -= 1
  }

  let to = lastChanged
  let tailBudget = context
  while (to < ops.length - 1 && tailBudget > 0) {
    tailBudget -= lengths[to + 1]
    to += 1
  }

  return {
    from,
    to: to + 1,
    headCut: budget < 0 ? -budget : 0,
    tailCut: tailBudget < 0 ? -tailBudget : 0,
  }
}
