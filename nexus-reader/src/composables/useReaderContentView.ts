export function useReaderContentView() {
  function handleContentClick(event: MouseEvent) {
    void event
  }

  function getHighlightedContent(content: string | undefined): string {
    return content || ''
  }

  return {
    handleContentClick,
    getHighlightedContent,
  }
}
