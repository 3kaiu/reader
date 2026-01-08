/**
 * Reader 相关常量
 */

// 检测问题内容的关键词模式
export const ERROR_PATTERNS = [
  '访问次数已达上限',
  '免登录访问次数',
  '请登录后',
  '正在加载中',
  '内容加载失败',
  '请刷新重试',
  '防盗章节',
  '本章节是锁章',
  '购买VIP',
  '充值阅读',
  '订阅后查看',
  '本章未购买',
  '请先订阅',
  '付费章节',
  '正版订阅',
]

// 格式化错误信息，将技术性错误转换为用户友好提示
export const ERROR_MESSAGE_MAP: Record<string, string> = {
  'TocEmptyException': '目录加载失败，该书源可能已失效，请换源',
  '目录为空': '目录加载失败，请尝试换一个书源',
  'SourceException': '书源解析失败，请换一个书源',
  'ContentEmptyException': '章节内容为空，请换源重试',
  'NetworkException': '网络连接失败，请检查网络后重试',
  'TimeoutException': '请求超时，请稍后重试',
  'ConcurrentException': '请求过于频繁，请稍后重试',
  'NullPointerException': '数据解析失败，请换一个书源',
  'SSLException': '安全连接失败，请换一个书源',
  'UnknownHostException': '无法连接书源服务器，请换源',
}

// 章节预加载配置（根据网络类型）
export const PRELOAD_CONFIG: Record<string, number> = {
  '4g': 8,      // 快速网络多预加载
  '3g': 3,      // 中等网络适当预加载
  '2g': 1,      // 慢速网络最少预加载
  'slow-2g': 1,
  default: 5,
}

// 最小有效内容长度
export const MIN_CONTENT_LENGTH = 200

// 快捷键列表
export const KEYBOARD_SHORTCUTS = [
  { key: '←/↑', desc: '上一页/章' },
  { key: '→/↓/空格', desc: '下一页/章' },
  { key: 'F', desc: '全屏' },
  { key: 'C', desc: '目录' },
  { key: 'S', desc: '设置' },
  { key: 'D', desc: '日/夜模式' },
  { key: 'Z', desc: '禅模式' },
  { key: 'A', desc: 'AI 助手' },
  { key: 'I', desc: '人物洞察' },
  { key: 'Esc', desc: '返回/关闭' },
  { key: '?/H', desc: '快捷键帮助' },
]

// 情绪氛围颜色配置
export const MOOD_COLORS: Record<string, { color: string, alpha: number }> = {
  'ACTION': { color: '239, 68, 68', alpha: 0.05 },
  'CALM': { color: '34, 197, 94', alpha: 0.03 },
  'TENSION': { color: '245, 158, 11', alpha: 0.04 },
  'SAD': { color: '59, 130, 246', alpha: 0.04 },
}
