export type SwipeLayout = {
  columnWidth: number
  columnGap: number
  padding: number
}

export function stripHtmlForPagination(html: string): string {
  return html.replace(/<[^>]*>/g, '\n').replace(/\n{2,}/g, '\n')
}

export function estimateCharsPerPage(
  width: number,
  height: number,
  fontSize: number,
  lineHeight: number
): number {
  const safeWidth = Math.max(width - 48, 240)
  const safeHeight = Math.max(height - 96, 320)
  const charsPerLine = Math.max(12, Math.floor(safeWidth / (fontSize * 0.58)))
  const linesPerPage = Math.max(8, Math.floor(safeHeight / (fontSize * lineHeight)))
  return charsPerLine * linesPerPage
}

export function buildSwipeLayout(width: number): SwipeLayout {
  return {
    columnWidth: Math.max(width - 48, 240),
    columnGap: 0,
    padding: 24,
  }
}

export function getSwipeTotalPages(options: {
  content: string
  width: number
  height: number
  fontSize: number
  lineHeight: number
}): number {
  const text = stripHtmlForPagination(options.content)
  const charsPerPage = estimateCharsPerPage(
    options.width,
    options.height,
    options.fontSize,
    options.lineHeight
  )

  return Math.max(1, Math.ceil(text.length / Math.max(charsPerPage, 1)))
}
