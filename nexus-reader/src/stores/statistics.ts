/**
 * 📊 阅读统计 Store
 * 记录阅读时长、字数、书籍等统计数据
 */
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

// 日期格式化
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0] // "2026-01-05"
}

// 获取本周的日期范围
function getWeekRange(): { start: string; end: string } {
    const now = new Date()
    const day = now.getDay() || 7 // 周日为7
    const start = new Date(now)
    start.setDate(now.getDate() - day + 1)
    const end = new Date(now)
    end.setDate(now.getDate() + (7 - day))
    return {
        start: formatDate(start),
        end: formatDate(end)
    }
}

// 日记录
interface DailyRecord {
    date: string
    minutes: number
    words: number
    chapters: number
}

// 阅读投入度记录
interface EngagementRecord {
    chapterIndex: number
    chunkIndex: number
    seconds: number
}

// 书籍统计
interface BookStats {
    bookId: string
    bookName: string
    totalMinutes: number
    completedChapters: number
    lastReadDate: string
    engagement?: EngagementRecord[]
}

// 统计状态
interface StatisticsState {
    // 日历记录 (最近90天)
    dailyRecords: DailyRecord[]
    // 书籍统计
    bookStats: BookStats[]
    // 累计统计
    totalMinutes: number
    totalWords: number
    totalBooks: number
}

const defaultState: StatisticsState = {
    dailyRecords: [],
    bookStats: [],
    totalMinutes: 0,
    totalWords: 0,
    totalBooks: 0,
}

export const useStatisticsStore = defineStore('statistics', () => {
    // 持久化状态
    const state = useStorage<StatisticsState>('reading-statistics', defaultState)

    // 今日日期
    const today = formatDate(new Date())

    // 获取或创建今日记录
    function getTodayRecord(): DailyRecord {
        let record = state.value.dailyRecords.find(r => r.date === today)
        if (!record) {
            record = { date: today, minutes: 0, words: 0, chapters: 0 }
            state.value.dailyRecords.unshift(record)
            // 保留最近90天
            if (state.value.dailyRecords.length > 90) {
                state.value.dailyRecords = state.value.dailyRecords.slice(0, 90)
            }
        }
        return record
    }

    // 记录阅读时长 (分钟)
    function addReadingMinutes(minutes: number) {
        const record = getTodayRecord()
        record.minutes += minutes
        state.value.totalMinutes += minutes
    }

    // 记录阅读字数
    function addReadingWords(words: number) {
        const record = getTodayRecord()
        record.words += words
        state.value.totalWords += words
    }

    // 记录完成章节
    function addCompletedChapter(bookId: string, bookName: string) {
        const record = getTodayRecord()
        record.chapters += 1

        // 更新书籍统计
        let bookStat = state.value.bookStats.find(b => b.bookId === bookId)
        if (!bookStat) {
            bookStat = {
                bookId,
                bookName,
                totalMinutes: 0,
                completedChapters: 0,
                lastReadDate: today,
            }
            state.value.bookStats.push(bookStat)
            state.value.totalBooks += 1
        }
        bookStat.completedChapters += 1
        bookStat.lastReadDate = today
    }

    // 今日统计
    const todayStats = computed(() => {
        const record = state.value.dailyRecords.find(r => r.date === today)
        return {
            minutes: record?.minutes || 0,
            words: record?.words || 0,
            chapters: record?.chapters || 0,
        }
    })

    // 本周统计
    const weekStats = computed(() => {
        const { start, end } = getWeekRange()
        const weekRecords = state.value.dailyRecords.filter(
            r => r.date >= start && r.date <= end
        )
        return {
            minutes: weekRecords.reduce((sum, r) => sum + r.minutes, 0),
            words: weekRecords.reduce((sum, r) => sum + r.words, 0),
            chapters: weekRecords.reduce((sum, r) => sum + r.chapters, 0),
        }
    })

    // 最近7天记录 (用于热力图)
    const recentDays = computed(() => {
        const days: { date: string; minutes: number }[] = []
        for (let i = 6; i >= 0; i--) {
            const date = new Date()
            date.setDate(date.getDate() - i)
            const dateStr = formatDate(date)
            const record = state.value.dailyRecords.find(r => r.date === dateStr)
            days.push({
                date: dateStr,
                minutes: record?.minutes || 0,
            })
        }
        return days
    })

    // 格式化时长显示
    function formatMinutes(minutes: number): string {
        if (minutes < 60) return `${minutes}分钟`
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (mins === 0) return `${hours}小时`
        return `${hours}小时${mins}分钟`
    }

    // 格式化字数显示
    function formatWords(words: number): string {
        if (words < 10000) return `${words}字`
        return `${(words / 10000).toFixed(1)}万字`
    }

    // 记录投入度数据
    function addEngagement(bookId: string, chapterIndex: number, chunkIndex: number, seconds: number) {
        let bookStat = state.value.bookStats.find(b => b.bookId === bookId)
        if (!bookStat) return

        if (!bookStat.engagement) bookStat.engagement = []

        const record = bookStat.engagement.find(e => e.chapterIndex === chapterIndex && e.chunkIndex === chunkIndex)
        if (record) {
            record.seconds += seconds
        } else {
            bookStat.engagement.push({ chapterIndex, chunkIndex, seconds })
        }
    }

    return {
        // 状态
        state,
        todayStats,
        weekStats,
        recentDays,

        // 方法
        addReadingMinutes,
        addReadingWords,
        addCompletedChapter,
        addEngagement,
        formatMinutes,
        formatWords,
    }
})
