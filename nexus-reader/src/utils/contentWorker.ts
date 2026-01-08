/**
 * Content Parser Worker
 * 处理大文本分段、正则清洗、HTML 转换等耗时操作
 */

self.onmessage = (e: MessageEvent) => {
    const { text, type } = e.data

    if (type === 'format') {
        const formatted = formatContent(text)
        self.postMessage({ type: 'formatted', result: formatted })
    }
}

function formatContent(text: string): string {
    if (!text) return ''

    // 核心处理逻辑
    return text
        .split('\n')
        .filter((p: string) => p.trim())
        .map((p: string) => {
            const trimmed = p.trim()
            // 可以在这里添加更复杂的清洗逻辑，如移除广告关键词
            return `<p class="content-paragraph">${trimmed}</p>`
        })
        .join('')
}
