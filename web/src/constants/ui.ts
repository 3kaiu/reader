/**
 * UI 相关常量
 */

// 虚拟滚动阈值（书籍数量超过此值时启用虚拟滚动）
export const VIRTUAL_SCROLL_THRESHOLD = 20

// 虚拟滚动预渲染行数
export const VIRTUAL_SCROLL_OVERSCAN = 2

// 图片懒加载提前距离
export const LAZY_IMAGE_ROOT_MARGIN = '100px'

// 每行最大列数（响应式断点）
export const GRID_COLS_XL = 6 // >= 1280px
export const GRID_COLS_LG = 5 // >= 1024px
export const GRID_COLS_MD = 4 // >= 768px
export const GRID_COLS_SM = 3 // < 768px

// 估算的行高（根据列数）
export const ESTIMATED_ROW_HEIGHT_SM = 280 // 3列
export const ESTIMATED_ROW_HEIGHT_MD = 260 // 4列
export const ESTIMATED_ROW_HEIGHT_LG = 240 // 5-6列
