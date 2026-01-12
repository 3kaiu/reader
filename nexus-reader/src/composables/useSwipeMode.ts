/**
 * 📖 Swipe Mode Composable
 * 从 reader.vue 提取的翻页模式逻辑
 */
import { ref, watch, nextTick } from 'vue'
import { useResizeObserver, useThrottleFn } from '@vueuse/core'

// 依赖接口
interface ReaderStoreLike {
    currentChapterIndex: number
    hasNextChapter: boolean
    hasPrevChapter: boolean
    nextChapter: () => Promise<void>
    prevChapter: () => Promise<void>
}

interface SettingsStoreLike {
    config: {
        readingMode: 'scroll' | 'swipe'
        pageWidth: number
    }
}

interface UseSwipeModeOptions {
    readerStore: ReaderStoreLike
    settingsStore: SettingsStoreLike
    toggleToolbar: () => void
    toast: { success: (msg: string) => void }
}

export function useSwipeMode(options: UseSwipeModeOptions) {
    const { readerStore, settingsStore, toggleToolbar, toast } = options

    // 状态
    const contentRef = ref<HTMLElement | null>(null)
    const page = ref(0)
    const totalPages = ref(1)
    const layout = ref({
        columnWidth: 0,
        columnGap: 0,
        padding: 0,
    })

    // 初始化/更新翻页模式
    async function init() {
        if (settingsStore.config.readingMode !== 'swipe') return

        await nextTick()
        if (!contentRef.value) return

        const el = contentRef.value
        const windowWidth = el.clientWidth

        // 计算布局
        const maxContentWidth = Math.min(
            settingsStore.config.pageWidth,
            windowWidth - 48
        )

        layout.value.columnWidth = maxContentWidth
        layout.value.columnGap = windowWidth - maxContentWidth
        layout.value.padding = (windowWidth - maxContentWidth) / 2

        await nextTick()

        // 计算总页数
        const total = Math.ceil(el.scrollWidth / el.clientWidth)
        totalPages.value = Math.max(1, total)

        // 确保页码不越界
        if (page.value >= totalPages.value) {
            page.value = Math.max(0, totalPages.value - 1)
        }
    }

    // 处理点击翻页
    function handleClick(e: MouseEvent) {
        if (settingsStore.config.readingMode === 'scroll') {
            toggleToolbar()
            return
        }

        const width = window.innerWidth
        const x = e.clientX

        // 中间区域切换工具栏
        if (x > width * 0.35 && x < width * 0.65) {
            toggleToolbar()
            return
        }

        // 左侧上一页，右侧下一页
        if (x <= width * 0.35) {
            prevPage()
        } else {
            nextPage()
        }
    }

    // 下一页
    async function nextPage() {
        if (page.value < totalPages.value - 1) {
            page.value++
        } else {
            if (readerStore.hasNextChapter) {
                await readerStore.nextChapter()
                page.value = 0
                setTimeout(init, 100)
            } else {
                toast.success('已读完最后一章')
            }
        }
    }

    // 上一页
    async function prevPage() {
        if (page.value > 0) {
            page.value--
        } else {
            if (readerStore.hasPrevChapter) {
                await readerStore.prevChapter()
                setTimeout(async () => {
                    await init()
                    page.value = Math.max(0, totalPages.value - 1)
                }, 100)
            } else {
                toast.success('已经是第一章')
            }
        }
    }

    // 监听模式切换和章节变化
    watch(
        [
            () => settingsStore.config.readingMode,
            () => readerStore.currentChapterIndex,
        ],
        () => {
            if (settingsStore.config.readingMode === 'swipe') {
                init()
            }
        }
    )

    // 监听窗口大小变化
    useResizeObserver(
        contentRef,
        useThrottleFn(() => {
            requestAnimationFrame(() => init())
        }, 200)
    )

    return {
        // Refs（需要绑定到模板）
        contentRef,

        // 状态
        page,
        totalPages,
        layout,

        // 方法
        init,
        handleClick,
        nextPage,
        prevPage,
    }
}

// 类型导出
export type UseSwipeModeReturn = ReturnType<typeof useSwipeMode>
