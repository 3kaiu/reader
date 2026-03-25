export function scrollReaderToTop(behavior: ScrollBehavior = 'smooth'): void {
  window.scrollTo({ top: 0, behavior })
}

export function restoreReaderRefreshPosition(scrollRatio: number): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const newScrollHeight =
        document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({
        top: scrollRatio * newScrollHeight,
        behavior: 'auto',
      })
    })
  })
}

export function scrollReaderToChapterMarker(index: number): boolean {
  const chapterMarker = document.querySelector(
    `[data-chapter-index='${index}']`,
  )

  if (!(chapterMarker instanceof HTMLElement)) {
    return false
  }

  chapterMarker.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })

  return true
}
