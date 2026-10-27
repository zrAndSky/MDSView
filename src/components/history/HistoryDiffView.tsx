import { useMemo, useState, type ReactNode } from 'react'
import {
  buildDiffBlocks,
  buildLineLocations,
  locateLine,
  parseUnifiedDiff,
  summarizeBlocks,
  windowDiffOps,
  type DiffBlock,
  type DiffLine,
  type DiffOp,
  type LineLocation,
} from '../../domain/historyDiff'
import type { Translation } from '../../i18n'
import type { GitHistoryDiff } from '../../platform/gitHistory'

type HistoryDiffViewProps = {
  diff: GitHistoryDiff
  time: string
  mode: 'previous' | 'current'
  t: Translation
}

function OpsText({ ops, side, t }: { ops: DiffOp[]; side: 'old' | 'new'; t: Translation }) {
  const [expanded, setExpanded] = useState(false)
  const win = expanded ? { from: 0, to: ops.length, headCut: 0, tailCut: 0 } : windowDiffOps(ops)
  const nodes: ReactNode[] = []

  if (win.from > 0 || win.headCut > 0) {
    nodes.push(
      <button key="head" type="button" className="history-diff-ellipsis" aria-label={t.historyShowFullLine} title={t.historyShowFullLine} onClick={() => setExpanded(true)}>
        …
      </button>,
    )
  }

  for (let index = win.from; index < win.to; index += 1) {
    const op = ops[index]
    if (side === 'old' && op.type === 'add') {
      continue
    }
    if (side === 'new' && op.type === 'del') {
      continue
    }
    let text = op.text
    if (index === win.from && win.headCut > 0) {
      text = Array.from(text).slice(win.headCut).join('')
    }
    if (index === win.to - 1 && win.tailCut > 0) {
      const chars = Array.from(text)
      text = chars.slice(0, Math.max(0, chars.length - win.tailCut)).join('')
    }
    if (!text) {
      continue
    }
    const highlighted = (side === 'old' && op.type === 'del') || (side === 'new' && op.type === 'add')
    nodes.push(highlighted
      ? <mark key={index} className={side === 'old' ? 'diff-removed' : 'diff-inserted'}>{text}</mark>
      : <span key={index}>{text}</span>)
  }

  if (win.to < ops.length || win.tailCut > 0) {
    nodes.push(
      <button key="tail" type="button" className="history-diff-ellipsis" aria-label={t.historyShowFullLine} title={t.historyShowFullLine} onClick={() => setExpanded(true)}>
        …
      </button>,
    )
  }

  return <>{nodes}</>
}

type DiffCardBlock = Exclude<DiffBlock, { kind: 'gap' }>

function lineLocation(block: DiffCardBlock, oldLocations: LineLocation[], newLocations: LineLocation[]): LineLocation {
  if (block.kind === 'del') {
    return locateLine(oldLocations, block.oldLine.oldNo)
  }
  return locateLine(newLocations, block.newLine.newNo)
}

function singleLineOps(line: DiffLine): DiffOp[] {
  return [{ type: line.type, text: line.text }]
}

function DiffCard({ block, oldLocations, newLocations, t }: {
  block: DiffCardBlock
  oldLocations: LineLocation[]
  newLocations: LineLocation[]
  t: Translation
}) {
  const location = lineLocation(block, oldLocations, newLocations)
  const kindLabel = block.kind === 'mod'
    ? t.historyDiffModified
    : block.kind === 'add' ? t.historyDiffAdded : t.historyDiffDeleted
  const stat = block.kind === 'mod'
    ? t.historyDiffChangedChars(block.addChars, block.delChars)
    : block.kind === 'add'
      ? t.historyDiffAddedChars(block.addChars)
      : t.historyDiffRemovedChars(block.delChars)

  return (
    <article className={`history-diff-card ${block.kind}`}>
      <header>
        <span className={`history-diff-kind ${block.kind}`}>{kindLabel}</span>
        <span className="history-diff-where">
          <strong>{location.section ?? t.historyDocStart}</strong>
          {location.paragraph > 0 ? <span> · {t.historyParagraph(location.paragraph)}</span> : null}
        </span>
        <span className="history-diff-stat">{stat}</span>
      </header>
      {block.kind === 'mod' ? (
        <>
          <div className="history-diff-line old">
            <span className="history-diff-tag">{t.historyDiffBefore}</span>
            <p><OpsText ops={block.ops} side="old" t={t} /></p>
          </div>
          <div className="history-diff-line new">
            <span className="history-diff-tag">{t.historyDiffAfter}</span>
            <p><OpsText ops={block.ops} side="new" t={t} /></p>
          </div>
        </>
      ) : block.kind === 'del' ? (
        <div className="history-diff-line old">
          <span className="history-diff-tag">{t.historyDiffDeleted}</span>
          <p><OpsText ops={singleLineOps(block.oldLine)} side="old" t={t} /></p>
        </div>
      ) : (
        <div className="history-diff-line new">
          <span className="history-diff-tag">{t.historyDiffAdded}</span>
          <p><OpsText ops={singleLineOps(block.newLine)} side="new" t={t} /></p>
        </div>
      )}
    </article>
  )
}

export function HistoryDiffView({ diff, time, mode, t }: HistoryDiffViewProps) {
  const blocks = useMemo(() => buildDiffBlocks(parseUnifiedDiff(diff.diff)), [diff.diff])
  const summary = useMemo(() => summarizeBlocks(blocks), [blocks])
  const oldLocations = useMemo(() => buildLineLocations(diff.oldText), [diff.oldText])
  const newLocations = useMemo(() => buildLineLocations(diff.newText), [diff.newText])

  if (blocks.length === 0) {
    return <p className="history-hint">{t.historyNoDiff}</p>
  }

  return (
    <div className="history-diff-view">
      <div className="history-diff-summary">
        <span className="history-diff-when">
          {mode === 'current' ? t.historyDiffComparedCurrent(time) : t.historyDiffComparedPrevious(time)}
        </span>
        {summary.modified > 0 ? <span className="history-diff-chip modified">{t.historyDiffModified} {summary.modified}</span> : null}
        {summary.added > 0 ? <span className="history-diff-chip added">{t.historyDiffAdded} {summary.added}</span> : null}
        {summary.removed > 0 ? <span className="history-diff-chip removed">{t.historyDiffDeleted} {summary.removed}</span> : null}
        {summary.addChars + summary.delChars > 0
          ? <span className="history-diff-chip">{t.historyDiffChangedChars(summary.addChars, summary.delChars)}</span>
          : null}
      </div>
      <div className="history-diff-blocks">
        {blocks.map((block, index) => block.kind === 'gap' ? (
          <details className="history-diff-gap" key={`gap-${index}`}>
            <summary>{t.historyUnchangedLines(block.lines)}</summary>
            <div className="history-diff-gap-body">
              {block.texts.map((text, textIndex) => <div key={textIndex}>{text || '\u00a0'}</div>)}
            </div>
          </details>
        ) : (
          <DiffCard
            key={`${block.kind}-${index}`}
            block={block}
            oldLocations={oldLocations}
            newLocations={newLocations}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
