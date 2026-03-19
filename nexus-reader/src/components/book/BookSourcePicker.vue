<script setup lang="ts">
import { computed } from 'vue'
import { Check, Globe, ShieldAlert } from 'lucide-vue-next'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useReaderStore } from '@/stores/reader'
import { LazyImage } from '@/components/ui'
import type { Book } from '@/api/book'

withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const readerStore = useReaderStore()

const currentBook = computed<Book | null>(() => readerStore.currentBook)
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent
      side="bottom"
      class="h-[70vh] md:max-w-2xl md:mx-auto md:rounded-t-3xl flex flex-col p-0 rounded-t-2xl"
    >
      <div class="flex justify-center py-3">
        <div class="w-10 h-1 rounded-full bg-muted-foreground/20" />
      </div>

      <div class="px-5 pb-4">
        <div class="flex items-start gap-4">
          <div class="w-12 h-16 rounded-lg bg-muted shrink-0 overflow-hidden shadow-sm">
            <LazyImage
              v-if="currentBook?.coverUrl"
              :src="currentBook.coverUrl"
              aspect-ratio="3/4"
              class="w-full h-full"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <Globe class="h-5 w-5 text-muted-foreground/50" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <h2 class="font-semibold text-base truncate">{{ currentBook?.name }}</h2>
            <p class="text-sm text-muted-foreground truncate mt-0.5">
              {{ currentBook?.author || '未知作者' }}
            </p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              当前书源: {{ currentBook?.originName || currentBook?.sourceName || '默认书源' }}
            </p>
          </div>
        </div>
      </div>

      <div class="px-5 pb-3 flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium">书源状态</span>
          <span class="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">1</span>
          <span class="text-[10px] text-muted-foreground/60 ml-1">仅保留当前书源</span>
        </div>
        <span class="text-xs text-muted-foreground/60">Phase 0 收口中</span>
      </div>

      <div class="border-t" />

      <div class="flex-1 overflow-y-auto px-5 py-6">
        <div class="w-full p-4 rounded-2xl text-left bg-primary/10 ring-2 ring-primary/20">
          <div class="flex items-start gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-0.5"
            >
              <Check class="h-4 w-4" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm truncate">
                  {{ currentBook?.originName || currentBook?.sourceName || '当前书源' }}
                </span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  保留
                </span>
              </div>
              <p class="text-xs text-muted-foreground truncate mt-1">
                Phase 0 暂只保留当前阅读来源，不再发起多源搜索和换源请求。
              </p>
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <div class="flex items-start gap-3">
            <ShieldAlert class="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p class="font-medium text-foreground">换源功能暂时下线</p>
              <p class="mt-1">
                这一阶段优先稳定搜索、目录、正文抓取和阅读链路。等后端重新提供可靠的换源契约后，再恢复本模块。
              </p>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
