const markdownExtensions = new Set(['md', 'markdown', 'mdown', 'mkdn'])
const plainTextExtensions = new Set(['txt'])

function getExtension(path: string): string | undefined {
  const extension = path.split('.').at(-1)?.toLowerCase()
  return extension !== undefined && extension !== path.toLowerCase() ? extension : undefined
}

/**
 * Any document MDSView can open and edit: Markdown sources and plain text.
 * Kept under the historical name so existing call sites stay unchanged.
 */
export function isMarkdownPath(path: string): boolean {
  const extension = getExtension(path)
  return extension !== undefined && (markdownExtensions.has(extension) || plainTextExtensions.has(extension))
}

/** Plain-text documents render verbatim instead of being parsed as Markdown. */
export function isPlainTextPath(path: string | null | undefined): boolean {
  if (!path) {
    return false
  }

  const extension = getExtension(path)
  return extension !== undefined && plainTextExtensions.has(extension)
}

export function ensureMarkdownExtension(path: string): string {
  return isMarkdownPath(path) ? path : `${path}.md`
}
