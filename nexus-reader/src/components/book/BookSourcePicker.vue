<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { Check, RefreshCw, Globe, ShieldAlert } from 'lucide-vue-next'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useReaderStore } from '@/stores/reader'
import { LazyImage } from '@/components/ui'

withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const message = useMessage()
const readerStore = useReaderStore()
const loading = ref(false)

const currentBook = computed(() => readerStore.currentBook as Record<string, any> | null)

async function refresh() {
  loading.value = true
  message.warning('当前版本已临时下线换源能力，优先保证阅读主链路稳定。')
  window.setTimeout(() => {
    loading.value = false
  }, 200)
}

function showDisabledMessage() {
  message.warning('当前版本已临时下线自动换源与多源搜索能力。')
}
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
        <div class="flex gap-2">
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors flex items-center gap-1.5"
            :disabled="loading"
            @click="refresh"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
            说明
          </button>
          <button
            class="h-8 px-3 text-xs rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            @click="showDisabledMessage"
          >
            <Globe class="h-3.5 w-3.5" />
            换源已下线
          </button>
        </div>
      </div>

      <div class="border-t" />

      <div class="flex-1 overflow-y-auto px-5 py-6">
        <button
          class="w-full p-4 rounded-2xl text-left bg-primary/10 ring-2 ring-primary/20 transition-all"
          @click="showDisabledMessage"
        >
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
        </button>

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
