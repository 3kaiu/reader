/**
 * 阅读器内容格式化工具
 */

/**
 * 将纯文本转换为带样式的 HTML 段落
 * @param text 章节源码
 * @param paragraphSpacing 段落间距 (em)
 * @returns 格式化后的内容
 */
export function formatContent(text: string, paragraphSpacing: number = 1.2): string {
    if (!text) return ''
    return text
        .split('\n')
        .filter((p: string) => p.trim())
        .map((p: string) => `<p class="content-paragraph" style="margin-bottom: ${paragraphSpacing}em">${p.trim()}</p>`)
        .join('')
}
