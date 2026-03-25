type DecoderCardPosition = { x: number; y: number }

export function resolveDecoderCardPosition(event: MouseEvent): DecoderCardPosition {
  const target =
    event.target instanceof HTMLElement ? event.target : document.body
  const rect = target.getBoundingClientRect()
  const position = {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
  }

  const cardWidth = 288
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  if (position.x - cardWidth / 2 < 16) {
    position.x = cardWidth / 2 + 16
  } else if (position.x + cardWidth / 2 > screenWidth - 16) {
    position.x = screenWidth - cardWidth / 2 - 16
  }

  if (position.y + 300 > screenHeight) {
    position.y = rect.top - 8
  }

  return position
}

export function hasDecodableReaderContent(options: {
  bookUrl: string
  content?: string
}) {
  return Boolean(options.bookUrl && options.content)
}
