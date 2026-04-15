<script setup lang="ts">
import { useBookInfoView } from '@/composables/useBookInfoView'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { BookOpen, Library, RefreshCw, User, Globe, Tag } from 'lucide-vue-next'
import type { Book } from '@/types/book'
import { LazyImage } from '@/components/ui'

const props = withDefaults(
  defineProps<{
    open?: boolean
    bookUrl?: string
    initialBook?: Book | null
  }>(),
  {
    open: false,
  }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update-shelf': []
}>()

const { displayBook, addToShelf, startReading, formatIntro } = useBookInfoView({
  props,
  close: () => emit('update:open', false),
  notifyShelfUpdated: () => emit('update-shelf'),
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="bottom" class="h-[85vh] flex flex-col p-0 rounded-t-xl">
      <SheetHeader class="px-6 py-4 border-b flex-shrink-0">
        <SheetTitle class="text-center">书籍详情</SheetTitle>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto" v-if="displayBook">
        <!-- 头部信息 -->
        <div class="p-6 flex gap-5">
          <!-- 封面 -->
          <div class="w-28 shrink-0">
            <div class="aspect-[2/3] rounded-lg shadow-md overflow-hidden bg-muted relative">
              <LazyImage
                v-if="displayBook.coverUrl"
                :src="displayBook.coverUrl"
                aspect-ratio="2/3"
                class="w-full h-full"
              />
              <div
                class="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-serif text-3xl font-bold bg-muted"
                v-else
              >
                {{ displayBook.name[0] }}
              </div>
            </div>
          </div>

          <!-- 元数据 -->
          <div class="flex-1 space-y-3 min-w-0">
            <h2 class="text-xl font-bold leading-tight break-words">{{ displayBook.name }}</h2>

            <div class="space-y-1.5 text-sm text-muted-foreground">
              <div class="flex items-center gap-2">
                <User class="h-4 w-4" />
                <span>{{ displayBook.author }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.type">
                <Tag class="h-4 w-4" />
                <span>{{ displayBook.type }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.latestChapterTitle">
                <RefreshCw class="h-4 w-4" />
                <span class="truncate">{{ displayBook.latestChapterTitle }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.originName">
                <Globe class="h-4 w-4" />
                <span>{{ displayBook.originName }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 简介 -->
        <div class="px-6 pb-6">
          <h3 class="font-medium mb-2">简介</h3>
          <div
            class="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-lg"
          >
            {{ formatIntro(displayBook.intro) }}
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div
        class="p-4 border-t flex gap-3 mt-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <Button class="flex-1" variant="outline" @click="addToShelf">
          <Library class="h-4 w-4 mr-2" />
          加入书架
        </Button>
        <Button class="flex-1" @click="startReading">
          <BookOpen class="h-4 w-4 mr-2" />
          开始阅读
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</template>
