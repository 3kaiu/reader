// 导出统一API模块
export * from './unified'

// 导出便捷的HTTP方法（从client.ts）
export { $get, $post, $put, $delete, $patch, type ApiResponse } from './client'
