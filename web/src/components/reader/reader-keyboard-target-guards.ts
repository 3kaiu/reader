export function isReaderKeyboardEditableTarget(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return false

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}
