<script setup lang="ts">
/**
 * 📊 阅读统计页面
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Book, Clock, FileText, Calendar, Sparkles } from 'lucide-vue-next'
import { useStatisticsStore } from '@/stores/statistics'

const router = useRouter()
const stats = useStatisticsStore()

// 当前选中的时间段
const activeTab = ref<'today' | 'week' | 'total'>('today')

// BookStat 类型定义 (补全字段)
interface EngagementRecord {
  chunkIndex: number
  seconds: number
}

interface BookStat {
  bookId: string
  bookName: string
  completedChapters: number
  totalMinutes: number
  lastReadDate: string
  engagement?: EngagementRecord[]
}

// 根据选中时间段获取统计数据
const currentStats = computed(() => {
  switch (activeTab.value) {
    case 'today':
      return stats.todayStats
    case 'week':
      return stats.weekStats
    case 'total':
      return {
        minutes: stats.state.totalMinutes,
        words: stats.state.totalWords,
        chapters: stats.state.bookStats.reduce((sum: number, b: any) => sum + (b.completedChapters || 0), 0),
      }
  }
})

// 热力图颜色
function getHeatColor(minutes: number): string {
  if (minutes === 0) return 'bg-zinc-100 dark:bg-zinc-800'
  if (minutes < 30) return 'bg-green-200 dark:bg-green-900'
  if (minutes < 60) return 'bg-green-400 dark:bg-green-700'
  if (minutes < 120) return 'bg-green-500 dark:bg-green-600'
  return 'bg-green-600 dark:bg-green-500'
}

// 获取星期几
function getDayName(dateStr: string): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const date = new Date(dateStr)
  return days[date.getDay()]
}

// 获取投入度颜色
// 使用 any 兼容 store 返回的不完整类型，或者如果不使用 BookStat 的全部字段，可以使用 Partial
function getEngagementColor(book: BookStat | any, index: number): string {
  if (!book.engagement) return 'bg-zinc-50 dark:bg-zinc-900/50'
  
  // 简单模拟：寻找当前索引附近的投入度数据
  const record = (book.engagement as EngagementRecord[]).find((e) => Math.floor(e.chunkIndex / 5) === index)
  if (!record) return 'bg-zinc-50 dark:bg-zinc-900/50'
  
  const seconds = record.seconds
  if (seconds > 60) return 'bg-primary'
  if (seconds > 30) return 'bg-primary/60'
  if (seconds > 10) return 'bg-primary/30'
  return 'bg-primary/10'
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-900">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
      <div class="max-w-2xl mx-auto px-4 h-14 flex items-center gap-4">
        <button 
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          @click="goBack"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="text-lg font-semibold">阅读统计</h1>
      </div>
    </header>

    <main class="max-w-2xl mx-auto px-4 py-6">
      <!-- 时间段切换 -->
      <div class="flex gap-2 mb-6">
        <button 
          v-for="tab in ['today', 'week', 'total'] as const" 
          :key="tab"
          class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
          :class="activeTab === tab 
            ? 'bg-primary text-white' 
            : 'bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700'"
          @click="activeTab = tab"
        >
          {{ tab === 'today' ? '今日' : tab === 'week' ? '本周' : '全部' }}
        </button>
      </div>

      <!-- 统计卡片 -->
      <div class="grid grid-cols-3 gap-4 mb-8">
        <!-- 阅读时长 -->
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-4 text-center shadow-sm">
          <Clock class="w-6 h-6 mx-auto mb-2 text-blue-500" />
          <div class="text-2xl font-bold mb-1">{{ currentStats.minutes }}</div>
          <div class="text-xs text-zinc-500">分钟</div>
        </div>

        <!-- 阅读字数 -->
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-4 text-center shadow-sm">
          <FileText class="w-6 h-6 mx-auto mb-2 text-green-500" />
          <div class="text-2xl font-bold mb-1">{{ stats.formatWords(currentStats.words) }}</div>
          <div class="text-xs text-zinc-500">字数</div>
        </div>

        <!-- 完成章节 -->
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-4 text-center shadow-sm">
          <Book class="w-6 h-6 mx-auto mb-2 text-amber-500" />
          <div class="text-2xl font-bold mb-1">{{ currentStats.chapters }}</div>
          <div class="text-xs text-zinc-500">章节</div>
        </div>
      </div>

      <!-- 阅读日历 (最近7天) -->
      <section class="mb-8">
        <h2 class="text-sm font-medium text-zinc-500 mb-3 flex items-center gap-2">
          <Calendar class="w-4 h-4" />
          最近7天
        </h2>
        <div class="bg-white dark:bg-zinc-800 rounded-2xl p-4 shadow-sm">
          <div class="grid grid-cols-7 gap-2">
            <div 
              v-for="day in stats.recentDays" 
              :key="day.date"
              class="text-center"
            >
              <div class="text-xs text-zinc-400 mb-1">
                {{ getDayName(day.date) }}
              </div>
              <div 
                class="w-full aspect-square rounded-lg flex items-center justify-center text-xs font-medium"
                :class="getHeatColor(day.minutes)"
              >
                {{ day.minutes > 0 ? day.minutes : '' }}
              </div>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-end gap-2 text-xs text-zinc-400">
            <span>少</span>
            <div class="w-3 h-3 rounded bg-zinc-100 dark:bg-zinc-800"></div>
            <div class="w-3 h-3 rounded bg-green-200 dark:bg-green-900"></div>
            <div class="w-3 h-3 rounded bg-green-400 dark:bg-green-700"></div>
            <div class="w-3 h-3 rounded bg-green-600 dark:bg-green-500"></div>
            <span>多</span>
          </div>
        </div>
      </section>

      <!-- 阅读心流 (Engagement Heatmap) -->
      <section v-if="stats.state.bookStats.some((b: any) => b.engagement?.length)" class="mb-8">
        <h2 class="text-sm font-medium text-zinc-500 mb-3 flex items-center gap-2">
          <Sparkles class="w-4 h-4" />
          阅读心流 (专注度)
        </h2>
        <div class="space-y-4">
          <div 
            v-for="book in (stats.state.bookStats as BookStat[]).filter((b: BookStat) => b.engagement?.length)" 
            :key="book.bookId"
            class="bg-white dark:bg-zinc-800 rounded-2xl p-4 shadow-sm"
          >
            <div class="text-xs font-semibold mb-3 truncate">{{ book.bookName }}</div>
            <!-- 心流轴 -->
            <div class="flex gap-0.5 h-6 w-full overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
              <div 
                v-for="i in 50" 
                :key="i"
                class="flex-1 h-full transition-colors duration-500"
                :class="getEngagementColor(book, i)"
              />
            </div>
            <div class="mt-2 flex justify-between text-[10px] text-zinc-400">
              <span>开始</span>
              <span>阅读进度心流轴</span>
              <span>结束</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 书籍统计 -->
      <section v-if="stats.state.bookStats.length > 0">
        <h2 class="text-sm font-medium text-zinc-500 mb-3 flex items-center gap-2">
          <Book class="w-4 h-4" />
          书籍统计
        </h2>
        <div class="space-y-2">
          <div 
            v-for="book in (stats.state.bookStats as BookStat[]).slice(0, 5)" 
            :key="book.bookId"
            class="bg-white dark:bg-zinc-800 rounded-xl p-4 shadow-sm flex items-center gap-4"
          >
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ book.bookName }}</div>
              <div class="text-xs text-zinc-400 mt-1">
                已读 {{ book.completedChapters }} 章 · {{ stats.formatMinutes(book.totalMinutes) }}
              </div>
            </div>
            <div class="text-xs text-zinc-400">
              {{ book.lastReadDate }}
            </div>
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <div 
        v-if="stats.state.totalMinutes === 0" 
        class="py-16 text-center text-zinc-400"
      >
        <Book class="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>还没有阅读记录</p>
        <p class="text-sm mt-1">开始阅读后，统计数据将显示在这里</p>
      </div>
    </main>
  </div>
</template>
