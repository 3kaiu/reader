<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NDropdown } from 'naive-ui'
import { useImage } from '@vueuse/core'
import type { Book } from '@/api/book'

const props = withDefaults(defineProps<{
  book: Book
  showAddButton?: boolean
}>(), {
  showAddButton: false,
})

const emit = defineEmits<{
  click: [book: Book]
  add: [book: Book]
  delete: [book: Book]
}>()

// 封面URL
const coverUrl = computed(() => {
  if (props.book.customCoverUrl) return props.book.customCoverUrl
  if (props.book.coverUrl) {
    return `/reader3/cover?path=${encodeURIComponent(props.book.coverUrl)}`
  }
  return ''
})

// 懒加载封面图片
const { isLoading: coverLoading, error: coverError } = useImage({ src: coverUrl.value })

// 阅读进度
const progress = computed(() => {
  if (!props.book.totalChapterNum || props.book.totalChapterNum <= 0) return 0
  return Math.round(
    ((props.book.durChapterIndex || 0) + 1) / props.book.totalChapterNum * 100
  )
})

// 未读章节数
const unreadCount = computed(() => {
  if (!props.book.totalChapterNum) return 0
  return props.book.totalChapterNum - 1 - (props.book.durChapterIndex || 0)
})

// 下拉菜单选项
const menuOptions = [
  { label: '查看详情', key: 'detail' },
  { label: '删除', key: 'delete' },
]

function handleMenuSelect(key: string) {
  if (key === 'delete') {
    emit('delete', props.book)
  }
}
</script>

<template>
  <div
    class="card-modern group relative overflow-hidden cursor-pointer"
    @click="emit('click', book)"
  >
    <!-- 封面 -->
    <div class="relative aspect-[3/4] bg-gray-100 dark:bg-gray-700 overflow-hidden">
      <!-- 加载占位 -->
      <div
        v-if="coverLoading || !coverUrl"
        class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-700 dark:to-primary-800"
      >
        <span class="text-4xl opacity-50">📖</span>
      </div>
      
      <!-- 封面图片 -->
      <img
        v-else-if="!coverError"
        :src="coverUrl"
        :alt="book.name"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
      />
      
      <!-- 阅读进度条 -->
      <div
        v-if="!showAddButton && progress > 0"
        class="absolute bottom-0 left-0 right-0 h-1 bg-black/20"
      >
        <div
          class="h-full bg-gradient-to-r from-primary to-primary-600 transition-all duration-300"
          :style="{ width: `${progress}%` }"
        />
      </div>
      
      <!-- 未读角标 -->
      <div
        v-if="!showAddButton && unreadCount > 0"
        class="absolute top-2 right-2 min-w-6 h-6 px-1.5 flex items-center justify-center 
               bg-red-500 text-white text-xs font-bold rounded-full shadow-lg"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </div>
      
      <!-- 悬浮操作 -->
      <div
        v-if="!showAddButton"
        class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 
               transition-opacity duration-300 flex items-center justify-center"
      >
        <NDropdown
          trigger="click"
          :options="menuOptions"
          @select="handleMenuSelect"
          @click.stop
        >
          <NButton size="small" type="primary" ghost @click.stop>
            操作
          </NButton>
        </NDropdown>
      </div>
    </div>

    <!-- 信息 -->
    <div class="p-3 space-y-1.5">
      <h3 class="font-semibold text-gray-900 dark:text-white truncate text-sm leading-tight">
        {{ book.name }}
      </h3>
      <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
        {{ book.author || '未知作者' }}
      </p>
      <p 
        v-if="!showAddButton && book.durChapterTitle"
        class="text-xs text-gray-400 dark:text-gray-500 truncate"
      >
        {{ book.durChapterTitle }}
      </p>
      <p 
        v-else-if="book.intro"
        class="text-xs text-gray-400 dark:text-gray-500 line-clamp-2"
      >
        {{ book.intro }}
      </p>
      
      <!-- 添加按钮（搜索结果模式） -->
      <NButton
        v-if="showAddButton"
        type="primary"
        size="small"
        block
        class="mt-2"
        @click.stop="emit('add', book)"
      >
        加入书架
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
