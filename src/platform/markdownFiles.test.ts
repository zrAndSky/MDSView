import { describe, expect, it } from 'vitest'
import { ensureMarkdownExtension, isMarkdownPath, isPlainTextPath } from './markdownFiles'

describe('markdown file helpers', () => {
  it('accepts common markdown extensions case-insensitively', () => {
    expect(isMarkdownPath('notes.md')).toBe(true)
    expect(isMarkdownPath('docs/guide.MARKDOWN')).toBe(true)
    expect(isMarkdownPath('image.png')).toBe(false)
  })

  it('accepts plain-text files as openable documents', () => {
    expect(isMarkdownPath('notes.txt')).toBe(true)
    expect(isMarkdownPath('C:\\Docs\\README.TXT')).toBe(true)
    expect(isMarkdownPath('archive.zip')).toBe(false)
  })

  it('flags plain text so the preview renders it verbatim', () => {
    expect(isPlainTextPath('notes.txt')).toBe(true)
    expect(isPlainTextPath('notes.TXT')).toBe(true)
    expect(isPlainTextPath('notes.md')).toBe(false)
    expect(isPlainTextPath(null)).toBe(false)
  })

  it('adds .md to save targets that do not already have a markdown extension', () => {
    expect(ensureMarkdownExtension('notes')).toBe('notes.md')
    expect(ensureMarkdownExtension('/tmp/readme.markdown')).toBe('/tmp/readme.markdown')
    expect(ensureMarkdownExtension('C:\\Docs\\draft.MD')).toBe('C:\\Docs\\draft.MD')
  })

  it('keeps an existing .txt extension when saving', () => {
    expect(ensureMarkdownExtension('C:\\Docs\\notes.txt')).toBe('C:\\Docs\\notes.txt')
  })
})
